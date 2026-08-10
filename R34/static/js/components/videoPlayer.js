import { setRangeGradient } from '../utils.js';
import { icon } from '../icons.js';
import { StorageManager } from '../storage.js';

// Кастомные контролы для видео
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

        const originalPlay = this.video.play;
        this.video.play = () => {
            if (this._pausedSrc) {
                this._shouldPlayOnRestore = true;
                this._restoreVideoSourceIfNeeded();
                return Promise.resolve();
            }
            return originalPlay.apply(this.video);
        };

        const originalPause = this.video.pause;
        this.video.pause = () => {
            this._shouldPlayOnRestore = false;
            return originalPause.apply(this.video);
        };

        this._initControls();

        // Register player to handle global scroll hiding
        window.activeVideoPlayers = window.activeVideoPlayers || [];
        window.activeVideoPlayers.push(this);
    }

    _initControls() {
        if (!this.container.style.position && window.getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }
        this.controlsBar = document.createElement('div');
        if (this.fullscreenMode) {
            this.controlsBar.className = 'custom-video-controls gallery-video-controls-wrapper';
        } else {
            this.controlsBar.className = 'custom-video-controls in-card-controls';
        }

        // Кнопка Play/Pause внизу в панели управления
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
            // Update gradient immediately for smooth dragging feedback
            this._updateProgress(true);
        };
        this.controlsBar.appendChild(this.progressBar);

        // Добавляем timeLabel для длительности
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

        // Кнопка управления звуком
        if (this.fullscreenMode) {
            const defaultVol = localStorage.getItem('r34_default_volume');
            if (defaultVol !== null) {
                this.video.volume = (parseFloat(defaultVol) || 50) / 100;
            }

            this.soundBtn = document.createElement('button');
            this.soundBtn.className = 'video-bottom-sound-btn';
            this.soundBtn.onclick = (e) => {
                e.stopPropagation();
                this.video.muted = !this.video.muted;
                if (!this.video.muted) {
                    const savedVol = localStorage.getItem('r34_default_volume');
                    this.video.volume = savedVol !== null ? (parseFloat(savedVol) || 50) / 100 : 0.50;
                }
                this._updateSoundState();
            };
            this.controlsBar.appendChild(this.soundBtn);

            // В полноэкранном режиме делаем аккуратный тонкий слайдер для громкости
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
                if (volNum > 0 && this.video.muted) {
                    this.video.muted = false;
                }
                const volPct = Math.round(volNum * 100);
                StorageManager.setItem('r34_default_volume', volPct.toString());
                const settingsInput = document.getElementById('settingsDefaultVolumeInput');
                const settingsManual = document.getElementById('settingsDefaultVolumeManual');
                const settingsVal = document.getElementById('settingsDefaultVolumeValue');
                if (settingsInput) {
                    settingsInput.value = volPct;
                    if (typeof setRangeGradient === 'function') setRangeGradient(settingsInput);
                }
                if (settingsManual) settingsManual.value = volPct;
                if (settingsVal) settingsVal.textContent = volPct + '%';
                this._updateSoundState();
            };
            this.controlsBar.appendChild(this.volumeSlider);
            this._updateSoundState();
        }


        this.video.addEventListener('play', () => {
            this._startProgressLoop();
            this._hideFreezeFrame();
            if (this._unloadTimeout) {
                clearTimeout(this._unloadTimeout);
                this._unloadTimeout = null;
            }
            this._updatePlayState();
            this._showControls(true, 3000);
        });
        this.video.addEventListener('playing', () => {
            this._hideLoading();
            this._startProgressLoop();
            this._hideFreezeFrame();
            this._isRestoring = false;
        });
        this.video.addEventListener('waiting', () => this._showLoading());
        this.video.addEventListener('stalled', () => {
            if (!this.video.paused && this.video.readyState < 3) {
                this._showLoading();
            }
        });
        this.video.addEventListener('canplay', () => {
            this._hideLoading();
            this._updateProgress();
        });
        this.video.addEventListener('pause', () => {
            this._hideLoading();
            this._stopProgressLoop();
            this._updatePlayState();
            this._showControls();

            if (this._isRestoring) return;

            // Stop download/buffering completely on pause
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
                }, 500); // 500ms delay to keep interactive seeking/play-pause snappy
            }
        });
        this.video.addEventListener('ended', () => {
            this._stopProgressLoop();
            this._updatePlayState();
        });
        this.video.addEventListener('timeupdate', () => {
            // Only update via event if not currently in high-precision animation loop
            if (!this._animationFrameId) {
                this._updateProgress();
            }
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
        this.video.addEventListener('canplay', () => this._updateProgress());

        // Unified Click & Double-Click Handler
        const handleInteraction = (e) => {
            // If clicking controls bar (except play button), ignore
            if (e.target.closest('.custom-video-controls') && !e.target.closest('.video-bottom-play-btn')) {
                return;
            }
            e.stopPropagation();
            e.preventDefault();

            const rect = this.video.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const centerWidth = rect.width * 0.4;
            const centerHeight = rect.height * 0.4;
            const isCenterArea = clickX >= (rect.width - centerWidth) / 2 && clickX <= (rect.width + centerWidth) / 2 && clickY >= (rect.height - centerHeight) / 2 && clickY <= (rect.height + centerHeight) / 2;

            // Check if clicking on play button (center play btn or bottom play btn)
            const isPlayClick = e.target.closest('.center-play-btn') || e.target.closest('.video-bottom-play-btn');
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
                    if (this.options.onToggleInfo) {
                        this.options.onToggleInfo();
                    }
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
                    if (isRightSide) {
                        this._pausedTime = savedTime + seekAmount;
                    } else {
                        this._pausedTime = Math.max(0, savedTime - seekAmount);
                    }
                    this._showSeekIndicator(isRightSide ? 'forward' : 'backward');
                    this._restoreVideoSourceIfNeeded();
                } else {
                    const duration = this._duration || this.video.duration || 0;
                    if (isRightSide) {
                        this.video.currentTime = Math.min(duration, this.video.currentTime + seekAmount);
                        this._showSeekIndicator('forward');
                    } else {
                        this.video.currentTime = Math.max(0, this.video.currentTime - seekAmount);
                        this._showSeekIndicator('backward');
                    }
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

        // Keep controls visible when hovering over the control bar
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
                this._showControls();
            };
            this.container.addEventListener('mousemove', handleMouseMove);
            this.video.addEventListener('mousemove', handleMouseMove);
        }

        // Global single scroll-bind check (automatic and clean)
        if (typeof window !== 'undefined' && !window._videoScrollHandlerBound) {
            window._videoScrollHandlerBound = true;
            document.addEventListener('scroll', () => {
                window.activeVideoPlayers = (window.activeVideoPlayers || []).filter(p => document.body.contains(p.video));
                window.activeVideoPlayers.forEach(p => {
                    // Don't hide controls on scroll if in fullscreen mode
                    if (!p.fullscreenMode) {
                        p._hideControls();
                    }
                });
            }, { passive: true, capture: true });
        }

        if (this.video.parentNode !== this.container) {
            this.container.appendChild(this.video);
        }
        this.container.appendChild(this.controlsBar);
        this.container.appendChild(this.centerPlayBtn);

        this._updatePlayState();
        this._updateProgress();

        // Показываем контролы при инициализации в fullscreen
        if (this.fullscreenMode) {
            this._showControls();
        }
    }

    _togglePlay() {
        if (this.video.paused) {
            this.video.muted = false;
            this.video.dataset.manuallyPaused = "false";
            const playPromise = this.video.play();
            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.log('Playback starting was interrupted or prevented:', err);
                });
            }
        } else {
            this.video.dataset.manuallyPaused = "true";
            this.video.pause();
        }
    }

    _updatePlayState() {
        if (this.video.paused || this.video.ended || this._controlsVisible) {
            this.centerPlayBtn.classList.remove('hide-controls');
        } else {
            this.centerPlayBtn.classList.add('hide-controls');
        }
        // Меняем иконку play/pause
        if (this.video.paused || this.video.ended) {
            this.centerPlayBtn.innerHTML = `<svg viewBox="0 0 24 24" style="margin-left: 3px;"><path d="M8 5v14l11-7z" fill="#fff"/></svg>`;
            if (this.bottomPlayBtn) {
                this.bottomPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
            }
        } else {
            this.centerPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="#fff"/></svg>`;
            if (this.bottomPlayBtn) {
                this.bottomPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`;
            }
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
                // Find the maximum end time of any buffer segment that covers or is immediately ahead of current time
                let maxEnd = current;
                
                // First pass: find segments that contain current time
                for (let i = 0; i < this.video.buffered.length; i++) {
                    const start = this.video.buffered.start(i);
                    const end = this.video.buffered.end(i);
                    if (current >= start - 0.5 && current <= end + 0.1) {
                        if (end > maxEnd) maxEnd = end;
                    }
                }
                
                // Second pass: bridge small gaps (up to 2 seconds) to find the contiguous buffered block ahead
                let changed = true;
                while (changed) {
                    changed = false;
                    for (let i = 0; i < this.video.buffered.length; i++) {
                        const start = this.video.buffered.start(i);
                        const end = this.video.buffered.end(i);
                        // If segment starts within 2 seconds of our current maxEnd
                        if (start <= maxEnd + 2.0 && end > maxEnd) {
                            maxEnd = end;
                            changed = true;
                        }
                    }
                }
                
                bufferedPercent = (maxEnd / duration) * 100;
                
                // If it's almost fully buffered (within 1s of end), snap to 100%
                if (duration - maxEnd < 1.0) {
                    bufferedPercent = 100;
                }
            } else if (this.video.readyState >= 3) {
                // HAVE_FUTURE_DATA or better usually means some buffer is available
                // If buffered length is 0 but we have readyState >= 3, assume at least a tiny bit is buffered
                bufferedPercent = Math.max(playbackPercent, playbackPercent + 1.5);
            } else if (this._pausedSrc) {
                bufferedPercent = Math.max(playbackPercent, this._lastBufferedPercent || playbackPercent);
            }
            
            // Safety clamp
            bufferedPercent = Math.min(100, Math.max(playbackPercent, bufferedPercent));
            this._lastBufferedPercent = bufferedPercent;

            // Refined multi-stop linear gradient for progress (played, buffered, background)
            // Increased buffered region opacity to 0.45 for better visibility on all videos
            this.progressBar.style.background = `linear-gradient(90deg, 
                var(--accent, #ff3b6b) 0%, 
                var(--accent, #ff3b6b) ${playbackPercent}%, 
                rgba(255, 255, 255, 0.45) ${playbackPercent}%, 
                rgba(255, 255, 255, 0.45) ${bufferedPercent}%, 
                rgba(255, 255, 255, 0.1) ${bufferedPercent}%, 
                rgba(255, 255, 255, 0.1) 100%)`;

            if (this.timeLabel) {
                const cur = this._formatTime(current);
                const dur = this._formatTime(duration);
                this.timeLabel.textContent = `${cur} / ${dur}`;
            }
        } else {
            this.progressBar.value = 0;
            this.progressBar.style.background = `rgba(255, 255, 255, 0.15)`;
            if (this.timeLabel) {
                this.timeLabel.textContent = '0:00 / 0:00';
            }
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
        if (this.loadingSpinner) {
            this.loadingSpinner.classList.add('visible');
        }
    }

    _hideLoading() {
        if (this.loadingSpinner) {
            this.loadingSpinner.classList.remove('visible');
        }
    }

    _formatTime(seconds) {
        seconds = Math.floor(seconds || 0);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    _updateSoundState() {
        if (!this.soundBtn) return;
        if (this.video.muted) {
            this.soundBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
            if (this.volumeSlider) {
                this.volumeSlider.value = 0;
            }
        } else {
            this.soundBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
            if (this.volumeSlider) {
                this.volumeSlider.value = this.video.volume;
            }
        }
    }

    // --- Автоскрытие ---
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
    _hideControls(isAutomatic = false) {
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
        
        if (direction === 'forward') {
            indicator.innerHTML = `
                <div style="font-size: 3rem; margin-bottom: 8px;">${icon('fastForward', { size: 48 })}</div>
                <div style="font-size: 1.2rem; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">+10 сек</div>
            `;
        } else {
            indicator.innerHTML = `
                <div style="font-size: 3rem; margin-bottom: 8px;">${icon('rewind', { size: 48 })}</div>
                <div style="font-size: 1.2rem; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">-10 сек</div>
            `;
        }
        
        this.container.appendChild(indicator);
        // Force reflow
        indicator.offsetHeight;
        indicator.classList.add('visible');
        
        setTimeout(() => {
            indicator.classList.remove('visible');
            setTimeout(() => {
                indicator.remove();
            }, 250);
        }, 500);
    }

    _showFreezeFrame() {
        if (!this.video.videoWidth || !this.video.videoHeight) return false;
        
        if (this._freezeCanvas) {
            this._freezeCanvas.remove();
        }
        
        const canvas = document.createElement('canvas');
        canvas.className = 'video-freeze-frame';
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        try {
            ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.warn("Failed to draw freeze frame:", e);
            canvas.remove();
            return false;
        }
        
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '1';
        
        if (this.video.style.objectFit) {
            canvas.style.objectFit = this.video.style.objectFit;
        }
        
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
                    this._hideFreezeFrame();
                    this._updateProgress();
                    if (this._shouldPlayOnRestore) {
                        this._shouldPlayOnRestore = false;
                        this.video.play().catch(e => console.log("Play failed on restore:", e));
                    }
                };
                
                this.video.addEventListener('seeked', onReady, { once: true });
                this.video.addEventListener('canplay', onReady, { once: true });
                this.video.addEventListener('playing', onReady, { once: true });
                setTimeout(onReady, 150);
            };

            this.video.addEventListener('loadeddata', restoreHandler, { once: true });
            setTimeout(() => {
                if (this._isRestoring) {
                    restoreHandler();
                }
            }, 300);
        }
    }

    _destroy() {
        this._stopProgressLoop();
        if (this._unloadTimeout) {
            clearTimeout(this._unloadTimeout);
        }
        if (this._freezeCanvas) {
            this._freezeCanvas.remove();
        }
        if (window.activeVideoPlayers) {
            window.activeVideoPlayers = window.activeVideoPlayers.filter(p => p !== this);
        }
    }
}
