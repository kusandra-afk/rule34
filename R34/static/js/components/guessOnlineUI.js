/**
 * UI для онлайн-режима "Больше / Меньше".
 */
import { OnlineUI } from '../puzzle/onlineUI.js';
import { prettifyTag } from './guessGame.js';
// GuessOnlineManager НЕ импортируется здесь намеренно — guessOnline.js сам
// импортирует GuessOnlineUI (чтобы дёргать рендер из хостовой логики раунда),
// а статический import в обе стороны — циклическая зависимость модулей.
// Менеджер создаётся в guessUI.js и передаётся сюда готовым объектом.

const TYPE_META = {
    anime: { label: 'Аниме', emoji: '📺' },
    manga: { label: 'Манга', emoji: '📖' },
    game: { label: 'Игра', emoji: '🎮' },
    visual_novel: { label: 'Визуальная новелла', emoji: '💬' },
    cartoon: { label: 'Мультсериал', emoji: '📼' },
    comic: { label: 'Комикс', emoji: '💥' },
    franchise: { label: 'Франшиза', emoji: '🎬' },
    original: { label: 'Ориджинал', emoji: '✏️' },
};

const TARGET_SCORE_OPTIONS = [5, 10, 15, 20];

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

async function classifyEntry(entry) {
    try {
        const resp = await fetch('/api/game/classify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterTag: entry.tag, copyrightTags: entry.copyrightTags })
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        return data && data.ok ? data.result : null;
    } catch (e) {
        return null;
    }
}

export class GuessOnlineUI {
    static showToast(msg, type, iconName) {
        OnlineUI.showToast(msg, type, iconName);
    }

    static getModal() {
        return document.getElementById('guess-online-modal');
    }

    static closeModal() {
        const existing = GuessOnlineUI.getModal();
        if (existing) existing.remove();
    }

    static _newShell(onlineMgr) {
        GuessOnlineUI.closeModal();
        const modal = document.createElement('div');
        modal.id = 'guess-online-modal';
        modal.className = 'game-overlay open';

        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.maxWidth = '620px';
        modal.appendChild(card);
        document.body.appendChild(modal);

        modal.onclick = (e) => {
            if (e.target === modal) GuessOnlineUI._leaveAndClose(onlineMgr);
        };
        return { modal, card };
    }

    static _leaveAndClose(onlineMgr) {
        try { if (onlineMgr && onlineMgr.roomId) onlineMgr.leaveRoom(); } catch (e) {}
        GuessOnlineUI.closeModal();
    }

    static renderSyncScreen(onlineMgr, title, subtitle) {
        const { card } = GuessOnlineUI._newShell(onlineMgr);
        card.dataset.screen = 'sync';
        card.innerHTML = `
            <div class="game-menu-container" style="gap:20px;padding:10px;">
                <div class="guess-spinner"></div>
                <h2 class="game-menu-title" style="font-size:1.5rem;margin:0;">${escapeHtml(title)}</h2>
                <p class="game-menu-desc" style="font-size:0.9rem;color:rgba(255,255,255,0.7);">${escapeHtml(subtitle)}</p>
                <div id="guess-sync-logs" class="game-sync-logs" style="width:100%;text-align:left;"></div>
                <button id="gzSyncCancelBtn" class="game-btn-secondary" style="width:100%;">Отмена</button>
            </div>
        `;
        card.querySelector('#gzSyncCancelBtn').onclick = () => GuessOnlineUI._leaveAndClose(onlineMgr);
    }

    // ---------- ЭКРАН НАСТРОЙКИ (создать/войти) ----------
    static renderLobbySetupUI(onlineMgr) {
        const { modal, card } = GuessOnlineUI._newShell(onlineMgr);

        card.innerHTML = `
            <div class="game-header" style="position:static;">
                <button class="game-back-btn" id="gzBackBtn" style="background:none;border:none;color:#fff;cursor:pointer;padding:8px;border-radius:12px;">←</button>
                <div class="game-title-group">
                    <div class="game-logo-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">⚖️</div>
                    <h2 class="game-app-title">Больше / Меньше — Онлайн</h2>
                </div>
                <button class="game-close-btn" id="gzCloseBtn">&times;</button>
            </div>
            <div class="game-menu-container" style="gap:20px;">
                <h1 class="game-menu-title" style="font-size:1.6rem;">Мультиплеерные Комнаты</h1>
                <div class="game-form-box">
                    <div class="game-form-field">
                        <label class="game-form-label">Твоё имя:</label>
                        <input type="text" id="gzNickInput" class="game-input" value="${escapeHtml(onlineMgr.playerName)}" maxlength="20">
                    </div>

                    <hr class="game-form-divider">

                    <div class="game-form-group">
                        <label class="game-form-label">Присоединиться к комнате:</label>
                        <div class="game-form-row">
                            <input type="text" id="gzJoinCodeInput" class="game-input game-code-input" placeholder="5-значный код" maxlength="5">
                            <button class="game-btn-primary" id="gzJoinBtn" style="min-width:auto;padding:10px 18px;">→ Войти</button>
                        </div>
                        <input type="password" id="gzJoinPasswordInput" class="game-input" placeholder="Пароль комнаты (если задан)" style="margin-top:8px;" autocomplete="new-password">
                    </div>

                    <hr class="game-form-divider">

                    <div class="game-form-group">
                        <label class="game-form-label">Создать новую комнату:</label>
                        <div style="display:flex;flex-direction:column;gap:8px;text-align:left;">
                            <label class="game-form-label" style="font-size:0.85rem;">Очков до победы:</label>
                            <div class="game-category-pills" id="gzTargetScorePills">
                                ${TARGET_SCORE_OPTIONS.map((v, i) => `<div class="game-cat-pill ${i === 0 ? 'active' : ''}" data-score="${v}">${v}</div>`).join('')}
                            </div>
                        </div>
                        <input type="password" id="gzCreatePasswordInput" class="game-input" placeholder="Пароль комнаты (необязательно)" autocomplete="new-password">
                        <button id="gzCreateBtn" class="game-btn-primary game-create-btn">✨ Создать Комнату</button>
                    </div>
                </div>
            </div>
        `;

        let targetScore = TARGET_SCORE_OPTIONS[0];
        card.querySelectorAll('#gzTargetScorePills .game-cat-pill').forEach(pill => {
            pill.onclick = () => {
                card.querySelectorAll('#gzTargetScorePills .game-cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                targetScore = parseInt(pill.dataset.score, 10);
            };
        });

        const nickInput = card.querySelector('#gzNickInput');
        nickInput.oninput = () => onlineMgr.setPlayerName(nickInput.value);

        card.querySelector('#gzCloseBtn').onclick = () => GuessOnlineUI._leaveAndClose(onlineMgr);
        card.querySelector('#gzBackBtn').onclick = async () => {
            modal.remove();
            const { GuessUI } = await import('./guessUI.js');
            GuessUI.open();
        };

        card.querySelector('#gzCreateBtn').onclick = async () => {
            const password = card.querySelector('#gzCreatePasswordInput').value;
            GuessOnlineUI.renderSyncScreen(onlineMgr, 'Создание комнаты...', 'Секунду, настраиваем комнату.');
            try {
                const ok = await onlineMgr.createRoom(targetScore, password);
                if (ok) GuessOnlineUI.renderWaitingRoom(onlineMgr);
                else GuessOnlineUI.renderLobbySetupUI(onlineMgr);
            } catch (err) {
                GuessOnlineUI.showToast((err && err.message) || 'Не удалось создать комнату.', 'danger');
                GuessOnlineUI.renderLobbySetupUI(onlineMgr);
            }
        };

        card.querySelector('#gzJoinBtn').onclick = async () => {
            const code = card.querySelector('#gzJoinCodeInput').value.trim();
            const password = card.querySelector('#gzJoinPasswordInput').value;
            if (!code) {
                GuessOnlineUI.showToast('Введите код комнаты!', 'danger');
                return;
            }
            GuessOnlineUI.renderSyncScreen(onlineMgr, 'Подключение...', `Подключаемся к комнате ${code}...`);
            try {
                await onlineMgr.joinRoomAs(code, password);
                GuessOnlineUI.renderWaitingRoom(onlineMgr);
            } catch (err) {
                const errCode = err && err.message;
                const msg = errCode === 'password_required' ? 'Комната защищена паролем — введите его.'
                    : errCode === 'invalid_password' ? 'Неверный пароль комнаты.'
                    : errCode === 'room_not_responding' ? 'Хост не отвечает. Проверьте код комнаты и что хост сейчас в сети.'
                    : (errCode || 'Комната не найдена или недоступна.');
                GuessOnlineUI.showToast(msg, 'danger');
                GuessOnlineUI.renderLobbySetupUI(onlineMgr);
            }
        };
    }

    // ---------- ЗАЛ ОЖИДАНИЯ ----------
    static renderWaitingRoom(onlineMgr) {
        const { modal, card } = GuessOnlineUI._newShell(onlineMgr);
        card.dataset.screen = 'waiting';

        card.innerHTML = `
            <div class="game-header" style="position:static;">
                <div class="game-title-group">
                    <div class="game-logo-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">⚖️</div>
                    <h2 class="game-app-title">Комната ${escapeHtml(onlineMgr.roomId || '')}</h2>
                </div>
                <button class="game-close-btn" id="gzWaitCloseBtn">&times;</button>
            </div>
            <div class="game-room-header-card">
                <div>Код комнаты: <span class="game-room-code-val">${escapeHtml(onlineMgr.roomId || '')}</span></div>
                <div>Очков до победы: <b>${onlineMgr.roomData?.targetScore ?? '?'}</b></div>
            </div>
            <div class="game-leaderboard" id="gzPlayerList"></div>
            <div id="gzWaitActions" style="text-align:center;"></div>
            <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
                <div style="font-size:0.72rem;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;">Логи:</div>
                <div id="guess-sync-logs" class="game-sync-logs"></div>
            </div>
        `;

        card.querySelector('#gzWaitCloseBtn').onclick = () => GuessOnlineUI._leaveAndClose(onlineMgr);

        GuessOnlineUI._renderWaitingPlayerList(onlineMgr);
    }

    static _renderWaitingPlayerList(onlineMgr) {
        const card = GuessOnlineUI.getModal()?.querySelector('.game-card');
        if (!card || card.dataset.screen !== 'waiting') return;
        const list = card.querySelector('#gzPlayerList');
        const actions = card.querySelector('#gzWaitActions');
        if (!list || !onlineMgr.roomData) return;

        const players = Object.values(onlineMgr.roomData.players || {});
        list.innerHTML = players.map(p => `
            <div class="game-player-row">
                <div class="game-player-name">${p.isHost ? '👑' : '👤'} ${escapeHtml(p.name)}</div>
            </div>
        `).join('') || '<div class="game-player-row">Ожидание игроков...</div>';

        if (actions) {
            if (onlineMgr.isHost) {
                actions.innerHTML = `<button class="game-btn-primary" id="gzStartBtn" style="margin-top:8px;">▶ Начать игру</button>`;
                const startBtn = actions.querySelector('#gzStartBtn');
                if (startBtn) {
                    startBtn.disabled = players.length < 1;
                    startBtn.onclick = () => onlineMgr.hostStartGame();
                }
            } else {
                actions.innerHTML = `<div style="color:rgba(255,255,255,0.6);margin-top:8px;">Ожидаем, пока хост начнёт игру...</div>`;
            }
        }
    }

    // ---------- ОБЩЕЕ ОБНОВЛЕНИЕ (join/leave/ответы) ----------
    static onRoomUpdate(onlineMgr) {
        const card = GuessOnlineUI.getModal()?.querySelector('.game-card');
        if (!card) return;
        if (card.dataset.screen === 'waiting') {
            GuessOnlineUI._renderWaitingPlayerList(onlineMgr);
        } else if (card.dataset.screen === 'round') {
            GuessOnlineUI._renderPlayerStatusList(onlineMgr);
        }
    }

    static onClosed(onlineMgr, reason) {
        GuessOnlineUI.showToast(reason || 'Комната закрыта', 'danger', 'logOut');
        GuessOnlineUI.renderLobbySetupUI(onlineMgr);
    }

    static _renderPlayerStatusList(onlineMgr) {
        const card = GuessOnlineUI.getModal()?.querySelector('.game-card');
        const list = card?.querySelector('#gzRoundPlayerList');
        if (!list || !onlineMgr.roomData) return;
        const players = Object.values(onlineMgr.roomData.players || {});
        const revealed = onlineMgr.roomData.round?.hidden?.count !== undefined;
        list.innerHTML = players.map(p => {
            let statusHtml;
            if (revealed) {
                statusHtml = p.lastCorrect === true ? '<span class="game-player-status game-status-done">✅ Верно</span>'
                    : p.lastCorrect === false ? '<span class="game-player-status" style="background:rgba(239,68,68,0.12);color:#f87171;border:1px solid rgba(239,68,68,0.25);">❌ Мимо</span>'
                    : '';
            } else {
                statusHtml = p.answered
                    ? '<span class="game-player-status game-status-done">Ответил</span>'
                    : '<span class="game-player-status game-status-answering">Думает...</span>';
            }
            return `
                <div class="game-player-row">
                    <div class="game-player-name">${p.isHost ? '👑' : '👤'} ${escapeHtml(p.name)}</div>
                    <div class="game-player-score">${p.score || 0}</div>
                    ${statusHtml}
                </div>
            `;
        }).join('');
    }

    // ---------- РАУНД ----------
    static onRoundStart(onlineMgr) {
        const { modal, card } = GuessOnlineUI._newShell(onlineMgr);
        card.className = 'game-card guess-shell';
        card.dataset.screen = 'round';

        const round = onlineMgr.roomData.round;
        const cur = round.current;
        const hid = round.hidden;

        card.innerHTML = `
            <div class="guess-header">
                <div class="guess-score-box">Раунд ${round.num} &middot; До победы: <b>${onlineMgr.roomData.targetScore}</b></div>
                <button class="game-close-btn" id="gzRoundCloseBtn">&times;</button>
            </div>
            <div class="guess-vs-row">
                <div class="guess-slot">
                    <div class="guess-img-wrap"><img src="${escapeHtml(cur.img)}" class="guess-img" loading="lazy"></div>
                    <div class="guess-name">${escapeHtml(prettifyTag(cur.tag))}</div>
                    <div class="guess-count">${cur.count.toLocaleString('ru-RU')} постов</div>
                    <div class="guess-type" id="gzTypeLeft"></div>
                </div>
                <div class="guess-vs-badge">VS</div>
                <div class="guess-slot">
                    <div class="guess-img-wrap"><img src="${escapeHtml(hid.img)}" class="guess-img" loading="lazy"></div>
                    <div class="guess-name">${escapeHtml(prettifyTag(hid.tag))}</div>
                    <div class="guess-count guess-count-hidden" id="gzHiddenCount">???</div>
                    <div class="guess-type" id="gzTypeRight"></div>
                </div>
            </div>
            <div class="guess-question">У «${escapeHtml(prettifyTag(hid.tag))}» постов больше или меньше, чем у «${escapeHtml(prettifyTag(cur.tag))}» (${cur.count.toLocaleString('ru-RU')})?</div>
            <div class="guess-actions">
                <button class="guess-btn guess-btn-more" id="gzMoreBtn">⬆ Больше</button>
                <button class="guess-btn guess-btn-less" id="gzLessBtn">⬇ Меньше</button>
            </div>
            <div class="guess-feedback" id="gzFeedback"></div>
            <div class="game-leaderboard" id="gzRoundPlayerList"></div>
        `;

        card.querySelector('#gzRoundCloseBtn').onclick = () => GuessOnlineUI._leaveAndClose(onlineMgr);

        classifyEntry(cur).then(res => {
            if (onlineMgr.roomData.round !== round) return;
            GuessOnlineUI._applyType(card, 'gzTypeLeft', res);
        });
        classifyEntry(hid).then(res => {
            if (onlineMgr.roomData.round !== round) return;
            GuessOnlineUI._applyType(card, 'gzTypeRight', res);
        });

        const buttons = Array.from(card.querySelectorAll('.guess-btn'));
        const myAnswered = !!onlineMgr.roomData.players[onlineMgr.playerId]?.answered;
        if (myAnswered) buttons.forEach(b => b.disabled = true);

        buttons.forEach(b => {
            b.onclick = () => {
                buttons.forEach(x => x.disabled = true);
                const direction = b.id === 'gzMoreBtn' ? 'more' : 'less';
                onlineMgr.submitAnswer(direction);
                const feedback = card.querySelector('#gzFeedback');
                if (feedback) feedback.textContent = 'Ответ отправлен, ждём остальных...';
            };
        });

        GuessOnlineUI._renderPlayerStatusList(onlineMgr);
    }

    static _applyType(card, elId, res) {
        if (!res || !card.isConnected) return;
        const meta = TYPE_META[res.type];
        const el = card.querySelector('#' + elId);
        if (!el || !meta) return;
        el.textContent = `${meta.emoji} ${res.title || meta.label}`;
    }

    static onRoundReveal(onlineMgr) {
        const modal = GuessOnlineUI.getModal();
        const card = modal?.querySelector('.game-card');
        if (!card || card.dataset.screen !== 'round') return;

        const round = onlineMgr.roomData.round;
        const hiddenCountEl = card.querySelector('#gzHiddenCount');
        if (hiddenCountEl) {
            hiddenCountEl.textContent = round.hidden.count.toLocaleString('ru-RU') + ' постов';
            hiddenCountEl.classList.remove('guess-count-hidden');
        }

        const myResult = onlineMgr.roomData.players[onlineMgr.playerId];
        const feedback = card.querySelector('#gzFeedback');
        if (feedback && myResult) {
            feedback.textContent = myResult.lastCorrect ? 'Верно!' : 'Неверно!';
            feedback.className = 'guess-feedback ' + (myResult.lastCorrect ? 'guess-feedback-ok' : 'guess-feedback-fail');
        }

        GuessOnlineUI._renderPlayerStatusList(onlineMgr);

        if (onlineMgr.roomData.status === 'finished') {
            setTimeout(() => GuessOnlineUI.renderGameOver(onlineMgr), 1800);
        }
    }

    static renderGameOver(onlineMgr) {
        const { modal, card } = GuessOnlineUI._newShell(onlineMgr);
        card.dataset.screen = 'gameover';

        const winner = onlineMgr.roomData.players[onlineMgr.roomData.winnerId];
        const iWon = onlineMgr.roomData.winnerId === onlineMgr.playerId;
        const players = Object.values(onlineMgr.roomData.players || {}).sort((a, b) => (b.score || 0) - (a.score || 0));

        card.innerHTML = `
            <div class="game-header" style="position:static;">
                <button class="game-close-btn" id="gzOverCloseBtn">&times;</button>
            </div>
            <div class="guess-gameover">
                <div style="font-size:2.5rem;">${iWon ? '🏆' : '🎮'}</div>
                <h2 class="game-menu-title" style="font-size:1.5rem;">${iWon ? 'Вы победили!' : `Победил ${escapeHtml(winner?.name || '?')}`}</h2>
                <div class="game-leaderboard" style="margin-top:16px;width:100%;max-width:340px;">
                    ${players.map(p => `
                        <div class="game-player-row">
                            <div class="game-player-name">${p.id === onlineMgr.roomData.winnerId ? '👑' : '👤'} ${escapeHtml(p.name)}</div>
                            <div class="game-player-score">${p.score || 0}</div>
                        </div>
                    `).join('')}
                </div>
                <button class="game-btn-primary" id="gzPlayAgainBtn" style="margin-top:20px;">Играть ещё раз</button>
                <button class="game-btn-secondary" id="gzOverMenuBtn" style="margin-top:10px;">Выйти из комнаты</button>
            </div>
        `;

        card.querySelector('#gzOverCloseBtn').onclick = () => GuessOnlineUI._leaveAndClose(onlineMgr);
        card.querySelector('#gzOverMenuBtn').onclick = () => GuessOnlineUI._leaveAndClose(onlineMgr);
        const againBtn = card.querySelector('#gzPlayAgainBtn');
        if (onlineMgr.isHost) {
            againBtn.onclick = () => onlineMgr.hostStartGame();
        } else {
            againBtn.disabled = true;
            againBtn.textContent = 'Ждём хоста...';
        }
    }
}
