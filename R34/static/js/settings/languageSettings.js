/**
 * Interface language switch and small cross-cutting UI fixes.
 *
 * The English dictionary is extended here for strings emitted by settings and
 * controls; the main i18n observer continues to translate dynamically added UI.
 */

import { getLanguage, setLanguage, applyLanguage, } from '../i18n/i18n.js';
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
    ['Скрывать теги до наведения', 'Hide tags until hover'],
    ['Скрыть теги до наведения', 'Hide tags until hover'],
    ['Продвинутые настройки:', 'Advanced settings:'],
    ['Показать панель поиска', 'Show search panel'],
    ['Показать поиск', 'Show search'],
    ['Поиск', 'Search'],
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
];

Object.assign(EN, Object.fromEntries(EXTRA_EN));

function installMobileSettingsFixes() {
    // These mobile rules must come after the page stylesheets: several older
    // responsive declarations hard-code values and otherwise mask advanced
    // settings such as card radius, spacing, tag size, border, and transition.
    if (!document.getElementById('r34-mobile-advanced-settings-fix')) {
        const style = document.createElement('style');
        style.id = 'r34-mobile-advanced-settings-fix';
        style.textContent = `
            @media (max-width: 900px) {
                #results { gap: var(--media-gap, 16px) !important; }
                .media-container {
                    border-radius: var(--media-radius, 16px) !important;
                    border-width: var(--card-border-width, 1px) !important;
                    border-color: var(--card-border-color, var(--glass-border)) !important;
                    transition-duration: var(--card-transition-speed, 300ms) !important;
                }
                .media-container > img,
                .media-container video.media-content {
                    border-radius: inherit !important;
                }
                .media-extra-info {
                    border-radius: var(--media-radius, 16px) !important;
                }
                .media-tag {
                    font-size: var(--tag-font-size, 0.88rem) !important;
                }
            }
            .r34-search-mini-tags { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    // The feature was removed. Clear its persisted value as well, so legacy
    // preferences cannot keep hiding card tags after an update.
    document.getElementById('pcOnlyTagsHoverOption')?.remove();
    localStorage.removeItem('r34_tags_only_on_hover');
    document.body.classList.remove('r34-tags-hover-only');

    // Preserve the user's explicit mute choice when the player starts. The
    // player used to force `muted = false` in its play toggle.
    if (!document.documentElement.dataset.r34MuteFixInstalled) {
        document.documentElement.dataset.r34MuteFixInstalled = 'true';
        document.addEventListener('click', (event) => {
            const soundButton = event.target.closest('.video-bottom-sound-btn');
            if (!soundButton) return;
            const player = soundButton.closest('.custom-video-controls')?.parentElement;
            const video = player?.querySelector('video');
            if (video) video.dataset.r34UserMuted = String(!video.muted);
        }, true);

        document.addEventListener('play', (event) => {
            const video = event.target;
            if (!(video instanceof HTMLVideoElement) || !('r34UserMuted' in video.dataset)) return;
            video.muted = video.dataset.r34UserMuted === 'true';
        }, true);
    }

    // The modal body is the actual scroll container. Reset it on open and on
    // either tab switch, including on mobile where the full-screen modal made
    // the previous tab's scroll position particularly confusing.
    const settingsModal = document.getElementById('settings-modal');
    const settingsBody = settingsModal?.querySelector('.settings-modal-body');
    const resetSettingsScroll = () => {
        if (settingsBody) settingsBody.scrollTop = 0;
        const preview = document.getElementById('settingsPreviewArea');
        if (preview) preview.scrollTop = 0;
    };
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
        resetSettingsScroll();
        requestAnimationFrame(() => requestAnimationFrame(resetSettingsScroll));
    });
    settingsModal?.querySelectorAll('.settings-tab-btn').forEach((button) => {
        button.addEventListener('click', () => requestAnimationFrame(resetSettingsScroll));
    });

    if (getLanguage() === 'en') applyLanguage(document.body);
}

export function initLanguageSettings() {
    const container = document.getElementById('settingsLanguageSwitch');
    installMobileSettingsFixes();
    if (!container) return;

    const buttons = Array.from(container.querySelectorAll('.settings-lang-btn'));

    const paint = (lang) => {
        buttons.forEach((btn) => {
            const isActive = btn.dataset.lang === lang;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    paint(getLanguage());

    buttons.forEach((btn) => {
        const lang = btn.dataset.lang;
        if (!lang) return;
        btn.addEventListener('click', async () => {
            if (btn.classList.contains('active')) return;
            paint(lang);
            await setLanguage(lang);
            // Keep the selected language in shared settings for other devices.
            saveSettingsToServer();
        });
    });

    document.addEventListener('r34:language-changed', (event) => {
        paint(event.detail.lang);
    });
}
