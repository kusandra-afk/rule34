import { TagSearch } from './components/tagSearch.js';
import { Gallery } from './components/gallery.js';
import { fetchPosts, proxyUrl, fetchTagCount, fetchPuzzleCompleted, savePuzzleCompleted } from './api.js';
import { setRangeGradient, formatCount, extractHexColor, debounce } from './utils.js';
import { PuzzleGame } from './components/puzzleGame.js';
import { tursoSync } from './tursoSync.js';
import { icon } from './icons.js';
import { StorageManager } from './storage.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const tagInput = document.getElementById('tagInput');
    const arrowButton = document.getElementById('arrowButton');
    const tagModeToggle = document.getElementById('tagModeToggle');
    const r34ResultsCount = document.getElementById('r34ResultsCount');
    
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

    const activeTagsContainer = document.getElementById('activeTags');
    const loader = document.getElementById('loader');
    const paginationLoader = document.getElementById('pagination-loader');
    const resultsDiv = document.getElementById('results');
    const errorEl = document.getElementById('error');
    const suggestionsContainer = document.getElementById('suggestions');
    
    // Sort state
    let currentSort = localStorage.getItem('r34_current_sort') || 'new';

    // Загрузка тегов из API
    let serverExcludedTags = [];

    function rebuildExcludedTagsInTagSearch(tagsList) {
        const normalizedTags = (Array.isArray(tagsList) ? tagsList : [])
            .map(tag => String(tag || '').trim())
            .filter(Boolean);

        if (!window.tagSearch) return;

        // Сохраняем все текущие теги (и активные, и неактивные)
        const currentTags = window.tagSearch.activeTags || [];
        const nextTags = [...currentTags];
        const seen = new Set(currentTags.map(tagObj => tagObj.value));

        normalizedTags.forEach(tag => {
            if (!seen.has(tag)) {
                nextTags.push({ value: tag, active: false });
                seen.add(tag);
            }
        });

        window.tagSearch.activeTags = nextTags.filter(tagObj => {
            if (!tagObj || !tagObj.value) return false;
            // Оставляем те, что уже были, либо те, что пришли с сервера
            return true;
        });

        window.tagSearch.updateActiveTagsDisplay();
    }

    async function loadExcludedTagsFromServer() {
        try {
            console.log('Fetching excluded tags from /api/excluded-tags');
            const response = await fetch('/api/excluded-tags');
            console.log('Response status:', response.status);
            if (response.ok) {
                const data = await response.json();
                console.log('Response data:', data);
                if (data.ok && Array.isArray(data.tags)) {
                    serverExcludedTags = data.tags;
                    rebuildExcludedTagsInTagSearch(data.tags);
                    console.log('Loaded excluded tags from server:', data.tags);
                    return data.tags;
                }
            }
        } catch (e) {
            console.error('Error loading excluded tags from server:', e);
        }
        console.log('Returning empty array for excluded tags');
        return [];
    }
    
    // Сохранение тегов на сервер
    async function saveExcludedTagsToServer(tagsList) {
        try {
            const response = await fetch('/api/excluded-tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: tagsList })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.ok) {
                    serverExcludedTags = Array.isArray(data.tags) ? data.tags : tagsList;
                    rebuildExcludedTagsInTagSearch(serverExcludedTags);
                    return true;
                }
            }
        } catch (e) {
            console.error('Error saving excluded tags to server:', e);
        }
        return false;
    }

    // Загрузка настроек с сервера
    let serverSettings = null;
    async function loadSettingsFromServer() {
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const data = await response.json();
                if (data.ok && typeof data.settings === 'object') {
                    serverSettings = data.settings;
                    // Применяем только реальные настройки к localStorage
                    Object.keys(data.settings).forEach(key => {
                        if (isSettingsSyncKey(key)) {
                            originalSetItem.call(localStorage, key, data.settings[key]);
                        }
                    });
                    return data.settings;
                }
            }
        } catch (e) {
            console.error('Error loading settings from server:', e);
        }
        return {};
    }

    // Загрузка turso config с сервера
    let serverTursoConfig = null;
    async function loadTursoConfigFromServer() {
        try {
            const response = await fetch('/api/turso-config');
            if (response.ok) {
                const data = await response.json();
                if (data.ok && typeof data.config === 'object') {
                    serverTursoConfig = data.config;
                    // Сохраняем в localStorage для совместимости
                    if (data.config.turso_url !== undefined) {
                        originalSetItem.call(localStorage, 'r34_turso_url', data.config.turso_url);
                    }
                    if (data.config.turso_token !== undefined) {
                        originalSetItem.call(localStorage, 'r34_turso_token', data.config.turso_token);
                    }
                    return data.config;
                }
            }
        } catch (e) {
            console.error('Error loading turso config from server:', e);
        }
        return { turso_url: '', turso_token: '' };
    }

    // Сохранение turso config на сервер
    async function saveTursoConfigToServer(url, token) {
        try {
            const response = await fetch('/api/turso-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ turso_url: url, turso_token: token })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.ok) {
                    serverTursoConfig = data.config;
                    return true;
                }
            }
        } catch (e) {
            console.error('Error saving turso config to server:', e);
        }
        return false;
    }

    const SETTINGS_SYNC_EXCLUDE_PREFIXES = [
        'r34_duration_',
        'r34_video_position_',
        'liked_',
        'r34_tagtype_',
        'r34_puzzle_',
        'r34_solved_',
        'r34_tagcnt_'
    ];
    const SETTINGS_SYNC_EXCLUDE_KEYS = new Set([
        'r34_active_tags',
        'r34_turso_url',
        'r34_turso_token'
    ]);

    function isSettingsSyncKey(key) {
        return key && key.startsWith('r34_') && !SETTINGS_SYNC_EXCLUDE_KEYS.has(key) && !SETTINGS_SYNC_EXCLUDE_PREFIXES.some(prefix => key.startsWith(prefix));
    }

    // Сохранение настроек на сервер
    let settingsSaveTimeout = null;
    async function saveSettingsToServer() {
        // Собираем только реальные настройки из localStorage
        const allSettings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (isSettingsSyncKey(key)) {
                allSettings[key] = localStorage.getItem(key);
            }
        }
        
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: allSettings })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.ok) {
                    serverSettings = data.settings;
                    return true;
                }
            }
        } catch (e) {
            console.error('Error saving settings to server:', e);
        }
        return false;
    }

    // Обертка для localStorage.setItem с отложенной отправкой на сервер и защитой от переполнения
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        try {
            originalSetItem.call(this, key, value);
        } catch (e) {
            if (StorageManager.isQuotaExceeded(e)) {
                console.warn('LocalStorage quota exceeded during global setItem. Cleaning up...', key);
                StorageManager.cleanup();
                try {
                    originalSetItem.call(this, key, value);
                } catch (retryError) {
                    console.error('LocalStorage still full after global cleanup.', retryError);
                }
            } else {
                console.error('LocalStorage setItem error:', e);
            }
        }
        
        // Синхронизируем только реальные настройки, исключая кешируемые данные и пазлы
        if (isSettingsSyncKey(key)) {
            if (settingsSaveTimeout) clearTimeout(settingsSaveTimeout);
            settingsSaveTimeout = setTimeout(() => {
                saveSettingsToServer();
            }, 1000); // Отправляем через 1 секунду после последнего изменения
        }
    };
    
    const originalRemoveItem = localStorage.removeItem;
    localStorage.removeItem = function(key) {
        const existed = this.getItem(key);
        originalRemoveItem.call(this, key);
        if (isSettingsSyncKey(key) && existed !== null) {
            if (settingsSaveTimeout) clearTimeout(settingsSaveTimeout);
            settingsSaveTimeout = setTimeout(() => {
                saveSettingsToServer();
            }, 1000);
        }
    };

    const getSavedExcludedTags = () => {
        return Array.isArray(serverExcludedTags) ? serverExcludedTags : [];
    };
    const saveSavedExcludedTags = async (tagsList) => {
        const normalizedTags = (Array.isArray(tagsList) ? tagsList : [])
            .map(tag => String(tag || '').trim())
            .filter(Boolean);
        await saveExcludedTagsToServer(normalizedTags);
    };

    window.getSavedExcludedTags = getSavedExcludedTags;
    window.saveSavedExcludedTags = saveSavedExcludedTags;
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

    // --- ПРЕДУСТАНОВКИ КАСТОМИЗАЦИИ (Advanced customization presets) ---
    const colorPresets = {
        pink: { accent: '#ff3b6b', alt: '#ff5e8c', glow: 'rgba(255, 59, 107, 0.4)' },
        cyan: { accent: '#00f0ff', alt: '#00bfff', glow: 'rgba(0, 240, 255, 0.4)' },
        green: { accent: '#39ff14', alt: '#32cd32', glow: 'rgba(57, 255, 20, 0.4)' },
        purple: { accent: '#9b51e0', alt: '#bb6bd9', glow: 'rgba(155, 81, 224, 0.4)' },
        gold: { accent: '#f2c94c', alt: '#f2994a', glow: 'rgba(242, 201, 76, 0.4)' }
    };

    const bgPresets = {
        midnight: { dark: '#0a0b10', bodyBg: 'radial-gradient(circle at top right, #1b1622 0%, #0a0b10 100%)' },
        obsidian: { dark: '#000000', bodyBg: '#000000' },
        forest: { dark: '#040c06', bodyBg: 'radial-gradient(circle at top right, #0a1f10 0%, #040c06 100%)' },
        indigo: { dark: '#080816', bodyBg: 'radial-gradient(circle at top right, #0e122b 0%, #080816 100%)' }
    };

    const hoverPresets = {
        zoom: {
            transform: 'translateY(-6px) scale(1.015)',
            borderColor: 'var(--accent)',
            boxShadow: '0 15px 40px var(--accent-glow), 0 0 0 1px var(--accent)',
            animation: 'none'
        },
        glow: {
            transform: 'none',
            borderColor: 'var(--accent)',
            boxShadow: '0 0 25px var(--accent-glow), inset 0 0 15px var(--accent-glow)',
            animation: 'none'
        },
        slide: {
            transform: 'translateY(-3px)',
            borderColor: 'var(--glass-border-strong)',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
            animation: 'none'
        },
        pulse: {
            transform: 'scale(1.03)',
            borderColor: 'var(--accent)',
            boxShadow: '0 0 20px var(--accent-glow), 0 0 0 1px var(--accent)',
            animation: 'cardPulse 1.5s infinite ease-in-out'
        },
        borderPop: {
            transform: 'none',
            borderColor: 'white',
            boxShadow: 'inset 0 0 0 2px white',
            animation: 'none'
        },
        none: {
            transform: 'none',
            borderColor: 'var(--glass-border)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
        }
    };

    const fontPresets = {
        sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        mono: "'JetBrains Mono', 'Courier New', Courier, monospace",
        rounded: "system-ui, -apple-system, sans-serif"
    };

    function getAccentGlow(hexColor, intensity) {
        const alpha = typeof intensity === 'number' ? (intensity / 100) * 0.9 : 0.45;
        if (hexColor && hexColor.startsWith('#')) {
            const hex = hexColor.replace('#', '');
            if (hex.length === 3) {
                const r = parseInt(hex[0] + hex[0], 16) || 0;
                const g = parseInt(hex[1] + hex[1], 16) || 0;
                const b = parseInt(hex[2] + hex[2], 16) || 0;
                return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
            } else if (hex.length === 6) {
                const r = parseInt(hex.substring(0, 2), 16) || 0;
                const g = parseInt(hex.substring(2, 4), 16) || 0;
                const b = parseInt(hex.substring(4, 6), 16) || 0;
                return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
            }
        }
        return `rgba(255, 59, 107, ${alpha.toFixed(3)})`;
    }

    function getAccentAlt(hexColor) {
        if (hexColor && hexColor.startsWith('#')) {
            const hex = hexColor.replace('#', '');
            let r, g, b;
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16) || 0;
                g = parseInt(hex[1] + hex[1], 16) || 0;
                b = parseInt(hex[2] + hex[2], 16) || 0;
            } else if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16) || 0;
                g = parseInt(hex.substring(2, 4), 16) || 0;
                b = parseInt(hex.substring(4, 6), 16) || 0;
            } else {
                return hexColor;
            }
            const isTooLight = (r * 0.299 + g * 0.587 + b * 0.114) > 180;
            const factor = isTooLight ? -0.15 : 0.15;
            const rAlt = Math.max(0, Math.min(255, Math.round(r + (isTooLight ? r : 255 - r) * factor)));
            const gAlt = Math.max(0, Math.min(255, Math.round(g + (isTooLight ? g : 255 - g) * factor)));
            const bAlt = Math.max(0, Math.min(255, Math.round(b + (isTooLight ? b : 255 - b) * factor)));
            return `rgb(${rAlt}, ${gAlt}, ${bAlt})`;
        }
        return hexColor;
    }

    function getBgLuminance(colorStr) {
        if (!colorStr) return 0;
        let hex = colorStr.trim();
        if (hex.startsWith('#')) {
            hex = hex.replace('#', '');
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            if (hex.length >= 6) {
                const r = parseInt(hex.substr(0, 2), 16) || 0;
                const g = parseInt(hex.substr(2, 2), 16) || 0;
                const b = parseInt(hex.substr(4, 2), 16) || 0;
                return (r * 299 + g * 587 + b * 114) / 1000;
            }
        }
        const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1], 10) || 0;
            const g = parseInt(rgbMatch[2], 10) || 0;
            const b = parseInt(rgbMatch[3], 10) || 0;
            return (r * 299 + g * 587 + b * 114) / 1000;
        }
        const anyHex = colorStr.match(/#([0-9a-fA-F]{3,8})/);
        if (anyHex) {
            return getBgLuminance(anyHex[0]);
        }
        return 30; // default dark
    }

    // --- АДАПТИВНЫЙ ЦВЕТ ТЕКСТА (Live Contrast) ---
    function getContrastYIQ(color) {
        if (!color) return '#fff';
        let r, g, b;
        let parsed = color.trim();
        if (parsed.startsWith('#')) {
            parsed = parsed.replace('#', '');
            if (parsed.length === 3) parsed = parsed.split('').map(c => c + c).join('');
            r = parseInt(parsed.substr(0, 2), 16) || 0;
            g = parseInt(parsed.substr(2, 2), 16) || 0;
            b = parseInt(parsed.substr(4, 2), 16) || 0;
        } else if (parsed.startsWith('rgb')) {
            const match = parsed.match(/\d+/g);
            if (match) {
                r = parseInt(match[0]);
                g = parseInt(match[1]);
                b = parseInt(match[2]);
            }
        } else if (parsed.startsWith('var(')) {
            const tempVar = parsed.replace('var(', '').replace(')', '').trim();
            const computed = getComputedStyle(document.documentElement).getPropertyValue(tempVar);
            return getContrastYIQ(computed);
        } else {
            return '#fff';
        }
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return (yiq >= 135) ? '#0a0b10' : '#fff';
    }

    let isApplyingTheme = false;
    function applyAdaptiveText(varName, activeVal) {
        if (isApplyingTheme) {
            if (typeof recalculateAllAdaptiveText === 'function') {
                recalculateAllAdaptiveText();
            }
            return;
        }
        isApplyingTheme = true;
        try {
            if (typeof applyThemeSettings === 'function') {
                applyThemeSettings();
            }
        } finally {
            isApplyingTheme = false;
        }
    }

    function applyThemeSettings() {
        // Accent Color
        const activeColor = localStorage.getItem('r34_theme_accent') || 'pink';
        const glowIntensity = parseInt(localStorage.getItem('r34_card_glow_intensity') || '45', 10);
        let preset;
        if (activeColor.startsWith('#')) {
            preset = {
                accent: activeColor,
                alt: getAccentAlt(activeColor),
                glow: getAccentGlow(activeColor, glowIntensity)
            };
        } else {
            preset = Object.assign({}, colorPresets[activeColor] || colorPresets.pink);
            const presetGlowColors = {
                pink: '255, 59, 107',
                violet: '167, 139, 250',
                blue: '59, 130, 246',
                cyan: '6, 182, 212',
                emerald: '16, 185, 129',
                orange: '249, 115, 22'
            };
            const rgb = presetGlowColors[activeColor] || '255, 59, 107';
            preset.glow = `rgba(${rgb}, ${(glowIntensity / 100) * 0.5})`;
        }
        document.documentElement.style.setProperty('--accent', preset.accent);
        document.documentElement.style.setProperty('--accent-alt', preset.alt);
        document.documentElement.style.setProperty('--accent-glow', preset.glow);
        applyAdaptiveText('--accent', preset.accent);

        // Background Theme
        const activeBg = localStorage.getItem('r34_theme_bg') || 'midnight';
        const bgPreset = bgPresets[activeBg];
        let bgForLum = '#0a0b10';
        if (bgPreset) {
            document.documentElement.style.setProperty('--dark', bgPreset.dark);
            document.documentElement.style.setProperty('--body-bg', bgPreset.bodyBg);
            bgForLum = bgPreset.dark;
        } else {
            // Custom typed background
            document.documentElement.style.setProperty('--dark', '#000000');
            document.documentElement.style.setProperty('--body-bg', activeBg);
            bgForLum = activeBg;
        }
        applyAdaptiveText('--dark', bgForLum);

        // Border Radius
        const radius = localStorage.getItem('r34_media_radius') || '20';
        document.documentElement.style.setProperty('--media-radius', radius + 'px');

        // Gap
        const gap = localStorage.getItem('r34_media_gap') || '24';
        document.documentElement.style.setProperty('--media-gap', gap + 'px');

        // Card column minimum width
        const colWidth = localStorage.getItem('r34_col_width') || '300';
        document.documentElement.style.setProperty('--grid-col-width', colWidth + 'px');

        // Forced Width and Height
        const forcedWidth = localStorage.getItem('r34_forced_width');
        const forcedHeight = localStorage.getItem('r34_forced_height');
        
        if (forcedWidth && forcedWidth.trim() !== '') {
            document.documentElement.style.setProperty('--forced-width', forcedWidth + 'px');
            document.documentElement.style.setProperty('--forced-width-scaled', (parseFloat(forcedWidth) * 0.42) + 'px');
            document.documentElement.style.setProperty('--forced-max-width', 'none');
        } else {
            document.documentElement.style.removeProperty('--forced-width');
            document.documentElement.style.removeProperty('--forced-width-scaled');
            document.documentElement.style.removeProperty('--forced-max-width');
        }
        
        if (forcedHeight && forcedHeight.trim() !== '') {
            document.documentElement.style.setProperty('--forced-height', forcedHeight + 'px');
            document.documentElement.style.setProperty('--forced-height-scaled', (parseFloat(forcedHeight) * 0.42) + 'px');
            document.documentElement.style.setProperty('--forced-img-height', 'auto');
            document.documentElement.style.setProperty('--forced-img-height-scaled', 'auto');
            document.documentElement.style.setProperty('--media-aspect-ratio', 'auto');
        } else {
            document.documentElement.style.removeProperty('--forced-height');
            document.documentElement.style.removeProperty('--forced-height-scaled');
            document.documentElement.style.removeProperty('--forced-img-height');
            document.documentElement.style.removeProperty('--forced-img-height-scaled');
            document.documentElement.style.removeProperty('--media-aspect-ratio');
        }

        // Hover effect
        const hoverStyle = localStorage.getItem('r34_hover_style') || 'zoom';
        const hp = hoverPresets[hoverStyle] || hoverPresets.zoom;
        document.documentElement.style.setProperty('--hover-transform', hp.transform);
        document.documentElement.style.setProperty('--hover-border-color', hp.borderColor);
        document.documentElement.style.setProperty('--hover-box-shadow', hp.boxShadow);
        document.documentElement.style.setProperty('--hover-animation', hp.animation || 'none');

        // Font
        const fontStyle = localStorage.getItem('r34_font_style') || 'sans';
        const fp = fontPresets[fontStyle] || fontStyle;
        document.documentElement.style.setProperty('--site-font', fp);

        // --- New Advanced customization properties live apply ---
        const cardBgOpacity = localStorage.getItem('r34_card_bg_opacity') || '85';
        document.documentElement.style.setProperty('--card-bg-opacity', (parseFloat(cardBgOpacity) / 100).toFixed(2));

        const cardBgBlur = localStorage.getItem('r34_card_bg_blur') || '0';
        document.documentElement.style.setProperty('--card-bg-blur', cardBgBlur + 'px');

        const baseFontSize = localStorage.getItem('r34_base_font_size') || '16';
        document.documentElement.style.setProperty('--base-font-size', baseFontSize + 'px');

        const scrollbarWidth = localStorage.getItem('r34_scrollbar_width') || '8';
        document.documentElement.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');

        const scrollbarThumbColor = localStorage.getItem('r34_scrollbar_thumb_color') || 'rgba(255, 255, 255, 0.16)';
        document.documentElement.style.setProperty('--scrollbar-thumb-color', scrollbarThumbColor);

        const cardTagsDisplay = localStorage.getItem('r34_card_tags_display') || 'true';
        document.documentElement.style.setProperty('--card-tags-display', cardTagsDisplay === 'true' ? 'flex' : 'none');

        const lowPowerMode = localStorage.getItem('r34_low_power_mode') === 'true';
        document.body.classList.toggle('r34-low-power-mode', lowPowerMode);

        
        const effectiveCardTransitionSpeed = localStorage.getItem('r34_card_transition_speed') || '300';
        // В режиме низкой мощности ставим минимальную задержку
        const finalSpeed = lowPowerMode ? 10 : (parseFloat(effectiveCardTransitionSpeed) || 300);
        document.documentElement.style.setProperty('--card-transition-speed', finalSpeed + 'ms');
        
        // Apply theme settings
        // (Removal of redundant broken forceUpdateAllCSSVariables call)

        // --- 1. Custom Logo Text ---
        const customLogoText = localStorage.getItem('r34_custom_logo_text') || '';
        const mainLogo = document.querySelector('h1');
        if (mainLogo) {
            mainLogo.textContent = customLogoText.trim() !== '' ? customLogoText : 'Rule34 Gallery';
        }
        const previewLogo = document.getElementById('previewLogoContainer');
        if (previewLogo) {
            previewLogo.replaceChildren();
            if (customLogoText.trim() !== '') {
                previewLogo.title = customLogoText;
                const span = document.createElement('span');
                span.style.color = 'var(--accent)';
                span.style.textShadow = '0 0 8px var(--accent-glow)';
                span.style.wordBreak = 'break-word';
                span.style.overflowWrap = 'break-word';
                span.style.whiteSpace = 'normal';
                span.style.fontFamily = 'var(--site-font)';
                span.style.fontSize = 'var(--base-font-size)';
                span.style.display = 'inline-block';
                span.style.maxWidth = '150px';
                span.style.lineHeight = '1.2';
                span.style.fontSize = '0.8rem';
                span.textContent = customLogoText;
                previewLogo.appendChild(span);
            } else {
                previewLogo.title = 'Rule34 Gallery';
                const rule34Span = document.createElement('span');
                rule34Span.style.color = 'var(--accent)';
                rule34Span.style.textShadow = '0 0 8px var(--accent-glow)';
                rule34Span.textContent = 'Rule34';
                const gallerySpan = document.createElement('span');
                gallerySpan.style.color = '#fff';
                gallerySpan.textContent = 'Gallery';
                previewLogo.appendChild(rule34Span);
                previewLogo.appendChild(gallerySpan);
            }
        }

        // --- 2. Card Border Width ---
        const cardBorderWidth = localStorage.getItem('r34_card_border_width') || '1';
        document.documentElement.style.setProperty('--card-border-width', cardBorderWidth + 'px');

        // --- 3. Card Border Color ---
        const cardBorderColor = localStorage.getItem('r34_card_border_color') || 'var(--glass-border)';
        document.documentElement.style.setProperty('--card-border-color', cardBorderColor);

        // --- 4. Card Transition Speed ---
        const cardTransitionSpeed = localStorage.getItem('r34_card_transition_speed') || '300';
        document.documentElement.style.setProperty('--card-transition-speed', cardTransitionSpeed + 'ms');

        // --- 5. Tag Font Size ---
        const tagSize = localStorage.getItem('r34_tag_size') || '11';
        document.documentElement.style.setProperty('--tag-font-size', tagSize + 'px');

        // --- 6. Tags Only on Hover ---
        const tagsOnHover = localStorage.getItem('r34_tags_only_on_hover') === 'true';
        if (tagsOnHover) {
            document.body.classList.add('r34-tags-hover-only');
        } else {
            document.body.classList.remove('r34-tags-hover-only');
        }

        // --- 7. Header Style ---
        const headerStyle = localStorage.getItem('r34_header_style') || 'glass';
        if (headerStyle === 'dark') {
            document.documentElement.style.setProperty('--header-bg', '#12131a');
            document.documentElement.style.setProperty('--header-backdrop-filter', 'none');
        } else if (headerStyle === 'transparent') {
            document.documentElement.style.setProperty('--header-bg', 'transparent');
            document.documentElement.style.setProperty('--header-backdrop-filter', 'none');
        } else if (headerStyle === 'accent') {
            document.documentElement.style.setProperty('--header-bg', 'var(--accent)');
            document.documentElement.style.setProperty('--header-backdrop-filter', 'none');
        } else { // glass
            document.documentElement.style.setProperty('--header-bg', 'rgba(18, 19, 26, 0.45)');
            document.documentElement.style.setProperty('--header-backdrop-filter', 'blur(24px) saturate(1.2)');
        }

        // Dynamic status updates in miniature Live Preview
        const hoverSound = localStorage.getItem('r34_video_hover_sound') === 'true';
        const defaultVolume = localStorage.getItem('r34_default_volume') || '50';
        const volFloat = (parseFloat(defaultVolume) || 50) / 100;
        document.querySelectorAll('video').forEach(vid => {
            vid.volume = volFloat;
        });
        
        const previewVolumeBar = document.getElementById('previewVolumeBar');
        if (previewVolumeBar) {
            previewVolumeBar.style.width = defaultVolume + '%';
        }
        
        const previewSoundIcon = document.getElementById('previewSoundIcon');
        const previewSoundWaves = document.getElementById('previewSoundWaves');
        if (previewSoundIcon && previewSoundWaves) {
            if (hoverSound) {
                previewSoundWaves.style.display = 'block';
                previewSoundIcon.style.color = 'var(--accent)';
            } else {
                previewSoundWaves.style.display = 'none';
                previewSoundIcon.style.color = '#ffffff';
            }
        }

        // --- 8. Expert Developer Parameters ---
        // Apply expert developer parameters if defined in localStorage to prevent standard theme settings from overwriting them on page load or settings updates.
        const expertKeys = [
            '--accent', '--accent-alt', '--accent-glow', '--dark', '--light',
            '--body-bg', '--modal-bg', '--error', '--success', '--tag-bg',
            '--suggestion-bg', '--glass', '--header-bg', '--header-backdrop-filter',
            '--media-radius', '--media-gap', '--grid-col-width', '--site-font',
            '--base-font-size', '--hover-transform', '--hover-border-color', '--hover-box-shadow',
            '--container-max-width', '--gallery-max-width', '--card-bg-opacity', '--card-bg-blur',
            '--card-border-width', '--card-border-color', '--card-transition-speed', '--card-tags-display',
            '--tag-font-size', '--scrollbar-width', '--scrollbar-thumb-color'
        ];
        expertKeys.forEach(varName => {
            const savedValue = localStorage.getItem('r34_expert_' + varName);
            if (savedValue) {
                document.documentElement.style.setProperty(varName, savedValue);
            }
        });

        // ============================================================
        // // ИЗМЕНЕНО: Динамический перерасчет и адаптация цветов
        // На основе финальных значений (после наложения и готовых, и экспертных настроек)
        // ============================================================
        const activeAccent = document.documentElement.style.getPropertyValue('--accent').trim() || '#ff3b6b';
        const activeDark = document.documentElement.style.getPropertyValue('--dark').trim() || '#0a0b10';
        const activeBodyBg = document.documentElement.style.getPropertyValue('--body-bg').trim() || activeDark;

        // 1. Парсинг --accent-rgb для динамических полупрозрачных эффектов
        let ar = 255, ag = 59, ab = 107;
        if (activeAccent.startsWith('#')) {
            const hex = activeAccent.replace('#', '');
            if (hex.length === 3) {
                ar = parseInt(hex[0] + hex[0], 16) || 0;
                ag = parseInt(hex[1] + hex[1], 16) || 0;
                ab = parseInt(hex[2] + hex[2], 16) || 0;
            } else if (hex.length === 6) {
                ar = parseInt(hex.substring(0, 2), 16) || 0;
                ag = parseInt(hex.substring(2, 4), 16) || 0;
                ab = parseInt(hex.substring(4, 6), 16) || 0;
            }
        } else {
            const rgbMatch = activeAccent.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (rgbMatch) {
                ar = parseInt(rgbMatch[1], 10) || 0;
                ag = parseInt(rgbMatch[2], 10) || 0;
                ab = parseInt(rgbMatch[3], 10) || 0;
            }
        }
        document.documentElement.style.setProperty('--accent-rgb', `${ar}, ${ag}, ${ab}`);

        // 2. Определение яркости фона для адаптации интерфейса
        const lum = getBgLuminance(activeBodyBg);
        const isLightBg = lum > 135;

        // Автоматическая адаптация системных поверхностей под светлую/темную тему, если нет экспертных переопределений
        if (isLightBg) {
            if (!localStorage.getItem('r34_expert_--modal-bg')) {
                document.documentElement.style.setProperty('--modal-bg', 'rgba(255, 255, 255, 0.94)');
            }
            if (!localStorage.getItem('r34_expert_--tag-bg')) {
                document.documentElement.style.setProperty('--tag-bg', 'rgba(10, 11, 16, 0.06)');
            }
            if (!localStorage.getItem('r34_expert_--suggestion-bg')) {
                document.documentElement.style.setProperty('--suggestion-bg', 'rgba(255, 255, 255, 0.96)');
            }
            if (!localStorage.getItem('r34_expert_--glass')) {
                document.documentElement.style.setProperty('--glass', 'rgba(255, 255, 255, 0.65)');
            }
            if (!localStorage.getItem('r34_expert_--glass-bg')) {
                document.documentElement.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.6)');
            }
            if (!localStorage.getItem('r34_expert_--glass-bg-strong')) {
                document.documentElement.style.setProperty('--glass-bg-strong', 'rgba(255, 255, 255, 0.85)');
            }
            if (!localStorage.getItem('r34_expert_--glass-border')) {
                document.documentElement.style.setProperty('--glass-border', 'rgba(10, 11, 16, 0.08)');
            }
            if (!localStorage.getItem('r34_expert_--glass-border-strong')) {
                document.documentElement.style.setProperty('--glass-border-strong', 'rgba(10, 11, 16, 0.16)');
            }
            if (!localStorage.getItem('r34_expert_--glass-highlight')) {
                document.documentElement.style.setProperty('--glass-highlight', 'inset 0 1px 0 rgba(255, 255, 255, 0.4)');
            }
            if (!localStorage.getItem('r34_expert_--btn-secondary-bg')) {
                document.documentElement.style.setProperty('--btn-secondary-bg', 'rgba(10, 11, 16, 0.05)');
            }
        } else {
            if (!localStorage.getItem('r34_expert_--modal-bg')) {
                document.documentElement.style.setProperty('--modal-bg', 'rgba(4, 5, 9, 0.72)');
            }
            if (!localStorage.getItem('r34_expert_--tag-bg')) {
                document.documentElement.style.setProperty('--tag-bg', 'rgba(255, 255, 255, 0.05)');
            }
            if (!localStorage.getItem('r34_expert_--suggestion-bg')) {
                document.documentElement.style.setProperty('--suggestion-bg', 'rgba(13, 15, 22, 0.94)');
            }
            if (!localStorage.getItem('r34_expert_--glass')) {
                document.documentElement.style.setProperty('--glass', 'rgba(255, 255, 255, 0.05)');
            }
            if (!localStorage.getItem('r34_expert_--glass-bg')) {
                document.documentElement.style.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.045)');
            }
            if (!localStorage.getItem('r34_expert_--glass-bg-strong')) {
                document.documentElement.style.setProperty('--glass-bg-strong', 'rgba(255, 255, 255, 0.08)');
            }
            if (!localStorage.getItem('r34_expert_--glass-border')) {
                document.documentElement.style.setProperty('--glass-border', 'rgba(255, 255, 255, 0.09)');
            }
            if (!localStorage.getItem('r34_expert_--glass-border-strong')) {
                document.documentElement.style.setProperty('--glass-border-strong', 'rgba(255, 255, 255, 0.18)');
            }
            if (!localStorage.getItem('r34_expert_--glass-highlight')) {
                document.documentElement.style.setProperty('--glass-highlight', 'inset 0 1px 0 rgba(255, 255, 255, 0.07)');
            }
            if (!localStorage.getItem('r34_expert_--btn-secondary-bg')) {
                document.documentElement.style.setProperty('--btn-secondary-bg', 'rgba(255, 255, 255, 0.08)');
            }
        }

        // 3. Расчет адаптивного цвета текста
        let textColor = isLightBg ? '#0a0b10' : '#f6f7fb';
        let textMuted = isLightBg ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.7)';
        
        const expertLight = localStorage.getItem('r34_expert_--light');
        if (expertLight) {
            textColor = expertLight;
        }

        const titleGradient = isLightBg 
            ? `linear-gradient(135deg, #111111 0%, #374151 50%, ${activeAccent} 100%)`
            : `linear-gradient(135deg, #ffffff 0%, #d1d5db 50%, ${activeAccent} 100%)`;
        const modalTitleGradient = isLightBg 
            ? 'linear-gradient(135deg, #111111 0%, #4b5563 100%)'
            : 'linear-gradient(135deg, #fff, #b8b8d1)';
        const endTitleGradient = isLightBg 
            ? 'linear-gradient(135deg, #111111 0%, #4b5563 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, #a5aab8 100%)';

        document.documentElement.style.setProperty('--light', textColor);
        document.documentElement.style.setProperty('--text-muted', textMuted);
        document.documentElement.style.setProperty('--adaptive-text-main', textColor);
        document.documentElement.style.setProperty('--adaptive-text-muted', textMuted);
        document.documentElement.style.setProperty('--title-gradient', titleGradient);
        document.documentElement.style.setProperty('--modal-title-gradient', modalTitleGradient);
        document.documentElement.style.setProperty('--end-title-gradient', endTitleGradient);

        if (isLightBg) {
            document.body.classList.add('light-theme');
            document.body.setAttribute('data-theme', 'light');
        } else {
            document.body.classList.remove('light-theme');
            document.body.removeAttribute('data-theme');
        }

        // 4. Запуск полного перерасчета адаптивной контрастности для всех поверхностей сайта
        recalculateAllAdaptiveText();
    };

    // Применяем настройки сразу при загрузке
    applyThemeSettings();
    const debouncedApplyThemeSettings = debounce(applyThemeSettings, 100);
    const debouncedSaveSetting = debounce((key, val) => {
        localStorage.setItem(key, val);
        applyThemeSettings();
    }, 150);

    // Настройка автовоспроизведения видео и гифок
    let autoplayObserver = null;
    let mutObserver = null;
    let autoplayScrollTimer = null;
    function setupAutoplayObserver() {
        if (autoplayObserver) {
            autoplayObserver.disconnect();
            autoplayObserver = null;
        }
        if (mutObserver) {
            mutObserver.disconnect();
            mutObserver = null;
        }

        // Clean up previous listeners
        if (window._onAutoplayScrollOrResize) {
            window.removeEventListener('scroll', window._onAutoplayScrollOrResize);
            window.removeEventListener('resize', window._onAutoplayScrollOrResize);
            window._onAutoplayScrollOrResize = null;
        }

        const lowPowerMode = localStorage.getItem('r34_low_power_mode') === 'true';
        const reducedMotion = localStorage.getItem('r34_reduced_motion') === 'true' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const videoAutoplayEnabled = !lowPowerMode && !reducedMotion && localStorage.getItem('r34_video_autoplay') === 'true';
        const gifAutoplayEnabled = !lowPowerMode && !reducedMotion && localStorage.getItem('r34_gif_autoplay') === 'true';

        // Pause things that are disabled
        if (!videoAutoplayEnabled) {
            document.querySelectorAll('#results video.media-content, #profile-results video.media-content').forEach(v => {
                try {
                    v.pause();
                } catch(e) {}
            });
        }
        if (!gifAutoplayEnabled) {
            document.querySelectorAll('#results img[data-is-gif="true"], #profile-results img[data-is-gif="true"]').forEach(img => {
                try {
                    if (typeof img.pauseGif === 'function') {
                        img.pauseGif();
                    }
                } catch(e) {}
            });
        }

        // If both are disabled, we don't need to observe anything
        if (!videoAutoplayEnabled && !gifAutoplayEnabled) {
            return;
        }

        const runCenterAutoplay = () => {
            const mediaElements = Array.from(document.querySelectorAll('#results video.media-content, #results img[data-is-gif="true"], #profile-results video.media-content, #profile-results img[data-is-gif="true"]'));
            if (mediaElements.length === 0) return;

            let closestMedia = null;
            let minDistance = Infinity;
            const centerY = window.innerHeight / 2;

            mediaElements.forEach(media => {
                const rect = media.getBoundingClientRect();
                const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
                if (isVisible) {
                    const mediaCenterY = rect.top + rect.height / 2;
                    const distance = Math.abs(mediaCenterY - centerY);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestMedia = media;
                    }
                }
            });

            mediaElements.forEach(media => {
                const isVideo = media.tagName === 'VIDEO';
                const isGif = media.tagName === 'IMG' && media.dataset.isGif === 'true';

                if (media === closestMedia) {
                    if (isVideo && videoAutoplayEnabled) {
                        if (media.paused && media.dataset.manuallyPaused !== 'true') {
                            media.muted = true;
                            const container = media.closest('.media-container');
                            if (container && container._soundToggleBtn) {
                                container._soundToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
                                container._soundToggleBtn.title = 'Включить звук';
                            }
                            media.play().catch(() => {});
                            if (container) {
                                const playBtn = container.querySelector('.center-play-btn');
                                if (playBtn) {
                                    playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="#fff"/></svg>`;
                                }
                            }
                        }
                    } else if (isGif && gifAutoplayEnabled) {
                        if (typeof media.playGif === 'function') {
                            media.playGif();
                        }
                    }
                } else {
                    if (isVideo) {
                        if (!media.paused) {
                            try { media.pause(); } catch(e) {}
                            const container = media.closest('.media-container');
                            if (container) {
                                const playBtn = container.querySelector('.center-play-btn');
                                if (playBtn) {
                                    playBtn.innerHTML = `<svg viewBox="0 0 24 24" style="margin-left: 3px;"><path d="M8 5v14l11-7z" fill="#fff"/></svg>`;
                                }
                            }
                        }
                        delete media.dataset.manuallyPaused;
                    } else if (isGif) {
                        if (typeof media.pauseGif === 'function') {
                            media.pauseGif();
                        }
                    }
                }
            });
        };

        const onScrollOrResize = () => {
            if (autoplayScrollTimer) cancelAnimationFrame(autoplayScrollTimer);
            autoplayScrollTimer = requestAnimationFrame(runCenterAutoplay);
        };

        window._onAutoplayScrollOrResize = onScrollOrResize;
        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });

        // Run immediately and after a short delay
        runCenterAutoplay();
        setTimeout(runCenterAutoplay, 150);
        setTimeout(runCenterAutoplay, 500);

        const resultsEl = document.getElementById('results');
        if (resultsEl) {
            mutObserver = new MutationObserver(() => {
                runCenterAutoplay();
            });
            mutObserver.observe(resultsEl, { childList: true, subtree: true });
        }
    };

    setupAutoplayObserver();

    // Инициализация Turso Sync
    tursoSync.init();

    // Инициализация компонентов
    const tagSearch = new TagSearch({
        tagInput, arrowButton, tagModeToggle, activeTagsContainer, suggestionsContainer, r34ResultsCount
    });
    window.tagSearch = tagSearch;

    tagInput.placeholder = 'Поиск по тегам...';
    localStorage.removeItem('r34_search_mode');

    // Загрузка настроек с сервера при инициализации
    loadSettingsFromServer().then(() => {
        // После загрузки настроек применяем их к UI
        applyThemeSettings();
        setupAutoplayObserver();
    });

    // Загрузка turso config с сервера при инициализации
    loadTursoConfigFromServer();

    // Загрузка тегов с сервера при инициализации
    console.log('Starting to load excluded tags from server');
    loadExcludedTagsFromServer().then(tags => {
        console.log('Excluded tags loaded:', tags);
    });
    const gallery = new Gallery({
        resultsDiv, loader, r34ResultsCount
    });
    window.gallery = gallery;
    window.galleryApp = gallery;

    // Секретный триггер на заголовок для открытия Пазла
    let headerClicks = 0;
    let headerClickTimeout = null;
    const header = document.querySelector('h1');
    if (header) {
        header.style.cursor = 'pointer';
        header.title = 'чё вылупился';
        header.addEventListener('click', () => {
            headerClicks++;
            if (headerClickTimeout) clearTimeout(headerClickTimeout);
            
            if (headerClicks >= 5) {
                headerClicks = 0;
                
                // Check if video tag is in active tags before starting puzzle
                const activeTags = window.tagSearch ? window.tagSearch.activeTags.filter(t => t.active).map(t => t.value.toLowerCase()) : [];
                if (activeTags.includes('video')) {
                    const modal = document.createElement('div');
                    modal.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0, 0, 0, 0.6);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 100000;
                        animation: fadeIn 0.2s ease-out;
                    `;
                    
                    const modalContent = document.createElement('div');
                    modalContent.style.cssText = `
                        background: var(--modal-bg, rgba(4, 5, 9, 0.72));
                        color: white;
                        padding: 30px 40px;
                        border-radius: var(--radius-xl, 28px);
                        font-size: 1.2rem;
                        font-weight: 500;
                        max-width: 500px;
                        text-align: center;
                        box-shadow: var(--shadow-lg);
                        border: 1px solid var(--glass-border);
                        backdrop-filter: blur(var(--glass-blur));
                        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    `;
                    modalContent.textContent = "Уберите тэг 'video' из активных тэгов, чтобы играть в пазл!";
                    
                    const okBtn = document.createElement('button');
                    okBtn.textContent = 'ОК';
                    okBtn.style.cssText = `
                        margin-top: 25px;
                        padding: 12px 35px;
                        background: var(--accent, #ff3b6b);
                        color: white;
                        border: none;
                        border-radius: 12px;
                        font-size: 1rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 15px rgba(255, 59, 107, 0.3);
                    `;
                    okBtn.onmouseover = () => {
                        okBtn.style.transform = 'translateY(-2px)';
                        okBtn.style.boxShadow = '0 6px 20px rgba(255, 59, 107, 0.4)';
                    };
                    okBtn.onmouseout = () => {
                        okBtn.style.transform = 'translateY(0)';
                        okBtn.style.boxShadow = '0 4px 15px rgba(255, 59, 107, 0.3)';
                    };
                    okBtn.onclick = () => {
                        modal.style.animation = 'fadeOut 0.2s ease-out';
                        modalContent.style.animation = 'slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                        setTimeout(() => modal.remove(), 200);
                    };
                    
                    modalContent.appendChild(okBtn);
                    modal.appendChild(modalContent);
                    document.body.appendChild(modal);
                    
                    // Add animations if not exists
                    if (!document.getElementById('modal-animations')) {
                        const style = document.createElement('style');
                        style.id = 'modal-animations';
                        style.textContent = `
                            @keyframes fadeIn {
                                from { opacity: 0; }
                                to { opacity: 1; }
                            }
                            @keyframes fadeOut {
                                from { opacity: 1; }
                                to { opacity: 0; }
                            }
                            @keyframes slideUp {
                                from { transform: translateY(30px); opacity: 0; }
                                to { transform: translateY(0); opacity: 1; }
                            }
                            @keyframes slideDown {
                                from { transform: translateY(0); opacity: 1; }
                                to { transform: translateY(30px); opacity: 0; }
                            }
                        `;
                        document.head.appendChild(style);
                    }
                    
                    return;
                }
                
                const getEligiblePosts = () => {
                    const isFavActive = window.gallery && window.gallery.isFavoritesActive;
                    const allPosts = (window.gallery && Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts))
                        ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                        : [];
                    const isVideo = p => p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
                    const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
                    const isTooTall = p => {
                        if (allowLong) return false;
                        return p.width && p.height && (p.height / p.width > 1.4);
                    };
                    
                    const inactiveTags = window.tagSearch ? window.tagSearch.activeTags.filter(t => !t.active).map(t => t.value.toLowerCase()) : [];
                    const excludedTagsSet = new Set([...getSavedExcludedTags().map(t => t.toLowerCase()), ...inactiveTags]);

                    return allPosts.filter(p => {
                        if (!p || !p.file_url || isVideo(p) || isTooTall(p)) return false;
                        
                        if (p.tags) {
                            const postTags = p.tags.split(' ').filter(Boolean).map(t => t.toLowerCase());
                            const postTagsSet = new Set(postTags);
                            
                            // Check active (included) tags
                            for (const t of activeTags) {
                                if (!postTagsSet.has(t)) {
                                    return false;
                                }
                            }
                            
                            // Check excluded tags
                            for (const t of postTags) {
                                if (excludedTagsSet.has(t)) {
                                    return false;
                                }
                            }
                        } else if (activeTags.length > 0) {
                            return false;
                        }
                        
                        return true;
                    });
                };

                const loadMorePostsForPuzzle = async (forceLoad = false) => {
                    console.log('[Puzzle] loadMorePostsForPuzzle called', { forceLoad, puzzleActive: window.puzzleGameActive, loading, reachedEnd });
                    if (loading || reachedEnd) return false;
                    const modeGalleryBtn = document.getElementById('modeGalleryBtn');
                    if (modeGalleryBtn && !modeGalleryBtn.classList.contains('active')) {
                        return false;
                    }
                    // Set force flag if needed
                    if (forceLoad) {
                        window._forceLoadPosts = true;
                    }
                    page++;
                    try {
                        const currentQuery = window.tagSearch ? window.tagSearch.getTagsQuery() : lastTagsQuery;
                        await loadPosts(currentQuery, true);
                        window._forceLoadPosts = false;
                        return true;
                    } catch (e) {
                        console.error('Failed to load more posts for puzzle:', e);
                        window._forceLoadPosts = false;
                        return false;
                    }
                };

                const showPuzzleToast = (msg, duration = 3500) => {
                    const tempErr = document.getElementById('error');
                    if (tempErr) {
                        tempErr.textContent = msg;
                        tempErr.style.display = 'block';
                        tempErr.classList.add('active');
                        setTimeout(() => {
                            tempErr.style.display = 'none';
                            tempErr.classList.remove('active');
                        }, duration);
                    }
                };

                const getUnsolvedPost = (excludePostId = null) => {
                    const eligible = getEligiblePosts();
                    let solvedIds = [];
                    try {
                        solvedIds = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]');
                    } catch (err) {}
                    
                    let unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId);
                    if (unsolved.length === 0) {
                        unsolved = eligible.filter(p => p && p.id !== excludePostId);
                    }
                    if (unsolved.length === 0) {
                        unsolved = eligible;
                    }
                    if (unsolved.length === 0) return null;
                    const idx = Math.floor(Math.random() * unsolved.length);
                    return unsolved[idx];
                };

                const startGame = (currentPost) => {
                    if (!currentPost) {
                        showPuzzleToast("Не удалось найти подходящих медиа для пазла!", 4000);
                        return;
                    }
                    
                    // Set flag before any operations to prevent background loading
                    window.puzzleGameActive = true;
                    
                    // Pre-emptively fetch more in the background if pool is low (will be blocked by flag)
                    if (getEligiblePosts().length < 15) {
                        loadMorePostsForPuzzle();
                    }

                    const game = new PuzzleGame(currentPost, null, async () => {
                        // Request more media in the background upon completion/skip
                        loadMorePostsForPuzzle();
                        
                        const nextPost = getUnsolvedPost(currentPost ? currentPost.id : null);
                        if (nextPost) {
                            startGame(nextPost);
                        } else {
                            showPuzzleToast("Загружаем новые картинки...", 2500);
                            const loadedMore = await loadMorePostsForPuzzle(true); // Force load when no unsolved posts
                            const retryPost = getUnsolvedPost(currentPost ? currentPost.id : null);
                            if (retryPost) {
                                startGame(retryPost);
                            } else {
                                showPuzzleToast("В галерее больше нет подходящих картинок!", 4000);
                            }
                        }
                    });
                    game.start();
                };

                const initialEligible = getEligiblePosts();
                if (initialEligible.length === 0) {
                    showPuzzleToast("В галерее пусто, автоматически подгружаем картинки для пазла...", 4000);
                    (async () => {
                        try {
                            const currentQuery = window.tagSearch ? window.tagSearch.getTagsQuery() : lastTagsQuery;
                            await loadPosts(currentQuery, false);
                            const loadedEligible = getEligiblePosts();
                            if (loadedEligible.length > 0) {
                                startGame(getUnsolvedPost(null));
                            } else {
                                showPuzzleToast("Не удалось найти подходящие картинки для пазла (видео и вертикальные пропускаются)!", 5000);
                            }
                        } catch (e) {
                            showPuzzleToast("Ошибка при загрузке картинок для пазла!", 4000);
                        }
                    })();
                } else {
                    startGame(getUnsolvedPost(null));
                }
            } else {
                headerClickTimeout = setTimeout(() => {
                    headerClicks = 0;
                }, 1500);
            }
        });
    }

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
    const settingsLongImageCheckbox = document.getElementById('settingsLongImageCheckbox');
    const settingsLowPowerCheckbox = document.getElementById('settingsLowPowerCheckbox');
    const settingsPuzzlePerformanceCheckbox = document.getElementById('settingsPuzzlePerformanceCheckbox');
    const settingsLoadLimitCheckbox = document.getElementById('settingsLoadLimitCheckbox');
    const settingsPreloadSelect = document.getElementById('settingsPreloadSelect');
    const settingsDeveloperModeCheckbox = document.getElementById('settingsDeveloperModeCheckbox');
    const settingsResetTagsBtn = document.getElementById('settingsResetTagsBtn');
    const settingsClearCacheBtn = document.getElementById('settingsClearCacheBtn');

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
                    combineGroup.style.opacity = '0.4';
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

    // 1. Открытие/закрытие модального окна настроек
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
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
            
            // Колонки
            const savedCols = localStorage.getItem('r34_gallery_cols') || '1';
            const savedIsCustom = localStorage.getItem('r34_gallery_is_custom') === 'true';
            updateColumnsSelectorUI(savedCols, savedIsCustom);
            
            // HD качество фото
            settingsHdCheckbox.checked = localStorage.getItem('r34_hd_enabled') === 'true';
            
            // Event handler for HD quality setting
            if (settingsHdCheckbox) {
                settingsHdCheckbox.addEventListener('change', () => {
                    localStorage.setItem('r34_hd_enabled', settingsHdCheckbox.checked ? 'true' : 'false');
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
            if (settingsOnlyGifsCheckbox) {
                settingsOnlyGifsCheckbox.checked = localStorage.getItem('r34_only_gifs') === 'true';
            }
            settingsAutoSlideCheckbox.checked = localStorage.getItem('r34_auto_slide') === 'true';
            settingsLongImageCheckbox.checked = localStorage.getItem('r34_long_image_protection') === 'true';
            if (settingsLowPowerCheckbox) {
                settingsLowPowerCheckbox.checked = localStorage.getItem('r34_low_power_mode') === 'true';
            }
            if (settingsPuzzlePerformanceCheckbox) {
                settingsPuzzlePerformanceCheckbox.checked = localStorage.getItem('r34_puzzle_perf_mode') === 'true';
            }

            if (settingsLoadLimitCheckbox) {
                settingsLoadLimitCheckbox.checked = localStorage.getItem('r34_load_limit_enabled') === 'true';
            }
            
            // Event handler for Save Data setting
            const settingsSaveDataCheckbox = document.getElementById('settingsSaveDataCheckbox');
            if (settingsSaveDataCheckbox) {
                settingsSaveDataCheckbox.checked = localStorage.getItem('r34_save_data') === 'true';
                settingsSaveDataCheckbox.addEventListener('change', () => {
                    localStorage.setItem('r34_save_data', settingsSaveDataCheckbox.checked ? 'true' : 'false');
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

            // Синхронизация продвинутых настроек
            // 1. Акцентный цвет
            const currentAccent = localStorage.getItem('r34_theme_accent') || 'pink';
            document.querySelectorAll('#settingsThemeColors .theme-color-dot').forEach(dot => {
                if (dot.getAttribute('data-color') === currentAccent) {
                    dot.classList.add('active');
                    dot.style.borderColor = '#fff';
                    dot.style.transform = 'scale(1.15)';
                } else {
                    dot.classList.remove('active');
                    dot.style.borderColor = 'transparent';
                    dot.style.transform = 'scale(1)';
                }
            });

            // Синхронизация кастомного ввода акцента
            const settingsAccentColorPicker = document.getElementById('settingsAccentColorPicker');
            const settingsAccentManual = document.getElementById('settingsAccentManual');
            if (settingsAccentColorPicker && settingsAccentManual) {
                if (currentAccent.startsWith('#')) {
                    settingsAccentColorPicker.value = extractHexColor(currentAccent);
                    settingsAccentManual.value = currentAccent;
                } else {
                    const pr = colorPresets[currentAccent] || colorPresets.pink;
                    settingsAccentColorPicker.value = extractHexColor(pr.accent);
                    settingsAccentManual.value = pr.accent;
                }
            }

            // 2. Фон интерфейса
            const settingsBgSelect = document.getElementById('settingsBgSelect');
            const settingsBgManual = document.getElementById('settingsBgManual');
            const currentBg = localStorage.getItem('r34_theme_bg') || 'midnight';
            if (settingsBgSelect) {
                if (bgPresets[currentBg]) {
                    settingsBgSelect.value = currentBg;
                } else {
                    settingsBgSelect.value = 'midnight';
                }
            }
            if (settingsBgManual) {
                settingsBgManual.value = currentBg;
            }

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
                settingsHoverSelect.value = localStorage.getItem('r34_hover_style') || 'zoom';
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

            // Sync new advanced settings variables
            const cardBgOpacity = localStorage.getItem('r34_card_bg_opacity') || '85';
            const settingsCardOpacityInput = document.getElementById('settingsCardOpacityInput');
            const settingsCardOpacityManual = document.getElementById('settingsCardOpacityManual');
            const settingsCardOpacityValue = document.getElementById('settingsCardOpacityValue');
            if (settingsCardOpacityInput) {
                settingsCardOpacityInput.value = cardBgOpacity;
                setRangeGradient(settingsCardOpacityInput);
            }
            if (settingsCardOpacityManual) settingsCardOpacityManual.value = cardBgOpacity;
            if (settingsCardOpacityValue) settingsCardOpacityValue.textContent = cardBgOpacity + '%';

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

            // Custom CSS
            const settingsCustomCssCheckbox = document.getElementById('settingsCustomCssCheckbox');
            const customCssEditorContainer = document.getElementById('customCssEditorContainer');
            const customCssEditor = document.getElementById('customCssEditor');
            
            if (settingsCustomCssCheckbox) {
                const customCssEnabled = localStorage.getItem('r34_custom_css_enabled') === 'true';
                settingsCustomCssCheckbox.checked = customCssEnabled;
                if (customCssEditorContainer) {
                    customCssEditorContainer.style.display = customCssEnabled ? 'block' : 'none';
                }
            }
            if (customCssEditor) {
                customCssEditor.value = localStorage.getItem('r34_custom_css') || '';
            }

            const cardBgBlur = localStorage.getItem('r34_card_bg_blur') || '0';
            const settingsCardBlurInput = document.getElementById('settingsCardBlurInput');
            const settingsCardBlurManual = document.getElementById('settingsCardBlurManual');
            const settingsCardBlurValue = document.getElementById('settingsCardBlurValue');
            if (settingsCardBlurInput) {
                settingsCardBlurInput.value = cardBgBlur;
                setRangeGradient(settingsCardBlurInput);
            }
            if (settingsCardBlurManual) settingsCardBlurManual.value = cardBgBlur;
            if (settingsCardBlurValue) settingsCardBlurValue.textContent = cardBgBlur + 'px';

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

    function checkAndRemoveModalOpenClass() {
        const activeModal = document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-completed-modal, .puzzle-stats-modal, .tag-modal[style*="display: flex"], .tag-modal[style*="display:flex"]');
        if (!activeModal) {
            document.body.classList.remove('modal-open');
            document.documentElement.classList.remove('modal-open');
        }
    }

    if (settingsCloseBtn && settingsModal) {
        settingsCloseBtn.addEventListener('click', () => {
            settingsModal.classList.remove('open');
            if (typeof stopDemoScroll === 'function') stopDemoScroll();
            checkAndRemoveModalOpenClass();
        });
        
        // Закрытие при клике по фону
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('open');
                if (typeof stopDemoScroll === 'function') stopDemoScroll();
                checkAndRemoveModalOpenClass();
            }
        });
    }

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
    const colorDots = document.querySelectorAll('#settingsThemeColors .theme-color-dot');
    const settingsAccentColorPicker = document.getElementById('settingsAccentColorPicker');
    const settingsAccentManual = document.getElementById('settingsAccentManual');

    // Клик по готовым точкам
    colorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            const color = dot.getAttribute('data-color');
            localStorage.setItem('r34_theme_accent', color);
            
            colorDots.forEach(d => {
                d.classList.remove('active');
                d.style.borderColor = 'transparent';
                d.style.transform = 'scale(1)';
            });
            dot.classList.add('active');
            dot.style.borderColor = '#fff';
            dot.style.transform = 'scale(1.15)';
            
            // Синхронизируем пикер и текстовое поле
            const pr = colorPresets[color] || colorPresets.pink;
            if (settingsAccentColorPicker) settingsAccentColorPicker.value = pr.accent;
            if (settingsAccentManual) settingsAccentManual.value = pr.accent;

            applyThemeSettings();
            updateTabColors();
        });
    });

    // Изменение в пикере цвета
    if (settingsAccentColorPicker) {
        settingsAccentColorPicker.addEventListener('input', () => {
            const hex = settingsAccentColorPicker.value;
            if (settingsAccentManual) settingsAccentManual.value = hex;
            localStorage.setItem('r34_theme_accent', hex);
            
            // Сбрасываем активные точки пресетов
            colorDots.forEach(d => {
                d.classList.remove('active');
                d.style.borderColor = 'transparent';
                d.style.transform = 'scale(1)';
            });

            applyThemeSettings();
            updateTabColors();
        });
    }

    // Ручной ввод цвета текстом
    if (settingsAccentManual) {
        settingsAccentManual.addEventListener('input', () => {
            let hex = settingsAccentManual.value.trim();
            if (hex.match(/^#[0-9a-fA-F]{3,6}$/)) {
                if (settingsAccentColorPicker) settingsAccentColorPicker.value = extractHexColor(hex);
                localStorage.setItem('r34_theme_accent', hex);
                
                colorDots.forEach(d => {
                    d.classList.remove('active');
                    d.style.borderColor = 'transparent';
                    d.style.transform = 'scale(1)';
                });

                applyThemeSettings();
                updateTabColors();
            }
        });
    }

    // 2. Фон интерфейса
    const settingsBgSelect = document.getElementById('settingsBgSelect');
    const settingsBgManual = document.getElementById('settingsBgManual');

    if (settingsBgSelect) {
        settingsBgSelect.addEventListener('change', () => {
            const val = settingsBgSelect.value;
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
                
                // Если совпадает с пресетом, выделим его в селекте
                if (settingsBgSelect) {
                    if (bgPresets[val]) {
                        settingsBgSelect.value = val;
                    } else {
                        // Оставляем пустой или без изменений
                    }
                }
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
                settingsColWidthInput.value = Math.min(Math.max(val, 160), 480); // slider bound
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

    // Advanced Setting: Card opacity
    const settingsCardOpacityInput = document.getElementById('settingsCardOpacityInput');
    const settingsCardOpacityManual = document.getElementById('settingsCardOpacityManual');
    const settingsCardOpacityValue = document.getElementById('settingsCardOpacityValue');

    if (settingsCardOpacityInput && settingsCardOpacityValue) {
        settingsCardOpacityInput.addEventListener('input', () => {
            const val = settingsCardOpacityInput.value;
            settingsCardOpacityValue.textContent = val + '%';
            if (settingsCardOpacityManual) settingsCardOpacityManual.value = val;
            
            // Immediate visual feedback
            document.documentElement.style.setProperty('--card-bg-opacity', (parseFloat(val) / 100).toFixed(2));
            setRangeGradient(settingsCardOpacityInput);
            
            debouncedSaveSetting('r34_card_bg_opacity', val);
        });
    }

    if (settingsCardOpacityManual) {
        settingsCardOpacityManual.addEventListener('input', () => {
            let val = parseInt(settingsCardOpacityManual.value, 10);
            if (isNaN(val)) val = 0;
            if (val < 0) val = 0;
            if (val > 100) val = 100;

            if (settingsCardOpacityInput) {
                settingsCardOpacityInput.value = val;
                setRangeGradient(settingsCardOpacityInput);
            }
            if (settingsCardOpacityValue) {
                settingsCardOpacityValue.textContent = val + '%';
            }
            localStorage.setItem('r34_card_bg_opacity', val);
            applyThemeSettings();
        });
    }

    // Advanced Setting: Card blur
    const settingsCardBlurInput = document.getElementById('settingsCardBlurInput');
    const settingsCardBlurManual = document.getElementById('settingsCardBlurManual');
    const settingsCardBlurValue = document.getElementById('settingsCardBlurValue');

    if (settingsCardBlurInput && settingsCardBlurValue) {
        settingsCardBlurInput.addEventListener('input', () => {
            const val = settingsCardBlurInput.value;
            settingsCardBlurValue.textContent = val + 'px';
            if (settingsCardBlurManual) settingsCardBlurManual.value = val;
            
            // Immediate visual feedback
            document.documentElement.style.setProperty('--card-bg-blur', val + 'px');
            setRangeGradient(settingsCardBlurInput);
            
            debouncedSaveSetting('r34_card_bg_blur', val);
        });
    }

    if (settingsCardBlurManual) {
        settingsCardBlurManual.addEventListener('input', () => {
            let val = parseInt(settingsCardBlurManual.value, 10);
            if (isNaN(val)) val = 0;
            if (val < 0) val = 0;
            if (val > 24) val = 24;

            if (settingsCardBlurInput) {
                settingsCardBlurInput.value = val;
                setRangeGradient(settingsCardBlurInput);
            }
            if (settingsCardBlurValue) {
                settingsCardBlurValue.textContent = val + 'px';
            }
            localStorage.setItem('r34_card_bg_blur', val);
            applyThemeSettings();
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
            if (val < 2) val = 2;
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

    // --- API SETTINGS HANDLERS ---
    
    // API Limit
    const settingsApiLimitInput = document.getElementById('settingsApiLimitInput');
    const settingsApiLimitManual = document.getElementById('settingsApiLimitManual');
    const settingsApiLimitValue = document.getElementById('settingsApiLimitValue');
    
    if (settingsApiLimitInput && settingsApiLimitValue) {
        settingsApiLimitInput.addEventListener('input', () => {
            const val = settingsApiLimitInput.value;
            settingsApiLimitValue.textContent = val;
            if (settingsApiLimitManual) settingsApiLimitManual.value = val;
            localStorage.setItem('r34_api_limit', val);
            setRangeGradient(settingsApiLimitInput);
        });
    }
    
    if (settingsApiLimitManual) {
        settingsApiLimitManual.addEventListener('input', () => {
            let val = parseInt(settingsApiLimitManual.value, 10);
            if (isNaN(val)) val = 40;
            if (val < 1) val = 1;
            if (val > 100) val = 100;
            
            if (settingsApiLimitInput) {
                settingsApiLimitInput.value = val;
                setRangeGradient(settingsApiLimitInput);
            }
            if (settingsApiLimitValue) {
                settingsApiLimitValue.textContent = val;
            }
            localStorage.setItem('r34_api_limit', val);
        });
    }
    
    // API Timeout
    const settingsApiTimeoutInput = document.getElementById('settingsApiTimeoutInput');
    const settingsApiTimeoutManual = document.getElementById('settingsApiTimeoutManual');
    const settingsApiTimeoutValue = document.getElementById('settingsApiTimeoutValue');
    
    if (settingsApiTimeoutInput && settingsApiTimeoutValue) {
        settingsApiTimeoutInput.addEventListener('input', () => {
            const val = settingsApiTimeoutInput.value;
            settingsApiTimeoutValue.textContent = val + 'с';
            if (settingsApiTimeoutManual) settingsApiTimeoutManual.value = val;
            localStorage.setItem('r34_api_timeout', val);
            setRangeGradient(settingsApiTimeoutInput);
        });
    }
    
    if (settingsApiTimeoutManual) {
        settingsApiTimeoutManual.addEventListener('input', () => {
            let val = parseInt(settingsApiTimeoutManual.value, 10);
            if (isNaN(val)) val = 15;
            if (val < 5) val = 5;
            if (val > 60) val = 60;
            
            if (settingsApiTimeoutInput) {
                settingsApiTimeoutInput.value = val;
                setRangeGradient(settingsApiTimeoutInput);
            }
            if (settingsApiTimeoutValue) {
                settingsApiTimeoutValue.textContent = val + 'с';
            }
            localStorage.setItem('r34_api_timeout', val);
        });
    }
    
    // API Retries
    const settingsApiRetriesInput = document.getElementById('settingsApiRetriesInput');
    const settingsApiRetriesManual = document.getElementById('settingsApiRetriesManual');
    const settingsApiRetriesValue = document.getElementById('settingsApiRetriesValue');
    
    if (settingsApiRetriesInput && settingsApiRetriesValue) {
        settingsApiRetriesInput.addEventListener('input', () => {
            const val = settingsApiRetriesInput.value;
            settingsApiRetriesValue.textContent = val;
            if (settingsApiRetriesManual) settingsApiRetriesManual.value = val;
            localStorage.setItem('r34_api_retries', val);
            setRangeGradient(settingsApiRetriesInput);
        });
    }
    
    if (settingsApiRetriesManual) {
        settingsApiRetriesManual.addEventListener('input', () => {
            let val = parseInt(settingsApiRetriesManual.value, 10);
            if (isNaN(val)) val = 3;
            if (val < 0) val = 0;
            if (val > 10) val = 10;
            
            if (settingsApiRetriesInput) {
                settingsApiRetriesInput.value = val;
                setRangeGradient(settingsApiRetriesInput);
            }
            if (settingsApiRetriesValue) {
                settingsApiRetriesValue.textContent = val;
            }
            localStorage.setItem('r34_api_retries', val);
        });
    }
    
    // API Retry Delay
    const settingsApiRetryDelayInput = document.getElementById('settingsApiRetryDelayInput');
    const settingsApiRetryDelayManual = document.getElementById('settingsApiRetryDelayManual');
    const settingsApiRetryDelayValue = document.getElementById('settingsApiRetryDelayValue');
    
    if (settingsApiRetryDelayInput && settingsApiRetryDelayValue) {
        settingsApiRetryDelayInput.addEventListener('input', () => {
            const val = settingsApiRetryDelayInput.value;
            settingsApiRetryDelayValue.textContent = val + 'с';
            if (settingsApiRetryDelayManual) settingsApiRetryDelayManual.value = val;
            localStorage.setItem('r34_api_retry_delay', val);
            setRangeGradient(settingsApiRetryDelayInput);
        });
    }
    
    if (settingsApiRetryDelayManual) {
        settingsApiRetryDelayManual.addEventListener('input', () => {
            let val = parseInt(settingsApiRetryDelayManual.value, 10);
            if (isNaN(val)) val = 2;
            if (val < 1) val = 1;
            if (val > 30) val = 30;
            
            if (settingsApiRetryDelayInput) {
                settingsApiRetryDelayInput.value = val;
                setRangeGradient(settingsApiRetryDelayInput);
            }
            if (settingsApiRetryDelayValue) {
                settingsApiRetryDelayValue.textContent = val + 'с';
            }
            localStorage.setItem('r34_api_retry_delay', val);
        });
    }

    // --- DESIGN PRESETS HANDLERS ---
    
    const designPresets = {
        minimal: {
            // Основные цвета
            'r34_theme_accent': 'pink',
            'r34_theme_bg': 'obsidian',
            'r34_card_border_color': 'rgba(255, 255, 255, 0.12)',
            
            // Карточки
            'r34_card_bg_opacity': '0',
            'r34_card_bg_blur': '0',
            'r34_card_border_width': '1',
            'r34_card_glow_intensity': '0',
            'r34_card_transition_speed': '150',
            'r34_card_tags_display': 'true',
            
            // Геометрия
            'r34_media_radius': '8',
            'r34_media_gap': '16',
            'r34_col_width': '280',
            
            // Эффекты
            'r34_hover_style': 'none',
            'r34_reduced_motion': 'true',
            
            // Интерфейс
            'r34_header_style': 'transparent',
            'r34_tag_size': '10',
            'r34_base_font_size': '14',
            'r34_scrollbar_width': '6',
            'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.1)',
            
            // API
            'r34_api_limit': '60',
            'r34_api_timeout': '20',
            'r34_api_retries': '2'
        },
        glass: {
            // Основные цвета
            'r34_theme_accent': 'pink',
            'r34_theme_bg': 'midnight',
            'r34_card_border_color': 'rgba(255, 255, 255, 0.08)',
            
            // Карточки
            'r34_card_bg_opacity': '55',
            'r34_card_bg_blur': '14',
            'r34_card_border_width': '1',
            'r34_card_glow_intensity': '45',
            'r34_card_transition_speed': '300',
            'r34_card_tags_display': 'true',
            
            // Геометрия
            'r34_media_radius': '20',
            'r34_media_gap': '24',
            'r34_col_width': '300',
            
            // Эффекты
            'r34_hover_style': 'zoom',
            'r34_reduced_motion': 'false',
            
            // Интерфейс
            'r34_header_style': 'glass',
            'r34_tag_size': '11',
            'r34_base_font_size': '16',
            'r34_scrollbar_width': '8',
            'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.14)',
            
            // API
            'r34_api_limit': '40',
            'r34_api_timeout': '15',
            'r34_api_retries': '3'
        },
        brutalist: {
            // Основные цвета
            'r34_theme_accent': 'orange',
            'r34_theme_bg': 'obsidian',
            'r34_card_border_color': '#ffffff',
            
            // Карточки
            'r34_card_bg_opacity': '100',
            'r34_card_bg_blur': '0',
            'r34_card_border_width': '3',
            'r34_card_glow_intensity': '0',
            'r34_card_transition_speed': '200',
            'r34_card_tags_display': 'true',
            
            // Геометрия
            'r34_media_radius': '0',
            'r34_media_gap': '20',
            'r34_col_width': '320',
            
            // Эффекты
            'r34_hover_style': 'borderPop',
            'r34_reduced_motion': 'false',
            
            // Интерфейс
            'r34_header_style': 'dark',
            'r34_tag_size': '12',
            'r34_base_font_size': '16',
            'r34_scrollbar_width': '10',
            'r34_scrollbar_thumb_color': '#ffffff',
            
            // API
            'r34_api_limit': '50',
            'r34_api_timeout': '15',
            'r34_api_retries': '2'
        },
        neon: {
            // Основные цвета
            'r34_theme_accent': 'cyan',
            'r34_theme_bg': 'midnight',
            'r34_card_border_color': 'rgba(0, 255, 255, 0.5)',
            
            // Карточки
            'r34_card_bg_opacity': '70',
            'r34_card_bg_blur': '8',
            'r34_card_border_width': '2',
            'r34_card_glow_intensity': '85',
            'r34_card_transition_speed': '250',
            'r34_card_tags_display': 'true',
            
            // Геометрия
            'r34_media_radius': '12',
            'r34_media_gap': '20',
            'r34_col_width': '300',
            
            // Эффекты
            'r34_hover_style': 'glow',
            'r34_reduced_motion': 'false',
            
            // Интерфейс
            'r34_header_style': 'accent',
            'r34_tag_size': '11',
            'r34_base_font_size': '16',
            'r34_scrollbar_width': '8',
            'r34_scrollbar_thumb_color': 'rgba(0, 255, 255, 0.4)',
            
            // API
            'r34_api_limit': '40',
            'r34_api_timeout': '15',
            'r34_api_retries': '3'
        },
        classic: {
            // Основные цвета
            'r34_theme_accent': 'pink',
            'r34_theme_bg': 'obsidian',
            'r34_card_border_color': 'rgba(255, 255, 255, 0.06)',
            
            // Карточки
            'r34_card_bg_opacity': '90',
            'r34_card_bg_blur': '0',
            'r34_card_border_width': '1',
            'r34_card_glow_intensity': '20',
            'r34_card_transition_speed': '300',
            'r34_card_tags_display': 'true',
            
            // Геометрия
            'r34_media_radius': '16',
            'r34_media_gap': '24',
            'r34_col_width': '300',
            
            // Эффекты
            'r34_hover_style': 'slide',
            'r34_reduced_motion': 'false',
            
            // Интерфейс
            'r34_header_style': 'dark',
            'r34_tag_size': '11',
            'r34_base_font_size': '16',
            'r34_scrollbar_width': '8',
            'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.16)',
            
            // API
            'r34_api_limit': '40',
            'r34_api_timeout': '15',
            'r34_api_retries': '3'
        },
        // Новые пользовательские пресеты
        performance: {
            // Основные цвета
            'r34_theme_accent': 'pink',
            'r34_theme_bg': 'obsidian',
            'r34_card_border_color': 'rgba(255, 255, 255, 0.05)',
            
            // Карточки
            'r34_card_bg_opacity': '0',
            'r34_card_bg_blur': '0',
            'r34_card_border_width': '0',
            'r34_card_glow_intensity': '0',
            'r34_card_transition_speed': '100',
            'r34_card_tags_display': 'false',
            
            // Геометрия
            'r34_media_radius': '4',
            'r34_media_gap': '12',
            'r34_col_width': '250',
            
            // Эффекты
            'r34_hover_style': 'none',
            'r34_reduced_motion': 'true',
            'r34_low_power_mode': 'true',
            'r34_load_limit_enabled': 'true',
            
            // Интерфейс
            'r34_header_style': 'transparent',
            'r34_tag_size': '9',
            'r34_base_font_size': '14',
            'r34_scrollbar_width': '4',
            'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.08)',
            
            // API
            'r34_api_limit': '30',
            'r34_api_timeout': '10',
            'r34_api_retries': '1',
            'r34_preload_mode': 'off'
        },
        mobile: {
            // Основные цвета
            'r34_theme_accent': 'pink',
            'r34_theme_bg': 'midnight',
            'r34_card_border_color': 'rgba(255, 255, 255, 0.08)',
            
            // Карточки
            'r34_card_bg_opacity': '40',
            'r34_card_bg_blur': '8',
            'r34_card_border_width': '1',
            'r34_card_glow_intensity': '30',
            'r34_card_transition_speed': '200',
            'r34_card_tags_display': 'true',
            
            // Геометрия
            'r34_media_radius': '12',
            'r34_media_gap': '12',
            'r34_col_width': '150',
            
            // Эффекты
            'r34_hover_style': 'pulse',
            'r34_reduced_motion': 'true',
            'r34_fast_open_mode': 'true',
            
            // Интерфейс
            'r34_header_style': 'glass',
            'r34_tag_size': '10',
            'r34_base_font_size': '15',
            'r34_scrollbar_width': '6',
            'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.12)',
            
            // API
            'r34_api_limit': '25',
            'r34_api_timeout': '20',
            'r34_api_retries': '2',
            'r34_preload_mode': 'near'
        },
        cinema: {
            // Основные цвета
            'r34_theme_accent': 'violet',
            'r34_theme_bg': 'midnight',
            'r34_card_border_color': 'rgba(167, 139, 250, 0.2)',
            
            // Карточки
            'r34_card_bg_opacity': '20',
            'r34_card_bg_blur': '4',
            'r34_card_border_width': '1',
            'r34_card_glow_intensity': '60',
            'r34_card_transition_speed': '400',
            'r34_card_tags_display': 'false',
            
            // Геометрия
            'r34_media_radius': '0',
            'r34_media_gap': '8',
            'r34_col_width': '400',
            
            // Эффекты
            'r34_hover_style': 'zoom',
            'r34_reduced_motion': 'false',
            
            // Интерфейс
            'r34_header_style': 'transparent',
            'r34_tag_size': '10',
            'r34_base_font_size': '16',
            'r34_scrollbar_width': '4',
            'r34_scrollbar_thumb_color': 'rgba(167, 139, 250, 0.3)',
            
            // API
            'r34_api_limit': '20',
            'r34_api_timeout': '25',
            'r34_api_retries': '3',
            'r34_api_cache_enabled': 'true'
        },
        light: {
            // Основные цвета
            'r34_theme_accent': 'blue',
            'r34_theme_bg': '#f0f2f5',
            'r34_card_border_color': 'rgba(0, 0, 0, 0.1)',
            
            // Карточки
            'r34_card_bg_opacity': '95',
            'r34_card_bg_blur': '0',
            'r34_card_border_width': '1',
            'r34_card_glow_intensity': '10',
            'r34_card_transition_speed': '300',
            'r34_card_tags_display': 'true',
            
            // Геометрия
            'r34_media_radius': '16',
            'r34_media_gap': '24',
            'r34_col_width': '300',
            
            // Эффекты
            'r34_hover_style': 'slide',
            'r34_reduced_motion': 'false',
            
            // Интерфейс
            'r34_header_style': 'dark',
            'r34_tag_size': '11',
            'r34_base_font_size': '16',
            'r34_scrollbar_width': '8',
            'r34_scrollbar_thumb_color': 'rgba(0, 0, 0, 0.2)',
            
            // API
            'r34_api_limit': '40',
            'r34_api_timeout': '15',
            'r34_api_retries': '3'
        }
    };
    
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.getAttribute('data-preset');
            const presetConfig = designPresets[preset];
            
            if (presetConfig) {
                // Сначала сбрасываем все конфликтующие настройки
                const settingsToReset = [
                    'r34_card_bg_opacity', 'r34_card_bg_blur', 'r34_card_border_width',
                    'r34_card_glow_intensity', 'r34_card_transition_speed', 'r34_card_tags_display',
                    'r34_media_radius', 'r34_media_gap', 'r34_col_width',
                    'r34_hover_style', 'r34_reduced_motion',
                    'r34_header_style', 'r34_tag_size', 'r34_base_font_size',
                    'r34_scrollbar_width', 'r34_scrollbar_thumb_color',
                    'r34_theme_accent', 'r34_theme_bg', 'r34_card_border_color',
                    'r34_low_power_mode', 'r34_load_limit_enabled', 'r34_fast_open_mode',
                    'r34_api_limit', 'r34_api_timeout', 'r34_api_retries',
                    'r34_preload_mode'
                ];
                
                // Применяем настройки пресета
                Object.keys(presetConfig).forEach(key => {
                    localStorage.setItem(key, presetConfig[key]);
                });
                
                // Сбрасываем настройки, которые не в пресете
                settingsToReset.forEach(key => {
                    if (!presetConfig[key]) {
                        // Удаляем настройку, чтобы применилось значение по умолчанию
                        localStorage.removeItem(key);
                    }
                });
                
                // Update UI to reflect preset
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Apply theme settings
                applyThemeSettings();
                
                // Sync UI elements для всех известных настроек
                syncAllSettingsUI(presetConfig);
                
                // Принудительно обновляем все CSS переменные
                forceUpdateAllCSSVariables();
            }
        });
    });
    
    // Функция для синхронизации UI с настройками пресета
    function syncAllSettingsUI(presetConfig) {
        // Карточки
        if (settingsCardOpacityInput && presetConfig['r34_card_bg_opacity']) {
            settingsCardOpacityInput.value = presetConfig['r34_card_bg_opacity'];
            setRangeGradient(settingsCardOpacityInput);
        }
        if (settingsCardBlurInput && presetConfig['r34_card_bg_blur']) {
            settingsCardBlurInput.value = presetConfig['r34_card_bg_blur'];
            setRangeGradient(settingsCardBlurInput);
        }
        
        // API настройки
        if (settingsApiLimitInput && presetConfig['r34_api_limit']) {
            settingsApiLimitInput.value = presetConfig['r34_api_limit'];
            setRangeGradient(settingsApiLimitInput);
        }
        if (settingsApiTimeoutInput && presetConfig['r34_api_timeout']) {
            settingsApiTimeoutInput.value = presetConfig['r34_api_timeout'];
            setRangeGradient(settingsApiTimeoutInput);
        }
        
        // Другие настройки можно добавить по аналогии
    }
    
    // --- CUSTOM PRESETS SYSTEM ---
    
    function getCustomPresets() {
        try {
            const saved = localStorage.getItem('r34_custom_presets');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('Error loading custom presets:', e);
            return {};
        }
    }
    
    function saveCustomPresets(presets) {
        try {
            localStorage.setItem('r34_custom_presets', JSON.stringify(presets));
        } catch (e) {
            console.error('Error saving custom presets:', e);
            alert('Ошибка при сохранении пресета: ' + e.message);
        }
    }
    
    function renderCustomPresets() {
        const container = document.getElementById('customPresetsContainer');
        const list = document.getElementById('customPresetsList');
        if (!container || !list) return;
        
        const presets = getCustomPresets();
        const presetNames = Object.keys(presets);
        
        if (presetNames.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        list.innerHTML = '';
        
        presetNames.forEach(name => {
            const item = document.createElement('div');
            item.className = 'custom-preset-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'custom-preset-name';
            nameSpan.textContent = name;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'custom-preset-delete';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = 'Удалить пресет';
            deleteBtn.addEventListener('click', () => {
                if (confirm(`Удалить пресет "${name}"?`)) {
                    delete presets[name];
                    saveCustomPresets(presets);
                    renderCustomPresets();
                }
            });
            
            item.appendChild(nameSpan);
            item.appendChild(deleteBtn);
            
            item.addEventListener('click', (e) => {
                if (e.target !== deleteBtn) {
                    applyCustomPreset(presets[name]);
                }
            });
            
            list.appendChild(item);
        });
    }
    
    function applyCustomPreset(presetConfig) {
        if (!presetConfig || typeof presetConfig !== 'object') return;
        
        // Сбрасываем конфликтующие настройки
        const settingsToReset = [
            'r34_card_bg_opacity', 'r34_card_bg_blur', 'r34_card_border_width',
            'r34_card_glow_intensity', 'r34_card_transition_speed', 'r34_card_tags_display',
            'r34_media_radius', 'r34_media_gap', 'r34_col_width',
            'r34_hover_style', 'r34_reduced_motion',
            'r34_header_style', 'r34_tag_size', 'r34_base_font_size',
            'r34_scrollbar_width', 'r34_scrollbar_thumb_color',
            'r34_theme_accent', 'r34_theme_bg', 'r34_card_border_color',
            'r34_low_power_mode', 'r34_load_limit_enabled', 'r34_fast_open_mode',
            'r34_api_limit', 'r34_api_timeout', 'r34_api_retries',
            'r34_preload_mode', 'r34_custom_css_enabled', 'r34_custom_css'
        ];
        
        // Применяем настройки пресета
        Object.keys(presetConfig).forEach(key => {
            localStorage.setItem(key, presetConfig[key]);
        });
        
        // Сбрасываем настройки, которые не в пресете
        settingsToReset.forEach(key => {
            if (!presetConfig[key]) {
                localStorage.removeItem(key);
            }
        });
        
        // Apply theme settings
        applyThemeSettings();
        
        // Apply custom CSS if enabled
        if (presetConfig['r34_custom_css_enabled'] === 'true') {
            applyCustomCss();
        } else {
            // Remove custom CSS if disabled
            const customStyle = document.getElementById('r34-custom-css');
            if (customStyle) customStyle.remove();
        }
        
        // Sync UI
        syncAllSettingsUI(presetConfig);
        
        // Принудительно обновляем все CSS переменные для гарантии синхронизации
        forceUpdateAllCSSVariables();
        
        // Снимаем выделение с встроенных пресетов
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    }
    
    // Функция для принудительного обновления всех CSS переменных
    function forceUpdateAllCSSVariables() {
        if (typeof applyThemeSettings === 'function') {
            applyThemeSettings();
        }
    }
    
    // Save custom preset
    const savePresetBtn = document.getElementById('savePresetBtn');
    const customPresetName = document.getElementById('customPresetName');
    
    if (savePresetBtn && customPresetName) {
        savePresetBtn.addEventListener('click', () => {
            const name = customPresetName.value.trim();
            if (!name) {
                alert('Введите название пресета');
                return;
            }
            
            const presets = getCustomPresets();
            
            // Сохраняем все текущие настройки
            const currentSettings = getAllSettings();
            presets[name] = currentSettings;
            
            saveCustomPresets(presets);
            customPresetName.value = '';
            
            renderCustomPresets();
            
            alert(`Пресет "${name}" сохранен!`);
        });
    }
    
    // Render custom presets on load
    renderCustomPresets();

    // --- CUSTOM CSS EDITOR HANDLERS ---
    
    const settingsCustomCssCheckbox = document.getElementById('settingsCustomCssCheckbox');
    const customCssEditorContainer = document.getElementById('customCssEditorContainer');
    const customCssEditor = document.getElementById('customCssEditor');
    const applyCssBtn = document.getElementById('applyCssBtn');
    const clearCssBtn = document.getElementById('clearCssBtn');
    
    function applyCustomCss() {
        const customCss = localStorage.getItem('r34_custom_css') || '';
        let styleEl = document.getElementById('r34-custom-css');
        
        if (customCss && customCss.trim() !== '') {
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'r34-custom-css';
                document.head.appendChild(styleEl);
            }
            styleEl.textContent = customCss;
        } else {
            if (styleEl) {
                styleEl.remove();
            }
        }
    }
    
    if (settingsCustomCssCheckbox) {
        settingsCustomCssCheckbox.addEventListener('change', () => {
            const enabled = settingsCustomCssCheckbox.checked;
            localStorage.setItem('r34_custom_css_enabled', enabled ? 'true' : 'false');
            
            if (customCssEditorContainer) {
                customCssEditorContainer.style.display = enabled ? 'block' : 'none';
            }
            
            if (enabled) {
                applyCustomCss();
            } else {
                const styleEl = document.getElementById('r34-custom-css');
                if (styleEl) styleEl.remove();
            }
        });
    }
    
    if (applyCssBtn) {
        applyCssBtn.addEventListener('click', () => {
            if (customCssEditor) {
                const cssCode = customCssEditor.value;
                localStorage.setItem('r34_custom_css', cssCode);
                applyCustomCss();
            }
        });
    }
    
    if (clearCssBtn) {
        clearCssBtn.addEventListener('click', () => {
            if (customCssEditor) {
                customCssEditor.value = '';
                localStorage.setItem('r34_custom_css', '');
                const styleEl = document.getElementById('r34-custom-css');
                if (styleEl) styleEl.remove();
            }
        });
    }
    
    // Apply custom CSS on page load if enabled
    if (localStorage.getItem('r34_custom_css_enabled') === 'true') {
        applyCustomCss();
    }

    // --- IMPORT/EXPORT SETTINGS HANDLERS ---
    
    function getAllSettings() {
        const settings = {};
        // Collect all localStorage settings that start with 'r34_'
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('r34_')) {
                settings[key] = localStorage.getItem(key);
            }
        }
        return settings;
    }
    
    function applySettings(settings) {
        // Clear existing r34_ settings
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('r34_')) {
                localStorage.removeItem(key);
            }
        }
        
        // Apply new settings
        Object.keys(settings).forEach(key => {
            localStorage.setItem(key, settings[key]);
        });
        
        // Apply theme settings
        applyThemeSettings();
        
        // Apply custom CSS if enabled
        if (settings['r34_custom_css_enabled'] === 'true') {
            applyCustomCss();
        }
        
        // Reload page to apply all changes
        location.reload();
    }
    
    // Export theme
    const exportThemeBtn = document.getElementById('exportThemeBtn');
    if (exportThemeBtn) {
        exportThemeBtn.addEventListener('click', () => {
            const settings = getAllSettings();
            const themeData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                settings: settings
            };
            
            const blob = new Blob([JSON.stringify(themeData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `r34-theme-${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    
    // Import theme
    const importThemeBtn = document.getElementById('importThemeBtn');
    const importThemeInput = document.getElementById('importThemeInput');
    
    if (importThemeBtn && importThemeInput) {
        importThemeBtn.addEventListener('click', () => {
            importThemeInput.click();
        });
        
        importThemeInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const themeData = JSON.parse(event.target.result);
                    if (themeData.settings && typeof themeData.settings === 'object') {
                        if (confirm('Это заменит все текущие настройки. Продолжить?')) {
                            applySettings(themeData.settings);
                        }
                    } else {
                        alert('Неверный формат файла темы');
                    }
                } catch (error) {
                    alert('Ошибка при чтении файла: ' + error.message);
                }
            };
            reader.readAsText(file);
            importThemeInput.value = ''; // Reset input
        });
    }
    
    // Copy settings to clipboard
    const copySettingsBtn = document.getElementById('copySettingsBtn');
    if (copySettingsBtn) {
        copySettingsBtn.addEventListener('click', async () => {
            const settings = getAllSettings();
            const themeData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                settings: settings
            };
            
            try {
                await navigator.clipboard.writeText(JSON.stringify(themeData, null, 2));
                copySettingsBtn.textContent = 'Скопировано!';
                setTimeout(() => {
                    copySettingsBtn.textContent = 'Копировать';
                }, 2000);
            } catch (error) {
                alert('Ошибка при копировании: ' + error.message);
            }
        });
    }
    
    // Paste settings from clipboard
    const pasteSettingsBtn = document.getElementById('pasteSettingsBtn');
    if (pasteSettingsBtn) {
        pasteSettingsBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                const themeData = JSON.parse(text);
                
                if (themeData.settings && typeof themeData.settings === 'object') {
                    if (confirm('Это заменит все текущие настройки. Продолжить?')) {
                        applySettings(themeData.settings);
                    }
                } else {
                    alert('Неверный формат настроек в буфере обмена');
                }
            } catch (error) {
                alert('Ошибка при вставке: ' + error.message);
            }
        });
    }

    // --- АВТО-СКРОЛЛ ДЛЯ ЖИВОГО ПРЕДПРОСМОТРА (Demo scroll animation) ---
    let demoScrollInterval = null;
    let demoScrollDirection = 1; // 1 = down, -1 = up

    function startDemoScroll() {
        const container = document.getElementById('settingsPreviewArea');
        if (!container) return;

        if (demoScrollInterval) {
            stopDemoScroll();
            return;
        }

        const scrollBtn = document.getElementById('settingsDemoScrollBtn');
        if (scrollBtn) {
            scrollBtn.style.borderColor = 'var(--accent)';
            scrollBtn.style.color = 'var(--accent)';
            scrollBtn.querySelector('span').textContent = 'Стоп скролл';
            scrollBtn.querySelector('svg').innerHTML = '<rect x="4" y="4" width="4" height="16" fill="currentColor"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>';
        }

        let lastTime = performance.now();
        function step(time) {
            if (!demoScrollInterval) return;

            const container = document.getElementById('settingsPreviewArea');
            if (!container) {
                stopDemoScroll();
                return;
            }

            const maxScroll = container.scrollHeight - container.clientHeight;
            if (maxScroll <= 0) {
                demoScrollInterval = requestAnimationFrame(step);
                return;
            }

            const delta = (time - lastTime) * 0.05; // smooth speed
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
    };

    function stopDemoScroll() {
        if (demoScrollInterval) {
            cancelAnimationFrame(demoScrollInterval);
            demoScrollInterval = null;
        }
        const scrollBtn = document.getElementById('settingsDemoScrollBtn');
        if (scrollBtn) {
            scrollBtn.style.borderColor = 'var(--glass-border)';
            scrollBtn.style.color = '';
            scrollBtn.querySelector('span').textContent = 'Авто-скролл';
            scrollBtn.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21" fill="currentColor"></polygon>';
        }
    };

    const settingsDemoScrollBtn = document.getElementById('settingsDemoScrollBtn');
    if (settingsDemoScrollBtn) {
        settingsDemoScrollBtn.addEventListener('click', () => {
            if (demoScrollInterval) {
                stopDemoScroll();
            } else {
                startDemoScroll();
            }
        });
    }

    // 9. Инструкции (кнопки с восклицательным знаком)
    document.querySelectorAll('.info-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = btn.getAttribute('data-info');
            const targetBox = document.getElementById(`info-${key}`);
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
    });

    // Функция для показа кастомного модального окна подтверждения
    function showConfirmModal(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const cancelBtn = document.getElementById('confirm-modal-cancel');
            const confirmBtn = document.getElementById('confirm-modal-confirm');

            titleEl.textContent = title;
            messageEl.textContent = message;

            modal.classList.add('open');

            const cleanup = () => {
                modal.classList.remove('open');
                cancelBtn.removeEventListener('click', onCancel);
                confirmBtn.removeEventListener('click', onConfirm);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            const onConfirm = () => {
                cleanup();
                resolve(true);
            };

            cancelBtn.addEventListener('click', onCancel);
            confirmBtn.addEventListener('click', onConfirm);
        });
    }

    // 10. Кнопка сброса настроек
    const settingsResetBtn = document.getElementById('settingsResetBtn');
    if (settingsResetBtn) {
        settingsResetBtn.addEventListener('click', async () => {
            const confirmed = await showConfirmModal('Сбросить настройки', 'Вы уверены, что хотите сбросить все настройки?');
            if (!confirmed) {
                return;
            }
            if (typeof stopDemoScroll === 'function') stopDemoScroll();

            const defaults = {
                'r34_theme_accent': 'pink',
                'r34_theme_bg': 'midnight',
                'r34_media_radius': '20',
                'r34_media_gap': '24',
                'r34_col_width': '300',
                'r34_hover_style': 'shift',
                'r34_font_style': 'sans',
                'r34_video_autoplay': 'false',
                'r34_card_bg_opacity': '85',
                'r34_card_bg_blur': '0',
                'r34_card_tags_display': 'true',
                'r34_base_font_size': '16',
                'r34_scrollbar_width': '8',
                'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.16)',
                'r34_gif_autoplay': 'false',
                'r34_video_loop': 'true',
                'r34_video_hover_sound': 'false',
                'r34_default_volume': '50',
                'r34_custom_logo_text': '',
                'r34_api_limit': '60',
                'r34_api_timeout': '15',
                'r34_api_retries': '3',
                'r34_api_retry_delay': '2',
                'r34_custom_css_enabled': 'false',
                'r34_custom_css': '',
                'r34_card_border_width': '1',
                'r34_card_border_color': 'var(--glass-border)',
                'r34_card_transition_speed': '300',
                'r34_card_glow_intensity': '45',
                'r34_tag_size': '11',
                'r34_tags_only_on_hover': 'false',
                'r34_header_style': 'glass'
            };
            
            Object.keys(defaults).forEach(key => localStorage.setItem(key, defaults[key]));
            localStorage.removeItem('r34_forced_width');
            localStorage.removeItem('r34_forced_height');

            // Очищаем экспертные настройки
            const expertKeys = Object.keys(localStorage).filter(k => k.startsWith('r34_expert_'));
            expertKeys.forEach(k => localStorage.removeItem(k));
            if (typeof document !== 'undefined') {
                 // Сбросим значения инпутов
                 const list = document.getElementById('expertVariablesList');
                 if (list) {
                     const inputs = list.querySelectorAll('input');
                     inputs.forEach(input => {
                         input.value = input.placeholder;
                         input.dispatchEvent(new Event('input'));
                     });
                 }
            }

            // Применяем настройки
            applyThemeSettings();
            setupAutoplayObserver();

            // Обновляем UI вручную без перезагрузки
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
                { id: 'settingsHoverSelect', value: 'zoom' },
                { id: 'settingsFontSelect', value: 'sans' },
                { id: 'settingsFontManual', value: 'sans' },
                { id: 'settingsForcedWidth', value: '' },
                { id: 'settingsForcedHeight', value: '' },
                { id: 'settingsCardOpacityInput', value: '85' },
                { id: 'settingsCardOpacityManual', value: '85' },
                { id: 'settingsCardBlurInput', value: '0' },
                { id: 'settingsCardBlurManual', value: '0' },
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
            
            const checkbox = document.getElementById('settingsAutoplayCheckbox');
            if (checkbox) {
                checkbox.checked = false;
            }

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

            const headerStyleSelect = document.getElementById('settingsHeaderStyleSelect');
            if (headerStyleSelect) {
                headerStyleSelect.value = 'glass';
            }

            const radiusVal = document.getElementById('settingsRadiusValue');
            if (radiusVal) radiusVal.textContent = '20px';
            
            const gapVal = document.getElementById('settingsGapValue');
            if (gapVal) gapVal.textContent = '24px';
            
            const colVal = document.getElementById('settingsColWidthValue');
            if (colVal) colVal.textContent = '300px';

            const opacityVal = document.getElementById('settingsCardOpacityValue');
            if (opacityVal) opacityVal.textContent = '85%';

            const blurVal = document.getElementById('settingsCardBlurValue');
            if (blurVal) blurVal.textContent = '0px';

            const baseFontVal = document.getElementById('settingsBaseFontValue');
            if (baseFontVal) baseFontVal.textContent = '16px';

            const scrollbarWidthVal = document.getElementById('settingsScrollbarWidthValue');
            if (scrollbarWidthVal) scrollbarWidthVal.textContent = '8px';

            const defaultVolumeVal = document.getElementById('settingsDefaultVolumeValue');
            if (defaultVolumeVal) defaultVolumeVal.textContent = '50%';

            const borderWidthVal = document.getElementById('settingsCardBorderWidthValue');
            if (borderWidthVal) borderWidthVal.textContent = '1px';

            const transitionVal = document.getElementById('settingsCardTransitionValue');
            if (transitionVal) transitionVal.textContent = '300ms';

            const glowIntensityVal = document.getElementById('settingsCardGlowValue');
            if (glowIntensityVal) glowIntensityVal.textContent = '45%';

            const tagSizeVal = document.getElementById('settingsTagSizeValue');
            if (tagSizeVal) tagSizeVal.textContent = '11px';

            const apiLimitVal = document.getElementById('settingsApiLimitValue');
            if (apiLimitVal) apiLimitVal.textContent = '40';

            const apiTimeoutVal = document.getElementById('settingsApiTimeoutValue');
            if (apiTimeoutVal) apiTimeoutVal.textContent = '15с';

            const apiRetriesVal = document.getElementById('settingsApiRetriesValue');
            if (apiRetriesVal) apiRetriesVal.textContent = '3';

            const apiRetryDelayVal = document.getElementById('settingsApiRetryDelayValue');
            if (apiRetryDelayVal) apiRetryDelayVal.textContent = '2с';

            document.querySelectorAll('.theme-color-dot').forEach(d => {
                d.classList.remove('active');
                d.style.borderColor = 'transparent';
                d.style.transform = 'scale(1)';
            });
            
            const pinkDot = document.querySelector('.theme-color-dot[data-color="pink"]');
            if (pinkDot) {
                pinkDot.classList.add('active');
                pinkDot.style.borderColor = '#fff';
                pinkDot.style.transform = 'scale(1.15)';
            }
        });
    }

    // Закрытие подсказок при клике в любое место
    document.addEventListener('click', () => {
        document.querySelectorAll('.info-help-box').forEach(box => {
            box.style.display = 'none';
        });
    });

    // Вспомогательная функция для обновления кнопок колонок
    function updateColumnsSelectorUI(cols, isCustom) {
        if (!settingsColumnsGroup) return;
        const buttons = settingsColumnsGroup.querySelectorAll('.col-btn');
        buttons.forEach(btn => {
            const dataCols = btn.getAttribute('data-cols');
            if (dataCols === cols.toString()) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        const numCols = parseInt(cols, 10) || 1;
        const optWarning = document.getElementById('columnsOptWarning');
        const optNote = document.getElementById('columnsOptNote');
        if (optWarning) optWarning.style.display = numCols >= 2 ? 'inline-flex' : 'none';
        if (optNote) optNote.style.display = numCols >= 2 ? 'block' : 'none';
    }

    // Обработчики кликов по кнопкам колонок
    if (settingsColumnsGroup) {
        settingsColumnsGroup.addEventListener('click', (e) => {
            const btn = e.target.closest('.col-btn');
            if (!btn) return;
            
            const colsVal = btn.getAttribute('data-cols');
            const num = parseInt(colsVal, 10);
            if (!isNaN(num)) {
                gallery.setColumns(num, false);
                updateColumnsSelectorUI(colsVal, false);
            }
        });
    }

    // Инициализация колонок при первом запуске (без открытия настроек)
    const initCols = localStorage.getItem('r34_gallery_cols') || '1';
    const initIsCustom = localStorage.getItem('r34_gallery_is_custom') === 'true';
    gallery.setColumns(parseInt(initCols, 10), initIsCustom);
    updateColumnsSelectorUI(initCols, initIsCustom);

    // Изменение сортировки в настройках
    if (settingsSortSelect) {
        settingsSortSelect.addEventListener('change', () => {
            const val = settingsSortSelect.value;
            currentSort = val;
            localStorage.setItem('r34_current_sort', val);
            
            updateLikesGroupVisibility();
            
            page = 0;
            reachedEnd = false;
            isInitialLoad = true;
            gallery.realCount = undefined;
            immediateLoadPosts(tagSearch.getTagsQuery(), false);
        });
    }

    // Совместить случайный поиск с лайками checkbox
    const settingsCombineRandomLikesCheckbox = document.getElementById('settingsCombineRandomLikesCheckbox');
    if (settingsCombineRandomLikesCheckbox) {
        settingsCombineRandomLikesCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_combine_random_likes', settingsCombineRandomLikesCheckbox.checked ? 'true' : 'false');
            updateLikesGroupVisibility();
            
            if (currentSort === 'random') {
                page = 0;
                reachedEnd = false;
                isInitialLoad = true;
                gallery.realCount = undefined;
                immediateLoadPosts(tagSearch.getTagsQuery(), false);
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
            // Если выбран режим лайков или совмещение активных лайков со случайным поиском, перезагружаем с задержкой (debounce)
            if (currentSort === 'likes' || (currentSort === 'random' && combineEnabled)) {
                if (minLikesDebounceTimeout) clearTimeout(minLikesDebounceTimeout);
                minLikesDebounceTimeout = setTimeout(() => {
                    page = 0;
                    reachedEnd = false;
                    isInitialLoad = true;
                    gallery.realCount = undefined;
                    immediateLoadPosts(tagSearch.getTagsQuery(), false);
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
                page = 0;
                reachedEnd = false;
                isInitialLoad = true;
                gallery.realCount = undefined;
                immediateLoadPosts(tagSearch.getTagsQuery(), false);
            }
        });
    }

    // Изменение минимальной длительности видео
    const settingsMinDurationEnabledCheckbox = document.getElementById('settingsMinDurationEnabledCheckbox');
    const settingsMinDurationContainer = document.getElementById('settingsMinDurationContainer');
    const settingsMinDurationInput = document.getElementById('settingsMinDurationInput');
    const durationPresetBtns = document.querySelectorAll('.duration-preset-btn');

    function updateDurationContainerUI(enabled) {
        if (settingsMinDurationContainer) {
            settingsMinDurationContainer.style.opacity = enabled ? '1' : '0.4';
            settingsMinDurationContainer.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    }

    if (settingsMinDurationEnabledCheckbox) {
        settingsMinDurationEnabledCheckbox.addEventListener('change', () => {
            const enabled = settingsMinDurationEnabledCheckbox.checked;
            localStorage.setItem('r34_min_duration_enabled', enabled ? 'true' : 'false');
            updateDurationContainerUI(enabled);
            if (gallery && typeof gallery.applyDurationFilter === 'function') {
                gallery.applyDurationFilter();
            }
        });
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

    const debouncedApplyDurationFilter = debounce(() => {
        if (gallery && typeof gallery.applyDurationFilter === 'function') {
            gallery.applyDurationFilter();
        }
    }, 200);

    function handleDurationChange(val) {
        if (isNaN(val) || val < 0) val = 0;
        if (settingsMinDurationInput) {
            settingsMinDurationInput.value = val;
            setRangeGradient(settingsMinDurationInput);
        }
        localStorage.setItem('r34_min_duration', val.toString());
        updateDurationPresetUI(val);
        
        debouncedApplyDurationFilter();
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
            if (isChecked && settingsSaveDataCheckbox && settingsSaveDataCheckbox.checked) {
                settingsSaveDataCheckbox.checked = false;
                localStorage.setItem('r34_save_data', 'false');
            }
        });
    }

    // Save Data Checkbox
    const settingsSaveDataCheckbox = document.getElementById('settingsSaveDataCheckbox');
    if (settingsSaveDataCheckbox) {
        settingsSaveDataCheckbox.checked = localStorage.getItem('r34_save_data') === 'true';
        settingsSaveDataCheckbox.addEventListener('change', () => {
            const isChecked = settingsSaveDataCheckbox.checked;
            localStorage.setItem('r34_save_data', isChecked ? 'true' : 'false');
            if (isChecked && settingsHdCheckbox && settingsHdCheckbox.checked) {
                settingsHdCheckbox.checked = false;
                localStorage.setItem('r34_hd_enabled', 'false');
                localStorage.setItem('r34_image_hd_enabled', 'false');
            }
        });
    }



    if (settingsAutoSlideCheckbox) {
        settingsAutoSlideCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_auto_slide', settingsAutoSlideCheckbox.checked ? 'true' : 'false');
            if (window.galleryApp) window.galleryApp.updateAutoSlide();
        });
    }

    const settingsAutoSlideInterval = document.getElementById('settingsAutoSlideInterval');
    if (settingsAutoSlideInterval) {
        settingsAutoSlideInterval.addEventListener('change', () => {
            let val = parseInt(settingsAutoSlideInterval.value, 10);
            if (isNaN(val) || val < 1) val = 5;
            localStorage.setItem('r34_auto_slide_interval', val);
            if (window.galleryApp) window.galleryApp.updateAutoSlide();
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
            // Принудительно отключаем и удаляем старые ключи, если они были
            localStorage.setItem('r34_reduced_motion', enabled ? 'true' : 'false');
            localStorage.setItem('r34_fast_open_mode', enabled ? 'true' : 'false');
            
            applyThemeSettings();
            setupAutoplayObserver();
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
            
            const paginationContainer = document.getElementById('pagination-container');
            const endOfResults = document.getElementById('end-of-results');
            if (paginationContainer) {
                if (value === 'pagination' && endOfResults && endOfResults.style.display === 'none') {
                    paginationContainer.style.display = 'flex';
                } else {
                    paginationContainer.style.display = 'none';
                }
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

    // Сбросить скрытые теги
    if (settingsResetTagsBtn) {
        settingsResetTagsBtn.addEventListener('click', () => {
            window.openedFromSettings = true;
            // Показываем стандартный модальный список нежелательных тегов
            const tagModal = document.getElementById('tag-modal');
            if (tagModal) {
                if (typeof initExcludedTagsInModal === 'function') {
                    initExcludedTagsInModal();
                }
                if (typeof updateModalTagsList === 'function') {
                    updateModalTagsList();
                }
                const tagModalCloseBtn = document.getElementById('tag-modal-close-btn');
                if (tagModalCloseBtn) tagModalCloseBtn.style.display = 'block';
                tagModal.style.display = 'flex';
                // Скрываем настройки, чтобы не перекрывали
                if (settingsModal) settingsModal.classList.remove('open');
            }
        });
    }

    // Очистка кэша
    if (settingsClearCacheBtn) {
        settingsClearCacheBtn.addEventListener('click', () => {
            // Полностью очищаем localStorage и sessionStorage
            try {
                localStorage.clear();
            } catch (e) {
                console.error('Error clearing localStorage:', e);
            }
            try {
                sessionStorage.clear();
            } catch (e) {
                console.error('Error clearing sessionStorage:', e);
            }
            
            settingsClearCacheBtn.innerHTML = 'Кэш успешно очищен! ' + icon('checkmark', { size: 16 });
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

    // loader, error, etc.
    let page = 0;
    let loading = false;
    let reachedEnd = false;
    window.reachedEnd = false;
    let lastTagsQuery = '';
    let isInitialLoad = true;

    // Debounce helper for search queries to prevent rapid API requests
    let debounceTimeout = null;
    function debouncedLoadPosts(tagsQuery, append) {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            loadPosts(tagsQuery, append);
        }, 500);
    }
    
    // Function to run immediately and cancel any pending debounced loads
    function immediateLoadPosts(tagsQuery, append) {
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
            debounceTimeout = null;
        }
        loadPosts(tagsQuery, append);
    }

    // Only GIFs Checkbox
    if (settingsOnlyGifsCheckbox) {
        settingsOnlyGifsCheckbox.addEventListener('change', () => {
            localStorage.setItem('r34_only_gifs', settingsOnlyGifsCheckbox.checked ? 'true' : 'false');
            if (typeof immediateLoadPosts === 'function' && tagSearch) {
                page = 0; // Reset page
                reachedEnd = false;
                isInitialLoad = true;
                gallery.realCount = undefined;
                immediateLoadPosts(tagSearch.getTagsQuery(), false);
            }
        });
    }

    // Связываем компоненты
    tagSearch.onTagsChange = (tagsQuery) => {
        page = 0;
        reachedEnd = false;
        window.reachedEnd = false;
        lastTagsQuery = tagsQuery;
        isInitialLoad = true;
        gallery.realCount = undefined;
        debouncedLoadPosts(tagsQuery, false);
    };

    gallery.onMediaClick = (index) => {
        gallery.openFullscreen(index);
    };

    gallery.onLoadMore = () => {
        console.log('[Gallery] onLoadMore triggered', { loading, reachedEnd, puzzleActive: window.puzzleGameActive });
        if (!loading && !reachedEnd) {
            page++;
            immediateLoadPosts(tagSearch.getTagsQuery(), true);
        }
    };

    gallery.onTagClick = (tag) => {
        if (!tagSearch.activeTags.some(t => t.value === tag)) {
            tagSearch.activeTags.push({ value: tag, active: true });
            tagSearch.updateActiveTagsDisplay();
            page = 0;
            reachedEnd = false;
            window.reachedEnd = false;
            lastTagsQuery = tagSearch.getTagsQuery();
            isInitialLoad = true;
            gallery.realCount = undefined;
            immediateLoadPosts(tagSearch.getTagsQuery(), false);
        }
    };

    // --- Режимы: Галерея и Профиль (Избранное) ---
    const modeGalleryBtn = document.getElementById('modeGalleryBtn');
    const modeProfileBtn = document.getElementById('modeProfileBtn');

    if (modeGalleryBtn && modeProfileBtn) {
        modeGalleryBtn.addEventListener('click', () => {
            modeGalleryBtn.classList.add('active');
            modeGalleryBtn.style.background = 'var(--accent)';
            modeGalleryBtn.style.color = '#fff';
            modeGalleryBtn.style.boxShadow = '0 4px 16px var(--accent-glow)';

            modeProfileBtn.classList.remove('active');
            modeProfileBtn.style.background = 'transparent';
            modeProfileBtn.style.color = 'rgba(255,255,255,0.7)';
            modeProfileBtn.style.boxShadow = 'none';

            const searchContainer = document.querySelector('.search-container');
            if (searchContainer) searchContainer.style.display = '';

            if (gallery) {
                if (typeof gallery.showGalleryView === 'function') {
                    gallery.showGalleryView();
                }
                if (!gallery.currentPosts || gallery.currentPosts.length === 0) {
                    page = 0;
                    reachedEnd = false;
                    isInitialLoad = true;
                    gallery.realCount = undefined;
                    immediateLoadPosts(tagSearch.getTagsQuery(), false);
                }
            } else {
                page = 0;
                reachedEnd = false;
                isInitialLoad = true;
                gallery.realCount = undefined;
                immediateLoadPosts(tagSearch.getTagsQuery(), false);
            }
        });

        modeProfileBtn.addEventListener('click', () => {
            modeProfileBtn.classList.add('active');
            modeProfileBtn.style.background = 'var(--accent)';
            modeProfileBtn.style.color = '#fff';
            modeProfileBtn.style.boxShadow = '0 4px 16px var(--accent-glow)';

            modeGalleryBtn.classList.remove('active');
            modeGalleryBtn.style.background = 'transparent';
            modeGalleryBtn.style.color = 'rgba(255,255,255,0.7)';
            modeGalleryBtn.style.boxShadow = 'none';

            const searchContainer = document.querySelector('.search-container');
            if (searchContainer) searchContainer.style.display = 'none';
            if (gallery) {
                if (typeof gallery.showFavoritesView === 'function') {
                    gallery.showFavoritesView();
                } else if (typeof gallery.renderProfileFavorites === 'function') {
                    gallery.renderProfileFavorites();
                }
            }
        });
    }

    async function loadPosts(tagsQuery = '', append = false) {
        console.log('[loadPosts] Called', { tagsQuery, append, loading, reachedEnd, puzzleActive: window.puzzleGameActive });
        // Block loading when puzzle is active (unless forced via special flag)
        if (window.puzzleGameActive && !window._forceLoadPosts) {
            console.log('[loadPosts] Blocked by puzzleGameActive flag');
            return;
        }
        const modeGalleryBtn = document.getElementById('modeGalleryBtn');
        if (modeGalleryBtn && !modeGalleryBtn.classList.contains('active')) {
            return; // Don't load gallery posts when in profile mode
        }
        if (loading || (reachedEnd && append)) return;
        loading = true;
        if (append) {
            paginationLoader.style.display = 'block';
        } else {
            loader.style.display = 'block';
        }
        if (!append) {
            resultsDiv.scrollTop = 0;
            reachedEnd = false;
            window.reachedEnd = false;
        }
        errorEl.textContent = '';
        errorEl.classList.remove('active');
        try {
            const sortBy = currentSort;
            let query = typeof tagsQuery === 'string' ? tagsQuery : '';
            
            // If "Only GIFs" is enabled, ensure 'gif' tag is in the API query to fetch correct count and only GIFs
            const onlyGifsEnabled = localStorage.getItem('r34_only_gifs') === 'true';
            if (onlyGifsEnabled) {
                const queryTags = query.split(/\s+/).map(t => t.toLowerCase());
                if (!queryTags.includes('gif')) {
                    query = query ? `${query} gif` : 'gif';
                }
            }
            
            if (sortBy === 'new') {
                query = query ? `${query} sort:id:desc` : 'sort:id:desc';
            } else if (sortBy === 'popular') {
                query = query ? `${query} sort:score:desc` : 'sort:score:desc';
            } else if (sortBy === 'likes') {
                const savedMinLikes = localStorage.getItem('r34_min_likes');
                let minVal = savedMinLikes !== null ? parseInt(savedMinLikes, 10) : 0;
                if (isNaN(minVal)) minVal = 0;
                query = query ? `${query} score:>=${minVal} sort:score:asc` : `score:>=${minVal} sort:score:asc`;
            } else if (sortBy === 'random') {
                const combineEnabled = localStorage.getItem('r34_combine_random_likes') === 'true';
                if (combineEnabled) {
                    const savedMinLikes = localStorage.getItem('r34_min_likes');
                    let minVal = savedMinLikes !== null ? parseInt(savedMinLikes, 10) : 0;
                    if (isNaN(minVal)) minVal = 0;
                    query = query ? `${query} score:>=${minVal} sort:random` : `score:>=${minVal} sort:random`;
                } else {
                    query = query ? `${query} sort:random` : 'sort:random';
                }
            }
            
            let data = await fetchPosts(query, false, page);
            let posts = [];

            // Унифицируем структуру
            if (Array.isArray(data)) {
                posts = data.filter(post => post && post.file_url);
            } else if (data && data['@attributes']) {
                let arr = Array.isArray(data.post) ? data.post : [data.post];
                posts = arr.filter(post => post && post.file_url);
            } else if (Array.isArray(data.post)) {
                posts = data.post.filter(post => post && post.file_url);
            } else if (data.post) {
                posts = [data.post].filter(post => post && post.file_url);
            } else {
                posts = [];
            }

            const originalLength = posts.length;

            // Client-side filtering of excluded tags
            const inactiveTags = window.tagSearch ? window.tagSearch.activeTags.filter(t => !t.active).map(t => t.value) : [];
            const excludedTagsSet = new Set([...getSavedExcludedTags(), ...inactiveTags]);
            if (excludedTagsSet.size > 0) {
                posts = posts.filter(post => {
                    if (!post || !post.tags) return true;
                    const postTags = post.tags.split(' ').filter(Boolean);
                    for (const t of postTags) {
                        if (excludedTagsSet.has(t)) {
                            return false;
                        }
                    }
                    return true;
                });
            }

            // Client-side filtering of Only GIFs
            if (onlyGifsEnabled) {
                posts = posts.filter(post => {
                    return (post.file_url?.split('.').pop() || '').toLowerCase() === 'gif';
                });
            }

            // Client-side filtering of duration using preloading and caching
            const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
            const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
            if (minDuration > 0) {
                // First: filter out videos that we already know have shorter duration from cache
                posts = posts.filter(post => {
                    const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
                    if (!isVideo) return true;
                    const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
                    if (!isNaN(cachedDuration) && cachedDuration > 0) {
                        return cachedDuration >= minDuration;
                    }
                    return true; // Keep for now, we'll check/resolve it below
                });

                // Second: find videos that are not in cache
                const unresolvedVideos = posts.filter(post => {
                    const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
                    if (!isVideo) return false;
                    const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
                    return isNaN(cachedDuration) || cachedDuration <= 0;
                });

                if (unresolvedVideos.length > 0) {
                    const concurrency = 8;
                    const queue = [...unresolvedVideos];
                    const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(async () => {
                        while (queue.length > 0) {
                            const post = queue.shift();
                            if (!post) break;
                            await new Promise((resolve) => {
                                const video = document.createElement('video');
                                video.preload = 'metadata';
                                video.muted = true;
                                video.playsInline = true;
                                video.src = post.file_url;
                                
                                const timeoutId = setTimeout(() => {
                                    video.src = '';
                                    video.load();
                                    resolve();
                                }, 4000);

                                video.onloadedmetadata = () => {
                                    clearTimeout(timeoutId);
                                    const d = video.duration;
                                    if (!isNaN(d) && d > 0) {
                                        localStorage.setItem(`r34_duration_${post.id}`, d.toString());
                                    }
                                    video.src = '';
                                    video.load();
                                    resolve();
                                };

                                video.onerror = () => {
                                    clearTimeout(timeoutId);
                                    video.src = '';
                                    video.load();
                                    resolve();
                                };
                            });
                        }
                    });
                    await Promise.all(workers);

                    // Re-filter with the now-cached values
                    posts = posts.filter(post => {
                        const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
                        if (!isVideo) return true;
                        const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
                        if (!isNaN(cachedDuration) && cachedDuration > 0) {
                            return cachedDuration >= minDuration;
                        }
                        return true; // Keep if loading failed
                    });
                }
            }

            let totalCount = gallery.realCount;
            // Получаем реальное количество только при новом поиске или если оно еще не задано
            if (!append && (isInitialLoad || !totalCount)) {
                try {
                    let xmlUrl = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(query)}&limit=1`;
                    const xmlResp = await fetch(proxyUrl(xmlUrl));
                    const xmlStr = await xmlResp.text();
                    const match = xmlStr.match(/<posts\s+count="(\d+)"/i);
                    if (match) {
                        totalCount = parseInt(match[1], 10);
                        gallery.realCount = totalCount;
                    }
                } catch (e) {
                    console.error('[Rule34 App] Error fetching total count:', e);
                }
                isInitialLoad = false;
            }

            const realCount = totalCount || (append ? (gallery.realCount || posts.length) : posts.length);

            // Preload tag types for instant display
            if (typeof gallery.preloadTagTypes === 'function') {
                gallery.preloadTagTypes(posts);
            }

            if (append) {
                gallery.appendResults(posts, realCount);
            } else {
                gallery.displayResults(posts, realCount);
            }

            const apiLimit = parseInt(localStorage.getItem('r34_api_limit') || '40', 10);
            const limit = Math.min(Math.max(apiLimit, 1), 1000);

            const endOfResults = document.getElementById('end-of-results');
            const paginationContainer = document.getElementById('pagination-container');
            const scrollMode = localStorage.getItem('r34_scroll_mode') || 'infinite';

            if (originalLength === 0 || originalLength < limit) {
                reachedEnd = true;
                if (endOfResults) endOfResults.style.display = 'flex';
                // В режиме пагинации ВСЕГДА показываем контейнер, если есть больше чем 1 страница
                if (paginationContainer && scrollMode === 'pagination') {
                    paginationContainer.style.display = 'flex';
                    renderPagination(realCount, limit);
                } else if (paginationContainer) {
                    paginationContainer.style.display = 'none';
                }
            } else {
                reachedEnd = false;
                if (endOfResults) endOfResults.style.display = 'none';
                if (paginationContainer) {
                    if (scrollMode === 'pagination') {
                        paginationContainer.style.display = 'flex';
                        renderPagination(realCount, limit);
                    } else {
                        paginationContainer.style.display = 'none';
                    }
                }
            }
            window.reachedEnd = reachedEnd;

            // If the viewport is not filled enough to show a scrollbar, load the next page automatically
            setTimeout(() => {
                const windowHeight = window.innerHeight || document.documentElement.clientHeight;
                const docHeight = Math.max(
                    document.body.scrollHeight, 
                    document.documentElement.scrollHeight,
                    document.body.offsetHeight, 
                    document.documentElement.offsetHeight,
                    document.body.clientHeight, 
                    document.documentElement.clientHeight
                );
                // Only auto-load if in infinite mode
                if (docHeight < windowHeight + 400 && !loading && !reachedEnd && (localStorage.getItem('r34_scroll_mode') || 'infinite') === 'infinite') {
                    page++;
                    immediateLoadPosts(tagSearch.getTagsQuery(), true);
                }
            }, 400);

        } catch (error) {
            console.error('[Rule34 App] Error during posts load:', error);
            const isRateLimit = error && (error.message === "RATE_LIMIT" || error.isRateLimit === true);
            if (isRateLimit) {
                console.warn('[Rule34 App] API Rate Limit encountered (429/403/Cloudflare). Cooldown started.');
                let secondsLeft = 15;
                errorEl.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <span>${icon('warning', { size: 16 })} API Rule34 временно ограничил частоту запросов.</span>
                        <span style="font-size: 0.9em; opacity: 0.85;">Автоматическая повторная попытка через <b id="rate-limit-timer">${secondsLeft}</b> сек...</span>
                        <button id="retry-now-btn" style="margin-top: 6px; padding: 6px 16px; background: var(--glass-bg-strong); color: #fff; border: 1px solid var(--glass-border); border-radius: var(--radius-sm); cursor: pointer; font-weight: bold; transition: background 0.2s;">
                            Попробовать сейчас ${icon('refresh', { size: 14 })}
                        </button>
                    </div>
                `;
                errorEl.classList.add('active');
                errorEl.style.display = 'flex';

                if (window._rateLimitInterval) clearInterval(window._rateLimitInterval);
                window._rateLimitInterval = setInterval(() => {
                    secondsLeft--;
                    const timerEl = document.getElementById('rate-limit-timer');
                    if (timerEl) timerEl.textContent = secondsLeft;
                    if (secondsLeft <= 0) {
                        clearInterval(window._rateLimitInterval);
                        errorEl.classList.remove('active');
                        errorEl.innerHTML = '';
                        immediateLoadPosts(tagSearch.getTagsQuery(), append);
                    }
                }, 1000);

                const retryBtn = document.getElementById('retry-now-btn');
                if (retryBtn) {
                    retryBtn.onclick = () => {
                        if (window._rateLimitInterval) clearInterval(window._rateLimitInterval);
                        errorEl.classList.remove('active');
                        errorEl.innerHTML = '';
                        immediateLoadPosts(tagSearch.getTagsQuery(), append);
                    };
                }
            } else {
                errorEl.textContent = 'Ошибка загрузки. Попробуйте позже.';
                errorEl.classList.add('active');
            }
            if (!append) {
                gallery.displayResults([], 0);
                reachedEnd = true;
                const endOfResults = document.getElementById('end-of-results');
                if (endOfResults) endOfResults.style.display = 'none';
            }
        } finally {
            loader.style.display = 'none';
            paginationLoader.style.display = 'none';
            loading = false;
        }
    }

    arrowButton.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke="#fff" stroke-width="2" fill="none"/><line x1="17" y1="17" x2="22" y2="22" stroke="#fff" stroke-width="2"/></svg>';
    arrowButton.addEventListener('click', () => {
        page = 0;
        reachedEnd = false;
        lastTagsQuery = tagSearch.getTagsQuery();
        isInitialLoad = true;
        gallery.realCount = undefined;
        immediateLoadPosts(tagSearch.getTagsQuery(), false);
    });

    window.addEventListener('scroll', () => {
        if (loading || reachedEnd) return;
        const scrollMode = localStorage.getItem('r34_scroll_mode') || 'infinite';
        if (scrollMode !== 'infinite') return;
        
        const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        const docHeight = Math.max(
            document.body.scrollHeight, 
            document.documentElement.scrollHeight,
            document.body.offsetHeight, 
            document.documentElement.offsetHeight,
            document.body.clientHeight, 
            document.documentElement.clientHeight
        );
        const threshold = (gallery && gallery.preloadMode === 'page') ? windowHeight * 2 : ((gallery && gallery.preloadMode === 'near') ? windowHeight : 400);
        if (scrollY + windowHeight >= docHeight - threshold) {
            page++;
            immediateLoadPosts(tagSearch.getTagsQuery(), true);
        }
    });

    function renderPagination(totalCount, limit) {
        const paginationContainer = document.getElementById('pagination-container');
        if (!paginationContainer || !totalCount || totalCount <= limit) {
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(totalCount / limit);
        const currentPage = page; // global 'page' variable
        paginationContainer.innerHTML = '';

        const createPageBtn = (pageNum, label, isActive = false) => {
            const btn = document.createElement('button');
            btn.className = isActive ? 'r34-pagination-btn active' : 'r34-pagination-btn';
            btn.textContent = label;
            btn.onclick = () => {
                if (page === pageNum) return;
                page = pageNum;
                window.scrollTo({ top: 0, behavior: 'smooth' });
                immediateLoadPosts(tagSearch.getTagsQuery(), false);
            };
            return btn;
        };

        // Prev
        if (currentPage > 0) {
            paginationContainer.appendChild(createPageBtn(currentPage - 1, '«'));
        }

        // Logic for page numbers display (1 ... 5 6 7 ... 100)
        let startPage = Math.max(0, currentPage - 2);
        let endPage = Math.min(totalPages - 1, currentPage + 2);

        if (startPage > 0) {
            paginationContainer.appendChild(createPageBtn(0, '1'));
            if (startPage > 1) {
                const dot = document.createElement('span');
                dot.textContent = '...';
                dot.className = 'r34-pagination-dots';
                paginationContainer.appendChild(dot);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationContainer.appendChild(createPageBtn(i, i + 1, i === currentPage));
        }

        if (endPage < totalPages - 1) {
            if (endPage < totalPages - 2) {
                const dot = document.createElement('span');
                dot.textContent = '...';
                dot.className = 'r34-pagination-dots';
                paginationContainer.appendChild(dot);
            }
            paginationContainer.appendChild(createPageBtn(totalPages - 1, totalPages));
        }

        // Next
        if (currentPage < totalPages - 1) {
            paginationContainer.appendChild(createPageBtn(currentPage + 1, '»'));
        }
    }

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

    // --- Модальное окно для скрытия тегов ---
    const tagModal = document.getElementById('tag-modal');
    const tagModalCloseBtn = document.getElementById('tag-modal-close-btn');
    const modalTagsList = document.getElementById('modal-tags-list');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalKeepBtn = document.getElementById('modal-keep-btn');
    const modalNewTagInput = document.getElementById('modal-new-tag-input');
    const modalSuggestions = document.getElementById('modal-suggestions');

    const excludedTagsInModal = new Set();
    let previewTag = '';
    let previewPage = 0;
    let previewLoading = false;
    let previewReachedEnd = false;
    let previewPostsList = [];

    function initExcludedTagsInModal() {
        excludedTagsInModal.clear();
        const savedExcluded = getSavedExcludedTags();
        savedExcluded.forEach(tag => excludedTagsInModal.add(tag));
    };

    function openZoomModal(post) {
        let zoomOverlay = document.getElementById('preview-zoom-overlay');
        if (!zoomOverlay) {
            zoomOverlay = document.createElement('div');
            zoomOverlay.id = 'preview-zoom-overlay';
            zoomOverlay.className = 'preview-zoom-overlay';
            document.body.appendChild(zoomOverlay);
        }

        zoomOverlay.innerHTML = '';
        zoomOverlay.style.display = 'flex';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'preview-zoom-content';

        const ext = (post.file_url?.split('.').pop() || '').toLowerCase();
        const isVideo = ['mp4', 'webm', 'mov'].includes(ext);

        let mediaEl;
        if (isVideo) {
            mediaEl = document.createElement('video');
            mediaEl.src = proxyUrl(post.file_url);
            mediaEl.controls = true;
            mediaEl.autoplay = true;
            mediaEl.loop = true;
            mediaEl.style.maxWidth = '90vw';
            mediaEl.style.maxHeight = '70vh';
            mediaEl.style.borderRadius = '8px';
            mediaEl.style.outline = 'none';
        } else {
            mediaEl = document.createElement('img');
            mediaEl.src = proxyUrl(post.sample_url || post.file_url);
            mediaEl.style.maxWidth = '90vw';
            mediaEl.style.maxHeight = '70vh';
            mediaEl.style.objectFit = 'contain';
            mediaEl.style.borderRadius = '8px';
        }

        const infoBar = document.createElement('div');
        infoBar.className = 'preview-zoom-info';
        infoBar.innerHTML = `
            <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 20px; font-size: 0.9rem;">
                <span style="color: #ff3b6b; font-weight: bold;">Score: ${post.score}</span>
                <span style="color: rgba(255,255,255,0.6);">ID: ${post.id}</span>
                <a href="${post.file_url}" target="_blank" style="color: #2dd4bf; text-decoration: none;">Источник ↗</a>
            </div>
            <div class="zoom-authors-group" style="display: none; margin-top: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 8px;">
                <div style="font-size: 0.8em; color: #2dd4bf; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    ${icon('palette', { size: 16 })} Автор:
                </div>
                <div class="zoom-authors-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
            </div>
            <div class="zoom-characters-group" style="display: none; margin-top: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 8px;">
                <div style="font-size: 0.8em; color: #a78bfa; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    ${icon('user', { size: 16 })} Персонаж:
                </div>
                <div class="zoom-characters-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
            </div>
        `;

        // Categorize tags for Zoom Modal
        const tagNames = (post.tags || '').split(' ').filter(Boolean);
        if (tagNames.length > 0) {
            (async () => {
                try {
                    const typesMap = {};
                    const uncached = [];
                    for (const tag of tagNames) {
                        const cached = localStorage.getItem(`r34_tagtype_${tag}`);
                        if (cached !== null) {
                            typesMap[tag] = cached;
                        } else {
                            uncached.push(tag);
                        }
                    }

                    if (uncached.length > 0) {
                        const chunk = uncached.slice(0, 10);
                        try {
                            const url = `https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&name=${encodeURIComponent(chunk.join(' '))}`;
                            const resp = await fetch(proxyUrl(url));
                            const text = await resp.text();
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(text, "text/xml");
                            const tagEls = xmlDoc.getElementsByTagName('tag');
                            for (const tagEl of tagEls) {
                                const name = tagEl.getAttribute('name');
                                const type = String(tagEl.getAttribute('type') || '0');
                                if (name) {
                                    typesMap[name] = type;
                                    localStorage.setItem(`r34_tagtype_${name}`, type);
                                }
                            }
                        } catch (e) {
                            console.error('Error batch fetching tags for zoom:', e);
                        }
                    }

                    const authorsListEl = infoBar.querySelector('.zoom-authors-list');
                    const charactersListEl = infoBar.querySelector('.zoom-characters-list');
                    const authorsGroup = infoBar.querySelector('.zoom-authors-group');
                    const charactersGroup = infoBar.querySelector('.zoom-characters-group');

                    let hasAuthors = false;
                    let hasCharacters = false;

                    const isAuthorType = (type) => {
                        const normalized = String(type || '0').toLowerCase();
                        return normalized === '1' || normalized === 'artist' || normalized === 'creator' || normalized === 'author' || normalized === '5';
                    };

                    const isCharacterType = (type) => {
                        const normalized = String(type || '0').toLowerCase();
                        return normalized === '4' || normalized === 'character' || normalized === 'char';
                    };

                    for (const tag of tagNames) {
                        const type = typesMap[tag] || '0';
                        if (isAuthorType(type) || isCharacterType(type)) {
                            const span = document.createElement('span');
                            span.className = 'media-tag';
                            span.textContent = tag;
                            span.style.fontSize = '0.8rem';
                            span.style.padding = '3px 8px';

                            // Check status
                            const existing = tagSearch && tagSearch.activeTags.find(t => t.value === tag);
                            if (existing) {
                                if (existing.active) {
                                    span.classList.add('active-tag');
                                } else {
                                    span.style.textDecoration = 'line-through';
                                    span.style.opacity = '0.5';
                                }
                            }

                            const handleExclude = () => {
                                if (tagSearch) {
                                    const existing = tagSearch.activeTags.find(t => t.value === tag);
                                    if (!existing || existing.active) {
                                        tagSearch.activeTags = tagSearch.activeTags.filter(t => t.value !== tag);
                                        tagSearch.activeTags.push({ value: tag, active: false });
                                    }
                                    if (window.addExcludedTag) window.addExcludedTag(tag);
                                    tagSearch.updateActiveTagsDisplay();
                                    
                                    span.style.textDecoration = 'line-through';
                                    span.style.opacity = '0.5';
                                    span.classList.remove('active-tag');
                                }
                            };

                            span.oncontextmenu = (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleExclude();
                            };

                            span.onclick = (e) => {
                                e.stopPropagation();
                                if (e.altKey) {
                                    e.preventDefault();
                                    handleExclude();
                                    return;
                                }
                                zoomOverlay.style.display = 'none';
                                if (tagModal) tagModal.style.display = 'none';
                                if (tagSearch) {
                                    const existing = tagSearch.activeTags.find(t => t.value === tag);
                                    if (existing && existing.active) {
                                        tagSearch.activeTags = tagSearch.activeTags.filter(t => t.value !== tag);
                                    } else {
                                        tagSearch.activeTags = tagSearch.activeTags.filter(t => t.value !== tag);
                                        tagSearch.activeTags.push({ value: tag, active: true });
                                    }
                                    tagSearch.updateActiveTagsDisplay();
                                    page = 0;
                                    reachedEnd = false;
                                    lastTagsQuery = tagSearch.getTagsQuery();
                                    isInitialLoad = true;
                                    gallery.realCount = undefined;
                                    immediateLoadPosts(tagSearch.getTagsQuery(), false);
                                }
                            };

                            if (isAuthorType(type)) {
                                if (authorsListEl) {
                                    authorsListEl.appendChild(span);
                                    hasAuthors = true;
                                }
                            } else {
                                if (charactersListEl) {
                                    charactersListEl.appendChild(span);
                                    hasCharacters = true;
                                }
                            }
                        }
                    }

                    if (authorsGroup) {
                        authorsGroup.style.display = 'block';
                        if (!hasAuthors && authorsListEl) {
                            const span = document.createElement('span');
                            span.style.color = 'rgba(255,255,255,0.4)';
                            span.style.fontSize = '0.85rem';
                            span.style.fontStyle = 'italic';
                            span.textContent = '(нету)';
                            authorsListEl.appendChild(span);
                        }
                    }
                    if (charactersGroup) {
                        charactersGroup.style.display = 'block';
                        if (!hasCharacters && charactersListEl) {
                            const span = document.createElement('span');
                            span.style.color = 'rgba(255,255,255,0.4)';
                            span.style.fontSize = '0.85rem';
                            span.style.fontStyle = 'italic';
                            span.textContent = '(нету)';
                            charactersListEl.appendChild(span);
                        }
                    }

                } catch (err) {
                    console.error('Failed to categorize tags for zoom:', err);
                }
            })();
        }

        contentWrapper.appendChild(mediaEl);
        contentWrapper.appendChild(infoBar);
        zoomOverlay.appendChild(contentWrapper);

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'zoom-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => {
            zoomOverlay.style.display = 'none';
            if (isVideo && mediaEl) {
                mediaEl.pause();
                mediaEl.src = '';
            }
        };
        zoomOverlay.appendChild(closeBtn);

        // Close when clicking anywhere on overlay
        zoomOverlay.onclick = (e) => {
            if (e.target === zoomOverlay || e.target.closest('.preview-zoom-overlay') && !e.target.closest('.preview-zoom-content')) {
                zoomOverlay.style.display = 'none';
                if (isVideo && mediaEl) {
                    mediaEl.pause();
                    mediaEl.src = '';
                }
            }
        };

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                zoomOverlay.style.display = 'none';
                if (isVideo && mediaEl) {
                    mediaEl.pause();
                    mediaEl.src = '';
                }
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    async function loadMorePreviewPosts(tag, gridEl, titleEl) {
        if (previewLoading || previewReachedEnd) return;
        previewLoading = true;

        if (previewPage === 0) {
            titleEl.textContent = `Загрузка примеров для #${tag}...`;
        }

        try {
            const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(tag)}&limit=15&pid=${previewPage}&json=1`;
            const resp = await fetch(proxyUrl(url));
            const text = await resp.text();
            const posts = (text && text.trim()) ? JSON.parse(text) : [];

            if (previewPage === 0) {
                gridEl.innerHTML = '';
            }

            if (Array.isArray(posts) && posts.length > 0) {
                previewPostsList = previewPostsList.concat(posts);

                if (posts.length < 15) {
                    previewReachedEnd = true;
                }

                posts.forEach(post => {
                    if (post && (post.preview_url || post.file_url)) {
                        const itemContainer = document.createElement('div');
                        itemContainer.className = 'modal-preview-item';
                        itemContainer.style.position = 'relative';
                        itemContainer.style.flexShrink = '0';
                        itemContainer.style.cursor = 'pointer';

                        const img = document.createElement('img');
                        img.className = 'modal-preview-img';
                        img.src = proxyUrl(post.preview_url || post.sample_url || post.file_url);
                        img.alt = tag;
                        img.title = `Score: ${post.score}`;

                        const ext = (post.file_url?.split('.').pop() || '').toLowerCase();
                        const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
                        if (isVideo) {
                            const badge = document.createElement('div');
                            badge.innerHTML = icon('video', { size: 20 });
                            badge.style.position = 'absolute';
                            badge.style.bottom = '12px';
                            badge.style.right = '6px';
                            badge.style.background = 'rgba(0,0,0,0.6)';
                            badge.style.fontSize = '10px';
                            badge.style.padding = '2px 4px';
                            badge.style.borderRadius = '3px';
                            itemContainer.appendChild(badge);
                        }

                        itemContainer.appendChild(img);

                        itemContainer.onclick = (e) => {
                            e.stopPropagation();
                            openZoomModal(post);
                        };

                        gridEl.appendChild(itemContainer);
                    }
                });

                titleEl.textContent = `Примеры для #${tag} (${previewPostsList.length}):`;
            } else {
                previewReachedEnd = true;
                if (previewPage === 0) {
                    titleEl.textContent = `Нет медиа с тегом #${tag}`;
                }
            }
        } catch (e) {
            console.error('Error fetching preview:', e);
            if (previewPage === 0) {
                titleEl.textContent = `Не удалось загрузить превью для #${tag}`;
            }
        } finally {
            previewLoading = false;
        }
    }

    async function showTagPreview(tag) {
        const previewContainer = document.getElementById('modal-tag-preview');
        if (!previewContainer) return;

        previewContainer.style.display = 'block';
        const titleEl = previewContainer.querySelector('.preview-title');
        const gridEl = previewContainer.querySelector('.modal-tag-preview-grid');

        previewTag = tag;
        previewPage = 0;
        previewLoading = false;
        previewReachedEnd = false;
        previewPostsList = [];

        gridEl.innerHTML = '';
        await loadMorePreviewPosts(tag, gridEl, titleEl);
    }

    // Register scroll event on the preview grid once
    const previewGrid = document.querySelector('.modal-tag-preview-grid');
    if (previewGrid) {
        previewGrid.addEventListener('scroll', () => {
            if (previewGrid.scrollLeft + previewGrid.clientWidth >= previewGrid.scrollWidth - 150) {
                if (previewTag && !previewLoading && !previewReachedEnd) {
                    previewPage++;
                    const titleEl = document.querySelector('#modal-tag-preview .preview-title');
                    loadMorePreviewPosts(previewTag, previewGrid, titleEl);
                }
            }
        });

        // Mouse drag to scroll
        let isDown = false;
        let startX;
        let scrollLeft;
        previewGrid.addEventListener('mousedown', (e) => {
            isDown = true;
            startX = e.pageX - previewGrid.offsetLeft;
            scrollLeft = previewGrid.scrollLeft;
        });
        previewGrid.addEventListener('mouseleave', () => {
            isDown = false;
        });
        previewGrid.addEventListener('mouseup', () => {
            isDown = false;
        });
        previewGrid.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - previewGrid.offsetLeft;
            const walk = (x - startX);
            previewGrid.scrollLeft = scrollLeft - walk;
        });
        
        // Mouse wheel to scroll
        previewGrid.addEventListener('wheel', (e) => {
            if (e.deltaX === 0) {
                e.preventDefault();
                previewGrid.scrollLeft += e.deltaY;
            }
        });
    }

    function updateModalTagsList() {
        modalTagsList.innerHTML = '';
        
        // Handle displaying correct buttons based on how it was opened
        const keepBtn = document.getElementById('modal-keep-btn');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const saveSettingsBtn = document.getElementById('modal-save-settings-btn');
        
        if (window.openedFromSettings) {
            if (keepBtn) keepBtn.style.display = 'none';
            if (confirmBtn) confirmBtn.style.display = 'none';
            if (saveSettingsBtn) saveSettingsBtn.style.display = 'block';
        } else {
            if (keepBtn) keepBtn.style.display = 'inline-block';
            if (confirmBtn) confirmBtn.style.display = 'inline-block';
            if (saveSettingsBtn) saveSettingsBtn.style.display = 'none';
        }

        const allTags = getSavedExcludedTags();
        allTags.forEach((tag, index) => {
            const tagEl = document.createElement('div');
            const isExcluded = excludedTagsInModal.has(tag);
            tagEl.className = 'tag' + (isExcluded ? ' inactive' : '');
            
            tagEl.innerHTML = `
                <div class="tag-click-area" style="display: flex; align-items: center; gap: 8px; flex: 1; cursor: pointer;">
                    <div class="tag-click-area" style="display: flex; align-items: center; gap: 8px; flex: 1
                    <span class="tag-name" style="${isExcluded ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${tag}</span>
                    <span class="tag-count" style="margin-left: auto; margin-right: 8px; font-size: 0.8em; opacity: 0.5;">...</span>
                </div>
                <button class="delete-custom-tag-btn" data-tag="${tag}" style="background: none; border: none; color: rgba(255,255,255,0.4); font-size: 1.1em; cursor: pointer; padding: 2px 6px; hover:color: #ef4444; margin-left: 0; z-index: 10;">×</button>
            `;
            tagEl.style.display = 'flex';
            tagEl.style.alignItems = 'center';
            tagEl.style.justifyContent = 'space-between';
            tagEl.style.width = '100%';
            
            const countEl = tagEl.querySelector('.tag-count');
            if (countEl) {
                countEl.style.display = 'none';
            }
            
            // Нажатие на кликабельную область
            const clickArea = tagEl.querySelector('.tag-click-area');
            clickArea.onclick = (e) => {
                const wasSelected = tagEl.classList.contains('selected');
                modalTagsList.querySelectorAll('.tag').forEach(t => t.classList.remove('selected'));
                
                if (wasSelected) {
                    const previewContainer = document.getElementById('modal-tag-preview');
                    if (previewContainer) previewContainer.style.display = 'none';
                } else {
                    tagEl.classList.add('selected');
                    showTagPreview(tag);
                }
            };

            const delBtn = tagEl.querySelector('.delete-custom-tag-btn');
            if (delBtn) {
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const tagToRemove = delBtn.dataset.tag;
                    
                    // Remove from excludedTagsInModal
                    excludedTagsInModal.delete(tagToRemove);

                    // Remove from savedExcluded tags list so it won't persist
                    const currentSaved = getSavedExcludedTags();
                    const updatedSaved = currentSaved.filter(t => t !== tagToRemove);
                    await saveSavedExcludedTags(updatedSaved);
                    
                    if (window.tagSearch) {
                        window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.value !== tagToRemove);
                        window.tagSearch.updateActiveTagsDisplay();
                    }
                    
                    // Re-render
                    updateModalTagsList();
                };
            }

            modalTagsList.appendChild(tagEl);
        });
    };

    // Initialize excluded tags list
    initExcludedTagsInModal();

    // Automatically populate saved excluded tags as inactive, so search will exclude them
    const initialExcluded = getSavedExcludedTags();
    
    // Remove inactive tags that are NOT in the server excluded list (cleanup stale tags)
    tagSearch.activeTags = tagSearch.activeTags.filter(t => {
        if (t.active) return true; // Keep all active tags
        return initialExcluded.includes(t.value); // Keep inactive tags only if they're in server list
    });
    
    // Add any missing excluded tags
    initialExcluded.forEach(tag => {
        if (!tagSearch.activeTags.some(t => t.value === tag)) {
            tagSearch.activeTags.push({ value: tag, active: false });
        }
    });
    tagSearch.updateActiveTagsDisplay();


    if (modalNewTagInput) {
        modalNewTagInput.addEventListener('input', async (e) => {
            const val = e.target.value.trim();
            if (!val) {
                modalSuggestions.innerHTML = '';
                modalSuggestions.style.display = 'none';
                return;
            }
            const suggestions = await tagSearch.getSuggestions(val);
            modalSuggestions.innerHTML = '';
            if (suggestions && suggestions.length > 0) {
                modalSuggestions.style.display = 'block';
                suggestions.slice(0, 5).forEach(s => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    
                    const textNode = document.createTextNode(s.value);
                    div.appendChild(textNode);

                    const countSpan = document.createElement('span');
                    let count = null;
                    if (s.label) {
                        const match = s.label.match(/\((\d+)\)$/);
                        if (match) {
                            count = parseInt(match[1], 10);
                        }
                    }

                    if (count !== null) {
                        countSpan.textContent = formatCount(count);
                    } else {
                        countSpan.textContent = '';
                    }
                    div.appendChild(countSpan);

                    div.onclick = async () => {
                        excludedTagsInModal.add(s.value);

                        // Persist immediately to excluded list
                        const currentSaved = getSavedExcludedTags();
                        if (!currentSaved.includes(s.value)) {
                            currentSaved.push(s.value);
                            await saveSavedExcludedTags(currentSaved);
                        }

                        modalNewTagInput.value = '';
                        modalSuggestions.innerHTML = '';
                        modalSuggestions.style.display = 'none';
                        updateModalTagsList();
                        
                        // Автоматически находим новый добавленный тег в списке и выделяем его
                        setTimeout(() => {
                            const tags = modalTagsList.querySelectorAll('.tag');
                            tags.forEach(t => {
                                const nameEl = t.querySelector('.tag-name');
                                if (nameEl && nameEl.textContent === s.value) {
                                    t.classList.add('selected');
                                    showTagPreview(s.value);
                                }
                            });
                        }, 50);
                    };
                    modalSuggestions.appendChild(div);
                });
            } else {
                modalSuggestions.style.display = 'none';
            }
        });

        modalNewTagInput.addEventListener('focus', () => {
            if (modalNewTagInput.value.trim()) {
                modalNewTagInput.dispatchEvent(new Event('input'));
            }
        });

        // Скрывать подсказки при клике в другое место
        document.addEventListener('click', (e) => {
            if (e.target !== modalNewTagInput && !modalSuggestions.contains(e.target)) {
                modalSuggestions.style.display = 'none';
            }
        });
    }

    modalConfirmBtn.onclick = () => {
        if (window.tagSearch) {
            // Clear previous excluded tags
            window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.active);
            
            // Add currently excluded tags in modal
            excludedTagsInModal.forEach(tag => {
                if (!window.tagSearch.activeTags.some(t => t.value === tag)) {
                    window.tagSearch.activeTags.push({ value: tag, active: false });
                }
            });
            window.tagSearch.updateActiveTagsDisplay();

            // Save currently excluded tags to persistent set!
            saveSavedExcludedTags([...excludedTagsInModal]);

            // Trigger search reload
            page = 0;
            reachedEnd = false;
            lastTagsQuery = window.tagSearch.getTagsQuery();
            isInitialLoad = true;
            gallery.realCount = undefined;
            immediateLoadPosts(window.tagSearch.getTagsQuery(), false);
        }
        tagModal.style.display = 'none';
        window.openedFromSettings = false;
    };
    if (modalKeepBtn) {
        modalKeepBtn.onclick = () => {
            tagModal.style.display = 'none';
            window.openedFromSettings = false;
        };
    }
    if (tagModalCloseBtn) {
        tagModalCloseBtn.onclick = () => {
            tagModal.style.display = 'none';
            window.openedFromSettings = false;
        };
    }

    const modalSaveSettingsBtn = document.getElementById('modal-save-settings-btn');
    if (modalSaveSettingsBtn) {
        modalSaveSettingsBtn.onclick = () => {
            if (window.tagSearch) {
                // Clear previous excluded tags
                window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.active);
                
                // Add currently excluded tags in modal
                excludedTagsInModal.forEach(tag => {
                    if (!window.tagSearch.activeTags.some(t => t.value === tag)) {
                        window.tagSearch.activeTags.push({ value: tag, active: false });
                    }
                });
                window.tagSearch.updateActiveTagsDisplay();

                // Save currently excluded tags to persistent set!
                saveSavedExcludedTags([...excludedTagsInModal]);

                // Trigger search reload
                page = 0;
                reachedEnd = false;
                lastTagsQuery = window.tagSearch.getTagsQuery();
                isInitialLoad = true;
                gallery.realCount = undefined;
                immediateLoadPosts(window.tagSearch.getTagsQuery(), false);
            }
            tagModal.style.display = 'none';
            window.openedFromSettings = false;
        };
    }

    // Теперь медиа НЕ загружаются автоматически, только после нажатия на поиск

    // --- ЭКСПЕРТНЫЙ РЕДАКТОР CSS ПЕРЕМЕННЫХ ---
    const toggleExpertBtn = document.getElementById('toggleExpertBtn');
    const expertSettingsContainer = document.getElementById('expertSettingsContainer');
    const expertVariablesList = document.getElementById('expertVariablesList');

    // Хелпер для разбора любого CSS цвета (HEX, RGB, HSL, var(...), named, gradients)
    function parseColor(colorStr) {
        if (!colorStr) return { r: 12, g: 13, b: 18, a: 1 };
        colorStr = String(colorStr).trim();

        // Разрешение переменных CSS var(--name, fallback) до 5 уровней вложенности
        let depth = 0;
        while (colorStr.includes('var(') && depth < 5) {
            colorStr = colorStr.replace(/var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)/g, (match, vName, fallback) => {
                const val = getComputedStyle(document.documentElement).getPropertyValue(vName).trim();
                return val || fallback || '';
            });
            depth++;
        }

        // Если это градиент, берем крайний цвет из него
        if (colorStr.includes('gradient')) {
            const matches = colorStr.match(/#(?:[0-9a-fA-F]{3}){1,2}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d\.]+\s*)?\)|hsla?\([^)]+\)/g);
            if (matches && matches.length > 0) {
                colorStr = matches[matches.length - 1];
            } else {
                return { r: 12, g: 13, b: 18, a: 1 };
            }
        }

        // Прямой парсинг через временный элемент DOM (100% точность для любых форматов CSS)
        try {
            const dummy = document.createElement('div');
            dummy.style.color = colorStr;
            document.body.appendChild(dummy);
            const computed = getComputedStyle(dummy).color;
            document.body.removeChild(dummy);

            if (computed) {
                const parts = computed.match(/[\d\.]+/g);
                if (parts && parts.length >= 3) {
                    const r = parseFloat(parts[0]);
                    const g = parseFloat(parts[1]);
                    const b = parseFloat(parts[2]);
                    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
                    return { r, g, b, a };
                }
            }
        } catch (e) {
            // Фолбэк на случай ошибки DOM
        }

        // Резервный HEX
        if (colorStr.startsWith('#')) {
            const hex = colorStr.replace('#', '');
            if (hex.length === 3) {
                return {
                    r: parseInt(hex[0] + hex[0], 16),
                    g: parseInt(hex[1] + hex[1], 16),
                    b: parseInt(hex[2] + hex[2], 16),
                    a: 1
                };
            } else if (hex.length >= 6) {
                return {
                    r: parseInt(hex.substring(0, 2), 16),
                    g: parseInt(hex.substring(2, 4), 16),
                    b: parseInt(hex.substring(4, 6), 16),
                    a: 1
                };
            }
        }

        return { r: 12, g: 13, b: 18, a: 1 };
    }

    // Расчет относительной яркости по стандарту WCAG (Relative Luminance)
    function getLuminance(r, g, b) {
        const a = [r, g, b].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    // Вычисление контрастности текста для конкретной поверхности с учетом полупрозрачности и подложки
    function getContrastForSurface(surfaceColorStr, baseBgColorStr) {
        const parsedSurface = parseColor(surfaceColorStr);
        let finalR = parsedSurface.r;
        let finalG = parsedSurface.g;
        let finalB = parsedSurface.b;

        // Если поверхность полупрозрачна (alpha < 0.95), смешиваем её с базовой фоновой подложкой
        if (parsedSurface.a < 0.95) {
            const baseBg = parseColor(baseBgColorStr || '#06070c');
            const a = parsedSurface.a;
            finalR = Math.round(parsedSurface.r * a + baseBg.r * (1 - a));
            finalG = Math.round(parsedSurface.g * a + baseBg.g * (1 - a));
            finalB = Math.round(parsedSurface.b * a + baseBg.b * (1 - a));
        }

        // Относительная яркость поверхности (WCAG)
        const lum = getLuminance(finalR, finalG, finalB);

        // Коэффициент контрастности
        const contrastWithWhite = (1.0 + 0.05) / (lum + 0.05);
        const contrastWithDark = (lum + 0.05) / (0.005 + 0.05);

        // YIQ индекс для восприятия яркости человеком
        const yiq = (finalR * 299 + finalG * 587 + finalB * 114) / 1000;

        // Выбираем темный текст, если контраст с темным выше ИЛИ YIQ >= 130
        const prefersDark = (contrastWithDark > contrastWithWhite) || (yiq >= 130);

        if (prefersDark) {
            return {
                main: '#0a0b10',
                muted: 'rgba(10, 11, 16, 0.72)',
                border: 'rgba(10, 11, 16, 0.18)',
                isLight: true
            };
        } else {
            return {
                main: '#ffffff',
                muted: 'rgba(255, 255, 255, 0.72)',
                border: 'rgba(255, 255, 255, 0.18)',
                isLight: false
            };
        }
    }

    function getContrastYIQ(color) {
        const darkBg = getComputedStyle(document.documentElement).getPropertyValue('--dark').trim() || '#06070c';
        return getContrastForSurface(color, darkBg).main;
    }

    // Автоматический перерасчет цветов текста для ВСЕХ блоков сайта
    function recalculateAllAdaptiveText() {
        const root = document.documentElement;
        const style = getComputedStyle(root);

        const darkVal = style.getPropertyValue('--dark').trim() || '#06070c';
        const bodyBgVal = style.getPropertyValue('--body-bg').trim() || darkVal;
        const accentVal = style.getPropertyValue('--accent').trim() || '#ff3b6b';
        const btnPrimaryBg = style.getPropertyValue('--btn-primary-bg').trim() || accentVal;
        const btnSecondaryBg = style.getPropertyValue('--btn-secondary-bg').trim() || 'rgba(255, 255, 255, 0.08)';
        const modalBgVal = style.getPropertyValue('--modal-bg').trim() || 'rgba(4, 5, 9, 0.72)';
        const tagBgVal = style.getPropertyValue('--tag-bg').trim() || 'rgba(255, 255, 255, 0.05)';
        const suggestionBgVal = style.getPropertyValue('--suggestion-bg').trim() || 'rgba(13, 15, 22, 0.94)';
        const glassBgVal = style.getPropertyValue('--glass-bg').trim() || 'rgba(255, 255, 255, 0.05)';

        // 1. Основной текст страницы
        const pageText = getContrastForSurface(bodyBgVal, darkVal);
        root.style.setProperty('--adaptive-text-main', pageText.main);
        root.style.setProperty('--adaptive-text-muted', pageText.muted);

        // 2. Первичные акцентные кнопки
        const primaryBtnText = getContrastForSurface(btnPrimaryBg, darkVal);
        root.style.setProperty('--btn-primary-color', primaryBtnText.main);

        // 3. Вторичные кнопки
        const secondaryBtnText = getContrastForSurface(btnSecondaryBg, darkVal);
        root.style.setProperty('--btn-secondary-color', secondaryBtnText.main);

        // 4. Карточки медиа
        const cardText = getContrastForSurface(glassBgVal, darkVal);
        root.style.setProperty('--card-text-color', cardText.main);
        root.style.setProperty('--card-text-muted', cardText.muted);

        // 5. Модальные окна (настройки, теги)
        const modalText = getContrastForSurface(modalBgVal, darkVal);
        root.style.setProperty('--modal-text-color', modalText.main);
        root.style.setProperty('--modal-text-muted', modalText.muted);

        if (modalText.isLight) {
            root.style.setProperty('--modal-control-bg', 'rgba(10, 11, 16, 0.06)');
            root.style.setProperty('--modal-control-border', 'rgba(10, 11, 16, 0.15)');
            root.style.setProperty('--modal-control-hover-bg', 'rgba(10, 11, 16, 0.09)');
            root.style.setProperty('--modal-control-hover-border', 'rgba(10, 11, 16, 0.28)');
            root.style.setProperty('--modal-placeholder-color', 'rgba(10, 11, 16, 0.45)');
            root.style.setProperty('--modal-border', 'rgba(10, 11, 16, 0.12)');
        } else {
            root.style.setProperty('--modal-control-bg', 'rgba(255, 255, 255, 0.055)');
            root.style.setProperty('--modal-control-border', 'rgba(255, 255, 255, 0.12)');
            root.style.setProperty('--modal-control-hover-bg', 'rgba(255, 255, 255, 0.095)');
            root.style.setProperty('--modal-control-hover-border', 'rgba(255, 255, 255, 0.24)');
            root.style.setProperty('--modal-placeholder-color', 'rgba(255, 255, 255, 0.35)');
            root.style.setProperty('--modal-border', 'rgba(255, 255, 255, 0.10)');
        }

        // 6. Плашки тегов
        const tagText = getContrastForSurface(tagBgVal, darkVal);
        root.style.setProperty('--tag-text-color', tagText.main);

        // 7. Выпадающее меню подсказок поиска
        const suggestionText = getContrastForSurface(suggestionBgVal, darkVal);
        root.style.setProperty('--suggestion-text-color', suggestionText.main);
    }

    if (toggleExpertBtn && expertSettingsContainer && expertVariablesList) {
        toggleExpertBtn.addEventListener('click', () => {
            const isHidden = expertSettingsContainer.style.display === 'none';
            expertSettingsContainer.style.display = isHidden ? 'block' : 'none';
            toggleExpertBtn.textContent = isHidden ? 'Свернуть' : 'Развернуть';
            
            if (isHidden && expertVariablesList.children.length === 0) {
                initExpertVariables();
            }
        });

        const defaultVariables = {
            '--accent': { 
                val: '#ff3b6b', 
                desc: 'Главный акцентный цвет',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Основной акцент сайта</div>Главный цвет интерфейса. Влияет на активные кнопки, обводки элементов, переключатели вкладок и индикаторы.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#ff3b6b</code>, <code>#6366f1</code>, <code>#10b981</code><br><br><b>🔗 Онлайн-генераторы палитр:</b> <a href="https://coolors.co" target="_blank" rel="noopener noreferrer" style="color:var(--accent); font-weight:bold; text-decoration:underline;">Coolors.co</a> | <a href="https://realtimecolors.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent); font-weight:bold; text-decoration:underline;">RealtimeColors.com</a><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:14px; background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.06); border-radius:8px; display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap;"><button style="background:var(--accent); color:var(--btn-primary-color, #fff); border:none; padding:8px 20px; border-radius:var(--button-radius, 8px); font-weight:bold; font-size:0.75rem; box-shadow:0 4px 14px var(--accent-glow); cursor:pointer; transition:all 0.3s;" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'">Текст адаптируется</button></div>' 
            },
            '--btn-primary-bg': { 
                val: 'var(--accent)', 
                desc: 'Фон главных кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Фон основных кнопок</div>Цвет заливки главных кнопок интерфейса. Может быть цветом или градиентом.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>var(--accent)</code>, <code>#fff</code>, <code>linear-gradient(...)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:#08090d; border-radius:8px; display:flex; justify-content:center; align-items:center;"><button style="background:var(--btn-primary-bg); color:var(--btn-primary-color, #fff); border:none; padding:10px 24px; border-radius:var(--button-radius, 12px); font-weight:bold; font-size:0.75rem; cursor:pointer; transition:all 0.3s;">Авто-контраст текста</button></div>' 
            },
            '--btn-secondary-bg': { 
                val: 'var(--glass-bg-strong)', 
                desc: 'Фон вторичных кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Фон вторичных кнопок</div>Фоновый цвет для второстепенных кнопок и элементов управления.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>var(--glass-bg-strong)</code>, <code>rgba(255,255,255,0.05)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:#08090d; border-radius:8px; display:flex; justify-content:center; align-items:center;"><button style="background:var(--btn-secondary-bg); color:var(--btn-secondary-color, var(--light)); border:1px solid var(--glass-border); padding:10px 24px; border-radius:var(--button-radius, 12px); font-weight:bold; font-size:0.75rem; cursor:pointer;">Вторичный текст</button></div>' 
            },
            '--button-radius': { 
                val: '8px', 
                desc: 'Скругление углов кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('roundedCorner', { size: 16 }) + ' Скругление кнопок</div>Радиус скругления углов всех кнопок в приложении.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0px</code> (квадратные), <code>8px</code> (умеренные), <code>24px</code> (круглые)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; display:flex; justify-content:center;"><button style="padding:10px 20px; background:var(--accent); color:#fff; border:none; border-radius:var(--button-radius); font-size:0.7rem; font-weight:bold; transition:border-radius 0.3s;">Кнопка</button></div>' 
            },
            '--input-radius': { 
                val: '8px', 
                desc: 'Скругление полей ввода',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('roundedCorner', { size: 16 }) + ' Скругление инпутов</div>Радиус скругления углов полей поиска и числовых полей в настройках.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0px</code>, <code>8px</code>, <code>12px</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; display:flex; justify-content:center;"><input type="text" placeholder="Поле ввода..." style="padding:8px 12px; background:var(--glass-bg); color:#fff; border:1px solid var(--glass-border); border-radius:var(--input-radius); font-size:0.7rem; outline:none; transition:border-radius 0.3s; width:180px;"></div>' 
            },
            '--transition-speed': { 
                val: '0.2s', 
                desc: 'Общая скорость анимаций',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('zap', { size: 16 }) + ' Скорость анимаций</div>Базовое время всех переходов и плавных изменений в интерфейсе.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0.1s</code> (быстро), <code>0.3s</code> (плавно), <code>0.6s</code> (медленно)<br><br><b>' + icon('eye', { size: 14 }) + ' Тест скорости:</b><br><div style="margin-top:10px; display:flex; justify-content:center;"><button style="padding:8px 20px; background:var(--accent); color:#fff; border:none; border-radius:8px; cursor:pointer; transition:all var(--transition-speed, 0.2s) var(--ease);" onmouseover="this.style.transform=\'scale(1.15)\'; this.style.filter=\'brightness(1.2)\';" onmouseout="this.style.transform=\'scale(1)\'; this.style.filter=\'none\';">Наведи для теста</button></div>' 
            },
            '--accent-alt': { 
                val: '#ff5e8c', 
                desc: 'Дополнительный акцентный цвет (градиенты)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('rainbow', { size: 16 }) + ' Дополнительный акцент (Градиенты)</div>Используется в паре с основным акцентом для плавных градиентов на плашках, кнопках и карточках.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#ff5e8c</code>, <code>#a855f7</code>, <code>#3b82f6</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример градиента:</b><br><div style="margin-top:10px; height:38px; background:linear-gradient(135deg, var(--accent) 0%, var(--accent-alt) 100%); background-size:200% 200%; animation:liveMovingGradient 4s ease infinite; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.75rem; font-weight:bold; letter-spacing:0.5px; box-shadow:0 4px 15px rgba(0,0,0,0.3);">Плавный анимированный градиент</div>' 
            },
            '--accent-glow': { 
                val: 'rgba(255, 59, 107, 0.4)', 
                desc: 'Цвет неонового свечения (тени)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('sparkles', { size: 16 }) + ' Неоновое свечение (Тень)</div>Определяет цвет и прозрачность мягкого неонового ореола вокруг акцентных элементов.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>rgba(255, 59, 107, 0.4)</code>, <code>transparent</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живое мерцающее свечение:</b><br><div style="margin-top:10px; padding:16px; background:#08090d; border-radius:8px; display:flex; justify-content:center; align-items:center; border:1px solid rgba(255,255,255,0.05);"><span style="padding:10px 22px; background:var(--accent); color:#fff; border-radius:8px; font-weight:bold; font-size:0.75rem; animation:livePulseGlow 2s infinite ease-in-out;">Живое пульсирующее свечение</span></div>' 
            },
            '--dark': { 
                val: '#0a0b10', 
                desc: 'Тёмный цвет фона карточек и подложек',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('filledSquare', { size: 16 }) + ' Тёмный фон карточек</div>Основной цвет заливки карточек галереи, подложек и контейнеров.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#0a0b10</code> (глубокий), <code>#12131a</code> (графит), <code>#181824</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример подложки:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:var(--light); font-size:0.75rem; text-align:center; box-shadow:0 8px 24px rgba(0,0,0,0.5); transition:background 0.3s;"><div style="font-weight:bold; margin-bottom:4px;">Фон подложки карточки</div><div style="opacity:0.6; font-size:0.7rem;">Заливка адаптируется под тему</div></div>' 
            },
            '--light': { 
                val: '#f6f7fb', 
                desc: 'Светлый цвет текста и иконок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('filledCircle', { size: 16 }) + ' Светлый цвет текста</div>Основной цвет заголовков, основного текста и иконок интерфейса.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#ffffff</code> (белый), <code>#f6f7fb</code> (мягкий), <code>#e2e8f0</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример текста:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px; border:1px solid rgba(255,255,255,0.08); text-align:center;"><span style="color:var(--light); font-size:0.85rem; font-weight:700; letter-spacing:0.3px; transition:color 0.3s;">Заголовок и основные тексты интерфейса</span></div>' 
            },
            '--body-bg': { 
                val: 'radial-gradient(circle at top center, #1c1828 0%, #0c0d12 100%)', 
                desc: 'Глобальный фон всего сайта',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('galaxy', { size: 16 }) + ' Глобальный фон страницы</div>Заливка главного заднего плана всего сайта. Поддерживает цвета, градиенты и фоновые картинки.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#0c0d12</code>, <code>radial-gradient(...)</code>, <code>linear-gradient(...)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой мини-экран:</b><br><div style="margin-top:10px; padding:18px; background:var(--body-bg); border:1px solid rgba(255,255,255,0.15); border-radius:10px; text-align:center; color:var(--light); font-size:0.75rem; box-shadow:inset 0 0 20px rgba(0,0,0,0.5); transition:background 0.3s;"><span style="background:rgba(0,0,0,0.5); backdrop-filter:blur(6px); padding:6px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); font-weight:bold;">Задний фон страницы</span></div>' 
            },
            '--modal-bg': { 
                val: 'rgba(10, 11, 16, 0.88)', 
                desc: 'Фон раскрывающихся окон (модалки)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('window', { size: 16 }) + ' Фон модальных окон</div>Заливка всплывающих окон (настройки, просмотр полноэкранных постов, профиль).<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(10, 11, 16, 0.9)</code>, <code>#0e0f15</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живое модальное окно:</b><br><div style="margin-top:10px; padding:18px; background:linear-gradient(135deg, #2b1028, #101c2b); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:40px; height:40px; background:var(--accent); border-radius:50%; top:5px; left:20px; filter:blur(10px); animation:liveOrbs 4s ease-in-out infinite;"></div><div style="position:relative; background:var(--modal-bg); border:1px solid rgba(255,255,255,0.12); padding:12px 16px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; backdrop-filter:blur(8px); box-shadow:0 10px 30px rgba(0,0,0,0.6); transition:background 0.3s;">Всплывающее окно над фоном</div></div>' 
            },
            '--error': { 
                val: '#ff4b4b', 
                desc: 'Цвет ошибок и предупреждений',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ban', { size: 16 }) + ' Цвет ошибок и предупреждений</div>Выделение сообщений об ошибках, сбоях сети и неудачных результатах поиска.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>#ff4b4b</code>, <code>#ef4444</code>, <code>#f43f5e</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой сигнал ошибки:</b><br><div style="margin-top:10px; padding:10px 14px; background:rgba(255,75,75,0.08); border:1px solid rgba(255,75,75,0.3); border-radius:8px; display:flex; align-items:center; gap:8px; color:var(--error); font-size:0.75rem; font-weight:bold; transition:color 0.3s;"><span style="font-size:1rem; animation:pulse 1.5s infinite;">' + icon('warning', { size: 16 }) + '</span> <span>Ошибка: Посты по запросу не найдены</span></div>' 
            },
            '--success': { 
                val: '#30ff97', 
                desc: 'Цвет успешных действий',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('check', { size: 16 }) + ' Цвет успешных действий</div>Используется для подсвечивания активных включающих тегов и успешных операций.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>#30ff97</code>, <code>#10b981</code>, <code>#22c55e</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой успешный статус:</b><br><div style="margin-top:10px; padding:10px 14px; background:rgba(48,255,151,0.08); border:1px solid rgba(48,255,151,0.3); border-radius:8px; display:flex; align-items:center; gap:8px; color:var(--success); font-size:0.75rem; font-weight:bold; transition:color 0.3s;">' + icon('check', { size: 16 }) + ' <span>+ включенный_тег (активно)</span></div>' 
            },
            '--tag-bg': { 
                val: 'rgba(255, 255, 255, 0.04)', 
                desc: 'Фон неактивных тегов (кнопок)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('tag', { size: 16 }) + ' Фон неактивных тегов</div>Цвет плашек тегов в поиске, на карточках галереи и в панели подсказок.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.05)</code>, <code>#1d1f2a</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живые теги:</b><br><div style="margin-top:10px; padding:10px; background:var(--dark); border-radius:8px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;"><span style="background:var(--tag-bg); border:1px solid rgba(255,255,255,0.08); color:var(--light); padding:5px 12px; border-radius:6px; font-size:0.72rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\'" onmouseout="this.style.background=\'var(--tag-bg)\'">#solo</span><span style="background:var(--tag-bg); border:1px solid rgba(255,255,255,0.08); color:var(--light); padding:5px 12px; border-radius:6px; font-size:0.72rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\'" onmouseout="this.style.background=\'var(--tag-bg)\'">#1girl</span></div>' 
            },
            '--suggestion-bg': { 
                val: 'rgba(18, 19, 26, 0.98)', 
                desc: 'Фон списка автодополнения поиска',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('search', { size: 16 }) + ' Выпадающий список поиска</div>Заливка выпадающего меню автодополнения тегов при вводе в поиск.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(18, 19, 26, 0.98)</code>, <code>#12131a</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живое выпадающее меню:</b><br><div style="margin-top:10px; background:var(--suggestion-bg); border:1px solid rgba(255,255,255,0.12); padding:8px 12px; border-radius:8px; color:var(--light); font-size:0.72rem; box-shadow:0 8px 20px rgba(0,0,0,0.5); transition:background 0.3s;"><div style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.06); font-weight:bold; color:var(--accent); border-radius:4px; cursor:pointer;">' + icon('search', { size: 14 }) + ' 1girl <span style="opacity:0.5; font-weight:normal;">(1 420 000)</span></div><div style="padding:6px 8px; opacity:0.85; border-radius:4px; cursor:pointer;" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'transparent\'">' + icon('search', { size: 14 }) + ' solo <span style="opacity:0.5;">(980 000)</span></div></div>' 
            },
            '--glass': { 
                val: 'rgba(18, 19, 26, 0.5)', 
                desc: 'Фон "стеклянных" элементов (общий)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Эффект матового стекла</div>Используется для стильных полупрозрачных панелей с эффектом размытия фона.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(18, 19, 26, 0.5)</code>, <code>rgba(255, 255, 255, 0.05)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живое анимированное стекло:</b><br><div style="margin-top:10px; padding:20px; background:linear-gradient(135deg, #1c1828, #3b1d3d); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:50px; height:50px; background:var(--accent); border-radius:50%; top:10px; left:20px; filter:blur(12px); animation:liveOrbs 3s ease-in-out infinite alternate;"></div><div style="position:relative; background:var(--glass); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.15); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; transition:background 0.3s;">Матовое стекло над движущимся фоном</div></div>' 
            },
            '--glass-bg': { 
                val: 'rgba(255, 255, 255, 0.045)', 
                desc: 'Фон слабых стеклянных элементов',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Слабое стекло (Фон)</div>Слабая заливка для элементов интерфейса, например для кнопок-иконок и полей ввода.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.05)</code>, <code>rgba(0, 0, 0, 0.2)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px;"><div style="background:var(--glass-bg); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem;">Блок со слабым фоном</div></div>' 
            },
            '--glass-bg-strong': { 
                val: 'rgba(255, 255, 255, 0.08)', 
                desc: 'Фон сильных стеклянных элементов',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Сильное стекло (Фон)</div>Более плотная заливка для вторичных кнопок и активных элементов меню.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.1)</code>, <code>rgba(0, 0, 0, 0.4)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px;"><div style="background:var(--glass-bg-strong); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem;">Блок с сильным фоном</div></div>' 
            },
            '--glass-border': { 
                val: 'rgba(255, 255, 255, 0.09)', 
                desc: 'Рамка стеклянных элементов (слабая)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Рамка стекла</div>Цвет стандартных рамок для стеклянных карточек, полей ввода и панелей.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.1)</code>, <code>rgba(0, 0, 0, 0.3)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px;"><div style="border:1px solid var(--glass-border); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem;">Блок со стандартной рамкой</div></div>' 
            },
            '--glass-border-strong': { 
                val: 'rgba(255, 255, 255, 0.18)', 
                desc: 'Рамка стеклянных элементов (сильная)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Выраженная рамка стекла</div>Цвет рамок для более выделяющихся элементов (например, модальных окон).<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.2)</code>, <code>rgba(0, 0, 0, 0.5)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px;"><div style="border:1px solid var(--glass-border-strong); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem;">Блок с сильной рамкой</div></div>' 
            },
            '--header-bg': { 
                val: 'rgba(18, 19, 26, 0.45)', 
                desc: 'Фоновый цвет верхней шапки',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('pin', { size: 16 }) + ' Шапка сайта</div>Цвет зафиксированной верхней панели поиска и фильтров.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(18, 19, 26, 0.45)</code>, <code>transparent</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример шапки:</b><br><div style="margin-top:10px; padding:10px 14px; background:var(--header-bg); border:1px solid rgba(255,255,255,0.1); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; transition:background 0.3s;">Закрепленная панель навигации</div>' 
            },
            '--header-backdrop-filter': { 
                val: 'blur(24px) saturate(1.2)', 
                desc: 'Эффект фильтрации под шапкой (размытие)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('swirl', { size: 16 }) + ' Размытие под шапкой</div>Эффект размытия контента, который проплывает под закрепленной шапкой при скролле.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>blur(24px) saturate(1.2)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой движущийся текст под фильтром:</b><br><div style="margin-top:10px; height:50px; position:relative; overflow:hidden; border-radius:8px; background:#08090d; border:1px solid rgba(255,255,255,0.08);"><div style="position:absolute; width:100%; top:0; animation:liveScrollContent 5s linear infinite; display:flex; flex-direction:column; gap:6px; padding:6px; color:var(--accent); font-weight:bold; font-size:0.75rem;"><div>• Карточка с артом #1042</div><div>• Текст запроса "cute cat girl"</div><div>• Карточка с артом #1043</div><div>• Текст запроса "genshin impact"</div></div><div style="position:absolute; inset:0; background:rgba(18, 19, 26, 0.4); backdrop-filter:var(--header-backdrop-filter); -webkit-backdrop-filter:var(--header-backdrop-filter); display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.72rem; font-weight:bold; pointer-events:none; border:1px solid rgba(255,255,255,0.15); border-radius:8px;">Фильтр шапки (Размытие текста снизу)</div></div>' 
            },
            '--media-radius': { 
                val: '20px', 
                desc: 'Скругление углов у карточек и фото',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Скругление карточек и фото</div>Радиус закругления углов у всех обложек, фото и видео в галерее.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0px</code> (квадрат), <code>12px</code> (умеренное), <code>24px</code> (округлое)<br><br><b>' + icon('eye', { size: 16 }) + ' Живой меняющийся угол:</b><br><div style="margin-top:10px; display:flex; justify-content:center; align-items:center;"><div style="width:64px; height:64px; background:linear-gradient(135deg, var(--accent), var(--accent-alt)); border-radius:var(--media-radius); display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.7rem; font-weight:bold; box-shadow:0 4px 16px var(--accent-glow); transition:border-radius 0.3s ease;">Card</div></div>' 
            },
            '--media-gap': { 
                val: '24px', 
                desc: 'Отступы между карточками в галерее',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Отступы между карточками</div>Интервал по горизонтали и вертикали между блоками сетки галереи.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>12px</code> (плотно), <code>24px</code> (базово), <code>36px</code> (просторно)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой интерактивный отступ:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px; display:flex; gap:var(--media-gap); justify-content:center; align-items:center; transition:gap 0.3s ease;"><div style="width:30px; height:30px; background:var(--accent); border-radius:6px; flex-shrink:0;"></div><div style="width:30px; height:30px; background:var(--accent); border-radius:6px; flex-shrink:0;"></div><div style="width:30px; height:30px; background:var(--accent); border-radius:6px; flex-shrink:0;"></div></div>' 
            },
            '--grid-col-width': { 
                val: '300px', 
                desc: 'Плотность сетки (минимальная ширина карточки)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Ширина колонок галереи</div>Минимальная ширина карточки. Чем меньше число, тем больше колонок помещается в ряд.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>220px</code> (много мелких), <code>320px</code> (крупные)<br><br><b>' + icon('eye', { size: 16 }) + ' Живая динамическая колонка:</b><br><div style="margin-top:10px; width:var(--grid-col-width); max-width:100%; height:32px; background:linear-gradient(90deg, var(--accent), var(--accent-alt)); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.72rem; font-weight:bold; margin:0 auto; transition:width 0.3s ease; box-shadow:0 4px 12px rgba(0,0,0,0.3);">Ширина колонки</div>' 
            },
            '--site-font': { 
                val: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif", 
                desc: 'Шрифт для всего сайта',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('type', { size: 16 }) + ' Шрифт интерфейса</div>Системный или кастомный шрифт для всего приложения.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>"Inter", sans-serif</code>, <code>"Courier New", monospace</code>, <code>"Georgia", serif</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример шрифта:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px; border:1px solid rgba(255,255,255,0.08); text-align:center; font-family:var(--site-font); color:var(--light); font-size:0.85rem; font-weight:600; transition:font-family 0.2s;">Быстрый коричневый лис прыгает через ленивую собаку</div>' 
            },
            '--base-font-size': { 
                val: '16px', 
                desc: 'Базовый размер шрифта (масштабирование)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Базовый размер шрифта</div>Масштабирует пропорции текста и интерфейса во всем приложении.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>14px</code> (компактно), <code>16px</code> (стандарт), <code>18px</code> (крупно)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой масштабируемый текст:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px; border:1px solid rgba(255,255,255,0.08); text-align:center;"><span style="font-size:var(--base-font-size); color:var(--light); font-weight:600; transition:font-size 0.2s;">Динамический базовый текст</span></div>' 
            },
            '--hover-transform': { 
                val: 'translateY(-6px)', 
                desc: 'Анимация карточки при наведении мыши',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('wand', { size: 16 }) + ' Анимация при наведении мыши</div>Трансформация карточки при наведении курсора (подъем вверх, увеличение или поворот).<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>translateY(-6px)</code>, <code>scale(1.03)</code>, <code>rotate(2deg)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая трансформация:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border:1px solid var(--accent); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; box-shadow:0 6px 20px rgba(0,0,0,0.4); cursor:pointer; transition:transform 0.3s var(--ease);" onmouseover="this.style.transform=\'var(--hover-transform)\'" onmouseout="this.style.transform=\'none\'">Наведи на меня</div>' 
            },
            '--hover-border-color': { 
                val: 'rgba(255, 59, 107, 0.35)', 
                desc: 'Цвет рамки карточки при наведении',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Цвет рамки при наведении</div>Цвет подсветки границ карточки при подведении курсора.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 59, 107, 0.8)</code>, <code>#ff3b6b</code>, <code>#00f0ff</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая подсветка рамки:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border:2px solid transparent; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; cursor:pointer; transition:border-color 0.3s ease;" onmouseover="this.style.borderColor=\'var(--hover-border-color)\'" onmouseout="this.style.borderColor=\'transparent\'">Наведи на меня</div>' 
            },
            '--hover-box-shadow': { 
                val: '0 15px 40px rgba(255, 59, 107, 0.15), 0 0 0 1px rgba(255, 59, 107, 0.35)', 
                desc: 'Тень или свечение карточки при наведении',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('box', { size: 16 }) + ' Тень карточки при наведении</div>Объем и свечение тени, отбрасываемой карточкой при наведении.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0 15px 40px rgba(255,59,107,0.3)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая тень карточки:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; cursor:pointer; transition:box-shadow 0.3s ease;" onmouseover="this.style.boxShadow=\'var(--hover-box-shadow)\'" onmouseout="this.style.boxShadow=\'none\'">Наведи на меня</div>' 
            },
            '--container-max-width': { 
                val: '900px', 
                desc: 'Ширина центрального блока поиска',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Ширина поисковой панели</div>Ограничение максимальной ширины блока поиска по центру экрана.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>800px</code>, <code>1000px</code>, <code>100%</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая ширина поиска:</b><br><div style="margin-top:10px; width:100%; display:flex; justify-content:center; padding:6px; background:#08090d; border-radius:8px;"><div style="width:var(--container-max-width); max-width:100%; height:22px; background:var(--accent); border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.65rem; font-weight:bold; transition:width 0.3s ease;">Поисковый блок</div></div>' 
            },
            '--gallery-max-width': { 
                val: '1400px', 
                desc: 'Ширина сетки с картинками',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Максимальная ширина галереи</div>Ограничение растягивания сетки галереи на широкоформатных экранах (4K/QHD).<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>1200px</code>, <code>1600px</code>, <code>100%</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая ширина сетки:</b><br><div style="margin-top:10px; width:100%; display:flex; justify-content:center; padding:6px; background:#08090d; border-radius:8px;"><div style="width:var(--gallery-max-width); max-width:100%; height:22px; background:linear-gradient(90deg, var(--accent), var(--accent-alt)); border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.65rem; font-weight:bold; transition:width 0.3s ease;">Контейнер галереи</div></div>' 
            },
            '--card-bg-opacity': { 
                val: '0.85', 
                desc: 'Непрозрачность подложки под картинкой',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('eye', { size: 16 }) + ' Непрозрачность карточки</div>Степень прозрачности фона подложки карточек.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0.5</code> (полупрозрачная), <code>1.0</code> (сплошная)<br><br><b>' + icon('eye', { size: 16 }) + ' Живая прозрачность над фоном:</b><br><div style="margin-top:10px; background:repeating-linear-gradient(45deg, #1d1828, #1d1828 10px, #ff3b6b 10px, #ff3b6b 20px); padding:12px; border-radius:8px;"><div style="background: rgb(10 11 16 / var(--card-bg-opacity, 0.85)); padding:12px; border-radius:6px; color:#fff; text-align:center; font-size:0.75rem; font-weight:bold; transition:background 0.3s;">Карточка над контрастным фоном</div></div>' 
            },
            '--card-bg-blur': { 
                val: '0px', 
                desc: 'Эффект размытия фона под карточкой',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('fog', { size: 16 }) + ' Размытие фона под карточкой</div>Матовый эффект размытия (backdrop-filter) под карточкой.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0px</code>, <code>8px</code>, <code>16px</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живое размытие фона:</b><br><div style="margin-top:10px; padding:16px; background:linear-gradient(135deg, #2b1028, #101c2b); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:45px; height:45px; background:#ff3b6b; border-radius:50%; top:8px; left:30px;"></div><div style="position:relative; background:rgba(10,11,16,0.45); backdrop-filter:blur(var(--card-bg-blur, 0px)); -webkit-backdrop-filter:blur(var(--card-bg-blur, 0px)); padding:12px; border-radius:8px; color:#fff; text-align:center; font-size:0.75rem; font-weight:bold; border:1px solid rgba(255,255,255,0.15); transition:backdrop-filter 0.3s;">Матовое размытие над фоновым объектом</div></div>' 
            },
            '--card-border-width': { 
                val: '1px', 
                desc: 'Толщина рамки вокруг карточек',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Толщина рамки карточки</div>Толщина контура вокруг карточки в спокойном состоянии.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0px</code> (без рамки), <code>1px</code> (тонкая), <code>2px</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой контур:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border:var(--card-border-width) solid var(--accent); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; transition:border-width 0.2s;">Карточка с изменяемой толщиной рамки</div>' 
            },
            '--card-border-color': { 
                val: 'rgba(255, 255, 255, 0.06)', 
                desc: 'Цвет рамки вокруг карточек (в покое)',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Цвет рамки карточки</div>Цвет обводки карточек в покое.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.1)</code>, <code>#333</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой цвет обводки:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border:2px solid var(--card-border-color); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; transition:border-color 0.3s;">Обводка в спокойном состоянии</div>' 
            },
            '--card-transition-speed': { 
                val: '0.3s', 
                desc: 'Скорость анимаций карточки',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('clock', { size: 16 }) + ' Скорость анимаций карточек</div>Время плавного перехода всех эффектов при наведении и клике.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0.15s</code> (быстро), <code>0.3s</code> (базово), <code>0.8s</code> (медленно)<br><br><b>' + icon('eye', { size: 16 }) + ' Живой анимированный тестер скорости:</b><br><div style="margin-top:10px; padding:12px; background:#08090d; border-radius:8px; border:1px solid rgba(255,255,255,0.08); overflow:hidden; position:relative; text-align:center;"><div style="display:inline-block; padding:8px 18px; background:var(--accent); color:#fff; border-radius:8px; font-weight:bold; font-size:0.75rem; transition:all var(--card-transition-speed, 0.3s) ease-in-out; cursor:pointer;" onmouseover="this.style.transform=\'scale(1.2)\'" onmouseout="this.style.transform=\'scale(1)\'">Тест плавности (наведите мышь)</div></div>' 
            },
            '--card-tags-display': { 
                val: 'flex', 
                desc: 'Отображение тегов внутри карточек',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('tag', { size: 16 }) + ' Показывать теги на карточках</div>Переключение отображения строчки мини-тегов под карточкой.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>flex</code> (показывать), <code>none</code> (скрыть)<br><br><b>' + icon('eye', { size: 16 }) + ' Живой переключатель тегов:</b><br><div style="margin-top:10px; padding:10px; background:var(--dark); border-radius:8px; border:1px solid rgba(255,255,255,0.08);"><div style="font-size:0.7rem; color:#aaa; margin-bottom:6px; text-align:center;">Миниатюра карточки</div><div style="display:var(--card-tags-display, flex); gap:6px; justify-content:center;"><span style="background:var(--tag-bg); padding:3px 8px; border-radius:4px; font-size:10px; color:#fff; border:1px solid rgba(255,255,255,0.1);">#tag_1</span><span style="background:var(--tag-bg); padding:3px 8px; border-radius:4px; font-size:10px; color:#fff; border:1px solid rgba(255,255,255,0.1);">#tag_2</span></div></div>' 
            },
            '--tag-font-size': { 
                val: '11px', 
                desc: 'Размер текста тегов на карточках',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('type', { size: 16 }) + ' Размер шрифта тегов</div>Размер шрифта плашек тегов на галерейных карточках.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>10px</code>, <code>11px</code>, <code>14px</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой размер шрифта тега:</b><br><div style="margin-top:10px; text-align:center;"><span style="background:var(--tag-bg); padding:4px 12px; border-radius:6px; font-size:var(--tag-font-size); color:#fff; border:1px solid rgba(255,255,255,0.15); font-weight:bold; transition:font-size 0.2s;">#размер_тега</span></div>' 
            },
            '--scrollbar-width': { 
                val: '8px', 
                desc: 'Ширина (толщина) полосы прокрутки',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Толщина ползунка скролла</div>Ширина встроенного кастомного скроллбара браузера.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>4px</code> (ультратонкий), <code>8px</code> (базовый), <code>12px</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой скроллбар (попробуйте прокрутить блок справа):</b><br><div style="margin-top:10px; display:flex; gap:12px; align-items:center; justify-content:center;"><div style="width:var(--scrollbar-width); height:45px; background:var(--accent); border-radius:4px; box-shadow:0 0 10px var(--accent-glow); transition:width 0.2s;"></div><div class="expert-scrollbar-demo" style="height:45px; width:120px; overflow-y:scroll; background:#08090d; padding:6px; border-radius:6px; font-size:0.65rem; color:#aaa; border:1px solid rgba(255,255,255,0.1);">Строка 1<br>Строка 2<br>Строка 3<br>Строка 4<br>Строка 5</div></div>' 
            },
            '--scrollbar-thumb-color': { 
                val: 'rgba(255, 255, 255, 0.16)', 
                desc: 'Цвет ползунка прокрутки',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Цвет ползунка скролла</div>Цвет бегунка полосы прокрутки.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255,255,255,0.2)</code>, <code>var(--accent)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой цвет скроллбара:</b><br><div style="margin-top:10px; display:flex; gap:12px; align-items:center; justify-content:center;"><div style="width:8px; height:45px; background:var(--scrollbar-thumb-color); border-radius:4px; border:1px solid rgba(255,255,255,0.1); transition:background 0.3s;"></div><div class="expert-scrollbar-demo" style="height:45px; width:120px; overflow-y:scroll; background:#08090d; padding:6px; border-radius:6px; font-size:0.65rem; color:#aaa; border:1px solid rgba(255,255,255,0.1);">Прокрутите блок<br>Строка 2<br>Строка 3<br>Строка 4<br>Строка 5</div></div>' 
            },
            '--card-shadow': { 
                val: '0 8px 24px rgba(0,0,0,0.4)', 
                desc: 'Тень карточек',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('shadow', { size: 16 }) + ' Тень карточек</div>Эффект тени под карточками для создания глубины.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>none</code>, <code>0 4px 12px rgba(0,0,0,0.3)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border-radius:8px; display:flex; justify-content:center; align-items:center; border:1px solid rgba(255,255,255,0.05);"><div style="padding:12px 20px; background:var(--card-bg); border-radius:8px; color:var(--light); font-size:0.75rem; box-shadow:var(--card-shadow); transition:box-shadow 0.3s;">Карточка с тенью</div></div>' 
            },
            '--glass-blur': { 
                val: '28px', 
                desc: 'Сила размытия стекла',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('blur', { size: 16 }) + ' Сила размытия стекла</div>Интенсивность эффекта размытия для стеклянных элементов (модальные окна, панели).<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0px</code> (без размытия), <code>10px</code> (умеренное), <code>28px</code> (сильное)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:20px; background:linear-gradient(135deg, #ff3b6b, #9b51e0); border-radius:8px; position:relative; overflow:hidden;"><div style="position:relative; background:rgba(10, 11, 16, 0.4); backdrop-filter:blur(var(--glass-blur, 28px)); -webkit-backdrop-filter:blur(var(--glass-blur, 28px)); padding:12px; border-radius:8px; text-align:center; color:#fff; font-size:0.75rem; font-weight:bold; border:1px solid rgba(255,255,255,0.2); transition:backdrop-filter 0.3s;">Стеклянная панель</div></div>' 
            },
            '--gradient-opacity': { 
                val: '0.5', 
                desc: 'Прозрачность градиентов',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Прозрачность градиентов</div>Общая прозрачность градиентных фонов и элементов (например, подсветка активных пунктов).<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0</code> (полностью прозрачно), <code>0.5</code> (полупрозрачно), <code>1</code> (непрозрачно)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:16px; background:#08090d; border-radius:8px; display:flex; justify-content:center; align-items:center;"><div style="width:100%; height:40px; background:linear-gradient(90deg, var(--accent), transparent); opacity:var(--gradient-opacity, 0.5); border-radius:6px; transition:opacity 0.3s;"></div></div>' 
            },
            '--btn-primary-bg': { 
                val: 'var(--accent)', 
                desc: 'Фон активных кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Фон активных кнопок</div>Определяет фоновый цвет или градиент для главных кнопок интерфейса. Можно задать цвет, градиент или полупрозрачный фон.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>var(--accent)</code>, <code>rgba(255, 255, 255, 0.1)</code> (для стекла), <code>linear-gradient(...)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример фона:</b><br><div style="margin-top:10px; padding:12px; border-radius:8px; display:flex; justify-content:center; align-items:center; background:linear-gradient(135deg, #1c1828, #3b1d3d);"><button style="background:var(--btn-primary-bg); color:var(--btn-primary-color, #fff); border:var(--btn-primary-border, none); backdrop-filter:var(--btn-primary-backdrop-filter, none); -webkit-backdrop-filter:var(--btn-primary-backdrop-filter, none); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem; cursor:pointer; transition:all 0.3s;">Главная кнопка</button></div>'
            },
            '--btn-primary-backdrop-filter': { 
                val: 'none', 
                desc: 'Эффект стекла для активных кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Эффект матового стекла (Главные кнопки)</div>Применяет эффект размытия к фону за кнопкой. Для работы эффекта фон кнопки (--btn-primary-bg) должен быть полупрозрачным.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>blur(10px)</code>, <code>blur(16px) saturate(1.5)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой эффект стекла:</b><br><div style="margin-top:10px; padding:16px; background:linear-gradient(135deg, #1c1828, #3b1d3d); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:50px; height:50px; background:var(--accent); border-radius:50%; top:10px; left:30%; animation:liveOrbs 3s ease-in-out infinite alternate;"></div><div style="position:relative; display:flex; justify-content:center; align-items:center;"><button style="background:var(--btn-primary-bg, rgba(255,255,255,0.1)); color:var(--btn-primary-color, #fff); border:var(--btn-primary-border, 1px solid rgba(255,255,255,0.2)); backdrop-filter:var(--btn-primary-backdrop-filter, blur(10px)); -webkit-backdrop-filter:var(--btn-primary-backdrop-filter, blur(10px)); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem;">Стеклянная кнопка</button></div></div>' 
            },
            '--btn-primary-border': { 
                val: 'none', 
                desc: 'Рамка активных кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Рамка активных кнопок</div>Позволяет добавить обводку для главных кнопок. Особенно полезно при создании стеклянных элементов.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>none</code>, <code>1px solid rgba(255, 255, 255, 0.2)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример рамки:</b><br><div style="margin-top:10px; padding:12px; border-radius:8px; display:flex; justify-content:center; align-items:center; background:#08090d;"><button style="background:var(--btn-primary-bg); color:var(--btn-primary-color, #fff); border:var(--btn-primary-border, 1px solid rgba(255, 255, 255, 0.3)); backdrop-filter:var(--btn-primary-backdrop-filter, none); -webkit-backdrop-filter:var(--btn-primary-backdrop-filter, none); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem; cursor:pointer;">Кнопка с рамкой</button></div>' 
            },
            '--btn-secondary-bg': { 
                val: 'var(--glass-bg-strong)', 
                desc: 'Фон вторичных кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Фон вторичных кнопок</div>Фоновый цвет для второстепенных кнопок. Идеально подходит для полупрозрачных стеклянных оттенков.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>var(--glass-bg-strong)</code>, <code>rgba(255, 255, 255, 0.05)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример фона:</b><br><div style="margin-top:10px; padding:12px; border-radius:8px; display:flex; justify-content:center; align-items:center; background:linear-gradient(135deg, #1c1828, #3b1d3d);"><button style="background:var(--btn-secondary-bg, var(--glass-bg-strong)); color:var(--btn-secondary-color, var(--light)); border:var(--btn-secondary-border, 1px solid var(--glass-border)); backdrop-filter:var(--btn-secondary-backdrop-filter, none); -webkit-backdrop-filter:var(--btn-secondary-backdrop-filter, none); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem; cursor:pointer;">Вторичная кнопка</button></div>' 
            },
            '--btn-secondary-backdrop-filter': { 
                val: 'none', 
                desc: 'Эффект стекла для вторичных кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Эффект матового стекла (Вторичные)</div>Размытие фона под второстепенными кнопками.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>blur(10px)</code>, <code>blur(20px) saturate(1.2)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой эффект стекла:</b><br><div style="margin-top:10px; padding:16px; background:linear-gradient(135deg, #1c1828, #3b1d3d); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:50px; height:50px; background:var(--accent); border-radius:50%; top:10px; left:30%; animation:liveOrbs 3s ease-in-out infinite alternate;"></div><div style="position:relative; display:flex; justify-content:center; align-items:center;"><button style="background:var(--btn-secondary-bg, rgba(255,255,255,0.05)); color:var(--btn-secondary-color, var(--light)); border:var(--btn-secondary-border, 1px solid rgba(255,255,255,0.1)); backdrop-filter:var(--btn-secondary-backdrop-filter, blur(10px)); -webkit-backdrop-filter:var(--btn-secondary-backdrop-filter, blur(10px)); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem;">Вторичное стекло</button></div></div>' 
            },
            '--btn-secondary-border': { 
                val: '1px solid var(--glass-border)', 
                desc: 'Рамка вторичных кнопок',
                help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Рамка вторичных кнопок</div>Обводка второстепенных кнопок. По умолчанию используется системный цвет стеклянных границ.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>1px solid var(--glass-border)</code>, <code>1px solid rgba(255, 255, 255, 0.2)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример рамки:</b><br><div style="margin-top:10px; padding:12px; border-radius:8px; display:flex; justify-content:center; align-items:center; background:#08090d;"><button style="background:var(--btn-secondary-bg); color:var(--btn-secondary-color, var(--light)); border:var(--btn-secondary-border, 1px solid rgba(255,255,255,0.2)); backdrop-filter:var(--btn-secondary-backdrop-filter, none); -webkit-backdrop-filter:var(--btn-secondary-backdrop-filter, none); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem; cursor:pointer;">Кнопка с рамкой</button></div>' 
            }
        };

        function initExpertVariables() {
            expertVariablesList.innerHTML = '';

            // Inject helper CSS animations for live demos
            if (!document.getElementById('expert-live-styles')) {
                const style = document.createElement('style');
                style.id = 'expert-live-styles';
                style.textContent = `
                    @keyframes livePulseGlow {
                        0%, 100% { box-shadow: 0 0 10px var(--accent-glow), 0 0 20px var(--accent-glow); transform: scale(1); }
                        50% { box-shadow: 0 0 28px var(--accent-glow), 0 0 50px var(--accent-glow); transform: scale(1.03); }
                    }
                    @keyframes liveMovingGradient {
                        0% { background-position: 0% 50%; }
                        50% { background-position: 100% 50%; }
                        100% { background-position: 0% 50%; }
                    }
                    .expert-scrollbar-demo::-webkit-scrollbar {
                        width: var(--scrollbar-width, 8px);
                        height: var(--scrollbar-width, 8px);
                    }
                    .expert-scrollbar-demo::-webkit-scrollbar-track {
                        background: rgba(0, 0, 0, 0.3);
                        border-radius: 4px;
                    }
                    .expert-scrollbar-demo::-webkit-scrollbar-thumb {
                        background: var(--scrollbar-thumb-color, rgba(255, 255, 255, 0.2));
                        border-radius: 4px;
                    }
                `;
                document.head.appendChild(style);
            }

            // Create Controls Container for Search, Categories, Presets and Reset
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'expert-controls-bar';
            controlsDiv.style.cssText = 'display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; padding: 14px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; backdrop-filter: blur(10px);';

            // Top row: Search input & Reset button
            const topRow = document.createElement('div');
            topRow.style.cssText = 'display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between;';

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Поиск переменной (напр. accent, radius, font)...';
            searchInput.style.cssText = 'flex: 1; min-width: 200px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: var(--adaptive-text-main, #fff); padding: 8px 12px; font-size: 0.8rem; outline: none; transition: all 0.2s;';
            searchInput.addEventListener('focus', () => { searchInput.style.borderColor = 'var(--accent)'; });
            searchInput.addEventListener('blur', () => { searchInput.style.borderColor = 'rgba(255,255,255,0.12)'; });

            const resetBtn = document.createElement('button');
            resetBtn.innerHTML = 'Сбросить все настройки';
            resetBtn.title = 'Сбросить все экспертные переменные к значениям по умолчанию';
            resetBtn.style.cssText = 'background: rgba(255, 75, 75, 0.15); border: 1px solid rgba(255, 75, 75, 0.4); color: #ff6b6b; padding: 8px 14px; border-radius: 8px; font-size: 0.75rem; font-weight: bold; cursor: pointer; transition: all 0.2s; white-space: nowrap;';
            resetBtn.addEventListener('click', () => {
                if (confirm('Сбросить все экспертные настройки стиля к значениям по умолчанию?')) {
                    Object.keys(defaultVariables).forEach(varName => {
                        localStorage.removeItem('r34_expert_' + varName);
                        document.documentElement.style.removeProperty(varName);
                        applyAdaptiveText(varName, defaultVariables[varName].val);
                    });
                    initExpertVariables();
                }
            });

            topRow.appendChild(searchInput);
            topRow.appendChild(resetBtn);
            controlsDiv.appendChild(topRow);

            // Presets row
            const presetsRow = document.createElement('div');
            presetsRow.style.cssText = 'display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 0.75rem; color: rgba(255,255,255,0.6);';
            presetsRow.innerHTML = '<span style="font-weight: bold; margin-right: 4px; color: var(--accent);">Пресеты:</span>';

            const presets = [
                {
                    name: 'Стандарт (Розовый)',
                    vars: { '--accent': '#ff3b6b', '--accent-alt': '#ff5e8c', '--body-bg': 'radial-gradient(circle at top center, #1c1828 0%, #0c0d12 100%)', '--dark': '#0a0b10', '--light': '#f6f7fb' }
                },
                {
                    name: 'Киберпанк (Неон)',
                    vars: { '--accent': '#00f0ff', '--accent-alt': '#ff007f', '--body-bg': 'radial-gradient(circle at top center, #0d0221 0%, #05010d 100%)', '--dark': '#0a0518', '--light': '#e0f7fc', '--accent-glow': 'rgba(0, 240, 255, 0.5)' }
                },
                {
                    name: 'Изумрудный',
                    vars: { '--accent': '#10b981', '--accent-alt': '#059669', '--body-bg': 'radial-gradient(circle at top center, #062016 0%, #020b07 100%)', '--dark': '#03140e', '--light': '#ecfdf5', '--accent-glow': 'rgba(16, 185, 129, 0.4)' }
                },
                {
                    name: 'Светлая тема',
                    vars: { '--accent': '#6366f1', '--accent-alt': '#4f46e5', '--body-bg': '#f8fafc', '--dark': '#ffffff', '--light': '#0f172a', '--tag-bg': 'rgba(0,0,0,0.05)', '--glass-bg': 'rgba(255,255,255,0.8)', '--card-border-color': 'rgba(0,0,0,0.1)', '--accent-glow': 'rgba(99, 102, 241, 0.25)' }
                }
            ];

            presets.forEach(preset => {
                const pBtn = document.createElement('button');
                pBtn.textContent = preset.name;
                pBtn.style.cssText = 'background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--adaptive-text-main, #fff); padding: 5px 10px; border-radius: 6px; font-size: 0.72rem; cursor: pointer; transition: all 0.2s;';
                pBtn.addEventListener('click', () => {
                    Object.entries(preset.vars).forEach(([key, val]) => {
                        localStorage.setItem('r34_expert_' + key, val);
                        document.documentElement.style.setProperty(key, val);
                        applyAdaptiveText(key, val);
                    });
                    initExpertVariables();
                });
                presetsRow.appendChild(pBtn);
            });
            controlsDiv.appendChild(presetsRow);

            // Categories row
            const categories = [
                { id: 'all', name: 'Все переменные' },
                { id: 'colors', name: 'Цвета & Темы' },
                { id: 'layout', name: 'Сетка & Карточки' },
                { id: 'typography', name: 'Шрифты & Текст' },
                { id: 'effects', name: 'Эффекты & Анимация' }
            ];

            let activeCategory = 'all';
            let searchQuery = '';

            const categoryBar = document.createElement('div');
            categoryBar.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;';

            const categoryBtns = {};

            categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.textContent = cat.name;
                btn.style.cssText = `padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; cursor: pointer; transition: all 0.2s; border: 1px solid ${cat.id === activeCategory ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}; background: ${cat.id === activeCategory ? 'var(--accent)' : 'rgba(255,255,255,0.04)'}; color: ${cat.id === activeCategory ? 'var(--btn-primary-color, #fff)' : 'var(--adaptive-text-main, #fff)'};`;
                
                btn.addEventListener('click', () => {
                    activeCategory = cat.id;
                    Object.keys(categoryBtns).forEach(k => {
                        const isSel = k === activeCategory;
                        categoryBtns[k].style.border = `1px solid ${isSel ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`;
                        categoryBtns[k].style.background = isSel ? 'var(--accent)' : 'rgba(255,255,255,0.04)';
                        categoryBtns[k].style.color = isSel ? 'var(--btn-primary-color, #fff)' : 'var(--adaptive-text-main, #fff)';
                    });
                    renderVariables();
                });

                categoryBtns[cat.id] = btn;
                categoryBar.appendChild(btn);
            });

            controlsDiv.appendChild(categoryBar);

            expertVariablesList.appendChild(controlsDiv);

            // Блок онлайн-генераторов и внешних веб-источников
            const toolsBlock = document.createElement('div');
            toolsBlock.className = 'expert-tools-block';
            toolsBlock.style.cssText = 'background: rgba(18, 22, 34, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-left: 4px solid var(--accent); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; backdrop-filter: blur(12px); box-shadow: 0 4px 16px rgba(0,0,0,0.3);';

            toolsBlock.innerHTML = `
                <div style="font-weight: bold; font-size: 0.82rem; color: var(--adaptive-text-main, #fff); margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                    <span style="color: var(--accent); font-size: 1rem;">🌐</span>
                    <span>Генераторы стилей & Онлайн-ресурсы</span>
                </div>
                <div style="font-size: 0.73rem; color: var(--adaptive-text-muted, rgba(255,255,255,0.65)); margin-bottom: 10px; line-height: 1.4;">
                    Инструменты для подбора идеальных палитр, градиентов, эффекта стекла, теней и шрифтов:
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    <a href="https://coolors.co" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';">
                        🎨 Coolors (Палитры)
                    </a>
                    <a href="https://www.realtimecolors.com" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';">
                        👁️ Realtime Colors
                    </a>
                    <a href="https://cssgradient.io" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';">
                        🌈 CSS Gradient
                    </a>
                    <a href="https://css-generators.com" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';">
                        ✨ CSS Generators
                    </a>
                    <a href="https://shadows.brumm.af" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';">
                        📦 Brumm Box Shadow
                    </a>
                    <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';">
                        🔤 Google Fonts
                    </a>
                    <a href="https://webaim.org" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';">
                        ⚖️ WebAIM Contrast
                    </a>
                    <a href="https://uiverse.io" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';">
                        ⚡ Uiverse.io (UI)
                    </a>
                </div>
            `;

            expertVariablesList.appendChild(toolsBlock);

            const listContainer = document.createElement('div');
            listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
            expertVariablesList.appendChild(listContainer);

            // Mapping categories for defaultVariables
            const categoryMap = {
                '--accent': 'colors',
                '--btn-primary-bg': 'colors',
                '--btn-secondary-bg': 'colors',
                '--accent-alt': 'colors',
                '--accent-glow': 'colors',
                '--dark': 'colors',
                '--light': 'colors',
                '--body-bg': 'colors',
                '--modal-bg': 'colors',
                '--error': 'colors',
                '--success': 'colors',
                '--tag-bg': 'colors',
                '--suggestion-bg': 'colors',
                '--glass': 'colors',
                '--glass-bg': 'colors',
                '--glass-bg-strong': 'colors',
                '--glass-border': 'colors',
                '--glass-border-strong': 'colors',
                '--header-bg': 'colors',
                '--hover-border-color': 'colors',

                '--media-radius': 'layout',
                '--media-gap': 'layout',
                '--grid-col-width': 'layout',
                '--container-max-width': 'layout',
                '--gallery-max-width': 'layout',
                '--button-radius': 'layout',
                '--input-radius': 'layout',
                '--card-bg-opacity': 'layout',
                '--card-bg-blur': 'layout',
                '--card-border-width': 'layout',
                '--card-border-color': 'layout',

                '--site-font': 'typography',
                '--base-font-size': 'typography',

                '--transition-speed': 'effects',
                '--header-backdrop-filter': 'effects',
                '--hover-transform': 'effects',
                '--hover-box-shadow': 'effects',
                '--card-transition-speed': 'effects'
            };

            function renderVariables() {
                listContainer.innerHTML = '';

                let count = 0;

                Object.keys(defaultVariables).forEach(varName => {
                    const savedValue = localStorage.getItem('r34_expert_' + varName);
                    const itemCat = categoryMap[varName] || 'colors';

                    if (activeCategory !== 'all' && itemCat !== activeCategory) {
                        return;
                    }

                    if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        const desc = (defaultVariables[varName].desc || '').toLowerCase();
                        if (!varName.toLowerCase().includes(q) && !desc.includes(q)) {
                            return;
                        }
                    }

                    count++;

                    if (savedValue) {
                        document.documentElement.style.setProperty(varName, savedValue);
                    }

                    const row = document.createElement('div');
                    row.style.cssText = 'display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);';
                    
                    const labelContainer = document.createElement('div');
                    labelContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

                    const labelRow = document.createElement('div');
                    labelRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

                    const label = document.createElement('label');
                    label.style.cssText = 'font-size: 0.82rem; color: var(--adaptive-text-main, var(--light)); font-family: monospace; font-weight: bold; opacity: 0.9;';
                    label.textContent = varName;

                    const infoBtn = document.createElement('button');
                    infoBtn.textContent = '? Пример и справка';
                    infoBtn.title = 'Показать примеры и описание';
                    infoBtn.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid var(--accent); color: var(--accent); cursor: pointer; font-weight: bold; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; transition: all 0.2s;';
                    
                    labelRow.appendChild(label);
                    labelRow.appendChild(infoBtn);

                    const desc = document.createElement('div');
                    desc.style.cssText = 'font-size: 0.72rem; color: var(--adaptive-text-main, #fff); opacity: 0.6; line-height: 1.3; margin-bottom: 2px;';
                    desc.textContent = defaultVariables[varName].desc;

                    // Прямые ссылки на генератор и источник только для тех переменных, к которым есть релевантный инструмент
                    function getVariableGenerators(name) {
                        const map = {
                            '--accent': [
                                { name: 'Coolors', url: 'https://coolors.co' },
                                { name: 'Realtime Colors', url: 'https://www.realtimecolors.com' }
                            ],
                            '--btn-primary-bg': [
                                { name: 'CSS Gradient', url: 'https://cssgradient.io' },
                                { name: 'Coolors', url: 'https://coolors.co' }
                            ],
                            '--btn-secondary-bg': [
                                { name: 'Realtime Colors', url: 'https://www.realtimecolors.com' },
                                { name: 'CSS Gradient', url: 'https://cssgradient.io' }
                            ],
                            '--transition-speed': [
                                { name: 'Cubic Bezier', url: 'https://cubic-bezier.com' },
                                { name: 'Animista', url: 'https://animista.net' }
                            ],
                            '--accent-alt': [
                                { name: 'CSS Gradient', url: 'https://cssgradient.io' },
                                { name: 'uiGradients', url: 'https://uigradients.com' }
                            ],
                            '--accent-glow': [
                                { name: 'Brumm Shadows', url: 'https://shadows.brumm.af' }
                            ],
                            '--dark': [
                                { name: 'Realtime Colors', url: 'https://www.realtimecolors.com' },
                                { name: 'Color Hunt', url: 'https://colorhunt.co' }
                            ],
                            '--light': [
                                { name: 'WebAIM Contrast', url: 'https://webaim.org' }
                            ],
                            '--body-bg': [
                                { name: 'CSS Gradient', url: 'https://cssgradient.io' },
                                { name: 'Hypercolor', url: 'https://hypercolor.dev' }
                            ],
                            '--site-font': [
                                { name: 'Google Fonts', url: 'https://fonts.google.com' },
                                { name: 'Fontpair', url: 'https://www.fontpair.co' }
                            ],
                            '--hover-transform': [
                                { name: 'Animista', url: 'https://animista.net' },
                                { name: 'Cubic Bezier', url: 'https://cubic-bezier.com' }
                            ],
                            '--hover-box-shadow': [
                                { name: 'Brumm Shadows', url: 'https://shadows.brumm.af' }
                            ],
                            '--card-shadow': [
                                { name: 'Brumm Shadows', url: 'https://shadows.brumm.af' }
                            ],
                            '--card-transition-speed': [
                                { name: 'Cubic Bezier', url: 'https://cubic-bezier.com' },
                                { name: 'Animista', url: 'https://animista.net' }
                            ],
                            '--glass-blur': [
                                { name: 'CSS Generators', url: 'https://css-generators.com' }
                            ]
                        };
                        return map[name] || [];
                    }

                    const gens = getVariableGenerators(varName);
                    let genContainer = null;
                    if (gens && gens.length > 0) {
                        genContainer = document.createElement('div');
                        genContainer.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; margin-bottom: 6px;';

                        const genTitle = document.createElement('span');
                        genTitle.style.cssText = 'font-size: 0.68rem; font-weight: 700; color: var(--accent); display: inline-flex; align-items: center; gap: 4px;';
                        genTitle.textContent = '🔗 Генератор/Источник:';
                        genContainer.appendChild(genTitle);

                        gens.forEach(g => {
                            const link = document.createElement('a');
                            link.href = g.url;
                            link.target = '_blank';
                            link.rel = 'noopener noreferrer';
                            link.style.cssText = 'display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 4px; color: var(--adaptive-text-main, #fff); font-size: 0.68rem; text-decoration: none; font-weight: 600; transition: all 0.2s;';
                            link.textContent = g.name + ' ↗';
                            link.onmouseover = () => { link.style.borderColor = 'var(--accent)'; link.style.background = 'rgba(255, 255, 255, 0.18)'; };
                            link.onmouseout = () => { link.style.borderColor = 'rgba(255, 255, 255, 0.15)'; link.style.background = 'rgba(255, 255, 255, 0.08)'; };
                            genContainer.appendChild(link);
                        });
                    }
                    
                    const helpBox = document.createElement('div');
                    helpBox.style.cssText = 'display: none; background: rgba(18, 20, 30, 0.95); border: 1px solid rgba(255, 255, 255, 0.12); border-left: 3px solid var(--accent); padding: 12px 14px; border-radius: 8px; font-size: 0.75rem; color: var(--adaptive-text-main, #fff); margin-bottom: 10px; margin-top: 6px; line-height: 1.55; box-shadow: 0 4px 20px rgba(0,0,0,0.4); backdrop-filter: blur(10px);';
                    helpBox.innerHTML = defaultVariables[varName].help;

                    infoBtn.addEventListener('click', () => {
                        const isHidden = helpBox.style.display === 'none';
                        helpBox.style.display = isHidden ? 'block' : 'none';
                        infoBtn.style.background = isHidden ? 'var(--accent)' : 'rgba(255,255,255,0.05)';
                        infoBtn.style.color = isHidden ? 'var(--btn-primary-color, #fff)' : 'var(--accent)';
                    });
                    
                    labelContainer.appendChild(labelRow);
                    labelContainer.appendChild(desc);
                    if (genContainer) {
                        labelContainer.appendChild(genContainer);
                    }
                    labelContainer.appendChild(helpBox);

                    const inputWrapper = document.createElement('div');
                    inputWrapper.style.cssText = 'display: flex; gap: 8px; align-items: center;';

                    // Check if variable value looks like hex color (#fff, #ff3b6b, etc)
                    const currentVal = savedValue || defaultVariables[varName].val;
                    const isHexColor = /^#([0-9a-f]{3}){1,2}$/i.test(currentVal.trim());

                    if (isHexColor) {
                        const colorPicker = document.createElement('input');
                        colorPicker.type = 'color';
                        // Convert #fff to #ffffff for standard HTML5 color picker
                        let hex = currentVal.trim();
                        if (hex.length === 4) {
                            hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
                        }
                        colorPicker.value = hex;
                        colorPicker.style.cssText = 'width: 32px; height: 32px; border: none; border-radius: 6px; cursor: pointer; background: none; padding: 0;';
                        
                        colorPicker.addEventListener('input', (e) => {
                            const val = e.target.value;
                            input.value = val;
                            document.documentElement.style.setProperty(varName, val);
                            applyAdaptiveText(varName, val);
                            localStorage.setItem('r34_expert_' + varName, val);
                        });

                        inputWrapper.appendChild(colorPicker);
                    }

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = savedValue || defaultVariables[varName].val;
                    input.placeholder = defaultVariables[varName].val;
                    input.style.cssText = 'flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--adaptive-text-main, #fff); padding: 8px 10px; font-size: 0.78rem; font-family: monospace; outline: none; transition: border-color 0.2s;';
                    
                    input.addEventListener('focus', () => { input.style.borderColor = 'var(--accent)'; });
                    input.addEventListener('blur', () => { input.style.borderColor = 'rgba(255,255,255,0.1)'; });

                    input.addEventListener('input', (e) => {
                        const val = e.target.value.trim();
                        const activeVal = val || defaultVariables[varName].val;
                        document.documentElement.style.setProperty(varName, activeVal);

                        // АВТОМАТИЧЕСКАЯ АДАПТАЦИЯ ТЕКСТА
                        applyAdaptiveText(varName, activeVal);

                        if (val && val !== defaultVariables[varName].val) {
                            localStorage.setItem('r34_expert_' + varName, val);
                        } else {
                            localStorage.removeItem('r34_expert_' + varName);
                        }
                    });

                    inputWrapper.appendChild(input);

                    row.appendChild(labelContainer);
                    row.appendChild(inputWrapper);
                    listContainer.appendChild(row);
                });

                if (count === 0) {
                    listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.5); font-size: 0.8rem;">Переменные не найдены</div>';
                }
            }

            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                renderVariables();
            });

            renderVariables();
        }
        
        // Initial application on load
        Object.keys(defaultVariables).forEach(varName => {
            const savedValue = localStorage.getItem('r34_expert_' + varName);
            const activeVal = savedValue || defaultVariables[varName].val;
            
            if (savedValue) {
                document.documentElement.style.setProperty(varName, savedValue);
            }

            // Применяем адаптацию текста при загрузке
            applyAdaptiveText(varName, activeVal);
        });
    }

    // Scroll to top
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');
    if (scrollToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                scrollToTopBtn.classList.add('visible');
            } else {
                scrollToTopBtn.classList.remove('visible');
            }
        });
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
});