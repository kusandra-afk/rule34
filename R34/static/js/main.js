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
import { GuessUI } from './components/guessUI.js';
import { initSettingsModal } from './modals/settingsModal.js';
import { initR34SelectDropdowns } from './components/customDropdown.js';
import { ApiSettingsManager } from './settings/apiSettings.js';
import { applyThemeSettings, debouncedApplyThemeSettings, applyAdaptiveText, setAccent, setBackground } from './theme/themeManager.js';
import { colorPresets, bgPresets, hoverPresets, fontPresets, getContrastYIQ, getBgLuminance, getAccentGlow, getAccentAlt } from './theme/themePresets.js';
import { GalleryController } from './controllers/galleryController.js';
import { ModeController } from './controllers/modeController.js';
import { initServerSync, getSavedExcludedTags, saveSavedExcludedTags, loadSettingsFromServer, loadTursoConfigFromServer, loadExcludedTagsFromServer } from './init/initServerSync.js';
import { initSafeScreen } from './init/initSafeScreen.js';
import { debounce, setRangeGradient } from './utils.js';
import { tursoSync } from './tursoSync.js';
import { initEffects } from './effects/ripple.js';
import { initI18n } from './i18n/i18n.js';
import { initLanguageSettings } from './settings/languageSettings.js';
import { initBackgroundPause } from './backgroundPause.js';

// Export globally for backwards compatibility and inline handlers
window.applyThemeSettings = applyThemeSettings;
// Единая точка смены акцента — её же используют пресеты в редакторе стилей.
window.setAccent = setAccent;
window.setBackground = setBackground;
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
window.startGuessGame = () => GuessUI.open();
window.getSavedExcludedTags = getSavedExcludedTags;
window.saveSavedExcludedTags = saveSavedExcludedTags;

// Язык интерфейса: берём сохранённый выбор (в браузере или на сервере)
// и, если это английский, переводим страницу до отрисовки контента.
initI18n();

// Галерея под полноэкранными окнами (игра, лобби, настройки, библиотека)
// перестаёт догружать страницы и крутить видео — см. backgroundPause.js.
initBackgroundPause();

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

    // Панель поиска: ручного сворачивания стрелкой больше нет — панель
    // сама уезжает при прокрутке вниз и возвращается при прокрутке вверх
    // (см. «Умная шапка» ниже). Осталось только найти контейнер и панель.
    const searchContainer = document.getElementById('searchContainer');
    const searchBlock = document.getElementById('searchBlock');

    // ── Умная шапка по направлению скролла (ПК и телефоны) ──────────
    // Вниз по ленте — полная панель уезжает, вместо неё узкая полоска
    // с лупой и активными тегами. Вверх — панель возвращается.
    // Клик по полоске, фокус на поиске или Esc-очистка — раскрывают сразу.
    // Работает одинаково на ПК и на телефоне.
    if (searchContainer && searchBlock) {
        const miniBar = document.getElementById('searchMiniBar');
        const miniTags = document.getElementById('searchMiniTags');
        const miniWrap = document.getElementById('searchMiniBarWrap');
        const miniActions = document.getElementById('miniActions');
        const SCROLL_DELTA = 8;    // порог, чтобы не дёргать на микроскролле
        const HIDE_AFTER = 120;    // ниже этого от верха не прячем вовсе

        // ── Быстрый доступ к режимам в свёрнутой шапке (ПК) ─────────────
        // Табы «Галерея / Избранное / Настройки» уезжают вместе с шапкой,
        // поэтому при скролле их иконки показываются рядом с полоской поиска.
        // Кнопки не дублируют разметку: иконка берётся из существующего таба,
        // клик прокидывается в него же, а состояние .active подхватывается.
        const miniActionButtons = [];

        const syncMiniActions = () => {
            miniActionButtons.forEach(({ btn, source }) => {
                btn.classList.toggle('active', source.classList.contains('active'));
            });
        };

        if (miniActions) {
            [
                { id: 'modeGalleryBtn', label: 'Галерея' },
                { id: 'modeProfileBtn', label: 'Избранное' },
                { id: 'settingsBtn', label: 'Настройки' }
            ].forEach(({ id, label }) => {
                const source = document.getElementById(id);
                if (!source) return;

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'r34-mini-action';
                btn.title = label;
                btn.setAttribute('aria-label', label);

                const svg = source.querySelector('svg');
                btn.innerHTML = svg ? svg.outerHTML : label;

                btn.addEventListener('click', (e) => {
                    // Клик не должен доходить до document: глобальный обработчик
                    // «клик вне окна» иначе сразу закроет только что открытые
                    // настройки (кнопка-дубль находится вне модалки).
                    e.stopPropagation();
                    source.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true }));
                    requestAnimationFrame(syncMiniActions);
                });

                miniActions.appendChild(btn);
                miniActionButtons.push({ btn, source });
            });

            // Если режим поменяли не отсюда (нижняя навигация, хоткеи, профиль),
            // подсветка в полоске должна остаться правдивой.
            if (typeof MutationObserver !== 'undefined') {
                const observer = new MutationObserver(syncMiniActions);
                ['modeGalleryBtn', 'modeProfileBtn'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
                });
            }
            syncMiniActions();
        }

        let lastScrollY = window.scrollY;
        let ticking = false;
        let hidden = false;

        const readActiveTagsText = () => {
            if (!miniTags) return;
            const tags = document.querySelectorAll('#activeTags .tag');
            if (!tags.length) {
                miniTags.textContent = 'Все посты';
                return;
            }
            const parts = [];
            tags.forEach(t => {
                const label = (t.textContent || '').trim().replace(/\s+/g, ' ');
                if (!label) return;
                const excluded = t.classList.contains('inactive') || t.classList.contains('tag-exclude');
                parts.push((excluded ? '-' : '') + label);
            });
            miniTags.textContent = parts.join(' · ');
        };

        // «Плавающая» шапка: контейнер прилип к верху вьюпорта (position:
        // sticky сработал). Только в этом состоянии список тегов ограничен по
        // высоте и скроллится внутри себя — иначе панель уходила бы за экран.
        // Пока шапка на своём месте в потоке, теги могут занимать сколько
        // угодно места: они просто раздвигают ленту, ничего не перекрывая.
        //
        // Порог «прилип» считаем по положению контейнера в документе (offsetTop),
        // а не по живому getBoundingClientRect(). Ограничение тегов по высоте
        // меняет высоту панели, а значит и раскладку под ней; если мерить
        // прилипание по rect.top, класс переключается от собственного эффекта:
        // панель сжимается → галерея подпрыгивает → scrollY уезжает назад →
        // класс снимается → панель разворачивается — и так по кругу. На ПК из-за
        // этого страницу было не прокрутить вниз, её перекидывало наверх.
        let floatingThreshold = Infinity;

        const docTop = (el) => {
            let y = 0;
            let node = el;
            while (node) {
                y += node.offsetTop || 0;
                node = node.offsetParent;
            }
            return y;
        };

        const updateFloatingState = () => {
            // offsetParent === null — контейнер скрыт (режим «Избранное»):
            // оставляем прежний порог, чтобы возврат в галерею не мигал.
            if (searchContainer.offsetParent) {
                const stickyOffset = parseFloat(getComputedStyle(searchContainer).top) || 0;
                floatingThreshold = Math.max(0, docTop(searchContainer) - stickyOffset);
            }
            const stuck = window.scrollY > floatingThreshold + 0.5;
            searchContainer.classList.toggle('is-floating', stuck);
        };

        const setHidden = (next) => {
            if (hidden === next) return;
            hidden = next;
            searchContainer.classList.toggle('is-scrolled-away', next);
            if (miniWrap) {
                miniWrap.classList.toggle('is-visible', next);
            }
            if (miniBar) {
                if (next) readActiveTagsText();
                miniBar.classList.toggle('is-visible', next);
                miniBar.setAttribute('aria-hidden', String(!next));
            }
            if (miniActions) {
                miniActions.setAttribute('aria-hidden', String(!next));
            }
        };

        const revealBlock = () => {
            setHidden(false);
            lastScrollY = window.scrollY;
            updateFloatingState();
        };

        // Пока пользователь работает с самой панелью, «умная шапка» не должна
        // её прятать. Клик внутри панели и сворачивание группы тегов меняют
        // высоту документа (список тегов схлопывается анимацией ~0.4s), и
        // браузер подтягивает прокрутку — для обработчика ниже это выглядит
        // как рывок вниз на десятки пикселей, и панель уезжала прямо из-под
        // курсора. holdPanelOpen() гасит ровно это окно, а жест пользователя
        // (колесо, свайп) снова прячет панель, как только оно истечёт.
        let suppressHideUntil = 0;

        const holdPanelOpen = () => {
            suppressHideUntil = performance.now() + 800;
            lastScrollY = window.scrollY;
        };

        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;

                const y = window.scrollY;
                const delta = y - lastScrollY;

                // Панель только что трогали: прокрутка ниже — не жест
                // пользователя, а подстройка после смены высоты панели.
                // Просто выравниваем отсчёт, чтобы следующий настоящий скролл
                // считался от нового положения.
                if (performance.now() < suppressHideUntil) {
                    lastScrollY = y;
                    updateFloatingState();
                    return;
                }

                // В самом верху страницы панель всегда видна
                if (y <= HIDE_AFTER) {
                    if (hidden) setHidden(false);
                    lastScrollY = y;
                    return;
                }

                // Пока пользователь печатает (особенно на телефоне, когда
                // открыта клавиатура), панель не прячем — иначе поле ввода
                // уезжает из-под пальца. Обратное раскрытие работает всегда.
                const inputFocused = tagInput && document.activeElement === tagInput;

                if (delta > SCROLL_DELTA && !hidden && !inputFocused) {
                    // Скролл вниз — прячем
                    setHidden(true);
                } else if (delta < -SCROLL_DELTA && hidden) {
                    // Скролл вверх — показываем
                    setHidden(false);
                }

                lastScrollY = y;
                updateFloatingState();
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', updateFloatingState, { passive: true });
        updateFloatingState();

        // Любое взаимодействие с панелью (клик по тегу, по полю, по шапке
        // группы, фокус в поле) держит её раскрытой — см. holdPanelOpen.
        if (searchContainer) {
            searchContainer.addEventListener('pointerdown', holdPanelOpen, { passive: true });
            searchContainer.addEventListener('click', holdPanelOpen, { passive: true });
            searchContainer.addEventListener('focusin', holdPanelOpen);
        }

        // Клик по полоске — просто раскрыть панель, фокус пользователь поставит сам
        if (miniBar) {
            miniBar.addEventListener('click', () => {
                revealBlock();
                // tagInput.focus() намеренно не вызываем: на телефоне это сразу
                // открывает клавиатуру и сдвигает экран, хотя пользователь мог
                // хотеть просто посмотреть, что в поиске. Тап по самому полю —
                // его дело.
            });
        }

        // Фокус в поле поиска всегда возвращает панель
        if (tagInput) {
            tagInput.addEventListener('focus', revealBlock);
        }

        // Esc в поле — снять фокус и вернуть панель
        if (tagInput) {
            tagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    tagInput.blur();
                    revealBlock();
                }
            });
        }

        // Держим текст в полоске в актуальном состоянии: теги добавляются,
        // удаляются и переключаются включ/исключ — обновляем по факту.
        const activeTagsEl = document.getElementById('activeTags');
        if (activeTagsEl && miniTags) {
            const refreshMiniTags = () => { if (hidden) readActiveTagsText(); };
            if (typeof MutationObserver !== 'undefined') {
                new MutationObserver(refreshMiniTags).observe(activeTagsEl, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    attributes: true,
                    attributeFilter: ['class']
                });
            }
        }
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
        // Настройки с сервера могли принести язык, выбранный на другом
        // устройстве, — повторно применяем его, чтобы интерфейс совпадал.
        initI18n();
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

    // 10 & 11. Синхронизация исключённых тегов с поиском и первоначальная загрузка
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

    // Первоначальная загрузка: ждем синхронизации тегов с сервера, чтобы не спамить
    // двойным запросом в API, но с таймаутом безопасности на случай медленного ответа
    let initialLoaded = false;
    const executeInitialLoad = () => {
        if (initialLoaded) return;
        initialLoaded = true;
        if (!modeController.isProfileMode()) {
            immediateLoadPosts(tagSearch.getTagsQuery(), false);
        }
    };

    const safetyLoadTimeout = setTimeout(executeInitialLoad, 350);

    // Загрузка исключенных тегов с сервера и синхронизация с поиском
    loadExcludedTagsFromServer().then(tags => {
        clearTimeout(safetyLoadTimeout);
        if (excludedTagsModal) {
            excludedTagsModal.syncInitialTagsToSearch();
        }
        executeInitialLoad();
    }).catch(() => {
        clearTimeout(safetyLoadTimeout);
        executeInitialLoad();
    });

    // 13. Экспертный редактор CSS переменных
    const expertStylesEditor = new ExpertStylesEditor({
        applyAdaptiveText: (varName, val) => applyAdaptiveText(varName, val)
    });
    expertStylesEditor.init();
    window.expertStylesEditor = expertStylesEditor;

    // 15. Менеджер настроек API
    const apiSettingsManager = new ApiSettingsManager();
    apiSettingsManager.init();
    window.apiSettingsManager = apiSettingsManager;

    // 17. Модальное окно настроек (шестерёнка)
    initSettingsModal({
        getCurrentSort: () => currentSort,
        setCurrentSort: (val) => { currentSort = val; },
        applyThemeSettings: () => applyThemeSettings(),
        debouncedApplyThemeSettings: () => debouncedApplyThemeSettings(),
        rebuildExcludedTagsInTagSearch: () => excludedTagsModal && excludedTagsModal.syncInitialTagsToSearch(),
        showConfirmModal: (title, msg) => showConfirmModal(title, msg)
    });

    // Переключатель языка в настройках (RU / EN)
    initLanguageSettings();

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

    // 19. Эффекты: ripple, scroll-to-top, smooth entrance
    initEffects();

    // 21. Мобильная нижняя навигация — синхронизация с табами режимов
    const mobileNavGallery = document.getElementById('mobileNavGallery');
    const mobileNavFavorites = document.getElementById('mobileNavFavorites');
    const mobileNavSettings = document.getElementById('mobileNavSettings');
    const modeGalleryBtn = document.getElementById('modeGalleryBtn');
    const modeProfileBtn = document.getElementById('modeProfileBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    const mobileNavItems = [mobileNavGallery, mobileNavFavorites, mobileNavSettings].filter(Boolean);

    // Единственное место, где решается «кто активен». Смена класса и
    // запускает анимации пункта (прорастающая чёрточка + подскок иконки
    // в adaptive.css).
    function setMobileNavActive(activeBtn) {
      mobileNavItems.forEach(btn => btn.classList.toggle('active', btn === activeBtn));
    }

    // Источник правды — табы режимов: и клики отсюда прокидываются в них,
    // и класс .active выставляет общий ModeController. Поэтому читаем
    // состояние табов, а не запоминаем его у себя. Иначе подсветка
    // «Избранного» никогда не включалась: раньше обновление слушало
    // только таб галереи.
    function syncMobileNavFromTabs() {
      const profileActive = modeProfileBtn && modeProfileBtn.classList.contains('active');
      setMobileNavActive(profileActive ? mobileNavFavorites : mobileNavGallery);
    }

    // Синхронизация: мобильные кнопки -> десктоп табы.
    // Клик отправляем без всплытия (как в свёрнутой шапке): обычный .click()
    // всплывал до document, глобальный обработчик «клик вне окна» принимал
    // его за клик снаружи и сразу закрывал только что открытые настройки —
    // на телефоне шестерёнка мигала и ничего не открывала.
    const clickTab = (source) => {
      if (!source) return;
      source.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true }));
    };

    if (mobileNavGallery && modeGalleryBtn) {
      mobileNavGallery.addEventListener('click', () => clickTab(modeGalleryBtn));
    }
    if (mobileNavFavorites && modeProfileBtn) {
      mobileNavFavorites.addEventListener('click', () => clickTab(modeProfileBtn));
    }
    if (mobileNavSettings && settingsBtn) {
      mobileNavSettings.addEventListener('click', () => clickTab(settingsBtn));
    }

    // Переключили режим не с нижней панели (свёрнутая шапка, хоткей,
    // профиль) — подсветка и капсула всё равно должны переехать.
    const mobileNavObserver = new MutationObserver(syncMobileNavFromTabs);
    [modeGalleryBtn, modeProfileBtn].forEach(el => {
      if (el) mobileNavObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    syncMobileNavFromTabs();

    // 22. Кнопка "Наверх" (если есть в HTML)
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
