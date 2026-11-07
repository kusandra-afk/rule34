// Незаконченная соло-сборка пазла.
//
// Состояние деталей в игре — это всего три поля: id, позиция (currentPos:
// 0..total-1 — доска, дальше лоток) и группа (groupId, склеенные детали).
// Поэтому снимок дешёвый: картинка, сложность, позиции и время. DOM, таймеры
// и обработчики при восстановлении создаются заново обычным запуском игры.

const KEY = 'r34_puzzle_resume';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveResume(snapshot) {
    if (!snapshot || !snapshot.post || !Array.isArray(snapshot.tiles)) return;
    try {
        localStorage.setItem(KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
    } catch (e) {
        // Квота: снимок — удобство, а не критичные данные.
    }
}

export function loadResume() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || !data.post || !Array.isArray(data.tiles) || !data.tiles.length) return null;
        if (data.savedAt && Date.now() - data.savedAt > MAX_AGE_MS) {
            localStorage.removeItem(KEY);
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
}

export function clearResume() {
    try { localStorage.removeItem(KEY); } catch (e) {}
}
