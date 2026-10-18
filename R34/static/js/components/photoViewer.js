import { formatTime, setRangeGradient } from '../utils.js';

export class PhotoViewer {
    constructor(progressBar, timerSpan) {
        this.progressBar = progressBar;
        this.timerSpan = timerSpan;
        this._rafId = null;
        this.startTime = null;
        this.duration = 10;
        this.onFinish = null;
        this.paused = false;
        this.elapsedBeforePause = 0;
        this._lastProgressValue = null;
    }

    start(duration = 10, onFinish) {
        this.stop();
        this.duration = Math.max(1, duration);
        this.onFinish = onFinish;
        this.paused = false;
        this.elapsedBeforePause = 0;
        if (this.progressBar) {
            this.progressBar.disabled = false;
            this.progressBar.value = 0;
            this.progressBar.max = this.duration;
            setRangeGradient(this.progressBar);
        }
        this.startTime = performance.now();
        this.updateDisplay();
        this._startLoop();
    }

    _startLoop() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        const tick = () => {
            if (this.paused || !this.startTime) return;
            this.update();
            if (!this.paused && this.startTime) {
                this._rafId = requestAnimationFrame(tick);
            }
        };
        this._rafId = requestAnimationFrame(tick);
    }

    pause() {
        if (this.paused || !this.startTime) return;
        this.paused = true;
        this.elapsedBeforePause = (performance.now() - this.startTime) / 1000;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
        this.startTime = performance.now() - (this.elapsedBeforePause * 1000);
        this._startLoop();
    }

    stop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this.paused = false;
        this.elapsedBeforePause = 0;
        this.startTime = null;
        if (this.progressBar) {
            this.progressBar.value = 0;
            setRangeGradient(this.progressBar);
        }
        if (this.timerSpan) {
            this.timerSpan.textContent = formatTime(0) + ' / ' + formatTime(this.duration);
        }
    }

    update() {
        if (!this.startTime || this.paused) return;
        const elapsed = (performance.now() - this.startTime) / 1000;
        if (this.progressBar) {
            this.progressBar.value = Math.min(this.duration, elapsed);
            if (this._lastProgressValue !== elapsed) {
                setRangeGradient(this.progressBar);
                this._lastProgressValue = elapsed;
            }
        }
        this.updateDisplay();
        if (elapsed >= this.duration) {
            this.stop();
            if (this.onFinish) this.onFinish();
        }
    }

    updateDisplay() {
        const elapsed = this.progressBar ? Number(this.progressBar.value) : 0;
        if (this.timerSpan) {
            this.timerSpan.textContent = formatTime(elapsed) + ' / ' + formatTime(this.duration);
        }
    }
}
