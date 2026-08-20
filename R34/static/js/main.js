import { TagSearch } from './components/tagSearch.js';
import { Gallery } from './components/gallery.js';
import { SafeScreen } from './components/safeScreen.js';
import { PuzzleGame } from './components/puzzleGame.js';
import { ExpertStylesEditor } from './components/expertStylesEditor.js';
import { ExcludedTagsModal } from './modals/excludedTagsModal.js';
import { initTutorialModal, checkAndRemoveModalOpenClass } from './modals/tutorialModal.js';
import { showConfirmModal } from './modals/confirmModal.js';
import { openGameChoiceModal } from './modals/gameChoiceModal.js';
import { startPuzzleGame } from './components/puzzleLauncher.js';
import { initSettingsModal } from './modals/settingsModal.js';
import { initR34SelectDropdowns } from './components/customDropdown.js';
import { ApiSettingsManager } from './settings/apiSettings.js';
import { DesignPresetsManager } from './settings/designPresets.js';
import { CustomCssEditor } from './settings/customCssEditor.js';
import { ImportExportSettings } from './settings/importExportSettings.js';
import { applyThemeSettings, debouncedApplyThemeSettings, applyAdaptiveText } from './theme/themeManager.js';
import { colorPresets, bgPresets, hoverPresets, fontPresets, getContrastYIQ, getBgLuminance, getAccentGlow, getAccentAlt } from './theme/themePresets.js';
import { GalleryController } from './controllers/galleryController.js';
import { ModeController } from './controllers/modeController.js';
import { initServerSync, getSavedExcludedTags, saveSavedExcludedTags, loadSettingsFromServer, loadTursoConfigFromServer, loadExcludedTagsFromServer } from './init/initServerSync.js';
import { initSafeScreen } from './init/initSafeScreen.js';
import { debounce, setRangeGradient } from './utils.js';
import { tursoSync } from './tursoSync.js';

// Export globally for backwards compatibility and inline handlers
window.applyThemeSettings = applyThemeSettings;
window.debouncedApplyThemeSettings = debouncedApplyThemeSettings;
window.applyAdaptiveText = applyAdaptiveText;
window.getContrastYIQ = getContrastYIQ;
window.getBgLuminance = getBgLuminance;
window.getAccentGlow = getAccentGlow;
window.getAccentAlt = getAccentAlt;
window.colorPresets = colorPresets;
window.bgPresets = bgPresets;
window.hoverPresets = hoverPresets;
window.fontPresets = fontPresets;
window.showConfirmModal = showConfirmModal;
window.openGameChoiceModal = openGameChoiceModal;
window.startPuzzleGame = startPuzzleGame;
window.openPuzzleMenu = startPuzzleGame;
window.getSavedExcludedTags = getSavedExcludedTags;
window.saveSavedExcludedTags = saveSavedExcludedTags;

// Initialize server sync before DOM ready
initServerSync();

// Apply theme settings on load
applyThemeSettings();

document.addEventListener('DOMContentLoaded', () => {
    // 1. Инициализация SafeScreen
    initSafeScreen();

    // 2. Инициализация UI элементов
    const tagInput = document.getElementById('tagInput');
    const arrowButton = document.getElementById('arrowButton');
    const tagModeToggle = document.getElementById('tagModeToggle');
    const r34ResultsCount = document.getElementById('r34ResultsCount');
    const activeTagsContainer = document.getElementById('activeTags');
    const suggestionsContainer = document.getElementById('suggestions');
    const resultsDiv = document.getElementById('results');
    const loader = document.getElementById('loader');
    const paginationLoader = document.getElementById('pagination-loader');
    const errorEl = document.getElementById('error');

    // Клик по счетчику результатов
    window.isCountExpanded = false;
    if (r34ResultsCount) {
        r34ResultsCount.style.cursor = 'pointer';
        r34ResultsCount.style.userSelect = 'none';
        r34ResultsCount.style.webkitUserSelect = 'none';
        r34ResultsCount.addEventListener('click', () => {
            window.isCountExpanded = !window.isCountExpanded;
            if (window.gallery) {
                window.gallery.updateCountDisplay();
            }
        });
    }

    // 3. Инициализация Turso Sync
    tursoSync.init();

    // 4. Инициализация поиска по тегам
    const tagSearch = new TagSearch({
        tagInput,
        arrowButton,
        tagModeToggle,
        activeTagsContainer,
        suggestionsContainer,
        r34ResultsCount
    });
    window.tagSearch = tagSearch;

    window.addExcludedTag = async (tag) => {
        const saved = getSavedExcludedTags();
        if (!saved.includes(tag)) {
            saved.push(tag);
            await saveSavedExcludedTags(saved);
        }
    };
    window.removeExcludedTag = async (tag) => {
        const saved = getSavedExcludedTags();
        const updated = saved.filter(t => t !== tag);
        await saveSavedExcludedTags(updated);
    };

    if (tagInput) {
        tagInput.placeholder = 'Поиск по тегам...';
    }
    localStorage.removeItem('r34_search_mode');

    // Загрузка настроек с сервера
    loadSettingsFromServer().then(() => {
        applyThemeSettings();
    });
    loadTursoConfigFromServer();

    // 5. Инициализация галереи
    const gallery = new Gallery({
        resultsDiv,
        loader,
        r34ResultsCount
    });
    window.gallery = gallery;
    window.galleryApp = gallery;

    // 6. Секретный триггер на заголовок (5 кликов для выбора игры)
    let headerClicks = 0;
    let headerClickTimeout = null;
    const header = document.querySelector('h1');
    if (header) {
        header.style.cursor = 'pointer';
        header.title = '(Нажми 5 раз)';
        header.addEventListener('click', () => {
            headerClicks++;
            if (headerClickTimeout) clearTimeout(headerClickTimeout);
            if (headerClicks >= 5) {
                headerClicks = 0;
                openGameChoiceModal(startPuzzleGame);
            } else {
                headerClickTimeout = setTimeout(() => {
                    headerClicks = 0;
                }, 1500);
            }
        });
    }

    // 7. Контроллер галереи (загрузка постов, пагинация, фильтрация)
    let currentSort = localStorage.getItem('r34_current_sort') || 'new';

    const galleryController = new GalleryController({
        gallery,
        tagSearch,
        loader,
        paginationLoader,
        resultsDiv,
        errorEl,
        arrowButton,
        getCurrentSort: () => currentSort,
        isProfileMode: () => modeController.isProfileMode()
    });
    galleryController.init();
    window.galleryController = galleryController;

    // Глобальные прокси-функции для совместимости
    function immediateLoadPosts(tagsQuery, append) {
        galleryController.immediateLoadPosts(tagsQuery, append);
    }
    function debouncedLoadPosts(tagsQuery, append) {
        galleryController.debouncedLoadPosts(tagsQuery, append);
    }
    window.immediateLoadPosts = immediateLoadPosts;
    window.debouncedLoadPosts = debouncedLoadPosts;

    // 8. Контроллер режимов (Галерея / Профиль)
    const modeController = new ModeController({
        gallery,
        tagSearch,
        loadGalleryPosts: () => immediateLoadPosts(tagSearch.getTagsQuery(), false)
    });
    modeController.init();
    window.modeController = modeController;

    // 9. Связываем события между компонентами
    tagSearch.onTagsChange = (tagsQuery) => {
        galleryController.resetAndLoad(tagsQuery);
    };

    gallery.onMediaClick = (index) => {
        gallery.openFullscreen(index);
    };

    gallery.onLoadMore = () => {
        console.log('[Gallery] onLoadMore triggered', { loading: galleryController.loading, reachedEnd: galleryController.reachedEnd, puzzleActive: window.puzzleGameActive });
        if (!galleryController.loading && !galleryController.reachedEnd) {
            galleryController.page++;
            galleryController.immediateLoadPosts(tagSearch.getTagsQuery(), true);
        }
    };

    gallery.onTagClick = (tag) => {
        if (!tagSearch.activeTags.some(t => t.value === tag)) {
            tagSearch.activeTags.push({ value: tag, active: true });
            tagSearch.updateActiveTagsDisplay();
            galleryController.resetAndLoad(tagSearch.getTagsQuery());
        }
    };

    // 10. Первоначальная загрузка постов при открытии страницы
    if (!modeController.isProfileMode()) {
        immediateLoadPosts(tagSearch.getTagsQuery(), false);
    }

    // 11. Синхронизация исключённых тегов с поиском (бывшая модалка "скрытия тегов",
    // сама модалка удалена — теги теперь управляются чипами над строкой поиска)
    const excludedTagsModal = new ExcludedTagsModal({
        getSavedExcludedTags: () => getSavedExcludedTags(),
        saveSavedExcludedTags: async (tags) => saveSavedExcludedTags(tags),
        getTagSearch: () => tagSearch,
        onReloadSearch: () => {
            galleryController.resetAndLoad(tagSearch.getTagsQuery());
        }
    });
    excludedTagsModal.init();
    window.excludedTagsModal = excludedTagsModal;

    // Загрузка исключенных тегов с сервера и синхронизация с поиском
    loadExcludedTagsFromServer().then(tags => {
        console.log('Excluded tags loaded:', tags);
        if (excludedTagsModal) {
            excludedTagsModal.syncInitialTagsToSearch();
            // Обновляем галерею, чтобы исключенные теги применились
            if (galleryController && !modeController.isProfileMode()) {
                galleryController.resetAndLoad(tagSearch.getTagsQuery());
            }
        }
    });

    // 12. Пользовательский редактор CSS
    const customStylesEditor = new CustomCssEditor();
    customStylesEditor.init();
    window.customStylesEditor = customStylesEditor;

    // 13. Экспертный редактор CSS переменных
    const expertStylesEditor = new ExpertStylesEditor({
        applyAdaptiveText: (varName, val) => applyAdaptiveText(varName, val)
    });
    expertStylesEditor.init();
    window.expertStylesEditor = expertStylesEditor;

    // 14. Менеджер пресетов дизайна
    const designPresetsManager = new DesignPresetsManager({
        applyThemeSettings: () => applyThemeSettings(),
        customStylesEditor
    });
    designPresetsManager.init();
    window.designPresetsManager = designPresetsManager;

    // 15. Менеджер настроек API
    const apiSettingsManager = new ApiSettingsManager();
    apiSettingsManager.init();
    window.apiSettingsManager = apiSettingsManager;

    // 16. Менеджер импорта/экспорта настроек
    const importExportSettingsManager = new ImportExportSettings({
        applyThemeSettings: () => applyThemeSettings(),
        applyCustomCss: () => customStylesEditor.init(),
        showConfirmModal: (title, msg) => showConfirmModal(title, msg)
    });
    importExportSettingsManager.init();
    window.importExportSettingsManager = importExportSettingsManager;

    // 17. Модальное окно настроек (шестерёнка)
    initSettingsModal({
        getCurrentSort: () => currentSort,
        setCurrentSort: (val) => { currentSort = val; },
        applyThemeSettings: () => applyThemeSettings(),
        debouncedApplyThemeSettings: () => debouncedApplyThemeSettings(),
        rebuildExcludedTagsInTagSearch: () => excludedTagsModal && excludedTagsModal.syncInitialTagsToSearch(),
        showConfirmModal: (title, msg) => showConfirmModal(title, msg)
    });

    // Заменяем нативные <select> настроек на кастомные стилизованные дропдауны
    initR34SelectDropdowns();

    // 18. Инициализация всех градиентов range слайдеров
    function initAllRangeGradients() {
        document.querySelectorAll('input[type="range"].r34-range-gradient, input[type="range"].photo-progress').forEach(range => {
            if (!range._gradientInit) {
                setRangeGradient(range);
                range.addEventListener('input', () => setRangeGradient(range));
                range._gradientInit = true;
            }
        });
    }
    initAllRangeGradients();

    // 19. Кнопка "Наверх"
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');
    if (scrollToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 400) {
                scrollToTopBtn.classList.add('visible');
            } else {
                scrollToTopBtn.classList.remove('visible');
            }
        }, { passive: true });
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Fix for sticky hovers on touch devices
    document.body.classList.add('can-hover');
    document.addEventListener('touchstart', function removeHover() {
        document.body.classList.remove('can-hover');
        document.removeEventListener('touchstart', removeHover, false);
    }, { passive: true });
});
