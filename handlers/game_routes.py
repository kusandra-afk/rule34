import re
import time
import threading
import requests
from concurrent.futures import ThreadPoolExecutor
from flask import Blueprint, request, jsonify
from handlers.core_utils import (
    load_character_franchise_cache, save_character_franchise_cache
)

game_bp = Blueprint('game_bp', __name__)

_cache = load_character_franchise_cache()
_cache_lock = threading.RLock()

# Троттлинг внешних вызовов — РАЗДЕЛЬНЫЙ по сервисам. Раньше здесь был один общий
# интервал 0.7с на AniList и Wikidata вместе, и он был главной причиной того, что
# франшиза под персонажем появлялась спустя секунды: классификация через Wikidata
# — это цепочка из ЧЕТЫРЁХ последовательных запросов (поиск сущности → её claims →
# метки P31), то есть почти три секунды ожидания на ровном месте, и это только для
# одного copyright-тега одного персонажа.
#
# Жёсткий публичный лимит на самом деле у AniList (для неавторизованных запросов),
# а не у Wikidata — её API спокойно терпит несколько запросов в секунду от клиента
# с честным User-Agent (он тут выставлен). Поэтому у каждого сервиса теперь свой
# интервал и свой замок: медленный AniList больше не тормозит быструю Wikidata.
# ВАЖНО: не уменьшать. Пробовал 0.2с и 0.35с — Wikidata начинает отвечать HTTP 429,
# включается ретрай с backoff, и классификация выходит В РАЗЫ медленнее (12-15с
# против 2-3с), а не быстрее. Хуже того, после отказа Wikidata код проваливается
# на AniList, который для игровых франшиз возвращает мангу/аниме-адаптацию вместо
# самой игры — то есть гонка за скоростью здесь ломает и корректность.
# Ускорение достигается прогревом кэша (/api/game/prefetch), а не темпом запросов.
ANILIST_MIN_INTERVAL = 0.7   # seconds
WIKIDATA_MIN_INTERVAL = 0.7  # seconds
STEAM_MIN_INTERVAL = 0.5     # seconds
KITSU_MIN_INTERVAL = 0.35    # seconds
VNDB_MIN_INTERVAL = 0.35     # seconds

_throttle_state = {
    'anilist': {'last': 0.0, 'lock': threading.Lock(), 'interval': ANILIST_MIN_INTERVAL},
    'wikidata': {'last': 0.0, 'lock': threading.Lock(), 'interval': WIKIDATA_MIN_INTERVAL},
    'steam': {'last': 0.0, 'lock': threading.Lock(), 'interval': STEAM_MIN_INTERVAL},
    'kitsu': {'last': 0.0, 'lock': threading.Lock(), 'interval': KITSU_MIN_INTERVAL},
    'vndb': {'last': 0.0, 'lock': threading.Lock(), 'interval': VNDB_MIN_INTERVAL},
}

# Сколько copyright-тегов поста реально прогоняем через Wikidata. У поста их бывает
# 3-5 (сама франшиза + кроссоверы + серия), и раньше цикл шёл по всем — каждый
# промах стоил ещё одной цепочки запросов. Нужная франшиза почти всегда в первых
# двух тегах, остальное — долгий перебор ради редких случаев.
MAX_WIKIDATA_TAGS = 2

# Фоновый прогрев кэша (см. /api/game/prefetch): игра заранее просит
# классифицировать персонажей, которые появятся в следующих раундах, пока игрок
# смотрит на текущий. К моменту показа ответ уже лежит в кэше и отдаётся мгновенно.
_prefetch_pool = ThreadPoolExecutor(max_workers=3)
_inflight = set()
_inflight_lock = threading.Lock()
MAX_PREFETCH_ITEMS = 24

ANILIST_URL = 'https://graphql.anilist.co'
WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
WIKIDATA_HEADERS = {'User-Agent': 'R34Gallery-GuessGame/1.0 (local hobby project)'}

# Дополнительные источники — каждый отвечает за то, в чём разбирается, и все
# работают без API-ключей. Нужны потому, что Wikidata (единственный источник,
# который знает про игры) регулярно упирается в свой rate-limit, и без замены
# код проваливался на AniList — а тот знает только аниме/мангу и для игровых
# франшиз возвращает их манга-адаптации вместо самих игр.
#
# MyAnimeList через Jikan сюда намеренно НЕ добавлен: с этой машины он стабильно
# отдаёт HTTP 504, роль «аниме/манга без ключа» закрывает Kitsu.
STEAM_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/'
KITSU_ANIME_URL = 'https://kitsu.io/api/edge/anime'
KITSU_MANGA_URL = 'https://kitsu.io/api/edge/manga'
VNDB_URL = 'https://api.vndb.org/kana/vn'
COMMON_HEADERS = {'User-Agent': 'R34Gallery-GuessGame/1.0 (local hobby project)'}

CHAR_QUERY = '''
query ($search: String) {
  Page(perPage: 15) {
    characters(search: $search) {
      name { full native }
      media(perPage: 6) {
        nodes { title { romaji english } type }
      }
    }
  }
}
'''

MEDIA_QUERY = '''
query ($search: String) {
  Media(search: $search) {
    type
    title { romaji english }
  }
}
'''

# ТОЧНОЕ (не по подстроке!) совпадение английского лейбла P31 (instance of) ->
# наша категория. Список проверяется по порядку, первое совпадение побеждает.
#
# Раньше матчинг шёл по подстроке ("video game" in label), и это ловило кучу
# ложных срабатываний: "video game developer"/"video game publisher" (это
# КОМПАНИЯ, не игра), "video game console" (это ЖЕЛЕЗО, не игра), и т.п. —
# у Wikidata таких "video game X" лейблов для не-игровых сущностей полно, и
# перечислять их все как исключения — бесконечная игра в догонялки. Точное
# сравнение убирает весь этот класс багов разом.
WIKIDATA_EXACT_LABELS = [
    ('anime television series', 'anime'),
    ('anime film', 'anime'),
    ('original video animation', 'anime'),
    ('anime', 'anime'),
    ('manga series', 'manga'),
    ('manga', 'manga'),
    ('visual novel', 'visual_novel'),
    ('eroge', 'visual_novel'),
    ('video game series', 'game'),
    ('video game franchise', 'game'),
    ('video game', 'game'),
    ('web comic', 'comic'),
    ('webcomic', 'comic'),
    ('comic book series', 'comic'),
    ('comic strip', 'comic'),
    ('comics', 'comic'),
    ('animated television series', 'cartoon'),
    ('animated series', 'cartoon'),
    ('animated film', 'cartoon'),
    ('television series', 'cartoon'),
    ('media franchise', 'franchise'),
    ('franchise', 'franchise'),
]


def _throttle(service):
    state = _throttle_state[service]
    with state['lock']:
        wait = state['last'] + state['interval'] - time.time()
        if wait > 0:
            time.sleep(wait)
        state['last'] = time.time()


def _request_with_retry(method, url, label, service, retries=2, backoff=1.5, **kwargs):
    """GET/POST с логом статуса и коротким ретраем на 429/5xx — публичные API
    AniList и Wikidata периодически отвечают отказом под нагрузкой, а молчаливый
    return None на первый же не-200 ответ (как было раньше) неотличим по логам
    от "такого персонажа правда нигде нет". `service` выбирает, чьим лимитом
    троттлить запрос — у AniList и Wikidata они очень разные."""
    for attempt in range(retries + 1):
        _throttle(service)
        try:
            resp = requests.request(method, url, timeout=8, **kwargs)
        except Exception as e:
            print(f'[game_routes] {label} network error (attempt {attempt + 1}):', e)
            resp = None
        if resp is not None and resp.status_code == 200:
            return resp
        if resp is not None:
            print(f'[game_routes] {label} returned HTTP {resp.status_code} (attempt {attempt + 1})')
        if attempt < retries:
            time.sleep(backoff * (attempt + 1))
    return None


def _normalize(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).strip()


def _strip_paren_suffix(tag):
    # "kanon_(umineko)" -> "kanon"
    return re.sub(r'_?\([^)]*\)\s*$', '', tag or '').replace('_', ' ').strip()


def _character_name_matches(character, query_norm):
    """Действительно ли AniList нашёл ТОГО персонажа. Поиск там нечёткий и на
    незнакомое имя охотно возвращает что-то отдалённо похожее, поэтому перед
    тем как брать франшизу от найденного персонажа, имя надо сверить.

    Совпадением считаем полное равенство нормализованных имён либо случай,
    когда все слова запроса присутствуют в имени персонажа (порядок и лишние
    слова допустимы: "yorha no 2 type b" против "yorha no. 2 type b")."""
    if not query_norm:
        return False
    name_obj = character.get('name') or {}
    query_words = set(query_norm.split())
    for candidate in (name_obj.get('full'), name_obj.get('native')):
        cand_norm = _normalize(candidate)
        if not cand_norm:
            continue
        if cand_norm == query_norm:
            return True
        if query_words and query_words.issubset(set(cand_norm.split())):
            return True
    return False


def _title_matches_copyright(title_obj, copyright_norms):
    if not copyright_norms:
        return False
    for c in (title_obj.get('romaji'), title_obj.get('english')):
        if not c:
            continue
        cn = _normalize(c)
        if not cn:
            continue
        for cn2 in copyright_norms:
            if cn2 and (cn2 in cn or cn in cn2):
                return True
    return False


def _anilist_character_search(name):
    resp = _request_with_retry('POST', ANILIST_URL, 'AniList character search', 'anilist',
                                json={'query': CHAR_QUERY, 'variables': {'search': name}})
    if resp is None:
        return None
    try:
        data = resp.json()
        return (((data or {}).get('data') or {}).get('Page') or {}).get('characters') or []
    except Exception as e:
        print('[game_routes] AniList character search: bad response:', e)
        return None


def _anilist_media_search(name):
    resp = _request_with_retry('POST', ANILIST_URL, 'AniList media search', 'anilist',
                                json={'query': MEDIA_QUERY, 'variables': {'search': name}})
    if resp is None:
        return None
    try:
        data = resp.json()
        return ((data or {}).get('data') or {}).get('Media')
    except Exception as e:
        print('[game_routes] AniList media search: bad response:', e)
        return None


def _wikidata_classify(name, errors=None):
    """`errors` — список, куда складываются отметки о НЕДОСТУПНОСТИ сервиса
    (сеть, 429, 5xx). Это принципиально не то же самое, что "ничего не нашлось":
    при недоступности Wikidata вызывающий код обязан знать, что ответ получен
    по деградированному пути, и не кэшировать его навсегда."""
    resp = _request_with_retry('GET', WIKIDATA_API, 'Wikidata search', 'wikidata', params={
        'action': 'wbsearchentities', 'search': name, 'language': 'en',
        'format': 'json', 'limit': 3, 'type': 'item'
    }, headers=WIKIDATA_HEADERS)
    if resp is None:
        if errors is not None:
            errors.append('wikidata')
        return None
    try:
        hits = (resp.json() or {}).get('search') or []
        qids = [h['id'] for h in hits if h.get('id')]
        # label из самого поиска — то, что реально совпало (включая случаи
        # словарных статей без отдельного labels.en в wbgetentities ниже)
        search_titles = {h['id']: h.get('label') for h in hits if h.get('id')}
    except Exception as e:
        print('[game_routes] Wikidata search: bad response:', e)
        return None

    if not qids:
        return None

    resp = _request_with_retry('GET', WIKIDATA_API, 'Wikidata entity fetch', 'wikidata', params={
        'action': 'wbgetentities', 'ids': '|'.join(qids),
        'props': 'labels|claims', 'languages': 'en', 'format': 'json'
    }, headers=WIKIDATA_HEADERS)
    if resp is None:
        if errors is not None:
            errors.append('wikidata')
        return None
    try:
        entities = (resp.json() or {}).get('entities') or {}
    except Exception as e:
        print('[game_routes] Wikidata entity fetch: bad response:', e)
        return None

    # Собираем P31 всех кандидатов одним батч-запросом (экономим вызовы), но
    # НЕ смешиваем их при сопоставлении: каждый кандидат проверяется своими же
    # P31-метками, в порядке релевантности поиска Wikidata. Иначе можно взять
    # категорию от одного кандидата (сама игра), а тайтл — от другого
    # (например, альбом с саундтреком той же игры), получив бессмысленный
    # результат вроде "Genshin Impact ... Original Game Soundtrack" / game.
    all_p31_qids = set()
    candidate_p31 = {}
    candidate_title = {}
    for qid in qids:
        ent = entities.get(qid) or {}
        candidate_title[qid] = search_titles.get(qid) or ((ent.get('labels') or {}).get('en') or {}).get('value')
        p31_list = []
        for c in (ent.get('claims') or {}).get('P31', []):
            try:
                p31_qid = c['mainsnak']['datavalue']['value']['id']
                p31_list.append(p31_qid)
                all_p31_qids.add(p31_qid)
            except Exception:
                continue
        candidate_p31[qid] = p31_list

    if not all_p31_qids:
        return None

    resp = _request_with_retry('GET', WIKIDATA_API, 'Wikidata P31 label fetch', 'wikidata', params={
        'action': 'wbgetentities', 'ids': '|'.join(list(all_p31_qids)[:50]),
        'props': 'labels', 'languages': 'en', 'format': 'json'
    }, headers=WIKIDATA_HEADERS)
    if resp is None:
        if errors is not None:
            errors.append('wikidata')
        return None
    try:
        p31_entities = (resp.json() or {}).get('entities') or {}
    except Exception as e:
        print('[game_routes] Wikidata P31 label fetch: bad response:', e)
        return None

    p31_labels = {
        qid: ((ent.get('labels') or {}).get('en') or {}).get('value', '').lower()
        for qid, ent in p31_entities.items()
    }

    for qid in qids:
        cand_labels = set(p31_labels.get(pq, '') for pq in candidate_p31.get(qid, []))
        cand_labels.discard('')
        if not cand_labels:
            continue
        for exact_label, category in WIKIDATA_EXACT_LABELS:
            if exact_label in cand_labels:
                return {'type': category, 'title': candidate_title.get(qid) or name, 'source': 'wikidata'}

    return None


def _title_is_exact(candidate, query):
    """Строгое сравнение названий для дополнительных источников.

    Намеренно НЕ по подстроке. Подстрочное совпадение — ровно то, из-за чего на
    запрос «final fantasy» принимался ответ «Final Fantasy VII: Advent Children»
    (аниме-фильм вместо франшизы). Принимаем только полное совпадение
    нормализованного названия либо его части до двоеточия — так «NieR:Automata»
    на запрос «nier automata» проходит, а «...: Advent Children» отсекается."""
    nq = _normalize(query)
    if not nq or not candidate:
        return False
    nc = _normalize(candidate)
    if nc == nq:
        return True
    head = _normalize(re.split(r'[:–—-]', candidate, 1)[0])
    return bool(head) and head == nq


def _steam_classify(name, errors=None):
    """Магазин Steam — самый надёжный ответ на вопрос «это вообще видеоигра?».
    Без ключа, отдаёт каталог целиком."""
    resp = _request_with_retry('GET', STEAM_SEARCH_URL, 'Steam search', 'steam',
                                params={'term': name, 'cc': 'us', 'l': 'en'},
                                headers=COMMON_HEADERS)
    if resp is None:
        if errors is not None:
            errors.append('steam')
        return None
    try:
        items = (resp.json() or {}).get('items') or []
    except Exception as e:
        print('[game_routes] Steam search: bad response:', e)
        return None
    for item in items[:6]:
        title = item.get('name')
        if title and _title_is_exact(title, name):
            return {'type': 'game', 'title': title, 'source': 'steam'}
    return None


def _kitsu_classify(name, errors=None):
    """Kitsu — аниме и манга без ключа. Заменяет собой ту роль, ради которой
    раньше приходилось надеяться только на AniList."""
    for url, category in ((KITSU_ANIME_URL, 'anime'), (KITSU_MANGA_URL, 'manga')):
        resp = _request_with_retry('GET', url, 'Kitsu %s search' % category, 'kitsu',
                                    params={'filter[text]': name, 'page[limit]': 5},
                                    headers=COMMON_HEADERS)
        if resp is None:
            if errors is not None:
                errors.append('kitsu')
            continue
        try:
            data = (resp.json() or {}).get('data') or []
        except Exception as e:
            print('[game_routes] Kitsu %s search: bad response:' % category, e)
            continue
        for item in data:
            attrs = item.get('attributes') or {}
            titles = attrs.get('titles') or {}
            for cand in (attrs.get('canonicalTitle'), titles.get('en'),
                         titles.get('en_jp'), titles.get('ja_jp')):
                if cand and _title_is_exact(cand, name):
                    return {
                        'type': category,
                        'title': attrs.get('canonicalTitle') or cand,
                        'source': 'kitsu'
                    }
    return None


def _vndb_classify(name, errors=None):
    """VNDB — визуальные новеллы. До этого категория visual_novel могла прийти
    только от Wikidata, то есть при её лимите не приходила вообще."""
    resp = _request_with_retry('POST', VNDB_URL, 'VNDB search', 'vndb',
                                json={'filters': ['search', '=', name],
                                      'fields': 'title', 'results': 5},
                                headers=COMMON_HEADERS)
    if resp is None:
        if errors is not None:
            errors.append('vndb')
        return None
    try:
        results = (resp.json() or {}).get('results') or []
    except Exception as e:
        print('[game_routes] VNDB search: bad response:', e)
        return None
    for item in results:
        title = item.get('title')
        if title and _title_is_exact(title, name):
            return {'type': 'visual_novel', 'title': title, 'source': 'vndb'}
    return None


ORIGINAL_TAGS = {'original', 'original_character'}


def _classify(character_tag, copyright_tags):
    # "original"/"original_character" — служебный тег Rule34 для персонажей без
    # франшизы (OC). Если это единственный copyright-тег поста, никакой внешний
    # API не поможет и НЕ НАДО пытаться искать "original" как название тайтла —
    # это обычное слово, которое случайно совпадёт с чьим-нибудь реальным
    # аниме/игрой (уже словили ложный матч на аниме под названием "Original").
    real_copyright_tags = [t for t in (copyright_tags or []) if _normalize(t.replace('_', ' ')) not in ORIGINAL_TAGS]
    if (copyright_tags and not real_copyright_tags) or (character_tag and _normalize(character_tag) in ('original character', 'original')):
        return {'type': 'original', 'title': None, 'source': 'tag'}
    copyright_tags = real_copyright_tags

    copyright_norms = [_normalize(t.replace('_', ' ')) for t in (copyright_tags or []) if t]

    # Отметки о НЕДОСТУПНОСТИ внешних сервисов — это НЕ то же самое, что "ничего
    # не нашлось". Если Wikidata не ответила (её rate-limit 429, сеть, 5xx), то
    # любой ответ с шагов 2-3 получен по запасному пути через AniList, а он для
    # игровых франшиз подсовывает мангу/аниме-адаптацию вместо самой игры. Такой
    # ответ помечается 'degraded' и НЕ кэшируется навсегда (см. _classify_and_cache),
    # иначе минута лимитов у Wikidata портит запись о персонаже насовсем.
    errors = []

    # 1) Wikidata по франшизе — идёт ПЕРВЫМ. AniList знает только про аниме/мангу,
    #    поэтому для игровых франшиз он норовит подсунуть манга-адаптацию/спин-офф
    #    с похожим названием (см. NieR:Automata, где нашлась манга "NieR:Automata:
    #    Long Story Short" — совпадение по имени, но не тот медиа-тип). Wikidata же
    #    честно говорит, чем является сама франшиза, а не её побочные адаптации.
    for raw_tag in (copyright_tags or [])[:MAX_WIKIDATA_TAGS]:
        result = _wikidata_classify(raw_tag.replace('_', ' '), errors)
        if result:
            return result

    def _fallback(result):
        if errors:
            result['degraded'] = True
        return result

    # 2) Профильные источники по франшизе: VNDB (визуальные новеллы), Steam
    #    (игры), Kitsu (аниме/манга). Каждый принимается только при ТОЧНОМ
    #    совпадении названия (_title_is_exact), поэтому подменить франшизу её
    #    адаптацией они не могут. Порядок — по «первоисточнику» медиа: Fate/stay
    #    night начинался как новелла, NieR:Automata как игра, Chainsaw Man как
    #    манга, и именно так они и определятся.
    #    Главное: теперь падение Wikidata не отправляет нас сразу к AniList.
    for raw_tag in (copyright_tags or [])[:MAX_WIKIDATA_TAGS]:
        query = raw_tag.replace('_', ' ')
        for source in (_vndb_classify, _steam_classify, _kitsu_classify):
            result = source(query, errors)
            if result:
                return result

    # 3) Персонаж в AniList, сверенный с нашими copyright-тегами
    if character_tag:
        query_name = _strip_paren_suffix(character_tag)
        if query_name:
            chars = _anilist_character_search(query_name)
            if chars:
                for ch in chars:
                    for node in ((ch.get('media') or {}).get('nodes') or []):
                        title = node.get('title') or {}
                        if _title_matches_copyright(title, copyright_norms):
                            mtype = (node.get('type') or '').lower() or 'other'
                            return _fallback({
                                'type': mtype,
                                'title': title.get('english') or title.get('romaji'),
                                'source': 'anilist_character'
                            })

                # У части постов copyright-тегов нет вовсе, и сверять произведение
                # было не с чем — такой персонаж всегда оставался 'unknown', то
                # есть без франшизы. Тогда берём произведение самого персонажа,
                # НО только если его ИМЯ действительно совпало с запросом.
                #
                # Без этой проверки получалась чушь: поиск AniList нечёткий и на
                # "yorha no. 2 type b" первым вернул персонажа из Girls und
                # Panzer — и игра показывала эту мангу как франшизу 2B. Пустая
                # плашка лучше уверенно показанного неверного названия.
                if not copyright_norms:
                    query_norm = _normalize(query_name)
                    for ch in chars:
                        if not _character_name_matches(ch, query_norm):
                            continue
                        for node in ((ch.get('media') or {}).get('nodes') or []):
                            title = node.get('title') or {}
                            name = title.get('english') or title.get('romaji')
                            if name:
                                return _fallback({
                                    'type': (node.get('type') or '').lower() or 'other',
                                    'title': name,
                                    'source': 'anilist_character_guess'
                                })

    # 4) Франшиза напрямую как тайтл в AniList (когда персонажа там нет,
    #    но само аниме/манга есть, и никто выше ничего не нашёл)
    for raw_tag in (copyright_tags or [])[:MAX_WIKIDATA_TAGS]:
        media = _anilist_media_search(raw_tag.replace('_', ' '))
        if media:
            title = media.get('title') or {}
            mtype = (media.get('type') or '').lower() or 'other'
            return _fallback({
                'type': mtype,
                'title': title.get('english') or title.get('romaji'),
                'source': 'anilist_media'
            })

    return _fallback({'type': 'unknown', 'title': None, 'source': 'none'})


def _cache_key_for(character_tag, copyright_tags):
    return character_tag or ('copyright:' + '|'.join(sorted(copyright_tags)))


def _read_request_entry(data):
    """Достаёт (characterTag, copyrightTags) из тела запроса или из элемента
    списка в /prefetch — форма одна и та же."""
    character_tag = str(data.get('characterTag') or '').strip()
    copyright_tags = data.get('copyrightTags') or []
    if not isinstance(copyright_tags, list):
        copyright_tags = []
    copyright_tags = [str(t).strip() for t in copyright_tags if t]
    return character_tag, copyright_tags


def _classify_and_cache(cache_key, character_tag, copyright_tags):
    try:
        result = _classify(character_tag, copyright_tags)
        # 'degraded' означает, что Wikidata была недоступна и ответ пришёл с
        # запасного пути — почти наверняка не тот медиа-тип. Такое НЕ кэшируем:
        # запись живёт вечно, а лимит у Wikidata — минуты. В следующий раз
        # посчитаем заново и получим правильный ответ.
        if result.get('degraded'):
            print('[game_routes] degraded classification for', cache_key, '— not caching')
            return result
        with _cache_lock:
            _cache[cache_key] = result
            save_character_franchise_cache(_cache)
        return result
    except Exception as e:
        print('[game_routes] classify failed for', cache_key, ':', e)
        return {'type': 'unknown', 'title': None, 'source': 'none'}
    finally:
        with _inflight_lock:
            _inflight.discard(cache_key)


@game_bp.route('/api/game/classify', methods=['POST', 'OPTIONS'])
def api_game_classify():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        character_tag, copyright_tags = _read_request_entry(data)

        if not character_tag and not copyright_tags:
            return jsonify({'ok': False, 'error': 'characterTag or copyrightTags required'}), 400

        cache_key = _cache_key_for(character_tag, copyright_tags)

        with _cache_lock:
            cached = _cache.get(cache_key)
        if cached is not None:
            result = dict(cached)
            result['cached'] = True
            return jsonify({'ok': True, 'result': result})

        with _inflight_lock:
            _inflight.add(cache_key)
        result = _classify_and_cache(cache_key, character_tag, copyright_tags)

        out = dict(result)
        out['cached'] = False
        return jsonify({'ok': True, 'result': out})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@game_bp.route('/api/game/prefetch', methods=['POST', 'OPTIONS'])
def api_game_prefetch():
    """Фоновый прогрев кэша. Игра шлёт сюда персонажей, которых собирается
    показать в следующих раундах, и сразу получает ответ — классификация уходит
    в фоновый пул. Пока игрок смотрит текущий раунд, ответы успевают лечь в кэш,
    и к моменту показа франшиза отдаётся мгновенно вместо секунд ожидания.
    Уже закэшированное и уже считающееся в этот момент пропускаем."""
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        items = data.get('items') or []
        if not isinstance(items, list):
            return jsonify({'ok': False, 'error': 'items must be a list'}), 400

        queued = 0
        for item in items[:MAX_PREFETCH_ITEMS]:
            if not isinstance(item, dict):
                continue
            character_tag, copyright_tags = _read_request_entry(item)
            if not character_tag and not copyright_tags:
                continue
            cache_key = _cache_key_for(character_tag, copyright_tags)

            with _cache_lock:
                if cache_key in _cache:
                    continue
            with _inflight_lock:
                if cache_key in _inflight:
                    continue
                _inflight.add(cache_key)

            _prefetch_pool.submit(_classify_and_cache, cache_key, character_tag, copyright_tags)
            queued += 1

        return jsonify({'ok': True, 'queued': queued})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@game_bp.route('/api/game/classify_stats', methods=['GET'])
def api_game_classify_stats():
    with _cache_lock:
        total = len(_cache)
        by_type = {}
        for v in _cache.values():
            t = (v or {}).get('type', 'unknown')
            by_type[t] = by_type.get(t, 0) + 1
    return jsonify({'ok': True, 'total': total, 'byType': by_type})
