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

    const activeAccent = document.documentElement.style.getPropertyValue('--accent').trim() || '#ff3b6b';
    const activeDark = document.documentElement.style.getPropertyValue('--dark').trim() || '#0a0b10';
    const activeBodyBg = document.documentElement.style.getPropertyValue('--body-bg').trim() || activeDark;

    // Accent RGB parsing
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

    // Background luminance check
    const lum = getBgLuminance(activeBodyBg);
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
