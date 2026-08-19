/**
 * SafeScreen Component
 * Triggers full-screen Safe Screen display on hotkey (Shift+Esc / Ctrl+Shift+S / Alt+S)
 * Pauses and mutes all gallery videos/audio when activated.
 */

export class SafeScreen {
    constructor() {
        this.overlay = null;
        this.toast = null;
        this.isActive = false;
        this.preloadedFiles = [];
        
        this.init();
        this.preloadFiles();
    }

    async preloadFiles() {
        try {
            const files = await this.getFiles();
            this.preloadedFiles = files;
        } catch (e) {
            console.warn('Error preloading safe screen files:', e);
        }
    }

    init() {
        this.bindHotkeys();
    }

    getHotkeyConfig() {
        const saved = localStorage.getItem('r34_safe_screen_hotkey');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {}
        }
        // Default hotkey: Alt + S
        return { altKey: true, ctrlKey: false, shiftKey: false, key: 's' };
    }

    saveHotkeyConfig(config) {
        localStorage.setItem('r34_safe_screen_hotkey', JSON.stringify(config));
    }

    formatHotkey(config) {
        if (!config) config = this.getHotkeyConfig();
        const parts = [];
        if (config.ctrlKey) parts.push('Ctrl');
        if (config.altKey) parts.push('Alt');
        if (config.shiftKey) parts.push('Shift');
        if (config.metaKey) parts.push('Meta');
        
        let keyName = config.key ? config.key.toUpperCase() : 'S';
        if (keyName === ' ') keyName = 'Space';
        parts.push(keyName);
        
        return parts.join(' + ');
    }

    isCurrentHotkey(e) {
        const config = this.getHotkeyConfig();
        const ctrlMatch = !!config.ctrlKey === (e.ctrlKey || e.metaKey);
        const altMatch = !!config.altKey === e.altKey;
        const shiftMatch = !!config.shiftKey === e.shiftKey;

        const keyLower = (config.key || 's').toLowerCase();
        const eventKeyLower = e.key ? e.key.toLowerCase() : '';

        let keyMatch = (eventKeyLower === keyLower);
        if (!keyMatch && keyLower === 's' && eventKeyLower === 'ы') keyMatch = true;
        if (!keyMatch && keyLower === 'ы' && eventKeyLower === 's') keyMatch = true;
        if (!keyMatch && e.code && e.code.toLowerCase() === 'key' + keyLower) keyMatch = true;

        return ctrlMatch && altMatch && shiftMatch && keyMatch;
    }

    bindHotkeys() {
        window.addEventListener('keydown', (e) => {
            // Ignore hotkeys during typing in input or textarea (unless overlay active)
            if (!this.isActive && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            if (this.isRecording) {
                return; // Managed by startHotkeyRecording
            }

            if (this.isCurrentHotkey(e)) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') {
                    e.stopImmediatePropagation();
                }
                
                if (this.isActive) {
                    this.close();
                } else {
                    this.trigger();
                }
                return false;
            }

            // Close on Escape if active
            if (this.isActive && e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') {
                    e.stopImmediatePropagation();
                }
                this.close();
                return false;
            }
        }, true);
    }

    startHotkeyRecording(btnEl, displayEl) {
        if (this.isRecording) return;
        this.isRecording = true;

        const originalBtnText = btnEl ? btnEl.textContent : 'Изменить клавишу';
        if (btnEl) {
            btnEl.textContent = 'Нажмите клавиши... (Esc для отмены)';
            btnEl.style.background = '#ff8a00';
            btnEl.style.borderColor = '#ff8a00';
            btnEl.style.color = '#fff';
        }

        const handleRecordKeyDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }

            // If Escape alone is pressed without modifiers, cancel recording
            if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
                cleanup();
                return;
            }

            // Ignore pure modifier keys
            if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Tab'].includes(e.key)) {
                return;
            }

            const newConfig = {
                ctrlKey: e.ctrlKey || e.metaKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                key: e.key.length === 1 ? e.key.toLowerCase() : e.key
            };

            this.saveHotkeyConfig(newConfig);

            if (displayEl) {
                displayEl.textContent = this.formatHotkey(newConfig);
            }

            cleanup();
        };

        const cleanup = () => {
            this.isRecording = false;
            window.removeEventListener('keydown', handleRecordKeyDown, true);
            if (btnEl) {
                btnEl.textContent = originalBtnText;
                btnEl.style.background = '';
                btnEl.style.borderColor = '';
                btnEl.style.color = '';
            }
        };

        window.addEventListener('keydown', handleRecordKeyDown, true);
    }

    async trigger() {
        try {
            // First pause everything instantly
            this.pauseAllMedia();

            // Try to use preloaded files for 0ms latency
            let files = this.preloadedFiles;
            if (!files || files.length === 0) {
                files = await this.getFiles();
                this.preloadedFiles = files;
            }

            if (!files || files.length === 0) {
                this.showEmptyToast();
                return;
            }

            // Select random item
            const randomIndex = Math.floor(Math.random() * files.length);
            const item = files[randomIndex];

            this.open(item);
        } catch (err) {
            console.error('SafeScreen error:', err);
            this.showEmptyToast('Ошибка при загрузке Safe Screen');
        }
    }

    pauseAllMedia() {
        try {
            // 1. Pause gallery playback but KEEP the fullscreen container
            if (window.gallery) {
                this.galleryWasFullscreen = !!window.gallery.fullscreenContainer;
                this.galleryWasAutoplay = false;
                this.galleryWasVideoPlaying = false;

                if (window.gallery._photoViewer) {
                    if (!window.gallery._photoViewer.paused) {
                        this.galleryWasAutoplay = true;
                        window.gallery._photoViewer.pause();
                    }
                }

                if (window.gallery.fullscreenContainer) {
                    const video = window.gallery.fullscreenContainer.querySelector('video');
                    if (video && !video.paused) {
                        this.galleryWasVideoPlaying = true;
                        video.pause();
                        video.muted = true;
                    }
                }
                window.gallery._autoSlidePausedByUser = true;
            }

            // Exit general browser fullscreen ONLY if it is not the gallery's fullscreen container.
            // Keeping gallery fullscreen active allows the Safe Screen overlay to render seamlessly inside it.
            if (document.fullscreenElement && (!window.gallery || document.fullscreenElement !== window.gallery.fullscreenContainer)) {
                document.exitFullscreen().catch(() => {});
            }

            // 2. Pause active puzzle game timer and audio/video without hiding elements (SafeScreen overlay covers full screen)
            if (window.activePuzzleGame) {
                if (window.activePuzzleGame.overlay && document.body.contains(window.activePuzzleGame.overlay)) {
                    if (typeof window.activePuzzleGame.pauseForSafeScreen === 'function') {
                        window.activePuzzleGame.pauseForSafeScreen();
                    }
                } else {
                    window.activePuzzleGame = null;
                }
            }

            // 3. Pause and mute all video and audio elements on page (except safe-screen itself)
            const allMedia = document.querySelectorAll('video, audio');
            allMedia.forEach(el => {
                if (el.closest('.safe-screen-overlay') || el.closest('#safe-screen-overlay')) return;
                try {
                    el.pause();
                    el.muted = true;
                } catch (e) {}
            });
        } catch (e) {
            console.warn('Error pausing media for SafeScreen:', e);
        }
    }

    open(item) {
        this.isActive = true;
        this.pauseAllMedia();

        if (this.overlay) {
            this.overlay.remove();
        }

        const overlay = document.createElement('div');
        overlay.id = 'safe-screen-overlay';
        overlay.className = 'safe-screen-overlay';
        overlay.style.zIndex = '2147483647'; // Use highest possible z-index to overlay everything

        const closeBtn = document.createElement('button');
        closeBtn.className = 'safe-screen-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Закрыть (Esc)';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.close();
        };

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'safe-screen-content-wrapper';

        if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = item.url;
            video.autoplay = true;
            video.loop = true; // Видео повторяется при окончании
            video.playsInline = true;
            video.controls = false;
            video.muted = false; // Звук безопасного видео включен
            video.className = 'safe-screen-media';

            // Safeguard for looping
            video.onended = () => {
                video.currentTime = 0;
                video.play().catch(() => {});
            };

            contentWrapper.appendChild(video);
            video.play().catch(() => {
                // If autoplay blocked, try muted play then unmute
                video.muted = true;
                video.play().then(() => { video.muted = false; }).catch(() => {});
            });
        } else {
            const img = document.createElement('img');
            img.src = item.url;
            img.alt = 'Safe Screen';
            img.className = 'safe-screen-media';
            contentWrapper.appendChild(img);
        }

        const hint = document.createElement('div');
        hint.className = 'safe-screen-hint';
        hint.textContent = `Safe Screen • Нажмите ${this.formatHotkey()} или Esc, чтобы выйти`;

        overlay.appendChild(closeBtn);
        overlay.appendChild(contentWrapper);
        overlay.appendChild(hint);

        overlay.onclick = () => {
            this.close();
        };

        // If gallery is in fullscreen mode, we append the overlay to the fullscreen container
        // to render on top of native fullscreen without exiting it or breaking layout/playback!
        if (window.gallery && window.gallery.fullscreenContainer) {
            window.gallery.fullscreenContainer.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }
        
        this.overlay = overlay;

        // Auto hide hint after 3s
        setTimeout(() => {
            if (hint) hint.style.opacity = '0.3';
        }, 3000);
    }

    close() {
        this.isActive = false;
        if (this.overlay) {
            // Stop video playing inside overlay
            const videos = this.overlay.querySelectorAll('video');
            videos.forEach(v => {
                try {
                    v.pause();
                    v.src = '';
                } catch (e) {}
            });
            this.overlay.remove();
            this.overlay = null;
        }

        // Restore active puzzle game timer and update board size
        if (window.activePuzzleGame) {
            if (window.activePuzzleGame.overlay && document.body.contains(window.activePuzzleGame.overlay)) {
                if (typeof window.activePuzzleGame.resumeFromSafeScreen === 'function') {
                    window.activePuzzleGame.resumeFromSafeScreen();
                }
                if (typeof window.activePuzzleGame.updateBoardSize === 'function') {
                    window.activePuzzleGame.updateBoardSize();
                }
            } else {
                window.activePuzzleGame = null;
                window.puzzleGameActive = false;
            }
        }

        const activePuzzle = document.querySelector('.puzzle-overlay');
        if (!activePuzzle) {
            window.puzzleGameActive = false;
        }

        if (window.gallery && window.gallery.observer) {
            document.querySelectorAll('.media-container').forEach(container => {
                try {
                    window.gallery.observer.observe(container);
                } catch (e) {}
            });
        }

        // Restore gallery slideshow and video playback state
        if (window.gallery) {
            if (this.galleryWasAutoplay && window.gallery._photoViewer) {
                window.gallery._photoViewer.resume();
                window.gallery._autoSlidePausedByUser = false;
            }
            if (this.galleryWasVideoPlaying && window.gallery.fullscreenContainer) {
                const video = window.gallery.fullscreenContainer.querySelector('video');
                if (video) {
                    video.muted = false;
                    video.play().catch(() => {});
                }
            }
        }
    }

    showEmptyToast(msg) {
        if (this.toast) {
            this.toast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'safe-screen-toast';
        
        toast.innerHTML = `
            <div class="safe-screen-toast-icon">📁</div>
            <div class="safe-screen-toast-body">
                <div class="safe-screen-toast-title">Папка safe_screen пуста</div>
                <div class="safe-screen-toast-text">${msg || 'Добавьте фото или видео в папку <code>/safe_screen</code> проекта или загрузите их через Базовые настройки!'}</div>
            </div>
            <button class="safe-screen-toast-close">&times;</button>
        `;

        toast.querySelector('.safe-screen-toast-close').onclick = () => {
            toast.remove();
        };

        toast.onclick = () => {
            toast.remove();
        };

        document.body.appendChild(toast);
        this.toast = toast;

        setTimeout(() => {
            if (toast && toast.parentNode) {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 400);
            }
        }, 5000);
    }

    async uploadFiles(filesInput) {
        if (!filesInput || !filesInput.files || filesInput.files.length === 0) return;
        
        let uploaded = 0;
        for (const file of filesInput.files) {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const resp = await fetch('/api/safe-screen/upload', {
                    method: 'POST',
                    body: formData
                });
                const res = await resp.json();
                if (res.ok) uploaded++;
            } catch (e) {
                console.error('Upload error:', e);
            }
        }
        await this.preloadFiles();
        return uploaded;
    }

    async getFiles(retries = 2) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const resp = await fetch('/api/safe-screen/files');
                if (!resp.ok) {
                    if (attempt < retries) {
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }
                    return [];
                }
                const data = await resp.json();
                return (data && data.ok && Array.isArray(data.files)) ? data.files : [];
            } catch (e) {
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                console.warn('Unable to fetch safe_screen files:', e);
                return [];
            }
        }
        return [];
    }

    async deleteFile(filename) {
        try {
            const resp = await fetch('/api/safe-screen/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            const data = await resp.json();
            if (data && data.ok) {
                await this.preloadFiles();
                return true;
            }
            return false;
        } catch (e) {
            console.error('Error deleting safe_screen file:', e);
            return false;
        }
    }

    async renderFileListContainer(containerEl) {
        if (!containerEl) return;
        containerEl.innerHTML = '<div style="font-size: 0.85rem; color: rgba(255,255,255,0.5); text-align: center; padding: 12px;">Загрузка списка файлов...</div>';

        const files = await this.getFiles();
        if (files.length === 0) {
            containerEl.innerHTML = '<div style="font-size: 0.85rem; color: rgba(255,255,255,0.5); text-align: center; padding: 12px;">Папка safe_screen пуста</div>';
            return;
        }

        containerEl.innerHTML = '';
        files.forEach(file => {
            const itemEl = document.createElement('div');
            itemEl.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.05); border-radius: 6px; gap: 10px;';

            const infoEl = document.createElement('div');
            infoEl.style.cssText = 'display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1;';

            const badge = document.createElement('span');
            badge.style.cssText = 'font-size: 0.75rem; padding: 2px 6px; background: rgba(255,255,255,0.12); border-radius: 4px; text-transform: uppercase; color: #aaa;';
            badge.textContent = file.type === 'video' ? 'видео' : 'фото';

            const nameEl = document.createElement('span');
            nameEl.style.cssText = 'font-size: 0.85rem; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;';
            nameEl.textContent = file.filename;
            nameEl.title = file.filename;

            infoEl.appendChild(badge);
            infoEl.appendChild(nameEl);

            const delBtn = document.createElement('button');
            delBtn.style.cssText = 'background: rgba(255,59,107,0.15); border: 1px solid rgba(255,59,107,0.3); color: #ff3b6b; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 4px; transition: all 0.2s;';
            delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Удалить`;

            let confirmMode = false;
            let confirmTimeout = null;

            const resetBtn = () => {
                confirmMode = false;
                if (confirmTimeout) clearTimeout(confirmTimeout);
                delBtn.style.background = 'rgba(255,59,107,0.15)';
                delBtn.style.color = '#ff3b6b';
                delBtn.style.borderColor = 'rgba(255,59,107,0.3)';
                delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Удалить`;
            };

            delBtn.onmouseenter = () => {
                if (!confirmMode) {
                    delBtn.style.background = '#ff3b6b';
                    delBtn.style.color = '#fff';
                }
            };
            delBtn.onmouseleave = () => {
                if (!confirmMode) {
                    resetBtn();
                }
            };

            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (!confirmMode) {
                    confirmMode = true;
                    delBtn.style.background = '#e74c3c';
                    delBtn.style.color = '#fff';
                    delBtn.style.borderColor = '#e74c3c';
                    delBtn.innerHTML = `Точно удалить?`;
                    confirmTimeout = setTimeout(resetBtn, 3500);
                    return;
                }

                if (confirmTimeout) clearTimeout(confirmTimeout);
                delBtn.disabled = true;
                delBtn.style.opacity = '0.6';
                delBtn.textContent = 'Удаление...';

                const ok = await this.deleteFile(file.filename);
                if (ok) {
                    itemEl.style.transition = 'all 0.25s ease';
                    itemEl.style.opacity = '0';
                    itemEl.style.transform = 'translateX(20px)';
                    setTimeout(() => {
                        itemEl.remove();
                        if (containerEl.children.length === 0) {
                            containerEl.innerHTML = '<div style="font-size: 0.85rem; color: rgba(255,255,255,0.5); text-align: center; padding: 12px;">Папка safe_screen пуста</div>';
                        }
                    }, 250);
                } else {
                    delBtn.disabled = false;
                    delBtn.style.opacity = '1';
                    delBtn.style.background = 'rgba(255,59,107,0.3)';
                    delBtn.style.color = '#ff3b6b';
                    delBtn.textContent = 'Ошибка!';
                    setTimeout(resetBtn, 2000);
                }
            };

            itemEl.appendChild(infoEl);
            itemEl.appendChild(delBtn);
            containerEl.appendChild(itemEl);
        });
    }
}
