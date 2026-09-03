/**
 * UI для игры "Больше / Меньше"
 */
import { GuessGame, prettifyTag, postImageUrl, MAX_ARTS_PER_ENTRY } from './guessGame.js';
import { icon } from '../icons.js';

const TYPE_META = {
    anime: { label: 'Аниме', icon: 'tv' },
    manga: { label: 'Манга', icon: 'book' },
    game: { label: 'Игра', icon: 'pad' },
    visual_novel: { label: 'Визуальная новелла', icon: 'chat' },
    cartoon: { label: 'Мультсериал', icon: 'tv' },
    comic: { label: 'Комикс', icon: 'book' },
    franchise: { label: 'Франшиза', icon: 'pad' },
    original: { label: 'Ориджинал', icon: 'pencil' },
};

const ICONS = {
    tv: '<rect x="2" y="7" width="20" height="12" rx="4"/><path d="M8 3l4 4 4-4"/>',
    book: '<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M18 16H7a3 3 0 0 0-3 3"/>',
    pad: '<rect x="2" y="7" width="20" height="12" rx="4"/><path d="M7 11v4M5 13h4M16 12h.01M19 15h.01"/>',
    chat: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.5A8 8 0 1 1 21 12z"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};

function typeIcon(name, size = 12) {
    return `<svg class="guess-type-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.tv}</svg>`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

function fmt(n) {
    return Number(n || 0).toLocaleString('ru-RU');
}

/**
 * Название франшизы, известное СРАЗУ, без обращения к API: берётся из
 * copyright-тегов, которые приезжают вместе с постом. Это отдельное поле
 * Rule34, где франшиза и должна лежать, — в отличие от тегов типа "character",
 * куда попадают и категории вроде "generation 3 pokemon".
 *
 * Классификатор (Wikidata / Steam / Kitsu / VNDB) затем уточняет ТИП
 * (аниме/игра/манга) и при необходимости заменяет название более точным.
 * Из нескольких тегов берём самый короткий: обычно это каноничное короткое имя
 * ("re:zero"), а не полное японское название на всю строку.
 */
// Служебные copyright-теги: франшизу они не называют.
const JUNK_COPYRIGHT = /^(original(_character)?|crossover|real_life|no_copyright|unknown|misc|other)$/i;

function fallbackFranchise(entry) {
    const tags = (entry && entry.copyrightTags || []).filter(t => t && !JUNK_COPYRIGHT.test(t));
    if (tags.length) {
        const shortest = tags.slice().sort((a, b) => a.length - b.length)[0];
        return prettifyTag(shortest);
    }
    // Раньше здесь была догадка по скобкам в имени персонажа
    // ("makima_(chainsaw_man)" → "Chainsaw Man"). Убрана намеренно: в скобках
    // далеко не всегда франшиза — там же пишут форму, костюм, возраст
    // ("midna_(true_form)", "samus_(zero_suit)", "(young)"), и никакой отсев не
    // покрывает все варианты. Имена персонажей — самая грязная часть тегов
    // Rule34, выводить из них название франшизы ненадёжно.
    //
    // Если copyright-тегов нет, плашка остаётся пустой до ответа
    // классификатора (Wikidata / Steam / Kitsu / VNDB) — он и решает. Пусто
    // лучше, чем уверенно показанное неверное название.
    return '';
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
                <button class="game-back-btn guess-icon-btn" id="guessModeBackBtn" title="Назад к выбору игр">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>К играм</span>
                </button>
                <div class="game-title-group">
                    <div class="game-logo-icon guess-logo">
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7 2 14h6z"/><path d="M19 7l-3 7h6z"/><path d="M8 21h8"/></svg>
                    </div>
                    <h2 class="game-app-title">Больше / Меньше</h2>
                </div>
                <button class="game-close-btn" id="guessModeCloseBtn">${icon('x', { size: 18 })}</button>
            </div>
        `;

        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <div class="game-menu-container">
                <span class="game-hero-badge guess-hero-badge">Мини-игра</span>
                <h1 class="game-menu-title">Угадай, у кого<br>постов больше</h1>

                <div class="guess-rules">
                    <div class="guess-rules-title">Как играть</div>
                    <div class="guess-rule"><div class="guess-rule-num">1</div><div class="guess-rule-text">Показываются два персонажа. У левого видно, сколько постов с ним есть на Rule34.</div></div>
                    <div class="guess-rule"><div class="guess-rule-num">2</div><div class="guess-rule-text">У правого скрыто <b>только число</b> — арт и франшиза видны. Угадай, больше оно или меньше.</div></div>
                    <div class="guess-rule"><div class="guess-rule-num">3</div><div class="guess-rule-text">Угадал — правый становится левым, серия растёт. Ошибся — игра окончена.</div></div>
                </div>

                <div class="game-modes-grid">
                    <div class="game-mode-card primary-mode" id="guessStartSoloBtn">
                        <div class="game-mode-icon-circle">
                            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>
                        </div>
                        <h3 class="game-mode-title">Одиночный</h3>
                        <p class="game-mode-subtitle">В своём темпе, без таймера. Бей собственный рекорд.</p>
                        <div class="game-mode-stat">Рекорд: ${parseInt(localStorage.getItem('r34_guess_best_score') || '0', 10)}</div>
                    </div>
                    <div class="game-mode-card multiplayer" id="guessStartOnlineBtn">
                        <div class="game-mode-icon-circle">
                            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.2"/><path d="M22 20v-2a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 7.8"/></svg>
                        </div>
                        <h3 class="game-mode-title">Онлайн</h3>
                        <p class="game-mode-subtitle">Одинаковые раунды с друзьями. Кто первым наберёт счёт.</p>
                        <div class="game-mode-stat game-mode-stat-multiplayer">Мультиплеер</div>
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

        // Клик по фону НЕ закрывает начатую игру: промахнуться мимо карточки
        // легко, а ценой промаха была вся набранная серия. Выйти можно крестиком
        // или клавишей Esc — то есть только намеренно.
        const onEsc = (e) => {
            if (e.key !== 'Escape') return;
            // Esc сначала закрывает просмотр арта, если он открыт
            if (document.getElementById('guess-art-viewer')) return;
            document.removeEventListener('keydown', onEsc);
            modal.remove();
        };
        document.addEventListener('keydown', onEsc);
        // Крестики (#guessCloseBtn/#guessCloseBtn2) закрывают модалку через
        // modal.remove() напрямую, не через onEsc — сохраняем ссылку на
        // элементе, чтобы они тоже могли снять этот слушатель с document,
        // а не оставлять его висеть там навсегда после каждой игры,
        // закрытой не через Escape.
        modal._onEsc = onEsc;

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
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="opacity:.5"><circle cx="12" cy="12" r="9"/><path d="M9 15s1-1.5 3-1.5S15 15 15 15M9 9h.01M15 9h.01"/></svg>
                <div>Недостаточно постов с известными персонажами.<br>Попробуйте снять часть фильтров тегов и попробовать снова.</div>
                <button class="game-btn-secondary" id="guessBackBtn" style="margin-top:16px;">Назад в меню</button>
            </div>
        `;
        card.querySelector('#guessBackBtn').onclick = () => {
            modal.remove();
            GuessUI.open();
        };
    }

    /** Шапка со счётом. Плашка серии показывается только начиная с 3 — до этого
     *  она дублировала бы счёт (в этой игре счёт и есть длина серии). */
    static _statsHtml(score, best) {
        const streak = score >= 3
            ? `<div class="guess-chip guess-chip-streak">
                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s4 4.5 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5.5-2.5S6 10 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12z"/></svg>
                   <b>${score} подряд</b>
               </div>`
            : '';
        return `
            <div class="guess-stats">
                <div class="guess-chip guess-chip-score"><span>Счёт</span><b id="guessScoreVal">${score}</b></div>
                ${streak}
                <div class="guess-stats-spacer"></div>
                <div class="guess-chip guess-chip-best"><span>Рекорд</span><b>${best}</b></div>
            </div>
        `;
    }

    /** Одна карточка персонажа. `hiddenCount` — правый слот (загадка). */
    static _slotHtml(entry, side, hiddenCount) {
        const total = entry.posts.length || 1;
        const img = postImageUrl(entry.posts[entry.artIndex] || entry.posts[0]);
        // Стрелки и счётчик рисуются ВСЕГДА и просто скрыты классом, пока арт
        // один. Раньше они существовали только если к моменту отрисовки артов
        // уже набралось больше одного — а если догрузка запаздывала или не
        // удавалась, листалка не появлялась вовсе.
        const hidden = total > 1 ? '' : ' guess-art-hidden';
        const nav = `
            <button class="guess-art-nav guess-art-prev${hidden}" data-side="${side}" data-dir="-1" aria-label="Предыдущий арт">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button class="guess-art-nav guess-art-next${hidden}" data-side="${side}" data-dir="1" aria-label="Следующий арт">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>`;
        const counter = `<div class="guess-art-counter${hidden}" id="guessCounter-${side}">${entry.artIndex + 1} / ${total}</div>`;
        // Подписаны ОБЕ карточки, а не только загаданная: когда помечена одна,
        // всё равно приходится соображать, что значит вторая. Явная пара
        // «Известно» / «Угадай» читается сразу.
        const badge = hiddenCount
            ? '<div class="guess-riddle-badge">Угадай</div>'
            : '<div class="guess-known-badge">Известно</div>';
        const countBlock = hiddenCount
            ? `<div class="guess-count guess-count-hidden" id="guessHiddenCount">? ? ?</div>`
            : `<div class="guess-count">${fmt(entry.count)}</div>`;

        return `
            <div class="guess-slot ${hiddenCount ? 'guess-slot-riddle' : 'guess-slot-known'}">
                <div class="guess-img-wrap" id="guessImgWrap-${side}">
                    <img src="${escapeHtml(img)}" class="guess-img-bg" id="guessImgBg-${side}" aria-hidden="true" alt="">
                    <img src="${escapeHtml(img)}" class="guess-img" id="guessImg-${side}" loading="lazy" alt="">
                    ${badge}${nav}${counter}
                </div>
                <div class="guess-name">${escapeHtml(prettifyTag(entry.tag))}</div>
                <div class="guess-type" id="guessType-${side}">${
                    fallbackFranchise(entry)
                        ? `<span class="guess-type-chip guess-type-unverified" title="Из тегов поста, ещё не подтверждено справочником"><span>${escapeHtml(fallbackFranchise(entry))}</span></span>`
                        : ''
                }</div>
                ${countBlock}
                <div class="guess-count-label">постов</div>
            </div>
        `;
    }

    static _renderRound(card, modal, game) {
        const cur = game.current;
        const hid = game.hidden;
        // artIndex и загрузка артов уже сделаны в game._preparePair() до вызова
        // сюда — так у каждого персонажа гарантированно свои картинки.

        card.innerHTML = `
            <div class="guess-header">
                ${GuessUI._statsHtml(game.score, game.best)}
                <button class="game-close-btn guess-close" id="guessCloseBtn">${icon('x', { size: 18 })}</button>
            </div>
            <div class="guess-question">У кого больше постов на Rule34?</div>
            <div class="guess-vs-row">
                ${GuessUI._slotHtml(cur, 'left', false)}
                <div class="guess-vs-badge"><span>VS</span></div>
                ${GuessUI._slotHtml(hid, 'right', true)}
            </div>
            <div class="guess-prompt">
                У <b>${escapeHtml(prettifyTag(hid.tag))}</b> постов больше или меньше, чем
                <span class="guess-prompt-num">${fmt(cur.count)}</span>?
            </div>
            <div class="guess-actions">
                <button class="guess-btn guess-btn-more" id="guessMoreBtn">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    Больше
                </button>
                <button class="guess-btn guess-btn-less" id="guessLessBtn">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                    Меньше
                </button>
            </div>
        `;

        card.querySelector('#guessCloseBtn').onclick = () => {
            document.removeEventListener('keydown', modal._onEsc);
            modal.remove();
        };

        GuessUI._wireSlot(card, 'left', cur);
        GuessUI._wireSlot(card, 'right', hid);

        // Если артов пришло меньше одного-двух (запрос по тегу не удался или
        // API ответил отказом) — пробуем догрузить ещё раз в фоне и показываем
        // стрелки, как только их станет чем листать.
        for (const [side, entry] of [['left', cur], ['right', hid]]) {
            if (entry.posts.length > 1) continue;
            entry._artsLoaded = false;
            game.ensureArts(entry).then(() => {
                if (game.current !== cur || game.hidden !== hid) return;
                GuessUI._refreshCarousel(card, side, entry);
            });
        }

        // Классификация — асинхронное украшение поверх уже готового раунда.
        // Раунд может смениться (или игрок — уйти на game over) раньше, чем
        // придёт ответ, поэтому перед применением сверяем, что game.current/
        // game.hidden всё ещё указывают на тех же персонажей, для которых
        // запрос был отправлен — иначе бейдж уедет не на тот раунд.
        game.classify(cur).then(res => {
            if (game.current !== cur) return;
            GuessUI._applyType(card, 'left', res, cur);
        });
        game.classify(hid).then(res => {
            if (game.hidden !== hid) return;
            GuessUI._applyType(card, 'right', res, hid);
        });

        const buttons = Array.from(card.querySelectorAll('.guess-btn'));
        buttons.forEach(b => {
            b.onclick = async () => {
                buttons.forEach(x => x.disabled = true);
                const direction = b.id === 'guessMoreBtn' ? 'more' : 'less';
                const result = await game.guess(direction);
                if (!modal.isConnected || !result) return;
                GuessUI._reveal(card, modal, game, result, cur, hid, direction);
            };
        });
    }

    /**
     * ОДИН обработчик на всю картинку: он же листает по стрелкам, он же
     * открывает полный экран по остальной площади. Раньше это были два
     * обработчика на разных элементах (кнопки и подложка), и клик по стрелке
     * проваливался в полноэкранный просмотр, если порядок навешивания или
     * stopPropagation не срабатывали — например, когда кнопки создавались
     * позже, уже после привязки просмотрщика. Делегирование убирает саму
     * возможность такого рассогласования.
     */
    static _wireSlot(card, side, entry) {
        const wrap = card.querySelector(`#guessImgWrap-${side}`);
        if (!wrap || wrap._slotWired) return;
        wrap._slotWired = true;
        wrap.classList.add('guess-img-zoomable');

        wrap.addEventListener('click', (e) => {
            const nav = e.target.closest('.guess-art-nav');
            if (nav) {
                e.preventDefault();
                e.stopPropagation();
                const total = entry.posts.length;
                if (total < 2) return;
                const dir = parseInt(nav.dataset.dir, 10);
                entry.artIndex = (entry.artIndex + dir + total) % total;
                GuessUI._refreshCarousel(card, side, entry);
                return;
            }
            const urls = entry.posts.map(postImageUrl).filter(Boolean);
            GuessUI._openViewer(urls, entry.artIndex, prettifyTag(entry.tag));
        });
    }

    static _refreshCarousel(card, side, entry) {
        if (!card.isConnected) return;
        const img = card.querySelector(`#guessImg-${side}`);
        const wrap = card.querySelector(`#guessImgWrap-${side}`);
        if (!img || !wrap) return;

        const total = entry.posts.length;
        const url = postImageUrl(entry.posts[entry.artIndex] || entry.posts[0]);
        if (url && img.getAttribute('src') !== url) {
            img.setAttribute('src', url);
            const bg = card.querySelector(`#guessImgBg-${side}`);
            if (bg) bg.setAttribute('src', url);
        }

        // Элементы листалки существуют всегда — их надо только показать/скрыть.
        // Обработчик делегирован на саму обёртку (_wireSlot), поэтому
        // перепривязывать ничего не нужно.
        const shown = total > 1;
        wrap.querySelectorAll('.guess-art-nav').forEach(b => b.classList.toggle('guess-art-hidden', !shown));
        const counter = card.querySelector(`#guessCounter-${side}`);
        if (counter) {
            counter.classList.toggle('guess-art-hidden', !shown);
            counter.textContent = `${entry.artIndex + 1} / ${Math.min(total, MAX_ARTS_PER_ENTRY)}`;
        }
    }


    static _openViewer(urls, startIndex, title) {
        if (!urls || !urls.length) return;
        const old = document.getElementById('guess-art-viewer');
        if (old) old.remove();

        let index = Math.min(Math.max(startIndex || 0, 0), urls.length - 1);

        const viewer = document.createElement('div');
        viewer.id = 'guess-art-viewer';
        viewer.className = 'guess-viewer';
        viewer.innerHTML = `
            <div class="guess-viewer-bar">
                <span class="guess-viewer-title"></span>
                <span class="guess-viewer-count"></span>
                <button class="guess-viewer-close" aria-label="Закрыть">${icon('x', { size: 18 })}</button>
            </div>
            <img class="guess-viewer-img" alt="">
            ${urls.length > 1 ? `
            <button class="guess-viewer-nav guess-viewer-prev" data-dir="-1" aria-label="Предыдущий">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button class="guess-viewer-nav guess-viewer-next" data-dir="1" aria-label="Следующий">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>` : ''}
        `;
        document.body.appendChild(viewer);

        const imgEl = viewer.querySelector('.guess-viewer-img');
        const countEl = viewer.querySelector('.guess-viewer-count');
        viewer.querySelector('.guess-viewer-title').textContent = title || '';

        const paint = () => {
            imgEl.src = urls[index];
            if (countEl) countEl.textContent = urls.length > 1 ? `${index + 1} / ${urls.length}` : '';
        };
        paint();

        const close = () => {
            document.removeEventListener('keydown', onKey);
            viewer.remove();
        };
        const step = (dir) => {
            index = (index + dir + urls.length) % urls.length;
            paint();
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowLeft') step(-1);
            else if (e.key === 'ArrowRight') step(1);
        };

        viewer.querySelector('.guess-viewer-close').onclick = close;
        viewer.querySelectorAll('.guess-viewer-nav').forEach(b => {
            b.onclick = (e) => { e.stopPropagation(); step(parseInt(b.dataset.dir, 10)); };
        });
        // Клик по фону закрывает, по самой картинке — нет
        viewer.addEventListener('click', (e) => {
            if (e.target === viewer || e.target === imgEl) close();
        });
        document.addEventListener('keydown', onKey);
    }

    /** Уточняет уже показанную плашку: добавляет иконку типа и, если справочник
     *  знает более точное название, заменяет им локальное. Если классификация
     *  не удалась или тип неизвестен — оставляем как есть, ничего не стираем:
     *  название франшизы из тегов лучше пустого места. */
    static _applyType(card, side, res, entry) {
        if (!card.isConnected) return;
        const el = card.querySelector(`#guessType-${side}`);
        if (!el) return;
        const meta = res && TYPE_META[res.type];
        if (!meta) return;
        const label = res.title || fallbackFranchise(entry) || meta.label;
        el.innerHTML = `<span class="guess-type-chip guess-type-typed">${typeIcon(meta.icon)}<span>${escapeHtml(label)}</span></span>`;
    }

    static _reveal(card, modal, game, result, cur, hid, direction) {
        const hiddenCountEl = card.querySelector('#guessHiddenCount');
        const slot = card.querySelector('.guess-slot-riddle');
        const question = card.querySelector('.guess-question');
        const prompt = card.querySelector('.guess-prompt');

        if (hiddenCountEl) {
            hiddenCountEl.textContent = fmt(result.revealed.count);
            hiddenCountEl.classList.remove('guess-count-hidden');
            hiddenCountEl.classList.add(result.correct ? 'guess-count-win' : 'guess-count-lose');
        }
        const badge = card.querySelector('.guess-riddle-badge');
        if (badge) badge.remove();
        if (slot) slot.classList.add(result.correct ? 'guess-slot-win' : 'guess-slot-lose');
        card.classList.add(result.correct ? 'guess-card-win' : 'guess-card-lose');

        // Вердикт занимает строку вопроса, а не добавляет новую — вёрстка не прыгает
        if (question) {
            question.classList.add(result.correct ? 'guess-verdict-ok' : 'guess-verdict-fail');
            question.innerHTML = result.correct
                ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Верно! У ${escapeHtml(prettifyTag(hid.tag))} ${result.revealed.count >= cur.count ? 'больше' : 'меньше'}`
                : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg> Мимо! У ${escapeHtml(prettifyTag(hid.tag))} ${result.revealed.count >= cur.count ? 'больше' : 'меньше'}`;
        }

        const scoreVal = card.querySelector('#guessScoreVal');
        if (scoreVal) scoreVal.textContent = String(result.score);

        card.querySelectorAll('.guess-btn').forEach(b => b.classList.add('guess-btn-dimmed'));

        if (prompt && result.correct) {
            prompt.innerHTML = `<span class="guess-next-label">Следующий раунд…</span><span class="guess-next-bar"><i></i></span>`;
            prompt.classList.add('guess-next');
        }

        // Арты следующей пары догружаем во время паузы показа результата, а не
        // при отрисовке — иначе новый раунд ждал бы сеть уже на глазах игрока.
        const ready = result.gameOver ? Promise.resolve() : game.prepareNext();

        setTimeout(() => {
            if (!modal.isConnected) return;
            if (result.gameOver) {
                GuessUI._renderGameOver(card, modal, game, result, cur, hid, direction);
            } else {
                ready.then(() => {
                    if (!modal.isConnected) return;
                    card.classList.remove('guess-card-win', 'guess-card-lose');
                    GuessUI._renderRound(card, modal, game);
                });
            }
        }, result.correct ? 1800 : 2200);
    }

    static _renderGameOver(card, modal, game, result, cur, hid, direction) {
        const isNewBest = game.best === result.score && result.score > 0;
        const prevBest = parseInt(localStorage.getItem('r34_guess_best_score') || '0', 10) || 0;

        card.classList.remove('guess-card-win', 'guess-card-lose');
        card.innerHTML = `
            <div class="guess-header">
                <div></div>
                <button class="game-close-btn guess-close" id="guessCloseBtn2">${icon('x', { size: 18 })}</button>
            </div>
            <div class="guess-gameover">
                <div class="guess-over-icon ${result.poolExhausted || isNewBest ? 'guess-over-icon-win' : ''}">
                    ${result.poolExhausted || isNewBest
                        ? '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h2.5a2.5 2.5 0 0 1 0 5H17M7 5H4.5a2.5 2.5 0 0 0 0 5H7"/></svg>'
                        : '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 15s1-1.5 3-1.5S15 15 15 15M9 9h.01M15 9h.01"/></svg>'}
                </div>
                <h2 class="guess-over-title">${result.poolExhausted ? 'Персонажи закончились!' : (isNewBest ? 'Новый рекорд!' : 'Игра окончена')}</h2>
                <div class="guess-over-sub">${result.poolExhausted ? 'Ты прошёл весь доступный пул' : `Серия оборвалась на ${escapeHtml(prettifyTag(hid.tag))}`}</div>

                <div class="guess-tiles">
                    <div class="guess-tile guess-tile-score"><div class="guess-tile-num">${result.score}</div><div class="guess-tile-label">Счёт</div></div>
                    <div class="guess-tile guess-tile-best"><div class="guess-tile-num">${game.best}</div><div class="guess-tile-label">Рекорд</div></div>
                    <div class="guess-tile"><div class="guess-tile-num">${isNewBest ? prevBest : game.best}</div><div class="guess-tile-label">Было</div></div>
                </div>

                ${result.poolExhausted ? '' : `
                <div class="guess-recap">
                    <div class="guess-recap-title">Последний раунд</div>
                    <div class="guess-recap-row">
                        <div class="guess-recap-side">
                            <div class="guess-recap-thumb"><img src="${escapeHtml(postImageUrl(cur.posts[cur.artIndex] || cur.posts[0]))}" alt=""></div>
                            <div class="guess-recap-info">
                                <div class="guess-recap-name">${escapeHtml(prettifyTag(cur.tag))}</div>
                                <div class="guess-recap-num">${fmt(cur.count)}</div>
                            </div>
                        </div>
                        <div class="guess-recap-verdict">Ты сказал «${direction === 'more' ? 'больше' : 'меньше'}»</div>
                        <div class="guess-recap-side guess-recap-side-right">
                            <div class="guess-recap-info">
                                <div class="guess-recap-name">${escapeHtml(prettifyTag(hid.tag))}</div>
                                <div class="guess-recap-num guess-recap-num-win">${fmt(result.revealed.count)}</div>
                            </div>
                            <div class="guess-recap-thumb guess-recap-thumb-win"><img src="${escapeHtml(postImageUrl(hid.posts[hid.artIndex] || hid.posts[0]))}" alt=""></div>
                        </div>
                    </div>
                </div>`}

                <div class="guess-over-actions">
                    <button class="game-btn-primary guess-btn-again" id="guessAgainBtn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
                        Играть ещё раз
                    </button>
                    <button class="game-btn-secondary" id="guessMenuBtn">В меню игр</button>
                </div>
            </div>
        `;
        card.querySelector('#guessCloseBtn2').onclick = () => {
            document.removeEventListener('keydown', modal._onEsc);
            modal.remove();
        };
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
