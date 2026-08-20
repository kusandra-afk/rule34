import { escapeHtml } from '../utils.js';
import { PhotoViewer } from './photoViewer.js';
import { VideoPlayer } from './videoPlayer.js';

export class FullscreenViewer {
    constructor(gallery) {
        this.gallery = gallery;
    }

    openFullscreen(index, customPostsList) {
        const g = this.gallery;
        g._activeFullscreenPosts = customPostsList || (g.isFavoritesActive ? g.favoritesPosts : g.currentPosts);
        const post = g._activeFullscreenPosts ? g._activeFullscreenPosts[index] : null;
        if (!post) return;

        g._fullscreenTransitioning = false;
        g._autoSlidePausedByUser = false;

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

        const infoBtn = document.createElement('button');
        infoBtn.className = 'fullscreen-info-toggle-btn';
        infoBtn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        infoBtn.title = 'Теги и источник (Свайп влево)';
        infoBtn.onclick = (e) => {
            e.stopPropagation();
            this._toggleFullscreenInfoDrawer();
        };
        fsContainer.appendChild(infoBtn);

        const backdrop = document.createElement('div');
        backdrop.className = 'fullscreen-info-backdrop';
        backdrop.onclick = (e) => {
            e.stopPropagation();
            this._closeFullscreenInfoDrawer();
        };
        fsContainer.appendChild(backdrop);

        const drawer = document.createElement('div');
        drawer.className = 'fullscreen-info-drawer';
        drawer.innerHTML = `
            <div class="fullscreen-info-header">
                <div class="fullscreen-info-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    Информация о медиа
                </div>
                <button class="fullscreen-info-close" title="Закрыть панель">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div class="fullscreen-info-body"></div>
        `;
        const drawerCloseBtn = drawer.querySelector('.fullscreen-info-close');
        if (drawerCloseBtn) {
            drawerCloseBtn.onclick = (e) => {
                e.stopPropagation();
                this._closeFullscreenInfoDrawer();
            };
        }
        fsContainer.appendChild(drawer);

        const mediaWrapper = document.createElement('div');
        mediaWrapper.className = 'fullscreen-media-wrapper';
        fsContainer.appendChild(mediaWrapper);

        document.body.appendChild(fsContainer);

        g._pauseAllGridVideos();

        g.fullscreenIdx = index;
        g.fullscreenContainer = fsContainer;

        if (fsContainer.requestFullscreen) fsContainer.requestFullscreen().catch(() => {});
        else if (fsContainer.webkitRequestFullscreen) fsContainer.webkitRequestFullscreen();
        else if (fsContainer.msRequestFullscreen) fsContainer.msRequestFullscreen();

        this._renderFullscreenMedia();

        this._bindFullscreenHandlers();
    }

    _renderFullscreenMedia(direction = 'down') {
        const g = this.gallery;
        if (!g.fullscreenContainer) return;
        const mediaWrapper = g.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
        if (!mediaWrapper) return;

        // Слайд, который сейчас показан (обычный пост либо экран загрузки/
        // конца ленты) — раньше он никогда не убирался при появлении нового,
        // из-за чего слайды копились друг на друге (визуально — "накладываются"),
        // а входная анимация не проигрывалась вовсе. Ловим ссылку сейчас,
        // до того как в DOM появится новый слайд.
        const oldSlide = mediaWrapper.querySelector('.fullscreen-slide, .media-slide');

        if (g._fullscreenLoadingSlide) {
            g._fullscreenLoadingSlide = null;
        }
        if (g._fullscreenEndSlide) {
            g._fullscreenEndSlide = null;
        }

        const idx = g.fullscreenIdx;
        const postsList = g._activeFullscreenPosts || (g.isFavoritesActive ? g.favoritesPosts : g.currentPosts);
        const post = postsList ? postsList[idx] : null;
        if (!post) return;

        g._preloadAdjacent(idx);

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
            this._stopPhotoTimer();
            
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
            
            const savedPosition = g._getSavedVideoPosition(post);
            if (savedPosition > 0) {
                video.addEventListener('loadedmetadata', () => {
                    if (!isNaN(video.duration) && video.duration > 0 && savedPosition < video.duration - 0.25) {
                        video.currentTime = Math.min(savedPosition, video.duration - 0.1);
                    }
                }, { once: true });
            }

            const defaultVolume = localStorage.getItem('r34_default_volume');
            const volumeVal = defaultVolume !== null ? parseFloat(defaultVolume) / 100 : 0.50;
            video.volume = volumeVal;
            
            video.muted = false;
            const autoVideoSlide = localStorage.getItem('r34_auto_video_slide') !== 'false';
            const loopEnabled = localStorage.getItem('r34_video_loop') !== 'false';
            video.loop = autoVideoSlide ? false : loopEnabled;
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

            const isCustomControlsDisabled = localStorage.getItem('r34_custom_video_controls') === 'false';
            if (isCustomControlsDisabled) {
                video.controls = true;
            }

            video.onloadeddata = () => {
                if (minDuration > 0 && !isNaN(video.duration) && video.duration < minDuration) {
                    this._fullscreenNext(direction);
                    return;
                }
                this._hideFullscreenLoader();
                video.style.opacity = '1';
                if (!video.dataset.manuallyPaused) {
                    video.play().catch(() => {});
                }
            };

            video.onended = () => {
                if (autoVideoSlide && !g._autoSlidePausedByUser) {
                    this._fullscreenNext("down");
                }
            };

            // Раньше здесь вызывался window.initCustomVideoControls — такой
            // функции нигде в проекте не существует (нет ни одного места,
            // где она хоть раз присваивается), поэтому пульт управления для
            // видео в полноэкранном режиме не создавался вообще никогда.
            // Правильный способ — тот же класс VideoPlayer, что создаёт
            // пульт для видео в сетке галереи, просто с fullscreenMode: true.
            if (!isCustomControlsDisabled) {
                // Без onToggleInfo: в VideoPlayer любой клик мимо маленькой
                // центральной play/pause-зоны вызывает onToggleInfo (для
                // карточки в сетке это открывает теги под ней — уместно).
                // В полноэкранном режиме для тегов уже есть отдельная кнопка
                // и жест свайпа, так что тот же колбэк здесь просто открывал
                // панель тегов при обычном тапе/клике почти в любом месте
                // видео — баг, который поймал пользователь.
                new VideoPlayer(video, newSlide, {
                    showFullscreenBtn: false,
                    fullscreenMode: true,
                    post: post
                });
            }
        } else {
            // --- IMAGE ---
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
            photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`;

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
                const closeBtn = g.fullscreenContainer ? g.fullscreenContainer.querySelector('.fullscreen-close-btn') : null;
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

            if (g._photoViewer) g._photoViewer.stop();
            g._photoViewer = new PhotoViewer(progress, timerLabel);
            
            const autoSlideEnabled = localStorage.getItem('r34_auto_slide') !== 'false';
            const autoSlideInterval = parseInt(localStorage.getItem('r34_auto_slide_interval'), 10) || 5;
            
            if (autoSlideEnabled) {
                g._photoViewer.start(autoSlideInterval, () => this._fullscreenNext("down"));
            }
        }

        // Направление входа — та же логика, что уже используется в
        // _showFullscreenLoadingSlide/_showFullscreenEndSlide: новый слайд
        // въезжает с той стороны, откуда пролистали, старый уезжает в
        // противоположную. Если старого слайда нет (первое открытие) —
        // мягкое масштабирование+фейд вместо "въезда".
        if (oldSlide) {
            // Останавливаем видео старого слайда СРАЗУ, а не только когда он
            // физически удалится через 500мс — иначе на быстром листании
            // звук старого видео продолжает идти поверх нового, пока картинка
            // ещё не догрузилась (та самая "звук играет, картинка стоит").
            const oldVideos = oldSlide.querySelectorAll('video');
            oldVideos.forEach(v => {
                try {
                    v.pause();
                    v.src = '';
                    v.load();
                } catch (e) {
                    console.log('Error stopping old fullscreen video before transition:', e);
                }
            });

            let startTransform = 'translateY(100%)';
            let endOldTransform = 'translateY(-100%)';
            if (direction === 'up' || direction === 'prev') {
                startTransform = 'translateY(-100%)';
                endOldTransform = 'translateY(100%)';
            }
            newSlide.style.opacity = '0';
            newSlide.style.transform = startTransform;

            mediaWrapper.appendChild(newSlide);
            newSlide.offsetHeight; // форсируем reflow — иначе переход не проиграется

            requestAnimationFrame(() => {
                newSlide.style.opacity = '1';
                newSlide.style.transform = 'translateY(0)';
                oldSlide.style.opacity = '0';
                oldSlide.style.transform = endOldTransform;
            });

            setTimeout(() => {
                if (oldSlide.parentNode) oldSlide.parentNode.removeChild(oldSlide);
                g._fullscreenTransitioning = false;
            }, 500);
        } else {
            newSlide.style.opacity = '0';
            newSlide.style.transform = 'scale(0.95)';

            mediaWrapper.appendChild(newSlide);
            newSlide.offsetHeight;

            requestAnimationFrame(() => {
                newSlide.style.opacity = '1';
                newSlide.style.transform = 'scale(1)';
            });

            setTimeout(() => { g._fullscreenTransitioning = false; }, 500);
        }

        this._updateFullscreenInfoDrawer(post);
    }

    _updateFullscreenInfoDrawer(post) {
        const g = this.gallery;
        if (!g.fullscreenContainer || !post) return;
        const drawerBody = g.fullscreenContainer.querySelector('.fullscreen-info-body');
        if (!drawerBody) return;

        drawerBody.innerHTML = '';

        const extraInfo = g.createExtraInfo(post, g.fullscreenIdx);
        extraInfo.hidden = false;
        drawerBody.appendChild(extraInfo);

        if (extraInfo.dataset.categorized !== "1") {
            g.categorizeTagsForCard(extraInfo, g.fullscreenIdx).catch(() => {});
        }

        const sourceBlock = g.createSourceBlock(post);
        sourceBlock.hidden = false;
        drawerBody.appendChild(sourceBlock);
    }

    _toggleFullscreenInfoDrawer() {
        const g = this.gallery;
        if (!g.fullscreenContainer) return;
        const drawer = g.fullscreenContainer.querySelector('.fullscreen-info-drawer');
        if (!drawer) return;
        const isOpen = drawer.classList.contains('open');
        if (isOpen) {
            this._closeFullscreenInfoDrawer();
        } else {
            this._openFullscreenInfoDrawer();
        }
    }

    _openFullscreenInfoDrawer() {
        const g = this.gallery;
        if (!g.fullscreenContainer) return;
        const drawer = g.fullscreenContainer.querySelector('.fullscreen-info-drawer');
        const backdrop = g.fullscreenContainer.querySelector('.fullscreen-info-backdrop');
        const infoBtn = g.fullscreenContainer.querySelector('.fullscreen-info-toggle-btn');
        if (!drawer) return;

        drawer.classList.add('open');
        drawer.style.transition = 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)';
        drawer.style.transform = 'translate3d(0, 0, 0)';

        if (backdrop) {
            backdrop.classList.add('visible');
            backdrop.style.opacity = '';
            backdrop.style.pointerEvents = '';
        }
        if (infoBtn) {
            infoBtn.classList.add('active');
        }
    }

    _closeFullscreenInfoDrawer() {
        const g = this.gallery;
        if (!g.fullscreenContainer) return;
        const drawer = g.fullscreenContainer.querySelector('.fullscreen-info-drawer');
        const backdrop = g.fullscreenContainer.querySelector('.fullscreen-info-backdrop');
        const infoBtn = g.fullscreenContainer.querySelector('.fullscreen-info-toggle-btn');
        if (!drawer) return;

        drawer.classList.remove('open');
        drawer.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
        drawer.style.transform = 'translate3d(100%, 0, 0)';

        if (backdrop) {
            backdrop.classList.remove('visible');
            backdrop.style.opacity = '';
            backdrop.style.pointerEvents = '';
        }
        if (infoBtn) {
            infoBtn.classList.remove('active');
        }
    }

    _stopPhotoTimer() {
        const g = this.gallery;
        if (g._photoViewer) g._photoViewer.stop();
        g._photoViewer = null;
    }

    _createDragPreviewSlide(post, position = 'next') {
        if (!post) return null;
        const slide = document.createElement('div');
        slide.className = `media-slide drag-preview-slide drag-preview-${position}`;
        slide.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: none;
            z-index: 1;
            pointer-events: none;
            will-change: transform, opacity;
        `;

        const isVideo = ['mp4','webm','mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
        const previewUrl = post.preview_url || post.sample_url || post.file_url;

        const img = document.createElement('img');
        img.className = 'media-content';
        img.src = previewUrl;
        img.style.cssText = `
            width: 100vw;
            height: 100vh;
            max-width: 100vw;
            max-height: 100vh;
            object-fit: contain;
            display: block;
            margin: 0 auto;
        `;
        slide.appendChild(img);

        if (isVideo) {
            const playBadge = document.createElement('div');
            playBadge.style.cssText = `
                position: absolute;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
            `;
            playBadge.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
            slide.appendChild(playBadge);
        }

        return slide;
    }

    _bindFullscreenHandlers() {
        const g = this.gallery;
        let touchStartY = null;
        let touchStartX = null;
        let currentDragY = 0;
        let currentDragX = 0;
        let isDragging = false;
        let isHorizontalDrag = false;
        let isDrawerOpenAtStart = false;
        let drawerEl = null;
        let backdropEl = null;
        let drawerWidth = 400;
        let activeSlideEl = null;
        let previewNextSlide = null;
        let previewPrevSlide = null;

        const getActiveSlide = () => {
            if (!g.fullscreenContainer) return null;
            const mediaWrapper = g.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
            if (!mediaWrapper) return null;
            return mediaWrapper.querySelector('.media-slide:not(.drag-preview-slide), .fullscreen-slide:not(.drag-preview-slide)');
        };

        const cleanupDragPreviews = () => {
            if (previewNextSlide && previewNextSlide.parentNode) {
                previewNextSlide.parentNode.removeChild(previewNextSlide);
            }
            if (previewPrevSlide && previewPrevSlide.parentNode) {
                previewPrevSlide.parentNode.removeChild(previewPrevSlide);
            }
            previewNextSlide = null;
            previewPrevSlide = null;
        };

        const touchStart = (e) => {
            if (g._fullscreenTransitioning) return;
            if (e.touches && e.touches[0]) {
                if (e.target.closest('input[type="range"]') || e.target.closest('.fullscreen-close-btn') || e.target.closest('.fullscreen-info-toggle-btn') || e.target.closest('.fullscreen-info-close') || e.target.closest('.video-bottom-volume') || e.target.closest('.video-speed-menu-btn')) {
                    return;
                }

                touchStartY = e.touches[0].clientY;
                touchStartX = e.touches[0].clientX;
                currentDragY = 0;
                currentDragX = 0;
                isDragging = false;
                isHorizontalDrag = false;
                activeSlideEl = getActiveSlide();
                cleanupDragPreviews();

                drawerEl = g.fullscreenContainer ? g.fullscreenContainer.querySelector('.fullscreen-info-drawer') : null;
                backdropEl = g.fullscreenContainer ? g.fullscreenContainer.querySelector('.fullscreen-info-backdrop') : null;
                isDrawerOpenAtStart = drawerEl ? drawerEl.classList.contains('open') : false;
                drawerWidth = drawerEl ? (drawerEl.offsetWidth || 380) : 380;
            }
        };

        const touchMove = (e) => {
            if (touchStartY === null || g._fullscreenTransitioning) return;
            if (!e.touches || !e.touches[0]) return;

            const touchY = e.touches[0].clientY;
            const touchX = e.touches[0].clientX;
            const diffY = touchY - touchStartY;
            const diffX = touchX - touchStartX;

            const isInsideDrawer = Boolean(e.target.closest('.fullscreen-info-drawer'));

            if (!isDragging && !isHorizontalDrag) {
                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
                    if ((!isDrawerOpenAtStart && diffX < 0) || (isDrawerOpenAtStart && diffX > 0)) {
                        isHorizontalDrag = true;
                    }
                }
            }

            if (isHorizontalDrag && drawerEl) {
                currentDragX = diffX;
                if (e.cancelable) {
                    e.preventDefault();
                }

                drawerEl.style.transition = 'none';
                if (backdropEl) backdropEl.style.transition = 'none';

                if (!isDrawerOpenAtStart) {
                    const clampedPull = Math.max(0, Math.min(drawerWidth, -diffX));
                    const translateX = drawerWidth - clampedPull;
                    const progress = clampedPull / drawerWidth;

                    drawerEl.style.transform = `translate3d(${translateX}px, 0, 0)`;
                    if (backdropEl) {
                        backdropEl.style.opacity = `${progress}`;
                        backdropEl.style.pointerEvents = progress > 0.1 ? 'auto' : 'none';
                    }
                } else {
                    const clampedPush = Math.min(drawerWidth, Math.max(0, diffX));
                    const progress = 1 - (clampedPush / drawerWidth);

                    drawerEl.style.transform = `translate3d(${clampedPush}px, 0, 0)`;
                    if (backdropEl) {
                        backdropEl.style.opacity = `${Math.max(0, progress)}`;
                    }
                }
                return;
            }

            if (isDrawerOpenAtStart && isInsideDrawer) {
                return;
            }

            if (!isHorizontalDrag && (Math.abs(diffY) > 6 || isDragging)) {
                isDragging = true;
                currentDragY = diffY;
                if (e.cancelable) {
                    e.preventDefault();
                }

                const screenHeight = window.innerHeight || 800;
                const mediaWrapper = g.fullscreenContainer ? g.fullscreenContainer.querySelector('.fullscreen-media-wrapper') : null;
                const postsList = g._activeFullscreenPosts || (g.isFavoritesActive ? g.favoritesPosts : g.currentPosts);

                if (mediaWrapper && postsList && !previewNextSlide && !previewPrevSlide) {
                    let nextIdx = g.fullscreenIdx + 1;
                    while (nextIdx < postsList.length && g._isPostFiltered(postsList[nextIdx])) {
                        nextIdx++;
                    }
                    if (nextIdx < postsList.length) {
                        previewNextSlide = this._createDragPreviewSlide(postsList[nextIdx], 'next');
                        if (previewNextSlide) {
                            previewNextSlide.style.transform = `translate3d(0, ${screenHeight}px, 0)`;
                            mediaWrapper.appendChild(previewNextSlide);
                        }
                    }

                    let prevIdx = g.fullscreenIdx - 1;
                    while (prevIdx >= 0 && g._isPostFiltered(postsList[prevIdx])) {
                        prevIdx--;
                    }
                    if (prevIdx >= 0) {
                        previewPrevSlide = this._createDragPreviewSlide(postsList[prevIdx], 'prev');
                        if (previewPrevSlide) {
                            previewPrevSlide.style.transform = `translate3d(0, ${-screenHeight}px, 0)`;
                            mediaWrapper.appendChild(previewPrevSlide);
                        }
                    }
                }

                if (activeSlideEl) {
                    activeSlideEl.style.transition = 'none';
                    let translateY = diffY;
                    const isAtTop = g.fullscreenIdx <= 0;
                    const isAtBottom = postsList && g.fullscreenIdx >= postsList.length - 1 && window.reachedEnd;
                    if ((isAtTop && diffY > 0) || (isAtBottom && diffY < 0)) {
                        translateY = diffY * 0.35;
                    }
                    
                    const dragProgress = Math.min(Math.abs(translateY) / screenHeight, 0.6);
                    const scale = 1 - dragProgress * 0.08;
                    const opacity = 1 - dragProgress * 0.2;

                    activeSlideEl.style.transform = `translate3d(0, ${translateY}px, 0) scale(${scale})`;
                    activeSlideEl.style.opacity = `${opacity}`;

                    if (previewNextSlide) {
                        previewNextSlide.style.transition = 'none';
                        const nextY = screenHeight + translateY;
                        const nextProgress = Math.max(0, -translateY / screenHeight);
                        const nextScale = 0.92 + nextProgress * 0.08;
                        const nextOpacity = 0.4 + nextProgress * 0.6;
                        previewNextSlide.style.transform = `translate3d(0, ${nextY}px, 0) scale(${Math.min(1, nextScale)})`;
                        previewNextSlide.style.opacity = `${Math.min(1, nextOpacity)}`;
                    }

                    if (previewPrevSlide) {
                        previewPrevSlide.style.transition = 'none';
                        const prevY = -screenHeight + translateY;
                        const prevProgress = Math.max(0, translateY / screenHeight);
                        const prevScale = 0.92 + prevProgress * 0.08;
                        const prevOpacity = 0.4 + prevProgress * 0.6;
                        previewPrevSlide.style.transform = `translate3d(0, ${prevY}px, 0) scale(${Math.min(1, prevScale)})`;
                        previewPrevSlide.style.opacity = `${Math.min(1, prevOpacity)}`;
                    }
                }
            }
        };

        const touchEnd = () => {
            if (touchStartY === null) return;

            if (isHorizontalDrag && drawerEl) {
                const diffX = currentDragX;
                const threshold = Math.min(60, drawerWidth * 0.2);

                if (!isDrawerOpenAtStart) {
                    if (diffX <= -threshold) {
                        this._openFullscreenInfoDrawer();
                    } else {
                        this._closeFullscreenInfoDrawer();
                    }
                } else {
                    if (diffX >= threshold) {
                        this._closeFullscreenInfoDrawer();
                    } else {
                        this._openFullscreenInfoDrawer();
                    }
                }

                touchStartY = null;
                touchStartX = null;
                currentDragY = 0;
                currentDragX = 0;
                isDragging = false;
                isHorizontalDrag = false;
                return;
            }

            const diffY = currentDragY;
            const screenHeight = window.innerHeight || 800;
            const threshold = Math.min(70, screenHeight * 0.10);

            const slide = activeSlideEl || getActiveSlide();

            if (isDragging && Math.abs(diffY) >= threshold && !g._fullscreenTransitioning) {
                g._autoSlidePausedByUser = false;
                cleanupDragPreviews();
                if (diffY < 0) {
                    this._fullscreenNext("down");
                } else {
                    this._fullscreenPrev("up");
                }
            } else if (isDragging) {
                if (slide) {
                    slide.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
                    slide.style.transform = 'translate3d(0, 0, 0) scale(1)';
                    slide.style.opacity = '1';
                }
                if (previewNextSlide) {
                    previewNextSlide.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
                    previewNextSlide.style.transform = `translate3d(0, ${screenHeight}px, 0) scale(0.92)`;
                    previewNextSlide.style.opacity = '0';
                }
                if (previewPrevSlide) {
                    previewPrevSlide.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
                    previewPrevSlide.style.transform = `translate3d(0, ${-screenHeight}px, 0) scale(0.92)`;
                    previewPrevSlide.style.opacity = '0';
                }
                setTimeout(() => {
                    cleanupDragPreviews();
                    if (slide) {
                        slide.style.transition = '';
                    }
                }, 260);
            } else {
                cleanupDragPreviews();
            }

            touchStartY = null;
            touchStartX = null;
            currentDragY = 0;
            currentDragX = 0;
            isDragging = false;
            isHorizontalDrag = false;
            activeSlideEl = null;
        };

        const keyHandler = (e) => {
            if (window.safeScreen && window.safeScreen.isActive) return;
            if (!g.fullscreenContainer) return;
            const isShiftEsc = e.shiftKey && e.key === 'Escape';
            const isCtrlShiftS = e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы');
            const isAltS = e.altKey && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы');
            if (isShiftEsc || isCtrlShiftS || isAltS) {
                return;
            }
            if (['Escape', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 
                'd', 'D', 'a', 'A', 's', 'S', 'w', 'W', ' '].includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (e.key === 'Escape' && !e.shiftKey) {
                const drawer = g.fullscreenContainer ? g.fullscreenContainer.querySelector('.fullscreen-info-drawer') : null;
                if (drawer && drawer.classList.contains('open')) {
                    this._closeFullscreenInfoDrawer();
                } else {
                    this._exitFullscreen();
                }
            } else if (e.key.toLowerCase() === 'i' || e.key.toLowerCase() === 'ш') {
                this._toggleFullscreenInfoDrawer();
            } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
                g._autoSlidePausedByUser = false;
                this._fullscreenNext();
            } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
                g._autoSlidePausedByUser = false;
                this._fullscreenPrev();
            } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
                g._autoSlidePausedByUser = false;
                this._fullscreenNext('down');
            } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
                g._autoSlidePausedByUser = false;
                this._fullscreenPrev('up');
            } else if (e.key === ' ') {
                if (g._photoViewer) {
                    const photoPlayBtn = g.fullscreenContainer ? g.fullscreenContainer.querySelector('.photo-bottom-play-btn') : null;
                    if (g._photoViewer.paused) {
                        g._photoViewer.resume();
                        g._autoSlidePausedByUser = false;
                        if (photoPlayBtn) photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>`;
                    } else {
                        g._photoViewer.pause();
                        g._autoSlidePausedByUser = true;
                        if (photoPlayBtn) photoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
                    }
                } else if (g.fullscreenContainer) {
                    const currentSlide = this._getCurrentFullscreenSlide();
                    const video = currentSlide?.querySelector('video');
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
            if (!g.fullscreenContainer) return;
            e.preventDefault();
            e.stopPropagation();
            
            const now = Date.now();
            if (now - lastWheelTime < 800) return;
            
            const threshold = 35;
            if (Math.abs(e.deltaY) < threshold) return;
            
            if (e.deltaY > 0) {
                lastWheelTime = now;
                g._autoSlidePausedByUser = false;
                this._fullscreenNext("down");
            } else {
                lastWheelTime = now;
                g._autoSlidePausedByUser = false;
                this._fullscreenPrev("up");
            }
        };

        const touchOpts = { passive: false };
        g.fullscreenContainer.addEventListener('touchstart', touchStart, touchOpts);
        g.fullscreenContainer.addEventListener('touchmove', touchMove, touchOpts);
        g.fullscreenContainer.addEventListener('touchend', touchEnd, touchOpts);
        window.addEventListener('keydown', keyHandler, true);
        document.addEventListener('fullscreenchange', fsHandler);
        g.fullscreenContainer.addEventListener('wheel', wheelHandler, { passive: false });

        g._fullscreenHandlers = {
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
        const g = this.gallery;
        this._stopPhotoTimer();
        this._hideFullscreenLoadingSlide();
        this._hideFullscreenEndSlide();
        if (g.fullscreenContainer) {
            const videos = g.fullscreenContainer.querySelectorAll('video');
            videos.forEach(v => {
                try {
                    v.pause();
                    v.src = "";
                    v.load();
                } catch (e) {
                    console.log('Error cleaning up videos in fullscreen:', e);
                }
            });

            const videoElement = g.fullscreenContainer.querySelector('video');
            if (videoElement && typeof videoElement._videoPlayerInstance?._destroy === 'function') {
                videoElement._videoPlayerInstance._destroy();
            }

            const touchOpts = { passive: false };
            g.fullscreenContainer.removeEventListener('touchstart', g._fullscreenHandlers?.touchStart, touchOpts);
            g.fullscreenContainer.removeEventListener('touchmove', g._fullscreenHandlers?.touchMove, touchOpts);
            g.fullscreenContainer.removeEventListener('touchend', g._fullscreenHandlers?.touchEnd, touchOpts);
            g.fullscreenContainer.removeEventListener('wheel', g._fullscreenHandlers?.wheel, { passive: false });
            g.fullscreenContainer.remove();
            g.fullscreenContainer = null;
            
            if (g.fullscreenIdx !== null && g.resultsDiv) {
                const el = g.resultsDiv.querySelector(`[data-idx="${g.fullscreenIdx}"]`);
                if (el) {
                    el.scrollIntoView({ behavior: 'auto', block: 'center' });
                }
            }
            g.fullscreenIdx = null;
        }
        if (g._fullscreenHandlers) {
            window.removeEventListener('keydown', g._fullscreenHandlers.keyHandler, true);
            document.removeEventListener('fullscreenchange', g._fullscreenHandlers.fsHandler);
        }
        g._photoViewer = null;
        g._fullscreenHandlers = null;
    }

    _showFullscreenLoadingSlide(direction = "down") {
        const g = this.gallery;
        if (!g.fullscreenContainer) return;
        const mediaWrapper = g.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
        if (!mediaWrapper) return;

        if (g._fullscreenLoadingSlide) return;

        const oldSlide = mediaWrapper.querySelector('.fullscreen-slide, .media-slide');
        
        const loadingSlide = document.createElement('div');
        loadingSlide.className = 'fullscreen-slide fullscreen-loading-slide';
        
        loadingSlide.innerHTML = `
            <div class="fs-loading-content">
                <div class="fs-spinner"></div>
                <div class="fs-loading-title">Идёт загрузка постов...</div>
                <div class="fs-loading-subtitle">Пожалуйста, подождите</div>
            </div>
        `;

        mediaWrapper.appendChild(loadingSlide);
        g._fullscreenLoadingSlide = loadingSlide;

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

            const oldVideos = oldSlide.querySelectorAll('video');
            oldVideos.forEach(v => {
                try {
                    v.pause();
                    v.src = "";
                    v.load();
                } catch (e) {
                    console.log('Error cleaning up video before slide load transition:', e);
                }
            });

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
        const g = this.gallery;
        if (g._fullscreenLoadingSlide && g._fullscreenLoadingSlide.parentNode) {
            const slide = g._fullscreenLoadingSlide;
            slide.parentNode.removeChild(slide);
        }
        g._fullscreenLoadingSlide = null;
    }

    _showFullscreenEndSlide(direction = "down") {
        const g = this.gallery;
        if (!g.fullscreenContainer) return;
        const mediaWrapper = g.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
        if (!mediaWrapper) return;

        if (g._fullscreenEndSlide) return;

        const oldSlide = mediaWrapper.querySelector('.fullscreen-slide, .media-slide');
        
        const endSlide = document.createElement('div');
        endSlide.className = 'fullscreen-slide fullscreen-end-slide';
        
        endSlide.innerHTML = `
            <div class="fs-end-content">
                <div class="fs-end-icon-box">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="fs-end-title">Вы дошли до конца</div>
                <div class="fs-end-subtitle">Больше постов по данному запросу не найдено</div>
            </div>
        `;

        mediaWrapper.appendChild(endSlide);
        g._fullscreenEndSlide = endSlide;

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
        const g = this.gallery;
        if (g._fullscreenEndSlide && g._fullscreenEndSlide.parentNode) {
            const slide = g._fullscreenEndSlide;
            slide.parentNode.removeChild(slide);
        }
        g._fullscreenEndSlide = null;
    }

    _showFullscreenLoader() {
        const g = this.gallery;
        if (!g.fullscreenContainer) return;
        let loader = g.fullscreenContainer.querySelector('.fullscreen-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'fullscreen-loader';
            loader.innerHTML = `
                <div class="fullscreen-loader-spinner"></div>
            `;
            if (g.fullscreenContainer) g.fullscreenContainer.appendChild(loader);
        }
        loader.style.display = 'flex';
    }

    _hideFullscreenLoader() {
        const g = this.gallery;
        if (!g.fullscreenContainer) return;
        const loader = g.fullscreenContainer.querySelector('.fullscreen-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    _fullscreenNext(direction = "down", force = false) {
        const g = this.gallery;
        if (force) {
            g._fullscreenTransitioning = false;
        }
        if (g._fullscreenTransitioning) return;
        const postsList = g._activeFullscreenPosts || (g.isFavoritesActive ? g.favoritesPosts : g.currentPosts);
        if (g.fullscreenIdx === null || !postsList) return;
        
        const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
        const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
        let nextIdx = g.fullscreenIdx + 1;
        while (nextIdx < postsList.length) {
            const p = postsList[nextIdx];
            if (!g._isPostFiltered(p)) {
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

        if (g.onLoadMore && !window.reachedEnd && (postsList.length - nextIdx < 8)) {
            g.onLoadMore();
        }

        if (nextIdx >= postsList.length) {
            if (window.reachedEnd) {
                this._showFullscreenEndSlide(direction);
            } else if (g.onLoadMore) {
                this._showFullscreenLoadingSlide(direction);
                g._pendingFullscreenNext = true;
                g.onLoadMore();
            } else {
                this._showFullscreenEndSlide(direction);
            }
            return;
        }
        
        const oldPost = postsList[g.fullscreenIdx];
        if (oldPost && ['mp4', 'webm', 'mov'].includes((oldPost.file_url?.split('.').pop() || '').toLowerCase())) {
            const video = g.fullscreenContainer.querySelector('video');
            if (video) {
                g._saveVideoPosition(oldPost.id, video.currentTime);
            }
            g._scheduleSavedVideoPositionExpiry(oldPost.id);
        }
        g._fullscreenTransitioning = true;
        if (g._photoViewer) {
            g._photoViewer.stop();
        }
        g.fullscreenIdx = nextIdx;
        this._renderFullscreenMedia(direction);
        this._showVideoControls();
    }

    _fullscreenPrev(direction = "up", force = false) {
        const g = this.gallery;
        if (force) {
            g._fullscreenTransitioning = false;
        }
        if (g._fullscreenTransitioning) return;
        if (g.fullscreenIdx === null) return;
        
        const postsList = g._activeFullscreenPosts || (g.isFavoritesActive ? g.favoritesPosts : g.currentPosts);
        
        const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
        const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
        
        let prevIdx = g.fullscreenIdx;
        const isSpecialSlideActive = !!(g._fullscreenLoadingSlide || g._fullscreenEndSlide);
        if (isSpecialSlideActive) {
            g._pendingFullscreenNext = false;
        } else {
            prevIdx = g.fullscreenIdx - 1;
        }

        while (prevIdx >= 0) {
            const p = postsList[prevIdx];
            if (!g._isPostFiltered(p)) {
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
        
        const oldPost = postsList[g.fullscreenIdx];
        if (oldPost && ['mp4', 'webm', 'mov'].includes((oldPost.file_url?.split('.').pop() || '').toLowerCase())) {
            const video = g.fullscreenContainer.querySelector('video');
            if (video) {
                g._saveVideoPosition(oldPost.id, video.currentTime);
            }
            g._scheduleSavedVideoPositionExpiry(oldPost.id);
        }
        g._fullscreenTransitioning = true;
        if (g._photoViewer) {
            g._photoViewer.stop();
        }
        g.fullscreenIdx = prevIdx;
        this._renderFullscreenMedia(direction);
        this._showVideoControls();
    }

    // Во время перехода между слайдами старый ещё ~500мс остаётся в DOM
    // (уезжает с анимацией), поэтому обычный querySelector('video') / '.media-slide'
    // может попасть на старый, уже неактуальный слайд. Новый слайд всегда
    // добавляется последним — эта функция возвращает именно его.
    _getCurrentFullscreenSlide() {
        const g = this.gallery;
        if (!g.fullscreenContainer) return null;
        const mediaWrapper = g.fullscreenContainer.querySelector('.fullscreen-media-wrapper');
        if (!mediaWrapper) return null;
        const slides = mediaWrapper.querySelectorAll('.media-slide, .fullscreen-slide');
        return slides[slides.length - 1] || null;
    }

    _showVideoControls() {
        const currentSlide = this._getCurrentFullscreenSlide();
        const controlsWrapper = currentSlide?.querySelector('.gallery-video-controls-wrapper');
        if (controlsWrapper?.firstChild?._showControls) {
            controlsWrapper.firstChild._showControls();
        }
    }
}
