import { icon } from '../icons.js';
import { fetchPuzzleCompleted } from '../api.js';
import { PuzzleStorage } from './puzzleStorage.js';
import { makeCustomDropdown } from '../components/customDropdown.js';

// Дальше PuzzleUI полностью переработан (библиотека пазлов). Вместо
// полноэкранной панели — стеклянная карточка, вместо захардкоженных
// зелёного/синего/голубого — var(--accent) и адаптивные токены. Всё на
// классах (CSS в ui.css), инлайн-стилей в разметке больше нет.

const CSS = {
    escape: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c])
};

// Помощник: безопасный разбор вариантов пазла в читаемые строки.
function safeVariantList(puzzle) {
    const variants = Array.isArray(puzzle?.variants) ? puzzle.variants : [];
    return variants.map(v => {
        const { cols, rows } = PuzzleStorage.getVariantGrid(v);
        return {
            cols, rows,
            pieces: PuzzleStorage.getVariantPieces(v),
            time: Number(v.time),
            moves: Number(v.moves)
        };
    }).filter(v => v.pieces > 0);
}

// Формат даты без исключения на битой записи.
function formatDate(puzzle) {
    const d = PuzzleStorage.getPuzzleDate(puzzle);
    if (!d) return '—';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Формат времени: HH:MM:SS если час и больше.
function formatTimeFull(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export class PuzzleUI {
    static async showCompletedModal(puzzleGame) {
        if (puzzleGame._animationFrameId) {
            cancelAnimationFrame(puzzleGame._animationFrameId);
            puzzleGame._animationFrameId = null;
        }
        if (puzzleGame.board) {
            puzzleGame.board.style.display = 'none';
        }

        // Лёгкий экран загрузки — прежний, но на классах.
        const loadingModal = document.createElement('div');
        loadingModal.className = 'puzzle-loading-overlay';
        loadingModal.innerHTML = `
            <div class="puzzle-loading-content">
                <div class="puzzle-loading-spinner"></div>
                <div class="puzzle-loading-title">Загрузка библиотеки...</div>
                <div class="puzzle-loading-subtext">Синхронизация с базой данных</div>
            </div>`;
        document.body.appendChild(loadingModal);

        let completedPuzzles = [];
        try {
            completedPuzzles = await fetchPuzzleCompleted();
        } catch (e) {
            console.error('[Puzzle Library] failed to load:', e);
        }
        loadingModal.remove();

        // Защита от битого ответа.
        if (!Array.isArray(completedPuzzles)) completedPuzzles = [];

        const modal = document.createElement('div');
        modal.className = 'puzzle-lib-modal-overlay';
        modal.innerHTML = `
            <div class="puzzle-lib-modal-content" role="dialog" aria-modal="true" aria-label="Библиотека пазлов">
                <div class="puzzle-lib-header">
                    <div class="puzzle-lib-title-container">
                        <h2 class="puzzle-lib-title">${icon('trophy', { size: 22 })} Библиотека Пазлов</h2>
                        <span class="puzzle-lib-count-badge" id="puzzle-lib-count">${completedPuzzles.length}</span>
                    </div>
                    <div class="puzzle-lib-toolbar">
                        <input type="text" class="puzzle-lib-search" id="puzzle-lib-search" placeholder="Поиск по ID..." autocomplete="off">
                        <select class="puzzle-lib-sort" id="puzzle-lib-sort">
                            <option value="recent">Сначала новые</option>
                            <option value="oldest">Сначала старые</option>
                            <option value="pieces_desc">Больше деталей</option>
                            <option value="pieces_asc">Меньше деталей</option>
                            <option value="best">Лучшее время</option>
                        </select>
                        <button class="puzzle-lib-trash-btn" id="puzzle-lib-trash" title="Корзина (удалённые пазлы)" aria-label="Корзина">${icon('trash', { size: 16 })}<span class="puzzle-lib-btn-label">Корзина</span></button>
                        <button class="puzzle-lib-clear-btn" id="puzzle-lib-clear" title="Очистить библиотеку" aria-label="Очистить библиотеку">${icon('broom', { size: 16 })}<span class="puzzle-lib-btn-label">Очистить</span></button>
                        <button class="puzzle-lib-close-btn" id="puzzle-lib-close" title="Закрыть" aria-label="Закрыть">${icon('x', { size: 18 })}</button>
                    </div>
                </div>
                <div class="puzzle-lib-summary" id="puzzle-lib-summary"></div>
                <div class="puzzle-lib-grid" id="puzzle-lib-grid"></div>
            </div>`;

        const content = modal.querySelector('.puzzle-lib-modal-content');
        const grid = modal.querySelector('#puzzle-lib-grid');
        const summaryEl = modal.querySelector('#puzzle-lib-summary');
        const searchEl = modal.querySelector('#puzzle-lib-search');
        const sortEl = modal.querySelector('#puzzle-lib-sort');
        const countEl = modal.querySelector('#puzzle-lib-count');
        const clearBtn = modal.querySelector('#puzzle-lib-clear');
        const trashBtn = modal.querySelector('#puzzle-lib-trash');
        const titleEl = modal.querySelector('.puzzle-lib-title');

        // Текущее состояние фильтра и режим (библиотека / корзина).
        const state = { query: '', sort: 'recent', view: 'library', trash: [] };

        const renderSummary = (list) => {
            const s = PuzzleStorage.summarize(list);
            if (s.total === 0) { summaryEl.innerHTML = ''; return; }
            const best = s.bestTime != null ? formatTimeFull(s.bestTime) : '—';
            summaryEl.innerHTML = `
                <div class="puzzle-lib-summary-item"><span class="puzzle-lib-summary-value">${s.total}</span><span class="puzzle-lib-summary-label">пазлов</span></div>
                <div class="puzzle-lib-summary-item"><span class="puzzle-lib-summary-value">${s.totalVariants}</span><span class="puzzle-lib-summary-label">вариантов</span></div>
                <div class="puzzle-lib-summary-item"><span class="puzzle-lib-summary-value">${formatTimeFull(s.totalTime)}</span><span class="puzzle-lib-summary-label">всего времени</span></div>
                <div class="puzzle-lib-summary-item"><span class="puzzle-lib-summary-value">${s.totalMoves}</span><span class="puzzle-lib-summary-label">всего ходов</span></div>
                <div class="puzzle-lib-summary-item"><span class="puzzle-lib-summary-value">${best}</span><span class="puzzle-lib-summary-label">лучшее время</span></div>`;
        };

        // Вход в корзину: перечитывает удалённые с сервера и перерисовывает.
        const openTrash = async () => {
            const trash = await PuzzleStorage.fetchTrash();
            state.view = 'trash';
            state.trash = trash;
            trashBtn.classList.add('active');
            titleEl.textContent = 'Корзина';
            renderGrid(trash);
            countEl.textContent = String(trash.length);
            summaryEl.innerHTML = '';
        };

        const exitTrash = () => {
            state.view = 'library';
            state.trash = [];
            trashBtn.classList.remove('active');
            titleEl.textContent = 'Библиотека Пазлов';
            applyView();
        };

        // Лучший вариант (минимальное время) на карточке — подсветка.
        const bestVariant = (puzzle) => {
            const variants = safeVariantList(puzzle);
            if (!variants.length) return null;
            let best = variants[0];
            for (const v of variants) {
                if (v.time >= 0 && (best.time < 0 || v.time < best.time)) best = v;
            }
            return best;
        };

        const renderGrid = (list) => {
            grid.innerHTML = '';
            countEl.textContent = String(list.length);

            if (list.length === 0) {
                grid.innerHTML = `
                    <div class="puzzle-lib-empty-container">
                        <div class="puzzle-lib-empty-icon">${icon('puzzle', { size: 48 })}</div>
                        <div class="puzzle-lib-empty-title">${state.query ? 'Ничего не найдено' : 'Библиотека пуста'}</div>
                        <div class="puzzle-lib-empty-subtitle">${state.query ? 'Попробуйте другой ID' : 'Начните собирать пазлы, чтобы они появились здесь!'}</div>
                    </div>`;
                return;
            }

            const fragment = document.createDocumentFragment();

            list.forEach((puzzle, index) => {
                const variants = safeVariantList(puzzle);
                const postId = String(puzzle.postId || puzzle.id || puzzle.post?.id || '');
                const best = bestVariant(puzzle);
                const isDeleted = !!puzzle.is_deleted;

                const card = document.createElement('div');
                card.className = 'puzzle-lib-card' + (isDeleted ? ' is-deleted' : '');
                card.dataset.postId = postId;

                const variantsHtml = variants.map(v => {
                    const isBest = best && v === best;
                    return `<div class="puzzle-lib-variant-info${isBest ? ' is-best' : ''}">
                        <span class="puzzle-lib-variant-size">${v.cols}×${v.rows} <span class="puzzle-lib-variant-pieces">(${v.pieces})</span></span>
                        <span class="puzzle-lib-variant-time">${formatTimeFull(v.time)} • ${v.moves} ходов${isBest ? ' ' + icon('trophy', { size: 12 }) : ''}</span>
                    </div>`;
                }).join('');

                card.innerHTML = `
                    <div class="puzzle-lib-card-badge">#${index + 1}</div>
                    ${isDeleted
                        ? `<button class="puzzle-lib-restore-btn" title="Восстановить пазл">${icon('refresh', { size: 14 })}</button>`
                        : `<button class="puzzle-lib-delete-btn" title="Удалить пазл">${icon('trash', { size: 14 })}</button>`}
                    <div class="puzzle-lib-thumb-container">
                        <img class="puzzle-lib-thumb" alt="Превью пазла" loading="lazy" data-post-id="${CSS.escape(postId)}">
                    </div>
                    <div class="puzzle-lib-info">
                        <div class="puzzle-lib-variant-count">${icon('box', { size: 14 })} ${variants.length} вариант(ов)</div>
                        <div class="puzzle-lib-date-row">
                            <div class="puzzle-lib-date">${icon('clock', { size: 12 })} ${formatDate(puzzle)}</div>
                            ${postId ? `<div class="puzzle-lib-post-badge" title="Нажмите, чтобы скопировать ID">ID: ${CSS.escape(postId)}</div>` : ''}
                        </div>
                        <div class="puzzle-lib-variants-container">${variantsHtml}</div>
                    </div>`;

                fragment.appendChild(card);
            });

            grid.appendChild(fragment);

            // Ленивая подгрузка превью: картинку ставим только когда карточка
            // видна (вместо 100 одновременных запросов при открытии).
            // Искать пазл по ID надо в правильном пуле: в корзине это state.trash,
            // в библиотеке — completedPuzzles, иначе у удалённых нет картинки.
            const pool = state.view === 'trash' ? state.trash : completedPuzzles;
            const thumbs = grid.querySelectorAll('.puzzle-lib-thumb');
            if ('IntersectionObserver' in window) {
                const io = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (!entry.isIntersecting) return;
                        const img = entry.target;
                        io.unobserve(img);
                        PuzzleUI._setThumbSrc(img, pool);
                    });
                }, { rootMargin: '200px' });
                thumbs.forEach(img => io.observe(img));
            } else {
                thumbs.forEach(img => PuzzleUI._setThumbSrc(img, pool));
            }
        };

        // Применяет фильтр + сортировку к текущему списку.
        const applyView = () => {
            let list = completedPuzzles.slice();
            if (state.query) {
                const q = state.query.toLowerCase().trim();
                list = list.filter(p => {
                    const pid = String(p.postId || p.id || p.post?.id || '').toLowerCase();
                    return pid.includes(q);
                });
            }
            list.sort((a, b) => {
                const da = PuzzleStorage.getPuzzleDate(a);
                const db = PuzzleStorage.getPuzzleDate(b);
                const ta = da ? da.getTime() : 0;
                const tb = db ? db.getTime() : 0;
                switch (state.sort) {
                    case 'oldest': return ta - tb;
                    case 'pieces_desc': return PuzzleStorage.getVariantPieces(b.variants?.[0]) - PuzzleStorage.getVariantPieces(a.variants?.[0]);
                    case 'pieces_asc': return PuzzleStorage.getVariantPieces(a.variants?.[0]) - PuzzleStorage.getVariantPieces(b.variants?.[0]);
                    case 'best': {
                        const ba = PuzzleStorage.summarize([a]).bestTime;
                        const bb = PuzzleStorage.summarize([b]).bestTime;
                        return (ba ?? Infinity) - (bb ?? Infinity);
                    }
                    case 'recent':
                    default: return tb - ta;
                }
            });
            renderGrid(list);
            renderSummary(list);
        };

        searchEl.addEventListener('input', () => { state.query = searchEl.value; if (state.view === 'library') applyView(); else renderGrid(state.trash); });
        sortEl.addEventListener('change', () => { state.sort = sortEl.value; if (state.view === 'library') applyView(); });
        trashBtn.addEventListener('click', () => { state.view === 'trash' ? exitTrash() : openTrash(); });

        // Закрытие.
        const close = () => {
            modal.classList.add('closing');
            setTimeout(() => {
                // Убрать портальную панель кастомного дропдауна, если она жива —
                // иначе она останется висеть в document.body после закрытия.
                if (sortDropdown && sortDropdown._portalPanel) {
                    sortDropdown._portalPanel.remove();
                }
                modal.remove();
                puzzleGame._libraryOpen = false;
                if (puzzleGame.board) puzzleGame.board.style.display = 'grid';
                PuzzleUI._releaseModalOpen();
            }, 180);
        };
        modal.querySelector('#puzzle-lib-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

        // Esc — как и в остальных модалках.
        const escHandler = (e) => { if (e.key === 'Escape') { close(); } };
        document.addEventListener('keydown', escHandler);
        modal._cleanupEsc = () => document.removeEventListener('keydown', escHandler);

        // Удаление карточки.
        grid.addEventListener('click', (e) => {
            // Восстановление из корзины.
            const restoreBtn = e.target.closest('.puzzle-lib-restore-btn');
            if (restoreBtn) {
                e.stopPropagation();
                const card = restoreBtn.closest('.puzzle-lib-card');
                const pid = card?.dataset.postId || '';
                const target = state.trash.find(p => String(p.postId || p.id || p.post?.id) === pid);
                if (target) {
                    PuzzleStorage.restorePuzzle(target).then(async () => {
                        completedPuzzles = await PuzzleStorage.fetchActive();
                        exitTrash();
                    });
                }
                return;
            }
            // Удаление из активной библиотеки.
            const delBtn = e.target.closest('.puzzle-lib-delete-btn');
            if (delBtn) {
                e.stopPropagation();
                const card = delBtn.closest('.puzzle-lib-card');
                const pid = card?.dataset.postId || '';
                const target = completedPuzzles.find(p => String(p.postId || p.id || p.post?.id) === pid);
                PuzzleUI._confirmAndDelete(puzzleGame, target, completedPuzzles).then(next => {
                    completedPuzzles = next;
                    applyView();
                });
                return;
            }
            // Копирование ID по клику на бейдж.
            const idBadge = e.target.closest('.puzzle-lib-post-badge');
            if (idBadge) {
                e.stopPropagation();
                const pid = String(idBadge.textContent.replace('ID: ', '')).trim();
                if (pid) {
                    navigator.clipboard?.writeText(pid).then(() => {
                        idBadge.classList.add('copied');
                        const old = idBadge.innerHTML;
                        idBadge.innerHTML = 'Скопировано!';
                        setTimeout(() => { idBadge.classList.remove('copied'); idBadge.innerHTML = old; }, 1500);
                    }).catch(() => {});
                }
                return;
            }
            // Открыть статистику конкретного пазла.
            const card = e.target.closest('.puzzle-lib-card');
            if (card) {
                const pid = card.dataset.postId;
                const pool = state.view === 'trash' ? state.trash : completedPuzzles;
                const puzzle = pool.find(p => String(p.postId || p.id || p.post?.id) === pid);
                if (puzzle) PuzzleUI.showPuzzleStats(puzzleGame, puzzle, true);
            }
        });

        // Очистить всё.
        clearBtn.addEventListener('click', () => {
            if (state.view === 'trash') return;
            PuzzleUI._confirmClear(puzzleGame, completedPuzzles).then(next => {
                completedPuzzles = next;
                applyView();
            });
        });

        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('open'));

        // Превращаем нативный <select class="puzzle-lib-sort"> в кастомный
        // выпадающий список — такой же, как в настройках (.r34-select). Портал
        // выносит панель в document.body, чтобы её не резал backdrop-filter
        // модалки. Панель чистим при закрытии (см. close ниже).
        const sortDropdown = makeCustomDropdown(sortEl, { classPrefix: 'puzzle-lib-dropdown', portal: true });

        applyView();
    }

    // Выставляет src превью: сначала сохранённый URL, при промахе — резолв.
    static _setThumbSrc(img, puzzles) {
        const pid = img.dataset.postId;
        const puzzle = puzzles.find(p => String(p.postId || p.id || p.post?.id) === pid);
        if (!puzzle) return;
        const src = PuzzleStorage.getPuzzleImageUrl(puzzle);
        if (src) {
            img.src = src;
            img.onerror = () => { if (!img.dataset.fallback && puzzle.imageUrl && img.src !== puzzle.imageUrl) { img.dataset.fallback = '1'; img.src = puzzle.imageUrl; } };
        } else if (puzzle?.post?.id || puzzle?.id) {
            PuzzleStorage.resolvePuzzleImageUrl(puzzle).then(r => { if (r) img.src = r; }).catch(() => {});
        }
    }

    static _releaseModalOpen() {
        if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-stats-modal, .puzzle-lib-modal-overlay')) {
            document.body.classList.remove('modal-open');
            document.documentElement.classList.remove('modal-open');
        }
    }

    static async _confirmAndDelete(puzzleGame, puzzle, completedPuzzles) {
        const confirmed = await window.showConfirmModal('Удалить пазл', 'Пазл будет удалён из библиотеки навсегда.', { confirmLabel: 'Удалить' });
        if (!confirmed) return completedPuzzles;
        return PuzzleStorage.deletePuzzle(puzzle, completedPuzzles);
    }

    static async _confirmClear(puzzleGame, completedPuzzles) {
        const confirmed = await window.showConfirmModal('Очистить библиотеку', 'Удалить все собранные пазлы? Это действие необратимо.', { confirmLabel: 'Очистить всё' });
        if (!confirmed) return completedPuzzles;
        const empty = [];
        try {
            await fetch('/api/puzzle-completed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ puzzles: [] })
            });
        } catch (e) {
            console.error('[Puzzle Library] failed to clear on server:', e);
        }
        return empty;
    }

    static async showPuzzleStats(puzzleGame, puzzle, fromLibrary = false) {
        if (puzzleGame.board) { puzzleGame.board.style.display = 'none'; }
        const libraryModal = fromLibrary ? document.querySelector('.puzzle-lib-modal-overlay') : null;
        if (libraryModal) libraryModal.style.display = 'none';

        const variants = safeVariantList(puzzle);
        const best = variants.length ? variants.reduce((a, b) => (b.time >= 0 && (a.time < 0 || b.time < a.time) ? b : a), variants[0]) : null;
        const postId = String(puzzle.postId || puzzle.id || puzzle.post?.id || '');

        const modal = document.createElement('div');
        modal.className = 'puzzle-stats-modal-overlay';
        modal.innerHTML = `
            <div class="puzzle-stats-modal-content" role="dialog" aria-modal="true" aria-label="Статистика пазла">
                <div class="puzzle-stats-header">
                    <div class="puzzle-stats-title-container">
                        <h2 class="puzzle-stats-title">${icon('barChart', { size: 22 })} Статистика</h2>
                    </div>
                    <button class="puzzle-stats-close-btn" title="Закрыть">${icon('x', { size: 18 })}</button>
                </div>
                <div class="puzzle-stats-content-container">
                    <div class="puzzle-stats-image-container">
                        <img class="puzzle-stats-image" alt="Превью пазла">
                    </div>
                    <div class="puzzle-stats-variants">${variants.length ? '' : '<div class="puzzle-lib-empty-subtitle" style="grid-column:1/-1;text-align:center;padding:24px;">Нет сохранённых вариантов</div>'}</div>
                </div>
            </div>`;

        const content = modal.querySelector('.puzzle-stats-modal-content');
        const imageEl = modal.querySelector('.puzzle-stats-image');
        const variantsList = modal.querySelector('.puzzle-stats-variants');

        // Картинка: сохранённый URL или резолв.
        const imgSrc = PuzzleStorage.getPuzzleImageUrl(puzzle);
        if (imgSrc) {
            imageEl.src = imgSrc;
            imageEl.onerror = () => { if (!imageEl.dataset.fallback && puzzle.imageUrl && imageEl.src !== puzzle.imageUrl) { imageEl.dataset.fallback = '1'; imageEl.src = puzzle.imageUrl; } };
        } else if (puzzle?.post?.id || puzzle?.id) {
            PuzzleStorage.resolvePuzzleImageUrl(puzzle).then(r => { if (r) imageEl.src = r; }).catch(() => {});
        }

        // Карточки вариантов (на классах, с подсветкой лучшего).
        variants.forEach(variant => {
            const isBest = best && variant === best;
            const card = document.createElement('div');
            card.className = 'puzzle-stats-variant-card' + (isBest ? ' is-best' : '');
            card.innerHTML = `
                <div class="puzzle-stats-variant-header">
                    <div class="puzzle-stats-size-label">${variant.cols} × ${variant.rows}</div>
                    <div class="puzzle-stats-pieces">${variant.pieces} деталей</div>
                </div>
                <div class="puzzle-stats-grid">
                    <div class="puzzle-stats-box"><span>${icon('clock', { size: 14 })} Время</span><b>${formatTimeFull(variant.time)}</b></div>
                    <div class="puzzle-stats-box"><span>${icon('target', { size: 14 })} Ходов</span><b>${variant.moves}</b></div>
                </div>
                <button class="puzzle-stats-play-btn">${icon('play', { size: 18 })} Играть снова</button>`;
            card.querySelector('.puzzle-stats-play-btn').onclick = () => {
                // «Играть снова» запускает именно этот пазл и именно этот размер.
                modal.classList.add('closing');
                setTimeout(() => {
                    modal.remove();
                    puzzleGame.launchLibraryPuzzle(puzzle.post, variant.pieces, puzzle.imageUrl || puzzle.thumbnail);
                }, 180);
            };
            variantsList.appendChild(card);
        });

        const close = () => {
            modal.classList.add('closing');
            setTimeout(() => {
                modal.remove();
                if (libraryModal) {
                    libraryModal.style.display = '';
                    libraryModal.classList.add('open');
                } else {
                    puzzleGame.board && (puzzleGame.board.style.display = 'grid');
                }
                PuzzleUI._releaseModalOpen();
            }, 180);
        };
        modal.querySelector('.puzzle-stats-close-btn').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        const escHandler = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escHandler);
        modal._cleanupEsc = () => document.removeEventListener('keydown', escHandler);

        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('open'));
    }
}
