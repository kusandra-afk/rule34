/**
 * UI для игры "Больше / Меньше"
 */
import { GuessGame, prettifyTag } from './guessGame.js';

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

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

export class GuessUI {
    static open() {
        const existing = document.getElementById('guess-mode-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'guess-mode-modal';
        modal.className = 'game-overlay open';

        modal.innerHTML = `
            <div class="game-header">
                <button class="game-back-btn" id="guessModeBackBtn" title="Назад к выбору игр" style="background:none;border:none;color:#fff;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:12px;">
                    ${'←'}
                </button>
                <div class="game-title-group">
                    <div class="game-logo-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">⚖️</div>
                    <h2 class="game-app-title">Больше / Меньше <span style="font-size: 0.65em; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 8px; font-weight: 800; vertical-align: middle; margin-left: 6px;">В разработке</span></h2>
                </div>
                <button class="game-close-btn" id="guessModeCloseBtn">&times;</button>
            </div>
        `;

        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <div class="game-menu-container">
                <span class="game-hero-badge game-badge-gradient-primary">Интерактивная Мини-Игра</span>
                <h1 class="game-menu-title">Угадай, у кого постов больше!</h1>
                <div class="game-modes-grid">
                    <div class="game-mode-card primary-mode" id="guessStartSoloBtn">
                        <div class="game-mode-icon-circle">🎮</div>
                        <h3 class="game-mode-title">Одиночный Режим</h3>
                        <p class="game-mode-subtitle">Играйте в своём темпе, побивайте свой рекорд.</p>
                        <div class="game-mode-stat">Рекорд: ${parseInt(localStorage.getItem('r34_guess_best_score') || '0', 10)}</div>
                    </div>
                    <div class="game-mode-card multiplayer" id="guessStartOnlineBtn">
                        <div class="game-mode-icon-circle">👥</div>
                        <h3 class="game-mode-title">Онлайн</h3>
                        <p class="game-mode-subtitle">Создайте комнату и играйте одинаковыми раундами с друзьями до заданного счёта.</p>
                        <div class="game-mode-stat" style="color: #fcd34d; background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.3);">Мультиплеер</div>
                    </div>
                </div>
            </div>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        const closeModal = () => modal.remove();
        modal.querySelector('#guessModeCloseBtn').onclick = closeModal;
        modal.querySelector('#guessModeBackBtn').onclick = () => {
            closeModal();
            if (typeof window.openGameChoiceModal === 'function') {
                window.openGameChoiceModal(window.startPuzzleGame);
            }
        };
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        modal.querySelector('#guessStartSoloBtn').onclick = () => {
            closeModal();
            GuessUI.openSolo();
        };
        modal.querySelector('#guessStartOnlineBtn').onclick = async () => {
            closeModal();
            const [{ GuessOnlineManager }, { GuessOnlineUI }] = await Promise.all([
                import('./guessOnline.js'),
                import('./guessOnlineUI.js')
            ]);
            const onlineMgr = new GuessOnlineManager();
            GuessOnlineUI.renderLobbySetupUI(onlineMgr);
        };
    }

    static openSolo() {
        const existing = document.getElementById('guess-game-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'guess-game-modal';
        modal.className = 'game-overlay open';

        const card = document.createElement('div');
        card.className = 'game-card guess-shell';

        modal.appendChild(card);
        document.body.appendChild(modal);

        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        const game = new GuessGame();
        GuessUI._renderLoading(card);

        game.startRound().then(ok => {
            if (!modal.isConnected) return;
            if (!ok) {
                GuessUI._renderError(card, modal);
            } else {
                GuessUI._renderRound(card, modal, game);
            }
        });
    }

    static _renderLoading(card) {
        card.innerHTML = `
            <div class="guess-loading">
                <div class="guess-spinner"></div>
                <div>Подбираем персонажей...</div>
            </div>
        `;
    }

    static _renderError(card, modal) {
        card.innerHTML = `
            <div class="guess-loading">
                <div style="font-size:2rem;">😕</div>
                <div>Недостаточно постов с известными персонажами.<br>Попробуйте снять часть фильтров тегов и попробовать снова.</div>
                <button class="game-btn-secondary" id="guessBackBtn" style="margin-top:16px;">Назад в меню</button>
            </div>
        `;
        card.querySelector('#guessBackBtn').onclick = () => {
            modal.remove();
            GuessUI.open();
        };
    }

    static _renderRound(card, modal, game) {
        const cur = game.current;
        const hid = game.hidden;
        const curImg = cur.post.sample_url || cur.post.preview_url || cur.post.file_url || '';
        const hidImg = hid.post.sample_url || hid.post.preview_url || hid.post.file_url || '';

        card.innerHTML = `
            <div class="guess-header">
                <div class="guess-score-box">Счёт: <b id="guessScoreVal">${game.score}</b> &middot; Рекорд: <b>${game.best}</b></div>
                <button class="game-close-btn" id="guessCloseBtn">&times;</button>
            </div>
            <div class="guess-vs-row">
                <div class="guess-slot">
                    <div class="guess-img-wrap"><img src="${escapeHtml(curImg)}" class="guess-img" loading="lazy"></div>
                    <div class="guess-name">${escapeHtml(prettifyTag(cur.tag))}</div>
                    <div class="guess-count">${cur.count.toLocaleString('ru-RU')} постов</div>
                    <div class="guess-type" id="guessTypeLeft"></div>
                </div>
                <div class="guess-vs-badge">VS</div>
                <div class="guess-slot">
                    <div class="guess-img-wrap"><img src="${escapeHtml(hidImg)}" class="guess-img" loading="lazy"></div>
                    <div class="guess-name">${escapeHtml(prettifyTag(hid.tag))}</div>
                    <div class="guess-count guess-count-hidden" id="guessHiddenCount">???</div>
                    <div class="guess-type" id="guessTypeRight"></div>
                </div>
            </div>
            <div class="guess-question">У «${escapeHtml(prettifyTag(hid.tag))}» постов больше или меньше, чем у «${escapeHtml(prettifyTag(cur.tag))}» (${cur.count.toLocaleString('ru-RU')})?</div>
            <div class="guess-actions">
                <button class="guess-btn guess-btn-more" id="guessMoreBtn">⬆ Больше</button>
                <button class="guess-btn guess-btn-less" id="guessLessBtn">⬇ Меньше</button>
            </div>
            <div class="guess-feedback" id="guessFeedback"></div>
        `;

        card.querySelector('#guessCloseBtn').onclick = () => modal.remove();

        // Классификация — асинхронное украшение поверх уже готового раунда.
        // Раунд может смениться (или игрок — уйти на game over) раньше, чем
        // придёт ответ, поэтому перед применением сверяем, что game.current/
        // game.hidden всё ещё указывают на тех же персонажей, для которых
        // запрос был отправлен — иначе бейдж уедет не на тот раунд.
        game.classify(cur).then(res => {
            if (game.current !== cur) return;
            GuessUI._applyType(card, 'guessTypeLeft', res);
        });
        game.classify(hid).then(res => {
            if (game.hidden !== hid) return;
            GuessUI._applyType(card, 'guessTypeRight', res);
        });

        const buttons = Array.from(card.querySelectorAll('.guess-btn'));
        buttons.forEach(b => {
            b.onclick = async () => {
                buttons.forEach(x => x.disabled = true);
                const direction = b.id === 'guessMoreBtn' ? 'more' : 'less';
                const result = await game.guess(direction);
                if (!modal.isConnected || !result) return;
                GuessUI._reveal(card, modal, game, result);
            };
        });
    }

    static _applyType(card, elId, res) {
        if (!res || !card.isConnected) return;
        const meta = TYPE_META[res.type];
        const el = card.querySelector('#' + elId);
        if (!el) return;
        if (meta) {
            el.textContent = `${meta.emoji} ${res.title || meta.label}`;
        }
    }

    static _reveal(card, modal, game, result) {
        const hiddenCountEl = card.querySelector('#guessHiddenCount');
        const feedback = card.querySelector('#guessFeedback');

        if (hiddenCountEl) {
            hiddenCountEl.textContent = result.revealed.count.toLocaleString('ru-RU') + ' постов';
            hiddenCountEl.classList.remove('guess-count-hidden');
        }

        if (feedback) {
            feedback.textContent = result.correct ? 'Верно!' : 'Неверно!';
            feedback.className = 'guess-feedback ' + (result.correct ? 'guess-feedback-ok' : 'guess-feedback-fail');
        }

        const scoreVal = card.querySelector('#guessScoreVal');
        if (scoreVal) scoreVal.textContent = String(result.score);

        setTimeout(() => {
            if (!modal.isConnected) return;
            if (result.gameOver) {
                GuessUI._renderGameOver(card, modal, game, result);
            } else {
                GuessUI._renderRound(card, modal, game);
            }
        }, 1400);
    }

    static _renderGameOver(card, modal, game, result) {
        const isNewBest = game.best === result.score && result.score > 0;
        card.innerHTML = `
            <div class="guess-header">
                <button class="game-close-btn" id="guessCloseBtn2">&times;</button>
            </div>
            <div class="guess-gameover">
                <div style="font-size:2.5rem;">${result.poolExhausted ? '🏆' : '💀'}</div>
                <h2 class="game-menu-title" style="font-size:1.5rem;">${result.poolExhausted ? 'Персонажи закончились!' : 'Игра окончена'}</h2>
                <div class="guess-final-score">Счёт: <b>${result.score}</b></div>
                ${isNewBest ? '<div class="guess-new-best">🎉 Новый рекорд!</div>' : `<div class="guess-best-line">Рекорд: ${game.best}</div>`}
                <button class="game-btn-primary" id="guessAgainBtn" style="margin-top:20px;">Играть ещё раз</button>
                <button class="game-btn-secondary" id="guessMenuBtn" style="margin-top:10px;">В меню игр</button>
            </div>
        `;
        card.querySelector('#guessCloseBtn2').onclick = () => modal.remove();
        card.querySelector('#guessAgainBtn').onclick = () => {
            const newGame = new GuessGame();
            GuessUI._renderLoading(card);
            newGame.startRound().then(ok => {
                if (!modal.isConnected) return;
                if (!ok) GuessUI._renderError(card, modal);
                else GuessUI._renderRound(card, modal, newGame);
            });
        };
        card.querySelector('#guessMenuBtn').onclick = () => {
            modal.remove();
            GuessUI.open();
        };
    }
}
