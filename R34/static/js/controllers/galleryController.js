/**
 * Gallery Controller - Handles post loading, API communication, filtering and pagination
 */

import { fetchPosts, proxyUrl } from '../api.js';
import { icon } from '../icons.js';

export class GalleryController {
    constructor(options = {}) {
        this.gallery = options.gallery;
        this.tagSearch = options.tagSearch;
        this.loader = options.loader || document.getElementById('loader');
        this.paginationLoader = options.paginationLoader || document.getElementById('pagination-loader');
        this.resultsDiv = options.resultsDiv || document.getElementById('results');
        this.errorEl = options.errorEl || document.getElementById('error');
        this.arrowButton = options.arrowButton || document.getElementById('arrowButton');
        this.getCurrentSort = options.getCurrentSort || (() => localStorage.getItem('r34_current_sort') || 'new');
        this.isProfileMode = options.isProfileMode || (() => false);

        this.page = 0;
        this.loading = false;
        this.reachedEnd = false;
        this.lastTagsQuery = '';
        this.isInitialLoad = true;
        this.debounceTimeout = null;
        this._pendingQuery = null;

        window.reachedEnd = false;
    }

    init() {
        this.bindEvents();
        this.initInfiniteScroll();
    }

    debouncedLoadPosts(tagsQuery, append) {
        if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
        this.debounceTimeout = setTimeout(() => {
            this.loadPosts(tagsQuery, append);
        }, 500);
    }

    immediateLoadPosts(tagsQuery, append) {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }
        this.loadPosts(tagsQuery, append);
    }

    resetAndLoad(tagsQuery) {
        this.page = 0;
        this.reachedEnd = false;
        window.reachedEnd = false;
        this.lastTagsQuery = tagsQuery;
        this.isInitialLoad = true;
        if (this.gallery) this.gallery.realCount = undefined;
        this.immediateLoadPosts(tagsQuery, false);
    }

    async loadPosts(tagsQuery = '', append = false) {
        console.log('[GalleryController] loadPosts called', { tagsQuery, append, loading: this.loading, reachedEnd: this.reachedEnd });

        // Block loading when puzzle is active (unless forced)
        if (window.puzzleGameActive && !window._forceLoadPosts) {
            console.log('[GalleryController] Blocked by puzzleGameActive flag');
            return;
        }

        if (this.isProfileMode()) {
            return; // Don't load gallery posts when in profile mode
        }

        if (this.loading || (this.reachedEnd && append)) {
            // Пользователь сменил теги/фильтр, пока предыдущий запрос ещё в
            // полёте (например, ждёт retry на rate-limit — это десятки
            // секунд, см. api.js). Раньше такой запрос просто молча терялся
            // здесь же, и после завершения старого рисовались результаты по
            // уже неактуальным тегам без единого следа, что что-то пошло не
            // так. Запоминаем последнее желаемое состояние поиска и
            // перезапускаем его сами, как только текущий запрос освободится.
            if (this.loading && !append) {
                this._pendingQuery = tagsQuery;
            }
            return;
        }
        this._pendingQuery = null;
        this.loading = true;

        if (append) {
            if (this.paginationLoader) this.paginationLoader.style.display = 'block';
        } else {
            if (this.loader) this.loader.style.display = 'block';
        }

        if (!append) {
            if (this.resultsDiv) this.resultsDiv.scrollTop = 0;
            this.reachedEnd = false;
            window.reachedEnd = false;
        }

        this._clearError();

        try {
            const sortBy = this.getCurrentSort();
            let query = typeof tagsQuery === 'string' ? tagsQuery : '';

            // Only GIFs filter
            const onlyGifsEnabled = localStorage.getItem('r34_only_gifs') === 'true';
            if (onlyGifsEnabled) {
                const queryTags = query.split(/\s+/).map(t => t.toLowerCase());
                if (!queryTags.includes('gif')) {
                    query = query ? `${query} gif` : 'gif';
                }
            }

            if (sortBy === 'new') {
                query = query ? `${query} sort:id:desc` : 'sort:id:desc';
            } else if (sortBy === 'popular') {
                query = query ? `${query} sort:score:desc` : 'sort:score:desc';
            } else if (sortBy === 'likes') {
                const savedMinLikes = localStorage.getItem('r34_min_likes');
                let minVal = savedMinLikes !== null ? parseInt(savedMinLikes, 10) : 0;
                if (isNaN(minVal)) minVal = 0;
                query = query ? `${query} score:>=${minVal} sort:score:asc` : `score:>=${minVal} sort:score:asc`;
            } else if (sortBy === 'random') {
                const combineEnabled = localStorage.getItem('r34_combine_random_likes') === 'true';
                if (combineEnabled) {
                    const savedMinLikes = localStorage.getItem('r34_min_likes');
                    let minVal = savedMinLikes !== null ? parseInt(savedMinLikes, 10) : 0;
                    if (isNaN(minVal)) minVal = 0;
                    query = query ? `${query} score:>=${minVal} sort:random` : `score:>=${minVal} sort:random`;
                } else {
                    query = query ? `${query} sort:random` : 'sort:random';
                }
            }

            let data = await fetchPosts(query, false, this.page);
            let posts = [];

            if (Array.isArray(data)) {
                posts = data.filter(post => post && post.file_url);
            } else if (data && data['@attributes']) {
                let arr = Array.isArray(data.post) ? data.post : [data.post];
                posts = arr.filter(post => post && post.file_url);
            } else if (Array.isArray(data.post)) {
                posts = data.post.filter(post => post && post.file_url);
            } else if (data && data.post) {
                posts = [data.post].filter(post => post && post.file_url);
            }

            const originalLength = posts.length;

            // Excluded tags client-side filter (skipped when the "Игнорировать"
            // toggle for excluded tags is on — see tagSearch.js, r34_ignore_excluded_tags)
            const ignoreExcludedTags = localStorage.getItem('r34_ignore_excluded_tags') === 'true';
            const excludedTagsRaw = localStorage.getItem('r34_excluded_tags');
            let excludedTags = [];
            if (!ignoreExcludedTags && excludedTagsRaw) {
                try {
                    excludedTags = JSON.parse(excludedTagsRaw);
                    if (!Array.isArray(excludedTags)) excludedTags = [];
                } catch (e) {
                    console.error('Failed to parse excluded tags:', e);
                    excludedTags = [];
                }
            }
            if (excludedTags.length > 0) {
                const excludedSet = new Set(excludedTags.map(t => t.toLowerCase()));
                posts = posts.filter(post => {
                    if (post.tags) {
                        const postTags = post.tags.toLowerCase().split(/\s+/);
                        for (let tag of postTags) {
                            if (excludedSet.has(tag)) return false;
                        }
                    }
                    return true;
                });
            }

            // Only GIFs client-side filter
            if (onlyGifsEnabled) {
                posts = posts.filter(post => {
                    return (post.file_url?.split('.').pop() || '').toLowerCase() === 'gif';
                });
            }

            // Duration client-side filter
            const isDurationEnabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
            const minDuration = isDurationEnabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
            if (minDuration > 0) {
                posts = await this.filterByDuration(posts, minDuration);
            }

            let totalCount = this.gallery?.realCount;
            if (!append && (this.isInitialLoad || !totalCount)) {
                try {
                    let xmlUrl = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(query)}&limit=1`;
                    const xmlResp = await fetch(proxyUrl(xmlUrl));
                    const xmlStr = await xmlResp.text();
                    const match = xmlStr.match(/<posts\s+count="(\d+)"/i);
                    if (match) {
                        totalCount = parseInt(match[1], 10);
                        if (this.gallery) this.gallery.realCount = totalCount;
                    }
                } catch (e) {
                    console.error('[GalleryController] Error fetching total count:', e);
                }
                this.isInitialLoad = false;
            }

            const apiLimit = parseInt(localStorage.getItem('r34_api_limit') || '40', 10);
            const limit = Math.min(Math.max(apiLimit, 1), 1000);

            // Если API отдал меньше постов, чем лимит страницы (или вообще ничего),
            // это последняя партия — дальше подгружать нечего. В этом случае
            // показываем реальное количество постов ПОСЛЕ клиентской фильтрации
            // (исключённые теги / только GIF / мин. длительность), а не сырое
            // totalCount из отдельного API-запроса, которое ничего не знает об этой
            // фильтрации — иначе счётчик может показывать "1 результат" при пустой
            // галерее, если единственный найденный пост попал под исключённый тег.
            const isLastBatch = originalLength === 0 || originalLength < limit;
            let realCount;
            if (isLastBatch) {
                realCount = append ? ((this.gallery?.currentPosts?.length || 0) + posts.length) : posts.length;
            } else {
                realCount = totalCount || (append ? (this.gallery?.realCount || posts.length) : posts.length);
            }

            if (this.gallery) {
                if (typeof this.gallery.preloadTagTypes === 'function') {
                    this.gallery.preloadTagTypes(posts);
                }

                if (append) {
                    this.gallery.appendResults(posts, realCount);
                } else {
                    this.gallery.displayResults(posts, realCount);
                }
            }

            const endOfResults = document.getElementById('end-of-results');
            const paginationContainer = document.getElementById('pagination-container');
            const scrollMode = localStorage.getItem('r34_scroll_mode') || 'infinite';

            if (isLastBatch) {
                this.reachedEnd = true;
                if (endOfResults) endOfResults.style.display = 'flex';
                if (paginationContainer && scrollMode === 'pagination') {
                    paginationContainer.style.display = 'flex';
                    this.renderPagination(realCount, limit);
                } else if (paginationContainer) {
                    paginationContainer.style.display = 'none';
                }
            } else {
                this.reachedEnd = false;
                if (endOfResults) endOfResults.style.display = 'none';
                if (paginationContainer) {
                    if (scrollMode === 'pagination') {
                        paginationContainer.style.display = 'flex';
                        this.renderPagination(realCount, limit);
                    } else {
                        paginationContainer.style.display = 'none';
                    }
                }
            }
            window.reachedEnd = this.reachedEnd;

            // Auto-load if viewport is insufficiently filled
            setTimeout(() => {
                const windowHeight = window.innerHeight || document.documentElement.clientHeight;
                const docHeight = Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight,
                    document.body.offsetHeight,
                    document.documentElement.offsetHeight,
                    document.body.clientHeight,
                    document.documentElement.clientHeight
                );
                if (docHeight < windowHeight + 400 && !this.loading && !this.reachedEnd && (localStorage.getItem('r34_scroll_mode') || 'infinite') === 'infinite') {
                    this.page++;
                    this.immediateLoadPosts(this.tagSearch?.getTagsQuery() || '', true);
                }
            }, 400);

        } catch (error) {
            console.error('[GalleryController] Error during posts load:', error);
            this.handleLoadError(error, append);
        } finally {
            if (this.loader) this.loader.style.display = 'none';
            if (this.paginationLoader) this.paginationLoader.style.display = 'none';
            this.loading = false;

            if (this._pendingQuery !== null) {
                const pending = this._pendingQuery;
                this._pendingQuery = null;
                this.resetAndLoad(pending);
            }
        }
    }

    async filterByDuration(posts, minDuration) {
        // Кэшируем расширения файлов для избежания повторных split операций
        const videoExtensions = new Set(['mp4', 'webm', 'mov']);
        const extensionCache = new Map();

        const getExtension = (url) => {
            if (extensionCache.has(url)) return extensionCache.get(url);
            const ext = (url?.split('.').pop() || '').toLowerCase();
            extensionCache.set(url, ext);
            return ext;
        };

        let filtered = posts.filter(post => {
            const ext = getExtension(post.file_url);
            if (!videoExtensions.has(ext)) return true;
            const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
            if (!isNaN(cachedDuration) && cachedDuration > 0) {
                return cachedDuration >= minDuration;
            }
            return true;
        });

        const unresolvedVideos = filtered.filter(post => {
            const ext = getExtension(post.file_url);
            if (!videoExtensions.has(ext)) return false;
            const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
            return isNaN(cachedDuration) || cachedDuration <= 0;
        });

        if (unresolvedVideos.length > 0) {
            // Адаптивная конкурентность: меньше для мобильных, больше для десктопа
            const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
            const concurrency = isMobile ? 4 : 16;
            const queue = [...unresolvedVideos];
            const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(async () => {
                while (queue.length > 0) {
                    const post = queue.shift();
                    if (!post) break;
                    await new Promise((resolve) => {
                        const video = document.createElement('video');
                        video.preload = 'metadata';
                        video.muted = true;
                        video.playsInline = true;
                        video.src = post.file_url;

                        // Уменьшил таймаут с 4000мс до 2000мс для более быстрого пропуска недоступных видео
                        const timeoutId = setTimeout(() => {
                            video.src = '';
                            video.load();
                            resolve();
                        }, 2000);

                        video.onloadedmetadata = () => {
                            clearTimeout(timeoutId);
                            const d = video.duration;
                            if (!isNaN(d) && d > 0) {
                                localStorage.setItem(`r34_duration_${post.id}`, d.toString());
                            }
                            video.src = '';
                            video.load();
                            resolve();
                        };

                        video.onerror = () => {
                            clearTimeout(timeoutId);
                            video.src = '';
                            video.load();
                            resolve();
                        };
                    });
                }
            });
            await Promise.all(workers);

            filtered = filtered.filter(post => {
                const ext = getExtension(post.file_url);
                if (!videoExtensions.has(ext)) return true;
                const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
                if (!isNaN(cachedDuration) && cachedDuration > 0) {
                    return cachedDuration >= minDuration;
                }
                return true;
            });
        }

        return filtered;
    }

    // Единая точка сброса блока ошибки — используется и перед новой попыткой
    // загрузки, и после того как rate-limit самовосстановился. Раньше показ
    // rate-limit ставил инлайновый style.display='flex' поверх CSS-класса
    // .active, а сброс убирал только .active и текст — инлайн-стиль никто не
    // снимал, и после первого rate-limit пустой блок с рамкой оставался
    // видимым на странице навсегда. Теперь видимостью управляет только класс.
    _clearError() {
        if (window._rateLimitInterval) {
            clearInterval(window._rateLimitInterval);
            window._rateLimitInterval = null;
        }
        if (!this.errorEl) return;
        this.errorEl.textContent = '';
        this.errorEl.classList.remove('active', 'rate-limit');
    }

    handleLoadError(error, append) {
        if (!this.errorEl) return;

        if (error && error.message === "AUTH_REQUIRED") {
            this.errorEl.innerHTML = `
                <div class="rate-limit-box">
                    <span class="rate-limit-msg">${icon('lock', { size: 16 })} Сессия авторизации истекла или недействительна.</span>
                    <a href="/login" class="r34-btn-primary" style="display:inline-block; margin-top:8px; padding:6px 16px; font-size:0.85rem; text-decoration:none; border-radius:10px;">Войти в аккаунт</a>
                </div>
            `;
            this.errorEl.classList.add('active');
            if (append) {
                if (this.gallery) this.gallery.appendResults([], this.gallery.realCount);
            } else {
                if (this.gallery) this.gallery.displayResults([], 0);
                this.reachedEnd = true;
            }
            return;
        }

        if (error && error.message === "NETWORK_ERROR") {
            this.errorEl.innerHTML = `
                <div class="rate-limit-box">
                    <span class="rate-limit-msg">${icon('warning', { size: 16 })} Сервер недоступен или отсутствует подключение к сети.</span>
                    <button id="retry-now-btn" class="rate-limit-retry-btn" style="margin-top:8px;">
                        Повторить попытку ${icon('refresh', { size: 14 })}
                    </button>
                </div>
            `;
            this.errorEl.classList.add('active');
            const retryBtn = document.getElementById('retry-now-btn');
            if (retryBtn) {
                retryBtn.onclick = () => {
                    this._clearError();
                    this.immediateLoadPosts(this.tagSearch?.getTagsQuery() || '', append);
                };
            }
            if (append) {
                if (this.gallery) this.gallery.appendResults([], this.gallery.realCount);
            } else {
                if (this.gallery) this.gallery.displayResults([], 0);
                this.reachedEnd = true;
            }
            return;
        }

        const isRateLimit = error && (error.message === "RATE_LIMIT" || error.isRateLimit === true);
        if (isRateLimit) {
            console.warn('[GalleryController] API Rate Limit encountered. Cooldown started.');
            const totalSeconds = 15;
            let secondsLeft = totalSeconds;
            this.errorEl.innerHTML = `
                <div class="rate-limit-box">
                    <span class="rate-limit-msg">${icon('warning', { size: 16 })} API Rule34 временно ограничил частоту запросов.</span>
                    <span class="rate-limit-sub">Автоматическая повторная попытка через <b id="rate-limit-timer">${secondsLeft}</b> сек...</span>
                    <div class="rate-limit-bar"><div class="rate-limit-bar-fill" id="rate-limit-bar-fill"></div></div>
                    <button id="retry-now-btn" class="rate-limit-retry-btn">
                        Попробовать сейчас ${icon('refresh', { size: 14 })}
                    </button>
                </div>
            `;
            this.errorEl.classList.add('active', 'rate-limit');

            const retryNow = () => {
                this._clearError();
                this.immediateLoadPosts(this.tagSearch?.getTagsQuery() || '', append);
            };

            if (window._rateLimitInterval) clearInterval(window._rateLimitInterval);
            window._rateLimitInterval = setInterval(() => {
                secondsLeft--;
                const timerEl = document.getElementById('rate-limit-timer');
                if (timerEl) timerEl.textContent = secondsLeft;
                const barFill = document.getElementById('rate-limit-bar-fill');
                if (barFill) barFill.style.width = `${Math.max(0, (secondsLeft / totalSeconds) * 100)}%`;
                if (secondsLeft <= 0) {
                    retryNow();
                }
            }, 1000);

            const retryBtn = document.getElementById('retry-now-btn');
            if (retryBtn) {
                retryBtn.onclick = retryNow;
            }
        } else {
            this.errorEl.textContent = 'Ошибка загрузки. Попробуйте позже.';
            this.errorEl.classList.add('active');
        }

        if (append) {
            if (this.gallery) this.gallery.appendResults([], this.gallery.realCount);
        } else {
            if (this.gallery) this.gallery.displayResults([], 0);
            this.reachedEnd = true;
            const endOfResults = document.getElementById('end-of-results');
            if (endOfResults) endOfResults.style.display = 'none';
        }
    }

    renderPagination(totalCount, limit) {
        const paginationContainer = document.getElementById('pagination-container');
        if (!paginationContainer || !totalCount || totalCount <= limit) {
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(totalCount / limit);
        const currentPage = this.page;
        paginationContainer.innerHTML = '';

        const createPageBtn = (pageNum, label, isActive = false) => {
            const btn = document.createElement('button');
            btn.className = isActive ? 'r34-pagination-btn active' : 'r34-pagination-btn';
            btn.textContent = label;
            btn.onclick = () => {
                if (this.page === pageNum) return;
                this.page = pageNum;
                // Прыжок мгновенный, а не smooth: страница результатов бывает
                // в десятки тысяч пикселей, плавную прокрутку с такой высоты
                // перебивает подгрузка карточек, и пользователь остаётся в
                // хвосте предыдущей страницы вместо начала новой.
                const jumpTop = () => window.scrollTo({ top: 0, behavior: 'auto' });
                jumpTop();
                this.immediateLoadPosts(this.tagSearch?.getTagsQuery() || '', false);
                // Сетка перестраивается асинхронно и меняет высоту документа —
                // браузер при этом возвращает прокрутку обратно, поэтому
                // повторяем прыжок на ближайших кадрах.
                requestAnimationFrame(jumpTop);
                setTimeout(jumpTop, 150);
                setTimeout(jumpTop, 500);
            };
            return btn;
        };

        if (currentPage > 0) {
            paginationContainer.appendChild(createPageBtn(currentPage - 1, '«'));
        }

        let startPage = Math.max(0, currentPage - 2);
        let endPage = Math.min(totalPages - 1, currentPage + 2);

        if (startPage > 0) {
            paginationContainer.appendChild(createPageBtn(0, '1'));
            if (startPage > 1) {
                const dot = document.createElement('span');
                dot.textContent = '...';
                dot.className = 'r34-pagination-dots';
                paginationContainer.appendChild(dot);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationContainer.appendChild(createPageBtn(i, i + 1, i === currentPage));
        }

        if (endPage < totalPages - 1) {
            if (endPage < totalPages - 2) {
                const dot = document.createElement('span');
                dot.textContent = '...';
                dot.className = 'r34-pagination-dots';
                paginationContainer.appendChild(dot);
            }
            paginationContainer.appendChild(createPageBtn(totalPages - 1, totalPages));
        }

        if (currentPage < totalPages - 1) {
            paginationContainer.appendChild(createPageBtn(currentPage + 1, '»'));
        }
    }

    initInfiniteScroll() {
        const sentinel = document.createElement('div');
        sentinel.id = 'infinite-scroll-sentinel';
        sentinel.style.height = '1px';
        document.body.appendChild(sentinel);

        const scrollObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                if (this.loading || this.reachedEnd) return;
                const scrollMode = localStorage.getItem('r34_scroll_mode') || 'infinite';
                if (scrollMode !== 'infinite') return;
                this.page++;
                this.immediateLoadPosts(this.tagSearch?.getTagsQuery() || '', true);
            }
        }, { rootMargin: '800px' });

        scrollObserver.observe(sentinel);

        // Используем MutationObserver вместо setInterval для отслеживания перемещения sentinel
        const sentinelObserver = new MutationObserver(() => {
            const results = document.getElementById('results');
            if (results && sentinel.parentElement !== results.parentElement) {
                results.parentElement.appendChild(sentinel);
            }
        });

        if (this.resultsDiv) {
            sentinelObserver.observe(this.resultsDiv.parentElement, { childList: true });
        }
    }

    bindEvents() {
        // Кнопка поиска (arrowButton) обрабатывается в tagSearch.js
    }
}
