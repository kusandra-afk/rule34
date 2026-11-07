// Просмотренные посты.
//
// Храним только id в localStorage, без самих постов: список нужен, чтобы
// приглушить в ленте уже открытые карточки, а не чтобы хранить галерею.
// Id приводим к строке: API отдаёт числа, а сравнивать их приходится и с
// результатами парсинга из storage, и с data-атрибутами — без нормализации
// 123456 и "123456" считались разными постами.
// Ограничение в 3000 записей не даёт множеству вырасти до размера, на котором
// localStorage начинает ругаться на квоту.

const KEY = 'r34_viewed_posts';
const LIMIT = 3000;

let cache = null;

function keyOf(id) {
    return String(id);
}

function load() {
    if (cache) return cache;
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
        cache = new Set(Array.isArray(raw) ? raw.filter(v => v !== null && v !== undefined).map(keyOf) : []);
    } catch (e) {
        cache = new Set();
    }
    return cache;
}

function persist(set) {
    try {
        // Set хранит порядок вставки, поэтому slice(-LIMIT) выбрасывает
        // самые старые отметки, а не случайные.
        localStorage.setItem(KEY, JSON.stringify([...set].slice(-LIMIT)));
    } catch (e) {
        // Квота кончилась — просто не сохраняем, лента продолжит работать.
    }
}

export function isViewed(id) {
    if (id === undefined || id === null) return false;
    return load().has(keyOf(id));
}

export function markViewed(id) {
    if (id === undefined || id === null) return false;
    const key = keyOf(id);
    const set = load();
    if (set.has(key)) return false;
    set.add(key);
    if (set.size > LIMIT) {
        const excess = set.size - LIMIT;
        let dropped = 0;
        for (const value of set) {
            set.delete(value);
            if (++dropped >= excess) break;
        }
    }
    persist(set);
    return true;
}

export function viewedCount() {
    return load().size;
}

export function clearViewed() {
    cache = new Set();
    try { localStorage.removeItem(KEY); } catch (e) {}
}
