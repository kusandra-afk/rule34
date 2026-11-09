// ============================================================
// Puzzle Online Manager (Modularized with BaseOnlineEngine)
// ============================================================

import { BaseOnlineEngine } from '../multiplayer.js';
import { OnlineSync } from '../puzzle/onlineSync.js';
import { OnlineUI } from '../puzzle/onlineUI.js?v=2.5.4';
import { rememberScroll } from '../scrollState.js?v=2.5.6';
import { saveRoomSession, loadRoomSession, clearRoomSession } from '../puzzle/session.js';

export class PuzzleOnlineManager extends BaseOnlineEngine {
    constructor(puzzleGame) {
        // gameType уходит в заявку /api/rooms/announce и по нему же фильтрует
        // список открытых комнат. Без него комната объявлялась как 'generic',
        // а /api/rooms/list?gameType=puzzle всегда возвращал пустой список —
        // «поиск открытых комнат не работает».
        super('puzzle');
        this.game = puzzleGame;
        this.playerName = localStorage.getItem('r34_puzzle_nickname') || 'Игрок_' + Math.floor(Math.random() * 8999 + 1000);
        this.gameMode = 'race'; // 'race' | 'coop'
        this.inGame = false;
        this.skippedPuzzleIds = new Set();
        this.currentVote = null;

        // Register event handlers on BaseOnlineEngine
        this.on('hostReceivedMessage', (clientPlayerId, packet) => {
            OnlineSync.handleHostReceivedMessage(this, clientPlayerId, packet);
        });

        this.on('clientReceivedMessage', (packet) => {
            OnlineSync.handleClientReceivedMessage(this, packet);
        });

        // Хост уже показывает свой тост join/leave напрямую в
        // handleHostReceivedMessage — эти два события (эмитятся
        // BaseOnlineEngine при получении ROOM_DATA) нужны только гостю,
        // у которого раньше такого уведомления не было вовсе.
        this.on('playerJoined', (player) => {
            if (this.isHost) return;
            const actionStr = this.inGame ? 'подключился к игре' : 'вошел в лобби';
            this.showToast(`Игрок "${player.name}" ${actionStr}`, 'info', 'user');
        });
        this.on('playerLeft', (id, player) => {
            if (this.isHost || !player) return;
            const actionStr = this.inGame ? 'вышел из игры' : 'покинул лобби';
            this.showToast(`Игрок "${player.name}" ${actionStr}`, 'danger', 'logOut');
        });

        // Обрыв соединения (перезагрузка вкладки, потеря сети) не присылает
        // LEAVE — раньше хост видел только строчку «Соединение с ... закрыто»
        // в логах, игрок навсегда оставался в списке участников, а остальные
        // не получали никакого уведомления. Теперь хост сам убирает его из
        // комнаты и рассылает обновлённый список (гости показывают тост по
        // событию playerLeft).
        this.on('dcClose', (closedId) => {
            if (!this.active) return;
            if (this.isHost) {
                const gone = this.roomData && this.roomData.players ? this.roomData.players[closedId] : null;
                if (!gone) return;
                delete this.roomData.players[closedId];
                if (this.game && typeof this.game.clearRemoteDrag === 'function') {
                    this.game.clearRemoteDrag(closedId);
                }
                this.broadcastRoomData();
                if (!this.inGame) this.updateLobbyPlayerList(); else this.updateOnlineHUD();
                this.showToast(`Игрок "${gone.name}" отключился`, 'danger', 'logOut');
                this.addSyncLog(`Игрок ${gone.name} отключился (соединение закрыто)`);
            } else {
                this.showToast('Соединение с организатором потеряно — можно переподключиться.', 'danger', 'ban');
                this.addSyncLog('Соединение с хостом закрыто');
            }
        });

        this.on('syncLog', (msg) => {
            const logsEl = document.getElementById('puzzle-sync-logs');
            if (logsEl) {
                const line = document.createElement('div');
                line.style.marginBottom = '2px';
                line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
                logsEl.appendChild(line);
                logsEl.scrollTop = logsEl.scrollHeight;
            }
        });
    }

    setPlayerName(name) {
        this.playerName = (name || '').trim() || 'Игрок';
        localStorage.setItem('r34_puzzle_nickname', this.playerName);
    }

    // --- UI WRAPPERS ---
    showToast(msg, type = 'info') {
        OnlineUI.showToast(msg, type);
    }

    renderLobbySetupUI() {
        OnlineUI.renderLobbySetupUI(this);
    }

    renderLobbyUI() {
        OnlineUI.renderLobbyUI(this);
    }

    renderSyncScreen(title, subtitle) {
        OnlineUI.renderSyncScreen(this, title, subtitle);
    }

    updateLobbyPlayerList() {
        OnlineUI.updateLobbyPlayerList(this);
    }

    updateLobbyPuzzleIdPill() {
        OnlineUI.updateLobbyPuzzleIdPill(this);
    }

    closeLobbyModal() {
        OnlineUI.closeLobbyModal();
    }

    renderOnlineHUD() {
        OnlineUI.renderOnlineHUD(this);
    }

    updateOnlineHUD() {
        OnlineUI.updateOnlineHUD(this);
    }

    renderLeaderboardModal(winData) {
        OnlineUI.renderLeaderboardModal(this, winData);
    }

    // --- ROOM CREATION & JOINING ---
    async createRoom(options = {}) {
        this.gameMode = options.mode || 'race';
        let initialPost = this.game.post;

        if (!initialPost) {
            if (window.gallery) {
                const isFavActive = window.gallery.isFavoritesActive;
                const posts = Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts) 
                    ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts) 
                    : [];
                const isVideo = p => p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
                const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
                const isTooTall = p => {
                    if (allowLong) return false;
                    return p.width && p.height && (p.height / p.width > 2.8);
                };
                let eligible = posts.filter(p => !isVideo(p) && !isTooTall(p));
                let solvedIds = [];
                try { solvedIds = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]'); } catch (e) {}
                let unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id));
                if (unsolved.length > 0) {
                    initialPost = unsolved[Math.floor(Math.random() * unsolved.length)];
                } else if (eligible.length > 0) {
                    initialPost = eligible[Math.floor(Math.random() * eligible.length)];
                }
            }
        }

        let ratio = 1.0;
        if (initialPost && initialPost.width && initialPost.height && initialPost.width > 0 && initialPost.height > 0) {
            ratio = initialPost.width / initialPost.height;
        }
        const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
        const initialAspectRatio = allowLong ? Math.max(0.05, Math.min(20.0, ratio)) : Math.max(0.4, Math.min(1.8, ratio));
        if (this.game) {
            this.game.aspectRatio = initialAspectRatio;
        }

        // ntfy.sh молча превращает сообщение в файл-вложение, если тело
        // превышает ~4096 байт, а наш парсер такое вложение не читает
        // (JSON.parse падает на тексте "You received a file..."). Полный
        // объект поста с rule34 (особенно tag_info — по записи на каждый
        // тег) легко перебивает этот лимит, поэтому в roomData уходит
        // только то, что реально нужно для рендера пазла на другой стороне.
        const minimalPost = initialPost ? {
            id: initialPost.id,
            width: initialPost.width,
            height: initialPost.height,
            sample_url: initialPost.sample_url,
            preview_url: initialPost.preview_url,
            file_url: initialPost.file_url
        } : null;

        const roomData = {
            mode: this.gameMode,
            targetPieces: options.targetPieces || 36,
            maxPlayers: options.maxPlayers || 8,
            post: minimalPost,
            postUrl: initialPost ? (initialPost.sample_url || initialPost.preview_url || initialPost.file_url) : '',
            aspectRatio: initialAspectRatio,
            seamsSeed: Math.floor(Math.random() * 1000000000)
        };

        try {
            const success = await super.createRoom(roomData, options.password || '');
            if (success) {
                saveRoomSession({
                    roomId: this.roomId,
                    playerId: this.playerId,
                    playerName: this.playerName,
                    isHost: true,
                    password: options.password || '',
                    roomSetup: roomData
                });
                this.renderLobbyUI();
            } else {
                this.showToast('Не удалось создать комнату. Попробуйте ещё раз.', 'danger');
                this.renderLobbySetupUI();
            }
        } catch (err) {
            console.error('[PuzzleOnline] Room creation failed:', err);
            const friendlyMsg = (err instanceof TypeError) ? 'Не удалось создать комнату. Проверьте соединение.' : ((err && err.message) || 'Не удалось создать комнату. Проверьте соединение.');
            this.showToast(friendlyMsg, 'danger');
            this.renderLobbySetupUI();
        }
    }

    async joinRoom(code, password = '') {
        this.renderSyncScreen('Подключение...', `Подключаемся к комнате ${code}...`);
        try {
            const success = await super.joinRoom(code, password);
            if (!success) {
                this.showToast('Не удалось подключиться к комнате.', 'danger');
                this.renderLobbySetupUI();
            } else {
                saveRoomSession({
                    roomId: this.roomId,
                    playerId: this.playerId,
                    playerName: this.playerName,
                    isHost: false,
                    password: password || ''
                });
            }
        } catch (err) {
            console.error('[PuzzleOnline] Room join failed:', err);
            const errCode = err && err.message;
            const friendlyMsg = errCode === 'password_required' ? 'Комната защищена паролем — введите его.'
                : errCode === 'invalid_password' ? 'Неверный пароль комнаты.'
                : (err instanceof TypeError) ? 'Не удалось подключиться. Проверьте соединение.'
                : (errCode || 'Комната не найдена или недоступна.');
            this.showToast(friendlyMsg, 'danger');
            this.renderLobbySetupUI();
        }
    }

    // --- GAME FLOW CONTROL ---
    hostStartGame() {
        if (!this.isHost || !this.roomData) return;
        this.roomData.status = 'playing';
        const startPacket = { type: 'START_GAME', roomData: this.roomData };
        this.broadcast(startPacket);
        this.startGameFromData(this.roomData);
    }

    hostReturnToLobby() {
        if (!this.isHost || !this.roomData) return;
        
        this.roomData.status = 'waiting';
        if (this.roomData.players) {
            for (const id in this.roomData.players) {
                this.roomData.players[id].won = false;
                this.roomData.players[id].progressPct = 0;
                this.roomData.players[id].moves = 0;
                // Готовность относится к конкретному запуску: после партии её
                // надо подтвердить заново, иначе хост стартует «по старой памяти».
                this.roomData.players[id].ready = false;
            }
        }
        this.roomData.teamProgress = 0;

        this.broadcast({
            type: 'RETURN_TO_LOBBY',
            roomData: this.roomData
        });

        this.handleReturnToLobby(this.roomData);
    }

    handleReturnToLobby(roomData) {
        this.roomData = roomData;
        this.inGame = false;
        this.closeLobbyModal();
        
        if (this.game && this.game.card) {
            this.game.card.style.display = 'none';
        }
        
        const hud = document.getElementById('puzzle-online-hud');
        if (hud) hud.remove();

        this.renderLobbyUI();
        this.showToast('Вы вернулись в лобби', 'info');
    }

    async startGameFromData(roomData, opts = {}) {
        this.inGame = true;
        this.closeLobbyModal();
        
        if (this.game) {
            this.game.isOnline = true;
            this.game.onlineManager = this;
            this.game.onlineMode = roomData.mode;
            this.game.targetPieces = roomData.targetPieces;

            if (!this.game.card) {
                const resultsDiv = document.getElementById('results');
                // Онлайн-партия тоже прячет ленту — запоминаем позицию, чтобы
                // после выхода из игры вернуться туда же (см. scrollState.js).
                if (resultsDiv && resultsDiv.style.display !== 'none') rememberScroll('page');
                if (resultsDiv) resultsDiv.style.display = 'none';
                document.body.style.overflow = 'hidden';
                if (window.gallery && window.gallery.observer) {
                    window.gallery.observer.disconnect();
                }
                this.game.createUI();
            } else {
                this.game.card.style.display = '';
            }
            
            const post = roomData.post;
            const targetPieces = roomData.targetPieces;
            const seamsSeed = roomData.seamsSeed;

            // Переподключение к идущей совместной партии: сначала забираем
            // снимок поля у хоста, чтобы initPuzzle сразу расставил детали
            // как у всех и не проигрывал вступление (предпросмотр → разлёт
            // в лоток). Обычный старт партии этим не занимается.
            if (!opts.rejoin || this.isHost) {
                if (this.game) this.game._pendingCoopSnapshot = null;
            }
            if (opts.rejoin && !this.isHost && roomData.mode === 'coop') {
                await this.waitForCoopState(3000);
                if (this._pendingCoopState && this.game) {
                    this.game._pendingCoopSnapshot = this._pendingCoopState;
                    this._pendingCoopState = null;
                }
            }
            
            this.showToast(`Игра началась! Режим: ${roomData.mode === 'race' ? 'Гонка на скорость' : 'Совместный сбор'}`, 'success', 'play');
            this.game.seamsSeed = seamsSeed;
            
            if (post) {
                await this.game.loadPostAndStart(post, targetPieces, roomData.postUrl || (post.sample_url || post.file_url || post.preview_url || ''));
            } else {
                this.game.initPuzzle();
            }

            this.renderOnlineHUD();

            // Вернувшийся в идущую совместную игру гость собирает пазл заново;
            // просим у хоста актуальную расстановку деталей (см. onlineSync
            // COOP_STATE и applyBoardSnapshot).
            if (!this.isHost && roomData.mode === 'coop') {
                this.requestCoopState();
            }
        }
    }

    // --- ВОССТАНОВЛЕНИЕ ПОЛЯ ПОСЛЕ ПЕРЕПОДКЛЮЧЕНИЯ ---
    // Ждёт ответ хоста со снимком поля. Канал unreliable, поэтому запрос
    // повторяется, пока снимок не придёт или не истечёт таймаут.
    waitForCoopState(timeoutMs = 3000) {
        return new Promise(resolve => {
            if (!this.active || this._pendingCoopState) return resolve();
            const startedAt = performance.now();
            let lastRequest = 0;
            const tick = setInterval(() => {
                if (!this.active || this._pendingCoopState) {
                    clearInterval(tick);
                    resolve();
                    return;
                }
                if (performance.now() - startedAt >= timeoutMs) {
                    clearInterval(tick);
                    resolve();
                    return;
                }
                if (performance.now() - lastRequest > 900) {
                    lastRequest = performance.now();
                    this.sendToHost({ type: 'COOP_STATE_REQUEST' });
                }
            }, 120);
            this.sendToHost({ type: 'COOP_STATE_REQUEST' });
            lastRequest = performance.now();
        });
    }

    applyCoopStateIfReady() {
        if (!this._pendingCoopState) return false;
        const game = this.game;
        if (!game || !game.isPlaying || !game.tiles || !game.tiles.length) return false;
        // Пока пазл проигрывает вступление (предпросмотр → разлёт в лоток),
        // расстановку применять нельзя: разлёт перезапишет currentPos всех
        // деталей, и с поля пропадут уже поставленные. Ждём status === 'playing'
        // (его выставляет конец вступления — там же вызывается этот метод).
        if (game.status !== 'playing') return false;
        if (game.applyBoardSnapshot(this._pendingCoopState)) {
            this._pendingCoopState = null;
            if (this._coopStateTimer) {
                clearInterval(this._coopStateTimer);
                this._coopStateTimer = null;
            }
            this.showToast('Поле восстановлено', 'success', 'check');
            this.addSyncLog('Поле восстановлено по снимку хоста');
            return true;
        }
        return false;
    }

    // Канал до хоста unreliable — один запрос со снимком может потеряться,
    // поэтому повторяем, пока поле не восстановится (или не кончатся попытки).
    requestCoopState() {
        if (this.isHost || !this.active) return;
        if (this.applyCoopStateIfReady()) return;
        if (this._coopStateTimer) clearInterval(this._coopStateTimer);
        let attempts = 0;
        const tick = () => {
            if (!this.active || this.isHost || this.applyCoopStateIfReady()) {
                clearInterval(this._coopStateTimer);
                this._coopStateTimer = null;
                return;
            }
            if (attempts++ >= 20) {
                clearInterval(this._coopStateTimer);
                this._coopStateTimer = null;
                return;
            }
            this.sendToHost({ type: 'COOP_STATE_REQUEST' });
        };
        this._coopStateTimer = setInterval(tick, 1200);
        tick();
    }

    // Реванш: тот же состав и комната, но новая картинка и обнулённый счёт.
    // Отдельный метод, а не «в лобби и заново», потому что после партии экран
    // результатов ещё открыт — игроки должны сразу увидеть новый пазл.
    hostRematch() {
        if (!this.isHost || !this.roomData) return;

        let nextPost = null;
        if (window.gallery) {
            const isFav = window.gallery.isFavoritesActive;
            const posts = (isFav ? window.gallery.favoritesPosts : window.gallery.currentPosts) || [];
            const isVideo = p => p && p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
            const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
            const isTooTall = p => !allowLong && p && p.width && p.height && (p.height / p.width > 2.8);
            const currentId = this.roomData.post ? this.roomData.post.id : null;
            const candidates = posts.filter(p => p && p.file_url && p.id !== currentId && !isVideo(p) && !isTooTall(p));
            if (candidates.length > 0) {
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                nextPost = {
                    id: pick.id,
                    width: pick.width,
                    height: pick.height,
                    sample_url: pick.sample_url,
                    preview_url: pick.preview_url,
                    file_url: pick.file_url
                };
            }
        }

        if (nextPost) {
            this.roomData.post = nextPost;
            this.roomData.postUrl = nextPost.sample_url || nextPost.preview_url || nextPost.file_url || '';
            const ratio = (nextPost.width && nextPost.height) ? nextPost.width / nextPost.height : 1;
            this.roomData.aspectRatio = Math.max(0.4, Math.min(1.8, ratio));
            this.roomData.seamsSeed = Math.floor(Math.random() * 1000000000);
        }

        this.roomData.status = 'playing';
        if (this.roomData.players) {
            for (const id in this.roomData.players) {
                Object.assign(this.roomData.players[id], {
                    won: false,
                    surrendered: false,
                    progressPct: 0,
                    moves: 0,
                    placedCount: 0,
                    ready: true
                });
            }
        }
        this.roomData.teamProgress = 0;

        this.broadcast({ type: 'START_GAME', roomData: this.roomData });
        this.startGameFromData(this.roomData);
    }

    // Быстрые эмоции: короткие сообщения без чата и модерации. Хост пересылает
    // их всем, потому что гости соединены только с ним (звезда, не mesh).
    sendEmote(emoji) {
        if (!this.active || !emoji) return;
        if (Date.now() - (this._lastEmoteAt || 0) < 900) return;
        this._lastEmoteAt = Date.now();

        this.showEmote(emoji, this.playerName);
        if (this.isHost) {
            this.broadcast({ type: 'EMOTE', emoji, name: this.playerName, playerId: this.playerId });
        } else {
            this.broadcast({ type: 'EMOTE', emoji });
        }
    }

    showEmote(emoji, name) {
        const allowed = ['👍', '👎', '👏', '😂', '🔥', '😮', '🙈'];
        const safe = allowed.includes(emoji) ? emoji : String(emoji || '').slice(0, 4);
        if (!safe) return;

        const el = document.createElement('div');
        el.className = 'pz-emote-float';
        el.textContent = safe;
        if (name) el.title = name;
        // Разные эмоции не должны наезжать друг на друга — раскидываем по
        // горизонтали, чтобы «👍» и «🔥» от двух игроков читались отдельно.
        el.style.left = `${12 + Math.random() * 62}%`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2400);
    }

    // --- EMIT GAME EVENTS ---
    sendRaceProgress(placedCount, totalCount, moves, seconds) {
        if (!this.active) return;
        const progressPct = Math.min(100, Math.round((placedCount / totalCount) * 100));
        const packet = {
            type: 'RACE_PROGRESS',
            playerId: this.playerId,
            playerName: this.playerName,
            placedCount,
            totalCount,
            progressPct,
            moves,
            time: seconds
        };
        if (this.roomData?.players[this.playerId]) {
            Object.assign(this.roomData.players[this.playerId], packet);
        }
        this.broadcast(packet);
        this.updateOnlineHUD();
    }

    sendCoopMove(srcTileId, leftPct, topPct, isTrayTarget, targetPos, groupTileIds) {
        if (!this.active || this.gameMode !== 'coop') return;
        const packet = {
            type: 'COOP_MOVE',
            playerId: this.playerId,
            playerName: this.playerName,
            srcTileId,
            leftPct,
            topPct,
            isTrayTarget,
            targetPos,
            groupTileIds
        };
        this.broadcast(packet);
    }

    sendCoopDrag(srcTileId, leftPct, topPct, groupTileIds) {
        if (!this.active || this.gameMode !== 'coop') return;
        const packet = {
            type: 'COOP_DRAG',
            playerId: this.playerId,
            srcTileId,
            leftPct,
            topPct,
            groupTileIds
        };
        this.broadcast(packet);
    }

    sendWinEvent(seconds, moves, isSurrendered = false) {
        if (!this.active) return;
        const packet = {
            type: 'PLAYER_WIN',
            winnerId: this.playerId,
            winnerName: this.playerName,
            time: seconds,
            moves,
            isSurrendered: !!isSurrendered
        };
        if (this.roomData?.players[this.playerId]) {
            this.roomData.players[this.playerId].won = true;
            this.roomData.players[this.playerId].surrendered = !!isSurrendered;
        }
        this.broadcast(packet);
        this.handlePlayerWin(packet);
    }

    handlePlayerWin(packet) {
        const isSelf = packet.winnerId === this.playerId;
        
        if (this.gameMode === 'race') {
            if (isSelf) {
                if (packet.isSurrendered) {
                    this.showToast(`Вы сдались (использован автосбор)`, 'danger', 'flag');
                } else {
                    this.showToast(`ПОБЕДА! Вы первым собрали пазл за ${this.game.formatTime(packet.time)}!`, 'success', 'trophy');
                }
            } else {
                if (packet.isSurrendered) {
                    this.showToast(`Игрок "${packet.winnerName}" сдался (автосбор)`, 'info', 'flag');
                } else {
                    this.showToast(`Игрок "${packet.winnerName}" первым собрал пазл!`, 'info', 'trophy');
                }
            }
        } else {
            this.showToast(`Пазл полностью собран всей командой!`, 'success', 'partyPopper');
        }
        
        this.renderLeaderboardModal(packet);
    }

    // --- VOTING & ACTIONS ---
    requestAction(actionType) {
        if (!this.active) return;

        if (actionType === 'RESTART' && this.gameMode === 'race') {
            this.executeAction('RESTART');
            return;
        }

        const actionLabel = actionType === 'RESTART' ? 'перезапуск' : 'автосбор';
        this.addSyncLog(`Запрос на ${actionLabel}...`);
        this.showToast(`⌛ Запрос на ${actionLabel} отправлен команде...`, 'info');
        if (this.isHost) {
            OnlineSync.handleHostReceivedMessage(this, this.playerId, { type: 'ACTION_REQUEST', actionType });
        } else {
            this.broadcast({ type: 'ACTION_REQUEST', actionType });
        }
    }

    checkVoteResult() {
        if (!this.isHost || !this.currentVote) return;
        const totalPlayers = Object.keys(this.roomData.players).length;
        const votes = Object.values(this.currentVote.votes).filter(v => v === true).length;
        
        if (votes >= totalPlayers) {
            this.broadcast({ type: 'EXECUTE_ACTION', actionType: this.currentVote.actionType });
            this.showToast(`Действие ${this.currentVote.actionType === 'RESTART' ? 'перезапуск' : 'автосбор'} одобрено всеми!`, 'success', 'check');
            this.executeAction(this.currentVote.actionType);
            this.currentVote = null;
        } else if (Object.values(this.currentVote.votes).filter(v => v === false).length > 0) {
            this.broadcast({ type: 'VOTING_REJECTED', actionType: this.currentVote.actionType });
            this.showToast('Голосование отклонено!', 'danger');
            this.currentVote = null;
        }
    }

    showVoteDialog(actionType, requesterId, requesterName) {
        const actionName = actionType === 'RESTART' ? 'ПЕРЕЗАПУСТИТЬ' : 'АВТОМАТИЧЕСКИ СОБРАТЬ';
        const msg = `Игрок ${requesterName} хочет ${actionName} пазл. Вы согласны?`;
        
        if (typeof window.showConfirmModal === 'function') {
            window.showConfirmModal('Голосование', msg).then(confirmed => {
                this.sendVote(actionType, confirmed);
            });
        } else {
            const confirmed = confirm(msg);
            this.sendVote(actionType, confirmed);
        }
    }

    sendVote(actionType, confirmed) {
        if (this.isHost) {
            OnlineSync.handleHostReceivedMessage(this, this.playerId, { type: 'CAST_VOTE', actionType, vote: confirmed });
        } else {
            this.broadcast({ type: 'CAST_VOTE', actionType, vote: confirmed });
        }
    }

    executeAction(actionType) {
        if (!this.game) return;
        if (actionType === 'RESTART') {
            this.game.initPuzzle();
        } else if (actionType === 'SOLVE') {
            this.game.autoSolve();
        }
    }

    // Возврат в комнату после случайной перезагрузки страницы.
    async restoreSession() {
        const session = loadRoomSession();
        if (!session) return false;

        this.playerId = session.playerId;
        if (session.playerName) this.setPlayerName(session.playerName);
        this.gameMode = (session.roomSetup && session.roomSetup.mode) || this.gameMode;

        if (session.isHost) {
            this.renderSyncScreen('Восстанавливаем комнату...', `Комната ${session.roomId} переоткрывается с тем же кодом.`);
            try {
                await super.createRoom(session.roomSetup || {}, session.password || '', session.roomId);
                this.addSyncLog(`Комната ${session.roomId} восстановлена после перезагрузки.`);
                this.renderLobbyUI();
                return true;
            } catch (err) {
                console.error('[PuzzleOnline] Room restore failed:', err);
                clearRoomSession();
                this.showToast('Не удалось восстановить комнату — создайте новую.', 'danger');
                this.renderLobbySetupUI();
                return false;
            }
        }

        // Гость: хост держит тот же предсказуемый peer id, поэтому достаточно
        // подключиться заново с прежним playerId — для хоста это будет JOIN
        // того же участника, без дубля в списке.
        await this.joinRoom(session.roomId, session.password || '');
        return true;
    }

    leaveRoom() {
        clearRoomSession();
        if (this._coopStateTimer) {
            clearInterval(this._coopStateTimer);
            this._coopStateTimer = null;
        }
        this._pendingCoopState = null;
        const wasHost = this.isHost;
        const prevRoomId = this.roomId;

        this.broadcast({ type: 'LEAVE', playerId: this.playerId });
        
        super.leaveRoom();

        const wasInGame = this.inGame;
        this.inGame = false;
        this.closeLobbyModal();

        const hud = document.getElementById('puzzle-online-hud');
        if (hud) hud.remove();

        if (this.game) {
            const gameRef = this.game;
            this.game.isOnline = false;
            this.game.onlineManager = null;
            this.game = null;
            
            gameRef.destroy();
        }

        if (prevRoomId) {
            if (wasHost) {
                this.showToast(`Комната ${prevRoomId} закрыта. Соединение отключено.`, 'info', 'ban');
            } else {
                this.showToast(`Вы покинули комнату ${prevRoomId}. Соединение отключено.`, 'info', 'logOut');
            }
        }
    }
}
