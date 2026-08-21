/**
 * Онлайн-режим "Больше / Меньше". Раунды host-авторитетные: хост подбирает
 * пару персонажей и рассылает её всем (без числа у скрытого), каждый игрок
 * шлёт свой ответ хосту, хост ждёт ответов от всех и только тогда раскрывает
 * правильный ответ и двигает счёт — никакой гонки "кто первый", все видят
 * один и тот же раунд одновременно.
 */
import { BaseOnlineEngine } from '../multiplayer.js';
import { GuessGame, prettifyTag } from './guessGame.js';
import { GuessOnlineUI } from './guessOnlineUI.js';

export class GuessOnlineManager extends BaseOnlineEngine {
    constructor() {
        super('guess');
        this.playerName = localStorage.getItem('r34_puzzle_nickname') || 'Игрок_' + Math.floor(Math.random() * 8999 + 1000);
        this.pool = new GuessGame(); // используем только его пул персонажей, не счёт
        this.pendingAnswers = {}; // playerId -> 'more' | 'less' (только у хоста, не рассылается)
        this.roundNum = 0;
        this._lastStartedRound = 0;
        this._lastRevealedRound = 0;

        this.on('hostReceivedMessage', (senderId, packet) => this._onHostMessage(senderId, packet));
        this.on('clientReceivedMessage', (packet) => this._onClientMessage(packet));
        this.on('roomUpdate', () => GuessOnlineUI.onRoomUpdate(this));
        this.on('playerJoined', (player) => {
            GuessOnlineUI.onRoomUpdate(this);
            GuessOnlineUI.showToast(`Игрок "${player.name}" вошёл в лобби`, 'info', 'user');
        });
        this.on('playerLeft', (id, player) => {
            GuessOnlineUI.onRoomUpdate(this);
            if (player) GuessOnlineUI.showToast(`Игрок "${player.name}" покинул лобби`, 'danger', 'logOut');
        });
        this.on('closed', (reason) => GuessOnlineUI.onClosed(this, reason));
        this.on('error', (err) => GuessOnlineUI.showToast((err && err.message) || 'Ошибка соединения', 'danger'));
        this.on('syncLog', (msg) => {
            const logsEl = document.getElementById('guess-sync-logs');
            if (logsEl) {
                const line = document.createElement('div');
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

    async createRoom(targetScore, password) {
        const roomData = {
            gameType: 'guess',
            status: 'waiting',
            targetScore,
            round: null,
        };
        const created = await super.createRoom(roomData, password);
        if (created) {
            this.roomData.players[this.playerId].score = 0;
            this.roomData.players[this.playerId].answered = false;
        }
        return created;
    }

    async joinRoomAs(code, password) {
        const data = await super.joinRoom(code, password);
        if (data && data.players && data.players[this.playerId]) {
            data.players[this.playerId].score = data.players[this.playerId].score || 0;
        }
        return data;
    }

    // --- ХОСТ: игровой цикл ---
    async hostStartGame() {
        if (!this.isHost) return;
        Object.values(this.roomData.players).forEach(p => { p.score = 0; p.answered = false; p.lastCorrect = null; });
        this.roomData.status = 'playing';
        this.roomData.winnerId = null;
        this.roundNum = 0;
        await this._hostNextRound();
    }

    async _hostNextRound() {
        const ok = await this.pool.ensurePool(6);
        if (!ok) {
            GuessOnlineUI.showToast('Не удалось найти достаточно персонажей', 'danger');
            return;
        }
        const current = this.pool._pickRandom(null);
        let hidden = this.pool._pickRandom(current);
        if (!hidden) {
            await this.pool.ensurePool(this.pool.pool.length + 4);
            hidden = this.pool._pickRandom(current);
        }
        this.roundNum++;
        this.pendingAnswers = {};
        Object.values(this.roomData.players).forEach(p => { p.answered = false; p.lastCorrect = null; });

        this._currentEntry = current;
        this._hiddenEntry = hidden;

        this.roomData.round = {
            num: this.roundNum,
            current: { tag: current.tag, count: current.count, img: current.post.sample_url || current.post.preview_url || current.post.file_url, copyrightTags: current.copyrightTags },
            hidden: { tag: hidden.tag, img: hidden.post.sample_url || hidden.post.preview_url || hidden.post.file_url, copyrightTags: hidden.copyrightTags },
        };
        await this.broadcastRoomData();
        GuessOnlineUI.onRoundStart(this);
    }

    async hostRecordAnswer(playerId, direction) {
        if (!this.isHost || !this.roomData.round) return;
        if (this.pendingAnswers[playerId]) return; // уже ответил
        this.pendingAnswers[playerId] = direction;
        if (this.roomData.players[playerId]) {
            this.roomData.players[playerId].answered = true;
        }
        await this.broadcastRoomData();
        GuessOnlineUI.onRoomUpdate(this);

        const allIds = Object.keys(this.roomData.players);
        const allAnswered = allIds.every(id => this.roomData.players[id].answered);
        if (allAnswered) {
            await this._hostRevealRound();
        }
    }

    async _hostRevealRound() {
        const hiddenCount = this._hiddenEntry.count;
        const currentCount = this._currentEntry.count;
        let winnerId = null;

        for (const [playerId, direction] of Object.entries(this.pendingAnswers)) {
            const correct = direction === 'more' ? hiddenCount >= currentCount : hiddenCount <= currentCount;
            const player = this.roomData.players[playerId];
            if (!player) continue;
            player.lastCorrect = correct;
            if (correct) {
                player.score = (player.score || 0) + 1;
                if (player.score >= this.roomData.targetScore) winnerId = playerId;
            }
        }

        this.roomData.round.hidden.count = hiddenCount;
        this.roomData.revealAt = Date.now();

        if (winnerId) {
            this.roomData.status = 'finished';
            this.roomData.winnerId = winnerId;
        }

        await this.broadcastRoomData();
        GuessOnlineUI.onRoundReveal(this);

        if (!winnerId) {
            setTimeout(() => { if (this.isHost && this.active) this._hostNextRound(); }, 2600);
        }
    }

    // --- ОБЩЕЕ: игрок отвечает (и хост как игрок тоже) ---
    async submitAnswer(direction) {
        if (this.roomData.round?.hidden?.count !== undefined) return; // уже раскрыто
        if (this.isHost) {
            await this.hostRecordAnswer(this.playerId, direction);
        } else {
            this.sendToHost({ type: 'ANSWER', direction });
            // Оптимистично помечаем себя как ответившего, не дожидаясь ROOM_DATA
            if (this.roomData.players[this.playerId]) {
                this.roomData.players[this.playerId].answered = true;
            }
            GuessOnlineUI.onRoomUpdate(this);
        }
    }

    _onHostMessage(senderId, packet) {
        if (packet.type === 'ANSWER') {
            this.hostRecordAnswer(senderId, packet.direction);
        }
    }

    _onClientMessage(packet) {
        // В отличие от пазла, у "Больше/Меньше" не было отдельной обработки
        // ухода хоста — LEAVE от хоста молча игнорировался (базовый класс
        // применяет LEAVE только на стороне самого хоста), и клиенты просто
        // оставались зависшими в игре без хоста без какого-либо сигнала.
        if (packet.type === 'LEAVE' && this.roomData && packet.playerId === this.roomData.hostId) {
            if (this.active) {
                GuessOnlineUI.showToast('Комната закрыта организатором. Соединение разорвано.', 'danger', 'ban');
                const finish = () => this.leaveRoom();
                if (typeof window.showConfirmModal === 'function') {
                    window.showConfirmModal('Комната закрыта', 'Организатор закрыл комнату. Соединение отключено.', { hideCancel: true, confirmLabel: 'Понятно' }).then(finish);
                } else {
                    finish();
                }
            }
            return;
        }
        if (packet.type !== 'ROOM_DATA' || !packet.roomData) return;
        // BaseOnlineEngine уже применил roomData в this.roomData через ROOM_DATA-ветку.
        // Хост шлёт ROOM_DATA не только на старт/раскрытие раунда, но и на каждый
        // промежуточный ответ игрока (для живого статуса "думает/ответил") — важно
        // не перерисовывать весь экран раунда заново на каждый такой пинг, а
        // обновлять только список статусов, если это тот же самый round.num.
        const round = this.roomData.round;
        if (!round) return;
        const isRevealed = round.hidden && round.hidden.count !== undefined;
        if (isRevealed) {
            if (this._lastRevealedRound !== round.num) {
                this._lastRevealedRound = round.num;
                GuessOnlineUI.onRoundReveal(this);
            }
        } else if (this._lastStartedRound !== round.num) {
            this._lastStartedRound = round.num;
            GuessOnlineUI.onRoundStart(this);
        } else {
            GuessOnlineUI.onRoomUpdate(this);
        }
    }
}

export { prettifyTag };
