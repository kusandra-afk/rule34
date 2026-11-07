import { lockPageScroll, releasePageScroll } from '../backgroundPause.js';
import { icon } from '../icons.js';
import { makeCustomDropdown } from '../components/customDropdown.js';
import { fetchPostById } from '../api.js';
import { loadRoomSession, clearRoomSession } from './session.js';

// ntfy.sh молча превращает сообщение в файл-вложение, если тело превышает
// ~4096 байт, а клиент такое вложение не читает (JSON.parse падает на тексте
// "You received a file..."). Полный объект поста с rule34 (особенно
// tag_info — по записи на каждый тег) легко перебивает этот лимит, поэтому
// в roomData.post уходит только то, что реально нужно для рендера пазла.
function toMinimalPost(post) {
    if (!post) return null;
    return {
        id: post.id,
        width: post.width,
        height: post.height,
        sample_url: post.sample_url,
        preview_url: post.preview_url,
        file_url: post.file_url
    };
}

const TOAST_DEFAULT_ICONS = { success: 'check', danger: 'ban', info: 'info', warning: 'warning' };

export class OnlineUI {
    // iconName выбирает SVG из icons.js (см. TOAST_DEFAULT_ICONS для дефолта
    // по типу) — вызывающий код должен передавать конкретную иконку под
    // смысл события (user/logOut/trophy/flag/...), а не полагаться только
    // на цвет типа, иначе разные события одного типа (уход игрока vs сдача
    // партии, оба 'danger') визуально неотличимы друг от друга.
    static showToast(msg, type = 'info', iconName = null) {
        if (window.safeScreen && window.safeScreen.isActive) return;
        const toast = document.createElement('div');
        toast.className = `r34-toast r34-toast-${type}`;
        toast.innerHTML = `
            <span class="r34-toast-icon">${icon(iconName || TOAST_DEFAULT_ICONS[type] || 'info', { size: 18 })}</span>
            <span class="r34-toast-text"></span>
        `;
        toast.querySelector('.r34-toast-text').textContent = msg;
        document.body.appendChild(toast);
        // setTimeout, а не requestAnimationFrame — rAF не срабатывает вовсе,
        // пока вкладка в фоне (не в фокусе), и тост так и остаётся невидимым
        // (opacity:0) до самого удаления по таймауту ниже.
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    static closeLobbyModal() {
        const existing = document.getElementById('puzzle-online-modal');
        if (existing) existing.remove();
        releasePageScroll();
    }

    static renderLobbyUI(onlineMgr) {
        OnlineUI.closeLobbyModal();
        if (onlineMgr.game && onlineMgr.game.card) {
            onlineMgr.game.card.style.display = 'none';
        }

        const modal = document.createElement('div');
        modal.id = 'puzzle-online-modal';
        modal.className = 'game-overlay open pz-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const card = document.createElement('div');
        card.className = 'game-card pz-shell pz-shell--lobby';

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

        const modeLabel = onlineMgr.roomData?.mode === 'coop' ? 'Совместный сбор' : 'Гонка на скорость';
        const maxPlayers = onlineMgr.roomData?.maxPlayers || 8;

        // Шапка и карточка имеют одну и ту же ширину (см. .game-header--pz-lg и
        // .pz-shell--lobby в lobby.css), иначе стрелка/крестик улетали к краям
        // экрана и не читались как часть одного окна.
        modal.innerHTML = `
            <div class="game-header game-header--pz-lg">
                <div class="game-title-group">
                    <div class="game-logo-icon game-logo-icon-puzzle">${icon('puzzle', { size: 20 })}</div>
                    <h2 class="game-app-title">${onlineMgr.isHost ? 'Лобби Хоста' : 'Комната'} <span class="pz-beta">БЕТА</span></h2>
                </div>
                <button class="game-close-btn" id="pzOnlineCloseBtn" title="Закрыть">${icon('x', { size: 18 })}</button>
            </div>
        `;

        // Две колонки: слева код комнаты и пазл, справа участники и запуск игры.
        // Раньше всё шло одной колонкой высотой >1000px, и кнопка «Начать игру»
        // вместе со списком игроков оказывалась за пределами экрана.
        card.innerHTML = `
            <div class="pz-lobby">
                <div class="pz-lobby-col">
                    <div class="pz-room">
                        <div class="pz-room-info">
                            <span class="pz-label">Код комнаты</span>
                            <strong class="pz-room-code">${onlineMgr.roomId}</strong>
                        </div>
                        <button id="pzCopyCodeBtn" class="game-btn-secondary pz-btn-sm">
                            ${icon('clipboard', { size: 14 })} Копировать
                        </button>
                    </div>

                    <div class="pz-card">
                        <div class="pz-card-head">
                            <span class="pz-label">${icon('image', { size: 14 })} Пазл в комнате</span>
                            <div class="pz-head-tools">
                                <span id="pzPuzzleIdPill" class="pz-id-pill" title="Кликните, чтобы скопировать ID" style="${currentPostId ? '' : 'display: none;'}">ID ${currentPostId}</span>
                                ${onlineMgr.isHost ? `
                                    <button id="pzSkipPuzzleBtn" class="pz-mini-btn">
                                        ${icon('refresh', { size: 12 })} Другой пазл
                                    </button>
                                ` : `
                                    <span id="pzPiecesInfoText" class="pz-chip">${onlineMgr.roomData?.targetPieces || 36} деталей</span>
                                `}
                            </div>
                        </div>
                        <div id="pzPreviewImg" class="pz-preview" style="background-image: url('${previewUrl}');"></div>
                        ${onlineMgr.isHost ? `
                            <div class="pz-tools">
                                <div class="pz-field">
                                    <label class="pz-field-label">Детали пазла</label>
                                    <select id="pzPiecesSelect" class="game-input pz-select">
                                        ${optionsHtml}
                                    </select>
                                </div>
                                <div class="pz-field">
                                    <label class="pz-field-label">Заменить по ID</label>
                                    <div class="pz-id-row">
                                        <input type="text" id="pzHostIdInput" class="game-input" placeholder="ID поста" inputmode="numeric" />
                                        <button id="pzHostIdLoadBtn" class="pz-mini-btn pz-mini-btn--solid">Найти</button>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="pz-lobby-col pz-lobby-col--side">
                    <div class="pz-card pz-card--players">
                        <div class="pz-card-head">
                            <span class="pz-label">Участники <b class="pz-player-count"><span id="pzPlayerCount">1</span>/${maxPlayers}</b></span>
                            <span class="pz-chip pz-chip--accent">${modeLabel}</span>
                        </div>
                        <div id="pzPlayerList" class="pz-players"></div>
                    </div>

                    <div class="pz-actions">
                        ${onlineMgr.isHost ? `
                            <button id="pzStartGameBtn" class="game-btn-primary game-start-btn pz-start">
                                ${icon('sparkles', { size: 16 })} Начать игру
                            </button>
                        ` : `
                            <button id="pzReadyBtn" class="game-btn-primary pz-start pz-ready-btn" aria-pressed="false">
                                ${icon('check', { size: 16 })} Я готов
                            </button>
                            <div class="game-waiting-indicator pz-waiting">
                                ${icon('hourglass', { size: 16 })} Ждём, пока организатор начнёт игру
                            </div>
                        `}
                        <button class="game-btn-secondary pz-leave" id="pzLeaveRoomBtn">
                            ${icon('arrowLeft', { size: 14 })} Выйти из комнаты
                        </button>
                    </div>

                    <!-- Логи оставлены на экране: по ним видно, что происходит с
                         соединением, когда комната «молчит». -->
                    <div class="pz-logs">
                        <div class="pz-logs-title">Логи подключения</div>
                        <div id="puzzle-sync-logs" class="pz-logs-body">Ожидание игроков...</div>
                    </div>
                </div>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);
        lockPageScroll();

        const handleLeaveToSetup = () => {
            onlineMgr.leaveRoom();
            OnlineUI.renderLobbySetupUI(onlineMgr);
        };

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
                const post = onlineMgr.roomData?.post || onlineMgr.game?.post;
                if (post && post.id) {
                    navigator.clipboard.writeText(post.id.toString());
                    OnlineUI.showToast(`ID пазла ${post.id} скопирован!`, 'success');
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
                    onlineMgr.roomData.post = toMinimalPost(nextPost);
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
                    OnlineUI.updateLobbyPuzzleIdPill(onlineMgr);
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
                            onlineMgr.roomData.post = toMinimalPost(post);
                            // Для GIF-файлов используем file_url (оригинал с анимацией), для остальных - sample_url
                            const isGif = (post.file_url || '').toLowerCase().endsWith('.gif');
                            const newPreviewUrl = isGif ? (post.file_url || post.sample_url || post.preview_url) : (post.sample_url || post.preview_url || post.file_url);
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
                            OnlineUI.updateLobbyPuzzleIdPill(onlineMgr);
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

        // Готовность гостя. Флаг летит хосту, тот кладёт его в roomData и
        // рассылает обратно — поэтому после ответа сервера список сам покажет
        // актуальный статус у всех участников.
        const readyBtn = document.getElementById('pzReadyBtn');
        if (readyBtn && !onlineMgr.isHost) {
            let isReady = !!onlineMgr.roomData?.players?.[onlineMgr.playerId]?.ready;
            const paintReady = () => {
                readyBtn.classList.toggle('is-ready', isReady);
                readyBtn.setAttribute('aria-pressed', String(isReady));
                readyBtn.innerHTML = isReady
                    ? `${icon('check', { size: 16 })} Готов`
                    : `${icon('check', { size: 16 })} Я готов`;
            };
            paintReady();
            readyBtn.onclick = () => {
                isReady = !isReady;
                paintReady();
                const me = onlineMgr.roomData?.players?.[onlineMgr.playerId];
                if (me) me.ready = isReady;
                onlineMgr.broadcast({
                    type: 'PLAYER_READY',
                    playerId: onlineMgr.playerId,
                    ready: isReady
                });
                if (typeof onlineMgr.addSyncLog === 'function') {
                    onlineMgr.addSyncLog(isReady ? 'Вы готовы' : 'Вы не готовы');
                }
                onlineMgr.updateLobbyPlayerList();
            };
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
        modal.className = 'game-overlay open pz-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const card = document.createElement('div');
        card.className = 'game-card pz-shell pz-shell--setup';

        const hasTurnKey = !!(localStorage.getItem('gameMeteredKey') || localStorage.getItem('hlMeteredKey'));

        // Комната из прошлой сессии вкладки: после случайной перезагрузки
        // (или возврата на страницу) предлагаем вернуться одним нажатием.
        const savedSession = loadRoomSession();
        const rejoinBanner = savedSession ? `
            <div class="pz-rejoin">
                <div class="pz-rejoin-text">
                    ${icon('refresh', { size: 18 })}
                    <div>
                        <b>Есть незакрытая комната ${savedSession.roomId}</b>
                        <small>${savedSession.isHost
                            ? 'Вы были организатором — комната переоткроется с тем же кодом.'
                            : 'Вы были участником — можно вернуться в лобби.'}</small>
                    </div>
                </div>
                <div class="pz-rejoin-actions">
                    <button type="button" class="game-btn-primary pz-rejoin-btn" id="pzRejoinBtn">
                        ${icon('arrowRight', { size: 16 })} Продолжить
                    </button>
                    <button type="button" class="pz-rejoin-dismiss" id="pzRejoinDismiss" title="Забыть комнату">
                        ${icon('x', { size: 14 })}
                    </button>
                </div>
            </div>
        ` : '';

        modal.innerHTML = `
            <div class="game-header game-header--pz-sm">
                <div class="game-title-group">
                    <div class="game-logo-icon game-logo-icon-puzzle">${icon('puzzle', { size: 20 })}</div>
                    <h2 class="game-app-title">Онлайн режим <span class="pz-beta">БЕТА</span></h2>
                </div>
                <button class="game-close-btn" id="pzSetupCloseBtn" title="Закрыть">${icon('x', { size: 18 })}</button>
            </div>
        `;

        // Ник — общий для обоих сценариев, поэтому он живёт над колонками и не
        // повторяется в каждой панели.
        card.innerHTML = `
            <div class="pz-nickbar">
                <div class="pz-nickbar-text">
                    <span class="pz-label">${icon('user', { size: 14 })} Ваше имя</span>
                    <span class="pz-hint">Так вас увидят остальные игроки.</span>
                </div>
                <input type="text" id="pzNickInput" class="game-input pz-nick-input" value="${onlineMgr.playerName}" placeholder="Никнейм" maxlength="20">
            </div>

            ${rejoinBanner}

            ${hasTurnKey ? '' : `
                <div class="pz-notice">
                    ${icon('warning', { size: 16 })}
                    <div>
                        <b>Ключ Metered не установлен.</b> Онлайн может работать нестабильно.
                        Ключ вводится в главном меню игр — 5 кликов по заголовку.
                    </div>
                </div>
            `}

            <div class="pz-setup-grid">
                <section class="pz-panel">
                    <div class="pz-panel-head">
                        <h3 class="pz-panel-title">Присоединиться</h3>
                        <p class="pz-panel-desc">Есть код от друга? Введите его — и вы в комнате.</p>
                    </div>
                    <input type="text" id="pzJoinCodeInput" class="game-input pz-code-input" placeholder="Код комнаты" maxlength="5" autocomplete="off">
                    <input type="password" id="pzJoinPasswordInput" class="game-input" placeholder="Пароль, если он есть" autocomplete="new-password">
                    <button class="game-btn-secondary pz-panel-btn" id="pzJoinRoomBtn">
                        ${icon('arrowRight', { size: 16 })} Войти в комнату
                    </button>
                </section>

                <section class="pz-panel pz-panel--accent">
                    <div class="pz-panel-head">
                        <h3 class="pz-panel-title">Создать комнату</h3>
                        <p class="pz-panel-desc">Выберите стиль игры — код комнаты появится сразу.</p>
                    </div>
                    <div class="pz-switch-row">
                        <button type="button" id="pzModeRaceBtn" class="pz-switch active">
                            ${icon('zap', { size: 16 })}
                            <span class="pz-switch-text">
                                <b>Гонка</b>
                                <small>Кто соберёт первым</small>
                            </span>
                        </button>
                        <button type="button" id="pzModeCoopBtn" class="pz-switch">
                            ${icon('users', { size: 16 })}
                            <span class="pz-switch-text">
                                <b>Вместе</b>
                                <small>Один пазл на всех</small>
                            </span>
                        </button>
                    </div>
                    <input type="password" id="pzCreatePasswordInput" class="game-input" placeholder="Пароль (необязательно)" autocomplete="new-password">
                    <button class="game-btn-primary game-create-btn pz-panel-btn" id="pzCreateRoomBtn">
                        ${icon('sparkles', { size: 16 })} Создать комнату
                    </button>
                </section>
            </div>

            <section class="pz-panel pz-panel--rooms">
                <div class="pz-panel-head pz-rooms-head">
                    <div>
                        <h3 class="pz-panel-title">Открытые комнаты</h3>
                        <p class="pz-panel-desc">Можно войти без кода, если не нужен пароль.</p>
                    </div>
                    <button type="button" class="pz-rooms-refresh" id="pzRoomsRefresh" title="Обновить список">
                        ${icon('refresh', { size: 14 })}
                    </button>
                </div>
                <div class="pz-rooms-list" id="pzRoomsList">
                    <div class="pz-rooms-empty">Загружаем...</div>
                </div>
            </section>

            <div class="pz-setup-foot">
                <button class="game-btn-secondary game-back-btn" id="pzBackMenuBtn">
                    ${icon('arrowLeft', { size: 14 })} Назад в меню
                </button>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);
        lockPageScroll();

        let selectedMode = 'race';

        const nickInput = document.getElementById('pzNickInput');
        nickInput.oninput = () => {
            onlineMgr.setPlayerName(nickInput.value);
        };

        const rejoinBtn = document.getElementById('pzRejoinBtn');
        if (rejoinBtn) {
            rejoinBtn.onclick = () => {
                OnlineUI.closeLobbyModal();
                onlineMgr.restoreSession();
            };
        }
        const rejoinDismiss = document.getElementById('pzRejoinDismiss');
        if (rejoinDismiss) {
            rejoinDismiss.onclick = () => {
                clearRoomSession();
                OnlineUI.renderLobbySetupUI(onlineMgr);
            };
        }

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
            releasePageScroll();
        };

        const goBackToMenu = () => {
            if (onlineMgr.game) {
                onlineMgr.game.destroy();
            }
            modal.remove();
            releasePageScroll();
            if (typeof window.openPuzzleMenu === 'function') {
                window.openPuzzleMenu();
            }
        };

        document.getElementById('pzBackMenuBtn').onclick = goBackToMenu;

        // Список комнат обновляем, пока открыт этот экран: таймер сам
        // останавливается, когда модалка убрана из DOM.
        OnlineUI.loadOpenRooms(onlineMgr);
        const roomsTimer = setInterval(() => {
            if (!modal.isConnected) {
                clearInterval(roomsTimer);
                return;
            }
            OnlineUI.loadOpenRooms(onlineMgr);
        }, 12000);
        const roomsRefreshBtn = document.getElementById('pzRoomsRefresh');
        if (roomsRefreshBtn) {
            roomsRefreshBtn.onclick = () => OnlineUI.loadOpenRooms(onlineMgr);
        }
        document.getElementById('pzSetupCloseBtn').onclick = closeSetup;

        document.getElementById('pzCreateRoomBtn').onclick = () => {
            const password = document.getElementById('pzCreatePasswordInput').value;
            onlineMgr.createRoom({ mode: selectedMode, targetPieces: 36, maxPlayers: 8, password });
        };

        document.getElementById('pzJoinRoomBtn').onclick = () => {
            const code = document.getElementById('pzJoinCodeInput').value.trim();
            const password = document.getElementById('pzJoinPasswordInput').value;
            if (!code) {
                OnlineUI.showToast('Введите код комнаты!', 'danger');
                return;
            }
            onlineMgr.joinRoom(code, password);
        };

        // Enter в поле кода сразу отправляет форму — так не нужно тянуться к
        // кнопке мышью.
        const joinCodeInput = document.getElementById('pzJoinCodeInput');
        joinCodeInput.onkeydown = (e) => {
            if (e.key === 'Enter') document.getElementById('pzJoinRoomBtn').click();
        };
    }

    static async loadOpenRooms(onlineMgr) {
        const list = document.getElementById('pzRoomsList');
        if (!list) return;
        try {
            const res = await fetch('/api/rooms/list?gameType=puzzle', { credentials: 'same-origin' });
            const data = await res.json();
            if (!list.isConnected) return;
            const rooms = (data && data.rooms) || [];
            if (rooms.length === 0) {
                list.innerHTML = '<div class="pz-rooms-empty">Пока никто не хостит — создайте комнату.</div>';
                return;
            }
            list.innerHTML = rooms.map(room => `
                <div class="pz-room-row">
                    <div class="pz-room-info">
                        <b>${room.id}</b>
                        <small>${room.hostName} · ${room.mode === 'coop' ? 'Вместе' : 'Гонка'} · ${room.players}/${room.maxPlayers}${room.hasPassword ? ' · 🔒' : ''}</small>
                    </div>
                    <button type="button" class="pz-room-join" data-code="${room.id}" data-locked="${room.hasPassword ? '1' : ''}">
                        Войти
                    </button>
                </div>
            `).join('');
            list.querySelectorAll('.pz-room-join').forEach(btn => {
                btn.onclick = () => {
                    const code = btn.dataset.code;
                    if (btn.dataset.locked === '1') {
                        // Пароль нельзя угадать — подставляем код и переводим
                        // фокус в поле пароля, чтобы игрок его ввёл.
                        const codeInput = document.getElementById('pzJoinCodeInput');
                        const passInput = document.getElementById('pzJoinPasswordInput');
                        if (codeInput) codeInput.value = code;
                        if (passInput) passInput.focus();
                        OnlineUI.showToast('Комната под паролем — введите пароль.', 'info', 'lock');
                        return;
                    }
                    onlineMgr.joinRoom(code);
                };
            });
        } catch (e) {
            if (list.isConnected) {
                list.innerHTML = '<div class="pz-rooms-empty">Не удалось загрузить список комнат.</div>';
            }
        }
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

        // Гость отмечается готовым сам, хост видит статус и не может начать
        // игру, пока не готовы все. Хост считается готовым всегда.
        const guests = players.filter(p => !p.isHost);
        const readyCount = guests.filter(p => !!p.ready).length;

        playerList.innerHTML = players.map(p => {
            const chipClass = p.isHost ? ' pz-chip--host' : (p.ready ? ' pz-chip--ready' : '');
            const chipText = p.isHost ? 'Хост' : (p.ready ? 'Готов' : 'Не готов');
            return `
            <div class="pz-player${p.id === onlineMgr.playerId ? ' pz-player--me' : ''}">
                <div class="pz-player-name">
                    ${p.isHost ? icon('crown', { size: 16, className: 'game-host-crown' }) : icon('user', { size: 16 })}
                    <span>${p.name}</span>
                    ${p.id === onlineMgr.playerId ? '<small class="pz-you">(Вы)</small>' : ''}
                </div>
                <span class="pz-chip${chipClass}">${chipText}</span>
            </div>
        `;
        }).join('');

        // Старт доступен, когда готовы все приглашённые. Если гостей ещё нет,
        // хост может начинать один — одиночная игра в комнате остаётся рабочей.
        // Панель быстрых эмоций. Создаётся один раз и переиспользуется:
        // updateLobbyPlayerList вызывается на каждое обновление комнаты.
        if (!document.getElementById('pzEmoteBar') && playerList.parentNode) {
            const bar = document.createElement('div');
            bar.id = 'pzEmoteBar';
            bar.className = 'pz-emotes';
            bar.innerHTML = ['👍', '👏', '😂', '🔥']
                .map(e => `<button type="button" class="pz-emote-btn" data-emoji="${e}" title="Отправить эмоцию">${e}</button>`)
                .join('') + '<span class="pz-conn-badge" id="pzConnBadge"></span>';
            playerList.parentNode.insertBefore(bar, playerList.nextSibling);
            bar.querySelectorAll('.pz-emote-btn').forEach(btn => {
                btn.onclick = () => {
                    if (typeof onlineMgr.sendEmote === 'function') onlineMgr.sendEmote(btn.dataset.emoji);
                };
            });
        }
        const connBadge = document.getElementById('pzConnBadge');
        if (connBadge) {
            const connType = onlineMgr.connectionType;
            connBadge.textContent = connType === 'relay' ? 'Релей' : (connType === 'direct' ? 'Напрямую' : '');
            connBadge.classList.toggle('is-relay', connType === 'relay');
            connBadge.title = connType === 'relay'
                ? 'Соединение идёт через TURN-релей — возможна задержка'
                : (connType === 'direct' ? 'Прямое P2P-соединение' : 'Тип соединения определяется...');
        }

        const startBtn = document.getElementById('pzStartGameBtn');
        if (startBtn) {
            const waiting = guests.length > 0 && readyCount < guests.length;
            startBtn.disabled = waiting;
            startBtn.classList.toggle('is-waiting', waiting);
            startBtn.innerHTML = waiting
                ? `${icon('hourglass', { size: 16 })} Ждём готовности ${readyCount}/${guests.length}`
                : `${icon('sparkles', { size: 16 })} Начать игру`;
            startBtn.title = waiting
                ? 'Начать игру можно, когда все участники нажмут «Я готов»'
                : '';
        }
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
        modal.className = 'game-overlay open pz-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

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
        lockPageScroll();

        document.getElementById('pzCancelSyncBtn').onclick = () => onlineMgr.leaveRoom();
    }

    static renderOnlineHUD(onlineMgr) {
        const hudContainer = document.getElementById('puzzle-online-hud');
        if (hudContainer) hudContainer.remove();

        const card = onlineMgr.game.card;
        if (!card) return;

        const isRace = onlineMgr.gameMode === 'race';
        const hud = document.createElement('div');
        hud.id = 'puzzle-online-hud';
        hud.className = `pz-hud ${isRace ? 'pz-hud--race' : 'pz-hud--coop'}`;
        hud.setAttribute('role', 'status');
        hud.setAttribute('aria-live', 'polite');

        // Шапка панели: режим + код комнаты + счётчик участников. Раньше всё
        // висело одной инлайновой строкой, и на телефоне заголовок с кодом и
        // полоски прогресса переносились вперемешку.
        hud.innerHTML = `
            <div class="pz-hud-top">
                <div class="pz-hud-mode">
                    <span class="pz-hud-mode-icon">${isRace ? '🏁' : '🤝'}</span>
                    <span class="pz-hud-mode-title">${isRace ? 'Гонка на скорость' : 'Совместная сборка'}</span>
                </div>
                <div class="pz-hud-tags">
                    <span class="pz-hud-code" title="Код комнаты">${onlineMgr.roomId}</span>
                    <span class="pz-hud-count" id="pzHudPlayerCount"></span>
                </div>
            </div>
            ${isRace ? '' : `
            <div class="pz-hud-progress">
                <div class="pz-hud-progress-head">
                    <span class="pz-hud-progress-label" id="pzCoopStatusText">Собрано всей командой</span>
                    <span class="pz-hud-progress-count" id="pzCoopCount">0 / 0</span>
                    <span class="pz-hud-progress-pct" id="pzCoopPct">0%</span>
                </div>
                <div class="pz-hud-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="pzCoopBar">
                    <div class="pz-hud-bar-fill" id="pzCoopBarFill" style="width:0%"></div>
                </div>
            </div>`}
            <div class="pz-hud-players" id="pzRaceLeaderboardBars"></div>
        `;

        const leftPanel = card.querySelector('.puzzle-left-panel');
        if (leftPanel) {
            leftPanel.insertBefore(hud, leftPanel.children[1] || null);
        }

        OnlineUI.updateOnlineHUD(onlineMgr);
    }

    static updateOnlineHUD(onlineMgr) {
        if (!onlineMgr.inGame || !onlineMgr.roomData) return;

        const players = Object.values(onlineMgr.roomData.players || {});
        const countEl = document.getElementById('pzHudPlayerCount');
        if (countEl) countEl.textContent = `${players.length}/${onlineMgr.roomData.maxPlayers || 8}`;

        if (onlineMgr.gameMode === 'race') {
            const container = document.getElementById('pzRaceLeaderboardBars');
            if (!container) return;

            // Лидеры сверху: в гонке важен порядок, а не порядок подключения.
            const ranked = [...players].sort((a, b) => {
                if (a.surrendered !== b.surrendered) return a.surrendered ? 1 : -1;
                if (b.won !== a.won) return b.won ? 1 : -1;
                return (b.progressPct || 0) - (a.progressPct || 0);
            });

            container.innerHTML = ranked.map((p, i) => {
                const isMe = p.id === onlineMgr.playerId;
                const pct = Math.max(0, Math.min(100, p.progressPct || 0));
                const rank = p.won ? '🏆' : (p.surrendered ? '🏳️' : i + 1);
                return `
                    <div class="pz-hud-player${isMe ? ' is-me' : ''}${i === 0 && !p.surrendered ? ' is-leader' : ''}">
                        <span class="pz-hud-rank">${rank}</span>
                        <div class="pz-hud-player-main">
                            <div class="pz-hud-player-line">
                                <span class="pz-hud-player-name">${p.name}${isMe ? ' <small class="pz-you">(Вы)</small>' : ''}</span>
                                <span class="pz-hud-player-pct">${pct}%</span>
                            </div>
                            <div class="pz-hud-bar pz-hud-bar--thin">
                                <div class="pz-hud-bar-fill" style="width:${pct}%"></div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else if (onlineMgr.gameMode === 'coop') {
            if (!onlineMgr.game) return;
            const progress = onlineMgr.game.getConnectionProgress();
            const pct = Math.max(0, Math.min(100, progress.pct || 0));

            const countEl2 = document.getElementById('pzCoopCount');
            if (countEl2) countEl2.textContent = `${progress.connected} / ${progress.total}`;
            const pctEl = document.getElementById('pzCoopPct');
            if (pctEl) pctEl.textContent = `${pct}%`;
            const fill = document.getElementById('pzCoopBarFill');
            if (fill) fill.style.width = `${pct}%`;
            const bar = document.getElementById('pzCoopBar');
            if (bar) bar.setAttribute('aria-valuenow', String(pct));

            // Вклад каждого: детали, уже стоящие на своих местах. Полоска
            // считается от общего числа деталей пазла.
            const container = document.getElementById('pzRaceLeaderboardBars');
            if (!container) return;
            const totalPieces = Math.max(1, (onlineMgr.game.cols || 0) * (onlineMgr.game.rows || 0));
            const sorted = [...players].sort((a, b) => (b.placedCount || 0) - (a.placedCount || 0));
            container.innerHTML = sorted.map((p) => {
                const isMe = p.id === onlineMgr.playerId;
                const placed = Math.max(0, p.placedCount || 0);
                const share = Math.max(0, Math.min(100, Math.round((placed / totalPieces) * 100)));
                return `
                    <div class="pz-hud-player${isMe ? ' is-me' : ''}">
                        <span class="pz-hud-rank">${icon('puzzle', { size: 14 })}</span>
                        <div class="pz-hud-player-main">
                            <div class="pz-hud-player-line">
                                <span class="pz-hud-player-name">${p.name}${isMe ? ' <small class="pz-you">(Вы)</small>' : ''}</span>
                                <span class="pz-hud-player-pct">${placed}</span>
                            </div>
                            <div class="pz-hud-bar pz-hud-bar--thin">
                                <div class="pz-hud-bar-fill" style="width:${share}%"></div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    static renderLeaderboardModal(onlineMgr, winData) {
        // В совместном режиме финал приходит сразу от всех участников, да ещё
        // и ретрансляцией от хоста. Модалка с одним и тем же id создавалась
        // несколько раз, а обработчики кнопок привязывались к ПЕРВОЙ копии в
        // документе — нажатия же попадали в верхнюю, без обработчиков. Отсюда
        // «не работают» реванш/лобби/выход. Старые копии просто убираем.
        document.querySelectorAll('#puzzle-online-modal').forEach(el => el.remove());

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
                        <button id="pzRematchBtn" style="width:100%; padding:12px; background:linear-gradient(135deg,#f59e0b,#d97706); border:none; border-radius:10px; color:#fff; font-weight:bold; font-size:0.95rem; cursor:pointer; transition: opacity 0.2s;">
                            Реванш — новый пазл
                        </button>
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
                        <button id="pzRematchBtn" style="width:100%; padding:12px; background:linear-gradient(135deg,#f59e0b,#d97706); border:none; border-radius:10px; color:#fff; font-weight:bold; font-size:0.95rem; cursor:pointer; transition: opacity 0.2s;">
                            Реванш — новый пазл
                        </button>
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
        lockPageScroll();

        const continueBtn = modal.querySelector('#pzContinueAssemblingBtn');
        if (continueBtn) {
            continueBtn.onclick = () => {
                modal.remove();
                releasePageScroll();
                
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
            const returnBtn = modal.querySelector('#pzReturnToLobbyBtn');
            if (returnBtn) {
                returnBtn.onclick = () => {
                    onlineMgr.hostReturnToLobby();
                };
            }
            const rematchBtn = modal.querySelector('#pzRematchBtn');
            if (rematchBtn) {
                rematchBtn.onclick = () => {
                    rematchBtn.disabled = true;
                    onlineMgr.hostRematch();
                };
            }
        }

        const finishBtn = modal.querySelector('#pzFinishOnlineBtn');
        if (finishBtn) {
            finishBtn.onclick = () => {
                onlineMgr.leaveRoom();
                modal.remove();
                releasePageScroll();
            };
        }
    }
}
