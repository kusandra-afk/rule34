/**
 * Пауза фоновой галереи, пока открыт полноэкранный оверлей.
 *
 * Окно игры, лобби, настроек или библиотеки закрывает страницу затемнением,
 * но сама галерея остаётся в DOM и продолжает жить: бесконечная прокрутка
 * может догрузить следующую страницу, а уже запущенные видео и GIF крутятся
 * под оверлеем, хотя их не видно. Здесь эта работа выключается на время окна
 * и возвращается, когда его закрыли.
 *
 * Состояние читается по классу `modal-open` на <body> — его ставят все
 * полноэкранные окна, поэтому каждому из них не нужен свой API.
 */

const LOCK_CLASS = 'modal-open';

// Все полноэкранные окна проекта. Список нужен, чтобы закрытие одного окна не
// снимало блокировку прокрутки, пока на экране остаётся другое.
const OVERLAY_SELECTOR = [
    '.pz-overlay',
    '.puzzle-overlay',
    '.puzzle-completed-modal',
    '.puzzle-stats-modal',
    '.puzzle-lib-modal-overlay.open',
    '.game-choice-modal-overlay',
    '.instr-modal-overlay',
    '#settings-modal.open'
].join(', ');

const pausedVideos = new Set();
const pausedGifs = new Set();
let locked = false;

export function hasOpenOverlay() {
    return !!document.querySelector(OVERLAY_SELECTOR);
}

export function lockPageScroll() {
    document.body.classList.add(LOCK_CLASS);
    document.documentElement.classList.add(LOCK_CLASS);
}

export function releasePageScroll() {
    if (hasOpenOverlay()) return;
    document.body.classList.remove(LOCK_CLASS);
    document.documentElement.classList.remove(LOCK_CLASS);
}

function pauseBackgroundMedia() {
    document.querySelectorAll('.media-container video').forEach(video => {
        if (video.paused) return;
        try {
            pausedVideos.add(video);
            video.pause();
        } catch (e) {
            // Видео могло быть уже выгружено вместе с карточкой.
        }
    });

    document.querySelectorAll('.media-container img[data-is-gif="true"]').forEach(img => {
        if (typeof img.pauseGif !== 'function') return;
        try {
            img.pauseGif();
            pausedGifs.add(img);
        } catch (e) {
            // GIF уже отключён наблюдателем видимости.
        }
    });
}

function resumeBackgroundMedia() {
    pausedVideos.forEach(video => {
        if (!video.isConnected || !video.paused) return;
        const playing = video.play();
        if (playing && typeof playing.catch === 'function') playing.catch(() => {});
    });
    pausedVideos.clear();

    pausedGifs.forEach(img => {
        if (!img.isConnected || typeof img.playGif !== 'function') return;
        try {
            img.playGif();
        } catch (e) {
            // Карточка успела уехать за экран — её и не нужно запускать.
        }
    });
    pausedGifs.clear();
}

function applyState() {
    const next = document.body.classList.contains(LOCK_CLASS);
    if (next === locked) return;
    locked = next;

    if (locked) {
        pauseBackgroundMedia();
        return;
    }

    resumeBackgroundMedia();
    // Пока окно было открыто, наблюдатель за концом ленты молчал. Если конец
    // уже на экране, без повторной подписки он не сработает сам — лента
    // осталась бы недогруженной до первого движения скролла.
    if (window.galleryController && typeof window.galleryController.resumeInfiniteScroll === 'function') {
        window.galleryController.resumeInfiniteScroll();
    }
}

export function initBackgroundPause() {
    if (!document.body || window._backgroundPauseReady) return;
    window._backgroundPauseReady = true;
    new MutationObserver(applyState).observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
    });
    applyState();
}
