// ============================================================
// Puzzle Online Manager (Modularized with BaseOnlineEngine)
// ============================================================

import { BaseOnlineEngine } from '../multiplayer.js';
import { OnlineSync } from '../puzzle/onlineSync.js';
import { OnlineUI } from '../puzzle/onlineUI.js';

export class PuzzleOnlineManager extends BaseOnlineEngine {
    constructor(puzzleGame) {
        super();
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

        const roomData = {
            mode: this.gameMode,
            targetPieces: options.targetPieces || 36,
            maxPlayers: options.maxPlayers || 8,
            post: initialPost,
            postUrl: initialPost ? (initialPost.sample_url || initialPost.preview_url || initialPost.file_url) : '',
            aspectRatio: initialAspectRatio,
            seamsSeed: Math.floor(Math.random() * 1000000000)
        };

        try {
            const success = await super.createRoom(roomData);
            if (success) {
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

    async joinRoom(code) {
        this.renderSyncScreen('Подключение...', `Подключаемся к комнате ${code}...`);
        try {
            const success = await super.joinRoom(code);
            if (!success) {
                this.showToast('Не удалось подключиться к комнате.', 'danger');
                this.renderLobbySetupUI();
            }
        } catch (err) {
            console.error('[PuzzleOnline] Room join failed:', err);
            const friendlyMsg = (err instanceof TypeError) ? 'Не удалось подключиться. Проверьте соединение.' : ((err && err.message) || 'Комната не найдена или недоступна.');
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

    async startGameFromData(roomData) {
        this.inGame = true;
        this.closeLobbyModal();
        
        if (this.game) {
            this.game.isOnline = true;
            this.game.onlineManager = this;
            this.game.onlineMode = roomData.mode;
            this.game.targetPieces = roomData.targetPieces;

            if (!this.game.card) {
                const resultsDiv = document.getElementById('results');
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
            
            this.showToast(`🚀 Игра началась! Режим: ${roomData.mode === 'race' ? 'Гонка на скорость' : 'Совместный сбор'}`, 'success');
            this.game.seamsSeed = seamsSeed;
            
            if (post) {
                await this.game.loadPostAndStart(post, targetPieces, roomData.postUrl || (post.sample_url || post.file_url || post.preview_url || ''));
            } else {
                this.game.initPuzzle();
            }

            this.renderOnlineHUD();
        }
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
                    this.showToast(`🏳️ Вы сдались (использован автосбор)`, 'danger');
                } else {
                    this.showToast(`🥇 ПОБЕДА! Вы первым собрали пазл за ${this.game.formatTime(packet.time)}!`, 'success');
                }
            } else {
                if (packet.isSurrendered) {
                    this.showToast(`🏳️ Игрок "${packet.winnerName}" сдался (автосбор)`, 'info');
                } else {
                    this.showToast(`🏆 Игрок "${packet.winnerName}" первым собрал пазл!`, 'info');
                }
            }
        } else {
            this.showToast(`🎉 Пазл полностью собран всей командой!`, 'success');
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
            this.showToast(`✅ Действие ${this.currentVote.actionType === 'RESTART' ? 'перезапуск' : 'автосбор'} одобрено всеми!`, 'success');
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

    leaveRoom() {
        const wasHost = this.isHost;
        const prevRoomId = this.roomId;

        if (this.roomId) {
            fetch('/api/room/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: this.roomId, playerId: this.playerId })
            }).catch(() => {});
        }
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
                this.showToast(`🚪 Комната ${prevRoomId} закрыта. Соединение отключено.`, 'info');
            } else {
                this.showToast(`🚪 Вы покинули комнату ${prevRoomId}. Соединение отключено.`, 'info');
            }
        }
    }
}
