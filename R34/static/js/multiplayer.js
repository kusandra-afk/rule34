/**
 * BaseOnlineEngine - Centralized P2P Multiplayer & Signaling Engine
 * Encapsulates rooms, WebRTC DataChannels, ntfy.sh signaling, SSE streams, and message relaying.
 * Designed as a reusable base class for online games (Puzzle, Memory, Quiz, Arcade, etc.).
 */

export class BaseOnlineEngine {
    constructor(gameType = 'generic') {
        this.gameType = gameType;
        
        // Player credentials
        this.playerId = 'pl_' + Math.random().toString(36).substring(2, 9);
        this.playerName = localStorage.getItem('r34_puzzle_nickname') || 'Игрок_' + Math.floor(1000 + Math.random() * 9000);
        
        this.roomId = null;
        this.isHost = false;
        this.active = false;
        this.gameMode = 'race';
        this.roomData = null;
        
        // WebRTC P2P DataChannels
        this.connections = []; // Host: [{ playerId, dc }]
        this.clientPeerConnections = {}; // Host: { playerId: RTCPeerConnection }
        this.hostConn = null; // Client: RTCDataChannel to Host
        this.pc = null; // Client: RTCPeerConnection
        
        // Signaling & Polling
        this.eventSource = null;
        this.ntfyEventSource = null;
        this.signalQueue = [];
        this.roomHeartbeatTimer = null;
        this.pollTimer = null;
        this.syncLogs = [];
        this.processedPacketIds = new Set();
        
        // Default ICE/STUN Servers
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

        this.listeners = {
            message: [],       // (packet) => {}
            roomUpdate: [],    // (roomData) => {}
            playerJoined: [],  // (player) => {}
            playerLeft: [],    // (playerId) => {}
            dcOpen: [],        // (peerId) => {}
            dcClose: [],       // (peerId) => {}
            closed: [],        // (reason) => {}
            error: []          // (err) => {}
        };

        // Metered TURN key check
        const savedKey = localStorage.getItem('gameMeteredKey') || localStorage.getItem('hlMeteredKey') || localStorage.getItem('r34_metered_key');
        if (savedKey) {
            this.setupMeteredIce(savedKey);
        } else {
            this.fetchFallbackIceServers();
        }
    }

    // --- NICKNAME MANAGEMENT ---
    setPlayerName(name) {
        if (!name) return;
        this.playerName = name.trim();
        localStorage.setItem('r34_puzzle_nickname', this.playerName);
    }

    // --- ICE & TURN SETUP ---
    setupMeteredIce(key) {
        if (!key || typeof key !== 'string') return;
        const cleanKey = key.trim();
        const appName = cleanKey.includes('.') ? cleanKey.split('.')[0] : cleanKey;
        localStorage.setItem('r34_metered_key', cleanKey);
        
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

    async fetchFallbackIceServers() {
        try {
            const resp = await fetch('/api/room/ice_servers');
            if (resp.ok) {
                const data = await resp.json();
                if (data.ok && Array.isArray(data.iceServers)) {
                    const baseStuns = this.iceServers.filter(s => s.urls && String(s.urls).startsWith('stun:'));
                    this.iceServers = [...baseStuns, ...data.iceServers];
                }
            }
        } catch (e) {
            console.warn('[BaseOnlineEngine] Failed to load server ICE fallbacks:', e);
        }
    }

    // --- ROOM CODE GENERATOR ---
    generateRoomCode() {
        const chars = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // --- EVENT EMITTER API ---
    on(event, cb) {
        if (this.listeners[event]) {
            this.listeners[event].push(cb);
        }
    }

    off(event, cb) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(x => x !== cb);
        }
    }

    emit(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => {
                try { cb(...args); } catch (e) { console.error(`[BaseOnlineEngine] Error in '${event}' listener:`, e); }
            });
        }
    }

    // --- LOGGING ---
    addSyncLog(msg) {
        const timestamp = new Date().toLocaleTimeString();
        this.syncLogs.push(`[${timestamp}] ${msg}`);
        console.log(`[BaseOnlineEngine] ${msg}`);
        const logContainer = document.getElementById('puzzle-sync-logs');
        if (logContainer) {
            logContainer.textContent = this.syncLogs.slice(-6).join('\n');
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        this.emit('syncLog', msg);
    }

    // --- ROOM CREATION & JOINING ---
    async createRoom(customInitialData = {}) {
        this.roomId = this.generateRoomCode();
        this.isHost = true;
        this.active = true;
        
        this.roomData = {
            id: this.roomId,
            hostId: this.playerId,
            gameType: this.gameType,
            status: 'waiting',
            players: {
                [this.playerId]: {
                    id: this.playerId,
                    name: this.playerName,
                    isHost: true,
                    ready: true,
                    joinedAt: new Date().toISOString()
                }
            },
            createdAt: new Date().toISOString(),
            ...customInitialData
        };

        try {
            const resp = await fetch('/api/room/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId,
                    playerId: this.playerId,
                    playerName: this.playerName,
                    gameType: this.gameType,
                    roomData: this.roomData
                })
            });
            
            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(errText || 'Failed to create room');
            }

            this.addSyncLog(`Создана комната ${this.roomId}. Режим хоста.`);
            
            this.startListening();
            this.startHeartbeat();
            
            return this.roomData;
        } catch (err) {
            this.emit('error', err);
            throw err;
        }
    }

    async joinRoom(code) {
        this.roomId = code.trim().toUpperCase();
        this.isHost = false;
        this.active = true;

        const myPlayerObj = {
            id: this.playerId,
            name: this.playerName,
            isHost: false,
            ready: true,
            joinedAt: new Date().toISOString()
        };

        try {
            const joinResp = await fetch('/api/room/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId,
                    playerId: this.playerId,
                    playerName: this.playerName,
                    playerInfo: myPlayerObj
                })
            });

            if (!joinResp.ok) {
                const errObj = await joinResp.json().catch(() => ({ error: 'Room not found' }));
                throw new Error(errObj.error || 'Failed to join room');
            }

            const joinData = await joinResp.json();
            this.roomData = joinData.roomData;

            this.addSyncLog(`Подключение к комнате ${this.roomId} успешно. Режим клиента.`);

            this.startListening();
            
            await this.sendSignal(this.roomId, {
                type: 'JOIN',
                playerId: this.playerId,
                player: myPlayerObj
            });

            return this.roomData;
        } catch (err) {
            this.emit('error', err);
            throw err;
        }
    }

    async updateRoomData(updatedData) {
        if (!this.roomId) return;
        this.roomData = {
            ...this.roomData,
            ...updatedData
        };
        await this.sendSignal(this.roomId, {
            type: 'ROOM_DATA',
            roomData: this.roomData
        });
        this.emit('roomUpdate', this.roomData);
    }

    async broadcastRoomData() {
        if (!this.roomId || !this.roomData) return;
        await this.sendSignal(this.roomId, {
            type: 'ROOM_DATA',
            roomData: this.roomData
        });
        this.emit('roomUpdate', this.roomData);
    }

    // --- WebRTC P2P HANDSHAKE ---
    async initiateRtcConnection(clientPlayerId) {
        this.addSyncLog(`[WebRTC] Инициализация P2P соединения с ${clientPlayerId}...`);
        
        if (this.clientPeerConnections[clientPlayerId]) {
            try { this.clientPeerConnections[clientPlayerId].close(); } catch (e) {}
            delete this.clientPeerConnections[clientPlayerId];
        }
        this.connections = this.connections.filter(c => c.playerId !== clientPlayerId);

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.clientPeerConnections[clientPlayerId] = pc;

        const dc = pc.createDataChannel('game_channel', { ordered: false });
        this.setupDataChannel(clientPlayerId, dc);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(this.roomId, {
                    type: 'RTC_ICE',
                    targetPlayerId: clientPlayerId,
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            this.addSyncLog(`[WebRTC] Статус соединения с ${clientPlayerId}: ${pc.connectionState}`);
        };

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            this.sendSignal(this.roomId, {
                type: 'RTC_OFFER',
                targetPlayerId: clientPlayerId,
                offer: offer
            });
        } catch (err) {
            console.error('[BaseOnlineEngine] Error creating offer:', err);
        }
    }

    async handleRtcOffer(senderId, offer) {
        this.addSyncLog(`[WebRTC] Получен RTC OFFER от хоста ${senderId}`);
        
        if (this.pc) {
            try { this.pc.close(); } catch (e) {}
        }
        this.hostConn = null;

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.pc = pc;

        pc.ondatachannel = (event) => {
            const dc = event.channel;
            this.setupDataChannel(senderId, dc);
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(this.roomId, {
                    type: 'RTC_ICE',
                    targetPlayerId: senderId,
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            this.addSyncLog(`[WebRTC] Статус соединения с хостом: ${pc.connectionState}`);
        };

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.sendSignal(this.roomId, {
                type: 'RTC_ANSWER',
                targetPlayerId: senderId,
                answer: answer
            });
        } catch (err) {
            console.error('[BaseOnlineEngine] Error setting offer/creating answer:', err);
        }
    }

    async handleRtcAnswer(senderId, answer) {
        this.addSyncLog(`[WebRTC] Получен RTC ANSWER от ${senderId}`);
        const pc = this.clientPeerConnections[senderId];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (err) {
                console.error('[BaseOnlineEngine] Error setting remote answer:', err);
            }
        }
    }

    async handleRtcIce(senderId, candidate) {
        const pc = this.isHost ? this.clientPeerConnections[senderId] : this.pc;
        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('[BaseOnlineEngine] Failed to add ICE candidate:', err);
            }
        }
    }

    setupDataChannel(peerId, dc) {
        dc.onopen = () => {
            this.addSyncLog(`[WebRTC] DataChannel открыт для ${peerId}!`);
            if (this.isHost) {
                this.connections = this.connections.filter(c => c.playerId !== peerId);
                this.connections.push({ playerId: peerId, dc });
                this.emit('dcOpen', peerId);
            } else {
                this.hostConn = dc;
                this.emit('dcOpen', peerId);
            }
        };

        dc.onclose = () => {
            this.addSyncLog(`[WebRTC] DataChannel закрыт для ${peerId}`);
            if (this.isHost) {
                this.connections = this.connections.filter(c => c.playerId !== peerId);
                this.emit('dcClose', peerId);
            } else {
                this.hostConn = null;
                this.emit('dcClose', peerId);
            }
        };

        dc.onerror = (err) => {
            console.error(`[WebRTC] DataChannel error for ${peerId}:`, err);
        };

        dc.onmessage = (event) => {
            try {
                const packet = JSON.parse(event.data);
                if (packet.type === 'PING') return;
                this.handleIncomingPacket(packet, peerId);
            } catch (err) {
                console.error('[WebRTC] Error parsing DataChannel packet:', err);
            }
        };
    }

    // --- INCOMING PACKET ROUTING ---
    handleIncomingPacket(packet, senderId) {
        if (!packet || typeof packet !== 'object') return;
        
        // Prevent processing our own packet
        if (packet.senderId === this.playerId) return;

        // Verify target player ID if specified
        if (packet.targetPlayerId && packet.targetPlayerId !== this.playerId) return;

        // Deduplicate packets
        if (packet._msgId) {
            if (this.processedPacketIds.has(packet._msgId)) return;
            this.processedPacketIds.add(packet._msgId);
            if (this.processedPacketIds.size > 2000) {
                const first = this.processedPacketIds.values().next().value;
                this.processedPacketIds.delete(first);
            }
        }

        // WebRTC Handshake routing
        if (packet.type === 'RTC_OFFER') {
            this.handleRtcOffer(packet.senderId, packet.offer);
            return;
        }
        if (packet.type === 'RTC_ANSWER') {
            this.handleRtcAnswer(packet.senderId, packet.answer);
            return;
        }
        if (packet.type === 'RTC_ICE') {
            this.handleRtcIce(packet.senderId, packet.candidate);
            return;
        }

        // Internal room state update
        if (packet.type === 'ROOM_CLOSED') {
            this.emit('closed', packet.message || 'Комната закрыта организатором');
            this.stopListening();
            return;
        }

        if (packet.type === 'ROOM_DATA') {
            if (packet.roomData) {
                this.roomData = packet.roomData;
                this.emit('roomUpdate', this.roomData);
            }
        }

        if (packet.type === 'JOIN') {
            if (this.isHost) {
                // Host handles JOIN: registers player, initiates WebRTC
                if (!this.roomData.players) this.roomData.players = {};
                const alreadyExists = !!this.roomData.players[packet.playerId];
                this.roomData.players[packet.playerId] = packet.player;
                
                this.emit('playerJoined', packet.player);
                this.broadcastRoomData();

                // Trigger WebRTC offer to this client
                this.initiateRtcConnection(packet.playerId);
            }
        }

        if (packet.type === 'LEAVE') {
            if (this.isHost && this.roomData?.players?.[packet.playerId]) {
                delete this.roomData.players[packet.playerId];
                this.connections = this.connections.filter(c => c.playerId !== packet.playerId);
                if (this.clientPeerConnections[packet.playerId]) {
                    try { this.clientPeerConnections[packet.playerId].close(); } catch (e) {}
                    delete this.clientPeerConnections[packet.playerId];
                }
                this.emit('playerLeft', packet.playerId);
                this.broadcastRoomData();
            }
        }

        // High-level Game Sync/Message dispatching
        if (this.isHost) {
            this.emit('hostReceivedMessage', packet.senderId, packet);
        } else {
            this.emit('clientReceivedMessage', packet);
        }

        // Bubble up generic message event
        this.emit('message', packet);
    }

    // --- SIGNALING METHOD ---
    async sendSignal(code, data, targetId = null) {
        if (!data) return;
        if (!data._msgId) {
            data._msgId = `${this.playerId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        data.senderId = this.playerId;
        data.senderName = this.playerName;
        if (targetId) {
            data.targetPlayerId = targetId;
        }

        const topic = `r34_pz_sig_${code}`;
        try {
            fetch(`https://ntfy.sh/${topic}`, {
                method: 'POST',
                body: JSON.stringify(data)
            }).catch(() => {});
        } catch (e) {}

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
        if (this.ntfyEventSource) {
            try { this.ntfyEventSource.close(); } catch (err) {}
            this.ntfyEventSource = null;
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

        const topic = `r34_pz_sig_${code}`;
        try {
            this.ntfyEventSource = new EventSource(`https://ntfy.sh/${topic}/sse`);
            this.ntfyEventSource.onmessage = (event) => {
                try {
                    const packet = JSON.parse(event.data);
                    if (packet.message) {
                        const msg = JSON.parse(packet.message);
                        safeOnMessage(msg);
                    }
                } catch (e) {}
            };
        } catch (err) {
            console.error('[BaseOnlineEngine] ntfy SSE connection failed:', err);
        }

        const localSseUrl = `/api/room/events?roomId=${code}&playerId=${this.playerId}`;
        try {
            this.eventSource = new EventSource(localSseUrl);
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    safeOnMessage(data);
                } catch (e) {}
            };
        } catch (e) {}

        this.pollTimer = setInterval(async () => {
            if (!this.roomId) return;
            try {
                const resp = await fetch('/api/room/poll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId: this.roomId, playerId: this.playerId })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.messages && Array.isArray(data.messages)) {
                        data.messages.forEach(safeOnMessage);
                    }
                }
            } catch (err) {}
        }, 1500);
    }

    startListening() {
        if (!this.roomId) return;
        this.listenSignal(this.roomId, (packet) => {
            this.handleIncomingPacket(packet, packet.senderId);
        });
    }

    stopListening() {
        this.stopSignaling();
    }

    // --- DATACHANNEL & FALLBACK MESSAGING ---
    broadcast(packet) {
        const payload = typeof packet === 'string' ? packet : JSON.stringify(packet);
        if (this.isHost) {
            this.connections.forEach(c => {
                if (c.dc && c.dc.readyState === 'open') {
                    try { c.dc.send(payload); } catch (e) {}
                }
            });
        } else if (this.hostConn && this.hostConn.readyState === 'open') {
            try { this.hostConn.send(payload); } catch (e) {}
        } else if (this.roomId) {
            const dataObj = typeof packet === 'string' ? JSON.parse(packet) : packet;
            this.sendSignal(this.roomId, dataObj);
        }
    }

    sendToHost(packet) {
        const payload = typeof packet === 'string' ? packet : JSON.stringify(packet);
        if (this.hostConn && this.hostConn.readyState === 'open') {
            try { this.hostConn.send(payload); } catch (e) {}
        } else if (this.roomId) {
            const dataObj = typeof packet === 'string' ? JSON.parse(packet) : packet;
            this.sendSignal(this.roomId, dataObj, this.roomData?.hostId);
        }
    }

    sendToPlayer(targetId, packet) {
        const payload = typeof packet === 'string' ? packet : JSON.stringify(packet);
        const conn = this.connections.find(c => c.playerId === targetId);
        if (conn && conn.dc && conn.dc.readyState === 'open') {
            try { conn.dc.send(payload); } catch (e) {}
        } else if (this.roomId) {
            const dataObj = typeof packet === 'string' ? JSON.parse(packet) : packet;
            this.sendSignal(this.roomId, dataObj, targetId);
        }
    }

    // --- HEARTBEAT & CLEANUP ---
    startHeartbeat() {
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

    stopHeartbeat() {
        if (this.roomHeartbeatTimer) {
            clearInterval(this.roomHeartbeatTimer);
            this.roomHeartbeatTimer = null;
        }
    }

    leaveRoom() {
        if (!this.roomId) return;
        try {
            this.sendSignal(this.roomId, { type: 'LEAVE', playerId: this.playerId });
        } catch (e) {}

        this.stopListening();
        this.stopHeartbeat();

        if (this.pc) {
            try { this.pc.close(); } catch (e) {}
            this.pc = null;
        }
        Object.values(this.clientPeerConnections).forEach(pc => {
            try { pc.close(); } catch (e) {}
        });
        this.clientPeerConnections = {};
        this.connections = [];
        this.hostConn = null;

        this.active = false;
        this.roomId = null;
        this.roomData = null;
        this.isHost = false;
        this.emit('closed', 'Вы вышли из комнаты');
    }
}

// Backwards compatibility alias
export class MultiplayerClient extends BaseOnlineEngine {}
