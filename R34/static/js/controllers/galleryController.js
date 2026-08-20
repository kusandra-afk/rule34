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

        if (this.loading || (this.reachedEnd && append)) return;
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

        if (this.errorEl) {
            this.errorEl.textContent = '';
            this.errorEl.classList.remove('active');
        }

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

            // Excluded tags client-side filter
            const excludedTagsRaw = localStorage.getItem('r34_excluded_tags');
            const excludedTags = excludedTagsRaw ? JSON.parse(excludedTagsRaw) : [];
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

            const realCount = totalCount || (append ? (this.gallery?.realCount || posts.length) : posts.length);

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

            const apiLimit = parseInt(localStorage.getItem('r34_api_limit') || '40', 10);
            const limit = Math.min(Math.max(apiLimit, 1), 1000);

            const endOfResults = document.getElementById('end-of-results');
            const paginationContainer = document.getElementById('pagination-container');
            const scrollMode = localStorage.getItem('r34_scroll_mode') || 'infinite';

            if (originalLength === 0 || originalLength < limit) {
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
        }
    }

    async filterByDuration(posts, minDuration) {
        let filtered = posts.filter(post => {
            const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
            if (!isVideo) return true;
            const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
            if (!isNaN(cachedDuration) && cachedDuration > 0) {
                return cachedDuration >= minDuration;
            }
            return true;
        });

        const unresolvedVideos = filtered.filter(post => {
            const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
            if (!isVideo) return false;
            const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
            return isNaN(cachedDuration) || cachedDuration <= 0;
        });

        if (unresolvedVideos.length > 0) {
            const concurrency = 8;
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

                        const timeoutId = setTimeout(() => {
                            video.src = '';
                            video.load();
                            resolve();
                        }, 4000);

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
                const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
                if (!isVideo) return true;
                const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
                if (!isNaN(cachedDuration) && cachedDuration > 0) {
                    return cachedDuration >= minDuration;
                }
                return true;
            });
        }

        return filtered;
    }

    handleLoadError(error, append) {
        if (!this.errorEl) return;

        const isRateLimit = error && (error.message === "RATE_LIMIT" || error.isRateLimit === true);
        if (isRateLimit) {
            console.warn('[GalleryController] API Rate Limit encountered. Cooldown started.');
            let secondsLeft = 15;
            this.errorEl.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <span>${icon('warning', { size: 16 })} API Rule34 временно ограничил частоту запросов.</span>
                    <span style="font-size: 0.9em; opacity: 0.85;">Автоматическая повторная попытка через <b id="rate-limit-timer">${secondsLeft}</b> сек...</span>
                    <button id="retry-now-btn" style="margin-top: 6px; padding: 6px 16px; background: var(--glass-bg-strong); color: #fff; border: 1px solid var(--glass-border); border-radius: var(--radius-sm); cursor: pointer; font-weight: bold; transition: background 0.2s;">
                        Попробовать сейчас ${icon('refresh', { size: 14 })}
                    </button>
                </div>
            `;
            this.errorEl.classList.add('active');
            this.errorEl.style.display = 'flex';

            if (window._rateLimitInterval) clearInterval(window._rateLimitInterval);
            window._rateLimitInterval = setInterval(() => {
                secondsLeft--;
                const timerEl = document.getElementById('rate-limit-timer');
                if (timerEl) timerEl.textContent = secondsLeft;
                if (secondsLeft <= 0) {
                    clearInterval(window._rateLimitInterval);
                    this.errorEl.classList.remove('active');
                    this.errorEl.innerHTML = '';
                    this.immediateLoadPosts(this.tagSearch?.getTagsQuery() || '', append);
                }
            }, 1000);

            const retryBtn = document.getElementById('retry-now-btn');
            if (retryBtn) {
                retryBtn.onclick = () => {
                    if (window._rateLimitInterval) clearInterval(window._rateLimitInterval);
                    this.errorEl.classList.remove('active');
                    this.errorEl.innerHTML = '';
                    this.immediateLoadPosts(this.tagSearch?.getTagsQuery() || '', append);
                };
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
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this.immediateLoadPosts(this.tagSearch?.getTagsQuery() || '', false);
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

        setInterval(() => {
            const results = document.getElementById('results');
            if (results && sentinel.parentElement !== results.parentElement) {
                results.parentElement.appendChild(sentinel);
            }
        }, 1000);
    }

    bindEvents() {
        if (this.arrowButton) {
            this.arrowButton.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke="#fff" stroke-width="2" fill="none"/><line x1="17" y1="17" x2="22" y2="22" stroke="#fff" stroke-width="2"/></svg>';
            this.arrowButton.addEventListener('click', () => {
                this.resetAndLoad(this.tagSearch?.getTagsQuery() || '');
            });
        }
    }
}
