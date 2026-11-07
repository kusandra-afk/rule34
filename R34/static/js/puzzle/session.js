// Сессия последней онлайн-комнаты.
//
// Комнаты живут только в браузере организатора (P2P через брокер PeerJS),
// поэтому «переподключение» — это не серверный resume, а повторный вход:
// хост переоткрывает комнату с тем же кодом (peer id выводится из кода и
// пароля, значит адрес не меняется), гость заново подключается к этому
// адресу со своим прежним playerId и попадает в список участников.
//
// sessionStorage, а не localStorage: сессия привязана к вкладке и сама
// исчезает, когда вкладку закрывают. Пароль комнаты тоже здесь — на диске
// он не остаётся.

const KEY = 'r34_puzzle_room_session';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function saveRoomSession(data) {
    if (!data || !data.roomId || !data.playerId) return;
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    } catch (e) {
        // Приватный режим/переполнение хранилища — просто не сможем вернуться.
    }
}

export function loadRoomSession() {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || !data.roomId || !data.playerId) return null;
        // За полсуток комната на публичном брокере гарантированно распалась,
        // и предлагать возврат бессмысленно.
        if (data.savedAt && Date.now() - data.savedAt > MAX_AGE_MS) {
            sessionStorage.removeItem(KEY);
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
}

export function clearRoomSession() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
}
