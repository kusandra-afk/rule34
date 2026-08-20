/**
 * Puzzle Game Launcher & Menu Component
 */

import { PuzzleGame } from './puzzleGame.js';
import { PuzzleOnlineManager } from './puzzleOnline.js';
import { fetchPuzzleCompleted } from '../api.js';
import { icon } from '../icons.js';
import { getSavedExcludedTags } from '../init/initServerSync.js';
import { openGameChoiceModal } from '../modals/gameChoiceModal.js';

export function startPuzzleGame() {
    // Check if video tag is in active tags before starting puzzle
    const activeTags = window.tagSearch ? window.tagSearch.activeTags.filter(t => t.active).map(t => t.value.toLowerCase()) : [];
    if (activeTags.includes('video')) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            animation: fadeIn 0.2s ease-out;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: var(--modal-bg, rgba(4, 5, 9, 0.72));
            color: white;
            padding: 30px 40px;
            border-radius: var(--radius-xl, 28px);
            font-size: 1.2rem;
            font-weight: 500;
            max-width: 500px;
            text-align: center;
            box-shadow: var(--shadow-lg);
            border: 1px solid var(--glass-border);
            backdrop-filter: blur(var(--glass-blur));
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        modalContent.textContent = "Уберите тэг 'video' из активных тэгов, чтобы играть в пазл!";
        
        const okBtn = document.createElement('button');
        okBtn.textContent = 'ОК';
        okBtn.style.cssText = `
            margin-top: 25px;
            padding: 12px 35px;
            background: var(--accent, #ff3b6b);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 15px rgba(255, 59, 107, 0.3);
        `;
        okBtn.onmouseover = () => {
            okBtn.style.transform = 'translateY(-2px)';
            okBtn.style.boxShadow = '0 6px 20px rgba(255, 59, 107, 0.4)';
        };
        okBtn.onmouseout = () => {
            okBtn.style.transform = 'translateY(0)';
            okBtn.style.boxShadow = '0 4px 15px rgba(255, 59, 107, 0.3)';
        };
        okBtn.onclick = () => {
            modal.style.animation = 'fadeOut 0.2s ease-out';
            modalContent.style.animation = 'slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            setTimeout(() => modal.remove(), 200);
        };
        
        modalContent.appendChild(okBtn);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        if (!document.getElementById('modal-animations')) {
            const style = document.createElement('style');
            style.id = 'modal-animations';
            style.textContent = `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(30px); opacity: 0; } }
            `;
            document.head.appendChild(style);
        }
        return;
    }
    
    const getEligiblePosts = () => {
        const isFavActive = window.gallery && window.gallery.isFavoritesActive;
        const allPosts = (window.gallery && Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts))
            ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
            : [];
        const isVideo = p => p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
        const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
        const isTooTall = p => {
            if (allowLong) return false;
            return p.width && p.height && (p.height / p.width > 2.8);
        };
        
        const inactiveTags = window.tagSearch ? window.tagSearch.activeTags.filter(t => !t.active).map(t => t.value.toLowerCase()) : [];
        const excludedTagsSet = new Set([...(getSavedExcludedTags() || []).map(t => t.toLowerCase()), ...inactiveTags]);

        return allPosts.filter(p => {
            if (!p || !p.file_url || isVideo(p) || isTooTall(p)) return false;
            
            if (p.tags) {
                const postTags = p.tags.split(' ').filter(Boolean).map(t => t.toLowerCase());
                const postTagsSet = new Set(postTags);
                
                // Check active (included) tags
                for (const t of activeTags) {
                    if (!postTagsSet.has(t)) {
                        return false;
                    }
                }
                
                // Check excluded tags
                for (const t of postTags) {
                    if (excludedTagsSet.has(t)) {
                        return false;
                    }
                }
            } else if (activeTags.length > 0) {
                return false;
            }
            
            return true;
        });
    };

    const loadMorePostsForPuzzle = async (forceLoad = false) => {
        if (!window.galleryController) return false;
        if (window.galleryController.loading || window.galleryController.reachedEnd) return false;
        const modeGalleryBtn = document.getElementById('modeGalleryBtn');
        if (modeGalleryBtn && !modeGalleryBtn.classList.contains('active')) {
            return false;
        }
        if (forceLoad) {
            window._forceLoadPosts = true;
        }
        window.galleryController.page++;
        try {
            const currentQuery = window.tagSearch ? window.tagSearch.getTagsQuery() : '';
            await window.galleryController.loadPosts(currentQuery, true);
            window._forceLoadPosts = false;
            return true;
        } catch (e) {
            console.error('Failed to load more posts for puzzle:', e);
            window._forceLoadPosts = false;
            return false;
        }
    };
    window.loadMorePostsForPuzzle = loadMorePostsForPuzzle;

    const showPuzzleToast = (msg, duration = 3500) => {
        const tempErr = document.getElementById('error');
        if (tempErr) {
            tempErr.textContent = msg;
            tempErr.style.display = 'block';
            tempErr.classList.add('active');
            setTimeout(() => {
                tempErr.style.display = 'none';
                tempErr.classList.remove('active');
            }, duration);
        }
    };

    const getUnsolvedPost = (excludePostId = null) => {
        const eligible = getEligiblePosts();
        let solvedIds = [];
        try {
            solvedIds = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]');
        } catch (err) {}
        
        let unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId);
        if (unsolved.length === 0) {
            unsolved = eligible.filter(p => p && p.id !== excludePostId);
        }
        if (unsolved.length === 0) {
            unsolved = eligible;
        }
        if (unsolved.length === 0) return null;
        const idx = Math.floor(Math.random() * unsolved.length);
        return unsolved[idx];
    };

    const startGame = (currentPost) => {
        if (!currentPost) {
            showPuzzleToast("Не удалось найти подходящих медиа для пазла!", 4000);
            return;
        }
        
        window.puzzleGameActive = true;
        
        if (getEligiblePosts().length < 15) {
            loadMorePostsForPuzzle();
        }

        const game = new PuzzleGame(currentPost, null, async () => {
            window.activePuzzleGame = null;
            loadMorePostsForPuzzle();
            
            const nextPost = getUnsolvedPost(currentPost ? currentPost.id : null);
            if (nextPost) {
                startGame(nextPost);
            } else {
                showPuzzleToast("Загружаем новые картинки...", 2500);
                const loadedMore = await loadMorePostsForPuzzle(true);
                const retryPost = getUnsolvedPost(currentPost ? currentPost.id : null);
                if (retryPost) {
                    startGame(retryPost);
                } else {
                    showPuzzleToast("В галерее больше нет подходящих картинок!", 4000);
                }
            }
        });
        window.activePuzzleGame = game;
        game.start();
    };

    const showModeMenu = async () => {
        // До сюда меню появлялось в DOM только ПОСЛЕ await fetchPuzzleCompleted() —
        // на плохом интернете это могло занять заметное время, а пользователь в
        // этот момент видел только исчезающее окно выбора игры и никакой
        // индикации, что что-то вообще происходит (можно было принять за баг).
        // Показываем загрузочный экран сразу — тот же, что уже используется
        // при открытии библиотеки пазлов (см. PuzzleUI.showCompletedModal),
        // чтобы не плодить второй, менее аккуратный вариант того же самого.
        const loadingModal = document.createElement('div');
        loadingModal.className = 'puzzle-loading-overlay keep-animation';
        const loadingContent = document.createElement('div');
        loadingContent.className = 'puzzle-loading-content keep-animation';
        loadingContent.innerHTML = `
            <div class="puzzle-loading-spinner keep-animation"></div>
            <div class="puzzle-loading-title">Загрузка пазлов...</div>
            <div class="puzzle-loading-subtext">Синхронизация с базой данных</div>
        `;
        loadingModal.appendChild(loadingContent);
        document.body.appendChild(loadingModal);

        if (!document.getElementById('puzzle-library-animations')) {
            const style = document.createElement('style');
            style.id = 'puzzle-library-animations';
            style.textContent = `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(30px); opacity: 0; } }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `;
            document.head.appendChild(style);
        }

        let solvedCount = 0;
        try {
            const completedPuzzles = await fetchPuzzleCompleted();
            solvedCount = Array.isArray(completedPuzzles) ? completedPuzzles.length : 0;
        } catch (err) {
            console.error('[Puzzle Menu] Failed to load completed puzzles library count, falling back:', err);
            try {
                const solvedIds = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]');
                solvedCount = solvedIds.length;
            } catch (e) {}
        }

        loadingModal.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => loadingModal.remove(), 200);

        const menuModal = document.createElement('div');
        menuModal.id = 'puzzle-mode-menu-modal';
        menuModal.className = 'game-overlay open';

        // Загрузочный экран сделал своё дело — дальше собирается настоящее
        // содержимое меню и целиком заменяет его (innerHTML ниже).
        menuModal.innerHTML = `
            <div class="game-header">
                <button class="game-back-btn" id="pzMenuBackBtn" title="Назад к выбору игр" style="background:none;border:none;color:#fff;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:12px;transition:background 0.2s;">
                    ${icon('arrowLeft', { size: 18 })}
                </button>
                <div class="game-title-group">
                    <div class="game-logo-icon game-logo-icon-puzzle">${icon('puzzle', { size: 20 })}</div>
                    <h2 class="game-app-title">Пазлы</h2>
                </div>
                <button class="game-close-btn" id="pzMenuCloseBtn" title="Закрыть">&times;</button>
            </div>
        `;

        const card = document.createElement('div');
        card.className = 'game-card';

        card.innerHTML = `
            <div class="game-menu-container">
                <span class="game-hero-badge game-badge-gradient-primary">Интерактивная Мини-Игра</span>
                <h1 class="game-menu-title">Соберите картинку из элементов!</h1>

                <!-- Выбор режима -->
                <div class="game-modes-grid">
                    <div class="game-mode-card primary-mode" id="pzStartSoloBtn">
                        <div class="game-mode-icon-circle">
                            ${icon('gamepad', { size: 24 })}
                        </div>
                        <h3 class="game-mode-title">Одиночный Режим</h3>
                        <p class="game-mode-subtitle">Собирайте пазлы в своём темпе из любого выбранного арта в галерее.</p>
                        <div class="game-mode-stat">Решено пазлов: <span id="pzSolvedCountValue">${solvedCount}</span></div>
                    </div>

                    <div class="game-mode-card multiplayer" id="pzStartMultiplayerBtn">
                        <div class="game-mode-icon-circle">
                            ${icon('users', { size: 24 })}
                        </div>
                        <h3 class="game-mode-title">Онлайн Бета</h3>
                        <p class="game-mode-subtitle">Создавайте комнаты и соревнуйтесь в скорости или собирайте вместе в реальном времени.</p>
                        <div class="game-mode-stat" style="color: #fcd34d; background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.3);">
                            Мультиплеер (до 15 чел.)
                        </div>
                    </div>
                </div>

                <div id="pzKeyWarningTag" class="game-warning-tag">ТРЕБУЕТСЯ API КЛЮЧ METERED.CA</div>
            </div>
        `;

        menuModal.appendChild(card);
        document.body.appendChild(menuModal);

        const closeMenu = () => {
            menuModal.style.animation = 'fadeOut 0.2s ease-out';
            card.style.animation = 'slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            if (multiCheckInterval) clearInterval(multiCheckInterval);
            setTimeout(() => menuModal.remove(), 200);
        };

        menuModal.querySelector('#pzMenuCloseBtn').onclick = closeMenu;
        const backBtn = menuModal.querySelector('#pzMenuBackBtn');
        if (backBtn) {
            backBtn.onclick = () => {
                closeMenu();
                openGameChoiceModal(startPuzzleGame);
            };
        }
        menuModal.onclick = (e) => {
            if (e.target === menuModal) closeMenu();
        };

        // Solo Mode Start
        menuModal.querySelector('#pzStartSoloBtn').onclick = (e) => {
            const btn = e.currentTarget;
            const originalHtml = btn.innerHTML;
            
            const launch = (post) => {
                closeMenu();
                startGame(post);
            };

            const initialEligible = getEligiblePosts();
            if (initialEligible.length === 0) {
                btn.innerHTML = `<div class="puzzle-loader-spinner" style="width:16px;height:16px;border-width:2px;border-top-color:#fff;border-right-color:transparent;border-radius:50%;animation:pzSpin 1s linear infinite;display:inline-block;vertical-align:middle;"></div> <span style="vertical-align:middle;margin-left:8px;">Загрузка галереи...</span>`;
                btn.disabled = true;
                showPuzzleToast("В галерее пусто, автоматически подгружаем картинки для пазла...", 4000);
                (async () => {
                    try {
                        const currentQuery = window.tagSearch ? window.tagSearch.getTagsQuery() : '';
                        if (window.galleryController) {
                            await window.galleryController.immediateLoadPosts(currentQuery, false);
                        }
                        const loadedEligible = getEligiblePosts();
                        if (loadedEligible.length > 0) {
                            launch(getUnsolvedPost(null));
                        } else {
                            showPuzzleToast("Не удалось найти подходящие картинки для пазла (видео и вертикальные пропускаются)!", 5000);
                            btn.innerHTML = originalHtml;
                            btn.disabled = false;
                        }
                    } catch (err) {
                        showPuzzleToast("Ошибка при загрузке картинок для пазла!", 4000);
                        btn.innerHTML = originalHtml;
                        btn.disabled = false;
                    }
                })();
            } else {
                launch(getUnsolvedPost(null));
            }
        };

        // Multiplayer Mode Start
        const multiBtn = menuModal.querySelector('#pzStartMultiplayerBtn');
        const warningTag = menuModal.querySelector('#pzKeyWarningTag');
        const updateMultiBtnState = () => {
            const key = localStorage.getItem('gameMeteredKey') || localStorage.getItem('hlMeteredKey');
            if (!key) {
                multiBtn.style.opacity = '0.5';
                multiBtn.style.filter = 'grayscale(1)';
                multiBtn.style.cursor = 'not-allowed';
                multiBtn.style.pointerEvents = 'none';
                multiBtn.title = 'Требуется API Ключ (введите в главном меню выбора игры)';
                if (warningTag) warningTag.style.display = 'block';
            } else {
                multiBtn.style.opacity = '1';
                multiBtn.style.filter = 'none';
                multiBtn.style.cursor = 'pointer';
                multiBtn.style.pointerEvents = 'auto';
                multiBtn.title = '';
                if (warningTag) warningTag.style.display = 'none';
            }
        };
        updateMultiBtnState();
        // Раньше очистка держалась на устаревшем Mutation Event 'DOMNodeRemoved'
        // (deprecated, современный Chrome может его не генерировать вовсе) —
        // из-за этого интервал мог тикать каждые 500мс до конца сессии, даже
        // после закрытия меню. Теперь чистится явно внутри closeMenu().
        const multiCheckInterval = setInterval(updateMultiBtnState, 500);

        multiBtn.onclick = (e) => {
            const key = localStorage.getItem('gameMeteredKey') || localStorage.getItem('hlMeteredKey');
            if (!key) {
                alert('Для онлайн-игры необходимо указать API Ключ Metered.ca в главном меню выбора игр.');
                return;
            }
            
            const btn = e.currentTarget;
            const originalHtml = btn.innerHTML;
            
            const launch = (post) => {
                closeMenu();
                const startMultiplayerGameFlow = (post) => {
                    window.puzzleGameActive = true;
                    if (getEligiblePosts().length < 15) {
                        loadMorePostsForPuzzle();
                    }

                    const game = new PuzzleGame(post, null, async () => {
                        window.activePuzzleGame = null;
                        loadMorePostsForPuzzle();
                        
                        const nextPost = getUnsolvedPost(post ? post.id : null);
                        if (nextPost) {
                            startGame(nextPost);
                        } else {
                            showPuzzleToast("Загружаем новые картинки...", 2500);
                            const loadedMore = await loadMorePostsForPuzzle(true);
                            const retryPost = getUnsolvedPost(post ? post.id : null);
                            if (retryPost) {
                                startGame(retryPost);
                            } else {
                                showPuzzleToast("В галерее больше нет подходящих картинок!", 4000);
                            }
                        }
                    });
                    window.activePuzzleGame = game;
                    
                    if (post && post.width && post.height) {
                        game.aspectRatio = post.width / post.height;
                    }
                    game.onlineManager = new PuzzleOnlineManager(game);
                    game.onlineManager.renderLobbySetupUI();
                };
                startMultiplayerGameFlow(post);
            };

            const initialEligible = getEligiblePosts();
            if (initialEligible.length === 0) {
                btn.innerHTML = `<div class="puzzle-loader-spinner" style="width:16px;height:16px;border-width:2px;border-top-color:#000;border-right-color:transparent;border-radius:50%;animation:pzSpin 1s linear infinite;display:inline-block;vertical-align:middle;"></div> <span style="vertical-align:middle;margin-left:8px;color:#000;">Загрузка галереи...</span>`;
                btn.disabled = true;
                showPuzzleToast("В галерее пусто, автоматически подгружаем картинки для пазла...", 4000);
                (async () => {
                    try {
                        const currentQuery = window.tagSearch ? window.tagSearch.getTagsQuery() : '';
                        if (window.galleryController) {
                            await window.galleryController.immediateLoadPosts(currentQuery, false);
                        }
                        const loadedEligible = getEligiblePosts();
                        if (loadedEligible.length > 0) {
                            launch(getUnsolvedPost(null));
                        } else {
                            showPuzzleToast("Не удалось найти подходящие картинки для пазла (видео и вертикальные пропускаются)!", 5000);
                            btn.innerHTML = originalHtml;
                            btn.disabled = false;
                        }
                    } catch (err) {
                        showPuzzleToast("Ошибка при загрузке картинок для пазла!", 4000);
                        btn.innerHTML = originalHtml;
                        btn.disabled = false;
                    }
                })();
            } else {
                launch(getUnsolvedPost(null));
            }
        };
    };

    showModeMenu();
}

window.openPuzzleMenu = startPuzzleGame;
