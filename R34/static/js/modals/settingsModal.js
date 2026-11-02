/**
 * Settings Modal Component
 */

import { debounce, setRangeGradient, extractHexColor, getMaxAllowedColumns } from '../utils.js';
import { icon } from '../icons.js';
import { checkAndRemoveModalOpenClass, initTutorialModal } from './tutorialModal.js';
import { tursoSync } from '../tursoSync.js';
import { saveTursoConfigToServer, saveSettingsToServer } from '../init/initServerSync.js';
import { colorPresets } from '../theme/themePresets.js';
import { debouncedSaveSetting, setAccent } from '../theme/themeManager.js';
import { OnlineUI } from '../puzzle/onlineUI.js';
import { rememberScroll, restoreScroll } from '../scrollState.js';

export function initSettingsModal(options = {}) {
    const {
        getCurrentSort = () => "new",
        setCurrentSort = () => {},
        applyThemeSettings = () => {},
        debouncedApplyThemeSettings = () => {},
        rebuildExcludedTagsInTagSearch = () => {},
        startDemoScroll = () => {},
        stopDemoScroll = () => {},
        showConfirmModal = window.showConfirmModal || (async (title, msg) => confirm(msg))
    } = options;

    let currentSort = getCurrentSort();
    // Заполняется ниже, когда инициализируется разворот живого предпросмотра
    // на весь экран — закрытие самой модалки (крестик/фон/Escape) должно
    // сначала свернуть предпросмотр, иначе он остаётся висеть поверх всего
    // экрана как портальный узел из document.body, а модалка под ним уже
    // закрыта и никак его не достать, кроме как найти его собственный крестик.
    let collapsePreviewFullscreen = () => {};

    // --- ИНИЦИАЛИЗАЦИЯ НАСТРОЕК (Gear settings modal) ---
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    
    const settingsSortSelect = document.getElementById('settingsSortSelect');
    const settingsLikesGroup = document.getElementById('settingsLikesGroup');
    const settingsMinLikesInput = document.getElementById('settingsMinLikesInput');
    
    const settingsColumnsGroup = document.getElementById('settingsColumnsGroup');
    
    const settingsHdCheckbox = document.getElementById('settingsHdCheckbox');

    const settingsOnlyGifsCheckbox = document.getElementById('settingsOnlyGifsCheckbox');
    const settingsAutoSlideCheckbox = document.getElementById('settingsAutoSlideCheckbox');
    const settingsAutoVideoSlideCheckbox = document.getElementById('settingsAutoVideoSlideCheckbox');
    const settingsLongImageCheckbox = document.getElementById('settingsLongImageCheckbox');
    const settingsLowPowerCheckbox = document.getElementById('settingsLowPowerCheckbox');
    const settingsPuzzlePerformanceCheckbox = document.getElementById('settingsPuzzlePerformanceCheckbox');
    const settingsLoadLimitCheckbox = document.getElementById('settingsLoadLimitCheckbox');
    const settingsPreloadSelect = document.getElementById('settingsPreloadSelect');
    const settingsDeveloperModeCheckbox = document.getElementById('settingsDeveloperModeCheckbox');
    const settingsClearCacheBtn = document.getElementById('settingsClearCacheBtn');

    const settingsMinDurationEnabledCheckbox = document.getElementById('settingsMinDurationEnabledCheckbox');
    const settingsMinDurationContainer = document.getElementById('settingsMinDurationContainer');
    const settingsMinDurationInput = document.getElementById('settingsMinDurationInput');
    const durationPresetBtns = document.querySelectorAll('.duration-preset-btn');

    // Вспомогательная функция для обновления кнопок колонок
    function updateColumnsSelectorUI(cols, isCustom) {
        if (!settingsColumnsGroup) return;
        const maxAllowed = getMaxAllowedColumns();
        const buttons = settingsColumnsGroup.querySelectorAll('.col-btn');
        buttons.forEach(btn => {
            const dataCols = btn.getAttribute('data-cols');
            if (dataCols === (cols ? cols.toString() : '1')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
            const exceedsScreen = parseInt(dataCols, 10) > maxAllowed;
            btn.classList.toggle('col-btn-unavailable', exceedsScreen);
            btn.title = exceedsScreen ? `При такой ширине экрана отображается не больше ${maxAllowed} колонок` : '';
        });

        const numCols = parseInt(cols, 10) || 1;
        const optWarning = document.getElementById('columnsOptWarning');
        const optNote = document.getElementById('columnsOptNote');
        if (optWarning) optWarning.style.display = numCols >= 2 ? 'inline-flex' : 'none';
        if (optNote) optNote.style.display = numCols >= 2 ? 'block' : 'none';
    }

    // Настройки, помеченные бейджем "(Только для ПК)", управляют эффектами
    // наведения мышью — на телефоне/планшете без курсора они просто ничего
    // не делают. Раньше их можно было покрутить и ничего не заметить, что
    // выглядит как будто настройка сломана. body.can-hover — тот же флаг,
    // что main.js использует для CSS :hover/:active по всему сайту (снимается
    // с body при первом touchstart), так что источник истины один и тот же.
    function applyPcOnlyDisabledState() {
        const isPcLike = document.body.classList.contains('can-hover');
        const pcOnlyIds = [
            'settingsHoverSelect',
            'settingsCardGlowInput', 'settingsCardGlowManual',
            'settingsCardTransitionInput', 'settingsCardTransitionManual',
            'settingsTagsOnHoverCheckbox'
        ];
        pcOnlyIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !isPcLike;
        });

        // Затемняем целиком весь блок настройки, а не только сам ползунок/
        // переключатель — иначе неясно, почему конкретно это поле серое.
        // Кнопку "!" (info-btn) из затемнения исключаем — объяснение, почему
        // настройка недоступна, должно оставаться читаемым и нажимаемым.
        const pcOnlyOptionIds = ['pcOnlyHoverEffectOption', 'pcOnlyGlowOption', 'pcOnlyTransitionOption', 'pcOnlyTagsHoverOption'];
        pcOnlyOptionIds.forEach(id => {
            const optionEl = document.getElementById(id);
            if (optionEl) optionEl.classList.toggle('pc-only-disabled', !isPcLike);
        });
    }

    function updateDurationContainerUI(enabled) {
        if (settingsMinDurationContainer) {
            settingsMinDurationContainer.style.opacity = enabled ? '1' : '0.4';
            settingsMinDurationContainer.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    }

    function updateDurationPresetUI(val) {
        document.querySelectorAll('.duration-preset-btn').forEach(btn => {
            const btnVal = parseInt(btn.getAttribute('data-val'), 10);
            if (btnVal === val) {
                btn.style.background = 'var(--accent)';
                btn.style.color = '#fff';
                btn.style.borderColor = 'var(--accent)';
                btn.style.fontWeight = '600';
            } else {
                btn.style.background = 'var(--glass-bg)';
                btn.style.color = 'rgba(255,255,255,0.8)';
                btn.style.borderColor = 'var(--glass-border)';
                btn.style.fontWeight = 'normal';
            }
        });
    }

    function handleDurationChange(val) {
        if (isNaN(val) || val < 0) val = 0;
        if (settingsMinDurationInput) {
            settingsMinDurationInput.value = val;
            setRangeGradient(settingsMinDurationInput);
        }
        localStorage.setItem('r34_min_duration', val.toString());
        updateDurationPresetUI(val);
        
        if (window.gallery && typeof window.gallery.applyDurationFilter === 'function') {
            window.gallery.applyDurationFilter();
        }
    }

    function updateLikesGroupVisibility() {
        const sortBy = settingsSortSelect ? settingsSortSelect.value : currentSort;
        const combineCheckbox = document.getElementById('settingsCombineRandomLikesCheckbox');
        const combineGroup = document.getElementById('settingsCombineRandomLikesGroup');
        
        if (combineCheckbox) {
            if (sortBy === 'random') {
                combineCheckbox.disabled = false;
                if (combineGroup) {
                    combineGroup.style.opacity = '1';
                    combineGroup.style.pointerEvents = 'auto';
                }
            } else {
                combineCheckbox.disabled = true;
                combineCheckbox.checked = false;
                localStorage.setItem('r34_combine_random_likes', 'false');
                if (combineGroup) {
                    // 0.4 на тёмном фоне почти не читается, а строка при этом
                    // остаётся на виду — пользователь видит нечитаемый текст и
                    // не понимает, настройка сломана или просто недоступна.
                    combineGroup.style.opacity = '0.6';
                    combineGroup.style.pointerEvents = 'none';
                }
            }
        }

        const combineEnabled = combineCheckbox ? combineCheckbox.checked : (localStorage.getItem('r34_combine_random_likes') === 'true');
        
        if (settingsLikesGroup) {
            if (sortBy === 'likes' || (sortBy === 'random' && combineEnabled)) {
                settingsLikesGroup.style.display = 'flex';
            } else {
                settingsLikesGroup.style.display = 'none';
            }
        }
    }

    
        // iOS-подобное открытие настроек: запоминаем центр иконки-шестерёнки
        // как точку раскрытия карточки (переменные --gear-x/--gear-y читает
        // search.css: transform-origin у .settings-modal-card) и запускаем
        // прокрутку самой иконки — окно как будто вылетает из шестерёнки.
        const prepareSettingsFlyOut = () => {
            const gearSvg = settingsBtn.querySelector('svg');
            const card = settingsModal.querySelector('.settings-modal-card');
            if (gearSvg && card) {
                const gearRect = gearSvg.getBoundingClientRect();
                const cardRect = card.getBoundingClientRect();
                // Замеряем карточку ДО открытия: она уже в лэйауте
                // (visibility:hidden не снимает раскладку). Важно: закрытая
                // карточка сжата в точку (scale 0.07), и getBoundingClientRect
                // отдаёт УЖЕ уменьшенный прямоугольник — если брать его левый
                // верхний угол, точка вылета уезжает примерно на половину
                // карточки. Поэтому берём её настоящий размер из offsetWidth/
                // offsetHeight (они не зависят от transform) и восстанавливаем
                // угол от центра видимого прямоугольника — он совпадает с
                // центром раскладки.
                const centerX = cardRect.left + cardRect.width / 2;
                const centerY = cardRect.top + cardRect.height / 2;
                if (cardRect.width > 0 && cardRect.height > 0) {
                    const left = centerX - card.offsetWidth / 2;
                    const top = centerY - card.offsetHeight / 2;
                    settingsModal.style.setProperty('--gear-x', Math.round(gearRect.left + gearRect.width / 2 - left) + 'px');
                    settingsModal.style.setProperty('--gear-y', Math.round(gearRect.top + gearRect.height / 2 - top) + 'px');
                }
            }
            // Перезапуск прокрутки даже при быстрых повторных кликах
            settingsBtn.classList.remove('gear-spin');
            void settingsBtn.offsetWidth;
            settingsBtn.classList.add('gear-spin');
            // Снимаем класс после конца прокрутки (иначе висит до следующего
            // клика). На устройствах без вибрации navigator.vibrate нет —
            // молча пропускаем.
            if (gearSvg) {
                gearSvg.addEventListener('animationend', () => settingsBtn.classList.remove('gear-spin'), { once: true });
            }
            try {
                if (navigator.vibrate) navigator.vibrate(12);
            } catch (e) { /* хаптика опциональна */ }
        };

        // 1. Открытие/закрытие модального окна настроек
        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                // Пока открыта модалка, прокрутка страницы под ней блокируется
                // (overflow: hidden + height: 100vh в search.css), из-за чего
                // scrollY обнуляется — позицию запоминаем заранее.
                rememberScroll('page');
                prepareSettingsFlyOut();
                // Обновляем SafeScreen в настройках
                if (window.safeScreen) {
                    const hkDisp = document.getElementById('safeScreenHotkeyDisplay');
                    if (hkDisp) hkDisp.textContent = window.safeScreen.formatHotkey();
                    const flList = document.getElementById('safeScreenFileList');
                    if (flList) window.safeScreen.renderFileListContainer(flList);
                }
    
                // Синхронизируем текущие значения перед показом
                
                // Сортировка
                settingsSortSelect.value = currentSort;
                const savedMin = localStorage.getItem('r34_min_likes');
                settingsMinLikesInput.value = savedMin !== null ? savedMin : '0';
    
                // Совместить случайный поиск с лайками
                const settingsCombineRandomLikesCheckbox = document.getElementById('settingsCombineRandomLikesCheckbox');
                if (settingsCombineRandomLikesCheckbox) {
                    settingsCombineRandomLikesCheckbox.checked = localStorage.getItem('r34_combine_random_likes') === 'true';
                }
    
                // Продвинутая настройка: минимальная длительность видео
                const settingsMinDurationEnabledCheckbox = document.getElementById('settingsMinDurationEnabledCheckbox');
                const settingsMinDurationContainer = document.getElementById('settingsMinDurationContainer');
                const settingsMinDurationInput = document.getElementById('settingsMinDurationInput');
                
                const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
                if (settingsMinDurationEnabledCheckbox) {
                    settingsMinDurationEnabledCheckbox.checked = isDurationEnabled;
                }
                if (typeof updateDurationContainerUI === 'function') {
                    updateDurationContainerUI(isDurationEnabled);
                }
                if (settingsMinDurationInput) {
                    const savedDuration = localStorage.getItem('r34_min_duration');
                    const val = (savedDuration !== null && !isNaN(parseInt(savedDuration, 10)) && parseInt(savedDuration, 10) > 0) ? parseInt(savedDuration, 10) : 30;
                    settingsMinDurationInput.value = val;
                    if (savedDuration === null || isNaN(parseInt(savedDuration, 10)) || parseInt(savedDuration, 10) <= 0) {
                        localStorage.setItem('r34_min_duration', val.toString());
                    }
                    if (typeof updateDurationPresetUI === 'function') {
                        updateDurationPresetUI(val);
                    }
                }
    
                updateLikesGroupVisibility();
                applyPcOnlyDisabledState();

                // Колонки
                const savedCols = localStorage.getItem('r34_gallery_cols') || '1';
                const savedIsCustom = localStorage.getItem('r34_gallery_is_custom') === 'true';
                updateColumnsSelectorUI(savedCols, savedIsCustom);
                
                // HD качество фото — только синхронизация галочки. Сам обработчик
                // change навешан один раз ниже (секция "HD Checkbox"), а не здесь:
                // раньше он дублировался при каждом открытии настроек и копил
                // слушатели.
                settingsHdCheckbox.checked = localStorage.getItem('r34_hd_enabled') === 'true';
                
                if (settingsOnlyGifsCheckbox) {
                    settingsOnlyGifsCheckbox.checked = localStorage.getItem('r34_only_gifs') === 'true';
                }
                settingsAutoSlideCheckbox.checked = localStorage.getItem('r34_auto_slide') !== 'false';
                if (settingsAutoVideoSlideCheckbox) {
                    settingsAutoVideoSlideCheckbox.checked = localStorage.getItem('r34_auto_video_slide') !== 'false';
                }
                const settingsVrModeCheckboxSync = document.getElementById('settingsVrModeCheckbox');
                if (settingsVrModeCheckboxSync) {
                    settingsVrModeCheckboxSync.checked = localStorage.getItem('r34_vr_mode_enabled') === 'true';
                }
                settingsLongImageCheckbox.checked = localStorage.getItem('r34_long_image_protection') !== 'false';
                if (settingsLowPowerCheckbox) {
                    settingsLowPowerCheckbox.checked = localStorage.getItem('r34_low_power_mode') === 'true';
                }
                if (settingsPuzzlePerformanceCheckbox) {
                    settingsPuzzlePerformanceCheckbox.checked = localStorage.getItem('r34_puzzle_perf_mode') === 'true';
                }
    
                if (settingsLoadLimitCheckbox) {
                    settingsLoadLimitCheckbox.checked = localStorage.getItem('r34_load_limit_enabled') === 'true';
                }
                
                // Save Data — только синхронизация галочки. Обработчик change
                // навешан один раз ниже (секция "Save Data Checkbox").
                const settingsSaveDataCheckbox = document.getElementById('settingsSaveDataCheckbox');
                if (settingsSaveDataCheckbox) {
                    settingsSaveDataCheckbox.checked = localStorage.getItem('r34_save_data') === 'true';
                }
                if (settingsPreloadSelect) {
                    settingsPreloadSelect.value = localStorage.getItem('r34_preload_mode') || 'near';
                }
                const settingsScrollModeSelect = document.getElementById('settingsScrollModeSelect');
                if (settingsScrollModeSelect) {
                    settingsScrollModeSelect.value = localStorage.getItem('r34_scroll_mode') || 'infinite';
                }
                if (settingsDeveloperModeCheckbox) {
                    settingsDeveloperModeCheckbox.checked = localStorage.getItem('r34_dev_mode') === 'true';
                }
    
    
                // Turso sync settings
                const settingsTursoSyncCheckbox = document.getElementById('settingsTursoSyncCheckbox');
                const settingsTursoUrl = document.getElementById('settingsTursoUrl');
                const settingsTursoToken = document.getElementById('settingsTursoToken');
                
                if (settingsTursoSyncCheckbox) {
                    settingsTursoSyncCheckbox.checked = localStorage.getItem('r34_turso_sync_enabled') === 'true';
                }
                if (settingsTursoUrl) {
                    settingsTursoUrl.value = localStorage.getItem('r34_turso_url') || '';
                }
                if (settingsTursoToken) {
                    settingsTursoToken.value = localStorage.getItem('r34_turso_token') || '';
                }
    
                // Синхронизируем вкладку на базовую по умолчанию при каждом открытии
                const tabBasicBtn = document.getElementById('settings-tab-basic');
                const tabAdvBtn = document.getElementById('settings-tab-advanced');
                const contentBasic = document.getElementById('settings-content-basic');
                const contentAdv = document.getElementById('settings-content-advanced');
                if (tabBasicBtn && tabAdvBtn && contentBasic && contentAdv) {
                    tabBasicBtn.classList.add('active');
                    tabBasicBtn.style.color = 'var(--accent)';
                    tabBasicBtn.style.borderBottomColor = 'var(--accent)';
                    tabAdvBtn.classList.remove('active');
                    tabAdvBtn.style.color = 'rgba(255, 255, 255, 0.5)';
                    tabAdvBtn.style.borderBottomColor = 'transparent';
                    contentBasic.style.display = 'flex';
                    contentAdv.style.display = 'none';
                }
    
                // Hide settingsResetBtn by default on open (since basic tab is active)
                const resetBtnOnOpen = document.getElementById('settingsResetBtn');
                if (resetBtnOnOpen) {
                    resetBtnOnOpen.style.display = 'none';
                }
    
                // Синхронизация продвинутых настроек
                // 1. Акцентный цвет (кружки + пикер + ручное поле разом)
                syncAccentControls();
    
                // 2. Фон интерфейса
                syncBgControls();
    
                // 3. Скругление углов
                const settingsRadiusInput = document.getElementById('settingsRadiusInput');
                const settingsRadiusValue = document.getElementById('settingsRadiusValue');
                const settingsRadiusManual = document.getElementById('settingsRadiusManual');
                const r = localStorage.getItem('r34_media_radius') || '20';
                if (settingsRadiusInput && settingsRadiusValue) {
                    settingsRadiusInput.value = r;
                    settingsRadiusValue.textContent = r + 'px';
                    setRangeGradient(settingsRadiusInput);
                }
                if (settingsRadiusManual) {
                    settingsRadiusManual.value = r;
                }
    
                // 4. Промежуток
                const settingsGapInput = document.getElementById('settingsGapInput');
                const settingsGapValue = document.getElementById('settingsGapValue');
                const settingsGapManual = document.getElementById('settingsGapManual');
                const g = localStorage.getItem('r34_media_gap') || '24';
                if (settingsGapInput && settingsGapValue) {
                    settingsGapInput.value = g;
                    settingsGapValue.textContent = g + 'px';
                    setRangeGradient(settingsGapInput);
                }
                if (settingsGapManual) {
                    settingsGapManual.value = g;
                }
    
                // 5. Минимальная ширина колонки
                const settingsColWidthInput = document.getElementById('settingsColWidthInput');
                const settingsColWidthValue = document.getElementById('settingsColWidthValue');
                const settingsColWidthManual = document.getElementById('settingsColWidthManual');
                const w = localStorage.getItem('r34_col_width') || '300';
                if (settingsColWidthInput && settingsColWidthValue) {
                    settingsColWidthInput.value = w;
                    settingsColWidthValue.textContent = w + 'px';
                    setRangeGradient(settingsColWidthInput);
                }
                if (settingsColWidthManual) {
                    settingsColWidthManual.value = w;
                }
    
                // Принудительные размеры
                const settingsForcedWidth = document.getElementById('settingsForcedWidth');
                const settingsForcedHeight = document.getElementById('settingsForcedHeight');
                if (settingsForcedWidth) {
                    settingsForcedWidth.value = localStorage.getItem('r34_forced_width') || '';
                }
                if (settingsForcedHeight) {
                    settingsForcedHeight.value = localStorage.getItem('r34_forced_height') || '';
                }
    
                // 6. Эффект наведения
                const settingsHoverSelect = document.getElementById('settingsHoverSelect');
                if (settingsHoverSelect) {
                    settingsHoverSelect.value = localStorage.getItem('r34_hover_style') || 'glow';
                }
    
                // Поведение клика по тегу
                const settingsTagClickBehaviorSelect = document.getElementById('settingsTagClickBehaviorSelect');
                if (settingsTagClickBehaviorSelect) {
                    settingsTagClickBehaviorSelect.value = localStorage.getItem('r34_tag_click_behavior') || 'default';
                }
    
                // 7. Шрифт
                const settingsFontSelect = document.getElementById('settingsFontSelect');
                const settingsFontManual = document.getElementById('settingsFontManual');
                const currentFont = localStorage.getItem('r34_font_style') || 'sans';
                if (settingsFontSelect) {
                    if (fontPresets[currentFont]) {
                        settingsFontSelect.value = currentFont;
                    } else {
                        settingsFontSelect.value = 'sans';
                    }
                }
                if (settingsFontManual) {
                    settingsFontManual.value = currentFont;
                }
    
                const settingsAutoSlideInterval = document.getElementById('settingsAutoSlideInterval');
                if (settingsAutoSlideInterval) {
                    settingsAutoSlideInterval.value = localStorage.getItem('r34_auto_slide_interval') || '5';
                }
    
                // API Settings
                const apiLimit = localStorage.getItem('r34_api_limit') || '40';
                const settingsApiLimitInput = document.getElementById('settingsApiLimitInput');
                const settingsApiLimitManual = document.getElementById('settingsApiLimitManual');
                const settingsApiLimitValue = document.getElementById('settingsApiLimitValue');
                if (settingsApiLimitInput) {
                    settingsApiLimitInput.value = apiLimit;
                    setRangeGradient(settingsApiLimitInput);
                }
                if (settingsApiLimitManual) settingsApiLimitManual.value = apiLimit;
                if (settingsApiLimitValue) settingsApiLimitValue.textContent = apiLimit;
    
                const apiTimeout = localStorage.getItem('r34_api_timeout') || '15';
                const settingsApiTimeoutInput = document.getElementById('settingsApiTimeoutInput');
                const settingsApiTimeoutManual = document.getElementById('settingsApiTimeoutManual');
                const settingsApiTimeoutValue = document.getElementById('settingsApiTimeoutValue');
                if (settingsApiTimeoutInput) {
                    settingsApiTimeoutInput.value = apiTimeout;
                    setRangeGradient(settingsApiTimeoutInput);
                }
                if (settingsApiTimeoutManual) settingsApiTimeoutManual.value = apiTimeout;
                if (settingsApiTimeoutValue) settingsApiTimeoutValue.textContent = apiTimeout + 'с';
    
                const apiRetries = localStorage.getItem('r34_api_retries') || '3';
                const settingsApiRetriesInput = document.getElementById('settingsApiRetriesInput');
                const settingsApiRetriesManual = document.getElementById('settingsApiRetriesManual');
                const settingsApiRetriesValue = document.getElementById('settingsApiRetriesValue');
                if (settingsApiRetriesInput) {
                    settingsApiRetriesInput.value = apiRetries;
                    setRangeGradient(settingsApiRetriesInput);
                }
                if (settingsApiRetriesManual) settingsApiRetriesManual.value = apiRetries;
                if (settingsApiRetriesValue) settingsApiRetriesValue.textContent = apiRetries;
    
                const apiRetryDelay = localStorage.getItem('r34_api_retry_delay') || '2';
                const settingsApiRetryDelayInput = document.getElementById('settingsApiRetryDelayInput');
                const settingsApiRetryDelayManual = document.getElementById('settingsApiRetryDelayManual');
                const settingsApiRetryDelayValue = document.getElementById('settingsApiRetryDelayValue');
                if (settingsApiRetryDelayInput) {
                    settingsApiRetryDelayInput.value = apiRetryDelay;
                    setRangeGradient(settingsApiRetryDelayInput);
                }
                if (settingsApiRetryDelayManual) settingsApiRetryDelayManual.value = apiRetryDelay;
                if (settingsApiRetryDelayValue) settingsApiRetryDelayValue.textContent = apiRetryDelay + 'с';
    
                const cardTagsDisplay = localStorage.getItem('r34_card_tags_display') || 'true';
                const settingsCardTagsCheckbox = document.getElementById('settingsCardTagsCheckbox');
                if (settingsCardTagsCheckbox) {
                    settingsCardTagsCheckbox.checked = cardTagsDisplay === 'true';
                }
    
                const baseFontSize = localStorage.getItem('r34_base_font_size') || '16';
                const settingsBaseFontInput = document.getElementById('settingsBaseFontInput');
                const settingsBaseFontManual = document.getElementById('settingsBaseFontManual');
                const settingsBaseFontValue = document.getElementById('settingsBaseFontValue');
                if (settingsBaseFontInput) {
                    settingsBaseFontInput.value = baseFontSize;
                    setRangeGradient(settingsBaseFontInput);
                }
                if (settingsBaseFontManual) settingsBaseFontManual.value = baseFontSize;
                if (settingsBaseFontValue) settingsBaseFontValue.textContent = baseFontSize + 'px';
    
                const scrollbarWidth = localStorage.getItem('r34_scrollbar_width') || '8';
                const settingsScrollbarWidthInput = document.getElementById('settingsScrollbarWidthInput');
                const settingsScrollbarWidthManual = document.getElementById('settingsScrollbarWidthManual');
                const settingsScrollbarWidthValue = document.getElementById('settingsScrollbarWidthValue');
                if (settingsScrollbarWidthInput) {
                    settingsScrollbarWidthInput.value = scrollbarWidth;
                    setRangeGradient(settingsScrollbarWidthInput);
                }
                if (settingsScrollbarWidthManual) settingsScrollbarWidthManual.value = scrollbarWidth;
                if (settingsScrollbarWidthValue) settingsScrollbarWidthValue.textContent = scrollbarWidth + 'px';
    
                const scrollbarThumbColor = localStorage.getItem('r34_scrollbar_thumb_color') || 'rgba(255, 255, 255, 0.16)';
                const settingsScrollbarColorPicker = document.getElementById('settingsScrollbarColorPicker');
                const settingsScrollbarColorManual = document.getElementById('settingsScrollbarColorManual');
                if (settingsScrollbarColorPicker) {
                    settingsScrollbarColorPicker.value = extractHexColor(scrollbarThumbColor);
                }
                if (settingsScrollbarColorManual) {
                    settingsScrollbarColorManual.value = scrollbarThumbColor;
                }
    
                const gifAutoplay = localStorage.getItem('r34_gif_autoplay') === 'true';
                const videoLoop = localStorage.getItem('r34_video_loop') !== 'false';
                const settingsVideoLoopCheckbox = document.getElementById('settingsVideoLoopCheckbox');
                if (settingsVideoLoopCheckbox) {
                    settingsVideoLoopCheckbox.checked = videoLoop;
                }
    
                const defaultVolume = localStorage.getItem('r34_default_volume') || '50';
                const settingsDefaultVolumeInput = document.getElementById('settingsDefaultVolumeInput');
                const settingsDefaultVolumeManual = document.getElementById('settingsDefaultVolumeManual');
                const settingsDefaultVolumeValue = document.getElementById('settingsDefaultVolumeValue');
                if (settingsDefaultVolumeInput) {
                    settingsDefaultVolumeInput.value = defaultVolume;
                    setRangeGradient(settingsDefaultVolumeInput);
                }
                if (settingsDefaultVolumeManual) settingsDefaultVolumeManual.value = defaultVolume;
                if (settingsDefaultVolumeValue) settingsDefaultVolumeValue.textContent = defaultVolume + '%';
    
                // Custom Logo Text load
                const customLogoInput = document.getElementById('settingsCustomLogoInput');
                if (customLogoInput) {
                    customLogoInput.value = localStorage.getItem('r34_custom_logo_text') || '';
                }
    
                // Card Border Width load
                const cardBorderWidthVal = localStorage.getItem('r34_card_border_width') || '1';
                const settingsCardBorderWidthInput = document.getElementById('settingsCardBorderWidthInput');
                const settingsCardBorderWidthManual = document.getElementById('settingsCardBorderWidthManual');
                const settingsCardBorderWidthValue = document.getElementById('settingsCardBorderWidthValue');
                if (settingsCardBorderWidthInput) {
                    settingsCardBorderWidthInput.value = cardBorderWidthVal;
                    setRangeGradient(settingsCardBorderWidthInput);
                }
                if (settingsCardBorderWidthManual) settingsCardBorderWidthManual.value = cardBorderWidthVal;
                if (settingsCardBorderWidthValue) settingsCardBorderWidthValue.textContent = cardBorderWidthVal + 'px';
    
                // Card Border Color load
                const cardBorderColorVal = localStorage.getItem('r34_card_border_color') || 'var(--glass-border)';
                const settingsCardBorderColorPicker = document.getElementById('settingsCardBorderColorPicker');
                const settingsCardBorderColorManual = document.getElementById('settingsCardBorderColorManual');
                if (settingsCardBorderColorPicker) {
                    settingsCardBorderColorPicker.value = extractHexColor(cardBorderColorVal);
                }
                if (settingsCardBorderColorManual) settingsCardBorderColorManual.value = cardBorderColorVal;
    
                // Card Transition Speed load
                const cardTransitionVal = localStorage.getItem('r34_card_transition_speed') || '300';
                const settingsCardTransitionInput = document.getElementById('settingsCardTransitionInput');
                const settingsCardTransitionManual = document.getElementById('settingsCardTransitionManual');
                const settingsCardTransitionValue = document.getElementById('settingsCardTransitionValue');
                if (settingsCardTransitionInput) {
                    settingsCardTransitionInput.value = cardTransitionVal;
                    setRangeGradient(settingsCardTransitionInput);
                }
                if (settingsCardTransitionManual) settingsCardTransitionManual.value = cardTransitionVal;
                if (settingsCardTransitionValue) settingsCardTransitionValue.textContent = cardTransitionVal + 'ms';
    
                // Glow intensity load
                const glowIntensityVal = localStorage.getItem('r34_card_glow_intensity') || '45';
                const settingsCardGlowInput = document.getElementById('settingsCardGlowInput');
                const settingsCardGlowManual = document.getElementById('settingsCardGlowManual');
                const settingsCardGlowValue = document.getElementById('settingsCardGlowValue');
                if (settingsCardGlowInput) {
                    settingsCardGlowInput.value = glowIntensityVal;
                    setRangeGradient(settingsCardGlowInput);
                }
                if (settingsCardGlowManual) settingsCardGlowManual.value = glowIntensityVal;
                if (settingsCardGlowValue) settingsCardGlowValue.textContent = glowIntensityVal + '%';
    
                // Tag size load
                const tagSizeVal = localStorage.getItem('r34_tag_size') || '11';
                const settingsTagSizeInput = document.getElementById('settingsTagSizeInput');
                const settingsTagSizeManual = document.getElementById('settingsTagSizeManual');
                const settingsTagSizeValue = document.getElementById('settingsTagSizeValue');
                if (settingsTagSizeInput) {
                    settingsTagSizeInput.value = tagSizeVal;
                    setRangeGradient(settingsTagSizeInput);
                }
                if (settingsTagSizeManual) settingsTagSizeManual.value = tagSizeVal;
                if (settingsTagSizeValue) settingsTagSizeValue.textContent = tagSizeVal + 'px';
    
                // Tags only on hover checkbox load
                const settingsTagsOnHoverCheckbox = document.getElementById('settingsTagsOnHoverCheckbox');
                if (settingsTagsOnHoverCheckbox) {
                    settingsTagsOnHoverCheckbox.checked = localStorage.getItem('r34_tags_only_on_hover') === 'true';
                }
    
                // Header Style select load
                const settingsHeaderStyleSelect = document.getElementById('settingsHeaderStyleSelect');
                if (settingsHeaderStyleSelect) {
                    settingsHeaderStyleSelect.value = localStorage.getItem('r34_header_style') || 'glass';
                }
    
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        document.body.classList.add('modal-open');
                        document.documentElement.classList.add('modal-open');
                        settingsModal.classList.add('open');
                        
                        // Mobile: adjust bottom padding for browser navigation bar
                        if (window.innerWidth <= 768) {
                            const modalBody = document.querySelector('.settings-modal-body');
                            if (modalBody) {
                                // Calculate bottom padding based on viewport height
                                const viewportHeight = window.innerHeight;
                                const windowHeight = window.screen.height;
                                const bottomOffset = windowHeight - viewportHeight;
                                const paddingBottom = Math.max(26, bottomOffset + 26);
                                modalBody.style.paddingBottom = paddingBottom + 'px';
                            }
                        }
                    });
                });
            });
        }
    
        // Единая точка закрытия: снять блокировку прокрутки и вернуть страницу
        // туда, где она была до открытия настроек (см. scrollState.js).
        const closeSettingsModal = () => {
            collapsePreviewFullscreen();
            settingsModal.classList.remove('open');
            if (typeof stopDemoScroll === 'function') stopDemoScroll();
            checkAndRemoveModalOpenClass();
            restoreScroll('page');
        };

        if (settingsCloseBtn && settingsModal) {
            settingsCloseBtn.addEventListener('click', () => {
                closeSettingsModal();
            });

            // Закрытие при клике по фону
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    closeSettingsModal();
                }
            });
        }
    
        // --- МОДАЛЬНОЕ ОКНО ИНСТРУКТАЖА (Tutorial Modal) ---
        const { showTutorial, closeTutorial } = initTutorialModal();
    
        // Закрытие модалок по клавише Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const tutorialModal = document.getElementById('tutorial-modal');
                if (tutorialModal && tutorialModal.classList.contains('open')) {
                    closeTutorial();
                } else if (settingsModal && settingsModal.classList.contains('open')) {
                    closeSettingsModal();
                }
            }
        });
    
        // --- ОБРАБОТЧИКИ ВКЛАДОК НАСТРОЕК (Settings modal tabs switching) ---
        const tabBtns = document.querySelectorAll('.settings-tab-btn');
        const tabPanes = document.querySelectorAll('.settings-tab-pane');
    
        if (tabBtns.length > 0) {
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    tabBtns.forEach(b => {
                        b.classList.remove('active');
                        b.style.color = 'rgba(255, 255, 255, 0.5)';
                        b.style.borderBottomColor = 'transparent';
                    });
                    tabPanes.forEach(p => p.style.display = 'none');
    
                    btn.classList.add('active');
                    btn.style.color = 'var(--accent)';
                    btn.style.borderBottomColor = 'var(--accent)';
    
                    const paneTarget = btn.getAttribute('data-pane') || btn.id.replace('tab-', 'content-');
                    const targetPane = document.getElementById(paneTarget);
                    if (targetPane) {
                        targetPane.style.display = 'flex';
                    }
    
                    if (paneTarget !== 'settings-content-advanced' && typeof stopDemoScroll === 'function') {
                        stopDemoScroll();
                    }
    
                    const rBtn = document.getElementById('settingsResetBtn');
                    if (rBtn) {
                        if (paneTarget === 'settings-content-advanced') {
                            rBtn.style.display = '';
                        } else {
                            rBtn.style.display = 'none';
                        }
                    }
    
                    // Refresh range input background gradients on tab switch
                    document.querySelectorAll('.settings-modal input[type="range"]').forEach(input => {
                        if (typeof setRangeGradient === 'function') setRangeGradient(input);
                    });
                });
            });
        }
    
        // --- ОБРАБОТЧИКИ ДИНАМИЧЕСКИХ НАСТРОЕК КАСТОМИЗАЦИИ (Customization bindings) ---
        
        // Вспомогательная функция для обновления цвета индикаторов вкладок в зависимости от акцента
        function updateTabColors() {
            const tabBasicBtn = document.getElementById('settings-tab-basic');
            const tabAdvBtn = document.getElementById('settings-tab-advanced');
            if (tabBasicBtn && tabAdvBtn) {
                if (tabBasicBtn.classList.contains('active')) {
                    tabBasicBtn.style.color = 'var(--accent)';
                    tabBasicBtn.style.borderBottomColor = 'var(--accent)';
                    tabAdvBtn.style.color = 'rgba(255, 255, 255, 0.5)';
                    tabAdvBtn.style.borderBottomColor = 'transparent';
                } else {
                    tabAdvBtn.style.color = 'var(--accent)';
                    tabAdvBtn.style.borderBottomColor = 'var(--accent)';
                    tabBasicBtn.style.color = 'rgba(255, 255, 255, 0.5)';
                    tabBasicBtn.style.borderBottomColor = 'transparent';
                }
            }
        }
    
        // 1. Акцентный цвет
        // Источник правды один — r34_theme_accent. И кружки, и пикер, и ручное
        // поле, и пресеты из режима разработчика идут через setAccent(), так что
        // они больше не перекрывают друг друга и всегда обновляют всю палитру
        // (--accent, --accent-alt, --accent-glow, --accent-rgb).
        const colorDots = document.querySelectorAll('#settingsThemeColors .theme-color-dot');
        const settingsAccentColorPicker = document.getElementById('settingsAccentColorPicker');
        const settingsAccentManual = document.getElementById('settingsAccentManual');

        const normalizeAccentHex = (value) => {
            if (typeof value !== 'string') return '';
            const hex = value.trim();
            if (!/^#([0-9a-f]{3}){1,2}$/i.test(hex)) return '';
            return hex.length === 4
                ? '#' + hex.slice(1).split('').map(c => c + c).join('').toLowerCase()
                : hex.toLowerCase();
        };

        const syncAccentControls = (value) => {
            const current = (value || localStorage.getItem('r34_theme_accent') || 'pink').trim();
            const isCustom = current.startsWith('#');
            // Кастомный цвет, совпадающий с пресетом, подсвечивает его кружок.
            const presetKey = Object.keys(colorPresets).find(
                key => colorPresets[key].accent.toLowerCase() === current.toLowerCase()
            );
            const activeKey = isCustom ? presetKey : current;

            colorDots.forEach(dot => {
                const isActive = dot.getAttribute('data-color') === activeKey;
                dot.classList.toggle('active', isActive);
                dot.style.borderColor = isActive ? '#fff' : 'transparent';
                dot.style.transform = isActive ? 'scale(1.15)' : 'scale(1)';
            });

            const hex = isCustom ? normalizeAccentHex(current) : (colorPresets[current] || colorPresets.pink).accent;
            if (settingsAccentColorPicker && hex) settingsAccentColorPicker.value = hex;
            // Не переписываем поле под курсором, пока его редактируют вручную.
            if (settingsAccentManual && document.activeElement !== settingsAccentManual) {
                settingsAccentManual.value = isCustom ? current : hex;
            }
        };

        // Клик по готовым точкам
        colorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                setAccent(dot.getAttribute('data-color'));
                syncAccentControls();
                updateTabColors();
            });
        });

        // Изменение в пикере цвета
        if (settingsAccentColorPicker) {
            settingsAccentColorPicker.addEventListener('input', () => {
                setAccent(settingsAccentColorPicker.value);
                syncAccentControls();
                updateTabColors();
            });
        }

        // Ручной ввод цвета текстом
        if (settingsAccentManual) {
            settingsAccentManual.addEventListener('input', () => {
                const hex = normalizeAccentHex(settingsAccentManual.value);
                if (!hex) return;
                setAccent(hex);
                syncAccentControls();
                updateTabColors();
            });
        }

        // Акцент могли поменять и из редактора стилей — держим контролы в курсе
        window.addEventListener('r34:accent-changed', (e) => {
            syncAccentControls(e.detail && e.detail.accent);
        });

        // Собственный фон (градиент/картинка) не выражается селектом —
        // добавляем для него отдельный пункт, а не показываем чужую тему.
        const syncBgControls = (value) => {
            const select = document.getElementById('settingsBgSelect');
            const manual = document.getElementById('settingsBgManual');
            const cur = (value || localStorage.getItem('r34_theme_bg') || 'auto').trim();
            if (select) {
                if (bgPresets[cur]) {
                    select.value = cur;
                } else {
                    let opt = select.querySelector('option[value="__custom__"]');
                    if (!opt) {
                        opt = document.createElement('option');
                        opt.value = '__custom__';
                        opt.textContent = 'Свой фон (CSS)';
                        select.appendChild(opt);
                    }
                    select.value = '__custom__';
                }
            }
            if (manual && document.activeElement !== manual) manual.value = cur;
        };

        // То же для фона: пресеты в редакторе стилей меняют тему целиком
        window.addEventListener('r34:bg-changed', (e) => {
            syncBgControls(e.detail && e.detail.bg);
        });
    
        // 2. Фон интерфейса
        const settingsBgSelect = document.getElementById('settingsBgSelect');
        const settingsBgManual = document.getElementById('settingsBgManual');
    
        if (settingsBgSelect) {
            settingsBgSelect.addEventListener('change', () => {
                const val = settingsBgSelect.value;
                // Пункт «Свой фон» — это не тема, а состояние: менять ничего
                // не нужно, значение уже в поле ручного ввода.
                if (val === '__custom__') return;
                if (settingsBgManual) settingsBgManual.value = val;
                localStorage.setItem('r34_theme_bg', val);
                debouncedApplyThemeSettings();
            });
        }
    
        if (settingsBgManual) {
            settingsBgManual.addEventListener('input', () => {
                const val = settingsBgManual.value.trim();
                if (val) {
                    localStorage.setItem('r34_theme_bg', val);
                    applyThemeSettings();
                    // Селект показывает пресет, если значение совпало,
                    // иначе — «Свой фон (CSS)».
                    syncBgControls(val);
                }
            });
        }
    
        // 3. Скругление углов
        const settingsRadiusInput = document.getElementById('settingsRadiusInput');
        const settingsRadiusValue = document.getElementById('settingsRadiusValue');
        const settingsRadiusManual = document.getElementById('settingsRadiusManual');
    
        if (settingsRadiusInput && settingsRadiusValue) {
            settingsRadiusInput.addEventListener('input', () => {
                const val = settingsRadiusInput.value;
                settingsRadiusValue.textContent = val + 'px';
                if (settingsRadiusManual) settingsRadiusManual.value = val;
                
                // Immediate visual feedback
                document.documentElement.style.setProperty('--media-radius', val + 'px');
                setRangeGradient(settingsRadiusInput);
                
                // Debounced save and full refresh
                debouncedSaveSetting('r34_media_radius', val);
            });
        }
    
        if (settingsRadiusManual) {
            settingsRadiusManual.addEventListener('input', () => {
                let val = parseInt(settingsRadiusManual.value);
                if (isNaN(val)) val = 0;
                if (val < 0) val = 0;
                if (val > 60) val = 60;
    
                if (settingsRadiusInput) {
                    settingsRadiusInput.value = Math.min(val, 32); // slider bound
                    setRangeGradient(settingsRadiusInput);
                }
                if (settingsRadiusValue) {
                    settingsRadiusValue.textContent = val + 'px';
                }
                localStorage.setItem('r34_media_radius', val);
                applyThemeSettings();
            });
        }
    
        // 4. Промежуток
        const settingsGapInput = document.getElementById('settingsGapInput');
        const settingsGapValue = document.getElementById('settingsGapValue');
        const settingsGapManual = document.getElementById('settingsGapManual');
    
        if (settingsGapInput && settingsGapValue) {
            settingsGapInput.addEventListener('input', () => {
                const val = settingsGapInput.value;
                settingsGapValue.textContent = val + 'px';
                if (settingsGapManual) settingsGapManual.value = val;
                
                // Immediate visual feedback
                document.documentElement.style.setProperty('--media-gap', val + 'px');
                setRangeGradient(settingsGapInput);
                
                debouncedSaveSetting('r34_media_gap', val);
            });
        }
    
        if (settingsGapManual) {
            settingsGapManual.addEventListener('input', () => {
                let val = parseInt(settingsGapManual.value);
                if (isNaN(val)) val = 0;
                if (val < 0) val = 0;
                if (val > 80) val = 80;
    
                if (settingsGapInput) {
                    settingsGapInput.value = Math.min(Math.max(val, 4), 40); // slider bound
                    setRangeGradient(settingsGapInput);
                }
                if (settingsGapValue) {
                    settingsGapValue.textContent = val + 'px';
                }
                localStorage.setItem('r34_media_gap', val);
                applyThemeSettings();
            });
        }
    
        // 5. Минимальная ширина колонки
        const settingsColWidthInput = document.getElementById('settingsColWidthInput');
        const settingsColWidthValue = document.getElementById('settingsColWidthValue');
        const settingsColWidthManual = document.getElementById('settingsColWidthManual');
    
        if (settingsColWidthInput && settingsColWidthValue) {
            settingsColWidthInput.addEventListener('input', () => {
                const val = settingsColWidthInput.value;
                settingsColWidthValue.textContent = val + 'px';
                if (settingsColWidthManual) settingsColWidthManual.value = val;
                
                // Immediate visual feedback
                document.documentElement.style.setProperty('--grid-col-width', val + 'px');
                setRangeGradient(settingsColWidthInput);
                
                debouncedSaveSetting('r34_col_width', val);
            });
        }
    
        if (settingsColWidthManual) {
            settingsColWidthManual.addEventListener('input', () => {
                let val = parseInt(settingsColWidthManual.value);
                if (isNaN(val)) val = 100;
                if (val < 100) val = 100;
                if (val > 600) val = 600;
    
                if (settingsColWidthInput) {
                    settingsColWidthInput.value = Math.min(Math.max(val, 100), 600); // slider bound
                    setRangeGradient(settingsColWidthInput);
                }
                if (settingsColWidthValue) {
                    settingsColWidthValue.textContent = val + 'px';
                }
                localStorage.setItem('r34_col_width', val);
                applyThemeSettings();
            });
        }
    
        // Принудительные размеры
        const settingsForcedWidth = document.getElementById('settingsForcedWidth');
        const settingsForcedHeight = document.getElementById('settingsForcedHeight');
        
        if (settingsForcedWidth) {
            settingsForcedWidth.addEventListener('input', () => {
                const val = settingsForcedWidth.value.trim();
                if (val === '' || val === '0') {
                    localStorage.removeItem('r34_forced_width');
                } else {
                    localStorage.setItem('r34_forced_width', val);
                }
                applyThemeSettings();
            });
        }
    
        if (settingsForcedHeight) {
            settingsForcedHeight.addEventListener('input', () => {
                const val = settingsForcedHeight.value.trim();
                if (val === '' || val === '0') {
                    localStorage.removeItem('r34_forced_height');
                } else {
                    localStorage.setItem('r34_forced_height', val);
                }
                applyThemeSettings();
            });
        }
    
        // 6. Эффект наведения
        const settingsHoverSelect = document.getElementById('settingsHoverSelect');
        if (settingsHoverSelect) {
            settingsHoverSelect.addEventListener('change', () => {
                localStorage.setItem('r34_hover_style', settingsHoverSelect.value);
                applyThemeSettings();
            });
        }
    
        // Поведение клика по тегу
        const settingsTagClickBehaviorSelect = document.getElementById('settingsTagClickBehaviorSelect');
        if (settingsTagClickBehaviorSelect) {
            settingsTagClickBehaviorSelect.addEventListener('change', () => {
                localStorage.setItem('r34_tag_click_behavior', settingsTagClickBehaviorSelect.value);
                if (window.tagSearch && typeof window.tagSearch.updateActiveTagsDisplay === 'function') {
                    window.tagSearch.updateActiveTagsDisplay();
                }
            });
        }
    
        // 7. Шрифт
        const settingsFontSelect = document.getElementById('settingsFontSelect');
        const settingsFontManual = document.getElementById('settingsFontManual');
    
        if (settingsFontSelect) {
            settingsFontSelect.addEventListener('change', () => {
                const val = settingsFontSelect.value;
                if (settingsFontManual) settingsFontManual.value = val;
                localStorage.setItem('r34_font_style', val);
                debouncedApplyThemeSettings();
            });
        }
    
        if (settingsFontManual) {
            settingsFontManual.addEventListener('input', () => {
                const val = settingsFontManual.value.trim();
                if (val) {
                    localStorage.setItem('r34_font_style', val);
                    applyThemeSettings();
    
                    if (settingsFontSelect) {
                        if (fontPresets[val]) {
                            settingsFontSelect.value = val;
                        } else {
                            // Оставляем без изменений
                        }
                    }
                }
            });
        }
    
        // Advanced Setting: Card tags display
        const settingsCardTagsCheckbox = document.getElementById('settingsCardTagsCheckbox');
        if (settingsCardTagsCheckbox) {
            settingsCardTagsCheckbox.addEventListener('change', () => {
                localStorage.setItem('r34_card_tags_display', settingsCardTagsCheckbox.checked ? 'true' : 'false');
                applyThemeSettings();
            });
        }
    
        // Advanced Setting: Base font size
        const settingsBaseFontInput = document.getElementById('settingsBaseFontInput');
        const settingsBaseFontManual = document.getElementById('settingsBaseFontManual');
        const settingsBaseFontValue = document.getElementById('settingsBaseFontValue');
    
        if (settingsBaseFontInput && settingsBaseFontValue) {
            settingsBaseFontInput.addEventListener('input', () => {
                const val = settingsBaseFontInput.value;
                settingsBaseFontValue.textContent = val + 'px';
                if (settingsBaseFontManual) settingsBaseFontManual.value = val;
                
                // Immediate visual feedback
                document.documentElement.style.setProperty('--base-font-size', val + 'px');
                setRangeGradient(settingsBaseFontInput);
                
                debouncedSaveSetting('r34_base_font_size', val);
            });
        }
    
        if (settingsBaseFontManual) {
            settingsBaseFontManual.addEventListener('input', () => {
                let val = parseInt(settingsBaseFontManual.value, 10);
                if (isNaN(val)) val = 16;
                if (val < 12) val = 12;
                if (val > 24) val = 24;
    
                if (settingsBaseFontInput) {
                    settingsBaseFontInput.value = val;
                    setRangeGradient(settingsBaseFontInput);
                }
                if (settingsBaseFontValue) {
                    settingsBaseFontValue.textContent = val + 'px';
                }
                localStorage.setItem('r34_base_font_size', val);
                applyThemeSettings();
            });
        }
    
        // Advanced Setting: Scrollbar width
        const settingsScrollbarWidthInput = document.getElementById('settingsScrollbarWidthInput');
        const settingsScrollbarWidthManual = document.getElementById('settingsScrollbarWidthManual');
        const settingsScrollbarWidthValue = document.getElementById('settingsScrollbarWidthValue');
    
        if (settingsScrollbarWidthInput && settingsScrollbarWidthValue) {
            settingsScrollbarWidthInput.addEventListener('input', () => {
                const val = settingsScrollbarWidthInput.value;
                settingsScrollbarWidthValue.textContent = val + 'px';
                if (settingsScrollbarWidthManual) settingsScrollbarWidthManual.value = val;
                
                // Immediate visual feedback
                document.documentElement.style.setProperty('--scrollbar-width', val + 'px');
                setRangeGradient(settingsScrollbarWidthInput);
                
                debouncedSaveSetting('r34_scrollbar_width', val);
            });
        }
    
        if (settingsScrollbarWidthManual) {
            settingsScrollbarWidthManual.addEventListener('input', () => {
                let val = parseInt(settingsScrollbarWidthManual.value, 10);
                if (isNaN(val)) val = 8;
                if (val < 0) val = 0;
                if (val > 16) val = 16;
    
                if (settingsScrollbarWidthInput) {
                    settingsScrollbarWidthInput.value = val;
                    setRangeGradient(settingsScrollbarWidthInput);
                }
                if (settingsScrollbarWidthValue) {
                    settingsScrollbarWidthValue.textContent = val + 'px';
                }
                localStorage.setItem('r34_scrollbar_width', val);
                applyThemeSettings();
            });
        }
    
        // Advanced Setting: Scrollbar color
        const settingsScrollbarColorPicker = document.getElementById('settingsScrollbarColorPicker');
        const settingsScrollbarColorManual = document.getElementById('settingsScrollbarColorManual');
    
        if (settingsScrollbarColorPicker) {
            settingsScrollbarColorPicker.addEventListener('input', () => {
                const val = settingsScrollbarColorPicker.value;
                if (settingsScrollbarColorManual) settingsScrollbarColorManual.value = val;
                localStorage.setItem('r34_scrollbar_thumb_color', val);
                debouncedApplyThemeSettings();
            });
        }
    
        if (settingsScrollbarColorManual) {
            settingsScrollbarColorManual.addEventListener('input', () => {
                const val = settingsScrollbarColorManual.value.trim();
                if (val) {
                    localStorage.setItem('r34_scrollbar_thumb_color', val);
                    debouncedApplyThemeSettings();
                    if (settingsScrollbarColorPicker) {
                        if (val.startsWith('#')) {
                            settingsScrollbarColorPicker.value = val;
                        }
                    }
                }
            });
        }
    
        // Advanced Setting: Video loop
        const settingsVideoLoopCheckbox = document.getElementById('settingsVideoLoopCheckbox');
        if (settingsVideoLoopCheckbox) {
            settingsVideoLoopCheckbox.addEventListener('change', () => {
                localStorage.setItem('r34_video_loop', settingsVideoLoopCheckbox.checked ? 'true' : 'false');
            });
        }
    
        // Advanced Setting: Default volume
        const settingsDefaultVolumeInput = document.getElementById('settingsDefaultVolumeInput');
        const settingsDefaultVolumeManual = document.getElementById('settingsDefaultVolumeManual');
        const settingsDefaultVolumeValue = document.getElementById('settingsDefaultVolumeValue');
    
        const updateVideosVolume = (val) => {
            const volFloat = (parseFloat(val) || 0) / 100;
            document.querySelectorAll('video').forEach(vid => {
                vid.volume = Math.max(0, Math.min(1, volFloat));
            });
            const previewVolumeBar = document.getElementById('previewVolumeBar');
            if (previewVolumeBar) {
                previewVolumeBar.style.width = val + '%';
            }
        };
    
        if (settingsDefaultVolumeInput && settingsDefaultVolumeValue) {
            settingsDefaultVolumeInput.addEventListener('input', () => {
                const val = settingsDefaultVolumeInput.value;
                settingsDefaultVolumeValue.textContent = val + '%';
                if (settingsDefaultVolumeManual) settingsDefaultVolumeManual.value = val;
                localStorage.setItem('r34_default_volume', val);
                setRangeGradient(settingsDefaultVolumeInput);
                updateVideosVolume(val);
            });
        }
    
        if (settingsDefaultVolumeManual) {
            settingsDefaultVolumeManual.addEventListener('input', () => {
                let val = parseInt(settingsDefaultVolumeManual.value, 10);
                if (isNaN(val)) val = 50;
                if (val < 0) val = 0;
                if (val > 100) val = 100;
    
                if (settingsDefaultVolumeInput) {
                    settingsDefaultVolumeInput.value = val;
                    setRangeGradient(settingsDefaultVolumeInput);
                }
                if (settingsDefaultVolumeValue) {
                    settingsDefaultVolumeValue.textContent = val + '%';
                }
                localStorage.setItem('r34_default_volume', val);
                updateVideosVolume(val);
            });
        }
    
        // --- ОБРАБОТЧИКИ ДЛЯ НОВЫХ ПРОДВИНУТЫХ НАСТРОЕК (Advanced site customization listeners) ---
        
        // 1. Свой логотип / заголовок
        const settingsCustomLogoInput = document.getElementById('settingsCustomLogoInput');
        if (settingsCustomLogoInput) {
            settingsCustomLogoInput.addEventListener('input', () => {
                localStorage.setItem('r34_custom_logo_text', settingsCustomLogoInput.value);
                debouncedApplyThemeSettings();
            });
        }
    
        // 2. Толщина рамки карточки
        const settingsCardBorderWidthInput = document.getElementById('settingsCardBorderWidthInput');
        const settingsCardBorderWidthManual = document.getElementById('settingsCardBorderWidthManual');
        const settingsCardBorderWidthValue = document.getElementById('settingsCardBorderWidthValue');
        if (settingsCardBorderWidthInput && settingsCardBorderWidthValue) {
            settingsCardBorderWidthInput.addEventListener('input', () => {
                const val = settingsCardBorderWidthInput.value;
                settingsCardBorderWidthValue.textContent = val + 'px';
                if (settingsCardBorderWidthManual) settingsCardBorderWidthManual.value = val;
                
                // Immediate visual feedback
                document.documentElement.style.setProperty('--card-border-width', val + 'px');
                setRangeGradient(settingsCardBorderWidthInput);
                
                debouncedSaveSetting('r34_card_border_width', val);
            });
        }
        if (settingsCardBorderWidthManual) {
            settingsCardBorderWidthManual.addEventListener('input', () => {
                let val = parseInt(settingsCardBorderWidthManual.value, 10);
                if (isNaN(val)) val = 1;
                if (val < 0) val = 0;
                if (val > 8) val = 8;
                if (settingsCardBorderWidthInput) {
                    settingsCardBorderWidthInput.value = val;
                    setRangeGradient(settingsCardBorderWidthInput);
                }
                if (settingsCardBorderWidthValue) {
                    settingsCardBorderWidthValue.textContent = val + 'px';
                }
                localStorage.setItem('r34_card_border_width', val);
                debouncedApplyThemeSettings();
            });
        }
    
        // 3. Цвет рамки карточки
        const settingsCardBorderColorPicker = document.getElementById('settingsCardBorderColorPicker');
        const settingsCardBorderColorManual = document.getElementById('settingsCardBorderColorManual');
        if (settingsCardBorderColorPicker) {
            settingsCardBorderColorPicker.addEventListener('input', () => {
                const val = settingsCardBorderColorPicker.value;
                if (settingsCardBorderColorManual) settingsCardBorderColorManual.value = val;
                localStorage.setItem('r34_card_border_color', val);
                debouncedApplyThemeSettings();
            });
        }
        if (settingsCardBorderColorManual) {
            settingsCardBorderColorManual.addEventListener('input', () => {
                const val = settingsCardBorderColorManual.value.trim();
                if (val) {
                    localStorage.setItem('r34_card_border_color', val);
                    debouncedApplyThemeSettings();
                    if (settingsCardBorderColorPicker && val.startsWith('#')) {
                        settingsCardBorderColorPicker.value = val;
                    }
                }
            });
        }
    
        // 4. Скорость анимации карточек
        const settingsCardTransitionInput = document.getElementById('settingsCardTransitionInput');
        const settingsCardTransitionManual = document.getElementById('settingsCardTransitionManual');
        const settingsCardTransitionValue = document.getElementById('settingsCardTransitionValue');
        if (settingsCardTransitionInput && settingsCardTransitionValue) {
            settingsCardTransitionInput.addEventListener('input', () => {
                const val = settingsCardTransitionInput.value;
                settingsCardTransitionValue.textContent = val + 'ms';
                if (settingsCardTransitionManual) settingsCardTransitionManual.value = val;
                
                // Immediate visual feedback
                document.documentElement.style.setProperty('--card-transition-speed', val + 'ms');
                setRangeGradient(settingsCardTransitionInput);
                
                debouncedSaveSetting('r34_card_transition_speed', val);
            });
        }
        if (settingsCardTransitionManual) {
            settingsCardTransitionManual.addEventListener('input', () => {
                let val = parseInt(settingsCardTransitionManual.value, 10);
                if (isNaN(val)) val = 300;
                if (val < 100) val = 100;
                if (val > 1000) val = 1000;
                if (settingsCardTransitionInput) {
                    settingsCardTransitionInput.value = val;
                    setRangeGradient(settingsCardTransitionInput);
                }
                if (settingsCardTransitionValue) {
                    settingsCardTransitionValue.textContent = val + 'ms';
                }
                localStorage.setItem('r34_card_transition_speed', val);
                debouncedApplyThemeSettings();
            });
        }
    
        // 5. Интенсивность свечения (Shadow)
        const settingsCardGlowInput = document.getElementById('settingsCardGlowInput');
        const settingsCardGlowManual = document.getElementById('settingsCardGlowManual');
        const settingsCardGlowValue = document.getElementById('settingsCardGlowValue');
        if (settingsCardGlowInput && settingsCardGlowValue) {
            settingsCardGlowInput.addEventListener('input', () => {
                const val = settingsCardGlowInput.value;
                settingsCardGlowValue.textContent = val + '%';
                if (settingsCardGlowManual) settingsCardGlowManual.value = val;
                
                setRangeGradient(settingsCardGlowInput);
                debouncedSaveSetting('r34_card_glow_intensity', val);
            });
        }
        if (settingsCardGlowManual) {
            settingsCardGlowManual.addEventListener('input', () => {
                let val = parseInt(settingsCardGlowManual.value, 10);
                if (isNaN(val)) val = 45;
                if (val < 0) val = 0;
                if (val > 100) val = 100;
                if (settingsCardGlowInput) {
                    settingsCardGlowInput.value = val;
                    setRangeGradient(settingsCardGlowInput);
                }
                if (settingsCardGlowValue) {
                    settingsCardGlowValue.textContent = val + '%';
                }
                localStorage.setItem('r34_card_glow_intensity', val);
                debouncedApplyThemeSettings();
            });
        }
    
        // 6. Размер шрифта тегов
        const settingsTagSizeInput = document.getElementById('settingsTagSizeInput');
        const settingsTagSizeManual = document.getElementById('settingsTagSizeManual');
        const settingsTagSizeValue = document.getElementById('settingsTagSizeValue');
        if (settingsTagSizeInput && settingsTagSizeValue) {
            settingsTagSizeInput.addEventListener('input', () => {
                const val = settingsTagSizeInput.value;
                settingsTagSizeValue.textContent = val + 'px';
                if (settingsTagSizeManual) settingsTagSizeManual.value = val;
                
                // Immediate visual feedback
                document.documentElement.style.setProperty('--tag-font-size', val + 'px');
                setRangeGradient(settingsTagSizeInput);
                
                debouncedSaveSetting('r34_tag_size', val);
            });
        }
        if (settingsTagSizeManual) {
            settingsTagSizeManual.addEventListener('input', () => {
                let val = parseInt(settingsTagSizeManual.value, 10);
                if (isNaN(val)) val = 11;
                if (val < 8) val = 8;
                if (val > 16) val = 16;
                if (settingsTagSizeInput) {
                    settingsTagSizeInput.value = val;
                    setRangeGradient(settingsTagSizeInput);
                }
                if (settingsTagSizeValue) {
                    settingsTagSizeValue.textContent = val + 'px';
                }
                localStorage.setItem('r34_tag_size', val);
                debouncedApplyThemeSettings();
            });
        }
    
        // 7. Скрывать теги до наведения
        const settingsTagsOnHoverCheckbox = document.getElementById('settingsTagsOnHoverCheckbox');
        if (settingsTagsOnHoverCheckbox) {
            settingsTagsOnHoverCheckbox.addEventListener('change', () => {
                localStorage.setItem('r34_tags_only_on_hover', settingsTagsOnHoverCheckbox.checked ? 'true' : 'false');
                applyThemeSettings();
            });
        }
    
        // 8. Стиль шапки поиска
        const settingsHeaderStyleSelect = document.getElementById('settingsHeaderStyleSelect');
        if (settingsHeaderStyleSelect) {
            settingsHeaderStyleSelect.addEventListener('change', () => {
                localStorage.setItem('r34_header_style', settingsHeaderStyleSelect.value);
                applyThemeSettings();
            });
        }
    
        // 9. Turso sync settings
        const settingsTursoSyncCheckbox = document.getElementById('settingsTursoSyncCheckbox');
        const settingsTursoUrl = document.getElementById('settingsTursoUrl');
        const settingsTursoToken = document.getElementById('settingsTursoToken');
        const settingsTursoSaveBtn = document.getElementById('settingsTursoSaveBtn');
        const settingsTursoStatusMsg = document.getElementById('settingsTursoStatusMsg');
        
        if (settingsTursoSyncCheckbox) {
            settingsTursoSyncCheckbox.addEventListener('change', () => {
                localStorage.setItem('r34_turso_sync_enabled', settingsTursoSyncCheckbox.checked ? 'true' : 'false');
                tursoSync.updateSettings(
                    settingsTursoSyncCheckbox.checked,
                    localStorage.getItem('r34_turso_url') || '',
                    localStorage.getItem('r34_turso_token') || ''
                );
            });
        }
        
        if (settingsTursoSaveBtn) {
            settingsTursoSaveBtn.addEventListener('click', async () => {
                const url = settingsTursoUrl ? settingsTursoUrl.value.trim() : '';
                const token = settingsTursoToken ? settingsTursoToken.value.trim() : '';
    
                settingsTursoSaveBtn.disabled = true;
                settingsTursoSaveBtn.style.opacity = '0.6';
                if (settingsTursoStatusMsg) {
                    settingsTursoStatusMsg.style.color = 'var(--accent)';
                    settingsTursoStatusMsg.textContent = 'Сохранение...';
                }
    
                // Always update local storage and tursoSync instance
                localStorage.setItem('r34_turso_url', url);
                localStorage.setItem('r34_turso_token', token);
                tursoSync.updateSettings(
                    localStorage.getItem('r34_turso_sync_enabled') === 'true',
                    url,
                    token
                );
    
                // Always save to server configuration
                await saveTursoConfigToServer(url, token);
    
                settingsTursoSaveBtn.disabled = false;
                settingsTursoSaveBtn.style.opacity = '1';
    
                if (!url || !token) {
                    if (settingsTursoStatusMsg) {
                        settingsTursoStatusMsg.style.color = 'var(--success, #10b981)';
                        settingsTursoStatusMsg.textContent = '✓ Настройки Turso очищены!';
                    }
                    return;
                }
    
                if (settingsTursoStatusMsg) {
                    settingsTursoStatusMsg.style.color = 'var(--accent)';
                    settingsTursoStatusMsg.textContent = 'Проверка соединения с Turso...';
                }
    
                const testRes = await tursoSync.testConnection(url, token);
                if (testRes.ok) {
                    if (settingsTursoStatusMsg) {
                        settingsTursoStatusMsg.style.color = 'var(--success, #10b981)';
                        settingsTursoStatusMsg.textContent = '✓ Настройки сохранены! Соединение с Turso успешно.';
                    }
                    tursoSync.initializeTables();
                } else {
                    if (settingsTursoStatusMsg) {
                        settingsTursoStatusMsg.style.color = 'var(--warning, #f59e0b)';
                        settingsTursoStatusMsg.textContent = '✓ Сохранено! (' + (testRes.error || 'проверьте параметры') + ')';
                    }
                }
            });
        }

    // --- Обработчики кликов по кнопкам колонок ---
    if (settingsColumnsGroup) {
        settingsColumnsGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('.col-btn');
            if (!btn) return;

            const colsVal = btn.getAttribute('data-cols');
            const num = parseInt(colsVal, 10);
            if (isNaN(num)) return;

            // Недоступная на этой ширине экрана кнопка не выбирается вообще —
            // только тост с объяснением. Раньше клик всё равно применял и
            // подсвечивал значение (просто урезанное при отрисовке), что
            // выглядело так, будто выбор сработал, хотя внешне ничего не
            // менялось.
            if (btn.classList.contains('col-btn-unavailable')) {
                const maxAllowed = getMaxAllowedColumns();
                OnlineUI.showToast(`Ваш экран слишком мал для ${num} колонок — сейчас доступно максимум ${maxAllowed}`, 'warning');
                return;
            }

            if (window.gallery && typeof window.gallery.setColumns === 'function') {
                window.gallery.setColumns(num, false);
            }
            updateColumnsSelectorUI(colsVal, false);
        });
    }

    // Инициализация колонок при первом запуске
    const initCols = localStorage.getItem('r34_gallery_cols') || '1';
    const initIsCustom = localStorage.getItem('r34_gallery_is_custom') === 'true';
    if (window.gallery && typeof window.gallery.setColumns === 'function') {
        window.gallery.setColumns(parseInt(initCols, 10), initIsCustom);
    }
    updateColumnsSelectorUI(initCols, initIsCustom);
    applyPcOnlyDisabledState();

    // Порог, после которого экран урезает число колонок (gallery.js /
    // favoritesManager.js), зависит от ширины окна — при повороте телефона
    // или изменении размера окна на ПК какая-то из кнопок 1-5 может
    // перестать/начать помещаться, так что список disabled-кнопок держим
    // актуальным, а не только на момент открытия настроек.
    window.addEventListener('resize', debounce(() => {
        const savedCols = localStorage.getItem('r34_gallery_cols') || '1';
        const savedIsCustom = localStorage.getItem('r34_gallery_is_custom') === 'true';
        updateColumnsSelectorUI(savedCols, savedIsCustom);
    }, 200));

    // Изменение сортировки в настройках
    if (settingsSortSelect) {
        settingsSortSelect.addEventListener('change', () => {
            const val = settingsSortSelect.value;
            currentSort = val;
            setCurrentSort(val);
            localStorage.setItem('r34_current_sort', val);
            
            updateLikesGroupVisibility();
            
            if (window.galleryController) {
                window.galleryController.page = 0;
                window.galleryController.reachedEnd = false;
                window.galleryController.isInitialLoad = true;
                if (window.gallery) window.gallery.realCount = undefined;
                if (window.tagSearch) {
                    window.galleryController.immediateLoadPosts(window.tagSearch.getTagsQuery(), false);
                }
            }
        });
    }

    // Совместить случайный поиск с лайками checkbox
    const settingsCombineRandomLikesCheckbox = document.getElementById('settingsCombineRandomLikesCheckbox');
    if (settingsCombineRandomLikesCheckbox) {
        settingsCombineRandomLikesCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_combine_random_likes', settingsCombineRandomLikesCheckbox.checked ? 'true' : 'false');
            updateLikesGroupVisibility();
            
            if (currentSort === 'random' && window.galleryController && window.tagSearch) {
                window.galleryController.page = 0;
                window.galleryController.reachedEnd = false;
                window.galleryController.isInitialLoad = true;
                if (window.gallery) window.gallery.realCount = undefined;
                window.galleryController.immediateLoadPosts(window.tagSearch.getTagsQuery(), false);
            }
        });
    }

    // Изменение порога лайков
    let minLikesDebounceTimeout = null;
    if (settingsMinLikesInput) {
        settingsMinLikesInput.addEventListener('input', () => {
            let val = parseInt(settingsMinLikesInput.value, 10);
            if (isNaN(val) || val < 0) val = 0;
            localStorage.setItem('r34_min_likes', val.toString());
            
            const combineEnabled = settingsCombineRandomLikesCheckbox ? settingsCombineRandomLikesCheckbox.checked : (localStorage.getItem('r34_combine_random_likes') === 'true');
            if (currentSort === 'likes' || (currentSort === 'random' && combineEnabled)) {
                if (minLikesDebounceTimeout) clearTimeout(minLikesDebounceTimeout);
                minLikesDebounceTimeout = setTimeout(() => {
                    if (window.galleryController && window.tagSearch) {
                        window.galleryController.page = 0;
                        window.galleryController.reachedEnd = false;
                        window.galleryController.isInitialLoad = true;
                        if (window.gallery) window.gallery.realCount = undefined;
                        window.galleryController.immediateLoadPosts(window.tagSearch.getTagsQuery(), false);
                    }
                }, 800);
            }
        });

        settingsMinLikesInput.addEventListener('change', () => {
            if (minLikesDebounceTimeout) {
                clearTimeout(minLikesDebounceTimeout);
                minLikesDebounceTimeout = null;
            }
            let val = parseInt(settingsMinLikesInput.value, 10);
            if (isNaN(val) || val < 0) val = 0;
            localStorage.setItem('r34_min_likes', val.toString());
            
            const combineEnabled = settingsCombineRandomLikesCheckbox ? settingsCombineRandomLikesCheckbox.checked : (localStorage.getItem('r34_combine_random_likes') === 'true');
            if (currentSort === 'likes' || (currentSort === 'random' && combineEnabled)) {
                if (window.galleryController && window.tagSearch) {
                    window.galleryController.page = 0;
                    window.galleryController.reachedEnd = false;
                    window.galleryController.isInitialLoad = true;
                    if (window.gallery) window.gallery.realCount = undefined;
                    window.galleryController.immediateLoadPosts(window.tagSearch.getTagsQuery(), false);
                }
            }
        });
    }

    // Минимальная длительность видео
    if (settingsMinDurationEnabledCheckbox) {
        settingsMinDurationEnabledCheckbox.addEventListener('change', () => {
            const enabled = settingsMinDurationEnabledCheckbox.checked;
            localStorage.setItem('r34_min_duration_enabled', enabled ? 'true' : 'false');
            updateDurationContainerUI(enabled);
            if (window.gallery && typeof window.gallery.applyDurationFilter === 'function') {
                window.gallery.applyDurationFilter();
            }
        });
    }

    if (settingsMinDurationInput) {
        settingsMinDurationInput.addEventListener('input', () => {
            let val = parseInt(settingsMinDurationInput.value, 10);
            if (isNaN(val)) val = 0;
            handleDurationChange(val);
        });

        settingsMinDurationInput.addEventListener('change', () => {
            let val = parseInt(settingsMinDurationInput.value, 10);
            if (isNaN(val)) val = 0;
            handleDurationChange(val);
        });
    }

    if (durationPresetBtns.length > 0) {
        durationPresetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const val = parseInt(btn.getAttribute('data-val'), 10);
                handleDurationChange(val);
            });
        });
    }

    // HD Checkbox
    if (settingsHdCheckbox) {
        settingsHdCheckbox.addEventListener('change', () => {
            const isChecked = settingsHdCheckbox.checked;
            localStorage.setItem('r34_hd_enabled', isChecked ? 'true' : 'false');
            localStorage.setItem('r34_image_hd_enabled', isChecked ? 'true' : 'false');
            const settingsSaveDataCheckbox = document.getElementById('settingsSaveDataCheckbox');
            if (isChecked && settingsSaveDataCheckbox && settingsSaveDataCheckbox.checked) {
                settingsSaveDataCheckbox.checked = false;
                localStorage.setItem('r34_save_data', 'false');
            }
            // Reload all media containers to apply new quality setting
            document.querySelectorAll('.media-container').forEach(container => {
                container.dataset.loaded = "0";
                if (window.gallery && window.gallery.observer) {
                    window.gallery.observer.unobserve(container);
                    window.gallery.observer.observe(container);
                }
            });
        });
    }

    // Save Data Checkbox
    const settingsSaveDataCheckbox = document.getElementById('settingsSaveDataCheckbox');
    if (settingsSaveDataCheckbox) {
        settingsSaveDataCheckbox.addEventListener('change', () => {
            const isChecked = settingsSaveDataCheckbox.checked;
            localStorage.setItem('r34_save_data', isChecked ? 'true' : 'false');
            if (isChecked && settingsHdCheckbox && settingsHdCheckbox.checked) {
                settingsHdCheckbox.checked = false;
                localStorage.setItem('r34_hd_enabled', 'false');
                localStorage.setItem('r34_image_hd_enabled', 'false');
            }
            // Reload all media containers to apply new quality setting
            document.querySelectorAll('.media-container').forEach(container => {
                container.dataset.loaded = "0";
                if (window.gallery && window.gallery.observer) {
                    window.gallery.observer.unobserve(container);
                    window.gallery.observer.observe(container);
                }
            });
        });
    }

    // Только GIF
    if (settingsOnlyGifsCheckbox) {
        settingsOnlyGifsCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_only_gifs', settingsOnlyGifsCheckbox.checked ? 'true' : 'false');
            if (window.galleryController && window.tagSearch) {
                window.galleryController.resetAndLoad(window.tagSearch.getTagsQuery());
            }
        });
    }

    // Автослайд
    if (settingsAutoSlideCheckbox) {
        settingsAutoSlideCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_auto_slide', settingsAutoSlideCheckbox.checked ? 'true' : 'false');
            if (window.galleryApp && typeof window.galleryApp.updateAutoSlide === 'function') {
                window.galleryApp.updateAutoSlide();
            }
        });
    }

    if (settingsAutoVideoSlideCheckbox) {
        settingsAutoVideoSlideCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_auto_video_slide', settingsAutoVideoSlideCheckbox.checked ? 'true' : 'false');
        });
    }

    // VR-просмотр (экспериментально): сама настройка только включает кнопку
    // "VR" в полноэкранном режиме — всё остальное решается уже там.
    const settingsVrModeCheckbox = document.getElementById('settingsVrModeCheckbox');
    if (settingsVrModeCheckbox) {
        settingsVrModeCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_vr_mode_enabled', settingsVrModeCheckbox.checked ? 'true' : 'false');
        });
    }

    const settingsAutoSlideInterval = document.getElementById('settingsAutoSlideInterval');
    if (settingsAutoSlideInterval) {
        settingsAutoSlideInterval.addEventListener('change', () => {
            let val = parseInt(settingsAutoSlideInterval.value, 10);
            if (isNaN(val) || val < 1) val = 5;
            localStorage.setItem('r34_auto_slide_interval', val);
            if (window.galleryApp && typeof window.galleryApp.updateAutoSlide === 'function') {
                window.galleryApp.updateAutoSlide();
            }
        });
    }

    if (settingsLongImageCheckbox) {
        settingsLongImageCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_long_image_protection', settingsLongImageCheckbox.checked ? 'true' : 'false');
        });
    }

    if (settingsLowPowerCheckbox) {
        settingsLowPowerCheckbox.addEventListener('change', () => {
            const enabled = settingsLowPowerCheckbox.checked;
            localStorage.setItem('r34_low_power_mode', enabled ? 'true' : 'false');
            localStorage.setItem('r34_reduced_motion', enabled ? 'true' : 'false');
            localStorage.setItem('r34_fast_open_mode', enabled ? 'true' : 'false');
            
            applyThemeSettings();
            if (window.gallery && typeof window.gallery.updateLowPowerMode === 'function') {
                window.gallery.updateLowPowerMode(enabled);
            }
            if (window.gallery && typeof window.gallery.applyColumnsStyle === 'function') {
                window.gallery.applyColumnsStyle();
            }
        });
    }

    if (settingsPuzzlePerformanceCheckbox) {
        settingsPuzzlePerformanceCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_puzzle_perf_mode', settingsPuzzlePerformanceCheckbox.checked ? 'true' : 'false');
        });
    }

    if (settingsLoadLimitCheckbox) {
        settingsLoadLimitCheckbox.addEventListener('change', () => {
            const enabled = settingsLoadLimitCheckbox.checked;
            localStorage.setItem('r34_load_limit_enabled', enabled ? 'true' : 'false');
            if (window.gallery && typeof window.gallery.refreshCurrentView === 'function') {
                window.gallery.refreshCurrentView();
            }
        });
    }

    if (settingsPreloadSelect) {
        settingsPreloadSelect.addEventListener('change', () => {
            const value = settingsPreloadSelect.value || 'near';
            localStorage.setItem('r34_preload_mode', value);
            if (window.gallery && typeof window.gallery.setPreloadMode === 'function') {
                window.gallery.setPreloadMode(value);
            }
        });
    }

    const settingsScrollModeSelect = document.getElementById('settingsScrollModeSelect');
    if (settingsScrollModeSelect) {
        settingsScrollModeSelect.addEventListener('change', () => {
            const value = settingsScrollModeSelect.value || 'infinite';
            localStorage.setItem('r34_scroll_mode', value);
            
            if (window.galleryController) {
                window.galleryController.page = 0;
            }
            if (window.gallery) window.gallery.favoritesPage = 0;

            const modeProfileBtn = document.getElementById('modeProfileBtn');
            const isProfileActive = modeProfileBtn && modeProfileBtn.classList.contains('active');

            if (isProfileActive) {
                if (window.gallery && typeof window.gallery.renderProfileFavorites === 'function') {
                    window.gallery.renderProfileFavorites();
                }
            } else if (window.galleryController && window.tagSearch) {
                window.galleryController.immediateLoadPosts(window.tagSearch.getTagsQuery(), false);
            }
        });
    }

    if (settingsDeveloperModeCheckbox) {
        settingsDeveloperModeCheckbox.addEventListener('change', () => {
            const enabled = settingsDeveloperModeCheckbox.checked;
            localStorage.setItem('r34_dev_mode', enabled ? 'true' : 'false');
            if (window.gallery && typeof window.gallery.updateDeveloperPanel === 'function') {
                window.gallery.updateDeveloperPanel();
            }
        });
    }

    // --- АВТО-СКРОЛЛ ДЛЯ ЖИВОГО ПРЕДПРОСМОТРА (Demo scroll animation) ---
    let demoScrollInterval = null;
    let demoScrollDirection = 1; // 1 = down, -1 = up

    function startDemoScrollImpl() {
        const container = document.getElementById('settingsPreviewArea');
        if (!container) return;

        if (demoScrollInterval) {
            stopDemoScrollImpl();
            return;
        }

        const scrollBtn = document.getElementById('settingsDemoScrollBtn');
        if (scrollBtn) {
            scrollBtn.style.borderColor = 'var(--accent)';
            scrollBtn.style.color = 'var(--accent)';
            const labelSpan = scrollBtn.querySelector('span');
            if (labelSpan) labelSpan.textContent = 'Стоп скролл';
            const iconSvg = scrollBtn.querySelector('svg');
            if (iconSvg) iconSvg.innerHTML = '<rect x="4" y="4" width="4" height="16" fill="currentColor"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>';
        }

        let lastTime = performance.now();
        function step(time) {
            if (!demoScrollInterval) return;

            const container = document.getElementById('settingsPreviewArea');
            if (!container) {
                stopDemoScrollImpl();
                return;
            }

            const maxScroll = container.scrollHeight - container.clientHeight;
            if (maxScroll <= 0) {
                demoScrollInterval = requestAnimationFrame(step);
                return;
            }

            const delta = (time - lastTime) * 0.05;
            lastTime = time;

            let current = container.scrollTop;
            if (demoScrollDirection === 1) {
                current += delta;
                if (current >= maxScroll) {
                    current = maxScroll;
                    demoScrollDirection = -1;
                }
            } else {
                current -= delta;
                if (current <= 0) {
                    current = 0;
                    demoScrollDirection = 1;
                }
            }
            container.scrollTop = current;

            demoScrollInterval = requestAnimationFrame(step);
        }
        demoScrollInterval = requestAnimationFrame(step);
    }

    function stopDemoScrollImpl() {
        if (demoScrollInterval) {
            cancelAnimationFrame(demoScrollInterval);
            demoScrollInterval = null;
        }
        const scrollBtn = document.getElementById('settingsDemoScrollBtn');
        if (scrollBtn) {
            scrollBtn.style.borderColor = 'var(--glass-border)';
            scrollBtn.style.color = '';
            const labelSpan = scrollBtn.querySelector('span');
            if (labelSpan) labelSpan.textContent = 'Авто-скролл';
            const iconSvg = scrollBtn.querySelector('svg');
            if (iconSvg) iconSvg.innerHTML = '<polygon points="5 3 19 12 5 21" fill="currentColor"></polygon>';
        }
    }

    const settingsDemoScrollBtn = document.getElementById('settingsDemoScrollBtn');
    if (settingsDemoScrollBtn) {
        settingsDemoScrollBtn.addEventListener('click', () => {
            if (demoScrollInterval) {
                stopDemoScrollImpl();
            } else {
                startDemoScrollImpl();
            }
        });
    }

    // Разворачивание живого предпросмотра на весь экран. .preview-wrapper
    // внутри модалки ограничен её backdrop-filter (создаёт containing block
    // для position:fixed) и overflow:hidden — обычный position:fixed внутри
    // просто обрезался бы по рамке модалки. Поэтому на разворот сам узел
    // переносится в document.body (тот же портал-приём, что и у
    // customDropdown.js), а при сворачивании возвращается ровно на своё
    // место — это тот же DOM-узел, а не копия, так что живой предпросмотр
    // продолжает реагировать на слайдеры без каких-либо дополнительных швов.
    const previewExpandBtn = document.getElementById('settingsPreviewExpandBtn');
    const previewCloseBtn = document.getElementById('settingsPreviewCloseBtn');
    const previewWrapperEl = document.querySelector('.preview-wrapper');
    if (previewExpandBtn && previewCloseBtn && previewWrapperEl) {
        let previewAnchor = null;
        let previewBackdrop = null;

        const closePreviewFullscreen = () => {
            if (!previewWrapperEl.classList.contains('preview-fullscreen-active')) return;
            previewWrapperEl.classList.remove('preview-fullscreen-active');
            if (previewAnchor && previewAnchor.parentNode) {
                previewAnchor.parentNode.insertBefore(previewWrapperEl, previewAnchor);
            }
            if (previewBackdrop) {
                previewBackdrop.remove();
                previewBackdrop = null;
            }
        };

        previewExpandBtn.addEventListener('click', () => {
            previewAnchor = document.createComment('preview-wrapper-anchor');
            previewWrapperEl.parentNode.insertBefore(previewAnchor, previewWrapperEl);

            previewBackdrop = document.createElement('div');
            previewBackdrop.className = 'preview-fullscreen-backdrop';
            previewBackdrop.addEventListener('click', closePreviewFullscreen);
            document.body.appendChild(previewBackdrop);

            document.body.appendChild(previewWrapperEl);
            previewWrapperEl.classList.add('preview-fullscreen-active');
        });

        previewCloseBtn.addEventListener('click', closePreviewFullscreen);
        collapsePreviewFullscreen = closePreviewFullscreen;

        // Esc сначала сворачивает превью, а не закрывает модалку под ним —
        // тот же приём (capture + stopPropagation), что и в customDropdown.js.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && previewWrapperEl.classList.contains('preview-fullscreen-active')) {
                e.stopPropagation();
                closePreviewFullscreen();
            }
        }, true);
    }

    // 10. Кнопка сброса настроек
    const settingsResetBtn = document.getElementById('settingsResetBtn');
    if (settingsResetBtn) {
        settingsResetBtn.addEventListener('click', async () => {
            const confirmed = await showConfirmModal('Сбросить настройки', 'Вы уверены, что хотите сбросить все настройки?');
            if (!confirmed) {
                return;
            }
            if (typeof stopDemoScrollImpl === 'function') stopDemoScrollImpl();

            const defaults = {
                'r34_theme_accent': 'pink',
                'r34_theme_bg': 'midnight',
                'r34_media_radius': '20',
                'r34_media_gap': '24',
                'r34_col_width': '300',
                'r34_hover_style': 'glow',
                'r34_font_style': 'sans',
                'r34_video_autoplay': 'false',
                'r34_card_tags_display': 'true',
                'r34_base_font_size': '16',
                'r34_scrollbar_width': '8',
                'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.16)',
                'r34_gif_autoplay': 'false',
                'r34_video_loop': 'true',
                'r34_video_hover_sound': 'false',
                'r34_default_volume': '50',
                'r34_custom_logo_text': '',
                'r34_api_limit': '40',
                'r34_api_timeout': '15',
                'r34_api_retries': '3',
                'r34_api_retry_delay': '2',
                'r34_card_border_width': '1',
                'r34_card_border_color': 'var(--glass-border)',
                'r34_card_transition_speed': '300',
                'r34_card_glow_intensity': '45',
                'r34_tag_size': '11',
                'r34_tags_only_on_hover': 'false',
                'r34_header_style': 'glass',
                'r34_auto_slide': 'true',
                'r34_auto_video_slide': 'true',
                'r34_long_image_protection': 'true'
            };
            
            Object.keys(defaults).forEach(key => localStorage.setItem(key, defaults[key]));
            localStorage.removeItem('r34_forced_width');
            localStorage.removeItem('r34_forced_height');

            // Очищаем экспертные настройки
            const expertKeys = Object.keys(localStorage).filter(k => k.startsWith('r34_expert_'));
            expertKeys.forEach(k => localStorage.removeItem(k));
            if (typeof document !== 'undefined') {
                 const list = document.getElementById('expertVariablesList');
                 if (list) {
                     const inputs = list.querySelectorAll('input');
                     inputs.forEach(input => {
                         input.value = input.placeholder;
                         input.dispatchEvent(new Event('input'));
                     });
                 }
            }

            applyThemeSettings();
            // Общий сброс вернул розовый пресет — обновляем кружки и поле цвета.
            syncAccentControls();

            const inputs = [
                { id: 'settingsAccentColorPicker', value: '#ff3b6b' },
                { id: 'settingsAccentManual', value: '#ff3b6b' },
                { id: 'settingsBgSelect', value: 'midnight' },
                { id: 'settingsBgManual', value: 'midnight' },
                { id: 'settingsRadiusInput', value: '20' },
                { id: 'settingsRadiusManual', value: '20' },
                { id: 'settingsGapInput', value: '24' },
                { id: 'settingsGapManual', value: '24' },
                { id: 'settingsColWidthInput', value: '300' },
                { id: 'settingsColWidthManual', value: '300' },
                { id: 'settingsHoverSelect', value: 'glow' },
                { id: 'settingsFontSelect', value: 'sans' },
                { id: 'settingsFontManual', value: 'sans' },
                { id: 'settingsForcedWidth', value: '' },
                { id: 'settingsForcedHeight', value: '' },
                { id: 'settingsBaseFontInput', value: '16' },
                { id: 'settingsBaseFontManual', value: '16' },
                { id: 'settingsScrollbarWidthInput', value: '8' },
                { id: 'settingsScrollbarWidthManual', value: '8' },
                { id: 'settingsScrollbarColorPicker', value: '#ffffff' },
                { id: 'settingsScrollbarColorManual', value: 'rgba(255, 255, 255, 0.16)' },
                { id: 'settingsDefaultVolumeInput', value: '50' },
                { id: 'settingsDefaultVolumeManual', value: '50' },
                { id: 'settingsCustomLogoInput', value: '' },
                { id: 'settingsCardBorderWidthInput', value: '1' },
                { id: 'settingsCardBorderWidthManual', value: '1' },
                { id: 'settingsCardBorderColorPicker', value: '#ffffff' },
                { id: 'settingsCardBorderColorManual', value: 'rgba(255, 255, 255, 0.06)' },
                { id: 'settingsCardTransitionInput', value: '300' },
                { id: 'settingsCardTransitionManual', value: '300' },
                { id: 'settingsCardGlowInput', value: '45' },
                { id: 'settingsCardGlowManual', value: '45' },
                { id: 'settingsTagSizeInput', value: '11' },
                { id: 'settingsTagSizeManual', value: '11' },
                { id: 'settingsTagClickBehaviorSelect', value: 'default' },
                { id: 'settingsApiLimitInput', value: '40' },
                { id: 'settingsApiLimitManual', value: '40' },
                { id: 'settingsApiTimeoutInput', value: '15' },
                { id: 'settingsApiTimeoutManual', value: '15' },
                { id: 'settingsApiRetriesInput', value: '3' },
                { id: 'settingsApiRetriesManual', value: '3' },
                { id: 'settingsApiRetryDelayInput', value: '2' },
                { id: 'settingsApiRetryDelayManual', value: '2' }
            ];
            
            inputs.forEach(input => {
                const el = document.getElementById(input.id);
                if (el) {
                    el.value = input.value;
                    if (input.id.includes('Input') && typeof setRangeGradient === 'function') {
                        setRangeGradient(el);
                    }
                }
            });
            
            const cardTagsCheckbox = document.getElementById('settingsCardTagsCheckbox');
            if (cardTagsCheckbox) {
                cardTagsCheckbox.checked = true;
            }

            const videoLoopCheckbox = document.getElementById('settingsVideoLoopCheckbox');
            if (videoLoopCheckbox) {
                videoLoopCheckbox.checked = true;
            }

            const tagsOnHoverCheckbox = document.getElementById('settingsTagsOnHoverCheckbox');
            if (tagsOnHoverCheckbox) {
                tagsOnHoverCheckbox.checked = false;
            }
        });
    }

    // Кнопка выхода из аккаунта
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const confirmed = await showConfirmModal('Выход из аккаунта', 'Вы уверены, что хотите выйти из аккаунта?');
            if (confirmed) {
                window.location.href = '/logout';
            }
        });
    }

    // Очистка кэша. Раньше это был localStorage.clear() + sessionStorage.clear(),
    // то есть полный сброс ВСЕГО приложения: избранное, рекорды пазлов, вход,
    // настройки Turso и темы — стирались без предупреждения. Теперь чистим
    // только настоящий кэш (длительность видео, позиции воспроизведения, кэш
    // API), а пользовательские данные и настройки не трогаем.
    const CACHE_KEY_PREFIXES = [
        'r34_duration_',
        'r34_video_position_',
        'r34_video_position_ts_',
        'api_cache_',
        'r34_tagcnt_',
        'r34_tagtype_'
    ];

    function clearCacheKeys() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (CACHE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        return keysToRemove.length;
    }

    if (settingsClearCacheBtn) {
        settingsClearCacheBtn.addEventListener('click', async () => {
            const confirmed = await showConfirmModal(
                'Очистить кэш',
                'Будут удалены закэшированные длительности видео, позиции воспроизведения и кэш API. Избранное, рекорды пазлов, вход и настройки останутся нетронутыми.',
                { confirmLabel: 'Очистить' }
            );
            if (!confirmed) return;

            let removed = 0;
            try {
                removed = clearCacheKeys();
            } catch (e) {
                console.error('Error clearing cache keys:', e);
            }
            try {
                sessionStorage.clear();
            } catch (e) {
                console.error('Error clearing sessionStorage:', e);
            }

            settingsClearCacheBtn.innerHTML = `Очищено (${removed}) ` + icon('checkmark', { size: 16 });
            settingsClearCacheBtn.style.background = 'rgba(52, 227, 154, 0.15)';
            settingsClearCacheBtn.style.borderColor = '#2ed573';
            settingsClearCacheBtn.style.color = '#2ed573';

            setTimeout(() => {
                settingsClearCacheBtn.textContent = 'Очистить';
                settingsClearCacheBtn.style.background = '';
                settingsClearCacheBtn.style.borderColor = '';
                settingsClearCacheBtn.style.color = '';
            }, 2000);
        });
    }

    // Инструкции (кнопки с восклицательным знаком) — этот блок отвечал за клик по "!" и
    // открытие соответствующей подсказки, был утерян при разбиении на модули.
    document.querySelectorAll('.info-btn').forEach(btn => {
        const key = btn.getAttribute('data-info');
        const targetBox = document.getElementById(`info-${key}`);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (targetBox) {
                const isHidden = targetBox.style.display === 'none';
                // Сначала закроем все остальные
                document.querySelectorAll('.info-help-box').forEach(box => {
                    box.style.display = 'none';
                });
                // Переключаем текущий
                targetBox.style.display = isHidden ? 'block' : 'none';
            }
        });

        // Подсказки открываются только по клику на "!" (и закрываются кликом по
        // тому же знаку или по любому месту страницы). Наведение на ПК раньше
        // тоже раскрывало подсказку, но из-за промежутка между знаком и блоком
        // подсказка схлопывалась раньше, чем курсор успевал дойти до ссылки
        // внутри. Оставили только явный клик — поведение стало предсказуемым и
        // одинаковым на ПК и тач-устройствах.
        if (targetBox) {
            // Никаких mouseenter/mouseleave: только click выше управляет видимостью.
        }
    });

    // Закрытие подсказок при клике в любое место
    document.addEventListener('click', () => {
        document.querySelectorAll('.info-help-box').forEach(box => {
            box.style.display = 'none';
        });
    });
}

