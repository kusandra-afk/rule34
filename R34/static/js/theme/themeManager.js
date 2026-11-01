/**
 * Theme Manager & Dynamic CSS Customization Engine
 */

import { debounce } from '../utils.js';
import {
    colorPresets,
    bgPresets,
    hoverPresets,
    fontPresets,
    getAccentGlow,
    getAccentAlt,
    getBgLuminance
} from './themePresets.js';
import { recalculateAllAdaptiveText } from '../components/expertStylesEditor.js';

let isApplyingTheme = false;

function parseRgbList(colorStr) {
    if (!colorStr) return null;
    const str = String(colorStr).trim();
    if (str.startsWith('#')) {
        let hex = str.slice(1);
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        if (hex.length !== 6) return null;
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return [r, g, b].some(n => Number.isNaN(n)) ? null : [r, g, b];
    }
    const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// Смешиваем базовый цвет поверхности с акцентом — получаем тон,
// который «принадлежит» выбранному акценту, а не нейтральный серый.
function mixRgb(colorStr, accentRgb, amount) {
    const base = parseRgbList(colorStr);
    if (!base || !accentRgb) return colorStr;
    const out = base.map((c, i) => Math.round(c + (accentRgb[i] - c) * amount));
    return `rgb(${out.join(', ')})`;
}

/**
 * Акцентная тройка. Раньше эти переменные могли независимо переопределяться
 * из редактора стилей (режим разработчика) и побеждали выбор цвета в
 * настройках — из-за этого «смена акцента» почти ничего не меняла.
 * Теперь источник правды один: r34_theme_accent, а alt/glow всегда выводятся
 * из него.
 */
export const ACCENT_KEYS = ['--accent', '--accent-alt', '--accent-glow'];

// Старые сборки писали акцент в r34_expert_--accent. Чтобы такая настройка
// не потерялась молча, перенимаем её как основной акцент.
// Проверка идёт по фактическому состоянию localStorage, а не по флагу модуля:
// настройки могут приехать с сервера уже после первого применения темы.
function migrateLegacyAccentOverride() {
    if (localStorage.getItem('r34_theme_migrated_v2') === 'true') return;
    localStorage.setItem('r34_theme_migrated_v2', 'true');
    // Старые пресеты из редактора стилей писали фон и цвет текста в экспертные
    // переменные, и они навсегда перекрывали тему (выбираешь новый акцент —
    // полотно остаётся изумрудным). Переносим фон в общую настройку.
    const legacyBg = localStorage.getItem('r34_expert_--body-bg');
    if (legacyBg) {
        localStorage.setItem('r34_theme_bg', legacyBg);
        ['--body-bg', '--dark', '--light'].forEach(k => localStorage.removeItem('r34_expert_' + k));
    }

    const legacy = localStorage.getItem('r34_expert_--accent');
    if (!legacy) return;
    const val = legacy.trim();
    if (/^#([0-9a-f]{3}){1,2}$/i.test(val)) {
        localStorage.setItem('r34_theme_accent', val);
    }
    // Парные значения того же акцента теперь выводятся из него самого —
    // иначе старый пресет продолжал бы «подкрашивать» градиент и свечение.
    ACCENT_KEYS.forEach(k => localStorage.removeItem('r34_expert_' + k));
}

/**
 * Единственная точка смены акцентного цвета — для настроек, пикера,
 * ручного ввода и пресетов в режиме разработчика.
 */
export function setAccent(value) {
    if (typeof value !== 'string' || !value.trim()) return;
    const val = value.trim();
    localStorage.setItem('r34_theme_accent', val);
    ACCENT_KEYS.forEach(k => localStorage.removeItem('r34_expert_' + k));

    // Готовый пресет меняет акцент ВМЕСТЕ с фоном — и обычный выбор цвета
    // теперь делает то же самое: базовые темы пересобираются от акцента.
    // Собственный фон пользователя (картинка/градиент/цвет) не трогаем.
    const currentBg = localStorage.getItem('r34_theme_bg') || 'auto';
    if (bgPresets[currentBg] && !currentBg.startsWith('#')) {
        localStorage.setItem('r34_theme_bg', 'auto');
    }

    applyThemeSettings();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('r34:accent-changed', { detail: { accent: val } }));
    }
}

/**
 * Смена темы фона из любого места (в т.ч. пресетов в редакторе стилей).
 * Отдельная функция нужна, чтобы подписанные на событие поля настроек
 * не показывали устаревшее значение.
 */
export function setBackground(value) {
    if (typeof value !== 'string' || !value.trim()) return;
    const val = value.trim();
    localStorage.setItem('r34_theme_bg', val);
    applyThemeSettings();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('r34:bg-changed', { detail: { bg: val } }));
    }
}

export function applyAdaptiveText(varName, activeVal) {
    if (isApplyingTheme) {
        if (typeof recalculateAllAdaptiveText === 'function') {
            recalculateAllAdaptiveText();
        }
        return;
    }
    isApplyingTheme = true;
    try {
        applyThemeSettings();
    } finally {
        isApplyingTheme = false;
    }
}

export function applyThemeSettings() {
    migrateLegacyAccentOverride();

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
        // Свечение считаем от самого цвета пресета. Раньше для него был
        // отдельный список с несуществующими ключами (violet/blue/emerald),
        // поэтому cyan, green, purple и gold светились розовым.
        preset = Object.assign({}, colorPresets[activeColor] || colorPresets.pink);
        preset.glow = getAccentGlow(preset.accent, glowIntensity);
    }
    document.documentElement.style.setProperty('--accent', preset.accent);
    document.documentElement.style.setProperty('--accent-alt', preset.alt);
    document.documentElement.style.setProperty('--accent-glow', preset.glow);

    const accentRgb = parseRgbList(preset.accent) || [255, 59, 107];
    const accentRgbStr = accentRgb.join(', ');
    document.documentElement.style.setProperty('--accent-rgb', accentRgbStr);
    applyAdaptiveText('--accent', preset.accent);

    // Background Theme
    // Смена акцента должна перекрашивать не только кнопки, но и всё полотно:
    // поверх выбранного фона кладём акцентное свечение, а тон поверхностей (--dark)
    // подмешиваем от акцента. Раньше фон и карточки оставались такими, какими
    // их задал стандартный или ранее выбранный пресет.
    const activeBg = localStorage.getItem('r34_theme_bg') || 'auto';
    const bgPreset = bgPresets[activeBg];
    const bgWash = `radial-gradient(ellipse 120% 75% at 76% -12%, rgba(${accentRgbStr}, 0.22) 0%, rgba(${accentRgbStr}, 0.07) 45%, transparent 72%)`;
    let bgForLum = '#0a0b10';
    let bgLum = null;
    if (bgPreset && bgPreset.fromAccent) {
        // «Авто»: и полотно, и тон поверхностей целиком собираются из акцента
        const autoDark = mixRgb(bgPreset.dark, accentRgb, 0.18);
        const autoBase = `linear-gradient(180deg, ${mixRgb('#0b0c13', accentRgb, 0.20)} 0%, #05060a 65%)`;
        document.documentElement.style.setProperty('--dark', autoDark);
        document.documentElement.style.setProperty('--body-bg', `${bgWash}, ${autoBase}`);
        bgForLum = bgPreset.dark;
        bgLum = getBgLuminance(bgPreset.dark);
    } else if (bgPreset) {
        const tintedDark = mixRgb(bgPreset.dark, accentRgb, 0.09);
        document.documentElement.style.setProperty('--dark', tintedDark);
        document.documentElement.style.setProperty('--body-bg', `${bgWash}, ${bgPreset.bodyBg}`);
        bgForLum = bgPreset.dark;
        // Светлоту темы считаем по базовому цвету темы, а не по итоговой строке
        // с акцентным свечением — иначе rgba() акцента принимался бы за фон.
        bgLum = getBgLuminance(bgPreset.dark);
    } else {
        // Custom typed background
        const tintedDark = mixRgb(activeBg, accentRgb, 0.09) || '#000000';
        document.documentElement.style.setProperty('--dark', tintedDark.startsWith('rgb(') ? tintedDark : '#000000');
        document.documentElement.style.setProperty('--body-bg', `${bgWash}, ${activeBg}`);
        bgForLum = activeBg;
        bgLum = getBgLuminance(activeBg);
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
    const hoverStyle = localStorage.getItem('r34_hover_style') || 'glow';
    const hp = hoverPresets[hoverStyle] || hoverPresets.glow;
    document.documentElement.style.setProperty('--hover-transform', hp.transform);
    document.documentElement.style.setProperty('--hover-border-color', hp.borderColor);
    document.documentElement.style.setProperty('--hover-box-shadow', hp.boxShadow);
    document.documentElement.style.setProperty('--hover-animation', hp.animation || 'none');

    // Font
    const fontStyle = localStorage.getItem('r34_font_style') || 'sans';
    const fp = fontPresets[fontStyle] || fontStyle;
    document.documentElement.style.setProperty('--site-font', fp);

    // --- Advanced customization properties live apply ---
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
    const finalSpeed = lowPowerMode ? 10 : (parseFloat(effectiveCardTransitionSpeed) || 300);
    document.documentElement.style.setProperty('--card-transition-speed', finalSpeed + 'ms');

    // 1. Custom Logo Text
    const customLogoText = localStorage.getItem('r34_custom_logo_text') || '';
    const mainLogo = document.querySelector('h1');
    if (mainLogo) {
        mainLogo.textContent = customLogoText.trim() !== '' ? customLogoText : 'Rule34 Gallery';
        mainLogo.title = '(Нажми 5 раз)';
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

    // 2. Card Border Width
    const cardBorderWidth = localStorage.getItem('r34_card_border_width') || '1';
    document.documentElement.style.setProperty('--card-border-width', cardBorderWidth + 'px');

    // 3. Card Border Color
    const cardBorderColor = localStorage.getItem('r34_card_border_color') || 'var(--glass-border)';
    document.documentElement.style.setProperty('--card-border-color', cardBorderColor);

    // 4. Card Transition Speed
    const cardTransitionSpeed = localStorage.getItem('r34_card_transition_speed') || '300';
    document.documentElement.style.setProperty('--card-transition-speed', cardTransitionSpeed + 'ms');

    // 5. Tag Font Size
    const tagSize = localStorage.getItem('r34_tag_size') || '11';
    document.documentElement.style.setProperty('--tag-font-size', tagSize + 'px');

    // 6. Tags Only on Hover
    const tagsOnHover = localStorage.getItem('r34_tags_only_on_hover') === 'true';
    if (tagsOnHover) {
        document.body.classList.add('r34-tags-hover-only');
    } else {
        document.body.classList.remove('r34-tags-hover-only');
    }

    // 7. Header Style
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

    // Status updates in miniature Live Preview
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

    // 8. Expert Developer Parameters
    const expertKeys = [
        '--accent-alt', '--accent-glow', '--dark', '--light',
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

    const activeAccent = document.documentElement.style.getPropertyValue('--accent').trim() || '#ff3b6b';
    const activeDark = document.documentElement.style.getPropertyValue('--dark').trim() || '#0a0b10';
    const activeBodyBg = document.documentElement.style.getPropertyValue('--body-bg').trim() || activeDark;

    // Разбор #hex / rgb(a)(...) в компоненты RGB, с запасным значением по умолчанию
    const parseColorToRgb = (str, fallback) => {
        let [r, g, b] = fallback;
        if (!str) return [r, g, b];
        if (str.startsWith('#')) {
            const hex = str.replace('#', '');
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16) || 0;
                g = parseInt(hex[1] + hex[1], 16) || 0;
                b = parseInt(hex[2] + hex[2], 16) || 0;
            } else if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16) || 0;
                g = parseInt(hex.substring(2, 4), 16) || 0;
                b = parseInt(hex.substring(4, 6), 16) || 0;
            }
        } else {
            const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (rgbMatch) {
                r = parseInt(rgbMatch[1], 10) || 0;
                g = parseInt(rgbMatch[2], 10) || 0;
                b = parseInt(rgbMatch[3], 10) || 0;
            }
        }
        return [r, g, b];
    };

    // Accent RGB parsing
    const [ar, ag, ab] = parseColorToRgb(activeAccent, [255, 59, 107]);
    document.documentElement.style.setProperty('--accent-rgb', `${ar}, ${ag}, ${ab}`);

    // RGB фона темы — чтобы фон модалок/подсказок был оттенком темы, а не
    // нейтральным серым (иначе модалки визуально выпадают из цветовой схемы
    // выбранной пользователем темы, см. --modal-bg / --suggestion-bg ниже)
    const [dr, dg, db] = parseColorToRgb(activeDark, [4, 5, 9]);

    // Background luminance check (base theme color — фон с акцентным свечением
    // для этого не годится)
    const lum = bgLum !== null ? bgLum : getBgLuminance(activeBodyBg);
    const isLightBg = lum > 135;

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
            document.documentElement.style.setProperty('--modal-bg', `rgba(${dr}, ${dg}, ${db}, 0.82)`);
        }
        if (!localStorage.getItem('r34_expert_--tag-bg')) {
            document.documentElement.style.setProperty('--tag-bg', 'rgba(255, 255, 255, 0.05)');
        }
        if (!localStorage.getItem('r34_expert_--suggestion-bg')) {
            document.documentElement.style.setProperty('--suggestion-bg', `rgba(${dr}, ${dg}, ${db}, 0.96)`);
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

    recalculateAllAdaptiveText();
}

export const debouncedApplyThemeSettings = debounce(applyThemeSettings, 100);

export const debouncedSaveSetting = debounce((key, val) => {
    localStorage.setItem(key, val);
    applyThemeSettings();
}, 150);
