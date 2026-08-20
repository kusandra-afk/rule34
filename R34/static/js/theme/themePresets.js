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

export function getAccentAlt(hexColor) {
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
