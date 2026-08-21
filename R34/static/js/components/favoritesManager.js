import { StorageManager } from '../storage.js';

export class FavoritesManager {
    static async syncFavorites(gallery) {
        try {
            const myResp = await fetch('/api/my-favorites');
            if (myResp.ok) {
                const myData = await myResp.json();
                if (myData.ok && Array.isArray(myData.favorites)) {
                    myData.favorites.forEach(post => {
                        if (post && post.id) {
                            StorageManager.setItem(`liked_${post.id}`, 'true');
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
                            StorageManager.setItem(`liked_${post.id}`, 'true');
                        }
                    });
                }
            }
        } catch (e) {
            // Rule34 API key might not be set
        }
    }

    static getDisplayedFavoritesColumns(gallery) {
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

    static showFavoritesView(gallery, resetPage = false) {
        gallery.isFavoritesActive = true;
        if (gallery.resultsDiv) gallery.resultsDiv.style.display = 'none';
        
        // Remove data-gallery-cols from body so it doesn't affect favorites styling!
        const bodyCols = document.body.getAttribute('data-gallery-cols');
        if (bodyCols) {
            document.body.dataset.savedGalleryCols = bodyCols;
            document.body.removeAttribute('data-gallery-cols');
        }

        if (!gallery.profileResultsDiv) {
            gallery.profileResultsDiv = document.getElementById('profile-results');
        }
        if (gallery.profileResultsDiv) {
            gallery.profileResultsDiv.style.display = 'block';
            FavoritesManager.renderProfileFavorites(gallery, resetPage);
        }
    }

    static showGalleryView(gallery) {
        gallery.isFavoritesActive = false;
        
        // Restore data-gallery-cols to body!
        const savedCols = document.body.dataset.savedGalleryCols;
        if (savedCols) {
            document.body.setAttribute('data-gallery-cols', savedCols);
            delete document.body.dataset.savedGalleryCols;
        } else {
            const cols = localStorage.getItem('r34_columns') || '3';
            document.body.setAttribute('data-gallery-cols', cols);
        }

        if (!gallery.profileResultsDiv) {
            gallery.profileResultsDiv = document.getElementById('profile-results');
        }
        if (gallery.profileResultsDiv) {
            gallery.profileResultsDiv.style.display = 'none';
        }
        if (gallery.resultsDiv) {
            gallery.resultsDiv.style.display = 'grid';
            // Re-observe cards in resultsDiv so IntersectionObserver reloads images/videos without turning black
            const cards = gallery.resultsDiv.querySelectorAll('.media-container');
            cards.forEach(card => {
                card.dataset.loaded = "0";
                if (gallery.observer) {
                    gallery.observer.unobserve(card);
                    gallery.observer.observe(card);
                }
            });
        }
        if (gallery.r34ResultsCount) {
            gallery.updateCountDisplay();
        }
    }

    static async renderProfileFavorites(gallery, resetPage = false) {
        if (resetPage) gallery.favoritesPage = 0;
        if (!gallery.profileResultsDiv) {
            gallery.profileResultsDiv = document.getElementById('profile-results');
        }
        if (!gallery.profileResultsDiv) return;

        const scrollMode = localStorage.getItem('r34_scroll_mode') || 'infinite';
        const apiLimit = parseInt(localStorage.getItem('r34_api_limit') || '40', 10);
        const limit = Math.min(Math.max(apiLimit, 1), 1000);

        gallery.profileResultsDiv.innerHTML = `
            <div class="profile-fav-header">
                <div class="profile-fav-icon-box">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--accent, #ff3b6b)"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </div>
                <h2 class="profile-fav-title">Мои Избранные Посты</h2>
                <p id="profileStatusText" class="profile-fav-desc">
                    Все посты, добавленные вами в избранное, возможно надежно хранятся :3
                </p>
                <p id="profileCountText" class="profile-fav-count">
                    Загрузка...
                </p>
                <div class="fav-toolbar">
                    <button id="refreshProfileBtn" class="fav-refresh-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Обновить список
                    </button>
                    
                    <div class="fav-cols-wrapper">
                        <span class="fav-cols-label">Колонки:</span>
                        <div class="columns-selector fav-columns-selector" id="favColumnsGroup">
                            <button class="col-btn fav-col-btn" data-cols="1">1</button>
                            <button class="col-btn fav-col-btn" data-cols="2">2</button>
                            <button class="col-btn fav-col-btn" data-cols="3">3</button>
                            <button class="col-btn fav-col-btn" data-cols="4">4</button>
                            <button class="col-btn fav-col-btn" data-cols="5">5</button>
                        </div>
                    </div>
                </div>
            </div>
            <div id="profileFavoritesGridContainer" style="width: 100%;"></div>
        `;

        const refreshBtn = document.getElementById('refreshProfileBtn');
        const container = document.getElementById('profileFavoritesGridContainer');
        const favColsGroup = document.getElementById('favColumnsGroup');

        if (refreshBtn) {
            refreshBtn.onclick = () => FavoritesManager.renderProfileFavorites(gallery, true);
        }

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
                        const favCols = FavoritesManager.getDisplayedFavoritesColumns(gallery);
                        subGrid.style.gridTemplateColumns = `repeat(${favCols}, minmax(0, 1fr))`;
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

        async function loadFavs() {
            try {
                const countText = document.getElementById('profileCountText');
                
                container.innerHTML = `<div class="gallery-loading-msg">Загрузка избранного...</div>`;
                if (countText) {
                    countText.textContent = 'Загрузка...';
                }
                const resp = await fetch('/api/my-favorites');
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.ok && Array.isArray(data.favorites)) {
                        gallery.favoritesPosts = data.favorites;
                        gallery.favoritesPosts.forEach(post => {
                            if (post && post.id) {
                                StorageManager.setItem(`liked_${post.id}`, 'true');
                            }
                        });
                        renderGrid.call(gallery);
                    }
                }
            } catch (e) {
                console.error('Failed to load profile favorites:', e);
                container.innerHTML = `<div class="gallery-error-msg">Ошибка загрузки избранного</div>`;
            }
        }

        function renderGrid() {
            const countText = document.getElementById('profileCountText');
            // Update count text
            if (countText) {
                countText.textContent = `Всего постов в избранном: ${gallery.favoritesPosts.length}`;
            }
            if (gallery.favoritesPosts.length === 0) {
                container.innerHTML = `
                    <div class="gallery-empty-msg">
                        У вас пока нет сохраненных медиа в избранном. Нажмите <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--accent, #a78bfa)" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> на любом посте в галерее, чтобы добавить его сюда!
                    </div>
                `;
                if (countText) {
                    countText.textContent = 'Всего постов в избранном: 0';
                }
                if (gallery.r34ResultsCount) gallery.updateCountDisplay();
            } else {
                if (gallery.r34ResultsCount) gallery.updateCountDisplay();
                container.innerHTML = '';
                const subGrid = document.createElement('div');
                subGrid.style.display = 'grid';
                const favCols = FavoritesManager.getDisplayedFavoritesColumns(gallery);
                subGrid.style.gridTemplateColumns = `repeat(${favCols}, minmax(0, 1fr))`;
                subGrid.classList.toggle('multi-cols-mode', favCols >= 2);
                subGrid.style.gap = 'var(--media-gap, 16px)';
                subGrid.style.width = '100%';

                if (!gallery.observer) {
                    const isMobile = window.innerWidth < 900 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
                    gallery.observer = new window.IntersectionObserver(gallery.handleIntersection.bind(gallery), {
                        root: null,
                        rootMargin: isMobile ? '120px' : '300px',
                        threshold: 0.01
                    });
                    
                    gallery._playbackObserver = new window.IntersectionObserver(gallery.handlePlaybackIntersection.bind(gallery), {
                        root: null,
                        threshold: 0.7
                    });
                }

                const paginationContainer = document.getElementById('pagination-container');
                if (paginationContainer) {
                    if (scrollMode === 'pagination' && gallery.favoritesPosts.length > limit) {
                        paginationContainer.style.display = 'flex';
                        FavoritesManager.renderFavoritesPagination(gallery, gallery.favoritesPosts.length, limit);
                    } else {
                        paginationContainer.style.display = 'none';
                    }
                }

                const start = scrollMode === 'pagination' ? (gallery.favoritesPage * limit) : 0;
                const end = scrollMode === 'pagination' ? (start + limit) : gallery.favoritesPosts.length;
                const pagePosts = gallery.favoritesPosts.slice(start, end);

                const fragment = document.createDocumentFragment();
                pagePosts.forEach((post, pIdx) => {
                    const index = start + pIdx;
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
                const idsToFetch = pagePosts.map(p => p.id);
                
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
                                        
                                        // Update the post in favoritesPosts array with full data
                                        if (gallery.favoritesPosts[idx] && gallery.favoritesPosts[idx].id == fullPost.id) {
                                            gallery.favoritesPosts[idx] = { ...gallery.favoritesPosts[idx], ...fullPost };
                                        } else {
                                            // Fallback find if index is somehow mismatched
                                            const findIdx = gallery.favoritesPosts.findIndex(p => p.id == fullPost.id);
                                            if (findIdx !== -1) {
                                                gallery.favoritesPosts[findIdx] = { ...gallery.favoritesPosts[findIdx], ...fullPost };
                                            }
                                        }
                                        
                                        // Create real card
                                        const realCard = gallery.createCard(fullPost, idx);
                                        realCard._post = fullPost;
                                        realCard._isFavoriteCard = true;
                                        if (favCols >= 2) {
                                            realCard.classList.add('custom-cols');
                                        } else {
                                            realCard.classList.remove('custom-cols');
                                        }
                                        
                                        const sourceBlock = gallery.createSourceBlock(fullPost);
                                        if (sourceBlock) {
                                            realCard._sourceBlock = sourceBlock;
                                        }
                                        
                                        const extraInfo = gallery.createExtraInfo(fullPost, idx);
                                        extraInfo._post = fullPost;
                                        realCard.extraInfo = extraInfo;
                                        
                                        // Categorize tags immediately since we have the full data
                                        gallery.categorizeTagsForCard(extraInfo, idx).catch(err => console.error('Failed to categorize tags for fav:', err));
                                        
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
                                            gallery.observer.observe(realCard);
                                            if (gallery._playbackObserver) {
                                                gallery._playbackObserver.observe(realCard);
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

        if (refreshBtn) refreshBtn.onclick = () => loadFavs.call(gallery);
        loadFavs.call(gallery);
    }

    static renderFavoritesPagination(gallery, totalCount, limit) {
        const paginationContainer = document.getElementById('pagination-container');
        if (!paginationContainer || !totalCount || totalCount <= limit) {
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(totalCount / limit);
        const currentPage = gallery.favoritesPage;
        paginationContainer.innerHTML = '';

        const createPageBtn = (pageNum, label, isActive = false) => {
            const btn = document.createElement('button');
            btn.className = isActive ? 'r34-pagination-btn active' : 'r34-pagination-btn';
            btn.textContent = label;
            btn.onclick = () => {
                if (gallery.favoritesPage === pageNum) return;
                gallery.favoritesPage = pageNum;
                window.scrollTo({ top: 0, behavior: 'smooth' });
                FavoritesManager.renderProfileFavorites(gallery);
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
}
