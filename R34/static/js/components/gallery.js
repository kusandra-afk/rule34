import { formatCount, escapeHtml } from '../utils.js';
import { VideoPlayer } from './videoPlayer.js';
import { PhotoViewer } from './photoViewer.js';
import { proxyUrl } from '../api.js';
import { icon } from '../icons.js';
import { StorageManager } from '../storage.js';

export class Gallery {
    constructor({ resultsDiv, loader, r34ResultsCount }) {
        this.resultsDiv = resultsDiv;
        this.loader = loader;
        this.r34ResultsCount = r34ResultsCount;
        this.currentPosts = [];
        this.onMediaClick = null;
        this.onTagClick = null;
        this.observer = null;
        this.openedInfoIndex = null;

        this.fullscreenIdx = null;
        this.fullscreenContainer = null;
        this._fullscreenHandlers = {};
        this._photoViewer = null;
        this._autoSlidePausedByUser = false;
        this.realCount = undefined;
        this._playingGridVideos = new Set();
        this._savedVideoPositions = {};
        this._playbackObserver = null;
        this._playbackObserver = null;
        this.favoritesPosts = [];
        this.profileResultsDiv = document.getElementById('profile-results');
        this._lowPowerMode = this.isLowPowerMode();
        this.loadLimitEnabled = localStorage.getItem('r34_load_limit_enabled') === 'true';
        this.preloadMode = localStorage.getItem('r34_preload_mode') || 'near';

        // Columns state
        const savedCols = localStorage.getItem('r34_gallery_cols') || '1';
        const savedIsCustom = localStorage.getItem('r34_gallery_is_custom') === 'true';
        this.currentColumns = parseInt(savedCols, 10) || 1;
        this.isCustomColumns = savedIsCustom;

        // Resize listener for dynamic performance optimization of columns
        this._resizeRaf = null;
        window.addEventListener('resize', () => {
            if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
            this._resizeRaf = requestAnimationFrame(() => this.applyColumnsStyle());
        });

        if (this.resultsDiv) {
            this.resultsDiv.innerHTML = `
                <div class="gallery-welcome-message" style="grid-column: 1 / -1; text-align: center; padding: 100px 24px; color: var(--text-muted, rgba(255,255,255,0.5)); font-size: 1.25rem; font-weight: 500; font-family: inherit;">
                    Нажмите на поиск ${icon('search', { size: 22, className: 'inline-icon' })} для загрузки меди
                </div>
            `;
        }

        // Sync favorites from Rule34 on load
        this.syncFavorites();
    }

    isLowPowerMode() {
        return localStorage.getItem('r34_low_power_mode') === 'true';
    }

    updateLowPowerMode(enabled) {
        this._lowPowerMode = enabled;
        this.refreshCurrentView();
    }

    _getSavedVideoPosition(post) {
        if (!post || !post.id) return 0;
        const postId = post.id;
        const storedTs = parseInt(localStorage.getItem(`r34_video_position_ts_${postId}`), 10);
        const now = Date.now();
        if (isNaN(storedTs) || now - storedTs > 10000) {
            localStorage.removeItem(`r34_video_position_${postId}`);
            localStorage.removeItem(`r34_video_position_ts_${postId}`);
            delete this._savedVideoPositions[postId];
            if (this._savedVideoPositionTimestamps) delete this._savedVideoPositionTimestamps[postId];
            return 0;
        }
        this._savedVideoPositionTimestamps = this._savedVideoPositionTimestamps || {};
        this._savedVideoPositionTimestamps[postId] = storedTs;
        if (typeof this._savedVideoPositions[postId] === 'number') {
            return this._savedVideoPositions[postId];
        }
        const stored = parseFloat(localStorage.getItem(`r34_video_position_${postId}`));
        if (!isNaN(stored) && stored > 0) {
            this._savedVideoPositions[postId] = stored;
            return stored;
        }
        return 0;
    }

    _saveVideoPosition(postId, currentTime) {
        if (!postId || isNaN(currentTime) || currentTime < 0) return;
        const timestamp = Date.now();
        this._savedVideoPositions[postId] = currentTime;
        this._savedVideoPositionTimestamps = this._savedVideoPositionTimestamps || {};
        this._savedVideoPositionTimestamps[postId] = timestamp;
        StorageManager.setItem(`r34_video_position_${postId}`, currentTime.toString());
        StorageManager.setItem(`r34_video_position_ts_${postId}`, timestamp.toString());
        if (!this._videoPositionCleanupTimer) {
            this._videoPositionCleanupTimer = setTimeout(() => this._cleanupExpiredVideoPositions(), 10000);
        }
    }

    _cleanupExpiredVideoPositions() {
        this._videoPositionCleanupTimer = null;
        const now = Date.now();
        this._savedVideoPositionTimestamps = this._savedVideoPositionTimestamps || {};
        Object.keys(this._savedVideoPositionTimestamps).forEach(postId => {
            const ts = this._savedVideoPositionTimestamps[postId];
            if (isNaN(ts) || now - ts > 10000) {
                delete this._savedVideoPositionTimestamps[postId];
                delete this._savedVideoPositions[postId];
                localStorage.removeItem(`r34_video_position_${postId}`);
                localStorage.removeItem(`r34_video_position_ts_${postId}`);
            }
        });

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('r34_video_position_ts_')) continue;
            const postId = key.replace('r34_video_position_ts_', '');
            const ts = parseInt(localStorage.getItem(key), 10);
            if (isNaN(ts) || now - ts > 10000) {
                localStorage.removeItem(key);
                localStorage.removeItem(`r34_video_position_${postId}`);
                delete this._savedVideoPositions[postId];
                delete this._savedVideoPositionTimestamps[postId];
                i--;
            }
        }
    }

    _scheduleSavedVideoPositionExpiry(postId) {
        if (!postId) return;
        this._videoPositionExpiryTimers = this._videoPositionExpiryTimers || {};
        if (this._videoPositionExpiryTimers[postId]) {
            clearTimeout(this._videoPositionExpiryTimers[postId]);
        }
        this._videoPositionExpiryTimers[postId] = setTimeout(() => {
            delete this._videoPositionExpiryTimers[postId];
            localStorage.removeItem(`r34_video_position_${postId}`);
            localStorage.removeItem(`r34_video_position_ts_${postId}`);
            delete this._savedVideoPositions[postId];
            if (this._savedVideoPositionTimestamps) delete this._savedVideoPositionTimestamps[postId];
        }, 10000);
    }

    _pauseAllGridVideos() {
        if (!this.resultsDiv) return;
        const cardVideos = this.resultsDiv.querySelectorAll('video.media-content');
        cardVideos.forEach(video => {
            try {
                video.pause();
            } catch (e) {
                console.log('Error pausing grid video before fullscreen:', e);
            }
        });
    }

    updateCountDisplay() {
        if (!this.r34ResultsCount) return;
        
        let countToDisplay;
        let suffix = '';
        if (this.isFavoritesActive) {
            countToDisplay = this.favoritesPosts ? this.favoritesPosts.length : 0;
            suffix = 'избранных';
        } else {
            countToDisplay = this.realCount || (this.currentPosts ? this.currentPosts.length : 0);
            suffix = 'результатов';
        }

        if (window.isCountExpanded) {
            this.r34ResultsCount.textContent = `${countToDisplay.toLocaleString('ru-RU')} ${suffix}`;
        } else {
            this.r34ResultsCount.textContent = `${formatCount(countToDisplay)} ${suffix}`;
        }
    }

    refreshCurrentView() {
        if (this.isFavoritesActive) {
            this.renderProfileFavorites();
        } else {
            this.renderGallery(false, 0);
        }
    }

    setPreloadMode(mode) {
        this.preloadMode = mode || 'near';
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this._playbackObserver) {
            this._playbackObserver.disconnect();
            this._playbackObserver = null;
        }
        this.refreshCurrentView();
    }

    getObserverRootMargin() {
        const isMobile = window.innerWidth < 900 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        if (this.preloadMode === 'page') {
            return isMobile ? '700px' : '1200px';
        }
        if (this.preloadMode === 'near') {
            return isMobile ? '260px' : '500px';
        }
        return isMobile ? '0px' : '0px';
    }

    updateDeveloperPanel() {
        const panel = document.getElementById('r34-dev-panel');
        if (!panel) return;
        const enabled = localStorage.getItem('r34_dev_mode') === 'true';
        panel.hidden = !enabled;
        if (!enabled) return;
        const cardCount = this.currentPosts ? this.currentPosts.length : 0;
        const renderedCards = this.resultsDiv ? this.resultsDiv.querySelectorAll('.media-container').length : 0;
        const activeVideos = this.resultsDiv ? this.resultsDiv.querySelectorAll('video.media-content').length : 0;
        panel.innerHTML = `
            <div style="font-weight:700; margin-bottom:6px; color:var(--accent);">DEV</div>
            <div>Карточек: ${cardCount}</div>
            <div>Отрисовано: ${renderedCards}</div>
            <div>Видео: ${activeVideos}</div>
            <div>Предзагрузка: ${this.preloadMode}</div>
        `;
    }

    async syncFavorites() {
        try {
            const myResp = await fetch('/api/my-favorites');
            if (myResp.ok) {
                const myData = await myResp.json();
                if (myData.ok && Array.isArray(myData.favorites)) {
                    myData.favorites.forEach(post => {
                        if (post && post.id) {
                            localStorage.setItem(`liked_${post.id}`, 'true');
                        }
                    });
                }
            }
        } catch (e) {
            console.error('Failed to sync my-favorites on init:', e);
        }

        try {
            const response = await fetch('/api/favorites');
            if (response.ok) {
                const favorites = await response.json();
                if (Array.isArray(favorites)) {
                    favorites.forEach(post => {
                        if (post && post.id) {
                            localStorage.setItem(`liked_${post.id}`, 'true');
                        }
                    });
                }
            }
        } catch (e) {
            // Rule34 API key might not be set
        }
    }

    getDisplayedColumns() {
        const width = window.innerWidth;
        // On mobile/tablets (< 600px), limit to 2 columns to prevent extreme lag and visual bugs
        if (width < 600) {
            return Math.min(this.currentColumns, 2);
        }
        // On medium screens (< 900px), limit to 3 columns to prevent lag
        if (width < 900) {
            return Math.min(this.currentColumns, 3);
        }
        return this.currentColumns;
    }

    getDisplayedFavoritesColumns() {
        const cols = parseInt(localStorage.getItem('r34_favorites_cols'), 10) || 2;
        const width = window.innerWidth;
        if (width < 600) {
            return Math.min(cols, 2);
        }
        if (width < 900) {
            return Math.min(cols, 3);
        }
        return cols;
    }

    updateAutoSlide() {
        const autoSlideEnabled = localStorage.getItem('r34_auto_slide') !== 'false';
        const autoSlideInterval = parseInt(localStorage.getItem('r34_auto_slide_interval'), 10) || 5;
        
        if (this._photoViewer) {
            if (autoSlideEnabled) {
                // If it was paused, and we just turned it on, we can resume.
                // Alternatively, just restart it with the new interval if interval changed.
                if (this._photoViewer.duration !== autoSlideInterval) {
                    this._photoViewer.start(autoSlideInterval, () => this._fullscreenNext("down"));
                } else if (this._photoViewer.paused) {
                    this._photoViewer.resume();
                }
                this._autoSlidePausedByUser = false;
            } else {
                if (!this._photoViewer.paused) {
                    this._photoViewer.pause();
                }
            }
            if (this.fullscreenContainer) {
                const photoBar = this.fullscreenContainer.querySelector('.photo-controls-bar');
                if (photoBar) {
                    photoBar.style.display = autoSlideEnabled ? 'flex' : 'none';
                }
                const photoPlayBtn = this.fullscreenContainer.querySelector('.photo-bottom-play-btn');
                if (photoPlayBtn) {
                    if (this._photoViewer.paused) {
                        photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
                    } else {
                        photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`;
                    }
                }
            }
        }
    }

    applyColumnsStyle() {
        if (this.resultsDiv) {
            const cols = this.getDisplayedColumns();
            const currentCols = this.resultsDiv.style.getPropertyValue('--gallery-cols');
            if (currentCols !== `${cols}`) {
                this.resultsDiv.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
                this.resultsDiv.style.setProperty('--gallery-cols', `${cols}`);
                // Set attribute on body for CSS targeting
                document.body.setAttribute('data-gallery-cols', cols);
            }
            this.resultsDiv.classList.toggle('multi-cols-mode', cols >= 2);
        }
    }

    setColumns(cols, isCustom = false) {
        this.currentColumns = cols;
        this.isCustomColumns = isCustom;
        StorageManager.setItem('r34_gallery_cols', cols);
        StorageManager.setItem('r34_gallery_is_custom', isCustom ? 'true' : 'false');

        this.applyColumnsStyle();

        const cards = this.resultsDiv.querySelectorAll('.media-container');
        cards.forEach(card => {
            const idx = parseInt(card.dataset.idx, 10);
            const post = this.currentPosts[idx];
            if (!post) return;

            const aspectRatio = (post.width && post.height) ? (post.width / post.height) : (4 / 3);
            card.style.setProperty('--card-aspect', aspectRatio);
            if (isCustom || cols >= 2) {
                card.classList.add('custom-cols');
            } else {
                card.classList.remove('custom-cols');
            }
        });
    }

    applyDurationFilter() {
        const enabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
        const minDuration = enabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
        const containers = this.resultsDiv.querySelectorAll('.media-container');
        containers.forEach(container => {
            const idx = parseInt(container.dataset.idx, 10);
            const post = this.currentPosts[idx];
            if (!post) return;
            const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
            if (isVideo) {
                let duration = 0;
                const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
                if (!isNaN(cachedDuration) && cachedDuration > 0) {
                    duration = cachedDuration;
                } else {
                    const video = container._videoEl;
                    if (video && !isNaN(video.duration) && video.duration > 0) {
                        duration = video.duration;
                    }
                }

                if (duration > 0) {
                    if (minDuration > 0 && duration < minDuration) {
                        container.style.display = 'none';
                        if (container.extraInfo) {
                            container.extraInfo.style.display = 'none';
                            container.extraInfo.setAttribute('hidden', 'true');
                        }
                    } else {
                        container.style.display = '';
                        if (container.extraInfo) {
                            container.extraInfo.removeAttribute('hidden');
                            if (this.openedInfoIndex === idx) {
                                container.extraInfo.style.display = '';
                            } else {
                                container.extraInfo.style.display = 'none';
                                container.extraInfo.setAttribute('hidden', 'true');
                            }
                        }
                    }
                } else if (minDuration > 0) {
                    // Keep visible so it can load metadata and run standard loadedmetadata filtering
                    container.style.display = '';
                } else {
                    container.style.display = '';
                }
            }
        });
    }

    displayResults(posts, realCount) {
        if (this.resultsDiv) {
            const videos = this.resultsDiv.querySelectorAll('video');
            videos.forEach(v => {
                try {
                    v.pause();
                    v.src = "";
                    v.load();
                } catch (e) {
                    // Ignore cleanup issues while swapping gallery content.
                }
            });
        }
        this.currentPosts = Array.isArray(posts) ? posts : [];
        this.realCount = realCount || this.currentPosts.length;
        this.updateCountDisplay();
        this.resultsDiv.innerHTML = '';
        this.openedInfoIndex = null;
        this.renderGallery();
        this.updateDeveloperPanel();
    }

    showFavoritesView() {
        this.isFavoritesActive = true;
        if (this.resultsDiv) this.resultsDiv.style.display = 'none';
        if (!this.profileResultsDiv) {
            this.profileResultsDiv = document.getElementById('profile-results');
        }
        if (this.profileResultsDiv) {
            this.profileResultsDiv.style.display = 'block';
            this.renderProfileFavorites();
        }
    }

    showGalleryView() {
        this.isFavoritesActive = false;
        if (!this.profileResultsDiv) {
            this.profileResultsDiv = document.getElementById('profile-results');
        }
        if (this.profileResultsDiv) {
            this.profileResultsDiv.style.display = 'none';
        }
        if (this.resultsDiv) {
            this.resultsDiv.style.display = 'grid';
            // Re-observe cards in resultsDiv so IntersectionObserver reloads images/videos without turning black
            const cards = this.resultsDiv.querySelectorAll('.media-container');
            cards.forEach(card => {
                card.dataset.loaded = "0";
                if (this.observer) {
                    this.observer.unobserve(card);
                    this.observer.observe(card);
                }
            });
        }
        if (this.r34ResultsCount) {
            this.updateCountDisplay();
        }
    }

    async renderProfileFavorites() {
        if (!this.profileResultsDiv) {
            this.profileResultsDiv = document.getElementById('profile-results');
        }
        if (!this.profileResultsDiv) return;

        this.profileResultsDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px 20px; text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--accent, #ff3b6b)"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </div>
                <h2 style="color: #fff; font-size: 1.6rem; margin-bottom: 8px; font-weight: 700;">Мои Избранные Посты</h2>
                <p id="profileStatusText" style="color: rgba(255,255,255,0.65); max-width: 600px; margin-bottom: 24px; font-size: 1rem; line-height: 1.5;">
                    Все посты, добавленные вами в избранное, возможно надежно хранятся :3
                </p>
                <p id="profileCountText" style="color: rgba(255,255,255,0.5); max-width: 600px; margin-bottom: 16px; font-size: 0.9rem; font-weight: 600;">
                    Загрузка...
                </p>
                <div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; margin-bottom: 30px; align-items: center;">
                    <button id="refreshProfileBtn" style="padding: 12px 24px; background: var(--glass-bg); color: #fff; border: 1px solid var(--glass-border); border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; display: flex; align-items: center; gap: 8px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Обновить список
                    </button>
                    
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--glass-bg); border: 1px solid var(--glass-border); padding: 6px 12px; border-radius: var(--radius-sm);">
                        <span style="font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 600; white-space: nowrap;">Колонки:</span>
                        <div class="columns-selector" id="favColumnsGroup" style="width: auto; display: flex; gap: 6px;">
                            <button class="col-btn fav-col-btn" data-cols="1" style="height: 30px; min-width: 34px; border-radius: 6px; font-size: 0.8rem; padding: 0 8px;">1</button>
                            <button class="col-btn fav-col-btn" data-cols="2" style="height: 30px; min-width: 34px; border-radius: 6px; font-size: 0.8rem; padding: 0 8px;">2</button>
                            <button class="col-btn fav-col-btn" data-cols="3" style="height: 30px; min-width: 34px; border-radius: 6px; font-size: 0.8rem; padding: 0 8px;">3</button>
                            <button class="col-btn fav-col-btn" data-cols="4" style="height: 30px; min-width: 34px; border-radius: 6px; font-size: 0.8rem; padding: 0 8px;">4</button>
                            <button class="col-btn fav-col-btn" data-cols="5" style="height: 30px; min-width: 34px; border-radius: 6px; font-size: 0.8rem; padding: 0 8px;">5</button>
                        </div>
                    </div>
                </div>
                <div id="profileFavoritesGridContainer" style="width: 100%;"></div>
            </div>
        `;

        const refreshBtn = document.getElementById('refreshProfileBtn');
        const container = document.getElementById('profileFavoritesGridContainer');
        const favColsGroup = document.getElementById('favColumnsGroup');

        const activeFavCols = parseInt(localStorage.getItem('r34_favorites_cols'), 10) || 2;

        const updateFavColsUI = (cols) => {
            if (!favColsGroup) return;
            const buttons = favColsGroup.querySelectorAll('.fav-col-btn');
            buttons.forEach(btn => {
                const dataCols = btn.getAttribute('data-cols');
                if (dataCols === cols.toString()) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        };

        updateFavColsUI(activeFavCols);

        if (favColsGroup) {
            favColsGroup.addEventListener('click', (e) => {
                const btn = e.target.closest('.fav-col-btn');
                if (!btn) return;
                const colsVal = btn.getAttribute('data-cols');
                const num = parseInt(colsVal, 10);
                if (num) {
                    StorageManager.setItem('r34_favorites_cols', num.toString());
                    updateFavColsUI(num);
                    const subGrid = container.querySelector('div[style*="display: grid"]');
                    if (subGrid) {
                        const favCols = this.getDisplayedFavoritesColumns();
                        subGrid.style.gridTemplateColumns = `repeat(${favCols}, 1fr)`;
                        subGrid.classList.toggle('multi-cols-mode', favCols >= 2);
                        subGrid.querySelectorAll('.media-container').forEach(card => {
                            if (favCols >= 2) {
                                card.classList.add('custom-cols');
                            } else {
                                card.classList.remove('custom-cols');
                            }
                        });
                    }
                }
            });
        }

        const loadFavs = async () => {
            try {
                container.innerHTML = `<div style="color: rgba(255,255,255,0.5); padding: 40px; font-size: 1.1rem;">Загрузка избранного...</div>`;
                const countText = document.getElementById('profileCountText');
                if (countText) {
                    countText.textContent = 'Загрузка...';
                }
                const resp = await fetch('/api/my-favorites');
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.ok && Array.isArray(data.favorites)) {
                        this.favoritesPosts = data.favorites;
                        this.favoritesPosts.forEach(post => {
                            if (post && post.id) {
                                StorageManager.setItem(`liked_${post.id}`, 'true');
                            }
                        });
                        // Update count text
                        if (countText) {
                            countText.textContent = `Всего постов в избранном: ${this.favoritesPosts.length}`;
                        }
                        if (this.favoritesPosts.length === 0) {
                            container.innerHTML = `
                                <div style="color: rgba(255,255,255,0.4); padding: 40px; font-size: 1.1rem;">
                                    У вас пока нет сохраненных медиа в избранном. Нажмите <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display:inline-block; vertical-align:middle;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> на любом посте в галерее, чтобы добавить его сюда!
                                </div>
                            `;
                            if (countText) {
                                countText.textContent = 'Всего постов в избранном: 0';
                            }
                            if (this.r34ResultsCount) this.updateCountDisplay();
                        } else {
                            if (this.r34ResultsCount) this.updateCountDisplay();
                            container.innerHTML = '';
                            const subGrid = document.createElement('div');
                            subGrid.style.display = 'grid';
                            const favCols = this.getDisplayedFavoritesColumns();
                            subGrid.style.gridTemplateColumns = `repeat(${favCols}, 1fr)`;
                            subGrid.classList.toggle('multi-cols-mode', favCols >= 2);
                            subGrid.style.gap = 'var(--media-gap, 16px)';
                            subGrid.style.width = '100%';

                            if (!this.observer) {
                                const isMobile = window.innerWidth < 900 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
                                this.observer = new window.IntersectionObserver(this.handleIntersection.bind(this), {
                                    root: null,
                                    rootMargin: isMobile ? '120px' : '300px',
                                    threshold: 0.01
                                });
                                
                                this._playbackObserver = new window.IntersectionObserver(this.handlePlaybackIntersection.bind(this), {
                                    root: null,
                                    threshold: 0.7
                                });
                            }

                            const fragment = document.createDocumentFragment();
                            this.favoritesPosts.forEach((post, index) => {
                                const placeholder = document.createElement('div');
                                placeholder.id = `fav-card-${post.id}`;
                                placeholder.className = 'media-container animate-pulse';
                                placeholder.dataset.idx = index;
                                placeholder.style.minHeight = '250px';
                                placeholder.style.background = 'rgba(255,255,255,0.04)';
                                placeholder.style.border = '1px solid rgba(255,255,255,0.08)';
                                placeholder.style.borderRadius = 'var(--radius-sm)';
                                placeholder.style.display = 'flex';
                                placeholder.style.flexDirection = 'column';
                                placeholder.style.alignItems = 'center';
                                placeholder.style.justifyContent = 'center';
                                if (favCols >= 2) {
                                    placeholder.classList.add('custom-cols');
                                }
                                
                                const label = document.createElement('div');
                                label.textContent = `Загрузка #${post.id}...`;
                                label.style.color = 'rgba(255,255,255,0.3)';
                                label.style.fontSize = '0.9rem';
                                label.style.fontWeight = '500';
                                placeholder.appendChild(label);
                                
                                fragment.appendChild(placeholder);
                            });
                            subGrid.appendChild(fragment);
                            container.appendChild(subGrid);

                            // Queue up IDs of favorites that need details
                            const idsToFetch = this.favoritesPosts.map(p => p.id);
                            
                            // Define a batch fetch function
                            const fetchBatch = async (batchIds) => {
                                try {
                                    const response = await fetch('/api/enrich-favorites', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ ids: batchIds })
                                    });
                                    if (response.ok) {
                                        const data = await response.json();
                                        if (data.ok && Array.isArray(data.posts)) {
                                            data.posts.forEach(fullPost => {
                                                if (!fullPost || !fullPost.id) return;
                                                
                                                const placeholder = document.getElementById(`fav-card-${fullPost.id}`);
                                                if (placeholder) {
                                                    const idx = parseInt(placeholder.dataset.idx, 10);
                                                    
                                                    // Create real card
                                                    const realCard = this.createCard(fullPost, idx);
                                                    realCard._post = fullPost;
                                                    realCard._isFavoriteCard = true;
                                                    if (favCols >= 2) {
                                                        realCard.classList.add('custom-cols');
                                                    } else {
                                                        realCard.classList.remove('custom-cols');
                                                    }
                                                    
                                                    const sourceBlock = this.createSourceBlock(fullPost);
                                                    if (sourceBlock) {
                                                        realCard._sourceBlock = sourceBlock;
                                                    }
                                                    
                                                    const extraInfo = this.createExtraInfo(fullPost, idx);
                                                    extraInfo._post = fullPost;
                                                    realCard.extraInfo = extraInfo;
                                                    
                                                    // Replace in DOM
                                                    const parent = placeholder.parentNode;
                                                    if (parent) {
                                                        // Insert realCard, sourceBlock and extraInfo before the placeholder
                                                        parent.insertBefore(realCard, placeholder);
                                                        
                                                        // Insert extraInfo and sourceBlock after the realCard
                                                        if (realCard.nextSibling) {
                                                            parent.insertBefore(extraInfo, realCard.nextSibling);
                                                            if (sourceBlock) {
                                                                parent.insertBefore(sourceBlock, extraInfo);
                                                            }
                                                        } else {
                                                            parent.appendChild(extraInfo);
                                                            if (sourceBlock) {
                                                                parent.appendChild(sourceBlock);
                                                            }
                                                        }
                                                        
                                                        // Clean up placeholder
                                                        parent.removeChild(placeholder);
                                                        
                                                        // Observe new realCard
                                                        this.observer.observe(realCard);
                                                        if (this._playbackObserver) {
                                                            this._playbackObserver.observe(realCard);
                                                        }
                                                    }
                                                }
                                            });
                                        }
                                    }
                                } catch (e) {
                                    console.error('Failed to fetch batch details:', e);
                                }
                            };
                            
                            // Process batches: 5 posts every 2 seconds
                            let batchIndex = 0;
                            const batchSize = 5;
                            
                            const processNextBatch = () => {
                                // If the container is cleared or replaced, stop processing
                                if (!document.body.contains(subGrid)) return;
                                
                                const start = batchIndex * batchSize;
                                if (start >= idsToFetch.length) return;
                                
                                const batch = idsToFetch.slice(start, start + batchSize);
                                fetchBatch(batch);
                                
                                batchIndex++;
                                if (batchIndex * batchSize < idsToFetch.length) {
                                    setTimeout(processNextBatch, 2000);
                                }
                            };
                            
                            // Run the first batch immediately!
                            processNextBatch();
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to load profile favorites:', e);
                container.innerHTML = `<div style="color: #ff3b6b; padding: 20px;">Ошибка загрузки избранного</div>`;
            }
        };

        if (refreshBtn) refreshBtn.onclick = loadFavs;
        loadFavs();
    }

    appendResults(posts, realCount) {
        if (!Array.isArray(posts) || posts.length === 0) {
            if (this._pendingFullscreenNext) {
                this._pendingFullscreenNext = false;
                this._hideFullscreenLoadingSlide();
                this._showFullscreenEndSlide('down');
            }
            return;
        }
        const oldCurrentPosts = this.currentPosts;
        this.currentPosts = this.currentPosts.concat(posts.filter(p => p && !this.currentPosts.some(e => e.id === p.id)));
        if (this._activeFullscreenPosts === oldCurrentPosts) {
            this._activeFullscreenPosts = this.currentPosts;
        }
        this.realCount = realCount || this.currentPosts.length;
        this.updateCountDisplay();
        this.renderGallery(true, this.currentPosts.length - posts.length);

        if (this._pendingFullscreenNext) {
            this._pendingFullscreenNext = false;
            this._hideFullscreenLoadingSlide();
            this._fullscreenNext();
        }
    }

    renderGallery(append = false, offset = 0) {
        if (!append) {
            this.resultsDiv.innerHTML = '';
            if (this.observer) this.observer.disconnect();
            this.observer = null;
            if (this._playbackObserver) this._playbackObserver.disconnect();
            this._playbackObserver = null;
            // Set dynamic columns on initial render with responsive limitations
            this.applyColumnsStyle();
        }
        if (!this.observer) {
            this.observer = new window.IntersectionObserver(this.handleIntersection.bind(this), {
                root: null,
                rootMargin: this.getObserverRootMargin(),
                threshold: 0.01
            });
            
            this._playbackObserver = new window.IntersectionObserver(this.handlePlaybackIntersection.bind(this), {
                root: null,
                threshold: 0.7
            });
        }
        
        const fragment = document.createDocumentFragment();
        const posts = this.currentPosts.slice(offset);
        const lowPowerMode = this.isLowPowerMode();
        const initialLimit = this.loadLimitEnabled ? (append ? 100 : 150) : Infinity;
        const postsToRender = lowPowerMode && !append ? posts.slice(0, 24) : posts.slice(0, initialLimit);
        postsToRender.forEach((post, idx) => {
            const index = offset + idx;
            const container = this.createCard(post, index);
            fragment.appendChild(container);
            if (!lowPowerMode) {
                const sourceBlock = this.createSourceBlock(post);
                if (sourceBlock) {
                    container._sourceBlock = sourceBlock;
                    if (container.style.display === 'none') {
                        sourceBlock.hidden = true;
                    }
                    fragment.appendChild(sourceBlock);
                }
                const extraInfo = this.createExtraInfo(post, index);
                container.extraInfo = extraInfo;
                if (container.style.display === 'none') {
                    extraInfo.style.display = 'none';
                    extraInfo.setAttribute('hidden', 'true');
                }
                fragment.appendChild(extraInfo);
            }
            this.observer.observe(container);
            
            // Also observe for playback control
            if (this._playbackObserver) {
                this._playbackObserver.observe(container);
            }
        });
        if (this.resultsDiv) {
            this.resultsDiv.appendChild(fragment);
        }
        this.updateDeveloperPanel();
    }

    handleIntersection(entries) {
        for (const entry of entries) {
            const container = entry.target;
            const idx = parseInt(container.dataset.idx, 10);
            const post = container._post || (this.isFavoritesActive ? (this.favoritesPosts && this.favoritesPosts[idx]) : this.currentPosts[idx]);
            if (!post) continue;
            if (entry.isIntersecting) {
                if (container.dataset.loaded !== "1") {
                    this.loadMedia(container, post, idx);
                    container.dataset.loaded = "1";
                }
            } else {
                if (container.dataset.loaded === "1") {
                    this.unloadMedia(container);
                    container.dataset.loaded = "0";
                }
            }
        }
    }

    handlePlaybackIntersection(entries) {
        for (const entry of entries) {
            const container = entry.target;
            const isVisible = entry.intersectionRatio >= 0.7;
            
            // Handle video - only pause when not visible, don't auto-play
            if (container._videoEl) {
                const video = container._videoEl;
                if (!isVisible && !video.paused) {
                    try {
                        video.dataset.autoPaused = 'true';
                        video.pause();
                    } catch (e) {
                        console.log('Error pausing video:', e);
                    }
                }
            }
            
            // Handle GIF - only pause when not visible, don't auto-play
            const gifImg = container.querySelector('img[data-is-gif="true"]');
            if (gifImg && gifImg.playGif && gifImg.pauseGif) {
                if (!isVisible) {
                    try {
                        gifImg.pauseGif();
                    } catch (e) {
                        console.log('Error pausing GIF:', e);
                    }
                }
            }
        }
    }

    unloadMedia(container) {
        // Unobserve from playback observer
        if (this._playbackObserver) {
            this._playbackObserver.unobserve(container);
        }
        
        if (container._videoEl) {
            const video = container._videoEl;
            const post = container._post;
            if (post && post.id) {
                this._saveVideoPosition(post.id, video.currentTime);
            }
            try {
                video.pause();
                video.src = '';
                video.load();
            } catch (e) {
                console.log('Error unloading video:', e);
            }
            video.remove();
            container._videoEl = null;
        }

        const mediaContent = container.querySelectorAll('.media-content');
        mediaContent.forEach(el => {
            el.src = '';
            el.remove();
        });

        const controls = container.querySelectorAll('.custom-video-controls');
        controls.forEach(el => el.remove());

        const centerBtn = container.querySelectorAll('.center-play-btn');
        centerBtn.forEach(el => el.remove());

        const gifLabel = container.querySelectorAll('.gif-label');
        gifLabel.forEach(el => el.remove());

        if (!container.querySelector('.media-placeholder')) {
            const idx = parseInt(container.dataset.idx, 10);
            const post = this.currentPosts[idx];
            const isVideo = post ? ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase()) : false;
            const placeholder = document.createElement('div');
            placeholder.className = 'media-placeholder';
            placeholder.innerHTML = isVideo ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' : '';
            container.insertBefore(placeholder, container.firstChild);
        }
    }

    createCard(post, index) {
        // Check if API failed to load data for this post
        if (post.api_failed) {
            const container = document.createElement('div');
            container.className = 'media-container';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.padding = '20px';
            container.style.background = 'rgba(255, 59, 107, 0.08)';
            container.style.border = '1px solid rgba(255, 59, 107, 0.25)';
            container.style.borderRadius = 'var(--radius-sm)';
            container.style.minHeight = '200px';
            
            const warningIcon = document.createElement('div');
            warningIcon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
            warningIcon.style.fontSize = '2rem';
            warningIcon.style.marginBottom = '10px';
            
            const warningText = document.createElement('div');
            warningText.textContent = 'API устал';
            warningText.style.color = '#ff3b6b';
            warningText.style.fontSize = '0.9rem';
            warningText.style.fontWeight = '600';
            warningText.style.textAlign = 'center';
            
            const subText = document.createElement('div');
            subText.textContent = `ID: ${post.id}`;
            subText.style.color = 'rgba(255,255,255,0.5)';
            subText.style.fontSize = '0.8rem';
            subText.style.marginTop = '5px';
            
            container.appendChild(warningIcon);
            container.appendChild(warningText);
            container.appendChild(subText);
            
            return container;
        }
        
        const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
        const aspectRatio = (post.width && post.height) ? (post.width / post.height) : (4 / 3);
        const container = document.createElement('div');
        if (this.isLowPowerMode()) {
            container.classList.add('low-power-card');
        }
        container.className = 'media-container';
        container.style.setProperty('--card-aspect', aspectRatio);
        container.style.zIndex = '2';
        if (this.isCustomColumns) {
            container.classList.add('custom-cols');
        }
        container.dataset.idx = index;

        if (isVideo) {
            const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
            if (!isNaN(cachedDuration) && cachedDuration > 0) {
                const enabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
                const minDuration = enabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
                if (minDuration > 0 && cachedDuration < minDuration) {
                    container.style.display = 'none';
                }
            }
        }

        const isLong = (post.width && post.height && (post.height / post.width > 2.8));
        const isProtected = localStorage.getItem('r34_long_image_protection') !== 'false';
        if (isLong && isProtected && !isVideo) {
            container.classList.add('long-truncated');
            const expandBtn = document.createElement('button');
            expandBtn.textContent = 'Развернуть';
            expandBtn.className = 'expand-btn';
            expandBtn.style.position = 'absolute';
            expandBtn.style.bottom = '10px';
            expandBtn.style.left = '50%';
            expandBtn.style.transform = 'translateX(-50%)';
            expandBtn.style.zIndex = '10';
            expandBtn.style.padding = '8px 16px';
            expandBtn.style.background = 'var(--accent)';
            expandBtn.style.color = '#fff';
            expandBtn.style.border = 'none';
            expandBtn.style.borderRadius = '20px';
            expandBtn.style.cursor = 'pointer';
            expandBtn.onclick = (e) => {
                e.stopPropagation();
                container.classList.remove('long-truncated');
                expandBtn.remove();
            };
            container.appendChild(expandBtn);
        }

        const placeholder = document.createElement('div');
        placeholder.className = 'media-placeholder';
        placeholder.innerHTML = isVideo ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' : '';
        container.appendChild(placeholder);

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'fullscreen-btn';
        fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
        fullscreenBtn.title = 'Открыть на весь экран';
        fullscreenBtn.onclick = (e) => {
            e.stopPropagation();
            const postsList = container._isFavoriteCard || this.isFavoritesActive ? this.favoritesPosts : this.currentPosts;
            this.openFullscreen(index, postsList);
        };
        container.appendChild(fullscreenBtn);

        if (isVideo) {
            const soundWrapper = document.createElement('div');
            soundWrapper.className = 'sound-control-wrapper';

            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'sound-volume-slider-container';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'sound-volume-slider';
            slider.min = '0';
            slider.max = '1';
            slider.step = '0.01';
            const defaultVol = localStorage.getItem('r34_default_volume');
            const initialVol = defaultVol !== null ? (parseFloat(defaultVol) || 50) / 100 : 0.50;
            slider.value = initialVol;

            sliderContainer.appendChild(slider);

            const soundBtn = document.createElement('button');
            soundBtn.className = 'sound-toggle-btn';
            soundBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
            soundBtn.title = 'Выключить звук';

            soundWrapper.appendChild(sliderContainer);
            soundWrapper.appendChild(soundBtn);
            container.appendChild(soundWrapper);

            container._soundToggleBtn = soundBtn;
            container._soundWrapper = soundWrapper;
            container._soundVolumeSlider = slider;

            soundBtn.onclick = (e) => {
                e.stopPropagation();
                if (container._videoEl) {
                    container._videoEl.muted = !container._videoEl.muted;
                    if (!container._videoEl.muted && container._videoEl.volume === 0) {
                        container._videoEl.volume = 0.5;
                        slider.value = 0.5;
                    }
                }
            };

            slider.oninput = (e) => {
                e.stopPropagation();
                if (container._videoEl) {
                    const volNum = parseFloat(slider.value);
                    container._videoEl.volume = volNum;
                    if (volNum > 0 && container._videoEl.muted) {
                        container._videoEl.muted = false;
                    }
                    if (volNum === 0) {
                        container._videoEl.muted = true;
                    }
                    const volPct = Math.round(volNum * 100);
                    localStorage.setItem('r34_default_volume', volPct.toString());
                }
            };

            soundWrapper.onclick = (e) => e.stopPropagation();
            soundWrapper.onmousedown = (e) => e.stopPropagation();
        }

        const centerOverlay = document.createElement('div');
        centerOverlay.className = 'center-overlay';
        centerOverlay.style.position = 'absolute';
        centerOverlay.style.left = '0';
        centerOverlay.style.top = '0';
        centerOverlay.style.width = '100%';
        centerOverlay.style.height = '100%';
        centerOverlay.style.zIndex = '5';
        centerOverlay.style.cursor = 'pointer';
        centerOverlay.style.background = 'transparent';
        centerOverlay.style.pointerEvents = 'none'; // включим после загрузки видео
        container.appendChild(centerOverlay);

        container.addEventListener('click', (e) => {
            if (
                e.target.classList.contains('fullscreen-btn') ||
                e.target.classList.contains('sound-toggle-btn') ||
                e.target.closest('.sound-toggle-btn') ||
                e.target.classList.contains('expand-btn') ||
                e.target.classList.contains('custom-video-controls') ||
                e.target.closest('.custom-video-controls') ||
                e.target.classList.contains('center-play-btn') ||
                e.target.closest('.center-play-btn')
            ) {
                return;
            }
            this.toggleExtraInfo(parseInt(container.dataset.idx, 10), container);
        });

        return container;
    }

    createSourceBlock(post) {
        const sourceBlock = document.createElement('div');
        sourceBlock.className = 'media-source-block';
        sourceBlock.hidden = true;

        const rawSource = post.source ?? post.source_url ?? '';
        const sourceText = typeof rawSource === 'string' ? rawSource.trim() : String(rawSource ?? '').trim();

        const emptySourceValues = new Set(['', 'null', 'none', 'undefined', 'no source', 'нету', 'нет']);
        const isEmptySource = !sourceText || emptySourceValues.has(sourceText.toLowerCase());

        const looksLikeUrl = (() => {
            if (!sourceText) return false;
            const lower = sourceText.toLowerCase();
            if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('www.')) return true;
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(sourceText)) return true;
            if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(sourceText)) return true;
            return false;
        })();

        let domain = sourceText;
        if (looksLikeUrl) {
            try {
                const urlObj = new URL(sourceText);
                domain = urlObj.hostname.replace('www.', '');
            } catch (e) {
                domain = 'источник';
            }
        }

        sourceBlock.innerHTML = `
            <div class="r34-source-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Источник медиафайла
            </div>
            ${isEmptySource ? `
                <div class="r34-source-empty-state">
                    <span class="r34-source-empty-label">Источник не указан</span>
                </div>
            ` : looksLikeUrl ? `
                <div class="r34-source-link-container">
                    <a href="${escapeHtml(sourceText)}" target="_blank" class="r34-source-link-btn" id="src-btn-${post.id}">
                        <svg class="link-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        <span class="r34-source-action-label">Перейти к источнику</span>
                        <span class="r34-domain-badge">${escapeHtml(domain)}</span>
                        <span class="r34-link-arrow">↗</span>
                    </a>
                </div>
            ` : `
                <div class="r34-source-plain-text-wrapper">
                    <div class="r34-source-plain-label">Текстовый источник</div>
                    <div class="r34-source-plain-text">${escapeHtml(sourceText)}</div>
                </div>
            `}
        `;

        // Interactive spotlight overlay effect!
        const btn = sourceBlock.querySelector('.r34-source-link-btn');
        if (btn) {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                btn.style.setProperty('--mouse-x', `${x}px`);
                btn.style.setProperty('--mouse-y', `${y}px`);
            });
        }

        return sourceBlock;
    }

    createExtraInfo(post, index) {
        const tagsArr = (post.tags || '').split(' ').filter(Boolean);
        const activeTags = window.tagSearch ? window.tagSearch.activeTags.map(t => t.value) : [];
        const safeTags = tagsArr.filter(tag => typeof tag === 'string' && tag.trim());
        const tagsHtml = safeTags.map(tag => {
            const escapedTag = escapeHtml(tag);
            return `<span class="media-tag${activeTags.includes(tag) ? ' active-tag' : ''}" data-tag="${escapedTag}">${escapedTag}</span>`;
        }).join('');
        
        const score = Number(post.score) || 0;
        const likedKey = `liked_${String(post.id)}`;
        const isLiked = localStorage.getItem(likedKey) === 'true';
        
        const extraInfo = document.createElement('div');
        extraInfo.className = 'media-extra-info';
        extraInfo.dataset.idx = index;
        const width = post.width != null ? String(post.width) : '?';
        const height = post.height != null ? String(post.height) : '?';
        const postId = post.id != null ? String(post.id) : '?';
        extraInfo.innerHTML = `
            <div class="media-meta">
                <div class="media-dimensions">
                    ${escapeHtml(width)}×${escapeHtml(height)}
                    <span class="media-id-badge" data-id="${escapeHtml(postId)}" style="opacity: 0.8; margin-left: 8px; font-weight: normal; font-size: 0.85em; color: #a78bfa; background: rgba(167, 139, 250, 0.12); padding: 2px 6px; border-radius: var(--radius-xs); border: 1px solid rgba(167, 139, 250, 0.2); white-space: nowrap; cursor: pointer; transition: all 0.2s ease;" title="Нажмите, чтобы скопировать ID">ID: ${escapeHtml(postId)}</span>
                </div>
                <div class="media-likes" data-post-id="${escapeHtml(postId)}">
                    <button class="like-btn ${isLiked ? 'liked' : ''}" 
                            data-post-id="${escapeHtml(postId)}" 
                            title="${escapeHtml(isLiked ? 'Удалить лайк' : 'Поставить лайк')}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="like-count">${escapeHtml(String(score))}</span>
                </div>
            </div>
            
            <div class="media-authors-group" style="display: none; margin-top: 10px; border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
                <div style="font-size: 0.8em; color: #2dd4bf; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    <span style="display:inline-flex; align-items:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></span> Автор:
                </div>
                <div class="media-authors-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
            </div>

            <div class="media-characters-group" style="display: none; margin-top: 10px; border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
                <div style="font-size: 0.8em; color: #a78bfa; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    <span style="display:inline-flex; align-items:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> Персонаж:
                </div>
                <div class="media-characters-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
            </div>

            <div class="media-tags-title" style="font-size: 0.8em; color: rgba(255,255,255,0.4); margin-top: 10px; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: none;">Теги:</div>
            <div class="media-tags-list">${tagsHtml}</div>
        `;
        extraInfo.hidden = true;
        
        // Add like button handler
        const likeBtn = extraInfo.querySelector('.like-btn');
        if (likeBtn) {
            likeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleLike(post.id, likeBtn);
            });
        }
        
        // Add click-to-copy handler for ID badge
        const idBadge = extraInfo.querySelector('.media-id-badge');
        if (idBadge) {
            idBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = idBadge.dataset.id;
                if (id && id !== '?') {
                    const copyToClipboard = (text) => {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            return navigator.clipboard.writeText(text);
                        } else {
                            // Fallback for older browsers or non-secure contexts
                            const textarea = document.createElement('textarea');
                            textarea.value = text;
                            textarea.style.position = 'fixed';
                            textarea.style.opacity = '0';
                            document.body.appendChild(textarea);
                            textarea.select();
                            try {
                                document.execCommand('copy');
                                return Promise.resolve();
                            } catch (err) {
                                return Promise.reject(err);
                            } finally {
                                document.body.removeChild(textarea);
                            }
                        }
                    };
                    
                    copyToClipboard(id).then(() => {
                        const originalText = idBadge.textContent;
                        idBadge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><polyline points="20 6 9 17 4 12"/></svg> Скопировано!';
                        idBadge.style.background = 'rgba(52, 227, 154, 0.15)';
                        idBadge.style.color = '#34e39a';
                        idBadge.style.borderColor = 'rgba(52, 227, 154, 0.25)';
                        setTimeout(() => {
                            idBadge.textContent = originalText;
                            idBadge.style.background = 'rgba(167, 139, 250, 0.12)';
                            idBadge.style.color = '#a78bfa';
                            idBadge.style.borderColor = 'rgba(167, 139, 250, 0.2)';
                        }, 1500);
                    }).catch(err => {
                        console.error('Failed to copy ID:', err);
                    });
                }
            });
        }
        
        extraInfo.querySelectorAll('.media-tag').forEach(el => {
            const tag = el.dataset.tag;
            
            const handleExclude = () => {
                if (window.tagSearch) {
                    const existing = window.tagSearch.activeTags.find(t => t.value === tag);
                    if (!existing || existing.active) {
                        window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.value !== tag);
                        window.tagSearch.activeTags.push({ value: tag, active: false });
                    }
                    if (window.addExcludedTag) window.addExcludedTag(tag);
                    window.tagSearch.updateActiveTagsDisplay();
                    
                    // Keep all matching tags visually in sync (strike-through and faded)
                    document.querySelectorAll(`.media-tag[data-tag="${CSS.escape(tag)}"]`).forEach(tagEl => {
                        tagEl.style.textDecoration = 'line-through';
                        tagEl.style.opacity = '0.5';
                        tagEl.classList.remove('active-tag');
                    });
                }
            };

            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleExclude();
            };

            el.onclick = (e) => {
                e.stopPropagation();
                if (e.altKey) {
                    e.preventDefault();
                    handleExclude();
                    return;
                }
                if (window.tagSearch) {
                    const existing = window.tagSearch.activeTags.find(t => t.value === tag);
                    let becameActive = false;
                    if (existing && existing.active) {
                        // Remove from active tags on repeated click
                        window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.value !== tag);
                    } else {
                        // Add as active (clear out any inactive matching first)
                        window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.value !== tag);
                        window.tagSearch.activeTags.push({ value: tag, active: true });
                        becameActive = true;
                    }
                    
                    // Keep all matching tags on the page visually in sync
                    document.querySelectorAll(`.media-tag[data-tag="${CSS.escape(tag)}"]`).forEach(tagEl => {
                        tagEl.style.textDecoration = 'none';
                        tagEl.style.opacity = '1';
                        if (becameActive) {
                            tagEl.classList.add('active-tag');
                        } else {
                            tagEl.classList.remove('active-tag');
                        }
                    });

                    window.tagSearch.updateActiveTagsDisplay();
                }
            };
        });
        return extraInfo;
    }

    async categorizeTagsForCard(infoEl, index) {
        const isFavCard = infoEl?.dataset?.favorite === 'true' || infoEl?.closest?.('.media-container')?.dataset?.favorite === 'true';
        const postsList = this.isFavoritesActive ? this.favoritesPosts : this.currentPosts;
        const post = postsList?.[index] || this.currentPosts[index];
        if (!post) return;
        
        infoEl.dataset.categorized = "1";
        
        const tagsListEl = infoEl.querySelector('.media-tags-list');
        if (!tagsListEl) return;
        
        const tagElements = Array.from(tagsListEl.querySelectorAll('.media-tag'));
        const tagNames = tagElements.map(el => el.dataset.tag).filter(Boolean);
        
        if (tagNames.length === 0) return;
        
        const typesMap = {};
        
        if (window.puzzleGameActive) {
            this.recategorizeTags(infoEl, typesMap);
            return;
        }

        const tagEntries = Array.isArray(post.tagsWithTypes)
            ? post.tagsWithTypes
            : (Array.isArray(post.tags_with_types) ? post.tags_with_types : []);

        const tagInfoEntries = Array.isArray(post.tag_info) ? post.tag_info : [];
        const normalizedTagInfoEntries = tagInfoEntries.map((entry) => {
            if (typeof entry === 'string') {
                return { name: entry, type: '0' };
            }
            if (entry && typeof entry === 'object') {
                return {
                    name: entry.tag || entry.name || entry.value || '',
                    type: entry.type || entry.category || '0'
                };
            }
            return { name: '', type: '0' };
        }).filter(entry => entry.name);

        const allEntries = [...tagEntries, ...normalizedTagInfoEntries];
        if (allEntries.length > 0) {
            allEntries.forEach((entry) => {
                const name = typeof entry === 'string'
                    ? entry
                    : (entry?.name || entry?.value || '');
                const type = typeof entry === 'string'
                    ? '0'
                    : (entry?.type || entry?.category || '0');

                if (name) {
                    typesMap[name] = String(type);
                }
            });
        }
        
        this.recategorizeTags(infoEl, typesMap);
    }
    
    recategorizeTags(infoEl, typesMap) {
        const authorsListEl = infoEl.querySelector('.media-authors-list');
        const charactersListEl = infoEl.querySelector('.media-characters-list');
        const authorsGroup = infoEl.querySelector('.media-authors-group');
        const charactersGroup = infoEl.querySelector('.media-characters-group');
        const tagsTitleEl = infoEl.querySelector('.media-tags-title');
        const tagsListEl = infoEl.querySelector('.media-tags-list');
        
        if (!tagsListEl) return;
        
        // Clear lists
        if (authorsListEl) authorsListEl.innerHTML = '';
        if (charactersListEl) charactersListEl.innerHTML = '';
        
        const tagElements = Array.from(tagsListEl.querySelectorAll('.media-tag'));
        
        let hasAuthors = false;
        let hasCharacters = false;
        let hasOthers = false;
        
        const isAuthorType = (type) => {
            const normalized = String(type || '0').toLowerCase();
            return normalized === '1' || normalized === 'artist' || normalized === 'creator' || normalized === 'author' || normalized === '5';
        };

        const isCharacterType = (type) => {
            const normalized = String(type || '0').toLowerCase();
            return normalized === '4' || normalized === 'character' || normalized === 'char';
        };

        tagElements.forEach(el => {
            const tag = el.dataset.tag;
            const type = typesMap[tag] || '0';
            
            if (isAuthorType(type)) { // Artist / Author
                if (authorsListEl) {
                    authorsListEl.appendChild(el);
                    hasAuthors = true;
                }
            } else if (isCharacterType(type)) { // Character
                if (charactersListEl) {
                    charactersListEl.appendChild(el);
                    hasCharacters = true;
                }
            } else {
                hasOthers = true;
            }
        });
        
        if (authorsGroup) {
            authorsGroup.style.display = 'block';
            if (!hasAuthors && authorsListEl) {
                const span = document.createElement('span');
                span.style.color = 'rgba(255,255,255,0.4)';
                span.style.fontSize = '0.85rem';
                span.style.fontStyle = 'italic';
                span.textContent = '(нету)';
                authorsListEl.appendChild(span);
            }
        }
        if (charactersGroup) {
            charactersGroup.style.display = 'block';
            if (!hasCharacters && charactersListEl) {
                const span = document.createElement('span');
                span.style.color = 'rgba(255,255,255,0.4)';
                span.style.fontSize = '0.85rem';
                span.style.fontStyle = 'italic';
                span.textContent = '(нету)';
                charactersListEl.appendChild(span);
            }
        }
        if (hasOthers && tagsTitleEl) {
            tagsTitleEl.style.display = 'block';
        }
    }

    async toggleLike(postId, likeBtn) {
        const normalizedPostId = String(postId);
        const isLiked = localStorage.getItem(`liked_${normalizedPostId}`) === 'true';
        const newLikedState = !isLiked;

        try {
            localStorage.setItem(`liked_${normalizedPostId}`, newLikedState ? 'true' : 'false');
        } catch (e) {
            console.warn('Failed to update like state in localStorage:', e);
        }

        const post = (this.currentPosts && this.currentPosts.find(p => String(p.id) === normalizedPostId)) ||
                     (this.favoritesPosts && this.favoritesPosts.find(p => String(p.id) === normalizedPostId));

        document.querySelectorAll(`.like-btn[data-post-id="${normalizedPostId}"]`).forEach(btn => {
            const likeCountEl = btn.nextElementSibling;
            if (newLikedState) {
                btn.classList.add('liked');
                btn.title = 'Сохранено в избранное приложения (Кликните для отмены)';
                if (likeCountEl) {
                    const cur = parseInt(likeCountEl.textContent, 10) || 0;
                    likeCountEl.textContent = String(cur + 1);
                }
            } else {
                btn.classList.remove('liked');
                btn.title = 'Добавить в избранное приложения';
                if (likeCountEl) {
                    const cur = parseInt(likeCountEl.textContent, 10) || 0;
                    likeCountEl.textContent = String(Math.max(0, cur - 1));
                }
            }
        });

        try {
            await fetch('/api/my-favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    postId: normalizedPostId,
                    action: newLikedState ? 'add' : 'delete',
                    postData: post || { id: normalizedPostId }
                })
            });
        } catch (e) {
            console.warn('Failed to sync local favorites to server:', e);
        }

        try {
            await fetch('/api/favorite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId: normalizedPostId, action: newLikedState ? 'add' : 'delete' })
            });
        } catch (e) {
            console.warn('Failed to sync favorite state with Rule34:', e);
        }
    }

    getGridColumnCount(gridElement) {
        if (!gridElement) return 1;
        const computed = window.getComputedStyle(gridElement);
        const templateCols = computed.getPropertyValue('grid-template-columns');
        if (templateCols && templateCols !== 'none') {
            const cols = templateCols.trim().split(/\s+/).length;
            if (cols > 0) return cols;
        }
        return 1;
    }

    async toggleExtraInfo(index, targetContainer) {
        const parentGrid = targetContainer ? targetContainer.parentElement : (this.isFavoritesActive ? this.profileResultsDiv : this.resultsDiv);
        const postsList = this.isFavoritesActive ? this.favoritesPosts : this.currentPosts;
        const post = postsList?.[index] || null;
        let targetInfo = targetContainer ? targetContainer.extraInfo : (parentGrid ? parentGrid.querySelector(`.media-extra-info[data-idx="${index}"]`) : null);
        let targetSourceBlock = targetContainer ? targetContainer._sourceBlock : null;

        if (!targetInfo && post) {
            targetInfo = this.createExtraInfo(post, index);
            targetContainer.extraInfo = targetInfo;
        }
        if (!targetSourceBlock && post) {
            targetSourceBlock = this.createSourceBlock(post);
            targetContainer._sourceBlock = targetSourceBlock;
        }

        if (parentGrid) {
            parentGrid.querySelectorAll('.media-extra-info').forEach(el => {
                if (el !== targetInfo) el.hidden = true;
            });
            parentGrid.querySelectorAll('.media-source-block').forEach(el => {
                if (!targetContainer || el !== targetSourceBlock) el.hidden = true;
            });
        }

        if (this.openedInfoIndex === index) {
            if (targetInfo) targetInfo.hidden = true;
            if (targetSourceBlock) targetSourceBlock.hidden = true;
            this.openedInfoIndex = null;
        } else {
            if (targetContainer && parentGrid) {
                const cards = Array.from(parentGrid.querySelectorAll('.media-container'));
                const cardIndex = cards.indexOf(targetContainer);
                if (cardIndex !== -1) {
                    const numCols = this.getGridColumnCount(parentGrid);
                    const rowEndIndex = Math.min(cards.length - 1, Math.floor(cardIndex / numCols) * numCols + numCols - 1);
                    const lastCardInRow = cards[rowEndIndex];
                    
                    if (targetSourceBlock) {
                        lastCardInRow.after(targetSourceBlock);
                        targetSourceBlock.after(targetInfo);
                    } else if (targetInfo) {
                        lastCardInRow.after(targetInfo);
                    }
                }
            }

            if (targetInfo) targetInfo.hidden = false;
            if (targetSourceBlock) targetSourceBlock.hidden = false;
            this.openedInfoIndex = index;
            
            if (targetInfo && targetInfo.dataset.categorized !== "1") {
                await this.categorizeTagsForCard(targetInfo, index);
            }
        }
    }

    loadMedia(container, post, index) {
        if (!post) return;
        const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
        const isGif = (post.file_url?.split('.').pop() || '').toLowerCase() === 'gif';
        const isSaveData = localStorage.getItem('r34_save_data') === 'true';
        const lowPowerMode = this.isLowPowerMode();
        const originalQuality = localStorage.getItem('r34_hd_enabled') === 'true';
        
        // Original quality setting applies to all media types (photos, GIFs, videos)
        let sampleUrl;
        if (originalQuality) {
            // Original quality: always use file_url
            sampleUrl = post.file_url || post.sample_url || post.preview_url;
        } else if (isSaveData) {
            // Save data mode: use preview_url for all media
            sampleUrl = post.preview_url || post.sample_url || post.file_url;
        } else {
            // Default: use sample_url for photos, file_url for videos/GIFs
            sampleUrl = isVideo || isGif ? post.file_url : (post.sample_url || post.file_url || post.preview_url);
        }
        const placeholder = container.querySelector('.media-placeholder');
        if (placeholder) placeholder.remove();

        const existingMedia = container.querySelectorAll('.media-content, .center-play-btn, .gif-label, .gallery-video-controls-wrapper, video');
        existingMedia.forEach(el => el.remove());

        if (isVideo) {
            const video = document.createElement('video');
            video.className = 'media-content';
            // Use lighter preview_url for poster image in grid cards to dramatically reduce memory/CPU load on mobile devices
            video.poster = post.preview_url || post.sample_url || '';
            video.controls = false;
            video.playsInline = true;
            
            // Apply customized loop and default volume settings for grid view
            const loopEnabled = localStorage.getItem('r34_video_loop') !== 'false';
            video.loop = loopEnabled;
            
            const defaultVolume = localStorage.getItem('r34_default_volume');
            const volumeVal = defaultVolume !== null ? parseFloat(defaultVolume) / 100 : 0.50;
            video.volume = volumeVal;
            
            video.muted = false;
            video.preload = 'metadata';

            const updateSoundBtnUI = () => {
                if (container._soundToggleBtn) {
                    if (video.muted || video.volume === 0) {
                        container._soundToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
                        container._soundToggleBtn.title = 'Включить звук';
                        if (container._soundVolumeSlider) {
                            container._soundVolumeSlider.value = 0;
                        }
                    } else {
                        container._soundToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
                        container._soundToggleBtn.title = 'Выключить звук';
                        if (container._soundVolumeSlider) {
                            container._soundVolumeSlider.value = video.volume;
                        }
                    }
                }
            };
            video.addEventListener('volumechange', updateSoundBtnUI);
            updateSoundBtnUI();

            // Filter by minimum video duration & store cached duration
            const checkVideoDuration = () => {
                const duration = video.duration;
                if (!isNaN(duration) && duration > 0) {
                    localStorage.setItem(`r34_duration_${post.id}`, duration.toString());
                    const enabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
                    const minDuration = enabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
                    if (minDuration > 0 && duration < minDuration) {
                        container.style.display = 'none';
                        if (container.extraInfo) {
                            container.extraInfo.style.display = 'none';
                            container.extraInfo.setAttribute('hidden', 'true');
                        }
                    }
                }
            };
            video.addEventListener('loadedmetadata', checkVideoDuration);
            video.addEventListener('durationchange', checkVideoDuration);
            video.addEventListener('loadeddata', checkVideoDuration);
            video.addEventListener('canplay', checkVideoDuration);
            
            const prefVideoQuality = localStorage.getItem('r34_video_quality') || 'hd';
            let initialVideoSrc = post.file_url;
            if (prefVideoQuality === 'sd' && post.sample_url && (post.sample_url.endsWith('.mp4') || post.sample_url.endsWith('.webm') || post.sample_url.includes('.mp4?') || post.sample_url.includes('.webm?'))) {
                initialVideoSrc = post.sample_url;
            }
            video.preload = 'metadata';
            video.src = initialVideoSrc;

            const savedPosition = this._getSavedVideoPosition(post);
            if (savedPosition > 0) {
                video.addEventListener('loadedmetadata', () => {
                    if (!isNaN(video.duration) && video.duration > 0 && savedPosition < video.duration - 0.25) {
                        video.currentTime = Math.min(savedPosition, video.duration - 0.1);
                    }
                }, { once: true });
            }

            video.addEventListener('timeupdate', () => {
                if (post && post.id) {
                    this._saveVideoPosition(post.id, video.currentTime);
                }
            });

            // Track user-initiated pauses
            video.addEventListener('pause', () => {
                if (video.dataset.autoPaused !== 'true') {
                    video.dataset.userPaused = 'true';
                }
                video.dataset.autoPaused = 'false';
            });
            
            video.addEventListener('play', () => {
                video.dataset.userPaused = 'false';
            });

            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'gallery-video-controls-wrapper';

            container.insertBefore(video, container.firstChild);
            container.appendChild(controlsWrapper);
            new VideoPlayer(video, container, { 
                showFullscreenBtn: false, 
                fullscreenMode: false, 
                post: post,
                onToggleInfo: () => {
                    const idx = parseInt(container.dataset.idx, 10);
                    if (!isNaN(idx)) {
                        this.toggleExtraInfo(idx, container);
                    }
                },
                onPause: () => {
                    const idx = parseInt(container.dataset.idx, 10);
                    if (!isNaN(idx) && this.openedInfoIndex === idx) {
                        this.toggleExtraInfo(idx, container);
                    }
                }
            });

            container._videoEl = video;

        } else if (isGif) {
            const existingMedia = container.querySelectorAll('.media-content');
            existingMedia.forEach(el => el.remove());
            const placeholder = container.querySelector('.media-placeholder');
            if (placeholder) placeholder.remove();
            const existingPlayBtn = container.querySelectorAll('.center-play-btn');
            existingPlayBtn.forEach(el => el.remove());
            const existingGifLabel = container.querySelectorAll('.gif-label');
            existingGifLabel.forEach(el => el.remove());

            if (!container.querySelector('.fullscreen-btn')) {
                const fullscreenBtn = document.createElement('button');
                fullscreenBtn.className = 'fullscreen-btn';
                fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
                fullscreenBtn.title = 'Открыть на весь экран';
                fullscreenBtn.onclick = (e) => {
                    e.stopPropagation();
                    const postsList = container._isFavoriteCard || this.isFavoritesActive ? this.favoritesPosts : this.currentPosts;
                    this.openFullscreen(index, postsList);
                };
                container.appendChild(fullscreenBtn);
            }

            const img = document.createElement('img');
            img.className = 'media-content';
            img.dataset.isGif = 'true';
            
            const staticFallback = post.preview_url || sampleUrl;
            img.src = staticFallback;
            img.alt = post.tags || '';
            img.style.cursor = 'pointer';
            img.style.position = 'relative';
            container.insertBefore(img, container.firstChild);

            const playBtn = document.createElement('button');
            playBtn.className = 'center-play-btn';
            playBtn.innerHTML = `<svg viewBox="0 0 24 24" style="margin-left: 3px;"><path d="M8 5v14l11-7z" fill="#fff"/></svg>`;
            playBtn.style.position = 'absolute';
            playBtn.style.left = '50%';
            playBtn.style.top = '50%';
            playBtn.style.transform = 'translate(-50%, -50%)';
            playBtn.style.zIndex = '10';
            playBtn.style.cursor = 'pointer';
            container.appendChild(playBtn);

            const gifLabel = document.createElement('div');
            gifLabel.textContent = 'GIF';
            gifLabel.style.position = 'absolute';
            gifLabel.style.right = '10px';
            gifLabel.style.bottom = '10px';
            gifLabel.style.background = 'rgba(0,0,0,0.55)';
            gifLabel.style.color = '#fff';
            gifLabel.style.fontWeight = 'bold';
            gifLabel.style.fontSize = '1em';
            gifLabel.style.padding = '2px 10px';
            gifLabel.style.borderRadius = '8px';
            gifLabel.style.zIndex = '11';
            container.appendChild(gifLabel);

            let isPlaying = false;
            let staticSrc = staticFallback;

            const showPreview = () => {
                if (img.src !== staticSrc) {
                    img.src = staticSrc;
                }
                playBtn.innerHTML = `<svg viewBox="0 0 24 24" style="margin-left: 3px;"><path d="M8 5v14l11-7z" fill="#fff"/></svg>`;
                gifLabel.style.display = '';
                isPlaying = false;

                playBtn.style.opacity = '1';
                playBtn.style.visibility = 'visible';
                if (img._hideTimeout) {
                    clearTimeout(img._hideTimeout);
                    img._hideTimeout = null;
                }
            };

            const showGif = () => {
                if (img.src !== post.file_url) {
                    const spinner = document.createElement('div');
                    spinner.className = 'video-loading-spinner visible';
                    container.appendChild(spinner);
                    
                    const hideSpin = () => {
                        spinner.remove();
                        img.removeEventListener('load', hideSpin);
                        img.removeEventListener('error', hideSpin);
                    };
                    img.addEventListener('load', hideSpin);
                    img.addEventListener('error', hideSpin);
                    img.src = post.file_url;
                }
                playBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="#fff"/></svg>`;
                gifLabel.style.display = 'none';
                isPlaying = true;

                playBtn.style.opacity = '1';
                playBtn.style.visibility = 'visible';
                if (img._hideTimeout) clearTimeout(img._hideTimeout);
                img._hideTimeout = setTimeout(() => {
                    if (isPlaying) {
                        playBtn.style.opacity = '0';
                        playBtn.style.visibility = 'hidden';
                    }
                }, 1000);
            };

            img.playGif = showGif;
            img.pauseGif = showPreview;

            const togglePlayGif = (e) => {
                const rect = img.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const isCenterClick = Math.abs(clickX - centerX) < 60 && Math.abs(clickY - centerY) < 60;

                const isPlayClick = e.target.closest('.gif-play-btn') || isCenterClick;

                if (isPlayClick) {
                    if (isPlaying) {
                        showPreview();
                        img.dataset.userPaused = 'true';
                    } else {
                        showGif();
                        img.dataset.userPaused = 'false';
                    }
                } else {
                    const idx = parseInt(container.dataset.idx, 10);
                    if (!isNaN(idx)) {
                        this.toggleExtraInfo(idx, container);
                    }
                }
            };

            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePlayGif(e);
            });

            img.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePlayGif(e);
            });

            showPreview();
        } else {
            const img = document.createElement('img');
            img.className = 'media-content';
            img.decoding = 'async';
            img.alt = post.tags || '';
            img.loading = 'lazy';
            img.fetchPriority = lowPowerMode ? 'low' : 'auto';
            
            const spinner = document.createElement('div');
            spinner.className = 'video-loading-spinner visible';
            container.appendChild(spinner);
            
            img.onload = () => spinner.remove();
            img.onerror = () => {
                spinner.remove();
                if (img.src !== 'https://via.placeholder.com/600x600?text=Image+not+found') {
                    img.src = 'https://via.placeholder.com/600x600?text=Image+not+found';
                }
            };
            img.src = sampleUrl || 'https://via.placeholder.com/600x600?text=Image+not+found';
            container.insertBefore(img, container.firstChild);
        }

        if (this._playbackObserver) {
            this._playbackObserver.observe(container);
        }
    }

    // === FULLSCREEN API ===

    _isPostFiltered(post) {
        if (!post) return true;
        const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
        const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
        if (minDuration <= 0) return false;

        const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
        if (!isVideo) return false;

        const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
        if (!isNaN(cachedDuration) && cachedDuration > 0) {
            return cachedDuration < minDuration;
        }
        return false; // Keep if duration is not yet known
    }

    _preloadAdjacent(index) {
        const postsList = this._activeFullscreenPosts || (this.isFavoritesActive ? this.favoritesPosts : this.currentPosts);
        if (!postsList) return;
        
        // Find next 15 non-filtered indices
        const indicesToPreload = [];
        let nextCount = 0;
        let idx = index + 1;
        while (idx < postsList.length && nextCount < 15) {
            if (!this._isPostFiltered(postsList[idx])) {
                indicesToPreload.push(idx);
                nextCount++;
            }
            idx++;
        }
        
        // Find previous 3 non-filtered indices
        let prevCount = 0;
        idx = index - 1;
        while (idx >= 0 && prevCount < 3) {
            if (!this._isPostFiltered(postsList[idx])) {
                indicesToPreload.push(idx);
                prevCount++;
            }
            idx--;
        }

        indicesToPreload.forEach(i => {
            const p = postsList[i];
            if (!p) return;
            const isVideo = ['mp4', 'webm', 'mov'].includes((p.file_url?.split('.').pop() || '').toLowerCase());
            if (isVideo) {
                if (!this._preloadedVideos) this._preloadedVideos = {};
                if (!this._preloadedVideos[p.file_url]) {
                    const vid = document.createElement('video');
                    vid.preload = 'metadata';
                    vid.muted = true;
                    vid.playsInline = true;
                    vid.src = p.file_url;
                    vid.addEventListener('loadedmetadata', () => {
                        const d = vid.duration;
                        if (!isNaN(d) && d > 0) {
                            localStorage.setItem(`r34_duration_${p.id}`, d.toString());
                        }
                    });
                    this._preloadedVideos[p.file_url] = vid;
                }
            } else {
                const url = p.sample_url || p.file_url;
                if (url) {
                    if (!this._preloadedImages) this._preloadedImages = {};
                    if (!this._preloadedImages[url]) {
                        const img = new Image();
                        img.src = url;
                        this._preloadedImages[url] = img;
                    }
                }
            }
        });
    }

    openFullscreen(index, customPostsList) {
        this._activeFullscreenPosts = customPostsList || (this.isFavoritesActive ? this.favoritesPosts : this.currentPosts);
        const post = this._activeFullscreenPosts ? this._activeFullscreenPosts[index] : null;
        if (!post) return;

        this._fullscreenTransitioning = false;
        this._autoSlidePausedByUser = false;

        let fsContainer = document.createElement('div');
        fsContainer.className = 'media-fullscreen-container';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fullscreen-close-btn';
        closeBtn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        closeBtn.title = 'Закрыть полноэкранный режим';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this._exitFullscreen();
        };
        fsContainer.appendChild(closeBtn);

        const mediaWrapper = document.createElement('div');
        mediaWrapper.className = 'fullscreen-media-wrapper';
        fsContainer.appendChild(mediaWrapper);

        document.body.appendChild(fsContainer);

        this._pauseAllGridVideos();

        this.fullscreenIdx = index;
        this.fullscreenContainer = fsContainer;

        if (fsContainer.requestFullscreen) fsContainer.requestFullscreen().catch(() => {});
        else if (fsContainer.webkitRequestFullscreen) fsContainer.webkitRequestFullscreen();
        else if (fsContainer.msRequestFullscreen) fsContainer.msRequestFullscreen();

        this._renderFullscreenMedia();

        this._bindFullscreenHandlers();
    }

    _renderFullscreenMedia(direction = 'down') {
        if (!this.fullscreenContainer) return;
        this._hideFullscreenLoadingSlide();
        this._hideFullscreenEndSlide();
        const mediaWrapper = this.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
        if (!mediaWrapper) return;
        const oldSlide = mediaWrapper.querySelector('.media-slide');
        const idx = this.fullscreenIdx;
        const postsList = this._activeFullscreenPosts || (this.isFavoritesActive ? this.favoritesPosts : this.currentPosts);
        const post = postsList ? postsList[idx] : null;
        if (!post) return;

        // Предзагрузка соседних элементов для быстрой работы
        this._preloadAdjacent(idx);

        // Создаём новый слайд
        const newSlide = document.createElement('div');
        newSlide.className = 'media-slide';
        newSlide.style.position = 'absolute';
        newSlide.style.left = '0';
        newSlide.style.top = '0';
        newSlide.style.width = '100vw';
        newSlide.style.height = '100vh';
        newSlide.style.display = 'flex';
        newSlide.style.alignItems = 'center';
        newSlide.style.justifyContent = 'center';
        newSlide.style.background = 'none';

        if (['mp4','webm','mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase())) {
            // --- ВИДЕО ---
            this._stopPhotoTimer(); // Stop any active photo slideshow timer/viewer
            
            const video = document.createElement('video');
            video.className = 'media-content';
            
            const fsVideoQuality = localStorage.getItem('r34_video_quality') || 'hd';
            let fsVideoSrc = post.file_url;
            if (fsVideoQuality === 'sd' && post.sample_url && (post.sample_url.endsWith('.mp4') || post.sample_url.endsWith('.webm') || post.sample_url.includes('.mp4?') || post.sample_url.includes('.webm?'))) {
                fsVideoSrc = post.sample_url;
            } else if (fsVideoQuality === 'sd') {
                video.preload = 'metadata';
            }
            video.src = fsVideoSrc;
            video.poster = post.preview_url || post.sample_url || '';
            video.controls = false;
            video.autoplay = true;
            
            const savedPosition = this._getSavedVideoPosition(post);
            if (savedPosition > 0) {
                video.addEventListener('loadedmetadata', () => {
                    if (!isNaN(video.duration) && video.duration > 0 && savedPosition < video.duration - 0.25) {
                        video.currentTime = Math.min(savedPosition, video.duration - 0.1);
                    }
                }, { once: true });
            }

            // Apply customized volume and loop settings
            const defaultVolume = localStorage.getItem('r34_default_volume');
            const volumeVal = defaultVolume !== null ? parseFloat(defaultVolume) / 100 : 0.50;
            video.volume = volumeVal;
            
            video.muted = false;
            // In fullscreen slideshow mode, do not loop the video so that onended fires and advances to the next post
            video.loop = false;
            video.playsInline = true;
            video.preload = 'metadata';
            video.style.width = '100vw';
            video.style.height = '100vh';
            video.style.objectFit = 'contain';

            newSlide.appendChild(video);

            const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
            const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
            
            if (minDuration > 0) {
                this._showFullscreenLoader();
                video.style.opacity = '0';
                video.pause();
            }

            const timeoutId = setTimeout(() => {
                this._hideFullscreenLoader();
                video.style.opacity = '1';
                video.play().catch(() => {});
            }, 300);

            const checkAndSkipFiltered = () => {
                const duration = (!isNaN(video.duration) && video.duration > 0) ? video.duration : parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
                if (!isNaN(duration) && duration > 0) {
                    clearTimeout(timeoutId);
                    localStorage.setItem(`r34_duration_${post.id}`, duration.toString());
                    this._hideFullscreenLoader();
                    const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
                    const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
                    if (minDuration > 0 && duration < minDuration && this.fullscreenIdx === idx) {
                        video.pause();
                        video.src = "";
                        if (newSlide && newSlide.parentNode) {
                            newSlide.parentNode.removeChild(newSlide);
                        }
                        this._hideFullscreenLoader();

                        if (direction === 'up') {
                            let prevIdx = this.fullscreenIdx - 1;
                            while (prevIdx >= 0) {
                                const p = this.currentPosts[prevIdx];
                                if (!this._isPostFiltered(p)) {
                                    const cachedD = parseFloat(localStorage.getItem(`r34_duration_${p.id}`));
                                    if (minDuration > 0 && !isNaN(cachedD) && cachedD > 0 && cachedD < minDuration) {
                                        prevIdx--;
                                        continue;
                                    }
                                    break;
                                }
                                prevIdx--;
                            }
                            if (prevIdx >= 0) {
                                this.fullscreenIdx = prevIdx;
                                this._renderFullscreenMedia("up");
                            } else {
                                this._fullscreenTransitioning = false;
                            }
                        } else {
                            let nextIdx = this.fullscreenIdx + 1;
                            while (nextIdx < this.currentPosts.length) {
                                const p = this.currentPosts[nextIdx];
                                if (!this._isPostFiltered(p)) {
                                    const cachedD = parseFloat(localStorage.getItem(`r34_duration_${p.id}`));
                                    if (minDuration > 0 && !isNaN(cachedD) && cachedD > 0 && cachedD < minDuration) {
                                        nextIdx++;
                                        continue;
                                    }
                                    break;
                                }
                                nextIdx++;
                            }
                            if (nextIdx < this.currentPosts.length) {
                                this.fullscreenIdx = nextIdx;
                                this._renderFullscreenMedia("down");
                            } else {
                                this._fullscreenTransitioning = false;
                            }
                        }
                        return;
                    } else {
                        video.style.opacity = '1';
                        video.play().catch(() => {});
                    }
                }
            };
            video.addEventListener('loadedmetadata', checkAndSkipFiltered);
            video.addEventListener('durationchange', checkAndSkipFiltered);
            video.addEventListener('canplay', checkAndSkipFiltered);
            // Also call immediately
            checkAndSkipFiltered();

            new VideoPlayer(video, newSlide, { showFullscreenBtn: false, fullscreenMode: true, post: post });
            video.onended = () => {
                if (direction === 'up') {
                    this._fullscreenPrev("up");
                } else {
                    this._fullscreenNext("down");
                }
            };
        } else {
            // --- ФОТО ---
            const img = document.createElement('img');
            img.className = 'media-content';
            const hasSample = post.sample_url && post.sample_url !== post.file_url;
            
            const isSaveData = localStorage.getItem('r34_save_data') === 'true';
            let imgHdEnabled = localStorage.getItem('r34_image_hd_enabled') === 'true' || localStorage.getItem('r34_hd_enabled') === 'true';
            if (isSaveData) {
                img.src = post.preview_url || post.sample_url || post.file_url;
            } else {
                img.src = (hasSample && !imgHdEnabled) ? post.sample_url : (post.file_url || post.sample_url || post.preview_url);
            }
            
            img.alt = post.tags || '';
            img.style.width = '100vw';
            img.style.height = '100vh';
            img.style.objectFit = 'contain';

            newSlide.appendChild(img);

            const spinner = document.createElement('div');
            spinner.className = 'video-loading-spinner visible';
            newSlide.appendChild(spinner);
            
            if (img.complete) {
                spinner.classList.remove('visible');
            } else {
                img.onload = () => spinner.classList.remove('visible');
                img.onerror = () => spinner.classList.remove('visible');
            }

            const photoBar = document.createElement('div');
            photoBar.className = 'photo-controls-bar fullscreen';

            // Кнопка Play/Pause для слайдшоу
            const photoPlayBtn = document.createElement('button');
            photoPlayBtn.className = 'photo-bottom-play-btn';
            photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`; // Активен режим "играть" (показываем иконку паузы)

            const progress = document.createElement('input');
            progress.type = 'range';
            progress.className = 'photo-progress';
            progress.min = 0;
            progress.max = 10;
            progress.step = 0.01;
            progress.value = 0;
            progress.disabled = false;

            const timerLabel = document.createElement('span');
            timerLabel.className = 'photo-timer';
            timerLabel.textContent = '0:00 / 0:10';

            photoBar.appendChild(photoPlayBtn);
            photoBar.appendChild(progress);
            photoBar.appendChild(timerLabel);

            // Если есть HD версия, то встраиваем кнопку прямо в панель управления
            if (hasSample) {
                const hdBtn = document.createElement('button');
                hdBtn.className = 'fullscreen-hd-btn';
                
                const updateButtonState = () => {
                    if (imgHdEnabled) {
                        hdBtn.textContent = 'HD';
                        hdBtn.title = 'Качество: Оригинал (HD). Нажмите для переключения на SD';
                        hdBtn.classList.add('loaded');
                    } else {
                        hdBtn.textContent = 'SD';
                        hdBtn.title = 'Качество: Сжатое (SD). Нажмите для переключения на HD';
                        hdBtn.classList.remove('loaded');
                    }
                };
                
                updateButtonState();
                
                hdBtn.onclick = (e) => {
                    e.stopPropagation();
                    imgHdEnabled = !imgHdEnabled;
                    localStorage.setItem('r34_image_hd_enabled', imgHdEnabled ? 'true' : 'false');
                    localStorage.setItem('r34_hd_enabled', imgHdEnabled ? 'true' : 'false');
                    
                    if (imgHdEnabled) {
                        hdBtn.textContent = 'Загрузка...';
                        hdBtn.classList.add('loading');
                        hdBtn.disabled = true;
                        
                        const tempImg = new Image();
                        tempImg.src = post.file_url;
                        tempImg.onload = () => {
                            img.src = post.file_url;
                            hdBtn.disabled = false;
                            hdBtn.classList.remove('loading');
                            updateButtonState();
                        };
                        tempImg.onerror = () => {
                            imgHdEnabled = false;
                            localStorage.setItem('r34_image_hd_enabled', 'false');
                            localStorage.setItem('r34_hd_enabled', 'false');
                            hdBtn.textContent = 'Ошибка';
                            hdBtn.classList.remove('loading');
                            hdBtn.disabled = false;
                            updateButtonState();
                        };
                    } else {
                        img.src = post.sample_url || post.file_url || post.preview_url;
                        updateButtonState();
                    }
                };
                photoBar.appendChild(hdBtn);
            } else {
                const hdBtn = document.createElement('button');
                hdBtn.className = 'fullscreen-hd-btn loaded';
                hdBtn.textContent = 'HD';
                hdBtn.title = 'Качество: Оригинальное (HD)';
                hdBtn.style.cursor = 'default';
                hdBtn.onclick = (e) => e.stopPropagation();
                photoBar.appendChild(hdBtn);
            }

            newSlide.appendChild(photoBar);

            // Скрытие и показ пульта управления для фото во весь экран
            let controlsVisible = true;
            let userExplicitlyHidden = false;
            let hidePhotoTimeout = null;

            const showPhotoControls = () => {
                photoBar.classList.remove('hide-controls');
                const closeBtn = this.fullscreenContainer ? this.fullscreenContainer.querySelector('.fullscreen-close-btn') : null;
                if (closeBtn) {
                    closeBtn.style.opacity = '0.89';
                    closeBtn.style.visibility = 'visible';
                }
                controlsVisible = true;
                if (hidePhotoTimeout) clearTimeout(hidePhotoTimeout);
                // Auto hide after 3.5 seconds
                hidePhotoTimeout = setTimeout(() => {
                    hidePhotoControls();
                }, 3500);
            };

            const hidePhotoControls = () => {
                photoBar.classList.add('hide-controls');
                controlsVisible = false;
            };

            newSlide.addEventListener('click', (e) => {
                if (e.target.closest('.photo-controls-bar') || e.target.closest('.fullscreen-close-btn')) {
                    return;
                }
                e.stopPropagation();
                if (controlsVisible) {
                    userExplicitlyHidden = true;
                    hidePhotoControls();
                } else {
                    userExplicitlyHidden = false;
                    showPhotoControls();
                }
            });

            newSlide.addEventListener('mousemove', () => {
                if (userExplicitlyHidden) return;
                showPhotoControls();
            });

            // Запускаем таймер автоскрытия
            showPhotoControls();

            if (this._photoViewer) this._photoViewer.stop();
            this._photoViewer = new PhotoViewer(progress, timerLabel);
            
            const autoSlideEnabled = localStorage.getItem('r34_auto_slide') !== 'false';
            const autoSlideInterval = parseInt(localStorage.getItem('r34_auto_slide_interval'), 10) || 5;
            
            this._photoViewer.start(autoSlideInterval, () => this._fullscreenNext("down"));
            
            if (!autoSlideEnabled || this._autoSlidePausedByUser) {
                this._photoViewer.pause();
                photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
                if (!autoSlideEnabled) {
                    photoBar.style.display = 'none';
                } else {
                    photoBar.style.display = 'flex';
                }
            } else {
                photoBar.style.display = 'flex';
            }

            photoPlayBtn.onclick = (e) => {
                e.stopPropagation();
                if (this._photoViewer) {
                    if (this._photoViewer.paused) {
                        this._photoViewer.resume();
                        this._autoSlidePausedByUser = false;
                        photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`;
                        photoBar.style.display = 'flex';
                    } else {
                        this._photoViewer.pause();
                        this._autoSlidePausedByUser = true;
                        photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
                        photoBar.style.display = 'flex';
                    }
                }
            };
        }

        // Анимация слайда (плавное вертикальное перелистывание)
        mediaWrapper.appendChild(newSlide);
        
        let startTransform = 'translateY(100%)';
        let endOldTransform = 'translateY(-100%)';
        if (direction === 'up' || direction === 'prev') {
            startTransform = 'translateY(-100%)';
            endOldTransform = 'translateY(100%)';
        }

        if (!oldSlide) {
            newSlide.style.opacity = '0';
            newSlide.style.transform = 'scale(0.95)';
            newSlide.style.transition = 'opacity 0.3s cubic-bezier(.4,0,.2,1), transform 0.3s cubic-bezier(.4,0,.2,1)';
            newSlide.offsetHeight; // trigger reflow
            requestAnimationFrame(() => {
                newSlide.style.opacity = '1';
                newSlide.style.transform = 'scale(1)';
            });
            this._fullscreenTransitioning = false;
        } else {
            newSlide.style.opacity = '0';
            newSlide.style.transform = startTransform;
            newSlide.offsetHeight; // trigger reflow

            // Pause any videos in old slide immediately to release audio/video streams
            const oldVideos = oldSlide.querySelectorAll('video');
            oldVideos.forEach(v => {
                try {
                    v.pause();
                    v.src = "";
                    v.load();
                } catch (e) {
                    console.log('Error cleaning up old video slide:', e);
                }
            });

            requestAnimationFrame(() => {
                newSlide.style.opacity = '1';
                newSlide.style.transform = 'translateY(0)';
                
                oldSlide.style.opacity = '0';
                oldSlide.style.transform = endOldTransform;
                
                setTimeout(() => {
                    if (oldSlide && oldSlide.parentNode) {
                        oldSlide.parentNode.removeChild(oldSlide);
                    }
                    this._fullscreenTransitioning = false;
                }, 600); // Matches the 0.6s transition duration in CSS
            });
        }
    }

    _stopPhotoTimer() {
        if (this._photoViewer) this._photoViewer.stop();
        this._photoViewer = null;
    }

    _bindFullscreenHandlers() {
        let touchStartY = null;
        let swipeDirection = null;

        const touchStart = (e) => {
            if (e.touches && e.touches[0]) {
                touchStartY = e.touches[0].clientY;
            }
        };
        const touchMove = (e) => {
            if (touchStartY === null) return;
            if (!e.touches || !e.touches[0]) return;
            let touchY = e.touches[0].clientY;
            let diffY = touchY - touchStartY;
            if (Math.abs(diffY) > 30) {
                swipeDirection = diffY > 0 ? "down" : "up";
            }
        };
        const touchEnd = () => {
            if (!swipeDirection) {
                touchStartY = null;
                return;
            }
            this._autoSlidePausedByUser = false;
            if (swipeDirection === "up") {
                this._fullscreenNext("down");
            } else if (swipeDirection === "down") {
                this._fullscreenPrev("up");
            }
            touchStartY = null;
            swipeDirection = null;
        };

        const keyHandler = (e) => {
            if (!this.fullscreenContainer) return;
            const isShiftEsc = e.shiftKey && e.key === 'Escape';
            const isCtrlShiftS = e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы');
            const isAltS = e.altKey && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы');
            if (isShiftEsc || isCtrlShiftS || isAltS) {
                return; // Let SafeScreen handle hotkey
            }
            if (['Escape', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 
                'd', 'D', 'a', 'A', 's', 'S', 'w', 'W', ' '].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (e.key === 'Escape' && !e.shiftKey) {
                this._exitFullscreen();
            } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
                this._autoSlidePausedByUser = false;
                this._fullscreenNext();
            } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
                this._autoSlidePausedByUser = false;
                this._fullscreenPrev();
            } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
                this._autoSlidePausedByUser = false;
                this._fullscreenNext('down');
            } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
                this._autoSlidePausedByUser = false;
                this._fullscreenPrev('up');
            } else if (e.key === ' ') {
                if (this._photoViewer) {
                    const photoPlayBtn = this.fullscreenContainer ? this.fullscreenContainer.querySelector('.photo-bottom-play-btn') : null;
                    if (this._photoViewer.paused) {
                        this._photoViewer.resume();
                        this._autoSlidePausedByUser = false;
                        if (photoPlayBtn) photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`;
                    } else {
                        this._photoViewer.pause();
                        this._autoSlidePausedByUser = true;
                        if (photoPlayBtn) photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
                    }
                } else if (this.fullscreenContainer) {
                    const video = this.fullscreenContainer.querySelector('video');
                    if (video) {
                        if (video.paused) {
                            video.dataset.manuallyPaused = "false";
                            video.play().catch(() => {});
                        } else {
                            video.dataset.manuallyPaused = "true";
                            video.pause();
                        }
                    }
                }
            }
        };

        const fsHandler = () => {
            if (!document.fullscreenElement) {
                this._cleanupFullscreen();
            }
        };

        let lastWheelTime = 0;
        const wheelHandler = (e) => {
            if (!this.fullscreenContainer) return;
            e.preventDefault();
            e.stopPropagation();
            
            const now = Date.now();
            if (now - lastWheelTime < 800) return; // 800ms cooldown to block trackpad scroll inertia and skip spikes
            
            const threshold = 35; // slightly higher threshold for deliberate scrolling
            if (Math.abs(e.deltaY) < threshold) return;
            
            if (e.deltaY > 0) {
                lastWheelTime = now;
                this._autoSlidePausedByUser = false;
                this._fullscreenNext("down");
            } else {
                lastWheelTime = now;
                this._autoSlidePausedByUser = false;
                this._fullscreenPrev("up");
            }
        };

        const touchOpts = { passive: false };
        this.fullscreenContainer.addEventListener('touchstart', touchStart, touchOpts);
        this.fullscreenContainer.addEventListener('touchmove', touchMove, touchOpts);
        this.fullscreenContainer.addEventListener('touchend', touchEnd, touchOpts);
        window.addEventListener('keydown', keyHandler, true);
        document.addEventListener('fullscreenchange', fsHandler);
        this.fullscreenContainer.addEventListener('wheel', wheelHandler, { passive: false });

        this._fullscreenHandlers = {
            touchStart, 
            touchMove, 
            touchEnd, 
            keyHandler, 
            fsHandler,
            wheel: wheelHandler
        };
    }

    _exitFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
        this._cleanupFullscreen();
    }

    _cleanupFullscreen() {
        this._stopPhotoTimer();
        this._hideFullscreenLoadingSlide();
        this._hideFullscreenEndSlide();
        if (this.fullscreenContainer) {
            // Pause and unload any active video element to avoid play interruptions
            const videos = this.fullscreenContainer.querySelectorAll('video');
            videos.forEach(v => {
                try {
                    v.pause();
                    v.src = "";
                    v.load();
                } catch (e) {
                    console.log('Error cleaning up videos in fullscreen:', e);
                }
            });

            // Call _destroy() if video player instance exists
            const videoElement = this.fullscreenContainer.querySelector('video');
            if (videoElement && typeof videoElement._videoPlayerInstance?._destroy === 'function') {
                videoElement._videoPlayerInstance._destroy();
            }

            const touchOpts = { passive: false };
            this.fullscreenContainer.removeEventListener('touchstart', this._fullscreenHandlers?.touchStart, touchOpts);
            this.fullscreenContainer.removeEventListener('touchmove', this._fullscreenHandlers?.touchMove, touchOpts);
            this.fullscreenContainer.removeEventListener('touchend', this._fullscreenHandlers?.touchEnd, touchOpts);
            this.fullscreenContainer.removeEventListener('wheel', this._fullscreenHandlers?.wheel, { passive: false });
            this.fullscreenContainer.remove();
            this.fullscreenContainer = null;
            
            // Fix for scroll reset on exit
            if (this.fullscreenIdx !== null && this.resultsDiv) {
                const el = this.resultsDiv.querySelector(`[data-idx="${this.fullscreenIdx}"]`);
                if (el) {
                    el.scrollIntoView({ behavior: 'auto', block: 'center' });
                }
            }
            this.fullscreenIdx = null;
        }
        if (this._fullscreenHandlers) {
            window.removeEventListener('keydown', this._fullscreenHandlers.keyHandler, true);
            document.removeEventListener('fullscreenchange', this._fullscreenHandlers.fsHandler);
        }
        this._photoViewer = null;
        this._fullscreenHandlers = null;
    }

    _showFullscreenLoadingSlide(direction = "down") {
        if (!this.fullscreenContainer) return;
        const mediaWrapper = this.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
        if (!mediaWrapper) return;

        if (this._fullscreenLoadingSlide) return;

        const oldSlide = mediaWrapper.querySelector('.fullscreen-slide');
        
        const loadingSlide = document.createElement('div');
        loadingSlide.className = 'fullscreen-slide fullscreen-loading-slide';
        loadingSlide.style.cssText = 'position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at center, #181924 0%, #0c0d12 100%); z-index: 50; transition: transform 0.6s cubic-bezier(.4,0,.2,1), opacity 0.6s cubic-bezier(.4,0,.2,1);';
        
        loadingSlide.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 30px; text-align: center;">
                <div style="width: 56px; height: 56px; border: 4px solid rgba(255,255,255,0.08); border-top-color: var(--accent, #ff3b6b); border-radius: 50%; animation: spin 1s linear infinite; box-shadow: 0 0 20px var(--accent-glow, rgba(255,59,107,0.3));"></div>
                <div style="color: #fff; font-size: 1.1rem; font-weight: 600; letter-spacing: 0.5px; font-family: inherit;">Идёт загрузка постов...</div>
                <div style="color: rgba(255,255,255,0.5); font-size: 0.85rem;">Пожалуйста, подождите</div>
            </div>
        `;

        mediaWrapper.appendChild(loadingSlide);
        this._fullscreenLoadingSlide = loadingSlide;

        let startTransform = 'translateY(100%)';
        let endOldTransform = 'translateY(-100%)';
        if (direction === 'up' || direction === 'prev') {
            startTransform = 'translateY(-100%)';
            endOldTransform = 'translateY(100%)';
        }

        if (!oldSlide) {
            loadingSlide.style.opacity = '0';
            loadingSlide.style.transform = 'scale(0.95)';
            loadingSlide.offsetHeight;
            requestAnimationFrame(() => {
                loadingSlide.style.opacity = '1';
                loadingSlide.style.transform = 'scale(1)';
            });
        } else {
            loadingSlide.style.opacity = '0';
            loadingSlide.style.transform = startTransform;
            loadingSlide.offsetHeight;

            requestAnimationFrame(() => {
                loadingSlide.style.opacity = '1';
                loadingSlide.style.transform = 'translateY(0)';
                
                oldSlide.style.opacity = '0';
                oldSlide.style.transform = endOldTransform;
                
                setTimeout(() => {
                    if (oldSlide && oldSlide.parentNode) {
                        oldSlide.parentNode.removeChild(oldSlide);
                    }
                }, 600);
            });
        }
    }

    _hideFullscreenLoadingSlide() {
        if (this._fullscreenLoadingSlide && this._fullscreenLoadingSlide.parentNode) {
            const slide = this._fullscreenLoadingSlide;
            slide.style.opacity = '0';
            slide.style.transform = 'scale(0.95)';
            setTimeout(() => {
                if (slide.parentNode) {
                    slide.parentNode.removeChild(slide);
                }
            }, 300);
        }
        this._fullscreenLoadingSlide = null;
    }

    _showFullscreenEndSlide(direction = "down") {
        if (!this.fullscreenContainer) return;
        const mediaWrapper = this.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
        if (!mediaWrapper) return;

        if (this._fullscreenEndSlide) return;

        const oldSlide = mediaWrapper.querySelector('.fullscreen-slide, .media-slide');
        
        const endSlide = document.createElement('div');
        endSlide.className = 'fullscreen-slide fullscreen-end-slide';
        endSlide.style.cssText = 'position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at center, #181924 0%, #0c0d12 100%); z-index: 50; transition: transform 0.6s cubic-bezier(.4,0,.2,1), opacity 0.6s cubic-bezier(.4,0,.2,1);';
        
        endSlide.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 30px; text-align: center;">
                <div style="width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; background: rgba(255, 59, 107, 0.1); border: 2px solid var(--accent, #ff3b6b); border-radius: 50%; box-shadow: 0 0 25px var(--accent-glow, rgba(255,59,107,0.4)); color: var(--accent, #ff3b6b);">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div style="color: #fff; font-size: 1.25rem; font-weight: 700; letter-spacing: 0.5px; font-family: inherit;">Вы дошли до конца</div>
                <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem; max-width: 280px; line-height: 1.4;">Больше постов по данному запросу не найдено</div>
            </div>
        `;

        mediaWrapper.appendChild(endSlide);
        this._fullscreenEndSlide = endSlide;

        let startTransform = 'translateY(100%)';
        let endOldTransform = 'translateY(-100%)';
        if (direction === 'up' || direction === 'prev') {
            startTransform = 'translateY(-100%)';
            endOldTransform = 'translateY(100%)';
        }

        if (!oldSlide) {
            endSlide.style.opacity = '0';
            endSlide.style.transform = 'scale(0.95)';
            endSlide.offsetHeight;
            requestAnimationFrame(() => {
                endSlide.style.opacity = '1';
                endSlide.style.transform = 'scale(1)';
            });
        } else {
            endSlide.style.opacity = '0';
            endSlide.style.transform = startTransform;
            endSlide.offsetHeight;

            requestAnimationFrame(() => {
                endSlide.style.opacity = '1';
                endSlide.style.transform = 'translateY(0)';
                
                oldSlide.style.opacity = '0';
                oldSlide.style.transform = endOldTransform;
                
                setTimeout(() => {
                    if (oldSlide && oldSlide.parentNode) {
                        oldSlide.parentNode.removeChild(oldSlide);
                    }
                }, 600);
            });
        }
    }

    _hideFullscreenEndSlide() {
        if (this._fullscreenEndSlide && this._fullscreenEndSlide.parentNode) {
            const slide = this._fullscreenEndSlide;
            slide.style.opacity = '0';
            slide.style.transform = 'scale(0.95)';
            setTimeout(() => {
                if (slide.parentNode) {
                    slide.parentNode.removeChild(slide);
                }
            }, 300);
        }
        this._fullscreenEndSlide = null;
    }

    _showFullscreenLoader() {
        if (!this.fullscreenContainer) return;
        let loader = this.fullscreenContainer.querySelector('.fullscreen-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'fullscreen-loader';
            loader.innerHTML = `
                <div class="r34-spinner" style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            `;
            loader.style.position = 'absolute';
            loader.style.top = '50%';
            loader.style.left = '50%';
            loader.style.transform = 'translate(-50%, -50%)';
            loader.style.zIndex = '1000';
            if (this.fullscreenContainer) this.fullscreenContainer.appendChild(loader);
        }
        loader.style.display = 'flex';
    }

    _hideFullscreenLoader() {
        if (!this.fullscreenContainer) return;
        const loader = this.fullscreenContainer.querySelector('.fullscreen-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    _fullscreenNext(direction = "down", force = false) {
        if (force) {
            this._fullscreenTransitioning = false;
        }
        if (this._fullscreenTransitioning) return;
        const postsList = this._activeFullscreenPosts || (this.isFavoritesActive ? this.favoritesPosts : this.currentPosts);
        if (this.fullscreenIdx === null || !postsList) return;
        
        const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
        const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
        let nextIdx = this.fullscreenIdx + 1;
        while (nextIdx < postsList.length) {
            const p = postsList[nextIdx];
            if (!this._isPostFiltered(p)) {
                if (minDuration > 0 && p.file_url) {
                    const isVideo = ['mp4', 'webm', 'mov'].includes((p.file_url.split('.').pop() || '').toLowerCase());
                    if (isVideo) {
                        const cachedD = parseFloat(localStorage.getItem(`r34_duration_${p.id}`));
                        if (!isNaN(cachedD) && cachedD > 0 && cachedD < minDuration) {
                            nextIdx++;
                            continue;
                        }
                    }
                }
                break;
            }
            nextIdx++;
        }

        // Proactively fetch more posts if we are nearing the end of cached results
        if (this.onLoadMore && !window.reachedEnd && (postsList.length - nextIdx < 8)) {
            this.onLoadMore();
        }

        if (nextIdx >= postsList.length) {
            if (window.reachedEnd) {
                this._showFullscreenEndSlide(direction);
            } else if (this.onLoadMore) {
                this._showFullscreenLoadingSlide(direction);
                this._pendingFullscreenNext = true;
                this.onLoadMore();
            } else {
                this._showFullscreenEndSlide(direction);
            }
            return;
        }
        
        const oldPost = postsList[this.fullscreenIdx];
        if (oldPost && ['mp4', 'webm', 'mov'].includes((oldPost.file_url?.split('.').pop() || '').toLowerCase())) {
            const video = this.fullscreenContainer.querySelector('video');
            if (video) {
                this._saveVideoPosition(oldPost.id, video.currentTime);
            }
            this._scheduleSavedVideoPositionExpiry(oldPost.id);
        }
        this._fullscreenTransitioning = true;
        if (this._photoViewer) {
            this._photoViewer.stop();
        }
        this.fullscreenIdx = nextIdx;
        this._renderFullscreenMedia(direction);
        this._showVideoControls();
    }

    _fullscreenPrev(direction = "up", force = false) {
        if (force) {
            this._fullscreenTransitioning = false;
        }
        if (this._fullscreenTransitioning) return;
        if (this.fullscreenIdx === null) return;
        
        const postsList = this._activeFullscreenPosts || (this.isFavoritesActive ? this.favoritesPosts : this.currentPosts);
        
        const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
        const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
        let prevIdx = this.fullscreenIdx - 1;
        while (prevIdx >= 0) {
            const p = postsList[prevIdx];
            if (!this._isPostFiltered(p)) {
                if (minDuration > 0 && p.file_url) {
                    const isVideo = ['mp4', 'webm', 'mov'].includes((p.file_url.split('.').pop() || '').toLowerCase());
                    if (isVideo) {
                        const cachedD = parseFloat(localStorage.getItem(`r34_duration_${p.id}`));
                        if (!isNaN(cachedD) && cachedD > 0 && cachedD < minDuration) {
                            prevIdx--;
                            continue;
                        }
                    }
                }
                break;
            }
            prevIdx--;
        }
        if (prevIdx < 0) return;
        
        const oldPost = postsList[this.fullscreenIdx];
        if (oldPost && ['mp4', 'webm', 'mov'].includes((oldPost.file_url?.split('.').pop() || '').toLowerCase())) {
            const video = this.fullscreenContainer.querySelector('video');
            if (video) {
                this._saveVideoPosition(oldPost.id, video.currentTime);
            }
            this._scheduleSavedVideoPositionExpiry(oldPost.id);
        }
        this._fullscreenTransitioning = true;
        if (this._photoViewer) {
            this._photoViewer.stop();
        }
        this.fullscreenIdx = prevIdx;
        this._renderFullscreenMedia(direction);
        this._showVideoControls();
    }

    _showVideoControls() {
        if (!this.fullscreenContainer) return;
        const mediaWrapper = this.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
        const controlsWrapper = mediaWrapper?.querySelector('.gallery-video-controls-wrapper');
        if (controlsWrapper?.firstChild?._showControls) {
            controlsWrapper.firstChild._showControls();
        }
    }
}