/**
 * puzzleOnline.js - Serverless P2P Multiplayer Manager for Puzzle Game
 * Uses ntfy.sh for WebRTC signaling and DataChannels for ultra-low latency game sync.
 * Modes:
 *   1. 'race' - Competitive speedrun ("Кто быстрее соберет")
 *   2. 'coop' - Collaborative assembly ("Совместный сбор")
 */

import { icon } from '../icons.js';
import { fetchPostById } from '../api.js';
import { makeCustomDropdown } from './customDropdown.js';
import { escapeHtml } from '../utils.js';

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
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:stun.sipgate.net:3478' }
        ];

        this.processedPacketIds = new Set();
        this.skippedPuzzleIds = new Set();
        this.pollTimer = null;

        // Check for saved Metered key
        const savedKey = localStorage.getItem('gameMeteredKey') || localStorage.getItem('hlMeteredKey') || localStorage.getItem('r34_metered_key');
        if (savedKey) {
            this.setupMeteredIce(savedKey);
        }
        this.currentVote = null;
    }

    setupMeteredIce(key) {
        if (!key || typeof key !== 'string') return;
        const cleanKey = key.trim();
        const appName = cleanKey.includes('.') ? cleanKey.split('.')[0] : cleanKey;
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: `stun:${appName}.metered.ca:80` },
            { urls: `stun:${appName}.metered.ca:443` },
            {
                urls: [
                    `turn:${appName}.metered.ca:80?transport=udp`,
                    `turn:${appName}.metered.ca:443?transport=tcp`
                ],
                username: 'metered',
                credential: 'key'
            }
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

    async sendSignal(code, data, targetId = null) {
        if (!data) return;
        if (!data._msgId) {
            data._msgId = `${this.playerId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }

        // Only allow WebRTC handshake signals through ntfy
        const allowedSignalingTypes = ['JOIN', 'JOIN_ACCEPT', 'JOIN_REJECT', 'OFFER', 'ANSWER', 'ICE_CANDIDATE', 'GUEST_JOINED', 'HOST_ANNOUNCE'];
        if (data.type && !allowedSignalingTypes.includes(data.type)) {
            return;
        }

        // Always publish to public ntfy.sh topic so players on different local machines can discover each other
        const topic = `r34_pz_sig_${code}`;
        try {
            await fetch(`https://ntfy.sh/${topic}`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        } catch (e) {
            console.error('[PuzzleOnline] Send signal error:', e);
            this.signalQueue.push({ code, data, targetId });
        }

        // Also broadcast to local room endpoint if available
        try {
            fetch('/api/room/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: code,
                    senderId: this.playerId,
                    targetId: targetId || data.targetPlayerId || null,
                    packet: data
                })
            }).catch(() => {});
        } catch (e) {}
    }

    stopSignaling() {
        if (this.eventSource) {
            try { this.eventSource.close(); } catch (err) {}
            this.eventSource = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    listenSignal(code, onMessage) {
        this.stopSignaling();

        const safeOnMessage = (msg) => {
            if (!msg || typeof msg !== 'object') return;
            if (msg._msgId) {
                if (this.processedPacketIds.has(msg._msgId)) return;
                this.processedPacketIds.add(msg._msgId);
                if (this.processedPacketIds.size > 2000) {
                    const first = this.processedPacketIds.values().next().value;
                    this.processedPacketIds.delete(first);
                }
            }
            onMessage(msg);
        };

        while (this.signalQueue.length > 0) {
            const queued = this.signalQueue.shift();
            this.sendSignal(queued.code, queued.data, queued.targetId);
        }

        // Connect to public ntfy.sh SSE stream for room signaling
        const topic = `r34_pz_sig_${code}`;
        const esUrl = `https://ntfy.sh/${topic}/sse`;
        try {
            this.eventSource = new EventSource(esUrl);
            this.eventSource.onmessage = (event) => {
                try {
                    const packet = JSON.parse(event.data);
                    if (packet.message) {
                        const msg = JSON.parse(packet.message);
                        safeOnMessage(msg);
                    }
                } catch (e) {}
            };
            this.eventSource.onerror = (e) => {
                if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
                    console.log('[PuzzleOnline] SSE connection closed.');
                }
            };
        } catch (err) {
            console.error('[PuzzleOnline] SSE connection failed:', err);
        }
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
        this.skippedPuzzleIds = new Set();

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

        // Register room on server
        try {
            await fetch('/api/room/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId,
                    playerId: this.playerId,
                    playerName: this.playerName,
                    gameType: 'puzzle',
                    roomData: this.roomData
                })
            });
        } catch (e) {}

        this.addSyncLog(`Комната создана! Код: ${this.roomId}`);
        this.renderLobbyUI();

        this.listenSignal(this.roomId, async (msg) => {
            if (msg.type === 'JOIN') {
                const clientPlayerId = msg.player?.id || msg.playerId;
                if (clientPlayerId && clientPlayerId !== this.playerId) {
                    this.handleHostReceivedMessage(clientPlayerId, msg);
                }
            } else if (msg.type === 'OFFER') {
                const clientPlayerId = msg.playerId;
                this.addSyncLog(`Получен запрос на P2P канал от ${clientPlayerId.substring(0, 6)}...`);
                
                if (this.roomData.status === 'playing') {
                    await this.sendSignal(this.roomId, { type: 'ERROR', playerId: clientPlayerId, message: 'Игра уже началась!' }, clientPlayerId);
                    return;
                }
                if (Object.keys(this.roomData.players).length >= this.roomData.maxPlayers && !this.roomData.players[clientPlayerId]) {
                    await this.sendSignal(this.roomId, { type: 'ERROR', playerId: clientPlayerId, message: 'Комната заполнена!' }, clientPlayerId);
                    return;
                }

                try {
                    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
                    this.clientPeerConnections[clientPlayerId] = pc;

                    pc.onicecandidateerror = (err) => {
                        console.warn('[PuzzleOnline WebRTC] ICE Candidate notice (handled):', err);
                    };

                    pc.oniceconnectionstatechange = () => {
                        console.log(`[PuzzleOnline WebRTC] Host ICE state for ${clientPlayerId}:`, pc.iceConnectionState);
                    };

                    pc.ondatachannel = (event) => {
                        const dc = event.channel;
                        this.connections = this.connections.filter(c => c.playerId !== clientPlayerId);
                        this.connections.push({ playerId: clientPlayerId, dc });

                        dc.onopen = () => {
                            this.addSyncLog(`P2P DataChannel открыт с участником`);
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
                            setTimeout(resolve, 1200);
                        }
                    });

                    await this.sendSignal(this.roomId, { type: 'ANSWER', playerId: clientPlayerId, answer: pc.localDescription }, clientPlayerId);
                } catch (e) {
                    console.warn('[PuzzleOnline] P2P offer handling notice (relay active):', e);
                }
            } else if (msg.type === 'LEAVE') {
                const clientPlayerId = msg.playerId;
                if (clientPlayerId && this.roomData?.players[clientPlayerId]) {
                    const leftName = this.roomData.players[clientPlayerId].name;
                    delete this.roomData.players[clientPlayerId];
                    this.addSyncLog(`Игрок ${leftName} вышел`);
                    this.broadcastRoomData();
                    this.updateLobbyPlayerList();
                }
            } else if (msg.playerId && msg.playerId !== this.playerId) {
                this.handleHostReceivedMessage(msg.playerId, msg);
            }
        });

        // Heartbeat
        if (this.roomHeartbeatTimer) clearInterval(this.roomHeartbeatTimer);
        this.roomHeartbeatTimer = setInterval(() => {
            if (this.isHost) {
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
        this.skippedPuzzleIds = new Set();
        this.renderSyncScreen('Подключение...', `Подключение к комнате ${cleanCode}...`);

        const myPlayerObj = {
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
        };

        // 1. Join room on server
        let initialRoomData = null;
        try {
            const joinResp = await fetch('/api/room/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: cleanCode,
                    playerId: this.playerId,
                    playerName: this.playerName,
                    playerInfo: myPlayerObj
                })
            });
            if (joinResp.ok) {
                const joinData = await joinResp.json();
                if (joinData.roomData) {
                    initialRoomData = joinData.roomData;
                    this.roomData = initialRoomData;
                    this.gameMode = initialRoomData.mode;
                    this.addSyncLog(`Успешное подключение к серверу комнаты ${cleanCode}`);
                    this.renderLobbyUI();
                }
            }
        } catch (err) {
            console.warn('[PuzzleOnline] Server join fetch notice:', err);
        }

        // 2. Listen to room signals (Server SSE + relay + ntfy fallback)
        this.listenSignal(cleanCode, async (msg) => {
            if (msg.type === 'ERROR' && msg.playerId === this.playerId) {
                this.showToast(msg.message || 'Ошибка подключения!', 'danger');
                this.renderLobbySetupUI();
                return;
            }
            if (msg.type === 'ROOM_CLOSED') {
                this.showToast('🛑 Комната закрыта организатором. Соединение разорвано.', 'danger');
                if (typeof window.showConfirmModal === 'function') {
                    window.showConfirmModal('Комната закрыта', '🛑 Организатор закрыл комнату. Соединение отключено.', { hideCancel: true }).then(() => {
                        this.leaveRoom();
                    });
                } else {
                    this.leaveRoom();
                }
                return;
            }
            if (msg.type === 'ANSWER' && msg.playerId === this.playerId) {
                this.addSyncLog('Получен ответ от Хоста, установление P2P канала...');
                if (this.pc && this.pc.signalingState === 'have-local-offer') {
                    try {
                        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
                    } catch (e) {}
                }
            } else {
                this.handleClientReceivedMessage(msg);
            }
        });

        // 3. Immediately send JOIN via server relay
        await this.sendSignal(cleanCode, {
            type: 'JOIN',
            playerId: this.playerId,
            player: myPlayerObj
        }, this.roomData?.hostId);

        // 4. In parallel, attempt WebRTC P2P connection
        try {
            const pc = new RTCPeerConnection({ iceServers: this.iceServers });
            this.pc = pc;

            pc.onicecandidateerror = (err) => {
                console.warn('[PuzzleOnline WebRTC] Client ICE notice (handled):', err);
            };

            pc.oniceconnectionstatechange = () => {
                console.log(`[PuzzleOnline WebRTC] Client ICE state:`, pc.iceConnectionState);
                if (pc.iceConnectionState === 'connected') {
                    this.addSyncLog('P2P соединение активно');
                } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                    this.addSyncLog('P2P недоступен, активен серверный релей');
                }
            };

            const dc = pc.createDataChannel('game');
            this.hostConn = dc;

            dc.onopen = () => {
                this.addSyncLog('DataChannel P2P открыт!');
                dc.send(JSON.stringify({
                    type: 'JOIN',
                    playerId: this.playerId,
                    player: myPlayerObj
                }));
                // Guest stops listening to ntfy signaling now that direct DataChannel is active
                this.stopSignaling();
            };

            dc.onmessage = (e) => {
                try {
                    const packet = JSON.parse(e.data);
                    this.handleClientReceivedMessage(packet);
                } catch (err) {}
            };

            dc.onclose = () => {
                console.log('[PuzzleOnline] P2P DataChannel closed, continuing with server relay');
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
                    setTimeout(resolve, 1200);
                }
            });

            this.addSyncLog('Отправка P2P запроса Хосту...');
            await this.sendSignal(cleanCode, { type: 'OFFER', playerId: this.playerId, offer: pc.localDescription }, this.roomData?.hostId);
        } catch (e) {
            console.warn('[PuzzleOnline] P2P init notice (server relay active):', e);
        }
    }

    broadcast(packet) {
        if (!packet._msgId) {
            packet._msgId = `${this.playerId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        const json = JSON.stringify(packet);
        if (this.isHost) {
            // Send via open DataChannels
            this.connections.forEach(c => {
                if (c.dc && c.dc.readyState === 'open') {
                    try { c.dc.send(json); } catch (e) {}
                }
            });
            // Also broadcast via server relay
            this.sendSignal(this.roomId, packet, null);
        } else {
            let sentDc = false;
            if (this.hostConn && this.hostConn.readyState === 'open') {
                try {
                    this.hostConn.send(json);
                    sentDc = true;
                } catch (e) {}
            }
            // Send via server relay to host
            this.sendSignal(this.roomId, { ...packet, playerId: this.playerId }, this.roomData?.hostId);
        }
    }

    broadcastRoomData() {
        if (!this.isHost || !this.roomData) return;
        this.broadcast({ type: 'ROOM_DATA', roomData: this.roomData });
        this.updateLobbyPlayerList();
        this.updateLobbyPuzzleIdPill();
    }

    // --- HOST PACKET HANDLER ---
    handleHostReceivedMessage(clientPlayerId, packet) {
        if (packet.type === 'JOIN') {
            const alreadyExists = !!this.roomData.players[clientPlayerId];
            this.roomData.players[clientPlayerId] = packet.player;
            if (!alreadyExists) {
                const actionStr = this.inGame ? 'подключился к игре' : 'вошел в лобби';
                this.showToast(`👤 Игрок "${packet.player.name}" ${actionStr}`, 'info');
            }
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
                this.roomData.players[clientPlayerId].surrendered = !!packet.isSurrendered;
            }
            this.broadcast(packet);
            this.handlePlayerWin(packet);
        } else if (packet.type === 'LEAVE') {
            const oldPlayer = this.roomData?.players?.[clientPlayerId];
            if (oldPlayer) {
                const actionStr = this.inGame ? 'вышел из игры' : 'покинул лобби';
                this.showToast(`🚪 Игрок "${oldPlayer.name}" ${actionStr}`, 'danger');
            }
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
            const oldPlayers = this.roomData?.players || {};
            const newPlayers = packet.roomData.players || {};
            for (const id in newPlayers) {
                if (id !== this.playerId && !oldPlayers[id]) {
                    const actionStr = this.inGame ? 'подключился к игре' : 'вошел в лобби';
                    this.showToast(`👤 Игрок "${newPlayers[id].name}" ${actionStr}`, 'info');
                }
            }
            for (const id in oldPlayers) {
                if (id !== this.playerId && !newPlayers[id]) {
                    const actionStr = this.inGame ? 'вышел из игры' : 'покинул лобби';
                    this.showToast(`🚪 Игрок "${oldPlayers[id].name}" ${actionStr}`, 'danger');
                }
            }

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
                    this.updateLobbyPuzzleIdPill();
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
            if (this.roomData?.players[packet.winnerId]) {
                this.roomData.players[packet.winnerId].won = true;
                this.roomData.players[packet.winnerId].surrendered = !!packet.isSurrendered;
            }
            this.handlePlayerWin(packet);
        } else if (packet.type === 'RETURN_TO_LOBBY') {
            this.handleReturnToLobby(packet.roomData);
        } else if (packet.type === 'LEAVE' || packet.type === 'ROOM_CLOSED') {
            if (this.roomData && (packet.playerId === this.roomData.hostId || packet.type === 'ROOM_CLOSED')) {
                if (this.active) {
                    this.showToast('🛑 Комната закрыта организатором. Соединение разорвано.', 'danger');
                    if (typeof window.showConfirmModal === 'function') {
                        window.showConfirmModal('Комната закрыта', '🛑 Организатор закрыл комнату. Соединение отключено.', { hideCancel: true }).then(() => {
                            this.leaveRoom();
                        });
                    } else {
                        this.leaveRoom();
                    }
                }
            } else if (this.roomData?.players) {
                const oldPlayer = this.roomData.players[packet.playerId];
                if (oldPlayer) {
                    const actionStr = this.inGame ? 'вышел из игры' : 'покинул лобби';
                    this.showToast(`🚪 Игрок "${oldPlayer.name}" ${actionStr}`, 'danger');
                }
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

    hostReturnToLobby() {
        if (!this.isHost || !this.roomData) return;
        
        // Reset room status and player states
        this.roomData.status = 'waiting';
        if (this.roomData.players) {
            for (const id in this.roomData.players) {
                this.roomData.players[id].won = false;
                this.roomData.players[id].progressPct = 0;
                this.roomData.players[id].moves = 0;
            }
        }
        this.roomData.teamProgress = 0;

        // Broadcast to everyone
        this.broadcast({
            type: 'RETURN_TO_LOBBY',
            roomData: this.roomData
        });

        // Local execution
        this.handleReturnToLobby(this.roomData);
    }

    handleReturnToLobby(roomData) {
        this.roomData = roomData;
        this.inGame = false;
        
        // Close any leaderboard/lobby modal
        this.closeLobbyModal();
        
        // Hide game card (but don't destroy it!)
        if (this.game && this.game.card) {
            this.game.card.style.display = 'none';
        }
        
        // Remove HUD
        const hud = document.getElementById('puzzle-online-hud');
        if (hud) hud.remove();

        // Render Lobby UI
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
        const modeName = this.gameMode === 'race' ? 'Гонка' : 'Совместная сборка';
        
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

    // --- UI RENDERING METHODS ---
    showToast(msg, type = 'info') {
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
        modal.className = 'game-overlay open';

        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.maxWidth = '580px';

        const previewUrl = this.roomData?.postUrl || (this.roomData?.post ? (this.roomData.post.sample_url || this.roomData.post.preview_url || this.roomData.post.file_url) : '') || (this.game.post ? (this.game.post.sample_url || this.game.post.preview_url || this.game.post.file_url) : '');

        const currentPost = this.roomData?.post || this.game?.post || null;
        const currentPostId = currentPost ? currentPost.id : '';

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

        modal.innerHTML = `
            <div class="game-header">
                <div class="game-title-group">
                    <div class="game-logo-icon game-logo-icon-puzzle">${icon('puzzle', { size: 20 })}</div>
                    <h2 class="game-app-title">${this.isHost ? 'Лобби Хоста' : 'Комната Мультиплеера'} <span style="font-size: 0.65em; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 8px; font-weight: 800; vertical-align: middle; margin-left: 6px;">БЕТА</span></h2>
                </div>
                <button class="game-close-btn" id="pzOnlineCloseBtn" title="Закрыть">&times;</button>
            </div>
        `;

        card.innerHTML = `
            <div class="game-menu-container" style="gap: 16px;">
                <span class="game-hero-badge game-badge-gradient-secondary">
                    ${this.isHost ? 'Вы — Организатор (Хост)' : 'Вы подключились к комнате'} • ${this.roomData?.mode === 'coop' ? 'Совместный сбор' : 'Гонка на скорость'}
                </span>

                <h1 class="game-menu-title" style="font-size: 1.75rem;">${this.isHost ? 'Лобби Комнаты' : 'Подключение к Комнате'}</h1>

                <!-- Код комнаты -->
                <div class="game-room-header-card game-room-card" style="width: 100%;">
                    <div style="text-align: left;">
                        <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">КОД КОМНАТЫ:</div>
                        <div class="game-room-code-val" style="color: #fbbf24; margin-top: 2px;">${this.roomId}</div>
                    </div>
                    <button id="pzCopyCodeBtn" class="game-btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; min-width: auto; gap: 6px;">
                        ${icon('clipboard', { size: 14 })} Копировать
                    </button>
                </div>

                <div class="game-form-box" style="width: 100%;">
                    <!-- Превью картинки пазла и настройки (Хост выбирает, все видят) -->
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left;">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); font-weight: bold; width: 100%; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                ${currentPostId ? `
                                    <span id="pzPuzzleIdPill" style="cursor: pointer; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 2px 6px; font-family: monospace; font-size: 0.75rem; color: #fbbf24; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px; vertical-align: middle;" onmouseover="this.style.background='rgba(255,255,255,0.15)'; this.style.borderColor='#fbbf24';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.15)';" title="Кликните, чтобы скопировать ID">
                                        ID ${currentPostId}
                                    </span>
                                ` : `
                                    <span id="pzPuzzleIdPill" style="cursor: pointer; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 2px 6px; font-family: monospace; font-size: 0.75rem; color: #fbbf24; transition: all 0.2s; display: none; align-items: center; gap: 4px; vertical-align: middle;" onmouseover="this.style.background='rgba(255,255,255,0.15)'; this.style.borderColor='#fbbf24';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.15)';" title="Кликните, чтобы скопировать ID">
                                    </span>
                                `}
                                <span style="display:flex; align-items:center; gap:6px;">${icon('image', { size: 14 })} Выбранный пазл:</span>
                            </div>
                            ${this.isHost ? `
                                <button id="pzSkipPuzzleBtn" class="game-btn-secondary" style="padding: 4px 10px; font-size: 0.75rem; min-width: auto; height: auto;">
                                    ${icon('refresh', { size: 12 })} Пропустить
                                </button>
                            ` : `
                                <span style="font-size: 0.75rem; color: var(--accent, #a78bfa);" id="pzPiecesInfoText">${this.roomData?.targetPieces || 36} деталей</span>
                            `}
                        </div>
                        <div id="pzPreviewImg" class="game-preview-img" style="background-image: url('${previewUrl}');"></div>

                        ${this.isHost ? `
                            <!-- Поиск по ID (для Хоста) -->
                            <div style="display:flex; gap:8px; width:100%; margin-top:4px;">
                                <input type="text" id="pzHostIdInput" class="game-input" placeholder="Поиск по ID (например, 10142981)" style="flex:1; font-size:0.85rem; padding:8px 12px; text-align:center;" />
                                <button id="pzHostIdLoadBtn" class="game-btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; min-width: auto;">Найти</button>
                            </div>

                            <!-- Деталей в пазле (для Хоста) -->
                            <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                                <label class="game-form-label" style="font-size: 0.8rem;">Количество деталей:</label>
                                <select id="pzPiecesSelect" class="game-input" style="font-weight: bold; cursor: pointer; font-size: 0.85rem; padding: 8px 12px; background: rgba(255, 255, 255, 0.06);">
                                    ${optionsHtml}
                                </select>
                            </div>
                        ` : ''}
                    </div>

                    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;">

                    <!-- Участники -->
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left;">
                        <div class="game-form-label" style="font-size: 0.85rem;">
                            Участники (<span id="pzPlayerCount">1</span>/${this.roomData.maxPlayers}):
                        </div>
                        <div id="pzPlayerList" class="game-leaderboard game-player-list" style="display: flex; flex-direction: column; gap: 6px; width: 100%; max-height: 140px; overflow-y: auto; box-sizing: border-box; padding: 10px;"></div>
                    </div>

                    <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;">

                    <!-- Логи подключения -->
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; text-align: left;">
                        <div style="font-size: 0.72rem; font-weight: 700; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">Логи:</div>
                        <div id="puzzle-sync-logs" class="game-sync-logs">
                            Ожидание игроков...
                        </div>
                    </div>

                    <!-- Кнопка запуска / Ожидание -->
                    <div style="width: 100%; margin-top: 6px;">
                        ${this.isHost ? `
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
            this.leaveRoom();
            this.renderLobbySetupUI();
        };

        const pzHeaderBackBtn = document.getElementById('pzHeaderBackBtn');
        if (pzHeaderBackBtn) pzHeaderBackBtn.onclick = handleLeaveToSetup;

        const pzLeaveRoomBtn = document.getElementById('pzLeaveRoomBtn');
        if (pzLeaveRoomBtn) pzLeaveRoomBtn.onclick = handleLeaveToSetup;

        document.getElementById('pzOnlineCloseBtn').onclick = () => this.leaveRoom();
        document.getElementById('pzCopyCodeBtn').onclick = () => {
            navigator.clipboard.writeText(this.roomId);
            this.showToast('Код комнаты скопирован!', 'success');
        };

        const puzzleIdPill = document.getElementById('pzPuzzleIdPill');
        if (puzzleIdPill) {
            puzzleIdPill.onclick = () => {
                const currentPost = this.roomData?.post || this.game?.post;
                if (currentPost && currentPost.id) {
                    navigator.clipboard.writeText(currentPost.id.toString());
                    this.showToast(`ID пазла ${currentPost.id} скопирован!`, 'success');
                }
            };
        }

        if (this.isHost) {
            document.getElementById('pzStartGameBtn').onclick = () => this.hostStartGame();

            const piecesSelect = document.getElementById('pzPiecesSelect');
            if (piecesSelect) {
                makeCustomDropdown(piecesSelect);
                piecesSelect.onchange = () => {
                    this.roomData.targetPieces = parseInt(piecesSelect.value, 10);
                    this.roomData.seamsSeed = Math.floor(Math.random() * 1000000000);
                    this.broadcastRoomData();
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
                    
                    const excludePostId = this.roomData.post ? this.roomData.post.id : null;
                    if (excludePostId) {
                        this.skippedPuzzleIds.add(excludePostId);
                    }

                    let unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId && !this.skippedPuzzleIds.has(p.id));
                    
                    if (unsolved.length === 0 && typeof window.loadMorePostsForPuzzle === 'function') {
                        this.showToast('Загружаем новые картинки...', 'info');
                        const loadedMore = await window.loadMorePostsForPuzzle(true);
                        if (loadedMore) {
                            const freshPosts = Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                                ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
                                : [];
                            eligible = freshPosts.filter(p => !isVideo(p) && !isTooTall(p));
                            unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId && !this.skippedPuzzleIds.has(p.id));
                        }
                    }

                    if (unsolved.length === 0) {
                        // Reset session skipped puzzles list when all have been skipped or solved
                        this.skippedPuzzleIds.clear();
                        if (excludePostId) this.skippedPuzzleIds.add(excludePostId);
                        unsolved = eligible.filter(p => p && p.id && !solvedIds.includes(p.id) && p.id !== excludePostId);
                    }
                    if (unsolved.length === 0) {
                        unsolved = eligible.filter(p => p && p.id !== excludePostId);
                    }
                    if (unsolved.length === 0) {
                        unsolved = eligible;
                    }

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

                    const previewImg = document.getElementById('pzPreviewImg');
                    if (previewImg) {
                        previewImg.style.backgroundImage = `url('${newPreviewUrl}')`;
                    }
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
                            const newAspectRatio = allowLong ? Math.max(0.05, Math.min(20.0, ratio)) : Math.max(0.35, Math.min(1.8, ratio));
                            this.game.aspectRatio = newAspectRatio;
                            this.roomData.aspectRatio = newAspectRatio;

                            const previewImg = document.getElementById('pzPreviewImg');
                            if (previewImg) {
                                previewImg.style.backgroundImage = `url('${newPreviewUrl}')`;
                            }
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
                        <input type="text" id="pzNickInput" class="game-input" value="${this.playerName}" placeholder="Введите ваш ник..." maxlength="20">
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

        const closeSetup = () => {
            if (this.game) {
                this.game.destroy();
            }
            modal.remove();
        };

        const goBackToMenu = () => {
            if (this.game) {
                this.game.destroy();
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

        document.getElementById('pzCancelSyncBtn').onclick = () => this.leaveRoom();
    }

    updateLobbyPlayerList() {
        const playerList = document.getElementById('pzPlayerList');
        const playerCount = document.getElementById('pzPlayerCount');
        if (!playerList || !this.roomData) return;

        const players = Object.values(this.roomData.players || {});
        if (playerCount) playerCount.textContent = players.length;

        playerList.innerHTML = players.map(p => `
            <div class="game-player-row" style="width: 100%; box-sizing: border-box;">
                <div class="game-player-name">
                    ${p.isHost ? icon('crown', { size: 16, className: 'game-host-crown' }) : icon('user', { size: 16 })} 
                    <span>${escapeHtml(p.name)}</span> 
                    ${p.id === this.playerId ? '<small style="color: var(--accent, #a78bfa);">(Вы)</small>' : ''}
                </div>
                <div class="game-player-status game-status-done">
                    Готов
                </div>
            </div>
        `).join('');
    }

    updateLobbyPuzzleIdPill() {
        const pill = document.getElementById('pzPuzzleIdPill');
        if (!pill) return;
        const currentPost = this.roomData?.post || this.game?.post || null;
        if (currentPost && currentPost.id) {
            pill.textContent = `ID ${currentPost.id}`;
            pill.style.display = 'inline-flex';
        } else {
            pill.style.display = 'none';
        }
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
                <div style="font-size:0.8rem; font-weight:bold; color:var(--accent, #a78bfa); display:flex; align-items:center; gap:6px;">
                    🏁 Гонка на скорость (${this.roomId})
                </div>
                <div id="pzRaceLeaderboardBars" style="display:flex; align-items:center; gap:12px; flex:1; overflow-x:auto;"></div>
            `;
        } else {
            hud.innerHTML = `
                <div style="font-size:0.8rem; font-weight:bold; color:var(--accent, #a78bfa); display:flex; align-items:center; gap:6px;">
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
                            <span>${escapeHtml(p.name)}</span>
                            <span>${pct}%</span>
                        </div>
                        <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:linear-gradient(90deg,var(--accent, #8b5cf6),var(--accent-alt, #ec4899)); transition:width 0.3s ease;"></div>
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
            border: 1px solid ${this.gameMode === 'coop' ? 'rgba(56,189,248,0.5)' : 'rgba(16,185,129,0.5)'}; border-radius: 20px;
            width: 100%; max-width: 460px; padding: 24px; color: #fff;
            box-shadow: 0 16px 40px rgba(0,0,0,0.6); display:flex; flex-direction:column; gap:16px; align-items:center; text-align:center;
        `;

        const rawTime = winData?.time !== undefined ? winData.time : 0;
        const timeStr = this.game && typeof this.game.formatTime === 'function' ? this.game.formatTime(rawTime) : '00:00';

        if (this.gameMode === 'coop') {
            const players = Object.values(this.roomData?.players || {}).sort((a,b) => (b.placedCount || 0) - (a.placedCount || 0));
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
                                <span>👤</span> <span>${escapeHtml(p.name)}</span>
                            </div>
                            <div style="font-weight:bold; font-size:0.85rem; color:#38bdf8; text-align:right;">
                                Собрано деталей: <span style="color:#fff;">${p.placedCount || 0}</span>
                                <span style="font-size:0.75rem; color:#94a3b8; font-weight:normal; margin-left:4px;">(${p.moves || 0} ходов)</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div style="width:100%; display:flex; flex-direction:column; gap:10px; margin-top: 8px;">
                    ${this.isHost ? `
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
            const players = Object.values(this.roomData?.players || {}).sort((a,b) => {
                if (a.surrendered && !b.surrendered) return 1;
                if (!a.surrendered && b.surrendered) return -1;
                return (b.progressPct || 0) - (a.progressPct || 0);
            });
            const winnerName = winData?.winnerName || 'Участник';
            const winnerId = winData?.winnerId || '';
            const winnerSurrendered = winData?.isSurrendered || this.roomData?.players[winnerId]?.surrendered;
            const localProgress = this.game ? this.game.getConnectionProgress().pct : 100;
            const canContinue = this.game && !this.game.hasWon && localProgress < 100;
            
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
                                    <span>#${idx + 1}</span> <span>${escapeHtml(p.name)} ${p.surrendered ? '🏳️' : ''}</span>
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
                    ${this.isHost ? `
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
                
                // Show floating button to open results again
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
                    this.renderLeaderboardModal(winData);
                };
                document.body.appendChild(floatBtn);
            };
        }

        if (this.isHost) {
            const returnBtn = document.getElementById('pzReturnToLobbyBtn');
            if (returnBtn) {
                returnBtn.onclick = () => {
                    this.hostReturnToLobby();
                };
            }
        }

        const finishBtn = document.getElementById('pzFinishOnlineBtn');
        if (finishBtn) {
            finishBtn.onclick = () => {
                this.leaveRoom();
                modal.remove();
            };
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
        this.active = false;
        const wasInGame = this.inGame;
        this.inGame = false;
        this.closeLobbyModal();
        
        this.stopSignaling();

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

        if (prevRoomId) {
            if (wasHost) {
                this.showToast(`🚪 Комната ${prevRoomId} закрыта. Соединение отключено.`, 'info');
            } else {
                this.showToast(`🚪 Вы покинули комнату ${prevRoomId}. Соединение отключено.`, 'info');
            }
        }
    }
}
