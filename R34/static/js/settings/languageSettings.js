/**
 * Interface language switch and cross-cutting UI fixes.
 *
 * The English dictionary is extended here for strings emitted by settings and
 * controls; the main i18n observer continues to translate dynamically added UI.
 */

import { getLanguage, setLanguage, applyLanguage } from '../i18n/i18n.js';
import { EN } from '../i18n/locales/en.js';
import { saveSettingsToServer } from '../init/initServerSync.js';

const EXTRA_EN = [
    ['Настройки API Rule34', 'Rule34 API settings'],
    ['Тип загрузки страниц', 'Page loading mode'],
    ['Бесконечная прокрутка (Скролл)', 'Infinite scroll'],
    ['Постраничная навигация (Листы)', 'Page navigation'],
    ['Минимальное число секунд:', 'Minimum duration (seconds):'],
    ['Минимальная длительность видео', 'Minimum video duration'],
    ['Фильтр мин. длительности видео', 'Minimum video duration filter'],
    ['Защита от длинных изображений', 'Long image protection'],
    ['Количество колонок сетки', 'Grid columns'],
    ['Оригинальное качество', 'Original quality'],
    ['Экономия трафика (только превью)', 'Save data (previews only)'],
    ['Бесконечный повтор видео', 'Loop videos'],
    ['Начальный уровень громкости', 'Default volume'],
    ['Автопролистывание фото', 'Auto-advance photos'],
    ['Автопролистывание видео', 'Auto-advance videos'],
    ['Интервал автопролистывания (сек)', 'Auto-advance interval (sec)'],
    ['Настройки Turso', 'Turso settings'],
    ['Проверка соединения с Turso...', 'Checking the Turso connection...'],
    ['Настройки сохранены', 'Settings saved'],
    ['Живой предпросмотр (Мини-сайт)', 'Live preview (mini-site)'],
    ['Стиль шапки поиска', 'Search header style'],
    ['Размер шрифта тегов', 'Tag font size'],
    ['Текущая комбинация:', 'Current shortcut:'],
    ['Файлы в папке safe_screen:', 'Files in the safe_screen folder:'],
    ['Очистить кэш', 'Clear cache'],
    ['Найти', 'Search'],
    ['Все посты', 'All posts'],
    ['Игнорировать', 'Ignore'],
    ['Включенные теги', 'Included tags'],
    ['Исключенные теги', 'Excluded tags'],
    ['Продвинутые настройки:', 'Advanced settings:'],
    ['Показать панель поиска', 'Show search panel'],
    ['Показать поиск', 'Show search'],
    ['Галерея', 'Gallery'],
    ['Избранное', 'Favorites'],
    ['Настройки', 'Settings'],
    ['Сбросить всё', 'Reset all'],
    ['Сбросить настройки', 'Reset settings'],
    ['Параметры сетки и размеры', 'Grid parameters and sizes'],
    ['Стилизация и эффекты карточек', 'Card styling and effects'],
    ['Внешний вид и Тема', 'Appearance and theme'],
    ['Отображение и качество', 'Display and quality'],
    ['Поиск и фильтрация', 'Search and filtering'],
    ['Воспроизведение и Слайд-шоу', 'Playback and slideshow'],
    ['Система и данные', 'System and data'],
    ['Оптимизация и производительность', 'Optimization and performance'],
    ['Принудительная высота (px)', 'Forced height (px)'],
    ['Принудительная ширина (px)', 'Forced width (px)'],
    ['Размер текста тегов на карточках', 'Tag text size on cards'],
    ['Скругление карточек', 'Card corner radius'],
    ['Расстояние между карточками (Gap)', 'Spacing between cards (gap)'],
    ['Фон интерфейса', 'Interface background'],
    ['Свой логотип (Заголовок)', 'Custom logo (title)'],
    ['Режим для слабых устройств', 'Low-end device mode'],
    ['Ограничить число карточек за раз', 'Limit cards per batch'],
    ['Предзагрузка карточек', 'Card preloading'],
    ['Упростить пазлы', 'Simplify puzzles'],
    ['Не удалось загрузить', 'Failed to load'],
    ['Проверьте соединение.', 'Check your connection.'],
    ['Размер карточек', 'Card size'],
    ['Толщина рамки карточки', 'Card border width'],
    ['Цвет рамки карточки', 'Card border color'],
    ['Скорость анимации карточек', 'Card animation speed'],
    ['Интенсивность свечения карточки', 'Card glow intensity'],
    ['Показывать теги в описании', 'Show tags in the description'],
    ['Шрифт для всего сайта', 'Site-wide font'],
    ['Свои настройки', 'Custom settings'],
    ['Сохранение...', 'Saving...'],
    ['Авто-скролл', 'Auto-scroll'],
    ['Стоп скролл', 'Stop scrolling'],
    ['Очистить', 'Clear'],
    ['Ваш экран слишком мал для', 'Your screen is too small for'],
    ['колонок — сейчас доступно максимум', 'columns — the current maximum is'],
];

Object.assign(EN, Object.fromEntries(EXTRA_EN));

function rememberVideoMutePreference(video) {
    if (!(video instanceof HTMLVideoElement)) return;

    const muted = Boolean(video.muted);
    // Keep an independent preference: VideoPlayer's volumechange listener and
    // mobile media reloads may alter `muted`, but must not overwrite this value.
    video.dataset.r34MutePreference = String(muted);
    video.dataset.r34UserMuted = String(muted);
    video.defaultMuted = muted;
    if (muted) video.setAttribute('muted', '');
    else video.removeAttribute('muted');

    const player = video._videoPlayerInstance;
    if (player) player._userMuted = muted;

    if (!video.dataset.r34MutePreferenceWrapped) {
        video.dataset.r34MutePreferenceWrapped = 'true';
        const playerPlay = video.play;
        video.play = function (...args) {
            const preference = this.dataset.r34MutePreference;
            if (preference !== undefined) {
                const shouldMute = preference === 'true';
                // VideoPlayer's wrapper sets its internal state before calling
                // native play, so update that state before delegating to it.
                if (this._videoPlayerInstance) this._videoPlayerInstance._userMuted = shouldMute;
                this.defaultMuted = shouldMute;
                if (shouldMute) this.setAttribute('muted', '');
                else this.removeAttribute('muted');
                this.muted = shouldMute;
            }
            return playerPlay.apply(this, args);
        };
    }

    if (!video.dataset.r34MutePreferenceEventsInstalled) {
        video.dataset.r34MutePreferenceEventsInstalled = 'true';
        const enforcePreference = () => {
            const preference = video.dataset.r34MutePreference;
            if (preference === undefined) return;
            const shouldMute = preference === 'true';
            if (video._videoPlayerInstance) video._videoPlayerInstance._userMuted = shouldMute;
            video.defaultMuted = shouldMute;
            if (shouldMute) video.setAttribute('muted', '');
            else video.removeAttribute('muted');
            if (video.muted !== shouldMute) video.muted = shouldMute;
            video._videoPlayerInstance?._updateSoundState?.();
        };
        video.addEventListener('play', enforcePreference, true);
        video.addEventListener('playing', enforcePreference, true);
    }
}

function installMobileSettingsFixes() {
    if (!document.getElementById('r34-mobile-advanced-settings-fix')) {
        const style = document.createElement('style');
        style.id = 'r34-mobile-advanced-settings-fix';
        style.textContent = `
            @media (max-width: 900px) {
                #results,
                #results.multi-cols-mode { gap: var(--media-gap, 16px) !important; }
                .media-container {
                    border-radius: var(--media-radius, 16px) !important;
                    border-width: var(--card-border-width, 1px) !important;
                    border-color: var(--card-border-color, var(--glass-border)) !important;
                    transition-duration: var(--card-transition-speed, 300ms) !important;
                }
                .media-container > img,
                .media-container video.media-content,
                .media-container .media-content { border-radius: inherit !important; }
                .media-extra-info { border-radius: var(--media-radius, 16px) !important; }
                .media-tag { font-size: var(--tag-font-size, 0.88rem) !important; }
                .media-extra-info .media-tags-list { display: var(--card-tags-display, flex) !important; }
            }
            .r34-search-mini-tags { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    document.getElementById('pcOnlyTagsHoverOption')?.remove();
    localStorage.removeItem('r34_tags_only_on_hover');
    document.body.classList.remove('r34-tags-hover-only');

    const miniTags = document.getElementById('searchMiniTags');
    if (miniTags) {
        miniTags.replaceChildren();
        miniTags.hidden = true;
        miniTags.setAttribute('aria-hidden', 'true');
    }

    if (!document.documentElement.dataset.r34MuteFixInstalled) {
        document.documentElement.dataset.r34MuteFixInstalled = 'true';
        // Both mute controls are supported. Defer until their click handlers
        // have toggled the element; capturing the event reads the old value.
        document.addEventListener('click', (event) => {
            if (!(event.target instanceof Element)) return;
            const button = event.target.closest('.video-bottom-sound-btn, .sound-toggle-btn');
            if (!button) return;
            const video = button.closest('.custom-video-controls')?.parentElement?.querySelector('video')
                || button.closest('.sound-control-wrapper')?.parentElement?.querySelector('video');
            if (video) queueMicrotask(() => rememberVideoMutePreference(video));
        }, true);
    }

    const settingsModal = document.getElementById('settings-modal');
    const settingsBody = settingsModal?.querySelector('.settings-modal-body');
    const resetSettingsScroll = () => {
        if (settingsBody) settingsBody.scrollTop = 0;
        settingsModal?.querySelectorAll('.settings-tab-pane').forEach(pane => { pane.scrollTop = 0; });
        const preview = document.getElementById('settingsPreviewArea');
        if (preview) preview.scrollTop = 0;
    };
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
        resetSettingsScroll();
        requestAnimationFrame(() => requestAnimationFrame(resetSettingsScroll));
    });
    settingsModal?.querySelectorAll('.settings-tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            resetSettingsScroll();
            requestAnimationFrame(resetSettingsScroll);
        });
    });

    if (getLanguage() === 'en') applyLanguage(document.body);
}

export function initLanguageSettings() {
    const container = document.getElementById('settingsLanguageSwitch');
    installMobileSettingsFixes();
    if (!container) return;

    const buttons = Array.from(container.querySelectorAll('.settings-lang-btn'));
    const paint = (lang) => {
        buttons.forEach(btn => {
            const isActive = btn.dataset.lang === lang;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    paint(getLanguage());
    buttons.forEach(btn => {
        const lang = btn.dataset.lang;
        if (!lang) return;
        btn.addEventListener('click', async () => {
            if (btn.classList.contains('active')) return;
            paint(lang);
            await setLanguage(lang);
            saveSettingsToServer();
        });
    });
    document.addEventListener('r34:language-changed', event => paint(event.detail.lang));
}
