import { formatTime, setRangeGradient } from '../utils.js';

export class PhotoViewer {
    constructor(progressBar, timerSpan) {
        this.progressBar = progressBar;
        this.timerSpan = timerSpan;
        this.timerId = null;
        this.startTime = null;
        this.duration = 10;
        this.onFinish = null;
        this.paused = false;
        this.elapsedBeforePause = 0;
        this._lastProgressValue = null;
    }

    start(duration = 10, onFinish) {
        this.stop();
        this.duration = duration;
        this.onFinish = onFinish;
        this.paused = false;
        this.elapsedBeforePause = 0;
        if (this.progressBar) {
            this.progressBar.disabled = false;
            this.progressBar.value = 0;
            this.progressBar.max = duration;
        }
        this.startTime = Date.now();
        this.updateDisplay();
        this.timerId = window.setInterval(() => this.update(), 100);
        if (this.progressBar) setRangeGradient(this.progressBar);
    }

    pause() {
        if (this.paused || !this.timerId) return;
        this.paused = true;
        this.elapsedBeforePause = (Date.now() - this.startTime) / 1000;
        clearInterval(this.timerId);
        this.timerId = null;
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
        this.startTime = Date.now() - (this.elapsedBeforePause * 1000);
        this.timerId = window.setInterval(() => this.update(), 100);
    }

    stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.paused = false;
        this.elapsedBeforePause = 0;
        if (this.progressBar) this.progressBar.value = 0;
        if (this.timerSpan) this.timerSpan.textContent = formatTime(0) + ' / ' + formatTime(this.duration);
    }

    update() {
        if (!this.startTime || this.paused) return;
        const elapsed = (Date.now() - this.startTime) / 1000;
        if (this.progressBar) {
            this.progressBar.value = elapsed;
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