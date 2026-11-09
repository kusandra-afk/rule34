import { setRangeGradient } from '../utils.js';
import { icon } from '../icons.js';
import { StorageManager } from '../storage.js';

// Custom video controls
export class VideoPlayer {
    constructor(videoElement, container, options = {}) {
        this.video = videoElement;
        this.video._videoPlayerInstance = this;
        this.container = container;
        this.options = options;
        this.showFullscreenBtn = options.showFullscreenBtn !== false;
        this.fullscreenMode = options.fullscreenMode === true;
        this.progressBar = null;
        this.timeLabel = null;
        this.fullscreenBtn = null;
        this.centerPlayBtn = null;
        this.loadingSpinner = null;
        this.bottomPlayBtn = null;
        this.soundBtn = null;
        this.volumeSlider = null;
        this.controlsBar = null;
        this.hideTimeout = null;
        this._controlsVisible = false;
        this._lastShownTime = 0;
        this.wasPlayingOnSeek = false;
        this._clickTimeout = null;

        this._duration = 0;
        this._pausedSrc = null;
        this._pausedTime = 0;
        this._isRestoring = false;
        this._pendingSeekPercent = null;
        this._unloadTimeout = null;
        this._freezeCanvas = null;
        this._isDragging = false;
        this._animationFrameId = null;
        // Keep the user's mute choice across play/pause and source unload/restore.
        this._userMuted = this.video.muted;

        const originalPlay = this.video.play;
        this.video.play = (...args) => {
            if (this._pausedSrc) {
                this._shouldPlayOnRestore = true;
                this._restoreVideoSourceIfNeeded();
                return Promise.resolve();
            }
            // Some mobile browsers reset muted when playback begins. Apply our
            // saved choice immediately before delegating to the native method.
            this.video.muted = this._userMuted;
            return originalPlay.apply(this.video, args);
        };

        const originalPause = this.video.pause;
        this.video.pause = (...args) => {
            this._shouldPlayOnRestore = false;
            return originalPause.apply(this.video, args);
        };

        this._initControls();

        window.activeVideoPlayers = window.activeVideoPlayers || [];
        window.activeVideoPlayers.push(this);
    }

    _initControls() {
        if (!this.container.style.position && window.getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }
        this.controlsBar = document.createElement('div');
        this.controlsBar.className = this.fullscreenMode
            ? 'custom-video-controls gallery-video-controls-wrapper'
            : 'custom-video-controls in-card-controls';

        if (this.fullscreenMode) {
            this.bottomPlayBtn = document.createElement('button');
            this.bottomPlayBtn.className = 'video-bottom-play-btn';
            this.bottomPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
            this.bottomPlayBtn.onclick = (e) => {
                e.stopPropagation();
                this._togglePlay();
            };
            this.controlsBar.appendChild(this.bottomPlayBtn);
        }

        this.progressBar = document.createElement('input');
        this.progressBar.type = 'range';
        this.progressBar.className = 'video-progress';
        this.progressBar.min = 0;
        this.progressBar.step = 1;
        this.progressBar.value = 0;
        this.progressBar.max = 10000;
        this.progressBar.onmousedown = () => {
            this._isDragging = true;
            this.wasPlayingOnSeek = !this.video.paused;
            if (this._unloadTimeout) {
                clearTimeout(this._unloadTimeout);
                this._unloadTimeout = null;
            }
            this._restoreVideoSourceIfNeeded();
        };
        this.progressBar.onmouseup = () => {
            this._isDragging = false;
            if (this.wasPlayingOnSeek) {
                this.video.play().catch(e => console.log(e));
            } else {
                this.video.pause();
            }
        };
        this.progressBar.oninput = () => {
            const duration = this._duration || this.video.duration;
            const progressValue = parseFloat(this.progressBar.value) / 10000;
            if (this._pausedSrc) {
                this._pendingSeekPercent = progressValue;
                this._restoreVideoSourceIfNeeded();
            } else if (duration) {
                this.video.currentTime = progressValue * duration;
            }
            this._updateProgress(true);
        };
        this.controlsBar.appendChild(this.progressBar);

        this.timeLabel = document.createElement('span');
        this.timeLabel.className = 'video-time';
        this.timeLabel.textContent = '0:00 / 0:00';
        this.controlsBar.appendChild(this.timeLabel);

        this.centerPlayBtn = document.createElement('button');
        this.centerPlayBtn.className = 'center-play-btn';
        this.centerPlayBtn.innerHTML = `<svg viewBox="0 0 24 24" style="margin-left: 3px;"><path d="M8 5v14l11-7z" fill="#fff"/></svg>`;

        this.loadingSpinner = document.createElement('div');
        this.loadingSpinner.className = 'video-loading-spinner';
        this.container.appendChild(this.loadingSpinner);

        if (this.fullscreenMode) {
            const defaultVol = localStorage.getItem('r34_default_volume');
            if (defaultVol !== null) {
                this.video.volume = (parseFloat(defaultVol) || 50) / 100;
            }

            this.soundBtn = document.createElement('button');
            this.soundBtn.className = 'video-bottom-sound-btn';
            this.soundBtn.onclick = (e) => {
                e.stopPropagation();
                this._setMuted(!this._userMuted);
                if (!this._userMuted) {
                    const savedVol = localStorage.getItem('r34_default_volume');
                    this.video.volume = savedVol !== null ? (parseFloat(savedVol) || 50) / 100 : 0.50;
                }
                this._updateSoundState();
            };
            this.controlsBar.appendChild(this.soundBtn);

            const isTouchDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
                || ('ontouchstart' in window && window.innerWidth <= 900);

            if (!isTouchDevice) {
                this.volumeSlider = document.createElement('input');
                this.volumeSlider.type = 'range';
                this.volumeSlider.className = 'video-bottom-volume';
                this.volumeSlider.min = 0;
                this.volumeSlider.max = 1;
                this.volumeSlider.step = 0.01;
                this.volumeSlider.value = this.video.muted ? 0 : this.video.volume;
                this.volumeSlider.oninput = () => {
                    const volNum = Number(this.volumeSlider.value);
                    this.video.volume = volNum;
                    if (volNum > 0) this._setMuted(false);
                    const volPct = Math.round(volNum * 100);
                    StorageManager.setItem('r34_default_volume', volPct.toString());
                    const settingsInput = document.getElementById('settingsDefaultVolumeInput');
                    const settingsManual = document.getElementById('settingsDefaultVolumeManual');
                    const settingsVal = document.getElementById('settingsDefaultVolumeValue');
                    if (settingsInput) {
                        settingsInput.value = volPct;
                        setRangeGradient(settingsInput);
                    }
                    if (settingsManual) settingsManual.value = volPct;
                    if (settingsVal) settingsVal.textContent = volPct + '%';
                    this._updateSoundState();
                };
                this.controlsBar.appendChild(this.volumeSlider);
            }
            this._updateSoundState();
        }

        this.video.addEventListener('play', () => {
            this._startProgressLoop();
            if (this._unloadTimeout) {
                clearTimeout(this._unloadTimeout);
                this._unloadTimeout = null;
            }
            this._updatePlayState();
            this._updateSoundState();
            this._showControls(true, 3000);
        });
        this.video.addEventListener('playing', () => {
            this._hideLoading();
            this._startProgressLoop();
            this._hideFreezeFrame();
            this._isRestoring = false;
            this._updateSoundState();
        });
        this.video.addEventListener('waiting', () => this._showLoading());
        this.video.addEventListener('stalled', () => {
            if (!this.video.paused && this.video.readyState < 3) this._showLoading();
        });
        this.video.addEventListener('canplay', () => {
            this._hideLoading();
            this._updateProgress();
        });
        this.video.addEventListener('volumechange', () => {
            // Pick up mute changes made by browser controls or other app code.
            this._userMuted = this.video.muted;
            this.video.dataset.r34UserMuted = String(this._userMuted);
            this._updateSoundState();
        });
        this.video.addEventListener('pause', () => {
            this._hideLoading();
            this._stopProgressLoop();
            this._updatePlayState();
            this._showControls();

            if (this._isRestoring) return;

            const currentSrc = this.video.src || this.video.currentSrc;
            if (currentSrc && !currentSrc.startsWith('data:') && currentSrc !== window.location.href) {
                if (this._unloadTimeout) clearTimeout(this._unloadTimeout);
                this._unloadTimeout = setTimeout(() => {
                    if (this.video.paused && !this._isRestoring) {
                        if (this._showFreezeFrame()) {
                            this._pausedSrc = currentSrc;
                            this._pausedTime = this.video.currentTime;
                            this.video.removeAttribute('src');
                            this.video.load();
                        }
                    }
                }, 1500);
            }
        });
        this.video.addEventListener('ended', () => {
            this._stopProgressLoop();
            this._updatePlayState();
        });
        this.video.addEventListener('timeupdate', () => {
            if (!this._animationFrameId) this._updateProgress();
        });
        this.video.addEventListener('progress', () => this._updateProgress());
        this.video.addEventListener('loadedmetadata', () => {
            const duration = this.video.duration;
            if (this.options.post && !isNaN(duration) && duration > 0) {
                StorageManager.setItem(`r34_duration_${this.options.post.id}`, duration.toString());
            }
            this._updateProgress();
        });
        this.video.addEventListener('durationchange', () => {
            const duration = this.video.duration;
            if (this.options.post && !isNaN(duration) && duration > 0) {
                StorageManager.setItem(`r34_duration_${this.options.post.id}`, duration.toString());
            }
            this._updateProgress();
        });
        this.video.addEventListener('loadeddata', () => this._updateProgress());

        const handleInteraction = (e) => {
            if (e.target.closest('.custom-video-controls') && !e.target.closest('.video-bottom-play-btn')) return;
            e.stopPropagation();
            e.preventDefault();

            const rect = this.video.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const centerRadius = Math.min(60, Math.min(rect.width, rect.height) * 0.18);
            const isCenterArea = Math.hypot(clickX - centerX, clickY - centerY) <= centerRadius;

            let isPlayClick = Boolean(e.target.closest('.center-play-btn') || e.target.closest('.video-bottom-play-btn'));
            if (!isPlayClick && this.centerPlayBtn && !this.centerPlayBtn.classList.contains('hide-controls')) {
                const btnRect = this.centerPlayBtn.getBoundingClientRect();
                isPlayClick = e.clientX >= btnRect.left && e.clientX <= btnRect.right
                    && e.clientY >= btnRect.top && e.clientY <= btnRect.bottom;
            }
            const isTogglePlayClick = isPlayClick || isCenterArea;

            const performSingleClick = () => {
                if (isTogglePlayClick) {
                    this._togglePlay();
                    this._userExplicitlyHidden = false;
                    this._showControls(true, 3000);
                } else {
                    if (this._controlsVisible) {
                        this._userExplicitlyHidden = true;
                        this._hideControls();
                    } else {
                        this._userExplicitlyHidden = false;
                        this._showControls(false);
                    }
                    if (this.options.onToggleInfo) this.options.onToggleInfo();
                }
            };

            if (this._clickTimeout) {
                clearTimeout(this._clickTimeout);
                this._clickTimeout = null;
                const isRightSide = clickX > rect.width / 2;
                const seekAmount = 10;
                if (this._unloadTimeout) {
                    clearTimeout(this._unloadTimeout);
                    this._unloadTimeout = null;
                }
                if (this._pausedSrc) {
                    const savedTime = this._pausedTime || 0;
                    this._pausedTime = isRightSide ? savedTime + seekAmount : Math.max(0, savedTime - seekAmount);
                    this._showSeekIndicator(isRightSide ? 'forward' : 'backward');
                    this._restoreVideoSourceIfNeeded();
                } else {
                    const duration = this._duration || this.video.duration || 0;
                    this.video.currentTime = isRightSide
                        ? Math.min(duration, this.video.currentTime + seekAmount)
                        : Math.max(0, this.video.currentTime - seekAmount);
                    this._showSeekIndicator(isRightSide ? 'forward' : 'backward');
                }
                this._userExplicitlyHidden = false;
                this._showControls();
            } else {
                this._clickTimeout = setTimeout(() => {
                    this._clickTimeout = null;
                    performSingleClick();
                }, 250);
            }
        };

        this.video.addEventListener('click', handleInteraction);
        this.centerPlayBtn.addEventListener('click', handleInteraction);

        this.controlsBar.addEventListener('mouseenter', () => {
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        });
        this.controlsBar.addEventListener('mouseleave', () => {
            if (this._controlsVisible) {
                if (this.hideTimeout) clearTimeout(this.hideTimeout);
                if (!this.video.paused && !this.video.ended) {
                    this.hideTimeout = setTimeout(() => this._hideControls(true), 3000);
                }
            }
        });

        this._userExplicitlyHidden = false;

        if (this.fullscreenMode) {
            const handleMouseMove = () => {
                if (this._userExplicitlyHidden) return;
                this._showControls(true, 3000);
            };
            this.container.addEventListener('mousemove', handleMouseMove);
            this.video.addEventListener('mousemove', handleMouseMove);
        } else {
            const handleCardHover = () => {
                if (!document.body.classList.contains('can-hover')) return;
                this._userExplicitlyHidden = false;
                this._showControls(true, 3000);
            };
            this.container.onmouseenter = handleCardHover;
            this.container.onmousemove = handleCardHover;
            this.container.onmouseleave = () => {
                if (!document.body.classList.contains('can-hover')) return;
                if (this.hideTimeout) {
                    clearTimeout(this.hideTimeout);
                    this.hideTimeout = null;
                }
                if (!this.video.paused && !this.video.ended) this._hideControls(true);
            };
        }

        if (typeof window !== 'undefined' && !window._videoScrollHandlerBound) {
            window._videoScrollHandlerBound = true;
            let scrollRafPending = false;
            document.addEventListener('scroll', () => {
                if (scrollRafPending) return;
                scrollRafPending = true;
                requestAnimationFrame(() => {
                    scrollRafPending = false;
                    window.activeVideoPlayers = (window.activeVideoPlayers || []).filter(p => document.body.contains(p.video));
                    window.activeVideoPlayers.forEach(p => {
                        if (!p.fullscreenMode) p._hideControls();
                    });
                });
            }, { passive: true, capture: true });
        }

        if (this.video.parentNode !== this.container) this.container.appendChild(this.video);
        this.container.appendChild(this.controlsBar);
        this.container.appendChild(this.centerPlayBtn);

        this._updatePlayState();
        this._updateProgress();
        this._updateSoundState();

        if (this.fullscreenMode) this._showControls();
    }

    _setMuted(muted) {
        this._userMuted = Boolean(muted);
        const value = String(this._userMuted);
        this.video.dataset.r34UserMuted = value;
        this.video.dataset.r34ExplicitMuted = value;
        this.video.dataset.r34MutePreference = value;
        this.video.defaultMuted = this._userMuted;
        if (this._userMuted) this.video.setAttribute('muted', '');
        else this.video.removeAttribute('muted');
        this.video.muted = this._userMuted;
    }

    _togglePlay() {
        if (this.video.paused) {
            // Do not unmute here. Playback must preserve the user's explicit
            // sound-button choice, including the first start on mobile.
            this.video.dataset.manuallyPaused = 'false';
            const playPromise = this.video.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => console.log('Playback starting was interrupted or prevented:', err));
            }
        } else {
            this.video.dataset.manuallyPaused = 'true';
            this.video.pause();
        }
    }

    _updatePlayState() {
        if (this.video.paused || this.video.ended || this._controlsVisible) {
            this.centerPlayBtn.classList.remove('hide-controls');
        } else {
            this.centerPlayBtn.classList.add('hide-controls');
        }
        if (this.video.paused || this.video.ended) {
            this.centerPlayBtn.innerHTML = `<svg viewBox="0 0 24 24" style="margin-left: 3px;"><path d="M8 5v14l11-7z" fill="#fff"/></svg>`;
            if (this.bottomPlayBtn) this.bottomPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
        } else {
            this.centerPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="#fff"/></svg>`;
            if (this.bottomPlayBtn) this.bottomPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`;
        }
    }

    _updateProgress(force = false) {
        if (this._isDragging && !force) return;

        let duration = this.video.duration;
        if (!isNaN(duration) && duration > 0) {
            this._duration = duration;
        } else {
            duration = this._duration;
        }

        if (isNaN(duration) || !duration || duration <= 0) {
            if (this.options && this.options.post) {
                const cached = parseFloat(localStorage.getItem(`r34_duration_${this.options.post.id}`));
                if (!isNaN(cached) && cached > 0) {
                    duration = cached;
                    this._duration = cached;
                }
            }
        }

        if (!isNaN(duration) && duration > 0) {
            const current = this._pausedSrc ? (this._pausedTime || 0) : (this.video.currentTime || 0);
            this.progressBar.max = 10000;
            this.progressBar.value = Math.round((current / duration) * 10000);
            const playbackPercent = (current / duration) * 100;
            let bufferedPercent = playbackPercent;

            if (this.video.buffered && this.video.buffered.length > 0) {
                let maxEnd = current;
                for (let i = 0; i < this.video.buffered.length; i++) {
                    const start = this.video.buffered.start(i);
                    const end = this.video.buffered.end(i);
                    if (current >= start - 0.5 && current <= end + 0.1 && end > maxEnd) maxEnd = end;
                }
                let changed = true;
                while (changed) {
                    changed = false;
                    for (let i = 0; i < this.video.buffered.length; i++) {
                        const start = this.video.buffered.start(i);
                        const end = this.video.buffered.end(i);
                        if (start <= maxEnd + 2.0 && end > maxEnd) {
                            maxEnd = end;
                            changed = true;
                        }
                    }
                }
                bufferedPercent = (maxEnd / duration) * 100;
                if (duration - maxEnd < 1.0) bufferedPercent = 100;
            } else if (this.video.readyState >= 3) {
                bufferedPercent = Math.max(playbackPercent, playbackPercent + 1.5);
            } else if (this._pausedSrc) {
                bufferedPercent = Math.max(playbackPercent, this._lastBufferedPercent || playbackPercent);
            }

            bufferedPercent = Math.min(100, Math.max(playbackPercent, bufferedPercent));
            this._lastBufferedPercent = bufferedPercent;
            this.progressBar.style.background = `linear-gradient(90deg,
                var(--accent, #ff3b6b) 0%,
                var(--accent, #ff3b6b) ${playbackPercent}%,
                rgba(255, 255, 255, 0.45) ${playbackPercent}%,
                rgba(255, 255, 255, 0.45) ${bufferedPercent}%,
                rgba(255, 255, 255, 0.1) ${bufferedPercent}%,
                rgba(255, 255, 255, 0.1) 100%)`;

            if (this.timeLabel) {
                this.timeLabel.textContent = `${this._formatTime(current)} / ${this._formatTime(duration)}`;
            }
        } else {
            this.progressBar.value = 0;
            this.progressBar.style.background = 'rgba(255, 255, 255, 0.15)';
            if (this.timeLabel) this.timeLabel.textContent = '0:00 / 0:00';
        }
    }

    _startProgressLoop() {
        if (this._animationFrameId) return;
        const loop = () => {
            this._updateProgress();
            this._animationFrameId = requestAnimationFrame(loop);
        };
        this._animationFrameId = requestAnimationFrame(loop);
    }

    _stopProgressLoop() {
        if (this._animationFrameId) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
    }

    _showLoading() {
        if (this.loadingSpinner) this.loadingSpinner.classList.add('visible');
    }

    _hideLoading() {
        if (this.loadingSpinner) this.loadingSpinner.classList.remove('visible');
    }

    _formatTime(seconds) {
        seconds = Math.floor(seconds || 0);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    _updateSoundState() {
        if (!this.soundBtn) return;
        if (this.video.muted) {
            this.soundBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
            if (this.volumeSlider) this.volumeSlider.value = 0;
        } else {
            this.soundBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>`;
            if (this.volumeSlider) this.volumeSlider.value = this.video.volume;
        }
    }

    _showControls(autoHide = false, delay = 3000) {
        this.controlsBar.classList.remove('hide-controls');
        this.centerPlayBtn.classList.remove('hide-controls');
        this._controlsVisible = true;
        this._lastShownTime = Date.now();
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        if (autoHide && !this.video.paused && !this.video.ended) {
            this.hideTimeout = setTimeout(() => this._hideControls(true), delay);
        }
    }

    _hideControls() {
        if (this.video.paused || this.video.ended) {
            this.controlsBar.classList.remove('hide-controls');
            this.centerPlayBtn.classList.remove('hide-controls');
            this._controlsVisible = true;
            return;
        }
        this.controlsBar.classList.add('hide-controls');
        this.centerPlayBtn.classList.add('hide-controls');
        this._controlsVisible = false;
    }

    _showSeekIndicator(direction) {
        const indicator = document.createElement('div');
        indicator.className = `seek-indicator ${direction === 'forward' ? 'forward' : 'backward'}`;
        indicator.innerHTML = `<div style="font-size: 3rem; margin-bottom: 8px;">${icon(direction === 'forward' ? 'fastForward' : 'rewind', { size: 48 })}</div><div style="font-size: 1.2rem; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">${direction === 'forward' ? '+10' : '-10'} sec</div>`;
        this.container.appendChild(indicator);
        indicator.offsetHeight;
        indicator.classList.add('visible');
        setTimeout(() => {
            indicator.classList.remove('visible');
            setTimeout(() => indicator.remove(), 250);
        }, 500);
    }

    _showFreezeFrame() {
        if (!this.video.videoWidth || !this.video.videoHeight) return false;
        if (this._freezeCanvas) this._freezeCanvas.remove();
        const canvas = document.createElement('canvas');
        canvas.className = 'video-freeze-frame';
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        const ctx = canvas.getContext('2d');
        try {
            ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.warn('Failed to draw freeze frame:', e);
            canvas.remove();
            return false;
        }
        Object.assign(canvas.style, {
            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
            objectFit: this.video.style.objectFit || 'contain', pointerEvents: 'none', zIndex: '1'
        });
        this.container.insertBefore(canvas, this.controlsBar);
        this._freezeCanvas = canvas;
        this.video.style.visibility = 'hidden';
        return true;
    }

    _hideFreezeFrame() {
        if (this._freezeCanvas) {
            this._freezeCanvas.remove();
            this._freezeCanvas = null;
        }
        this.container.querySelectorAll('.video-freeze-frame').forEach(canvas => canvas.remove());
        this.video.style.visibility = 'visible';
    }

    _restoreVideoSourceIfNeeded() {
        if (this._pausedSrc && !this._isRestoring) {
            this._isRestoring = true;
            const savedTime = this._pausedTime || 0;
            const savedSrc = this._pausedSrc;
            this._pausedSrc = null;
            this.video.src = savedSrc;
            this.video.load();

            const seekPercent = this._pendingSeekPercent;
            this._pendingSeekPercent = null;
            const restoreHandler = () => {
                const duration = this._duration || this.video.duration;
                if (seekPercent !== null && seekPercent !== undefined && duration) {
                    this.video.currentTime = seekPercent * duration;
                } else {
                    this.video.currentTime = savedTime;
                }

                let restored = false;
                const onReady = () => {
                    if (restored) return;
                    restored = true;
                    this._isRestoring = false;
                    this._updateProgress();
                    if (this._shouldPlayOnRestore) {
                        this._shouldPlayOnRestore = false;
                        this.video.play().catch(e => {
                            console.log('Play failed on restore:', e);
                            this._hideFreezeFrame();
                        });
                    } else {
                        this._hideFreezeFrame();
                    }
                };
                this.video.addEventListener('seeked', onReady, { once: true });
                this.video.addEventListener('canplay', onReady, { once: true });
                this.video.addEventListener('playing', onReady, { once: true });
                setTimeout(onReady, 150);
            };

            this.video.addEventListener('loadeddata', restoreHandler, { once: true });
            setTimeout(() => {
                if (this._isRestoring) restoreHandler();
            }, 300);
        }
    }

    _destroy() {
        this._stopProgressLoop();
        if (this._unloadTimeout) clearTimeout(this._unloadTimeout);
        if (this._freezeCanvas) this._freezeCanvas.remove();
        if (window.activeVideoPlayers) {
            window.activeVideoPlayers = window.activeVideoPlayers.filter(player => player !== this);
        }
    }
}
