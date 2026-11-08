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

export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Галерея и избранное сами урезают число колонок на узких экранах
// (gallery.js: getDisplayedColumns, favoritesManager.js:
// getDisplayedFavoritesColumns) — те же пороги здесь, чтобы кнопки выбора
// колонок в настройках могли отключать варианты, которые всё равно не
// применятся на текущей ширине экрана, вместо того чтобы молча их игнорировать.
export function getMaxAllowedColumns() {
    const width = window.innerWidth;
    if (width < 600) return 2;
    if (width < 900) return 3;
    return 5;
}

export function setRangeGradient(range) {
    const min = Number(range.min) || 0;
    const max = Number(range.max) || 1;
    const val = Number(range.value) || 0;
    const percent = ((val - min) / (max - min)) * 100;
    range.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${percent}%, rgba(255, 255, 255, 0.1) ${percent}%, rgba(255, 255, 255, 0.1) 100%)`;
}

// Keep an explicit mute-button choice separate from HTMLMediaElement.muted.
// Mobile browsers may reset muted as playback starts or after load(); treating
// that browser-generated volumechange as a user choice caused the sound icon
// and actual playback state to diverge.
if (typeof document !== 'undefined' && !document.documentElement.dataset.r34ExplicitMuteHandler) {
    document.documentElement.dataset.r34ExplicitMuteHandler = 'true';

    const storeMutePreference = (video, muted) => {
        if (!(video instanceof HTMLVideoElement)) return;
        const value = Boolean(muted);
        video.dataset.r34ExplicitMuted = String(value);
        video.dataset.r34UserMuted = String(value);
        video.defaultMuted = value;
        if (value) video.setAttribute('muted', '');
        else video.removeAttribute('muted');
        if (video._videoPlayerInstance) video._videoPlayerInstance._userMuted = value;
    };

    const enforceMutePreference = (video) => {
        if (!(video instanceof HTMLVideoElement) || video.dataset.r34ExplicitMuted === undefined) return;
        const muted = video.dataset.r34ExplicitMuted === 'true';
        video.defaultMuted = muted;
        if (muted) video.setAttribute('muted', '');
        else video.removeAttribute('muted');
        if (video._videoPlayerInstance) video._videoPlayerInstance._userMuted = muted;
        if (video.muted !== muted) video.muted = muted;
    };

    // Run after the button's own click handler so we store the new state, not
    // the state that existed before the tap. This covers fullscreen and cards.
    document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest('.video-bottom-sound-btn, .sound-toggle-btn');
        if (!button) return;
        const video = button.closest('.custom-video-controls')?.parentElement?.querySelector('video')
            || button.closest('.sound-control-wrapper')?.parentElement?.querySelector('video');
        if (video) queueMicrotask(() => storeMutePreference(video, video.muted));
    });

    // Volume sliders represent an explicit user choice too.
    document.addEventListener('input', (event) => {
        if (!(event.target instanceof HTMLInputElement) || !event.target.matches('.video-bottom-volume, .sound-volume-slider')) return;
        const slider = event.target;
        const video = slider.closest('.custom-video-controls')?.parentElement?.querySelector('video')
            || slider.closest('.sound-control-wrapper')?.parentElement?.querySelector('video');
        if (video) queueMicrotask(() => storeMutePreference(video, video.muted));
    });

    ['loadstart', 'loadedmetadata', 'canplay', 'play', 'playing'].forEach(type => {
        document.addEventListener(type, event => enforceMutePreference(event.target), true);
    });

    // Wrap native play as a final guard for any caller (buttons, keyboard,
    // autoplay, or source restoration) that starts the media directly.
    if (typeof HTMLMediaElement !== 'undefined' && !HTMLMediaElement.prototype._r34MutePlayWrapped) {
        const nativePlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function (...args) {
            enforceMutePreference(this);
            return nativePlay.apply(this, args);
        };
        HTMLMediaElement.prototype._r34MutePlayWrapped = true;
    }
}
