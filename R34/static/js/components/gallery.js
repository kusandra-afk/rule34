import { formatCount, escapeHtml } from '../utils.js';
import { VideoPlayer } from './videoPlayer.js';
import { PhotoViewer } from './photoViewer.js';
import { proxyUrl } from '../api.js';
import { icon } from '../icons.js';
import { StorageManager } from '../storage.js';
import { CardComponent } from './cardComponent.js';
import { FullscreenViewer } from './fullscreenViewer.js';
import { FavoritesManager } from './favoritesManager.js';

export class Gallery {
    constructor({ resultsDiv, loader, r34ResultsCount }) {
        this.resultsDiv = resultsDiv;
        this.loader = loader;
        this.r34ResultsCount = r34ResultsCount;
        this.currentPosts = [];
        this.onMediaClick = null;
        this.onTagClick = null;
        this.observer = null;
        this._virtualObserver = null;
        this.openedInfoIndex = null;

        this.fullscreenIdx = null;
        this.fullscreenContainer = null;
        this.fullscreenViewer = new FullscreenViewer(this);
        this._fullscreenHandlers = {};
        this._photoViewer = null;
        this._autoSlidePausedByUser = false;
        this.realCount = undefined;
        this._playingGridVideos = new Set();
        this._savedVideoPositions = {};
        this._playbackObserver = null;
        this.favoritesPosts = [];
        this.favoritesPage = 0;
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
            this._resizeRaf = requestAnimationFrame(() => {
                // Высоты заглушек посчитаны под старую ширину окна/раскладку —
                // при ресайзе они больше не гарантированно верны, поэтому
                // сначала возвращаем все заглушки в настоящие карточки.
                this.hydrateAllPlaceholders();
                this.applyColumnsStyle();
            });
        });

        if (this.resultsDiv) {
            this.resultsDiv.innerHTML = `
                <div class="gallery-welcome-message">
                    Нажмите на поиск ${icon('search', { size: 22, className: 'inline-icon' })} для загрузки медиа
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
        return FavoritesManager.syncFavorites(this);
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
        return FavoritesManager.getDisplayedFavoritesColumns(this);
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

        // Заглушки посчитаны под старое число колонок — высота карточки при
        // смене раскладки может измениться, поэтому сначала разворачиваем
        // все заглушки обратно в настоящие карточки.
        this.hydrateAllPlaceholders();

        this.applyColumnsStyle();

        const cards = this.resultsDiv.querySelectorAll('.media-container');
        cards.forEach(card => {
            const idx = parseInt(card.dataset.idx, 10);
            const post = this.currentPosts[idx];
            if (!post) return;

            let aspectRatio = (post.width && post.height) ? (post.width / post.height) : (4 / 3);
            if (aspectRatio < 0.5) aspectRatio = 0.5;
            if (aspectRatio > 2.2) aspectRatio = 2.2;
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

    showFavoritesView(resetPage = false) {
        return FavoritesManager.showFavoritesView(this, resetPage);
    }

    showGalleryView() {
        return FavoritesManager.showGalleryView(this);
    }

    async renderProfileFavorites(resetPage = false) {
        return FavoritesManager.renderProfileFavorites(this, resetPage);
    }

    appendResults(posts, realCount) {
        if (!Array.isArray(posts) || posts.length === 0) {
            if (this._pendingFullscreenNext) {
                this._pendingFullscreenNext = false;
                this._fullscreenLoadingSlide = null;
                this._showFullscreenEndSlide('down');
            }
            return;
        }
        const oldCurrentPosts = this.currentPosts;
        const oldLength = this.currentPosts.length;
        const uniqueNewPosts = posts.filter(p => p && !this.currentPosts.some(e => e.id === p.id));
        this.currentPosts = this.currentPosts.concat(uniqueNewPosts);
        if (this._activeFullscreenPosts === oldCurrentPosts) {
            this._activeFullscreenPosts = this.currentPosts;
        }
        this.realCount = realCount || this.currentPosts.length;
        this.updateCountDisplay();
        this.renderGallery(true, oldLength);

        if (this._pendingFullscreenNext) {
            this._pendingFullscreenNext = false;
            this._fullscreenLoadingSlide = null;
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
            if (this._virtualObserver) this._virtualObserver.disconnect();
            this._virtualObserver = null;
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

            // Виртуализация карточек, которые ушли далеко за пределы экрана
            // (см. handleVirtualIntersection / _virtualizeCard / _hydrateCard).
            // Отступ намного больше, чем у this.observer — карточка сначала
            // выгружает медиа (уже существующая логика), и только когда она
            // уедет ЕЩЁ дальше, целиком подменяется на лёгкую заглушку.
            this._virtualObserver = new window.IntersectionObserver(this.handleVirtualIntersection.bind(this), {
                root: null,
                rootMargin: '4000px 0px 4000px 0px',
                threshold: 0
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
            if (this._virtualObserver) {
                this._virtualObserver.observe(container);
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

    // ============================================================
    // ВИРТУАЛИЗАЦИЯ КАРТОЧЕК (только основная галерея, бесконечная прокрутка)
    // ------------------------------------------------------------
    // this.observer уже выгружает МЕДИА внутри карточки, когда она уходит
    // за экран (см. unloadMedia) — сама карточка (пустая рамка) остаётся
    // в DOM навсегда. За долгую сессию бесконечной прокрутки таких пустых
    // рамок накапливаются тысячи, и они всё равно стоят браузеру пересчёта
    // раскладки при каждом действии.
    //
    // Здесь тот же приём доводится до конца: когда карточка уезжает ЕЩЁ
    // дальше (this._virtualObserver, отступ куда больше, чем у this.observer),
    // она целиком заменяется на лёгкую заглушку — пустой div БЕЗ рамки, тени,
    // блюра и т.д., но с точно такой же высотой, какая была у карточки перед
    // подменой. Высота страницы не меняется ни на пиксель, поэтому скролл
    // не прыгает. Когда пользователь долистывает обратно, заглушка на лету
    // превращается обратно в настоящую карточку через тот же createCard,
    // которым карточки создаются при обычной загрузке.
    // ============================================================
    handleVirtualIntersection(entries) {
        // При быстрой прокрутке браузер может отдать сразу пачку карточек за
        // один вызов. Если для каждой чередовать "прочитать высоту" и "поменять
        // DOM" по очереди, браузер будет между ними заново пересчитывать всю
        // раскладку страницы (layout thrashing) — на пачке из десятка карточек
        // это уже заметная просадка. Поэтому сначала читаем ВСЕ высоты (пока
        // DOM ещё не тронут), и только потом одним проходом вносим изменения.
        const toVirtualize = [];
        const toHydrate = [];
        for (const entry of entries) {
            const el = entry.target;
            if (entry.isIntersecting) {
                if (el.classList.contains('media-placeholder-slot')) {
                    toHydrate.push(el);
                }
            } else if (el.classList.contains('media-container')) {
                toVirtualize.push(el);
            }
        }

        const measured = toVirtualize
            .filter(container => parseInt(container.dataset.idx, 10) !== this.openedInfoIndex)
            .map(container => ({ container, height: container.getBoundingClientRect().height }));

        measured.forEach(({ container, height }) => this._virtualizeCard(container, height));
        toHydrate.forEach(placeholder => this._hydrateCard(placeholder));
    }

    _virtualizeCard(container, precomputedHeight) {
        const idx = parseInt(container.dataset.idx, 10);
        // Не трогаем карточку, у которой сейчас открыта панель тегов/источника —
        // это единственная карточка, чьи соседние блоки реально на виду.
        if (idx === this.openedInfoIndex) return;

        const height = precomputedHeight != null ? precomputedHeight : container.getBoundingClientRect().height;

        if (container.dataset.loaded === '1') {
            this.unloadMedia(container);
        }
        if (this.observer) this.observer.unobserve(container);
        if (this._playbackObserver) this._playbackObserver.unobserve(container);
        if (this._virtualObserver) this._virtualObserver.unobserve(container);

        // Скрытые source/info-блоки карточки не занимают места в раскладке
        // (media-source-block и media-extra-info по умолчанию hidden) — их
        // можно просто выбросить, toggleExtraInfo пересоздаст их по клику,
        // как и для только что подгруженных карточек.
        if (container._sourceBlock) container._sourceBlock.remove();
        if (container.extraInfo) container.extraInfo.remove();

        const placeholder = document.createElement('div');
        placeholder.className = 'media-placeholder-slot';
        placeholder.dataset.idx = String(idx);
        placeholder.style.height = height + 'px';

        container.replaceWith(placeholder);
        if (this._virtualObserver) this._virtualObserver.observe(placeholder);
    }

    _hydrateCard(placeholder) {
        const idx = parseInt(placeholder.dataset.idx, 10);
        const post = this.currentPosts[idx];
        if (!post) return;

        const container = this.createCard(post, idx);
        placeholder.replaceWith(container);

        if (this._virtualObserver) {
            this._virtualObserver.unobserve(placeholder);
            this._virtualObserver.observe(container);
        }
        if (this.observer) this.observer.observe(container);
        if (this._playbackObserver) this._playbackObserver.observe(container);
    }

    // Высота заглушек считалась при текущей раскладке (ширине окна,
    // количестве колонок). При ресайзе эти цифры больше не гарантированно
    // верны — вместо того чтобы гадать новую высоту, просто возвращаем все
    // заглушки в настоящие карточки, они пересчитаются по новой раскладке
    // сами, как и остальные карточки на странице.
    hydrateAllPlaceholders() {
        if (!this.resultsDiv) return;
        const placeholders = this.resultsDiv.querySelectorAll('.media-placeholder-slot');
        placeholders.forEach(el => this._hydrateCard(el));
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
            // Explicitly tear down the VideoPlayer instance (timers, listeners,
            // its entry in window.activeVideoPlayers) instead of leaving it to be
            // cleaned up "by accident" on some later scroll event. Without this,
            // every video card that has ever scrolled off-screen leaves its
            // VideoPlayer instance (and everything it closed over) alive in
            // window.activeVideoPlayers for the rest of the session.
            if (video._videoPlayerInstance && typeof video._videoPlayerInstance._destroy === 'function') {
                try {
                    video._videoPlayerInstance._destroy();
                } catch (e) {
                    console.log('Error destroying VideoPlayer instance:', e);
                }
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

        // Drop this card's backdrop-filter (blur) compositing layers while its
        // media is unloaded — see .media-unloaded in gallery.css. With the media
        // gone there's nothing left to blur, so keeping full-strength GPU blur
        // layers alive for every card that's ever scrolled past adds up to a
        // real, permanent memory/GPU cost over a long infinite-scroll session.
        container.classList.add('media-unloaded');
    }

    renderFavoritesPagination(totalCount, limit) {
        return FavoritesManager.renderFavoritesPagination(this, totalCount, limit);
    }

    createCard(post, index) {
        return CardComponent.createCard(post, index, this);
    }

    createSourceBlock(post) {
        return CardComponent.createSourceBlock(post);
    }

    parseRule34Date(raw) {
        return CardComponent.parseRule34Date(raw);
    }

    estimateDateFromId(id) {
        return CardComponent.estimateDateFromId(id);
    }

    createExtraInfo(post, index) {
        return CardComponent.createExtraInfo(post, index, this);
    }

    async categorizeTagsForCard(infoEl, index) {
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
        CardComponent.recategorizeTags(infoEl, typesMap);
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

    // Плавно скрывает блок тегов/источника: схлопывает его реальную высоту
    // (а не только opacity), чтобы карточки снизу подтягивались вверх
    // синхронно с анимацией, а не прыгали на место только в конце.
    _animateHideInfoBlock(el) {
        if (!el || el.hidden) return;
        if (el._closeTimer) {
            clearTimeout(el._closeTimer);
            el._closeTimer = null;
        }
        const startHeight = el.offsetHeight;
        el.style.height = startHeight + 'px';
        el.style.overflow = 'hidden';
        el.classList.add('is-closing');
        void el.offsetHeight; // форсируем reflow, чтобы стартовая высота зафиксировалась до перехода
        el.style.height = '0px';
        el.style.marginTop = '0px';
        el.style.marginBottom = '0px';
        el.style.paddingTop = '0px';
        el.style.paddingBottom = '0px';
        el.style.opacity = '0';
        const finish = () => {
            el.hidden = true;
            el.classList.remove('is-closing');
            el.style.height = '';
            el.style.overflow = '';
            el.style.marginTop = '';
            el.style.marginBottom = '';
            el.style.paddingTop = '';
            el.style.paddingBottom = '';
            el.style.opacity = '';
            el._closeTimer = null;
        };
        el.addEventListener('transitionend', (e) => {
            if (e.target === el && e.propertyName === 'height') finish();
        }, { once: true });
        el._closeTimer = setTimeout(finish, 400);
    }

    // Отменяет анимацию скрытия (если блок открывают заново, пока он ещё закрывается)
    _cancelHideInfoBlock(el) {
        if (!el) return;
        if (el._closeTimer) {
            clearTimeout(el._closeTimer);
            el._closeTimer = null;
        }
        el.classList.remove('is-closing');
        el.style.height = '';
        el.style.overflow = '';
        el.style.marginTop = '';
        el.style.marginBottom = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        el.style.opacity = '';
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
                if (el !== targetInfo) this._animateHideInfoBlock(el);
            });
            parentGrid.querySelectorAll('.media-source-block').forEach(el => {
                if (!targetContainer || el !== targetSourceBlock) this._animateHideInfoBlock(el);
            });
        }

        if (this.openedInfoIndex === index) {
            if (targetInfo) this._animateHideInfoBlock(targetInfo);
            if (targetSourceBlock) this._animateHideInfoBlock(targetSourceBlock);
            this.openedInfoIndex = null;
        } else {
            if (targetContainer && parentGrid) {
                // Заглушки виртуализации (.media-placeholder-slot) занимают такую же
                // одну ячейку сетки, как обычная карточка — их обязательно нужно
                // учитывать здесь, иначе при пропуске заглушек в массиве образуются
                // "дыры", и расчёт конца строки (по номеру позиции) съезжает.
                const cards = Array.from(parentGrid.querySelectorAll('.media-container, .media-placeholder-slot'));
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

            if (targetInfo) {
                this._cancelHideInfoBlock(targetInfo);
                targetInfo.hidden = false;
            }
            if (targetSourceBlock) {
                this._cancelHideInfoBlock(targetSourceBlock);
                targetSourceBlock.hidden = false;
            }
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

        // Restore the card's normal blur/compositing now that it's getting real
        // media again (see .media-unloaded in gallery.css / unloadMedia above).
        container.classList.remove('media-unloaded');

        const existingMedia = container.querySelectorAll('.media-content, .center-play-btn, .gif-label, .gallery-video-controls-wrapper, video');
        existingMedia.forEach(el => {
            // Defensively destroy any VideoPlayer instance still attached to a
            // leftover <video> here too, in case this container is reloaded
            // without having gone through unloadMedia first.
            if (el.tagName === 'VIDEO' && el._videoPlayerInstance && typeof el._videoPlayerInstance._destroy === 'function') {
                try {
                    el._videoPlayerInstance._destroy();
                } catch (e) {
                    console.log('Error destroying VideoPlayer instance:', e);
                }
            }
            el.remove();
        });

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
                        container._soundToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
                        container._soundToggleBtn.title = 'Включить звук';
                        if (container._soundVolumeSlider) {
                            container._soundVolumeSlider.value = 0;
                        }
                    } else {
                        container._soundToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
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
        this.fullscreenViewer.openFullscreen(index, customPostsList);
    }

    _renderFullscreenMedia(direction = 'down') {
        this.fullscreenViewer._renderFullscreenMedia(direction);
    }

    _updateFullscreenInfoDrawer(post) {
        this.fullscreenViewer._updateFullscreenInfoDrawer(post);
    }

    _toggleFullscreenInfoDrawer() {
        this.fullscreenViewer._toggleFullscreenInfoDrawer();
    }

    _openFullscreenInfoDrawer() {
        this.fullscreenViewer._openFullscreenInfoDrawer();
    }

    _closeFullscreenInfoDrawer() {
        this.fullscreenViewer._closeFullscreenInfoDrawer();
    }

    _stopPhotoTimer() {
        this.fullscreenViewer._stopPhotoTimer();
    }

    _createDragPreviewSlide(post, position = 'next') {
        return this.fullscreenViewer._createDragPreviewSlide(post, position);
    }

    _bindFullscreenHandlers() {
        this.fullscreenViewer._bindFullscreenHandlers();
    }

    _exitFullscreen() {
        this.fullscreenViewer._exitFullscreen();
    }

    _cleanupFullscreen() {
        this.fullscreenViewer._cleanupFullscreen();
    }

    _showFullscreenLoadingSlide(direction = "down") {
        this.fullscreenViewer._showFullscreenLoadingSlide(direction);
    }

    _hideFullscreenLoadingSlide() {
        this.fullscreenViewer._hideFullscreenLoadingSlide();
    }

    _showFullscreenEndSlide(direction = "down") {
        this.fullscreenViewer._showFullscreenEndSlide(direction);
    }

    _hideFullscreenEndSlide() {
        this.fullscreenViewer._hideFullscreenEndSlide();
    }

    _showFullscreenLoader() {
        this.fullscreenViewer._showFullscreenLoader();
    }

    _hideFullscreenLoader() {
        this.fullscreenViewer._hideFullscreenLoader();
    }

    _fullscreenNext(direction = "down", force = false) {
        this.fullscreenViewer._fullscreenNext(direction, force);
    }

    _fullscreenPrev(direction = "up", force = false) {
        this.fullscreenViewer._fullscreenPrev(direction, force);
    }

    _showVideoControls() {
        this.fullscreenViewer._showVideoControls();
    }
}
