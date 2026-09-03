/**
 * "Больше / Меньше" — угадай, у какого персонажа больше постов на Rule34.
 * Счёт строится на реальных данных (tag_info.count из уже загруженных постов),
 * классификация франшизы (аниме/игра/манга) — асинхронное украшение поверх,
 * никогда не блокирует саму механику игры.
 */
import { fetchPosts } from '../api.js';

const BEST_SCORE_KEY = 'r34_guess_best_score';

// Сколько артов держим на персонажа. По одной случайной картинке часто вообще
// не понять, кто изображён (кроп, нестандартный образ), а угадывать приходится
// именно по персонажу — поэтому их можно листать.
export const MAX_ARTS_PER_ENTRY = 15;

// Порог популярности персонажа. Без него в игру постоянно лезли теги с 20-300
// постами: сравнивать «20 против 300» неинтересно и почти всегда угадывается
// наугад, а имена таких персонажей ничего не говорят. Ступени ниже — страховка:
// если при строгом пороге не набирается пара (узкий поиск, жёсткие фильтры
// тегов), порог опускается, и игра остаётся играбельной вместо ошибки.
export const COUNT_THRESHOLDS = [4000, 1500, 500, 100, 2];

// Служебные теги, которые Rule34 помечает типом "character", хотя персонажа они
// не называют: это заглушки для фан-персонажей, ориджиналов и неопознанных.
// Сравнивать по ним бессмысленно — имя ничего не говорит, а счётчик собирает
// вообще не связанные между собой посты.
const JUNK_CHARACTER_TAGS = new Set([
    'fan character', 'fan characters', 'fanmade character',
    'original character', 'original characters', 'oc', 'ocs',
    'unknown character', 'unknown', 'character request', 'no character',
    'self insert', 'reader', 'you', 'viewer', 'male protagonist', 'female protagonist',
    'protagonist', 'player character', 'player', 'nameless character',
]);

// Rule34 помечает типом "character" не только персонажей, но и ГРУППЫ и
// КАТЕГОРИИ: "generation 3 pokemon", "legendary pokemon", "eeveelution".
// Играть по ним нельзя — это не имя, а класс существ, и счётчик у него
// собирает посты сотен разных персонажей сразу.
const JUNK_CHARACTER_PATTERNS = [
    /\bfan[_ ]?character\b/,
    /\boriginal[_ ]?character\b/,
    /\bcharacter[_ ]?request\b/,
    /\bunknown\b/,
    /\bnameless\b/,
    /\bunnamed\b/,
    /\bbackground[_ ]character\b/,
    /\bnpc\b/,
    // "generation 3 pokemon", "gen 5 pokemon"
    /^(generation|gen)[_ ]?\d+\b/,
    /\bgeneration[_ ]?\d+\b/,
    // Любой тег, ЗАКАНЧИВАЮЩИЙСЯ на "pokemon": настоящие покемоны названы
    // именами ("pikachu", "gardevoir"), а "... pokemon" — всегда категория
    // ("legendary pokemon", "starter pokemon", "shiny pokemon").
    /\bpokemon$/,
    /\beeveelution(s)?\b/,
    // "чей-то" персонаж как группа и служебные пометки вида "(species)"
    /\bspecies\b/,
    /\bcrossover\b/,
];

function isJunkCharacterTag(tag) {
    const n = normalizeTag(tag);
    if (!n) return true;
    if (JUNK_CHARACTER_TAGS.has(n)) return true;
    return JUNK_CHARACTER_PATTERNS.some(re => re.test(n));
}

/** Приводит тег к сравнимому виду: нижний регистр, только буквы и цифры. */
function normalizeTag(tag) {
    return (tag || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Ключ для склейки тегов-двойников. На Rule34 у одного и того же персонажа
 * нередко живёт несколько тегов, различающихся только пунктуацией
 * ("rem_(re:zero)" и "rem_(re_zero)"), и счётчики у них расходятся в разы —
 * скажем, 100k против 6k. Игра брала случайный из них, и сравнение выходило
 * неверным. Нормализация схлопывает такие написания в один ключ, а дальше
 * остаётся вариант с большим счётчиком как основной.
 */
function dedupeKey(tag) {
    return normalizeTag(tag);
}

export function prettifyTag(tag) {
    return (tag || '')
        .replace(/_/g, ' ')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** URL картинки поста в порядке предпочтения — одинаково нужен и офлайну, и онлайну. */
export function postImageUrl(post) {
    if (!post) return '';
    return post.sample_url || post.preview_url || post.file_url || '';
}

export class GuessGame {
    constructor() {
        this.pool = [];
        this.byTag = new Map();   // tag -> entry, чтобы дособирать арты к уже известному персонажу
        this.byKey = new Map();   // нормализованный ключ -> entry, для склейки тегов-двойников
        this.thresholdIndex = 0;  // индекс в COUNT_THRESHOLDS
        this.current = null;
        this.hidden = null;
        this.score = 0;
        this.best = parseInt(localStorage.getItem(BEST_SCORE_KEY) || '0', 10) || 0;
        this.active = false;
    }

    get threshold() {
        return COUNT_THRESHOLDS[this.thresholdIndex];
    }

    /** Персонажи, проходящие текущий порог популярности. */
    _eligible() {
        return this.pool.filter(e => e.count >= this.threshold);
    }

    _addArt(entry, post) {
        if (!post || !post.id) return;
        if (!postImageUrl(post)) return;
        if (entry.posts.length >= MAX_ARTS_PER_ENTRY) return;
        if (entry.posts.some(p => String(p.id) === String(post.id))) return;
        entry.posts.push(post);
    }

    _collectFromPosts(posts) {
        for (const post of (posts || [])) {
            const tagInfo = post && post.tag_info;
            if (!Array.isArray(tagInfo)) continue;
            const copyrightTags = tagInfo.filter(x => x.type === 'copyright' && x.tag).map(x => x.tag);
            for (const t of tagInfo) {
                // Минимальный отсев мусора; настоящий порог популярности
                // применяется позже, в _eligible() — так понижение порога не
                // требует заново ходить в API за уже виденными постами.
                if (t.type !== 'character' || !t.tag || !t.count || t.count < 2) continue;
                if (isJunkCharacterTag(t.tag)) continue;

                const existing = this.byTag.get(t.tag);
                if (existing) {
                    // Персонаж уже в пуле — этот пост просто пополняет его галерею
                    this._addArt(existing, post);
                    continue;
                }

                // Тег-двойник того, кто уже в пуле (различается только пунктуацией):
                // не заводим второго персонажа, а оставляем вариант с бо́льшим
                // счётчиком — он и есть основной, а мелкий это неслитый алиас.
                const key = dedupeKey(t.tag);
                const twin = this.byKey.get(key);
                if (twin) {
                    if (t.count > twin.count) {
                        twin.tag = t.tag;
                        twin.count = t.count;
                        twin.copyrightTags = copyrightTags;
                        // Арты собраны по прежнему написанию тега — их можно
                        // оставить, персонаж тот же; но догрузку надо повторить
                        // уже по новому, основному тегу.
                        twin._artsLoaded = false;
                    }
                    this.byTag.set(t.tag, twin);
                    this._addArt(twin, post);
                    continue;
                }

                const entry = { tag: t.tag, count: t.count, copyrightTags, posts: [], artIndex: 0 };
                this._addArt(entry, post);
                if (!entry.posts.length) continue;
                this.byTag.set(t.tag, entry);
                this.byKey.set(key, entry);
                this.pool.push(entry);
            }
        }
    }

    /**
     * Второй проход по двойникам — для случая, когда написания различаются не
     * пунктуацией, а полнотой названия франшизы в скобках: "rem_(re:zero)" и
     * "rem_(re:zero_kara_hajimeru_isekai_seikatsu)". Нормализация их не
     * схлопывает, поэтому сверяем по базовому имени БЕЗ скобок, и объединяем
     * только при совпадении хотя бы одного copyright-тега — иначе можно было бы
     * слить двух разных персонажей-тёзок из разных франшиз.
     */
    _collapseTwins() {
        const byBase = new Map();
        const dropped = new Set();

        for (const entry of this.pool) {
            const base = normalizeTag(entry.tag.replace(/_?\([^)]*\)\s*$/, ''));
            if (!base) continue;
            const siblings = byBase.get(base);
            if (!siblings) {
                byBase.set(base, [entry]);
                continue;
            }
            const copyrights = new Set(entry.copyrightTags || []);
            const twin = siblings.find(s => (s.copyrightTags || []).some(t => copyrights.has(t)));
            if (!twin) {
                siblings.push(entry);
                continue;
            }
            // Оставляем вариант с бо́льшим счётчиком: он основной, второй — алиас
            const keep = entry.count > twin.count ? entry : twin;
            const drop = keep === entry ? twin : entry;
            for (const post of drop.posts) this._addArt(keep, post);
            dropped.add(drop);
            if (keep === entry) {
                siblings[siblings.indexOf(twin)] = entry;
            }
        }

        if (dropped.size) {
            this.pool = this.pool.filter(e => !dropped.has(e));
            for (const [tag, entry] of this.byTag) {
                if (dropped.has(entry)) this.byTag.delete(tag);
            }
            for (const [key, entry] of this.byKey) {
                if (dropped.has(entry)) this.byKey.delete(key);
            }
            console.log('[GuessGame] Схлопнуто тегов-двойников:', dropped.size);
        }
    }

    async _fetchMore(query) {
        try {
            const data = await fetchPosts(query, false, 0);
            const fresh = Array.isArray(data) ? data
                : Array.isArray(data && data.post) ? data.post
                : (data && data.post) ? [data.post] : [];
            this._collectFromPosts(fresh);
            return fresh.length;
        } catch (e) {
            console.error('[GuessGame] Failed to fetch posts for', query, e);
            return 0;
        }
    }

    async ensurePool(minSize = 6) {
        const isFavActive = window.gallery && window.gallery.isFavoritesActive;
        const posts = (window.gallery && Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts))
            ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
            : [];
        this._collectFromPosts(posts);

        this._collapseTwins();

        let attempts = 0;
        while (this._eligible().length < minSize && attempts < 6) {
            attempts++;
            if (!await this._fetchMore('sort:random')) break;
            this._collapseTwins();
        }

        // Не набралось на строгом пороге — опускаем ступень и пробуем снова.
        while (this._eligible().length < 2 && this.thresholdIndex < COUNT_THRESHOLDS.length - 1) {
            this.thresholdIndex++;
            console.warn('[GuessGame] Понижаю порог популярности до', this.threshold);
        }

        return this._eligible().length >= 2;
    }

    /**
     * Догружает арты конкретного персонажа поиском по его тегу. Это не только
     * листалка: из общей выдачи оба персонажа могут прийти ИЗ ОДНОГО И ТОГО ЖЕ
     * поста (у поста бывает несколько тегов персонажей), и тогда в обоих слотах
     * оказывалась одна и та же картинка. Поиск по конкретному тегу даёт
     * персонажу собственные арты.
     */
    async ensureArts(entry) {
        if (!entry || entry.posts.length >= MAX_ARTS_PER_ENTRY || entry._artsLoading || entry._artsLoaded) return;
        entry._artsLoading = true;
        try {
            const data = await fetchPosts(entry.tag, false, 0);
            const fresh = Array.isArray(data) ? data
                : Array.isArray(data && data.post) ? data.post
                : (data && data.post) ? [data.post] : [];
            for (const post of fresh) {
                this._addArt(entry, post);
                if (entry.posts.length >= MAX_ARTS_PER_ENTRY) break;
            }
            entry._artsLoaded = true;
        } catch (e) {
            console.warn('[GuessGame] Failed to load extra arts for', entry.tag, e);
        } finally {
            entry._artsLoading = false;
        }
    }

    /**
     * Выбор соперника. Кроме самого персонажа избегаем ещё и его франшизу:
     * два персонажа из одного поста несут одинаковые copyright-теги, и в игре
     * это выглядело как «разные имена, но одна и та же франшиза». Если пара из
     * другой франшизы не находится — берём любую, лишь бы не того же персонажа.
     */
    _pickRandom(exclude) {
        const eligible = this._eligible();
        // Отсекаем не только сам тег, но и однофамильцев: prettifyTag убирает
        // скобки, поэтому "rem_(re:zero)" и "rem_(another)" показались бы игроку
        // как два одинаковых «Rem».
        const excludeBase = exclude ? normalizeTag(exclude.tag.replace(/_?\([^)]*\)\s*$/, '')) : null;
        const notSame = exclude
            ? eligible.filter(c => c.tag !== exclude.tag
                && normalizeTag(c.tag.replace(/_?\([^)]*\)\s*$/, '')) !== excludeBase)
            : eligible;
        if (!notSame.length) return null;

        if (exclude) {
            const excludeCopyrights = new Set(exclude.copyrightTags || []);
            const otherFranchise = notSame.filter(c =>
                !(c.copyrightTags || []).some(t => excludeCopyrights.has(t)));
            if (otherFranchise.length) {
                return otherFranchise[Math.floor(Math.random() * otherFranchise.length)];
            }
        }
        return notSame[Math.floor(Math.random() * notSame.length)];
    }

    /** Готовит пару к показу: у каждого должны быть СВОИ арты. */
    async _preparePair() {
        if (!this.current || !this.hidden) return;
        await Promise.all([this.ensureArts(this.current), this.ensureArts(this.hidden)]);
        this.current.artIndex = 0;
        this.hidden.artIndex = 0;
        // Последняя страховка: если персонажи всё же делят один и тот же пост и
        // он оказался первым у обоих — сдвигаем правому кадр, чтобы картинки
        // визуально не совпадали.
        const leftId = String((this.current.posts[0] || {}).id);
        const rightId = String((this.hidden.posts[0] || {}).id);
        if (leftId === rightId && this.hidden.posts.length > 1) {
            this.hidden.artIndex = 1;
        }
    }

    async startRound() {
        const ok = await this.ensurePool(6);
        this.score = 0;
        this.active = ok;
        if (!ok) return false;
        this.current = this._pickRandom(null);
        this.hidden = this._pickRandom(this.current);
        if (!this.hidden) {
            await this.ensurePool(this._eligible().length + 4);
            this.hidden = this._pickRandom(this.current);
        }
        this.active = !!(this.current && this.hidden);
        if (this.active) {
            this.warmUp();
            await this._preparePair();
        }
        return this.active;
    }

    async guess(direction) {
        if (!this.active || !this.current || !this.hidden) return null;
        const correct = direction === 'more'
            ? this.hidden.count >= this.current.count
            : this.hidden.count <= this.current.count;

        const revealed = this.hidden;

        if (correct) {
            this.score++;
            if (this.score > this.best) {
                this.best = this.score;
                localStorage.setItem(BEST_SCORE_KEY, String(this.best));
            }
            this.current = this.hidden;
            this.hidden = this._pickRandom(this.current);
            if (!this.hidden) {
                await this.ensurePool(this._eligible().length + 4);
                this.hidden = this._pickRandom(this.current);
                if (!this.hidden) {
                    this.active = false;
                    return { correct: true, revealed, gameOver: true, poolExhausted: true, score: this.score, best: this.best };
                }
            }
            this.warmUp();
        } else {
            this.active = false;
        }

        return { correct, revealed, gameOver: !correct, score: this.score, best: this.best };
    }

    /** Готовит следующую пару. Вызывается UI после показа результата раунда,
     *  чтобы догрузка артов шла во время паузы, а не задерживала отрисовку. */
    async prepareNext() {
        await this._preparePair();
    }

    async classify(entry) {
        try {
            const resp = await fetch('/api/game/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterTag: entry.tag, copyrightTags: entry.copyrightTags })
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data && data.ok ? data.result : null;
        } catch (e) {
            console.warn('[GuessGame] classify failed:', e);
            return null;
        }
    }

    /**
     * Просит сервер заранее определить франшизы персонажей из пула, пока игрок
     * смотрит текущий раунд. Классификация ходит во внешние API (Wikidata, Steam,
     * Kitsu, VNDB) и на холодную занимает секунды — без прогрева плашка франшизы
     * появлялась заметно позже самой картинки. Ответ не ждём: это фоновая задача.
     */
    warmUp() {
        const items = this._eligible()
            .slice(0, 24)
            .map(e => ({ characterTag: e.tag, copyrightTags: e.copyrightTags }));
        if (!items.length) return;
        fetch('/api/game/prefetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        }).catch(() => {});
    }
}
