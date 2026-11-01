/**
 * Theme and Customization Presets & Color Helpers
 */

export const colorPresets = {
    pink: { accent: '#ff3b6b', alt: '#ff5e8c', glow: 'rgba(255, 59, 107, 0.4)' },
    cyan: { accent: '#00f0ff', alt: '#00bfff', glow: 'rgba(0, 240, 255, 0.4)' },
    green: { accent: '#39ff14', alt: '#32cd32', glow: 'rgba(57, 255, 20, 0.4)' },
    purple: { accent: '#9b51e0', alt: '#bb6bd9', glow: 'rgba(155, 81, 224, 0.4)' },
    gold: { accent: '#f2c94c', alt: '#f2994a', glow: 'rgba(242, 201, 76, 0.4)' }
};

export const bgPresets = {
    // База полностью выводится из акцентного цвета — так смена акцента
    // перекрашивает и полотно, как это делает готовый пресет.
    auto: { dark: '#08090f', bodyBg: 'auto', fromAccent: true },
    midnight: { dark: '#0a0b10', bodyBg: 'radial-gradient(circle at top right, #1b1622 0%, #0a0b10 100%)' },
    obsidian: { dark: '#000000', bodyBg: '#000000' },
    forest: { dark: '#040c06', bodyBg: 'radial-gradient(circle at top right, #0a1f10 0%, #040c06 100%)' },
    indigo: { dark: '#080816', bodyBg: 'radial-gradient(circle at top right, #0e122b 0%, #080816 100%)' }
};

export const hoverPresets = {
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

export const fontPresets = {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'Courier New', Courier, monospace",
    rounded: "system-ui, -apple-system, sans-serif"
};

export function getAccentGlow(hexColor, intensity) {
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

/**
 * #rgb / #rrggbb → { h, s, l } (в градусах и процентах).
 * Возвращает null, если цвет не hex — тогда вызывающий код оставляет значение как есть.
 */
export function hexToHsl(hexColor) {
    if (!hexColor || typeof hexColor !== 'string' || !hexColor.startsWith('#')) return null;
    let hex = hexColor.trim().replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length !== 6) return null;

    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l: l * 100 };

    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;

    return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h, s, l) {
    const sN = Math.max(0, Math.min(100, s)) / 100;
    const lN = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * lN - 1)) * sN;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lN - c / 2;

    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Второй цвет градиента для произвольного акцента.
 * Раньше цвет просто подмешивался к белому — на насыщенных неоновых оттенках
 * это давало почти невидимый градиент. Теперь, как в готовых пресетах,
 * сдвигаем оттенок и светлоту: получается узнаваемая «парная» краска.
 */
export function getAccentAlt(hexColor) {
    const hsl = hexToHsl(hexColor);
    if (!hsl) return hexColor;
    const { h, s, l } = hsl;
    const hueShift = s < 12 ? 0 : 9;          // у почти-серых сдвиг оттенка не виден
    const lightShift = l > 70 ? -9 : 7;        // светлые делаем глубже, тёмные — ярче
    return hslToHex((h + hueShift) % 360, s, l + lightShift);
}

export function getBgLuminance(colorStr) {
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

export function getContrastYIQ(color) {
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
