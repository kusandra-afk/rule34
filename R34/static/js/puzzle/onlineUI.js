import { icon } from '../icons.js';
import { makeCustomDropdown } from '../components/customDropdown.js';
import { fetchPostById } from '../api.js';

export class OnlineUI {
    static showToast(msg, type = 'info') {
        if (window.safeScreen && window.safeScreen.isActive) return;
        const colors = { success: '#10b981', danger: '#ef4444', info: '#3b82f6' };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
            background: ${colors[type] || '#3b82f6'}; color: #fff; font-weight: bold;
            padding: 12px 24px; border-radius: 12px; z-index: 10000000;
            box-shadow: 0 12px 32px rgba(0,0,0,0.5); font-size: 0.95rem;
            opacity: 1; transition: all 0.3s ease;
            pointer-events: none; text-align: center;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -15px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    static closeLobbyModal() {
        const existing = document.getElementById('puzzle-online-modal');
        if (existing) existing.remove();
    }

    static renderLobbyUI(onlineMgr) {
        OnlineUI.closeLobbyModal();
        if (onlineMgr.game && onlineMgr.game.card) {
            onlineMgr.game.card.style.display = 'none';
        }

        const modal = document.createElement('div');
        modal.id = 'puzzle-online-modal';
        modal.className = 'game-overlay open';

        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.maxWidth = '580px';

        const previewUrl = onlineMgr.roomData?.postUrl || (onlineMgr.roomData?.post ? (onlineMgr.roomData.post.sample_url || onlineMgr.roomData.post.preview_url || onlineMgr.roomData.post.file_url) : '') || (onlineMgr.game.post ? (onlineMgr.game.post.sample_url || onlineMgr.game.post.preview_url || onlineMgr.game.post.file_url) : '');

        const currentPost = onlineMgr.roomData?.post || onlineMgr.game?.post || null;
        const currentPostId = currentPost ? currentPost.id : '';

        const baseTargets = [16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 256, 324, 400];
        const diffs = [];
        const seenSizes = new Set();
        baseTargets.forEach(target => {
            const { cols: c, rows: r } = onlineMgr.game.calculateGrid(target, onlineMgr.game.aspectRatio || 1.0);
            const exactPieces = c * r;
            const sizeKey = `${c}x${r}`;
            if (!seenSizes.has(sizeKey)) {
                seenSizes.add(sizeKey);
                diffs.push({ target, exactPieces, c, r });
            }
        });

        const defaultTarget = onlineMgr.roomData?.targetPieces || onlineMgr.game.targetPieces || 36;
        let selectedDiff = diffs.find(d => d.target === defaultTarget) || diffs.find(d => d.target >= 36) || diffs[2];
        const optionsHtml = diffs.map(d => `<option value="${d.target}" style="background:#111;" ${d.target === selectedDiff.target ? 'selected' : ''}>${d.exactPieces} деталей (${d.c}x${d.r})</option>`).join('');

        modal.innerHTML = `
            <div class="game-header">
                <div class="game-title-group">
                    <div class="game-logo-icon game-logo-icon-puzzle">${icon('puzzle', { size: 20 })}</div>
                    <h2 class="game-app-title">${onlineMgr.isHost ? 'Лобби Хоста' : 'Комната Мультиплеера'} <span style="font-size: 0.65em; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 8px; font-weight: 800; vertical-align: middle; margin-left: 6px;">БЕТА</span></h2>
                </div>
                <button class="game-close-btn" id="pzOnlineCloseBtn" title="Закрыть">&times;</button>
            </div>
        `;

        card.innerHTML = `
            <div class="game-menu-container" style="gap: 16px;">
                <span class="game-hero-badge game-badge-gradient-secondary">
                    ${onlineMgr.isHost ? 'Вы — Организатор (Хост)' : 'Вы подключились к комнате'} • ${onlineMgr.roomData?.mode === 'coop' ? 'Совместный сбор' : 'Гонка на скорость'}
                </span>

                <h1 class="game-menu-title" style="font-size: 1.75rem;">${onlineMgr.isHost ? 'Лобби Комнаты' : 'Подключение к Комнате'}</h1>

                <div class="game-room-header-card game-room-card" style="width: 100%;">
                    <div style="text-align: left;">
                        <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">КОД КОМНАТЫ:</div>
                        <div class="game-room-code-val" style="color: #fbbf24; margin-top: 2px;">${onlineMgr.roomId}</div>
                    </div>
                    <button id="pzCopyCodeBtn" class="game-btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; min-width: auto; gap: 6px;">
                        ${icon('clipboard', { size: 14 })} Копировать
                    </button>
                </div>

                <div class="game-form-box" style="width: 100%;">
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left;">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); font-weight: bold; width: 100%; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                ${currentPostId ? `
                                    <span id="pzPuzzleIdPill" style="cursor: pointer; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 2px 6px; font-family: monospace; font-size: 0.75rem; color: #fbbf24; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px; vertical-align: middle;" title="Кликните, чтобы скопировать ID">
                                        ID ${currentPostId}
                                    </span>
                                ` : `
                                    <span id="pzPuzzleIdPill" style="cursor: pointer; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 2px 6px; font-family: monospace; font-size: 0.75rem; color: #fbbf24; transition: all 0.2s; display: none; align-items: center; gap: 4px; vertical-align: middle;" title="Кликните, чтобы скопировать ID">
                                    </span>
                                `}
                                <span style="display:flex; align-items:center; gap:6px;">${icon('image', { size: 14 })} Выбранный пазл:</span>
                            </div>
                            ${onlineMgr.isHost ? `
                                <button id="pzSkipPuzzleBtn" class="game-btn-secondary" style="padding: 4px 10px; font-size: 0.75rem; min-width: auto; height: auto;">
                                    ${icon('refresh', { size: 12 })} Пропустить
                                </button>
                            ` : `
                                <span style="font-size: 0.75rem; color: var(--accent, #a78bfa);" id="pzPiecesInfoText">${onlineMgr.roomData?.targetPieces || 36} деталей</span>
                            `}
                        </div>
                        <div id="pzPreviewImg" class="game-preview-img" style="background-image: url('${previewUrl}');"></div>

                        ${onlineMgr.isHost ? `
                            <div style="display:flex; gap:8px; width:100%; margin-top:4px;">
                                <input type="text" id="pzHostIdInput" class="game-input" placeholder="Поиск по ID (например, 10142981)" style="flex:1; font-size:0.85rem; padding:8px 12px; text-align:center;" />
                                <button id="pzHostIdLoadBtn" class="game-btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; min-width: auto;">Найти</button>
                            </div>

                            <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                                <label class="game-form-label" style="font-size: 0.8rem;">Количество деталей:</label>
                                <select id="pzPiecesSelect" class="game-input" style="font-weight: bold; cursor: pointer; font-size: 0.85rem; padding: 8px 12px; background: rgba(255, 255, 255, 0.06);">
                                    ${optionsHtml}
                                </select>
                            </div>
                        ` : ''}
                    </div>

                    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;">

                    <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left;">
                        <div class="game-form-label" style="font-size: 0.85rem;">
                            Участники (<span id="pzPlayerCount">1</span>/${onlineMgr.roomData.maxPlayers}):
                        </div>
                        <div id="pzPlayerList" class="game-leaderboard game-player-list" style="display: flex; flex-direction: column; gap: 6px; width: 100%; max-height: 140px; overflow-y: auto; box-sizing: border-box; padding: 10px;"></div>
                    </div>

                    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;">

                    <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; text-align: left;">
                        <div style="font-size: 0.72rem; font-weight: 700; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">Логи:</div>
                        <div id="puzzle-sync-logs" class="game-sync-logs">
                            Ожидание игроков...
                        </div>
                    </div>

                    <div style="width: 100%; margin-top: 6px;">
                        ${onlineMgr.isHost ? `
                            <button id="pzStartGameBtn" class="game-btn-primary game-start-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                ${icon('sparkles', { size: 16 })} НАЧАТЬ ИГРУ
                            </button>
                        ` : `
                            <div class="game-waiting-indicator" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                                ${icon('hourglass', { size: 16 })} Ожидание запуска игры организатором...
                            </div>
                        `}
                    </div>
                </div>

                <button class="game-btn-secondary game-back-btn" id="pzLeaveRoomBtn" style="margin-top: 12px; width: 100%;">
                    ${icon('arrowLeft', { size: 14 })} Выйти из комнаты
                </button>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        const handleLeaveToSetup = () => {
            onlineMgr.leaveRoom();
            OnlineUI.renderLobbySetupUI(onlineMgr);
        };

        const pzHeaderBackBtn = document.getElementById('pzHeaderBackBtn');
        if (pzHeaderBackBtn) pzHeaderBackBtn.onclick = handleLeaveToSetup;

        const pzLeaveRoomBtn = document.getElementById('pzLeaveRoomBtn');
        if (pzLeaveRoomBtn) pzLeaveRoomBtn.onclick = handleLeaveToSetup;

        document.getElementById('pzOnlineCloseBtn').onclick = () => onlineMgr.leaveRoom();
        document.getElementById('pzCopyCodeBtn').onclick = () => {
            navigator.clipboard.writeText(onlineMgr.roomId);
            OnlineUI.showToast('Код комнаты скопирован!', 'success');
        };

        const puzzleIdPill = document.getElementById('pzPuzzleIdPill');
        if (puzzleIdPill) {
            puzzleIdPill.onclick = () => {
                const currentPost = onlineMgr.roomData?.post || onlineMgr.game?.post;
                if (currentPost && currentPost.id) {
                    navigator.clipboard.writeText(currentPost.id.toString());
                    OnlineUI.showToast(`ID пазла ${currentPost.id} скопирован!`, 'success');
                }
            };
        }

        if (onlineMgr.isHost) {
            document.getElementById('pzStartGameBtn').onclick = () => onlineMgr.hostStartGame();

            const piecesSelect = document.getElementById('pzPiecesSelect');
            if (piecesSelect) {
                makeCustomDropdown(piecesSelect);
                piecesSelect.onchange = () => {
                    onlineMgr.roomData.targetPieces = parseInt(piecesSelect.value, 10);
                    onlineMgr.roomData.seamsSeed = Math.floor(Math.random() * 1000000000);
                    onlineMgr.broadcastRoomData();
                };
            }

            const skipBtn = document.getElementById('pzSkipPuzzleBtn');
            if (skipBtn) {
                skipBtn.onclick = async () => {
                    if (!window.gallery) return;
                    const isFavActive = window.gallery.isFavoritesActive;
                    const allPosts = Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                        ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                        : [];
                        
                    const isVideo = p => p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
                    const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
                    const isTooTall = p => {
                        if (allowLong) return false;
                        return p.width && p.height && (p.height / p.width > 2.8);
                    };
                    let eligible = allPosts.filter(p => !isVideo(p) && !isTooTall(p));
                    
                    let solvedIds = [];
                    try { solvedIds = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]'); } catch (err) {}
                    
                    const excludePostId = onlineMgr.roomData.post ? onlineMgr.roomData.post.id : null;
                    if (excludePostId) {
                        onlineMgr.skippedPuzzleIds.add(excludePostId);
                    }

                    let unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId && !onlineMgr.skippedPuzzleIds.has(p.id));
                    
                    if (unsolved.length === 0 && typeof window.loadMorePostsForPuzzle === 'function') {
                        OnlineUI.showToast('Загружаем новые картинки...', 'info');
                        const loadedMore = await window.loadMorePostsForPuzzle(true);
                        if (loadedMore) {
                            const freshPosts = Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                                ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                                : [];
                            eligible = freshPosts.filter(p => !isVideo(p) && !isTooTall(p));
                            unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId && !onlineMgr.skippedPuzzleIds.has(p.id));
                        }
                    }

                    if (unsolved.length === 0) {
                        onlineMgr.skippedPuzzleIds.clear();
                        if (excludePostId) onlineMgr.skippedPuzzleIds.add(excludePostId);
                        unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId);
                    }
                    if (unsolved.length === 0) {
                        unsolved = eligible.filter(p => p && p.id !== excludePostId);
                    }
                    if (unsolved.length === 0) {
                        unsolved = eligible;
                    }

                    if (unsolved.length === 0) {
                        OnlineUI.showToast('Нет других подходящих картинок!', 'warning');
                        return;
                    }

                    const nextPost = unsolved[Math.floor(Math.random() * unsolved.length)];
                    onlineMgr.roomData.post = nextPost;
                    let ratio = 1.0;
                    if (nextPost.width && nextPost.height && nextPost.width > 0 && nextPost.height > 0) {
                        ratio = nextPost.width / nextPost.height;
                    }
                    const newAspectRatio = allowLong ? Math.max(0.05, Math.min(20.0, ratio)) : Math.max(0.4, Math.min(1.8, ratio));
                    onlineMgr.game.aspectRatio = newAspectRatio;
                    onlineMgr.roomData.aspectRatio = newAspectRatio;
                    const newPreviewUrl = nextPost.sample_url || nextPost.preview_url || nextPost.file_url;
                    onlineMgr.roomData.postUrl = newPreviewUrl;
                    onlineMgr.roomData.seamsSeed = Math.floor(Math.random() * 1000000000);

                    const previewImg = document.getElementById('pzPreviewImg');
                    if (previewImg) {
                        previewImg.style.backgroundImage = `url('${newPreviewUrl}')`;
                    }
                    OnlineUI.updateHostPiecesDropdown(onlineMgr);
                    onlineMgr.broadcastRoomData();
                    OnlineUI.showToast('Пазл изменен организатором!', 'success');
                };
            }

            const idInput = document.getElementById('pzHostIdInput');
            const idLoadBtn = document.getElementById('pzHostIdLoadBtn');
            if (idInput && idLoadBtn) {
                idLoadBtn.onclick = async () => {
                    const rawId = idInput.value.trim();
                    if (!rawId) {
                        OnlineUI.showToast('Введите ID поста!', 'danger');
                        return;
                    }
                    idLoadBtn.disabled = true;
                    idLoadBtn.textContent = '...';
                    try {
                        const post = await fetchPostById(rawId);
                        if (post && post.file_url) {
                            const isVideo = p => p && p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
                            if (isVideo(post)) {
                                OnlineUI.showToast('Это видео (нельзя для пазла)!', 'danger');
                                return;
                            }
                            onlineMgr.roomData.post = post;
                            const newPreviewUrl = post.sample_url || post.preview_url || post.file_url;
                            onlineMgr.roomData.postUrl = newPreviewUrl;
                            onlineMgr.roomData.seamsSeed = Math.floor(Math.random() * 1000000000);
                            
                            let ratio = 1.0;
                            if (post.width && post.height && post.width > 0 && post.height > 0) {
                                ratio = post.width / post.height;
                            }
                            const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
                            const newAspectRatio = allowLong ? Math.max(0.05, Math.min(20.0, ratio)) : Math.max(0.35, Math.min(1.8, ratio));
                            onlineMgr.game.aspectRatio = newAspectRatio;
                            onlineMgr.roomData.aspectRatio = newAspectRatio;

                            const previewImg = document.getElementById('pzPreviewImg');
                            if (previewImg) {
                                previewImg.style.backgroundImage = `url('${newPreviewUrl}')`;
                            }
                            OnlineUI.updateHostPiecesDropdown(onlineMgr);
                            onlineMgr.broadcastRoomData();
                            idInput.value = '';
                            OnlineUI.showToast('Пазл успешно загружен по ID!', 'success');
                        } else {
                            OnlineUI.showToast('Пост с таким ID не найден!', 'danger');
                        }
                    } catch (err) {
                        OnlineUI.showToast('Ошибка загрузки по ID', 'danger');
                    } finally {
                        idLoadBtn.disabled = false;
                        idLoadBtn.textContent = 'Найти';
                    }
                };
                idInput.onkeydown = (e) => {
                    if (e.key === 'Enter') idLoadBtn.click();
                };
            }
        }

        OnlineUI.updateLobbyPlayerList(onlineMgr);
    }

    static renderLobbySetupUI(onlineMgr) {
        OnlineUI.closeLobbyModal();
        if (onlineMgr.game && onlineMgr.game.card) {
            onlineMgr.game.card.style.display = 'none';
        }

        const modal = document.createElement('div');
        modal.id = 'puzzle-online-modal';
        modal.className = 'game-overlay open';

        const card = document.createElement('div');
        card.className = 'game-card-setup';

        modal.innerHTML = `
            <div class="game-header">
                <div class="game-title-group">
                    <div class="game-logo-icon game-logo-icon-puzzle">${icon('puzzle', { size: 20 })}</div>
                    <h2 class="game-app-title">Онлайн Режим <span style="font-size: 0.65em; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 8px; font-weight: 800; vertical-align: middle; margin-left: 6px;">БЕТА</span></h2>
                </div>
                <button class="game-close-btn" id="pzSetupCloseBtn" title="Закрыть">&times;</button>
            </div>
        `;

        card.innerHTML = `
            <div class="game-menu-container-compact">
                <span class="game-hero-badge game-badge-gradient-secondary">Интерактивный Онлайн</span>

                <h1 class="game-menu-title" style="font-size: 1.75rem;">Мультиплеерные Комнаты</h1>

                <div class="game-form-box">
                    ${!localStorage.getItem('gameMeteredKey') && !localStorage.getItem('hlMeteredKey') ? `
                    <div style="background: rgba(245, 158, 11, 0.1); border: 1px dashed rgba(245, 158, 11, 0.4); padding: 12px; border-radius: 12px; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px;">
                        <span style="font-size: 1.2rem;">⚠️</span>
                        <div style="font-size: 0.8rem; color: #f59e0b; line-height: 1.4; text-align: left;">
                            <b>Ключ Metered не установлен.</b> Онлайн может работать нестабильно или не работать вовсе. Рекомендуется настроить ключ в главном меню (5 кликов по заголовку).
                        </div>
                    </div>
                    ` : ''}
                    <div class="game-form-field">
                        <label class="game-form-label" style="display: flex; align-items: center; gap: 6px;">${icon('user', { size: 14 })} Твое Имя / Никнейм:</label>
                        <input type="text" id="pzNickInput" class="game-input" value="${onlineMgr.playerName}" placeholder="Введите ваш ник..." maxlength="20">
                    </div>

                    <hr class="game-form-divider">

                    <div class="game-form-group">
                        <label class="game-form-label">Присоединиться к комнате:</label>
                        <div class="game-form-row">
                            <input type="text" id="pzJoinCodeInput" class="game-input game-code-input" placeholder="5-значный код (напр. BFTZK)" maxlength="5">
                            <button class="game-btn-primary" id="pzJoinRoomBtn" style="min-width: auto; padding: 10px 18px;">${icon('arrowRight', { size: 16 })} Войти</button>
                        </div>
                    </div>

                    <hr class="game-form-divider">

                    <div class="game-form-group">
                        <label class="game-form-label">Создать новую комнату:</label>
                        
                        <div style="display: flex; flex-direction: column; gap: 8px; text-align: left;">
                            <label class="game-form-label" style="font-size: 0.85rem;">Режим Мультиплеера:</label>
                            <div class="game-category-pills" style="width: 100%;">
                                <div id="pzModeRaceBtn" class="game-cat-pill game-pills-row active">
                                    ${icon('zap', { size: 14 })} Гонка (Кто быстрее)
                                </div>
                                <div id="pzModeCoopBtn" class="game-cat-pill game-pills-row">
                                    ${icon('users', { size: 14 })} Совместный сбор
                                </div>
                            </div>
                        </div>

                        <button id="pzCreateRoomBtn" class="game-btn-primary game-create-btn">
                            ${icon('sparkles', { size: 16 })} Создать Комнату
                        </button>
                    </div>
                </div>

                <button class="game-btn-secondary game-back-btn" id="pzBackMenuBtn">
                    ${icon('arrowLeft', { size: 14 })} Назад в меню
                </button>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        let selectedMode = 'race';

        const nickInput = document.getElementById('pzNickInput');
        nickInput.oninput = () => {
            onlineMgr.setPlayerName(nickInput.value);
        };

        const modeRaceBtn = document.getElementById('pzModeRaceBtn');
        const modeCoopBtn = document.getElementById('pzModeCoopBtn');

        modeRaceBtn.onclick = () => {
            selectedMode = 'race';
            modeRaceBtn.classList.add('active');
            modeCoopBtn.classList.remove('active');
        };

        modeCoopBtn.onclick = () => {
            selectedMode = 'coop';
            modeCoopBtn.classList.add('active');
            modeRaceBtn.classList.remove('active');
        };

        const closeSetup = () => {
            if (onlineMgr.game) {
                onlineMgr.game.destroy();
            }
            modal.remove();
        };

        const goBackToMenu = () => {
            if (onlineMgr.game) {
                onlineMgr.game.destroy();
            }
            modal.remove();
            if (typeof window.openPuzzleMenu === 'function') {
                window.openPuzzleMenu();
            }
        };

        const pzHeaderBackBtn = document.getElementById('pzHeaderBackBtn');
        if (pzHeaderBackBtn) pzHeaderBackBtn.onclick = goBackToMenu;
        document.getElementById('pzBackMenuBtn').onclick = goBackToMenu;
        document.getElementById('pzSetupCloseBtn').onclick = closeSetup;

        document.getElementById('pzCreateRoomBtn').onclick = () => {
            onlineMgr.createRoom({ mode: selectedMode, targetPieces: 36, maxPlayers: 8 });
        };

        document.getElementById('pzJoinRoomBtn').onclick = () => {
            const code = document.getElementById('pzJoinCodeInput').value.trim();
            if (!code) {
                OnlineUI.showToast('Введите код комнаты!', 'danger');
                return;
            }
            onlineMgr.joinRoom(code);
        };
    }

    static updateHostPiecesDropdown(onlineMgr) {
        const piecesSelect = document.getElementById('pzPiecesSelect');
        if (!piecesSelect) return;
        const baseTargets = [16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 256, 324, 400];
        const diffs = [];
        const seenSizes = new Set();
        baseTargets.forEach(target => {
            const { cols: c, rows: r } = onlineMgr.game.calculateGrid(target, onlineMgr.game.aspectRatio || 1.0);
            const exactPieces = c * r;
            const sizeKey = `${c}x${r}`;
            if (!seenSizes.has(sizeKey)) {
                seenSizes.add(sizeKey);
                diffs.push({ target, exactPieces, c, r });
            }
        });
        const defaultTarget = onlineMgr.roomData.targetPieces || 36;
        let selectedDiff = diffs.find(d => d.target === defaultTarget) || diffs.find(d => d.target >= 36) || diffs[2];
        if (selectedDiff) {
            onlineMgr.roomData.targetPieces = selectedDiff.target;
        }
        piecesSelect.innerHTML = diffs.map(d => `<option value="${d.target}" style="background:#111;" ${d.target === selectedDiff?.target ? 'selected' : ''}>${d.exactPieces} деталей (${d.c}x${d.r})</option>`).join('');
    }

    static updateLobbyPlayerList(onlineMgr) {
        const playerList = document.getElementById('pzPlayerList');
        const playerCount = document.getElementById('pzPlayerCount');
        if (!playerList || !onlineMgr.roomData) return;

        const players = Object.values(onlineMgr.roomData.players || {});
        if (playerCount) playerCount.textContent = players.length;

        playerList.innerHTML = players.map(p => `
            <div class="game-player-row" style="width: 100%; box-sizing: border-box;">
                <div class="game-player-name">
                    ${p.isHost ? icon('crown', { size: 16, className: 'game-host-crown' }) : icon('user', { size: 16 })} 
                    <span>${p.name}</span> 
                    ${p.id === onlineMgr.playerId ? '<small style="color: var(--accent, #a78bfa);">(Вы)</small>' : ''}
                </div>
                <div class="game-player-status game-status-done">
                    Готов
                </div>
            </div>
        `).join('');
    }

    static updateLobbyPuzzleIdPill(onlineMgr) {
        const pill = document.getElementById('pzPuzzleIdPill');
        if (!pill) return;
        const currentPost = onlineMgr.roomData?.post || onlineMgr.game?.post || null;
        if (currentPost && currentPost.id) {
            pill.textContent = `ID ${currentPost.id}`;
            pill.style.display = 'inline-flex';
        } else {
            pill.style.display = 'none';
        }
    }

    static renderSyncScreen(onlineMgr, title, subtitle) {
        OnlineUI.closeLobbyModal();
        if (onlineMgr.game && onlineMgr.game.card) {
            onlineMgr.game.card.style.display = 'none';
        }

        const modal = document.createElement('div');
        modal.id = 'puzzle-online-modal';
        modal.className = 'game-overlay open';

        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.maxWidth = '440px';

        card.innerHTML = `
            <div class="game-menu-container" style="gap: 20px; padding: 10px;">
                <div class="puzzle-loader-spinner" style="width: 48px; height: 48px; margin: 0; border: 4px solid rgba(255, 255, 255, 0.1); border-top: 4px solid var(--accent, #a78bfa); border-radius: 50%; animation: pzSpin 1s linear infinite;"></div>
                <h2 class="game-menu-title" style="font-size: 1.5rem; margin: 0;">${title}</h2>
                <p class="game-menu-desc" style="font-size: 0.9rem; color: rgba(255,255,255,0.7);">${subtitle}</p>
                <div id="puzzle-sync-logs" style="width: 100%; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 10px 14px; font-family: monospace; font-size: 0.72rem; color: #888; height: 80px; overflow-y: auto; text-align: left; box-sizing: border-box;"></div>
                <button id="pzCancelSyncBtn" class="game-btn-secondary" style="width: 100%; padding: 10px 16px;">Отмена</button>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        document.getElementById('pzCancelSyncBtn').onclick = () => onlineMgr.leaveRoom();
    }

    static renderOnlineHUD(onlineMgr) {
        const hudContainer = document.getElementById('puzzle-online-hud');
        if (hudContainer) hudContainer.remove();

        const card = onlineMgr.game.card;
        if (!card) return;

        const hud = document.createElement('div');
        hud.id = 'puzzle-online-hud';
        hud.style.cssText = `
            width: 100%; background: linear-gradient(135deg, rgba(20,20,35,0.9), rgba(30,30,50,0.9));
            border: 1px solid rgba(139,92,246,0.3); border-radius: 12px;
            padding: 8px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px;
            flex-wrap: wrap; margin-bottom: 6px; box-sizing: border-box;
        `;

        if (onlineMgr.gameMode === 'race') {
            hud.innerHTML = `
                <div style="font-size:0.8rem; font-weight:bold; color:var(--accent, #a78bfa); display:flex; align-items:center; gap:6px;">
                    🏁 Гонка на скорость (${onlineMgr.roomId})
                </div>
                <div id="pzRaceLeaderboardBars" style="display:flex; align-items:center; gap:12px; flex:1; overflow-x:auto;"></div>
            `;
        } else {
            hud.innerHTML = `
                <div style="font-size:0.8rem; font-weight:bold; color:var(--accent, #a78bfa); display:flex; align-items:center; gap:6px;">
                    🤝 Совместная сборка (${onlineMgr.roomId})
                </div>
                <div id="pzCoopStatusText" style="font-size:0.85rem; font-weight:bold; color:#38bdf8;">
                    Собрано всей командой: 0%
                </div>
            `;
        }

        const leftPanel = card.querySelector('.puzzle-left-panel');
        if (leftPanel) {
            leftPanel.insertBefore(hud, leftPanel.children[1] || null);
        }

        OnlineUI.updateOnlineHUD(onlineMgr);
    }

    static updateOnlineHUD(onlineMgr) {
        if (!onlineMgr.inGame || !onlineMgr.roomData) return;

        if (onlineMgr.gameMode === 'race') {
            const container = document.getElementById('pzRaceLeaderboardBars');
            if (!container) return;

            const players = Object.values(onlineMgr.roomData.players || {});
            container.innerHTML = players.map(p => {
                const isMe = p.id === onlineMgr.playerId;
                const pct = p.progressPct || 0;
                return `
                    <div style="display:flex; flex-direction:column; gap:2px; min-width:110px; flex:1; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px; border:${isMe ? '1px solid #38bdf8' : '1px solid transparent'};">
                        <div style="display:flex; justify-content:space-between; font-size:0.72rem; font-weight:bold; color:${isMe ? '#38bdf8' : '#fff'};">
                            <span>${p.name}</span>
                            <span>${pct}%</span>
                        </div>
                        <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:linear-gradient(90deg,var(--accent, #8b5cf6),var(--accent-alt, #ec4899)); transition:width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        } else if (onlineMgr.gameMode === 'coop') {
            const coopStatus = document.getElementById('pzCoopStatusText');
            if (coopStatus && onlineMgr.game) {
                const progress = onlineMgr.game.getConnectionProgress();
                const pct = progress.pct;
                coopStatus.textContent = `Собрано всей командой: ${progress.connected} / ${progress.total} (${pct}%)`;
            }
        }
    }

    static renderLeaderboardModal(onlineMgr, winData) {
        const modal = document.createElement('div');
        modal.id = 'puzzle-online-modal';
        modal.className = 'puzzle-overlay';
        modal.style.cssText = `
            position: fixed; top:0; left:0; width:100vw; height:100dvh;
            background: rgba(8,8,16,0.95); backdrop-filter: blur(12px);
            z-index: 60000; display:flex; align-items:center; justify-content:center; padding:20px;
        `;

        const card = document.createElement('div');
        card.style.cssText = `
            background: linear-gradient(145deg, rgba(25,25,45,0.95), rgba(15,15,30,0.98));
            border: 1px solid ${onlineMgr.gameMode === 'coop' ? 'rgba(56,189,248,0.5)' : 'rgba(16,185,129,0.5)'}; border-radius: 20px;
            width: 100%; max-width: 460px; padding: 24px; color: #fff;
            box-shadow: 0 16px 40px rgba(0,0,0,0.6); display:flex; flex-direction:column; gap:16px; align-items:center; text-align:center;
        `;

        const rawTime = winData?.time !== undefined ? winData.time : 0;
        const timeStr = onlineMgr.game && typeof onlineMgr.game.formatTime === 'function' ? onlineMgr.game.formatTime(rawTime) : '00:00';

        if (onlineMgr.gameMode === 'coop') {
            const players = Object.values(onlineMgr.roomData?.players || {}).sort((a,b) => (b.placedCount || 0) - (a.placedCount || 0));
            const totalMoves = players.reduce((acc, p) => acc + (p.moves || 0), 0);
            
            card.innerHTML = `
                <div style="font-size:2.5rem;">🤝</div>
                <div style="font-size:1.4rem; font-weight:900; color:#38bdf8;">ОБЩАЯ ПОБЕДА!</div>
                <div style="font-size:0.9rem; color:#aaa;">Пазл полностью собран всей командой за <b style="color:#fff;">${timeStr}</b>!</div>
                
                <div style="font-size:0.8rem; color:#94a3b8; margin-top:-4px;">Всего сделано ходов: <b>${totalMoves}</b></div>

                <div style="width:100%; text-align:left; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; margin-bottom:-4px; font-weight:bold; padding-left:4px;">Вклад участников:</div>
                <div style="width:100%; display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto; padding-right:2px;">
                    ${players.map((p) => `
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.06); padding:8px 12px; border-radius:8px;">
                            <div style="display:flex; align-items:center; gap:8px; font-weight:bold; font-size:0.85rem;">
                                <span>👤</span> <span>${p.name}</span>
                            </div>
                            <div style="font-weight:bold; font-size:0.85rem; color:#38bdf8; text-align:right;">
                                Собрано деталей: <span style="color:#fff;">${p.placedCount || 0}</span>
                                <span style="font-size:0.75rem; color:#94a3b8; font-weight:normal; margin-left:4px;">(${p.moves || 0} ходов)</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div style="width:100%; display:flex; flex-direction:column; gap:10px; margin-top: 8px;">
                    ${onlineMgr.isHost ? `
                        <button id="pzReturnToLobbyBtn" style="width:100%; padding:12px; background:linear-gradient(135deg,#38bdf8,#0284c7); border:none; border-radius:10px; color:#fff; font-weight:bold; font-size:0.95rem; cursor:pointer; transition: opacity 0.2s;">
                            Вернуться в лобби
                        </button>
                    ` : `
                        <div id="pzWaitingForLobbyMsg" style="font-size:0.85rem; color:#94a3b8; text-align:center; padding: 4px 0; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <div class="puzzle-loader-spinner" style="width:12px;height:12px;border-width:1.5px;border-top-color:var(--accent,#8b5cf6);border-right-color:transparent;border-radius:50%;animation:pzSpin 1s linear infinite;"></div>
                            Ожидание возвращения в лобби...
                        </div>
                    `}
                    <button id="pzFinishOnlineBtn" style="width:100%; padding:12px; background:linear-gradient(135deg,#ef4444,#dc2626); border:none; border-radius:10px; color:#fff; font-weight:bold; font-size:0.95rem; cursor:pointer; transition: opacity 0.2s;">
                        Покинуть комнату
                    </button>
                </div>
            `;
        } else {
            const players = Object.values(onlineMgr.roomData?.players || {}).sort((a,b) => {
                if (a.surrendered && !b.surrendered) return 1;
                if (!a.surrendered && b.surrendered) return -1;
                return (b.progressPct || 0) - (a.progressPct || 0);
            });
            const winnerName = winData?.winnerName || 'Участник';
            const winnerId = winData?.winnerId || '';
            const winnerSurrendered = winData?.isSurrendered || onlineMgr.roomData?.players[winnerId]?.surrendered;
            const localProgress = onlineMgr.game ? onlineMgr.game.getConnectionProgress().pct : 100;
            const canContinue = onlineMgr.game && !onlineMgr.game.hasWon && localProgress < 100;
            
            const titleIcon = winnerSurrendered ? '🏳️' : '🏆';
            const titleColor = winnerSurrendered ? '#ef4444' : '#fbbf24';
            const titleText = winnerSurrendered ? 'ИГРА ОСТАНОВЛЕНА' : 'ИГРА ЗАВЕРШЕНА!';
            const subtitleText = winnerSurrendered 
                ? `Участник <b style="color:#ef4444;">${winnerName}</b> сдался (использовал автосбор)` 
                : `Победитель: <b style="color:#fff;">${winnerName}</b> (${timeStr})`;

            card.innerHTML = `
                <div style="font-size:2.5rem;">${titleIcon}</div>
                <div style="font-size:1.4rem; font-weight:900; color:${titleColor};">${titleText}</div>
                <div style="font-size:0.9rem; color:#aaa;">${subtitleText}</div>

                <div style="width:100%; display:flex; flex-direction:column; gap:6px;">
                    ${players.map((p, idx) => {
                        const isWinner = p.id === winnerId;
                        const borderColor = isWinner && !p.surrendered ? '1px solid #fbbf24' : (p.surrendered ? '1px solid rgba(239, 68, 68, 0.3)' : 'none');
                        const progressStyle = p.surrendered ? 'color:#ef4444;' : 'color:#38bdf8;';
                        const progressText = p.surrendered ? 'Сдался ❌' : `${(p.progressPct !== undefined && p.progressPct !== null) ? p.progressPct : 100}% (${p.moves || 0} ходов)`;
                        return `
                            <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.06); padding:8px 12px; border-radius:8px; border:${borderColor};">
                                <div style="display:flex; align-items:center; gap:8px; font-weight:bold; font-size:0.85rem; ${p.surrendered ? 'opacity:0.6;' : ''}">
                                    <span>#${idx + 1}</span> <span>${p.name} ${p.surrendered ? '🏳️' : ''}</span>
                                </div>
                                <div style="font-weight:bold; font-size:0.85rem; ${progressStyle}">
                                    ${progressText}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div style="width:100%; display:flex; flex-direction:column; gap:10px; margin-top: 8px;">
                    ${canContinue ? `
                        <button id="pzContinueAssemblingBtn" style="width:100%; padding:12px; background:linear-gradient(135deg,#3b82f6,#2563eb); border:none; border-radius:10px; color:#fff; font-weight:bold; font-size:0.95rem; cursor:pointer; transition: opacity 0.2s;">
                            Продолжить сборку
                        </button>
                    ` : ''}
                    ${onlineMgr.isHost ? `
                        <button id="pzReturnToLobbyBtn" style="width:100%; padding:12px; background:linear-gradient(135deg,#10b981,#059669); border:none; border-radius:10px; color:#fff; font-weight:bold; font-size:0.95rem; cursor:pointer; transition: opacity 0.2s;">
                            Вернуться в лобби
                        </button>
                    ` : `
                        <div id="pzWaitingForLobbyMsg" style="font-size:0.85rem; color:#94a3b8; text-align:center; padding: 4px 0; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <div class="puzzle-loader-spinner" style="width:12px;height:12px;border-width:1.5px;border-top-color:var(--accent,#8b5cf6);border-right-color:transparent;border-radius:50%;animation:pzSpin 1s linear infinite;"></div>
                            Ожидание возвращения в лобби...
                        </div>
                    `}
                    <button id="pzFinishOnlineBtn" style="width:100%; padding:12px; background:linear-gradient(135deg,#ef4444,#dc2626); border:none; border-radius:10px; color:#fff; font-weight:bold; font-size:0.95rem; cursor:pointer; transition: opacity 0.2s;">
                        Покинуть комнату
                    </button>
                </div>
            `;
        }

        modal.appendChild(card);
        document.body.appendChild(modal);

        const continueBtn = document.getElementById('pzContinueAssemblingBtn');
        if (continueBtn) {
            continueBtn.onclick = () => {
                modal.remove();
                
                const existingBtn = document.getElementById('puzzle-online-show-leaderboard-btn');
                if (existingBtn) existingBtn.remove();

                const floatBtn = document.createElement('button');
                floatBtn.id = 'puzzle-online-show-leaderboard-btn';
                floatBtn.style.cssText = `
                    position: fixed; bottom: 24px; right: 24px; z-index: 50000;
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    color: white; font-weight: bold; border: none; border-radius: 50px;
                    padding: 12px 24px; display: flex; align-items: center; gap: 8px;
                    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4); cursor: pointer;
                    font-size: 0.9rem; transition: transform 0.2s, opacity 0.2s;
                `;
                floatBtn.innerHTML = `${icon('zap', { size: 16 })} <span>Результаты гонки</span>`;
                floatBtn.onmouseover = () => { floatBtn.style.transform = 'translateY(-2px)'; };
                floatBtn.onmouseout = () => { floatBtn.style.transform = 'translateY(0)'; };
                floatBtn.onclick = () => {
                    floatBtn.remove();
                    OnlineUI.renderLeaderboardModal(onlineMgr, winData);
                };
                document.body.appendChild(floatBtn);
            };
        }

        if (onlineMgr.isHost) {
            const returnBtn = document.getElementById('pzReturnToLobbyBtn');
            if (returnBtn) {
                returnBtn.onclick = () => {
                    onlineMgr.hostReturnToLobby();
                };
            }
        }

        const finishBtn = document.getElementById('pzFinishOnlineBtn');
        if (finishBtn) {
            finishBtn.onclick = () => {
                onlineMgr.leaveRoom();
                modal.remove();
            };
        }
    }
}
