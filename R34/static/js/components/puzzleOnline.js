/**
 * puzzleOnline.js - Serverless P2P Multiplayer Manager for Puzzle Game
 * Uses ntfy.sh for WebRTC signaling and DataChannels for ultra-low latency game sync.
 * Modes:
 *   1. 'race' - Competitive speedrun ("Кто быстрее соберет")
 *   2. 'coop' - Collaborative assembly ("Совместный сбор")
 */

import { icon } from '../icons.js';
import { fetchPostById } from '../api.js';

export class PuzzleOnlineManager {
    constructor(puzzleGame) {
        this.game = puzzleGame;
        this.playerId = 'pl_' + Math.random().toString(36).substring(2, 9);
        this.playerName = localStorage.getItem('r34_puzzle_nickname') || 'Игрок_' + Math.floor(1000 + Math.random() * 9000);
        this.roomId = null;
        this.isHost = false;
        this.gameMode = 'race'; // 'race' | 'coop'
        
        this.connections = []; // Host: [{ playerId, dc }]
        this.clientPeerConnections = {}; // Host: { playerId: RTCPeerConnection }
        this.hostConn = null; // Client: RTCDatachannel to Host
        this.pc = null; // Client: RTCPeerConnection
        
        this.eventSource = null;
        this.signalQueue = [];
        this.roomData = null;
        this.roomHeartbeatTimer = null;
        this.syncLogs = [];
        this.active = false;
        
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ];

        // Check for saved Metered key
        const savedKey = localStorage.getItem('hlMeteredKey') || localStorage.getItem('r34_metered_key');
        if (savedKey) {
            this.setupMeteredIce(savedKey);
        }
        this.currentVote = null;
    }

    setupMeteredIce(key) {
        if (!key) return;
        this.iceServers = [
            { urls: `stun:${key}.metered.ca:80` },
            { urls: `turn:${key}.metered.ca:80?transport=udp`, username: 'metered', credential: 'key' },
            { urls: `turn:${key}.metered.ca:443?transport=tcp`, username: 'metered', credential: 'key' },
            { urls: 'stun:stun.l.google.com:19302' }
        ];
    }

    generateRoomCode() {
        const chars = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    addSyncLog(msg) {
        const timestamp = new Date().toLocaleTimeString();
        this.syncLogs.push(`[${timestamp}] ${msg}`);
        console.log(`[PuzzleOnline] ${msg}`);
        const logContainer = document.getElementById('puzzle-sync-logs');
        if (logContainer) {
            logContainer.textContent = this.syncLogs.slice(-6).join('\n');
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    async sendSignal(code, data) {
        const topic = `r34_pz_sig_${code}`;
        try {
            await fetch(`https://ntfy.sh/${topic}`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        } catch (e) {
            console.error('[PuzzleOnline] Send signal error:', e);
            this.signalQueue.push({ code, data });
        }
    }

    listenSignal(code, onMessage) {
        const topic = `r34_pz_sig_${code}`;
        if (this.eventSource) {
            try { this.eventSource.close(); } catch (err) {}
            this.eventSource = null;
        }

        while (this.signalQueue.length > 0) {
            const queued = this.signalQueue.shift();
            this.sendSignal(queued.code, queued.data);
        }

        const esUrl = `https://ntfy.sh/${topic}/sse`;
        this.eventSource = new EventSource(esUrl);
        this.eventSource.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                if (packet.message) {
                    const msg = JSON.parse(packet.message);
                    onMessage(msg);
                }
            } catch (e) {}
        };
        this.eventSource.onerror = (e) => {
            // EventSource automatically reconnects; suppress noisy error logs on normal reconnection drops
            if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
                console.log('[PuzzleOnline] SSE connection closed.');
            }
        };
    }

    // --- ROOM CREATION (HOST) ---
    async createRoom({ mode, targetPieces, maxPlayers, post }) {
        this.active = true;
        this.isHost = true;
        this.gameMode = mode || 'race';
        this.roomId = this.generateRoomCode();
        this.syncLogs = [];
        this.connections = [];
        this.clientPeerConnections = {};

        const seamsSeed = Math.floor(Math.random() * 1000000000);

        this.roomData = {
            id: this.roomId,
            hostId: this.playerId,
            mode: this.gameMode,
            status: 'waiting',
            targetPieces: targetPieces || 36,
            maxPlayers: maxPlayers || 4,
            seamsSeed,
            post: post || this.game.post || null,
            postUrl: this.game.getStableImageUrl() || '',
            aspectRatio: this.game.aspectRatio || 1.0,
            players: {
                [this.playerId]: {
                    id: this.playerId,
                    name: this.playerName,
                    isHost: true,
                    ready: true,
                    progressPct: 0,
                    placedCount: 0,
                    totalCount: targetPieces,
                    moves: 0,
                    time: 0,
                    won: false
                }
            },
            createdAt: new Date().toISOString()
        };

        this.addSyncLog(`Комната создана! Код: ${this.roomId}`);
        this.renderLobbyUI();

        this.listenSignal(this.roomId, async (msg) => {
            if (msg.type === 'OFFER') {
                const clientPlayerId = msg.playerId;
                this.addSyncLog(`Получен запрос от ${clientPlayerId.substring(0, 6)}...`);
                
                if (this.roomData.status === 'playing') {
                    await this.sendSignal(this.roomId, { type: 'ERROR', playerId: clientPlayerId, message: 'Игра уже началась!' });
                    return;
                }
                if (Object.keys(this.roomData.players).length >= this.roomData.maxPlayers) {
                    await this.sendSignal(this.roomId, { type: 'ERROR', playerId: clientPlayerId, message: 'Комната заполнена!' });
                    return;
                }

                const pc = new RTCPeerConnection({ iceServers: this.iceServers });
                this.clientPeerConnections[clientPlayerId] = pc;

                pc.ondatachannel = (event) => {
                    const dc = event.channel;
                    this.connections.push({ playerId: clientPlayerId, dc });

                    dc.onopen = () => {
                        this.addSyncLog(`Соединение установлено с участником`);
                        this.broadcastRoomData();
                    };

                    dc.onmessage = (e) => {
                        try {
                            const packet = JSON.parse(e.data);
                            this.handleHostReceivedMessage(clientPlayerId, packet);
                        } catch (err) {}
                    };

                    dc.onclose = () => {
                        this.connections = this.connections.filter(c => c.dc !== dc);
                        delete this.clientPeerConnections[clientPlayerId];
                        if (this.roomData?.players[clientPlayerId]) {
                            const leftName = this.roomData.players[clientPlayerId].name;
                            delete this.roomData.players[clientPlayerId];
                            this.addSyncLog(`Игрок ${leftName} вышел`);
                            this.broadcastRoomData();
                            this.updateLobbyPlayerList();
                        }
                    };
                };

                await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await new Promise(resolve => {
                    if (pc.iceGatheringState === 'complete') resolve();
                    else {
                        const check = () => {
                            if (pc.iceGatheringState === 'complete') {
                                pc.removeEventListener('icegatheringstatechange', check);
                                resolve();
                            }
                        };
                        pc.addEventListener('icegatheringstatechange', check);
                        setTimeout(resolve, 1500);
                    }
                });

                await this.sendSignal(this.roomId, { type: 'ANSWER', playerId: clientPlayerId, answer: pc.localDescription });
            }
        });

        // Heartbeat
        if (this.roomHeartbeatTimer) clearInterval(this.roomHeartbeatTimer);
        this.roomHeartbeatTimer = setInterval(() => {
            if (this.isHost && this.connections) {
                const ping = JSON.stringify({ type: 'PING' });
                this.connections.forEach(c => {
                    if (c.dc && c.dc.readyState === 'open') {
                        try { c.dc.send(ping); } catch (e) {}
                    }
                });
            }
        }, 4000);
    }

    // --- JOIN ROOM (CLIENT) ---
    async joinRoom(code) {
        this.active = true;
        this.isHost = false;
        const cleanCode = code.trim().toUpperCase();
        this.roomId = cleanCode;
        this.syncLogs = [];
        this.renderSyncScreen('Подключение...', `Подключение к комнате ${cleanCode}...`);

        this.listenSignal(cleanCode, async (msg) => {
            if (msg.type === 'ERROR' && msg.playerId === this.playerId) {
                this.showToast(msg.message || 'Ошибка подключения!', 'danger');
                this.renderLobbySetupUI();
                return;
            }
            if (msg.type === 'ANSWER' && msg.playerId === this.playerId) {
                this.addSyncLog('Получен ответ от Хоста, установление P2P канала...');
                if (this.pc) {
                    await this.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
                }
            }
        });

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.pc = pc;

        const dc = pc.createDataChannel('game');
        this.hostConn = dc;

        dc.onopen = () => {
            this.addSyncLog('DataChannel открыт! Отправка JOIN...');
            dc.send(JSON.stringify({
                type: 'JOIN',
                player: {
                    id: this.playerId,
                    name: this.playerName,
                    isHost: false,
                    ready: true,
                    progressPct: 0,
                    placedCount: 0,
                    totalCount: 36,
                    moves: 0,
                    time: 0,
                    won: false
                }
            }));
        };

        dc.onmessage = (e) => {
            try {
                const packet = JSON.parse(e.data);
                this.handleClientReceivedMessage(packet);
            } catch (err) {}
        };

        dc.onclose = () => {
            this.addSyncLog('Соединение с хостом разорвано');
            if (this.active) {
                if (typeof window.showConfirmModal === 'function') {
                    window.showConfirmModal('Сессия завершена', 'Организатор покинул комнату. Игра завершена.', { hideCancel: true }).then(() => {
                        this.leaveRoom();
                    });
                } else {
                    alert('Организатор покинул комнату. Игра завершена.');
                    this.leaveRoom();
                }
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise(resolve => {
            if (pc.iceGatheringState === 'complete') resolve();
            else {
                const check = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', check);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', check);
                setTimeout(resolve, 1500);
            }
        });

        this.addSyncLog('Отправка OFFER Хосту...');
        await this.sendSignal(cleanCode, { type: 'OFFER', playerId: this.playerId, offer: pc.localDescription });
    }

    broadcast(packet) {
        const json = JSON.stringify(packet);
        if (this.isHost) {
            this.connections.forEach(c => {
                if (c.dc && c.dc.readyState === 'open') {
                    try { c.dc.send(json); } catch (e) {}
                }
            });
        } else if (this.hostConn && this.hostConn.readyState === 'open') {
            try { this.hostConn.send(json); } catch (e) {}
        }
    }

    broadcastRoomData() {
        if (!this.isHost || !this.roomData) return;
        this.broadcast({ type: 'ROOM_DATA', roomData: this.roomData });
        this.updateLobbyPlayerList();
    }

    // --- HOST PACKET HANDLER ---
    handleHostReceivedMessage(clientPlayerId, packet) {
        if (packet.type === 'JOIN') {
            this.roomData.players[clientPlayerId] = packet.player;
            this.addSyncLog(`Игрок ${packet.player.name} вошел в лобби`);
            this.broadcastRoomData();
        } else if (packet.type === 'RACE_PROGRESS') {
            if (this.roomData.players[clientPlayerId]) {
                Object.assign(this.roomData.players[clientPlayerId], packet);
                if (this.roomData.mode === 'coop') {
                    this.roomData.teamProgress = packet.progressPct;
                }
                this.broadcast(packet); // Relay to all clients
                this.updateOnlineHUD();
            }
        } else if (packet.type === 'COOP_DRAG') {
            packet.playerId = clientPlayerId;
            this.broadcast(packet);
            if (this.game && typeof this.game.handleRemoteCoopDrag === 'function') {
                this.game.handleRemoteCoopDrag(packet);
            }
        } else if (packet.type === 'COOP_MOVE') {
            this.broadcast(packet); // Relay tile move to all clients
            if (this.game && typeof this.game.handleRemoteCoopMove === 'function') {
                this.game.handleRemoteCoopMove(packet);
            }
        } else if (packet.type === 'PLAYER_WIN') {
            if (this.roomData.players[clientPlayerId]) {
                this.roomData.players[clientPlayerId].won = true;
            }
            this.broadcast(packet);
            this.handlePlayerWin(packet);
        } else if (packet.type === 'LEAVE') {
            delete this.roomData.players[clientPlayerId];
            this.broadcastRoomData();
        } else if (packet.type === 'ACTION_REQUEST') {
            // Host handles the start of a voting session
            if (this.currentVote) {
                this.addSyncLog(`Уже идет голосование за ${this.currentVote.actionType}`);
                return;
            }
            this.currentVote = {
                actionType: packet.actionType,
                requesterId: clientPlayerId,
                requesterName: this.roomData.players[clientPlayerId]?.name || 'Участник',
                votes: { [clientPlayerId]: true }
            };
            this.broadcast({
                type: 'VOTING_STARTED',
                actionType: packet.actionType,
                requesterId: clientPlayerId,
                requesterName: this.currentVote.requesterName
            });
            // Host also needs to vote if they didn't request it
            if (clientPlayerId !== this.playerId) {
                this.showVoteDialog(packet.actionType, clientPlayerId, this.currentVote.requesterName);
            }
            this.checkVoteResult();
        } else if (packet.type === 'CAST_VOTE') {
            if (this.currentVote && this.currentVote.actionType === packet.actionType) {
                this.currentVote.votes[clientPlayerId] = packet.vote;
                this.checkVoteResult();
            }
        }
    }

    // --- CLIENT PACKET HANDLER ---
    handleClientReceivedMessage(packet) {
        if (packet.type === 'ROOM_DATA') {
            this.roomData = packet.roomData;
            this.gameMode = packet.roomData.mode;
            if (!this.inGame) {
                const playerList = document.getElementById('pzPlayerList');
                if (!playerList) {
                    this.renderLobbyUI();
                } else {
                    this.updateLobbyPlayerList();
                    const previewImg = document.getElementById('pzPreviewImg');
                    if (previewImg && packet.roomData.postUrl) {
                        previewImg.style.backgroundImage = `url('${packet.roomData.postUrl}')`;
                    }
                    const piecesInfo = document.getElementById('pzPiecesInfoText');
                    if (piecesInfo && packet.roomData.targetPieces) {
                        if (packet.roomData.aspectRatio && this.game) {
                            this.game.aspectRatio = packet.roomData.aspectRatio;
                        }
                        const target = packet.roomData.targetPieces;
                        if (this.game && typeof this.game.calculateGrid === 'function') {
                            const { cols: c, rows: r } = this.game.calculateGrid(target, this.game.aspectRatio || 1.0);
                            piecesInfo.textContent = `${c * r} деталей (${c}x${r})`;
                        } else {
                            piecesInfo.textContent = `${target} деталей`;
                        }
                    }
                }
            }
            if (packet.roomData.status === 'playing' && !this.inGame) {
                this.startGameFromData(packet.roomData);
            }
        } else if (packet.type === 'START_GAME') {
            this.roomData = packet.roomData;
            this.startGameFromData(packet.roomData);
        } else if (packet.type === 'RACE_PROGRESS') {
            if (this.roomData?.players[packet.playerId]) {
                Object.assign(this.roomData.players[packet.playerId], packet);
                if (this.roomData.mode === 'coop') {
                    this.roomData.teamProgress = packet.progressPct;
                }
                this.updateOnlineHUD();
            }
        } else if (packet.type === 'COOP_MOVE') {
            if (packet.playerId !== this.playerId && this.game && typeof this.game.handleRemoteCoopMove === 'function') {
                this.game.handleRemoteCoopMove(packet);
            }
        } else if (packet.type === 'COOP_DRAG') {
            if (packet.playerId !== this.playerId && this.game && typeof this.game.handleRemoteCoopDrag === 'function') {
                this.game.handleRemoteCoopDrag(packet);
            }
        } else if (packet.type === 'PLAYER_WIN') {
            this.handlePlayerWin(packet);
        } else if (packet.type === 'LEAVE') {
            if (this.roomData && packet.playerId === this.roomData.hostId) {
                if (this.active) {
                    if (typeof window.showConfirmModal === 'function') {
                        window.showConfirmModal('Сессия завершена', 'Организатор покинул комнату. Игра завершена.', { hideCancel: true }).then(() => {
                            this.leaveRoom();
                        });
                    } else {
                        alert('Организатор покинул комнату. Игра завершена.');
                        this.leaveRoom();
                    }
                }
            } else if (this.roomData?.players) {
                delete this.roomData.players[packet.playerId];
                if (this.game && typeof this.game.clearRemoteDrag === 'function') {
                    this.game.clearRemoteDrag(packet.playerId);
                }
                this.updateLobbyPlayerList();
                this.updateOnlineHUD();
            }
        } else if (packet.type === 'VOTING_STARTED') {
            if (packet.requesterId !== this.playerId) {
                this.showVoteDialog(packet.actionType, packet.requesterId, packet.requesterName);
            }
        } else if (packet.type === 'EXECUTE_ACTION') {
            this.showToast(`✅ Действие ${packet.actionType === 'RESTART' ? 'перезапуск' : 'автосбор'} одобрено командой!`, 'success');
            this.executeAction(packet.actionType);
        } else if (packet.type === 'VOTING_REJECTED') {
            this.showToast('Команда отклонила действие!', 'danger');
        }
    }

    // --- START GAME FOR ALL PLAYERS ---
    hostStartGame() {
        if (!this.isHost || !this.roomData) return;
        this.roomData.status = 'playing';
        const startPacket = { type: 'START_GAME', roomData: this.roomData };
        this.broadcast(startPacket);
        this.startGameFromData(this.roomData);
    }

    async startGameFromData(roomData) {
        this.inGame = true;
        this.closeLobbyModal();
        
        if (this.game) {
            this.game.isOnline = true;
            this.game.onlineManager = this;
            this.game.onlineMode = roomData.mode;
            this.game.targetPieces = roomData.targetPieces;

            // If the game hasn't been "started" yet (UI not created), do it now
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
            
            // Launch or re-initialize PuzzleGame with synchronized settings
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

            // Create top online HUD bar
            this.renderOnlineHUD();
        }
    }

    // --- EMIT EVENTS FROM PUZZLE GAME ---
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

    sendWinEvent(seconds, moves) {
        if (!this.active) return;
        const packet = {
            type: 'PLAYER_WIN',
            winnerId: this.playerId,
            winnerName: this.playerName,
            time: seconds,
            moves
        };
        this.broadcast(packet);
        this.handlePlayerWin(packet);
    }

    handlePlayerWin(packet) {
        const isSelf = packet.winnerId === this.playerId;
        const modeName = this.gameMode === 'race' ? 'Гонка' : 'Совместная сборка';
        
        if (this.gameMode === 'race') {
            if (isSelf) {
                this.showToast(`🥇 ПОБЕДА! Вы первым собрали пазл за ${this.game.formatTime(packet.time)}!`, 'success');
            } else {
                this.showToast(`🏆 Игрок "${packet.winnerName}" первым собрал пазл!`, 'info');
            }
        } else {
            this.showToast(`🎉 Пазл полностью собран всей командой!`, 'success');
        }
        
        this.renderLeaderboardModal(packet);
    }

    // --- UI RENDERING METHODS ---
    showToast(msg, type = 'info') {
        if (typeof window.showPuzzleToast === 'function') {
            window.showPuzzleToast(msg, 3500);
            return;
        }
        const colors = { success: '#10b981', danger: '#ef4444', info: '#3b82f6' };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: ${colors[type] || '#3b82f6'}; color: #fff; font-weight: bold;
            padding: 10px 20px; border-radius: 12px; z-index: 999999;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4); font-size: 0.9rem;
            animation: fadeIn 0.3s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    updateHostPiecesDropdown() {
        const piecesSelect = document.getElementById('pzPiecesSelect');
        if (!piecesSelect) return;
        const baseTargets = [16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 256, 324, 400];
        const diffs = [];
        const seenSizes = new Set();
        baseTargets.forEach(target => {
            const { cols: c, rows: r } = this.game.calculateGrid(target, this.game.aspectRatio || 1.0);
            const exactPieces = c * r;
            const sizeKey = `${c}x${r}`;
            if (!seenSizes.has(sizeKey)) {
                seenSizes.add(sizeKey);
                diffs.push({ target, exactPieces, c, r });
            }
        });
        const defaultTarget = this.roomData.targetPieces || 36;
        let selectedDiff = diffs.find(d => d.target === defaultTarget) || diffs.find(d => d.target >= 36) || diffs[2];
        if (selectedDiff) {
            this.roomData.targetPieces = selectedDiff.target;
        }
        piecesSelect.innerHTML = diffs.map(d => `<option value="${d.target}" style="background:#111;" ${d.target === selectedDiff?.target ? 'selected' : ''}>${d.exactPieces} деталей (${d.c}x${d.r})</option>`).join('');
    }

    renderLobbyUI() {
        this.closeLobbyModal();
        if (this.game && this.game.card) {
            this.game.card.style.display = 'none';
        }

        const modal = document.createElement('div');
        modal.id = 'puzzle-online-modal';
        modal.className = 'hl-overlay open';

        const card = document.createElement('div');
        card.className = 'hl-card';
        card.style.maxWidth = '520px';

        const previewUrl = this.roomData?.postUrl || (this.roomData?.post ? (this.roomData.post.sample_url || this.roomData.post.preview_url || this.roomData.post.file_url) : '') || (this.game.post ? (this.game.post.sample_url || this.game.post.preview_url || this.game.post.file_url) : '');

        const baseTargets = [16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 256, 324, 400];
        const diffs = [];
        const seenSizes = new Set();
        baseTargets.forEach(target => {
            const { cols: c, rows: r } = this.game.calculateGrid(target, this.game.aspectRatio || 1.0);
            const exactPieces = c * r;
            const sizeKey = `${c}x${r}`;
            if (!seenSizes.has(sizeKey)) {
                seenSizes.add(sizeKey);
                diffs.push({ target, exactPieces, c, r });
            }
        });

        const defaultTarget = this.roomData?.targetPieces || this.game.targetPieces || 36;
        let selectedDiff = diffs.find(d => d.target === defaultTarget) || diffs.find(d => d.target >= 36) || diffs[2];
        const optionsHtml = diffs.map(d => `<option value="${d.target}" style="background:#111;" ${d.target === selectedDiff.target ? 'selected' : ''}>${d.exactPieces} деталей (${d.c}x${d.r})</option>`).join('');

        card.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon">${icon('users', { size: 20 })}</div>
                    <h2 class="hl-app-title">${this.isHost ? 'Лобби Хоста (Мультиплеер)' : 'Комната Мультиплеера'}</h2>
                </div>
                <button class="hl-close-btn" id="pzOnlineCloseBtn">&times;</button>
            </div>

            <div class="hl-menu-container" style="gap: 16px; padding: 10px 0 0 0;">
                <span class="hl-hero-badge" style="background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(217, 119, 6, 0.15)); border-color: rgba(251, 191, 36, 0.4); color: #fcd34d;">
                    ${this.isHost ? 'Вы — Организатор (Хост)' : 'Вы подключились к комнате'}
                </span>

                <!-- Код комнаты -->
                <div style="width: 100%; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
                    <div style="text-align: left;">
                        <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">КОД КОМНАТЫ:</div>
                        <div style="font-size: 1.6rem; font-weight: 900; letter-spacing: 3px; color: #fbbf24; margin-top: 2px;">${this.roomId}</div>
                    </div>
                    <button id="pzCopyCodeBtn" class="hl-btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; min-width: auto; gap: 6px;">
                        ${icon('clipboard', { size: 14 })} Копировать
                    </button>
                </div>

                <!-- Превью картинки пазла и настройки (Хост выбирает, все видят) -->
                <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 14px; box-sizing: border-box;">
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); font-weight: bold; width: 100%; display: flex; justify-content: space-between; align-items: center;">
                        <span style="display:flex; align-items:center; gap:6px;">${icon('image', { size: 14 })} Выбранный пазл:</span>
                        ${this.isHost ? `
                            <button id="pzSkipPuzzleBtn" class="hl-btn-secondary" style="padding: 4px 10px; font-size: 0.75rem; min-width: auto; height: auto;">
                                ${icon('refresh', { size: 12 })} Пропустить
                            </button>
                        ` : `
                            <span style="font-size: 0.75rem; color: #a78bfa;" id="pzPiecesInfoText">${this.roomData?.targetPieces || 36} деталей</span>
                        `}
                    </div>
                    <div id="pzPreviewImg" style="width: 100%; height: 140px; border-radius: 8px; background-image: url('${previewUrl}'); background-size: contain; background-position: center; background-repeat: no-repeat;"></div>

                    ${this.isHost ? `
                        <!-- Поиск по ID (для Хоста) -->
                        <div style="display:flex; gap:8px; width:100%; margin-top:4px;">
                            <input type="text" id="pzHostIdInput" class="hl-input" placeholder="Поиск по ID (например, 10142981)" style="flex:1; font-size:0.8rem; padding:6px 10px; text-align:center;" />
                            <button id="pzHostIdLoadBtn" class="hl-btn-secondary" style="padding: 6px 14px; font-size: 0.8rem; min-width: auto;">Найти</button>
                        </div>

                        <!-- Деталей в пазле (для Хоста) -->
                        <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                            <label style="font-size: 0.75rem; color: rgba(255,255,255,0.6); font-weight: bold;">Количество деталей:</label>
                            <select id="pzPiecesSelect" class="hl-input" style="font-weight: bold; cursor: pointer; font-size: 0.8rem; padding: 6px 12px; background: rgba(255, 255, 255, 0.06);">
                                ${optionsHtml}
                            </select>
                        </div>
                    ` : ''}
                </div>

                <!-- Участники -->
                <div style="width: 100%; display: flex; flex-direction: column; gap: 6px; text-align: left;">
                    <div style="font-size: 0.85rem; font-weight: 700; color: rgba(255, 255, 255, 0.7);">
                        Участники (<span id="pzPlayerCount">1</span>/${this.roomData.maxPlayers}):
                    </div>
                    <div id="pzPlayerList" class="hl-leaderboard" style="display: flex; flex-direction: column; gap: 6px; width: 100%; max-height: 130px; overflow-y: auto; box-sizing: border-box; padding-right: 4px;"></div>
                </div>

                <!-- Логи подключения -->
                <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; text-align: left;">
                    <div style="font-size: 0.72rem; font-weight: 700; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">Логи:</div>
                    <div id="puzzle-sync-logs" style="width: 100%; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 8px 12px; font-family: monospace; font-size: 0.7rem; color: #888; height: 60px; overflow-y: auto; box-sizing: border-box;">
                        Ожидание игроков...
                    </div>
                </div>

                <!-- Кнопка запуска / Ожидание -->
                <div style="width: 100%; margin-top: 4px;">
                    ${this.isHost ? `
                        <button id="pzStartGameBtn" class="hl-btn-primary" style="width: 100%; background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35);">
                            🚀 НАЧАТЬ ИГРУ
                        </button>
                    ` : `
                        <div style="text-align: center; padding: 12px; background: rgba(167, 139, 250, 0.1); border: 1px dashed rgba(167, 139, 250, 0.3); border-radius: 14px; color: #c4b5fd; font-weight: bold; font-size: 0.88rem; animation: pulse 1.5s infinite;">
                            ⏳ Ожидание запуска игры организатором...
                        </div>
                    `}
                </div>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        document.getElementById('pzOnlineCloseBtn').onclick = () => this.leaveRoom();
        document.getElementById('pzCopyCodeBtn').onclick = () => {
            navigator.clipboard.writeText(this.roomId);
            this.showToast('Код комнаты скопирован!', 'success');
        };

        if (this.isHost) {
            document.getElementById('pzStartGameBtn').onclick = () => this.hostStartGame();

            const piecesSelect = document.getElementById('pzPiecesSelect');
            if (piecesSelect) {
                piecesSelect.onchange = () => {
                    this.roomData.targetPieces = parseInt(piecesSelect.value, 10);
                    this.roomData.seamsSeed = Math.floor(Math.random() * 1000000000);
                    this.broadcastRoomData();
                };
            }

            const skipBtn = document.getElementById('pzSkipPuzzleBtn');
            if (skipBtn) {
                skipBtn.onclick = () => {
                    if (!window.gallery) return;
                    const isFavActive = window.gallery.isFavoritesActive;
                    const allPosts = Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                        ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                        : [];
                        
                    const isVideo = p => p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
                    const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
                    const isTooTall = p => {
                        if (allowLong) return false;
                        return p.width && p.height && (p.height / p.width > 1.4);
                    };
                    const eligible = allPosts.filter(p => !isVideo(p) && !isTooTall(p));
                    
                    let solvedIds = [];
                    try { solvedIds = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]'); } catch (err) {}
                    
                    const excludePostId = this.roomData.post ? this.roomData.post.id : null;
                    let unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId);
                    
                    if (unsolved.length === 0) unsolved = eligible.filter(p => p && p.id !== excludePostId);
                    if (unsolved.length === 0) unsolved = eligible;

                    if (unsolved.length === 0) {
                        this.showToast('Нет других подходящих картинок!', 'warning');
                        return;
                    }

                    const nextPost = unsolved[Math.floor(Math.random() * unsolved.length)];
                    this.roomData.post = nextPost;
                    let ratio = 1.0;
                    if (nextPost.width && nextPost.height && nextPost.width > 0 && nextPost.height > 0) {
                        ratio = nextPost.width / nextPost.height;
                    }
                    const newAspectRatio = allowLong ? Math.max(0.05, Math.min(20.0, ratio)) : Math.max(0.4, Math.min(1.8, ratio));
                    this.game.aspectRatio = newAspectRatio;
                    this.roomData.aspectRatio = newAspectRatio;
                    const newPreviewUrl = nextPost.sample_url || nextPost.preview_url || nextPost.file_url;
                    this.roomData.postUrl = newPreviewUrl;
                    this.roomData.seamsSeed = Math.floor(Math.random() * 1000000000);

                    document.getElementById('pzPreviewImg').style.backgroundImage = `url('${newPreviewUrl}')`;
                    this.updateHostPiecesDropdown();
                    this.broadcastRoomData();
                    this.showToast('Пазл изменен организатором!', 'success');
                };
            }

            const idInput = document.getElementById('pzHostIdInput');
            const idLoadBtn = document.getElementById('pzHostIdLoadBtn');
            if (idInput && idLoadBtn) {
                idLoadBtn.onclick = async () => {
                    const rawId = idInput.value.trim();
                    if (!rawId) {
                        this.showToast('Введите ID поста!', 'danger');
                        return;
                    }
                    idLoadBtn.disabled = true;
                    idLoadBtn.textContent = '...';
                    try {
                        const post = await fetchPostById(rawId);
                        if (post && post.file_url) {
                            const isVideo = p => p && p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
                            if (isVideo(post)) {
                                this.showToast('Это видео (нельзя для пазла)!', 'danger');
                                return;
                            }
                            this.roomData.post = post;
                            const newPreviewUrl = post.sample_url || post.preview_url || post.file_url;
                            this.roomData.postUrl = newPreviewUrl;
                            this.roomData.seamsSeed = Math.floor(Math.random() * 1000000000);
                            
                            let ratio = 1.0;
                            if (post.width && post.height && post.width > 0 && post.height > 0) {
                                ratio = post.width / post.height;
                            }
                            const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
                            const newAspectRatio = allowLong ? Math.max(0.05, Math.min(20.0, ratio)) : Math.max(0.4, Math.min(1.8, ratio));
                            this.game.aspectRatio = newAspectRatio;
                            this.roomData.aspectRatio = newAspectRatio;

                            document.getElementById('pzPreviewImg').style.backgroundImage = `url('${newPreviewUrl}')`;
                            this.updateHostPiecesDropdown();
                            this.broadcastRoomData();
                            idInput.value = '';
                            this.showToast('Пазл успешно загружен по ID!', 'success');
                        } else {
                            this.showToast('Пост с таким ID не найден!', 'danger');
                        }
                    } catch (err) {
                        this.showToast('Ошибка загрузки по ID', 'danger');
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

        this.updateLobbyPlayerList();
    }

    renderLobbySetupUI() {
        this.closeLobbyModal();
        if (this.game && this.game.card) {
            this.game.card.style.display = 'none';
        }

        const modal = document.createElement('div');
        modal.id = 'puzzle-online-modal';
        modal.className = 'hl-overlay open';

        const card = document.createElement('div');
        card.className = 'hl-card';
        card.style.maxWidth = '480px';

        card.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon">${icon('puzzle', { size: 20 })}</div>
                    <h2 class="hl-app-title">Мультиплеер Пазлов</h2>
                </div>
                <button class="hl-close-btn" id="pzSetupCloseBtn">&times;</button>
            </div>

            <div class="hl-menu-container" style="gap: 20px; padding: 10px 0 0 0;">
                <span class="hl-hero-badge">Интерактивный Онлайн</span>
                <h1 class="hl-menu-title" style="font-size: 1.85rem;">Собирайте вместе с друзьями</h1>
                <p class="hl-menu-desc" style="font-size: 0.9rem; margin-bottom: 4px;">
                    Устраивайте состязания на скорость в режиме «Гонка» или объединяйте силы в режиме «Совместный сбор»! Выберите режим, укажите ник и создайте комнату.
                </p>

                <!-- Никнейм -->
                <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left;">
                    <label class="hl-form-label" style="display: flex; align-items: center; gap: 6px;">
                        ${icon('user', { size: 14 })} Ваш Никнейм:
                    </label>
                    <input type="text" id="pzNickInput" class="hl-input" value="${this.playerName}" placeholder="Введите ваш ник..." style="font-weight: bold;" />
                </div>

                <!-- Режим игры -->
                <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left;">
                    <label class="hl-form-label" style="display: flex; align-items: center; gap: 6px;">
                        ${icon('gamepad', { size: 14 })} Режим Мультиплеера:
                    </label>
                    <div class="hl-setup-tabs">
                        <button id="pzModeRaceBtn" class="hl-setup-tab active" style="font-size: 0.8rem; padding: 10px 8px;">
                            🏁 Гонка (Кто быстрее)
                        </button>
                        <button id="pzModeCoopBtn" class="hl-setup-tab" style="font-size: 0.8rem; padding: 10px 8px;">
                            🤝 Совместный сбор
                        </button>
                    </div>
                </div>

                <!-- Кнопка создания -->
                <button id="pzCreateRoomBtn" class="hl-btn-primary" style="width: 100%; margin-top: 6px; background: linear-gradient(135deg, #ec4899, #f59e0b); box-shadow: 0 8px 24px rgba(236, 72, 153, 0.35);">
                    ${icon('plus', { size: 16 })} СОЗДАТЬ НОВУЮ КОМНАТУ
                </button>

                <!-- Разделитель -->
                <div style="display: flex; align-items: center; gap: 12px; width: 100%; margin: 4px 0;">
                    <div style="flex: 1; height: 1px; background: rgba(255, 255, 255, 0.1);"></div>
                    <span style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.4); font-weight: 800; letter-spacing: 1px;">ИЛИ ВОЙТИ ПО КОДУ</span>
                    <div style="flex: 1; height: 1px; background: rgba(255, 255, 255, 0.1);"></div>
                </div>

                <!-- Вход по коду -->
                <div style="display: flex; gap: 10px; width: 100%;">
                    <input type="text" id="pzJoinCodeInput" class="hl-input" placeholder="КОД КОМНАТЫ" style="flex: 1; text-transform: uppercase; text-align: center; font-weight: 900; letter-spacing: 2px; font-size: 1.05rem;" />
                    <button id="pzJoinRoomBtn" class="hl-btn-secondary" style="padding: 12px 24px;">
                        ${icon('arrowRight', { size: 16 })} Войти
                    </button>
                </div>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        let selectedMode = 'race';

        const nickInput = document.getElementById('pzNickInput');
        nickInput.oninput = () => {
            this.playerName = nickInput.value.trim() || 'Игрок';
            localStorage.setItem('r34_puzzle_nickname', this.playerName);
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

        document.getElementById('pzSetupCloseBtn').onclick = () => {
            if (this.game) {
                this.game.destroy();
            }
            modal.remove();
        };

        document.getElementById('pzCreateRoomBtn').onclick = () => {
            this.createRoom({ mode: selectedMode, targetPieces: 36, maxPlayers: 8 });
        };

        document.getElementById('pzJoinRoomBtn').onclick = () => {
            const code = document.getElementById('pzJoinCodeInput').value.trim();
            if (!code) {
                this.showToast('Введите код комнаты!', 'danger');
                return;
            }
            this.joinRoom(code);
        };
    }

    renderSyncScreen(title, subtitle) {
        this.closeLobbyModal();
        if (this.game && this.game.card) {
            this.game.card.style.display = 'none';
        }

        const modal = document.createElement('div');
        modal.id = 'puzzle-online-modal';
        modal.className = 'hl-overlay open';

        const card = document.createElement('div');
        card.className = 'hl-card';
        card.style.maxWidth = '440px';



        card.innerHTML = `
            <div class="hl-menu-container" style="gap: 20px; padding: 10px;">
                <div class="puzzle-loader-spinner" style="width: 48px; height: 48px; margin: 0; border: 4px solid rgba(255, 255, 255, 0.1); border-top: 4px solid #a78bfa; border-radius: 50%; animation: pzSpin 1s linear infinite;"></div>
                <h2 class="hl-menu-title" style="font-size: 1.5rem; margin: 0;">${title}</h2>
                <p class="hl-menu-desc" style="font-size: 0.9rem; color: rgba(255,255,255,0.7);">${subtitle}</p>
                <div id="puzzle-sync-logs" style="width: 100%; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 10px 14px; font-family: monospace; font-size: 0.72rem; color: #888; height: 80px; overflow-y: auto; text-align: left; box-sizing: border-box;"></div>
                <button id="pzCancelSyncBtn" class="hl-btn-secondary" style="width: 100%; padding: 10px 16px;">Отмена</button>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        document.getElementById('pzCancelSyncBtn').onclick = () => this.leaveRoom();
    }

    updateLobbyPlayerList() {
        const playerList = document.getElementById('pzPlayerList');
        const playerCount = document.getElementById('pzPlayerCount');
        if (!playerList || !this.roomData) return;

        const players = Object.values(this.roomData.players || {});
        if (playerCount) playerCount.textContent = players.length;

        playerList.innerHTML = players.map(p => `
            <div class="hl-player-row" style="width: 100%; box-sizing: border-box;">
                <div class="hl-player-name">
                    ${p.isHost ? icon('crown', { size: 16, className: 'hl-host-crown' }) : icon('user', { size: 16 })} 
                    <span>${p.name}</span> 
                    ${p.id === this.playerId ? '<small style="color: #a78bfa;">(Вы)</small>' : ''}
                </div>
                <div class="hl-player-status hl-status-done">
                    Готов
                </div>
            </div>
        `).join('');
    }

    closeLobbyModal() {
        const existing = document.getElementById('puzzle-online-modal');
        if (existing) existing.remove();
    }

    requestAction(actionType) {
        if (!this.active) return;

        // In race mode, RESTART is individual and doesn't need voting
        if (actionType === 'RESTART' && this.gameMode === 'race') {
            this.executeAction('RESTART');
            return;
        }

        const actionLabel = actionType === 'RESTART' ? 'перезапуск' : 'автосбор';
        this.addSyncLog(`Запрос на ${actionLabel}...`);
        this.showToast(`⌛ Запрос на ${actionLabel} отправлен команде...`, 'info');
        if (this.isHost) {
            this.handleHostReceivedMessage(this.playerId, { type: 'ACTION_REQUEST', actionType });
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
            this.handleHostReceivedMessage(this.playerId, { type: 'CAST_VOTE', actionType, vote: confirmed });
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

    renderOnlineHUD() {
        const hudContainer = document.getElementById('puzzle-online-hud');
        if (hudContainer) hudContainer.remove();

        const card = this.game.card;
        if (!card) return;

        const hud = document.createElement('div');
        hud.id = 'puzzle-online-hud';
        hud.style.cssText = `
            width: 100%; background: linear-gradient(135deg, rgba(20,20,35,0.9), rgba(30,30,50,0.9));
            border: 1px solid rgba(139,92,246,0.3); border-radius: 12px;
            padding: 8px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px;
            flex-wrap: wrap; margin-bottom: 6px; box-sizing: border-box;
        `;

        if (this.gameMode === 'race') {
            hud.innerHTML = `
                <div style="font-size:0.8rem; font-weight:bold; color:#a78bfa; display:flex; align-items:center; gap:6px;">
                    🏁 Гонка на скорость (${this.roomId})
                </div>
                <div id="pzRaceLeaderboardBars" style="display:flex; align-items:center; gap:12px; flex:1; overflow-x:auto;"></div>
            `;
        } else {
            hud.innerHTML = `
                <div style="font-size:0.8rem; font-weight:bold; color:#a78bfa; display:flex; align-items:center; gap:6px;">
                    🤝 Совместная сборка (${this.roomId})
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

        this.updateOnlineHUD();
    }

    updateOnlineHUD() {
        if (!this.inGame || !this.roomData) return;

        if (this.gameMode === 'race') {
            const container = document.getElementById('pzRaceLeaderboardBars');
            if (!container) return;

            const players = Object.values(this.roomData.players || {});
            container.innerHTML = players.map(p => {
                const isMe = p.id === this.playerId;
                const pct = p.progressPct || 0;
                return `
                    <div style="display:flex; flex-direction:column; gap:2px; min-width:110px; flex:1; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px; border:${isMe ? '1px solid #38bdf8' : '1px solid transparent'};">
                        <div style="display:flex; justify-content:space-between; font-size:0.72rem; font-weight:bold; color:${isMe ? '#38bdf8' : '#fff'};">
                            <span>${p.name}</span>
                            <span>${pct}%</span>
                        </div>
                        <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:linear-gradient(90deg,#8b5cf6,#ec4899); transition:width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        } else if (this.gameMode === 'coop') {
            const coopStatus = document.getElementById('pzCoopStatusText');
            if (coopStatus && this.game) {
                const progress = this.game.getConnectionProgress();
                const pct = progress.pct;
                coopStatus.textContent = `Собрано всей командой: ${progress.connected} / ${progress.total} (${pct}%)`;
            }
        }
    }

    renderLeaderboardModal(winData) {
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
            border: 1px solid rgba(16,185,129,0.5); border-radius: 20px;
            width: 100%; max-width: 460px; padding: 24px; color: #fff;
            box-shadow: 0 16px 40px rgba(0,0,0,0.6); display:flex; flex-direction:column; gap:16px; align-items:center; text-align:center;
        `;

        const players = Object.values(this.roomData?.players || {}).sort((a,b) => (b.progressPct || 0) - (a.progressPct || 0));



        card.innerHTML = `
            <div style="font-size:2.5rem;">🏆</div>
            <div style="font-size:1.4rem; font-weight:900; color:#fbbf24;">ИГРА ЗАВЕРШЕНА!</div>
            <div style="font-size:0.9rem; color:#aaa;">Победитель: <b style="color:#fff;">${winData.winnerName}</b> (${this.game.formatTime(winData.time)})</div>

            <div style="width:100%; display:flex; flex-direction:column; gap:6px;">
                ${players.map((p, idx) => `
                    <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.06); padding:8px 12px; border-radius:8px; border:${p.id === winData.winnerId ? '1px solid #fbbf24' : 'none'};">
                        <div style="display:flex; align-items:center; gap:8px; font-weight:bold; font-size:0.85rem;">
                            <span>#${idx + 1}</span> <span>${p.name}</span>
                        </div>
                        <div style="font-weight:bold; font-size:0.85rem; color:#38bdf8;">
                            ${(p.progressPct !== undefined && p.progressPct !== null) ? p.progressPct : 100}% (${p.moves || 0} ходов)
                        </div>
                    </div>
                `).join('')}
            </div>

            <button id="pzFinishOnlineBtn" style="width:100%; padding:12px; background:linear-gradient(135deg,#3b82f6,#2563eb); border:none; border-radius:10px; color:#fff; font-weight:bold; font-size:0.95rem; cursor:pointer;">
                Вернуться в меню
            </button>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        document.getElementById('pzFinishOnlineBtn').onclick = () => {
            this.leaveRoom();
            modal.remove();
        };
    }

    leaveRoom() {
        this.broadcast({ type: 'LEAVE', playerId: this.playerId });
        this.active = false;
        const wasInGame = this.inGame;
        this.inGame = false;
        this.closeLobbyModal();
        
        if (this.eventSource) {
            try { this.eventSource.close(); } catch(e) {}
            this.eventSource = null;
        }

        if (this.roomHeartbeatTimer) clearInterval(this.roomHeartbeatTimer);

        const hud = document.getElementById('puzzle-online-hud');
        if (hud) hud.remove();

        if (this.game) {
            const gameRef = this.game;
            this.game.isOnline = false;
            this.game.onlineManager = null;
            this.game = null;
            
            // Always destroy the game to return to the library/results view
            gameRef.destroy();
        }
    }
}
