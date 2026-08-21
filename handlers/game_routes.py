import re
import time
import threading
import requests
from flask import Blueprint, request, jsonify
from handlers.core_utils import (
    load_character_franchise_cache, save_character_franchise_cache
)

game_bp = Blueprint('game_bp', __name__)

_cache = load_character_franchise_cache()
_cache_lock = threading.RLock()

# Единый троттлинг на все внешние вызовы (AniList + Wikidata вместе), чтобы не
# упереться в паблик rate-limit AniList (жёсткий для неавторизованных запросов)
# даже если несколько игроков в комнате одновременно промахнулись по кэшу.
_last_external_call = 0.0
_throttle_lock = threading.Lock()
MIN_EXTERNAL_INTERVAL = 0.7  # seconds

ANILIST_URL = 'https://graphql.anilist.co'
WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
WIKIDATA_HEADERS = {'User-Agent': 'R34Gallery-GuessGame/1.0 (local hobby project)'}

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


def _throttle():
    global _last_external_call
    with _throttle_lock:
        wait = _last_external_call + MIN_EXTERNAL_INTERVAL - time.time()
        if wait > 0:
            time.sleep(wait)
        _last_external_call = time.time()


def _request_with_retry(method, url, label, retries=2, backoff=1.5, **kwargs):
    """GET/POST с логом статуса и коротким ретраем на 429/5xx — публичные API
    AniList и Wikidata периодически отвечают отказом под нагрузкой, а молчаливый
    return None на первый же не-200 ответ (как было раньше) неотличим по логам
    от "такого персонажа правда нигде нет"."""
    for attempt in range(retries + 1):
        _throttle()
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
    resp = _request_with_retry('POST', ANILIST_URL, 'AniList character search',
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
    resp = _request_with_retry('POST', ANILIST_URL, 'AniList media search',
                                json={'query': MEDIA_QUERY, 'variables': {'search': name}})
    if resp is None:
        return None
    try:
        data = resp.json()
        return ((data or {}).get('data') or {}).get('Media')
    except Exception as e:
        print('[game_routes] AniList media search: bad response:', e)
        return None


def _wikidata_classify(name):
    resp = _request_with_retry('GET', WIKIDATA_API, 'Wikidata search', params={
        'action': 'wbsearchentities', 'search': name, 'language': 'en',
        'format': 'json', 'limit': 3, 'type': 'item'
    }, headers=WIKIDATA_HEADERS)
    if resp is None:
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

    resp = _request_with_retry('GET', WIKIDATA_API, 'Wikidata entity fetch', params={
        'action': 'wbgetentities', 'ids': '|'.join(qids),
        'props': 'labels|claims', 'languages': 'en', 'format': 'json'
    }, headers=WIKIDATA_HEADERS)
    if resp is None:
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

    resp = _request_with_retry('GET', WIKIDATA_API, 'Wikidata P31 label fetch', params={
        'action': 'wbgetentities', 'ids': '|'.join(list(all_p31_qids)[:50]),
        'props': 'labels', 'languages': 'en', 'format': 'json'
    }, headers=WIKIDATA_HEADERS)
    if resp is None:
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

    # 1) Wikidata по франшизе — идёт ПЕРВЫМ. AniList знает только про аниме/мангу,
    #    поэтому для игровых франшиз он норовит подсунуть манга-адаптацию/спин-офф
    #    с похожим названием (см. NieR:Automata, где нашлась манга "NieR:Automata:
    #    Long Story Short" — совпадение по имени, но не тот медиа-тип). Wikidata же
    #    честно говорит, чем является сама франшиза, а не её побочные адаптации.
    for raw_tag in (copyright_tags or []):
        result = _wikidata_classify(raw_tag.replace('_', ' '))
        if result:
            return result

    # 2) Персонаж в AniList, сверенный с нашими copyright-тегами
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
                            return {
                                'type': mtype,
                                'title': title.get('english') or title.get('romaji'),
                                'source': 'anilist_character'
                            }

    # 3) Франшиза напрямую как тайтл в AniList (когда персонажа там нет,
    #    но само аниме/манга есть, и Wikidata тоже ничего не нашла)
    for raw_tag in (copyright_tags or []):
        media = _anilist_media_search(raw_tag.replace('_', ' '))
        if media:
            title = media.get('title') or {}
            mtype = (media.get('type') or '').lower() or 'other'
            return {
                'type': mtype,
                'title': title.get('english') or title.get('romaji'),
                'source': 'anilist_media'
            }

    return {'type': 'unknown', 'title': None, 'source': 'none'}


@game_bp.route('/api/game/classify', methods=['POST', 'OPTIONS'])
def api_game_classify():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        character_tag = str(data.get('characterTag') or '').strip()
        copyright_tags = data.get('copyrightTags') or []
        if not isinstance(copyright_tags, list):
            copyright_tags = []
        copyright_tags = [str(t).strip() for t in copyright_tags if t]

        if not character_tag and not copyright_tags:
            return jsonify({'ok': False, 'error': 'characterTag or copyrightTags required'}), 400

        cache_key = character_tag or ('copyright:' + '|'.join(sorted(copyright_tags)))

        with _cache_lock:
            cached = _cache.get(cache_key)
        if cached is not None:
            result = dict(cached)
            result['cached'] = True
            return jsonify({'ok': True, 'result': result})

        result = _classify(character_tag, copyright_tags)

        with _cache_lock:
            _cache[cache_key] = result
            save_character_franchise_cache(_cache)

        out = dict(result)
        out['cached'] = False
        return jsonify({'ok': True, 'result': out})
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
