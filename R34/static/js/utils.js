export function formatCount(count) {
    if (count === '?' || count === undefined || count === null) return '?';
    const num = Number(count);
    if (isNaN(num)) return count;
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return num;
}

export function extractHexColor(colorStr) {
    if (!colorStr) return '#ffffff';
    colorStr = colorStr.trim();
    if (colorStr.startsWith('#')) {
        if (colorStr.length === 4) {
            return '#' + colorStr[1]+colorStr[1] + colorStr[2]+colorStr[2] + colorStr[3]+colorStr[3];
        }
        if (colorStr.length === 9) {
            return colorStr.substring(0, 7);
        }
        return colorStr;
    }
    if (colorStr.startsWith('var(')) {
        return '#ffffff';
    }
    const tempEl = document.createElement('div');
    tempEl.style.color = colorStr;
    document.body.appendChild(tempEl);
    const computed = window.getComputedStyle(tempEl).color;
    document.body.removeChild(tempEl);
    
    const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
    return '#ffffff';
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

export function formatTime(sec) {
    sec = Math.floor(sec);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function setRangeGradient(range) {
    const min = Number(range.min) || 0;
    const max = Number(range.max) || 1;
    const val = Number(range.value) || 0;
    const percent = ((val - min) / (max - min)) * 100;
    range.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${percent}%, rgba(255, 255, 255, 0.1) ${percent}%, rgba(255, 255, 255, 0.1) 100%)`;
}

