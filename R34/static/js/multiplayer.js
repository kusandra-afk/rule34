/**
 * BaseOnlineEngine - Centralized P2P Multiplayer Engine
 * Uses PeerJS (public 0.peerjs.com broker) for WebRTC signaling and Metered.ca
 * (optional, user-provided key) for TURN relay. No backend of our own is
 * involved: every player runs their own local server, so the only way two
 * separate browsers/devices can find each other is through this shared
 * public broker.
 * Designed as a reusable base class for online games (Puzzle, Memory, Quiz, Arcade, etc.).
 */

const PEERJS_SCRIPT_URL = '/static/js/vendor/peerjs.min.js';
let peerJsLoadPromise = null;

function loadPeerJs() {
    if (window.Peer) return Promise.resolve();
    if (peerJsLoadPromise) return peerJsLoadPromise;
    peerJsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PEERJS_SCRIPT_URL;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Не удалось загрузить библиотеку PeerJS'));
        document.head.appendChild(script);
    });
    return peerJsLoadPromise;
}

export class BaseOnlineEngine {
    constructor(gameType = 'generic') {
        this.gameType = gameType;

        // Player credentials
        this.playerId = 'pl_' + Math.random().toString(36).substring(2, 9);
        this.playerName = localStorage.getItem('r34_puzzle_nickname') || 'Игрок_' + Math.floor(1000 + Math.random() * 9000);
        // Собственный адрес на брокере PeerJS — отдельный от playerId и
        // намеренно длинный/случайный, чтобы избежать коллизий в общем
        // публичном пространстве ID (в отличие от playerId у хоста, который
        // должен быть ПРЕДСКАЗУЕМЫМ — см. _computeHostPeerId).
        this._selfPeerJsId = 'r34p' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

        this.roomId = null;
        this.isHost = false;
        this.active = false;
        this.gameMode = 'race';
        this.roomData = null;
        this.roomPassword = '';

        // PeerJS
        this.peer = null;
        this.connections = []; // Host: [{ playerId, conn }]
        this.hostConn = null;  // Client: DataConnection to Host

        this.roomHeartbeatTimer = null;
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
            message: [],               // (packet) => {}
            roomUpdate: [],            // (roomData) => {}
            playerJoined: [],          // (player) => {}
            playerLeft: [],            // (playerId) => {}
            dcOpen: [],                // (peerId) => {}
            dcClose: [],               // (peerId) => {}
            closed: [],                // (reason) => {}
            error: [],                 // (err) => {}
            hostReceivedMessage: [],   // (senderId, packet) => {}
            clientReceivedMessage: [], // (packet) => {}
            syncLog: []                // (msg) => {}
        };

        // Metered TURN key check. Без сохранённого ключа остаёмся на
        // дефолтном публичном STUN-наборе, объявленном выше.
        const savedKey = localStorage.getItem('gameMeteredKey') || localStorage.getItem('hlMeteredKey') || localStorage.getItem('r34_metered_key');
        if (savedKey) {
            this.setupMeteredIce(savedKey);
        }
    }

    // --- NICKNAME MANAGEMENT ---
    setPlayerName(name) {
        if (!name) return;
        this.playerName = name.trim();
        localStorage.setItem('r34_puzzle_nickname', this.playerName);
    }

    // --- ICE & TURN SETUP ---
    // Ключ хранится как "username.credential" — статичная пара доступа,
    // которую Metered выдаёт в личном кабинете (кнопка "Show API Key" на
    // странице TURN Credentials, показывает ровно Username и Password для
    // этой пары). Адрес релея у Metered фиксированный —
    // global.relay.metered.ca — его не нужно подставлять по имени
    // приложения. Раньше тут был захардкожен фейковый username/credential
    // ("metered"/"key") от СОВСЕМ другого продукта Metered (Realtime
    // Messaging/чат) — из-за этого TURN никогда по-настоящему не работал,
    // только STUN, и всё ломалось именно в случаях, где TURN обязателен
    // (строгий NAT, VPN/прокси без нормального UDP и т.п.).
    setupMeteredIce(key) {
        if (!key || typeof key !== 'string') return;
        const cleanKey = key.trim();
        const dotIdx = cleanKey.indexOf('.');
        if (dotIdx === -1) {
            this.addSyncLog('[Metered] Неверный формат ключа — нужно "username.credential"');
            return;
        }
        const username = cleanKey.slice(0, dotIdx);
        const credential = cleanKey.slice(dotIdx + 1);
        localStorage.setItem('r34_metered_key', cleanKey);

        this.iceServers = [
            { urls: 'stun:stun.relay.metered.ca:80' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'turn:global.relay.metered.ca:80', username, credential },
            { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential },
            { urls: 'turn:global.relay.metered.ca:443', username, credential },
            { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential }
        ];
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

    // --- HOST PEER ID DERIVATION ---
    // Каждый игрок держит свой собственный локальный сервер — общей комнаты
    // на сервере не существует, поэтому рандеву происходит через публичный
    // брокер PeerJS (0.peerjs.com): host регистрируется на брокере под
    // предсказуемым ID, производным от кода комнаты + типа игры + пароля,
    // а гость вычисляет тот же ID и подключается к нему напрямую. Неверный
    // пароль даёт другой ID — то есть хост с таким адресом просто не найден
    // — и тем самым служит неявной защитой паролем без сервера-валидатора.
    async _computeHostPeerId(roomCode, password) {
        const raw = `r34_${this.gameType}_${roomCode}_${password || ''}`;
        try {
            if (window.crypto && window.crypto.subtle) {
                const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
                const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
                return `r34h${hex.slice(0, 40)}`;
            }
        } catch (e) {
            // crypto.subtle недоступен вне secure context (например, при
            // заходе по http://<локальный-IP>:3000 с другого устройства в
            // локальной сети) — падаем на простой нестойкий хэш ниже.
        }
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
        }
        return `r34h${roomCode}${Math.abs(hash)}`;
    }

    // Создаёт и открывает собственный Peer на брокере PeerJS. desiredId не
    // передаём для гостя (даём брокеру сгенерировать случайный) — только
    // хосту, которому важно быть по предсказуемому адресу.
    _openPeer(desiredId) {
        return loadPeerJs().then(() => new Promise((resolve, reject) => {
            const peer = new window.Peer(desiredId || this._selfPeerJsId, {
                config: { iceServers: this.iceServers },
                debug: 0
            });
            const onOpen = () => { cleanup(); resolve(peer); };
            const onError = (err) => { cleanup(); reject(err); };
            const cleanup = () => {
                peer.off('open', onOpen);
                peer.off('error', onError);
            };
            peer.on('open', onOpen);
            peer.on('error', onError);
        }));
    }

    // --- ROOM CREATION & JOINING ---
    async createRoom(customInitialData = {}, password = '') {
        this.roomId = this.generateRoomCode();
        this.isHost = true;
        this.active = true;
        this.roomPassword = (password || '').trim();

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
            const hostPeerId = await this._computeHostPeerId(this.roomId, this.roomPassword);
            this.peer = await this._openPeer(hostPeerId);
            this.peer.on('connection', (conn) => this._handleIncomingConnection(conn));
            this.peer.on('error', (err) => this.addSyncLog(`[PeerJS] Ошибка: ${err.type || err.message}`));
            this.addSyncLog(`Создана комната ${this.roomId}. Режим хоста.`);

            this.startHeartbeat();

            return this.roomData;
        } catch (err) {
            this.emit('error', err);
            throw err;
        }
    }

    async joinRoom(code, password = '') {
        this.roomId = code.trim().toUpperCase();
        this.isHost = false;
        this.active = true;
        this.roomPassword = (password || '').trim();

        const myPlayerObj = {
            id: this.playerId,
            name: this.playerName,
            isHost: false,
            ready: true,
            joinedAt: new Date().toISOString()
        };

        try {
            const hostPeerId = await this._computeHostPeerId(this.roomId, this.roomPassword);
            this.peer = await this._openPeer();
            this.peer.on('error', (err) => this.addSyncLog(`[PeerJS] Ошибка: ${err.type || err.message}`));
            this.addSyncLog(`Подключение к комнате ${this.roomId}...`);

            // reliable:false — то же "ordered:false", что было у сырого
            // RTCDataChannel до перехода на PeerJS: частые позиционные
            // обновления (перетаскивание детали в совместном режиме) не
            // должны ждать гарантированной доставки и порядка — при задержке
            // в сети (TURN-релей через VPN/прокси — обычное дело для этого
            // проекта) reliable-канал копит недоставленные обновления и потом
            // разом их вываливает, отсюда дёрганое перемещение чужой детали.
            // Старые позиции всё равно бесполезны, как только пришла новая.
            const conn = this.peer.connect(hostPeerId, { reliable: false });
            // На VPN/прокси-туннелях (особенно V2Ray-подобных, которые часто
            // плохо прокидывают UDP) ICE может подолгу перебирать недоступные
            // прямые UDP-варианты, прежде чем откатиться на TCP-релей через
            // TURN — поэтому таймаут заметно больше, чем нужен для обычного
            // прямого соединения.
            await this._waitForConnOpen(conn, 40000);
            this.hostConn = conn;
            this._wireDataConnection(conn);
            this.addSyncLog('Соединение с хостом установлено, отправляю запрос на вход...');

            const joinPacket = this._stampPacket({ type: 'JOIN', playerId: this.playerId, player: myPlayerObj });
            conn.send(JSON.stringify(joinPacket));

            // Канал больше не гарантирует доставку — единственный JOIN может
            // потеряться, поэтому повторяем его, пока не придёт ROOM_DATA.
            await this._waitForRoomData(10000, conn, joinPacket);

            return this.roomData;
        } catch (err) {
            this.emit('error', err);
            throw err;
        }
    }

    // Ждёт открытия DataConnection к хосту — если хоста с таким адресом на
    // брокере PeerJS нет (комната не существует, брокер ещё не увидел
    // хоста, или пароль неверный — тогда вычисленный ID вообще другой),
    // подключение никогда не откроется, поэтому ждём с таймаутом.
    _waitForConnOpen(conn, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                try { conn.close(); } catch (e) {}
                reject(new Error('room_not_responding'));
            }, timeoutMs);
            const onOpen = () => { cleanup(); resolve(); };
            const onError = (err) => { cleanup(); reject(err instanceof Error ? err : new Error('room_not_responding')); };
            const onClose = () => { cleanup(); reject(new Error('room_not_responding')); };
            const cleanup = () => {
                clearTimeout(timer);
                conn.off('open', onOpen);
                conn.off('error', onError);
                conn.off('close', onClose);
            };
            conn.on('open', onOpen);
            conn.on('error', onError);
            conn.on('close', onClose);
        });
    }

    // Ждёт первый ROOM_DATA от хоста — единственный способ клиенту узнать
    // состояние комнаты, так как локального общего сервера между игроками
    // нет. Канал теперь unreliable/unordered (см. joinRoom), так что сам
    // JOIN может потеряться — повторяем его, пока не придёт ROOM_DATA.
    _waitForRoomData(timeoutMs, conn, joinPacket) {
        if (this.roomData && this.roomData.hostId) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const retryTimer = (conn && joinPacket) ? setInterval(() => {
                if (conn.open) {
                    try { conn.send(JSON.stringify(joinPacket)); } catch (e) {}
                }
            }, 1500) : null;
            const cleanup = () => {
                if (retryTimer) clearInterval(retryTimer);
                clearTimeout(timer);
                this.off('roomUpdate', onUpdate);
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('room_not_responding'));
            }, timeoutMs);
            const onUpdate = () => {
                cleanup();
                resolve();
            };
            this.on('roomUpdate', onUpdate);
        });
    }

    async updateRoomData(updatedData) {
        if (!this.roomId) return;
        this.roomData = {
            ...this.roomData,
            ...updatedData
        };
        this.roomData._rev = (this.roomData._rev || 0) + 1;
        this.broadcast({ type: 'ROOM_DATA', roomData: this.roomData });
        this.emit('roomUpdate', this.roomData);
    }

    async broadcastRoomData() {
        if (!this.roomId || !this.roomData) return;
        this.roomData._rev = (this.roomData._rev || 0) + 1;
        this.broadcast({ type: 'ROOM_DATA', roomData: this.roomData });
        this.emit('roomUpdate', this.roomData);
    }

    // --- INCOMING CONNECTIONS (HOST SIDE) ---
    _handleIncomingConnection(conn) {
        this.addSyncLog(`[PeerJS] Входящее соединение от ${conn.peer}...`);
        conn.on('open', () => {
            this.addSyncLog('[PeerJS] Соединение открыто, жду JOIN...');
        });
        this._wireDataConnection(conn);
    }

    _wireDataConnection(conn) {
        conn.on('data', (data) => {
            try {
                const packet = typeof data === 'string' ? JSON.parse(data) : data;
                if (packet.type === 'PING') return;
                this._registerConnectionForPacket(conn, packet);
                this.handleIncomingPacket(packet, packet.senderId);
            } catch (err) {
                console.error('[BaseOnlineEngine] Error parsing packet:', err);
            }
        });
        conn.on('close', () => {
            const entry = this.connections.find(c => c.conn === conn);
            if (entry) {
                this.connections = this.connections.filter(c => c.conn !== conn);
                this.addSyncLog(`[PeerJS] Соединение с ${entry.playerId} закрыто`);
                this.emit('dcClose', entry.playerId);
            } else if (!this.isHost) {
                this.hostConn = null;
                this.emit('dcClose', conn.peer);
            }
        });
        conn.on('error', (err) => {
            console.error('[BaseOnlineEngine] DataConnection error:', err);
        });
    }

    // Регистрирует связь playerId -> conn у хоста при первом же пакете от
    // этого игрока (обычно JOIN) — до этого момента хост знает только
    // случайный PeerJS-адрес подключившегося, а не игровой playerId.
    _registerConnectionForPacket(conn, packet) {
        if (!this.isHost || !packet || !packet.playerId) return;
        const already = this.connections.find(c => c.playerId === packet.playerId);
        if (already) {
            already.conn = conn;
            return;
        }
        this.connections.push({ playerId: packet.playerId, conn });
        this.emit('dcOpen', packet.playerId);
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

        // Internal room state update
        if (packet.type === 'ROOM_CLOSED') {
            this.emit('closed', packet.message || 'Комната закрыта организатором');
            return;
        }

        if (packet.type === 'ROOM_DATA') {
            if (packet.roomData) {
                const incomingRev = packet.roomData._rev;
                const currentRev = this.roomData && this.roomData._rev;
                const isStale = incomingRev !== undefined && currentRev !== undefined && incomingRev <= currentRev;
                if (!isStale) {
                    // Снимок игроков ДО перезаписи — иначе playerJoined/Left
                    // ниже сравнивали бы this.roomData.players сам с собой
                    // (this.roomData уже указывал бы на packet.roomData) и
                    // никогда бы не находили разницу. Это единственный способ
                    // клиенту (не хосту) вообще узнать о входе/выходе игрока —
                    // сырые JOIN/LEAVE обрабатывает только сам хост.
                    const oldPlayers = this.roomData?.players || {};
                    const newPlayers = packet.roomData.players || {};
                    this.roomData = packet.roomData;
                    for (const id in newPlayers) {
                        if (id !== this.playerId && !oldPlayers[id]) {
                            this.emit('playerJoined', newPlayers[id]);
                        }
                    }
                    for (const id in oldPlayers) {
                        if (id !== this.playerId && !newPlayers[id]) {
                            this.emit('playerLeft', id, oldPlayers[id]);
                        }
                    }
                    this.emit('roomUpdate', this.roomData);
                }
            }
        }

        if (packet.type === 'JOIN') {
            if (this.isHost) {
                if (!this.roomData.players) this.roomData.players = {};
                this.roomData.players[packet.playerId] = packet.player;
                this.emit('playerJoined', packet.player);
                this.broadcastRoomData();
            }
        }

        if (packet.type === 'LEAVE') {
            if (this.isHost && this.roomData?.players?.[packet.playerId]) {
                const leavingPlayer = this.roomData.players[packet.playerId];
                delete this.roomData.players[packet.playerId];
                const entry = this.connections.find(c => c.playerId === packet.playerId);
                if (entry) {
                    try { entry.conn.close(); } catch (e) {}
                    this.connections = this.connections.filter(c => c.playerId !== packet.playerId);
                }
                this.emit('playerLeft', packet.playerId, leavingPlayer);
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

    _stampPacket(data) {
        if (!data._msgId) {
            data._msgId = `${this.playerId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        data.senderId = this.playerId;
        data.senderName = this.playerName;
        return data;
    }

    // --- DATACHANNEL MESSAGING ---
    broadcast(packet) {
        const dataObj = typeof packet === 'string' ? JSON.parse(packet) : packet;
        this._stampPacket(dataObj);
        const payload = JSON.stringify(dataObj);
        if (this.isHost) {
            this.connections.forEach(c => {
                if (c.conn && c.conn.open) {
                    try { c.conn.send(payload); } catch (e) {}
                }
            });
        } else if (this.hostConn && this.hostConn.open) {
            try { this.hostConn.send(payload); } catch (e) {}
        }
    }

    sendToHost(packet) {
        const dataObj = typeof packet === 'string' ? JSON.parse(packet) : packet;
        this._stampPacket(dataObj);
        if (this.hostConn && this.hostConn.open) {
            try { this.hostConn.send(JSON.stringify(dataObj)); } catch (e) {}
        }
    }

    sendToPlayer(targetId, packet) {
        const dataObj = typeof packet === 'string' ? JSON.parse(packet) : packet;
        this._stampPacket(dataObj);
        const conn = this.connections.find(c => c.playerId === targetId);
        if (conn && conn.conn && conn.conn.open) {
            try { conn.conn.send(JSON.stringify(dataObj)); } catch (e) {}
        }
    }

    // --- HEARTBEAT & CLEANUP ---
    startHeartbeat() {
        if (this.roomHeartbeatTimer) clearInterval(this.roomHeartbeatTimer);
        this.roomHeartbeatTimer = setInterval(() => {
            if (this.isHost) {
                const ping = JSON.stringify({ type: 'PING' });
                this.connections.forEach(c => {
                    if (c.conn && c.conn.open) {
                        try { c.conn.send(ping); } catch (e) {}
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

        // Канал теперь unreliable (см. joinRoom) — единственная отправка
        // LEAVE может потеряться, поэтому дублируем её несколько раз, и
        // только потом рвём соединение (conn.send() лишь ставит данные в
        // очередь WebRTC-стека — закрыть Peer сразу же следом означало бы
        // рискнуть не отправить вообще ничего). Цели захватываем ЗАРАНЕЕ:
        // this.connections/this.hostConn обнуляются ниже синхронно, а
        // повторные отправки идут с задержкой.
        const targetConns = this.isHost
            ? this.connections.map(c => c.conn).filter(Boolean)
            : (this.hostConn ? [this.hostConn] : []);
        const leavePayload = JSON.stringify(this._stampPacket({ type: 'LEAVE', playerId: this.playerId }));
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                targetConns.forEach(conn => {
                    if (conn.open) {
                        try { conn.send(leavePayload); } catch (e) {}
                    }
                });
            }, i * 120);
        }

        this.stopHeartbeat();

        const peerToDestroy = this.peer;
        this.peer = null;
        setTimeout(() => {
            if (peerToDestroy) {
                try { peerToDestroy.destroy(); } catch (e) {}
            }
        }, 600);

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
