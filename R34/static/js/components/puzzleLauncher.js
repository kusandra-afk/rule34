import { lockPageScroll, releasePageScroll } from '../backgroundPause.js';
/**
 * Puzzle Game Launcher & Menu Component
 */

import { PuzzleGame } from './puzzleGame.js?v=2.5.6';
import { PuzzleOnlineManager } from './puzzleOnline.js?v=2.5.6';
import { loadResume, clearResume } from '../puzzle/resume.js';
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
            animation: pzFadeIn 0.2s ease-out;
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
            animation: pzSlideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
            box-shadow: 0 4px 15px var(--accent-glow);
        `;
        okBtn.onmouseover = () => {
            okBtn.style.transform = 'translateY(-2px)';
            okBtn.style.boxShadow = '0 6px 20px var(--accent-glow)';
        };
        okBtn.onmouseout = () => {
            okBtn.style.transform = 'translateY(0)';
            okBtn.style.boxShadow = '0 4px 15px var(--accent-glow)';
        };
        okBtn.onclick = () => {
            modal.style.animation = 'pzFadeOut 0.2s ease-out';
            modalContent.style.animation = 'pzSlideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            setTimeout(() => modal.remove(), 200);
        };
        
        modalContent.appendChild(okBtn);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        if (!document.getElementById('modal-animations')) {
            const style = document.createElement('style');
            style.id = 'modal-animations';
            style.textContent = `
                @keyframes pzFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes pzFadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes pzSlideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes pzSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(30px); opacity: 0; } }
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
        // Тост пазла переиспользует тот же #error, что и ошибки галереи
        // (GalleryController) — раньше здесь выставлялся инлайновый
        // style.display поверх класса .active. Инлайн-стиль побеждает любое
        // CSS-правило, так что после первого показа тоста ('display:none' в
        // конце) блок ошибок галереи переставал появляться вообще —
        // classList.add('active') в handleLoadError уже ничего не мог
        // перебить. Видимостью должен управлять только класс .active.
        const tempErr = document.getElementById('error');
        if (tempErr) {
            tempErr.classList.remove('rate-limit');
            tempErr.textContent = msg;
            tempErr.classList.add('active');
            setTimeout(() => {
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

    // Продолжение незаконченной сборки: та же картинка, та же сетка и те же
    // позиции деталей. Игра создаётся обычным путём, а снимок применяется в
    // момент, когда вступительная анимация закончилась (см. applyPendingResume).
    const startResumeGame = (snapshot) => {
        const post = snapshot && snapshot.post;
        if (!post) return;

        window.puzzleGameActive = true;
        if (getEligiblePosts().length < 15) {
            loadMorePostsForPuzzle();
        }

        const game = new PuzzleGame(post, null, async () => {
            window.activePuzzleGame = null;
            loadMorePostsForPuzzle();
        });
        window.activePuzzleGame = game;

        if (post.width && post.height) {
            game.aspectRatio = post.width / post.height;
        }
        game.targetPieces = snapshot.targetPieces || game.targetPieces;
        game.seamsSeed = snapshot.seamsSeed;
        game._pendingResume = snapshot;
        game.start();

        showPuzzleToast('Продолжаем незаконченный пазл', 2000);
    };

    const startGame = (currentPost) => {
        if (!currentPost) {
            showPuzzleToast("Не удалось найти подходящих медиа для пазла!", 4000);
            return;
        }
        
        window.puzzleGameActive = true;
        // Новая сборка заменяет сохранённую: продолжать старую уже не нужно.
        clearResume();

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

    const showModeMenu = () => {
        // Раньше здесь ждали fetchPuzzleCompleted() — это /api/puzzle-completed,
        // который на GET реально ходит в облачную Turso-БД и мёржит записи
        // (handlers/user_routes.py), а не просто читает локальный файл. Этот
        // раунд-трип нужен библиотеке пазлов (PuzzleUI.showCompletedModal),
        // где показывается точный список решённых пазлов с превью — а тут он
        // был нужен только ради одного числа (счётчик "решено") в меню выбора
        // режима, которое открывается при каждом входе в пазлы, а не только
        // при заходе в библиотеку. Локальный localStorage даёт то же число
        // мгновенно, без сети и без полноэкранного "Синхронизация с БД" —
        // настоящая синхронизация с Turso происходит один раз, когда
        // действительно открывается библиотека.
        let solvedCount = 0;
        try {
            const solvedIds = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]');
            solvedCount = solvedIds.length;
        } catch (e) {}

        // Анимации закрытия ниже (fadeOut/slideDown) ссылаются на @keyframes,
        // которые обычно приезжают вместе с загрузочным экраном библиотеки —
        // а меню теперь открывается без него, так что регистрируем их сами
        // при первом открытии меню, если их ещё нет на странице.
        if (!document.getElementById('puzzle-library-animations')) {
            const style = document.createElement('style');
            style.id = 'puzzle-library-animations';
            style.textContent = `
                @keyframes pzFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes pzFadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes pzSlideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes pzSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(30px); opacity: 0; } }
            `;
            document.head.appendChild(style);
        }

        const menuModal = document.createElement('div');
        menuModal.id = 'puzzle-mode-menu-modal';
        menuModal.className = 'game-overlay open pz-overlay';
        menuModal.setAttribute('role', 'dialog');
        menuModal.setAttribute('aria-modal', 'true');
        menuModal.setAttribute('aria-label', 'Puzzle menu');

        menuModal.innerHTML = `
            <div class="game-header game-header--pz-sm">
                <button class="pz-back" id="pzMenuBackBtn" title="Назад к выбору игр">
                    ${icon('arrowLeft', { size: 18 })}
                </button>
                <div class="game-title-group">
                    <div class="game-logo-icon game-logo-icon-puzzle">${icon('puzzle', { size: 20 })}</div>
                    <h2 class="game-app-title">Пазлы</h2>
                </div>
                <button class="game-close-btn" id="pzMenuCloseBtn" title="Закрыть">${icon('x', { size: 18 })}</button>
            </div>
        `;

        const card = document.createElement('div');
        card.className = 'game-card pz-menu-card';

        // Раньше это был один заголовок и две почти одинаковые плашки: сходу
        // нельзя было понять, чем онлайн отличается от одиночной игры, кроме
        // жёлтой нашлёпки «Бета». Теперь у каждого режима есть короткое
        // пояснение, что внутри, и подписанное действие внизу карточки.
        card.innerHTML = `
            <div class="pz-hero">
                <span class="game-hero-badge game-badge-gradient-primary">Интерактивная мини-игра</span>
                <h1 class="game-menu-title pz-hero-title">Соберите картинку из элементов</h1>
                <p class="pz-hero-desc">Пазл собирается из картинки, выбранной в галерее. Играйте сами или позовите друзей в общую комнату.</p>
            </div>

            <div class="pz-modes">
                <button type="button" class="pz-mode pz-mode--solo" id="pzStartSoloBtn">
                    <div class="pz-mode-head">
                        <span class="pz-mode-icon">${icon('gamepad', { size: 22 })}</span>
                        <span class="pz-mode-titles">
                            <span class="pz-mode-title">Одиночный режим</span>
                            <span class="pz-mode-sub">Без сети и таймера</span>
                        </span>
                    </div>
                    <p class="pz-mode-desc">Собирайте пазлы в своём темпе из любого выбранного арта в галерее.</p>
                    <div class="pz-mode-meta">
                        <span class="pz-mode-chip">Решено пазлов: <span id="pzSolvedCountValue">${solvedCount}</span></span>
                    </div>
                    <span class="pz-mode-cta">
                        <span>Играть</span>
                        ${icon('arrowRight', { size: 16 })}
                    </span>
                </button>

                <button type="button" class="pz-mode pz-mode--online" id="pzStartMultiplayerBtn">
                    <div class="pz-mode-head">
                        <span class="pz-mode-icon">${icon('users', { size: 22 })}</span>
                        <span class="pz-mode-titles">
                            <span class="pz-mode-title">Онлайн режим</span>
                            <span class="pz-mode-sub">С друзьями</span>
                        </span>
                        <span class="pz-mode-badge">Бета</span>
                    </div>
                    <p class="pz-mode-desc">Создайте комнату и соревнуйтесь в скорости или собирайте один пазл вместе.</p>
                    <div class="pz-mode-meta">
                        <span class="pz-mode-chip">До 8 игроков</span>
                        <span class="pz-mode-chip">Вход по коду</span>
                    </div>
                    <span class="pz-mode-cta">
                        <span>Создать комнату</span>
                        ${icon('arrowRight', { size: 16 })}
                    </span>
                </button>
            </div>

            <div id="pzKeyWarningTag" class="game-warning-tag">Нужен ключ Metered — он вводится в меню игр</div>
        `;

        menuModal.appendChild(card);
        document.body.appendChild(menuModal);

        // Незаконченная сборка из прошлого захода: предлагаем вернуться к ней
        // до выбора режима, чтобы она не терялась за новой игрой.
        const resumeSnapshot = loadResume();
        if (resumeSnapshot && resumeSnapshot.post) {
            const total = (resumeSnapshot.cols || 0) * (resumeSnapshot.rows || 0);
            const placed = total > 0
                ? resumeSnapshot.tiles.filter(tile => Number.isInteger(tile.pos) && tile.pos < total).length
                : 0;
            const resumeBar = document.createElement('button');
            resumeBar.type = 'button';
            resumeBar.className = 'pz-resume';
            resumeBar.id = 'pzResumeBtn';
            resumeBar.innerHTML = `
                <span class="pz-resume-icon">${icon('play', { size: 18 })}</span>
                <span class="pz-resume-text">
                    <b>Продолжить пазл</b>
                    <small>${placed} из ${total} деталей уже на месте</small>
                </span>
                <span class="pz-resume-cta">Продолжить ${icon('arrowRight', { size: 14 })}</span>
            `;
            const modesGrid = card.querySelector('.pz-modes');
            if (modesGrid) card.insertBefore(resumeBar, modesGrid);
            resumeBar.onclick = () => {
                closeMenu();
                startResumeGame(resumeSnapshot);
            };
        }
        // Меню полноэкранное: под ним страница не скроллится и не грузит
        // ленту, пока оно открыто.
        lockPageScroll();


        const closeMenu = () => {
            menuModal.style.animation = 'pzFadeOut 0.2s ease-out';
            card.style.animation = 'pzSlideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
            if (multiCheckInterval) clearInterval(multiCheckInterval);
            setTimeout(() => {
                menuModal.remove();
                releasePageScroll();
            }, 200);
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
                btn.innerHTML = `<div class="puzzle-loader-spinner puzzle-loader-spinner-light"></div> <span class="puzzle-loader-text">Загрузка галереи...</span>`;
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
                btn.innerHTML = `<div class="puzzle-loader-spinner puzzle-loader-spinner-light"></div> <span class="puzzle-loader-text">Поиск пазла...</span>`;
                btn.disabled = true;
                setTimeout(() => {
                    const post = getUnsolvedPost(null);
                    if (post) {
                        launch(post);
                    } else {
                        showPuzzleToast("Не удалось найти подходящий пазл!", 4000);
                        btn.innerHTML = originalHtml;
                        btn.disabled = false;
                    }
                }, 100);
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
