/**
 * R34 Multiplayer Helper Client
 * Encapsulates rooms, SSE streams, long polling, and message relaying for peer-to-peer or server-assisted online games.
 * Decouples game logic from lower-level networking and SSE connection states.
 */

export class MultiplayerClient {
    constructor(gameType = 'generic') {
        this.gameType = gameType;
        
        // Match player credentials with puzzle game or local configs
        this.playerId = 'pl_' + Math.random().toString(36).substring(2, 9);
        this.playerName = localStorage.getItem('r34_puzzle_nickname') || 'Игрок_' + Math.floor(1000 + Math.random() * 9000);
        
        this.roomId = null;
        this.isHost = false;
        this.roomData = null;
        
        this.eventSource = null;
        this.pollInterval = null;
        this.processedPacketIds = new Set();
        
        this.listeners = {
            message: [],       // (packet) => {}
            roomUpdate: [],    // (roomData) => {}
            playerJoined: [],  // (playerObj) => {}
            playerLeft: [],    // (playerId) => {}
            closed: [],        // (msg) => {}
            error: []          // (err) => {}
        };

        // WebRTC ICE Servers Configuration (STUN / TURN)
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:stun.sipgate.net:3478' }
        ];

        // Auto-check for saved Metered key and apply if found
        const savedKey = localStorage.getItem('gameMeteredKey') || localStorage.getItem('hlMeteredKey') || localStorage.getItem('r34_metered_key');
        if (savedKey) {
            this.setupMeteredIce(savedKey);
        } else {
            this.fetchFallbackIceServers();
        }
    }

    /**
     * Configure WebRTC ICE Servers using a Metered.ca application key
     */
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

    /**
     * Asynchronously loads default and open TURN servers from the local backend as fallback
     */
    async fetchFallbackIceServers() {
        try {
            const resp = await fetch('/api/room/ice_servers');
            if (resp.ok) {
                const data = await resp.json();
                if (data.ok && Array.isArray(data.iceServers)) {
                    // Prepend google/cloudflare STUNS, then append backend turn/stuns
                    const baseStuns = this.iceServers.filter(s => s.urls && String(s.urls).startsWith('stun:'));
                    this.iceServers = [...baseStuns, ...data.iceServers];
                }
            }
        } catch (e) {
            console.warn('[Multiplayer] Failed to load server ICE fallbacks:', e);
        }
    }

    setPlayerName(name) {
        if (!name) return;
        this.playerName = name.trim();
        localStorage.setItem('r34_puzzle_nickname', this.playerName);
    }

    generateRoomCode() {
        const chars = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // Register event listener
    on(event, cb) {
        if (this.listeners[event]) {
            this.listeners[event].push(cb);
        }
    }

    // Unsubscribe
    off(event, cb) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(x => x !== cb);
        }
    }

    // Trigger event
    emit(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => {
                try { cb(...args); } catch (e) { console.error(`[Multiplayer] Error in '${event}' listener:`, e); }
            });
        }
    }

    /**
     * Create a new multiplayer room on the server.
     */
    async createRoom(customInitialData = {}) {
        this.roomId = this.generateRoomCode();
        this.isHost = true;
        
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

            // Start listening for signaling events
            this.startListening();
            return this.roomData;
        } catch (err) {
            this.emit('error', err);
            throw err;
        }
    }

    /**
     * Join an existing room.
     */
    async joinRoom(code) {
        this.roomId = code.trim().toUpperCase();
        this.isHost = false;

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

            // Start listening
            this.startListening();

            // Send explicit JOIN packet to notify host/others
            await this.sendSignal({
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

    /**
     * Leave the current room.
     */
    async leaveRoom() {
        if (!this.roomId) return;
        
        // Notify others
        try {
            await this.sendSignal({
                type: 'LEAVE',
                playerId: this.playerId
            });
        } catch (e) {}

        try {
            await fetch('/api/room/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId,
                    playerId: this.playerId
                })
            });
        } catch (e) {}

        this.stopListening();
        this.roomId = null;
        this.roomData = null;
        this.isHost = false;
        this.emit('closed', 'Вы вышли из комнаты');
    }

    /**
     * Send a signaling packet to someone, or broadcast to everyone in the room.
     */
    async sendSignal(packet, targetPlayerId = null) {
        if (!this.roomId || !packet) return;

        // Generate unique packet ID to deduplicate in case of delivery duplicates
        if (!packet._msgId) {
            packet._msgId = `${this.playerId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        
        // Keep sender context on packet
        packet.senderId = this.playerId;
        packet.senderName = this.playerName;

        try {
            // Send to our local Python rooms backend
            fetch('/api/room/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId,
                    senderId: this.playerId,
                    targetId: targetPlayerId || null,
                    packet: packet
                })
            }).catch(() => {});

            // Also mirror to ntfy.sh to make it super fast and robust for cross-network connectivity
            const topic = `r34_pz_sig_${this.roomId}`;
            fetch(`https://ntfy.sh/${topic}`, {
                method: 'POST',
                body: JSON.stringify(packet)
            }).catch(() => {});

        } catch (e) {
            console.warn('[Multiplayer] Signal send warning:', e);
        }
    }

    /**
     * Update room data cache on server (useful for hosts storing lobby settings).
     */
    async updateRoomData(updatedData) {
        if (!this.roomId) return;
        this.roomData = {
            ...this.roomData,
            ...updatedData
        };
        // Broadcast the update
        await this.sendSignal({
            type: 'ROOM_DATA',
            roomData: this.roomData
        });
    }

    /**
     * Start the listening system (SSE event stream with transparent Long Polling fallback).
     */
    startListening() {
        this.stopListening();

        const handleRawPacket = (packet) => {
            if (!packet || typeof packet !== 'object') return;
            
            // Deduplicate packets
            if (packet._msgId) {
                if (this.processedPacketIds.has(packet._msgId)) return;
                this.processedPacketIds.add(packet._msgId);
                if (this.processedPacketIds.size > 2000) {
                    const first = this.processedPacketIds.values().next().value;
                    this.processedPacketIds.delete(first);
                }
            }

            // Internal high-level packet routing
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
                if (packet.player && this.isHost) {
                    this.roomData.players[packet.playerId] = packet.player;
                    this.emit('playerJoined', packet.player);
                    this.updateRoomData(this.roomData);
                }
            }

            if (packet.type === 'LEAVE') {
                if (this.isHost && this.roomData.players[packet.playerId]) {
                    delete this.roomData.players[packet.playerId];
                    this.emit('playerLeft', packet.playerId);
                    this.updateRoomData(this.roomData);
                }
            }

            // Bubble up generic message event
            this.emit('message', packet);
        };

        // Channel A: SSE Local Server connection
        const localSseUrl = `/api/room/events?roomId=${this.roomId}&playerId=${this.playerId}`;
        try {
            this.eventSource = new EventSource(localSseUrl);
            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleRawPacket(data);
                } catch (e) {}
            };
            this.eventSource.onerror = () => {
                // If local server SSE drops, we can fallback gracefully
            };
        } catch (err) {
            console.warn('[Multiplayer] Local SSE setup failed, using fallbacks', err);
        }

        // Channel B: Fast ntfy.sh SSE stream mirroring (for ultra-fast cross-network)
        const ntfyTopic = `r34_pz_sig_${this.roomId}`;
        try {
            this.ntfyEventSource = new EventSource(`https://ntfy.sh/${ntfyTopic}/sse`);
            this.ntfyEventSource.onmessage = (event) => {
                try {
                    const sseMsg = JSON.parse(event.data);
                    if (sseMsg.message) {
                        const parsed = JSON.parse(sseMsg.message);
                        handleRawPacket(parsed);
                    }
                } catch (e) {}
            };
        } catch (e) {}

        // Channel C: Fail-safe Long Polling backup (triggers every 1.5s in case EventSource is blocked by proxies/iframes)
        this.pollInterval = setInterval(async () => {
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
                        data.messages.forEach(handleRawPacket);
                    }
                } else if (resp.status === 404) {
                    // Room has been deleted or expired on server
                    this.emit('closed', 'Комната не найдена на сервере');
                    this.stopListening();
                }
            } catch (err) {
                console.warn('[Multiplayer] Long poll tick failed:', err);
            }
        }, 1500);
    }

    stopListening() {
        if (this.eventSource) {
            try { this.eventSource.close(); } catch (e) {}
            this.eventSource = null;
        }
        if (this.ntfyEventSource) {
            try { this.ntfyEventSource.close(); } catch (e) {}
            this.ntfyEventSource = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}
