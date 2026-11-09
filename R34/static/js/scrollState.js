/**
 * ScrollState — сохранение позиции прокрутки страницы между экранами.
 *
 * Галерея, «Избранное», настройки и мини-игры живут в одном документе и
 * переключаются показом/скрытием блоков. Любое такое переключение — и уж тем
 * более блокировка прокрутки под модалкой (overflow:hidden + height:100vh в
 * search.css) — схлопывает высоту документа, браузер обрезает scrollY, и
 * возврат на экран начинается с самого верха, будто пользователь ничего не
 * листал.
 *
 * rememberScroll() запоминает позицию до переключения, restoreScroll()
 * возвращает её после. Высота страницы растёт не сразу (карточки, избранное и
 * подгрузка идут асинхронно), поэтому позиция выставляется несколько раз, пока
 * документ не станет достаточно высоким. Как только пользователь сам начал
 * крутить (wheel / touchmove / клавиши), повторы прекращаются: перетягивать
 * страницу из-под пальца нельзя.
 */

const positions = new Map();

// Таймеры и слушатели текущего восстановления. Живёт только один набор:
// новая навигация отменяет предыдущую.
let timers = [];
let cancelHandler = null;

const USER_SCROLL_EVENTS = ['wheel', 'touchmove', 'keydown'];

function release() {
    timers.forEach(clearTimeout);
    timers = [];
    if (cancelHandler) {
        USER_SCROLL_EVENTS.forEach((name) => window.removeEventListener(name, cancelHandler));
        cancelHandler = null;
    }
}

function applyScroll(top) {
    // Если документ пока короче цели, браузер обрежет прокрутку до максимума —
    // следующая попытка повторит, когда контент дорисуется.
    // behavior: 'instant', а не 'auto': в base.css у html задан
    // scroll-behavior: smooth, и 'auto' запускал плавную анимацию на каждую
    // попытку — страница ехала рывками вместо мгновенной установки позиции.
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
}

export function rememberScroll(key) {
    if (!key) return 0;
    return rememberScrollAt(key, window.scrollY || window.pageYOffset || 0);
}

export function rememberScrollAt(key, top) {
    if (!key) return 0;
    release();
    const position = Number.isFinite(top) ? Math.max(0, top) : 0;
    positions.set(key, position);
    return position;
}

export function forgetScroll(key) {
    positions.delete(key);
}

export function getRememberedScroll(key) {
    return positions.get(key) || 0;
}

export function restoreScroll(key, options = {}) {
    if (!key || !positions.has(key)) return;

    const target = positions.get(key);
    const attempts = Array.isArray(options.attempts)
        ? options.attempts
        : [0, 60, 200, 500, 900, 1500];

    release();

    cancelHandler = () => release();
    USER_SCROLL_EVENTS.forEach((name) => {
        window.addEventListener(name, cancelHandler, { passive: true });
    });

    attempts.forEach((delay, index) => {
        const isLast = index === attempts.length - 1;
        const run = () => {
            applyScroll(target);
            if (isLast) release();
        };
        if (delay <= 0) run();
        else timers.push(setTimeout(run, delay));
    });
}
