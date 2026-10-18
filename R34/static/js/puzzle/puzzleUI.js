import { icon } from '../icons.js';
import { fetchPuzzleCompleted } from '../api.js';
import { PuzzleStorage } from './puzzleStorage.js';

export class PuzzleUI {
    static async showCompletedModal(puzzleGame) {
        if (puzzleGame._animationFrameId) {
            cancelAnimationFrame(puzzleGame._animationFrameId);
            puzzleGame._animationFrameId = null;
        }
        if (puzzleGame.board) {
            puzzleGame.board.style.display = 'none';
        }
        const loadingModal = document.createElement('div');
        loadingModal.className = 'puzzle-loading-overlay keep-animation';
        const loadingContent = document.createElement('div');
        loadingContent.className = 'puzzle-loading-content keep-animation';
        const spinner = document.createElement('div');
        spinner.className = 'puzzle-loading-spinner keep-animation';
        const loadingText = document.createElement('div');
        loadingText.textContent = 'Загрузка библиотеки...';
        loadingText.className = 'puzzle-loading-title';
        const loadingSubtext = document.createElement('div');
        loadingSubtext.textContent = 'Синхронизация с базой данных';
        loadingSubtext.className = 'puzzle-loading-subtext';
        loadingContent.appendChild(spinner);
        loadingContent.appendChild(loadingText);
        loadingContent.appendChild(loadingSubtext);
        loadingModal.appendChild(loadingContent);
        document.body.appendChild(loadingModal);

        if (!document.getElementById('puzzle-library-animations')) {
            const style = document.createElement('style');
            style.id = 'puzzle-library-animations';
            style.textContent = `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(30px); opacity: 0; } }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `;
            document.head.appendChild(style);
        }

        const completedPuzzles = await fetchPuzzleCompleted();
        loadingModal.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => loadingModal.remove(), 200);

        const modal = document.createElement('div');
        modal.className = 'puzzle-lib-modal-overlay';
        const modalContent = document.createElement('div');
        modalContent.className = 'puzzle-lib-modal-content';

        const header = document.createElement('div');
        header.className = 'puzzle-lib-header';
        const titleContainer = document.createElement('div');
        titleContainer.className = 'puzzle-lib-title-container';
        const title = document.createElement('h2');
        title.innerHTML = `${icon('trophy', { size: 24 })} Библиотека Пазлов`;
        title.className = 'puzzle-lib-title';
        const countBadge = document.createElement('span');
        countBadge.textContent = completedPuzzles.length;
        countBadge.className = 'puzzle-lib-count-badge';
        titleContainer.appendChild(title);
        titleContainer.appendChild(countBadge);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        closeBtn.className = 'puzzle-lib-close-btn';
        closeBtn.onclick = () => {
            modal.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95)';
            setTimeout(() => {
                modal.remove();
                puzzleGame._libraryOpen = false;
                if (puzzleGame.board) {
                    puzzleGame.board.style.display = 'grid';
                    if (puzzleGame.isPlaying && puzzleGame.board.classList.contains('intro-mode')) {
                        puzzleGame.initPuzzle();
                    }
                }
                if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-stats-modal')) {
                    document.body.classList.remove('modal-open');
                    document.documentElement.classList.remove('modal-open');
                }
            }, 300);
        };
        header.appendChild(titleContainer);
        header.appendChild(closeBtn);

        const listContainer = document.createElement('div');
        
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            listContainer.style.cssText = `display:grid;grid-template-columns:repeat(2,1fr);gap:16px;`;
        } else {
            listContainer.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;`;
        }

        if (completedPuzzles.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'puzzle-lib-empty-container';
            emptyMessage.innerHTML = `<div class="puzzle-lib-empty-icon">${icon('puzzle', { size: 48 })}</div><div class="puzzle-lib-empty-title">Библиотека пуста</div><div class="puzzle-lib-empty-subtitle">Начните собирать пазлы, чтобы они появились здесь!</div>`;
            listContainer.appendChild(emptyMessage);
        } else {
            completedPuzzles.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
            completedPuzzles.forEach((puzzle, index) => {
                const card = document.createElement('div');
                card.className = 'puzzle-lib-card';

                const indexBadge = document.createElement('div');
                indexBadge.textContent = `#${index + 1}`;
                indexBadge.className = 'puzzle-lib-card-badge';

                const thumbContainer = document.createElement('div');
                thumbContainer.className = 'puzzle-lib-thumb-container';
                const thumb = document.createElement('img');
                thumb.className = 'puzzle-lib-thumb';
                thumb.alt = 'Puzzle thumbnail';
                thumb.onerror = () => { if (!thumb.dataset.fallbackApplied && puzzle.imageUrl && thumb.src !== puzzle.imageUrl) { thumb.dataset.fallbackApplied = 'true'; thumb.src = puzzle.imageUrl; } };
                const thumbSrc = PuzzleStorage.getPuzzleImageUrl(puzzle);
                if (thumbSrc) { thumb.src = thumbSrc; }
                else if (puzzle?.post?.id || puzzle?.id) { PuzzleStorage.resolvePuzzleImageUrl(puzzle).then(resolved => { if (resolved) thumb.src = resolved; }).catch(() => {}); }
                thumbContainer.appendChild(thumb);

                card.onclick = () => {
                    modal.style.opacity = '0';
                    modal.style.transition = 'opacity 0.2s ease';
                    setTimeout(() => { modal.style.display = 'none'; PuzzleUI.showPuzzleStats(puzzleGame, puzzle, true); }, 200);
                };

                const info = document.createElement('div');
                info.className = 'puzzle-lib-info';
                const variantCount = document.createElement('div');
                variantCount.className = 'puzzle-lib-variant-count';
                variantCount.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>${puzzle.variants.length} вариант(ов)`;

                const dateAndIdRow = document.createElement('div');
                dateAndIdRow.className = 'puzzle-lib-date-row';

                const lastDate = document.createElement('div');
                lastDate.className = 'puzzle-lib-date';
                lastDate.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${new Date(puzzle.lastUpdated).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                dateAndIdRow.appendChild(lastDate);

                const postIdVal = puzzle.postId || puzzle.id || puzzle.post?.id || '';
                if (postIdVal) {
                    const postIdBadge = document.createElement('div');
                    postIdBadge.title = 'Нажмите, чтобы скопировать ID';
                    postIdBadge.className = 'puzzle-lib-post-badge';
                    postIdBadge.innerHTML = `<span>ID: ${postIdVal}</span>`;
                    postIdBadge.onclick = (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(String(postIdVal)).then(() => {
                            const oldText = postIdBadge.innerHTML;
                            postIdBadge.classList.add('copied');
                            postIdBadge.innerHTML = `<span>Скопировано!</span>`;
                            setTimeout(() => {
                                postIdBadge.classList.remove('copied');
                                postIdBadge.innerHTML = oldText;
                            }, 1500);
                        }).catch(err => {
                            console.error('Failed to copy ID:', err);
                        });
                    };
                    dateAndIdRow.appendChild(postIdBadge);
                }

                const variantsContainer = document.createElement('div');
                variantsContainer.className = 'puzzle-lib-variants-container';
                const getVariantPieces = (v) => v.targetPieces || ((v.cols && v.rows) ? v.cols * v.rows : null) || (v.size ? v.size * v.size : 0);
                puzzle.variants.sort((a, b) => getVariantPieces(a) - getVariantPieces(b)).forEach(variant => {
                    const variantCols = variant.cols || variant.size || 4;
                    const variantRows = variant.rows || variant.size || 4;
                    const variantInfo = document.createElement('div');
                    variantInfo.className = 'puzzle-lib-variant-info';
                    variantInfo.innerHTML = `<span>${variantCols}x${variantRows} (${getVariantPieces(variant)})</span><span>${PuzzleStorage.formatTime(variant.time)} • ${variant.moves} ходов</span>`;
                    variantsContainer.appendChild(variantInfo);
                });

                info.appendChild(variantCount);
                info.appendChild(dateAndIdRow);
                info.appendChild(variantsContainer);
                card.appendChild(indexBadge);
                card.appendChild(thumbContainer);
                card.appendChild(info);
                listContainer.appendChild(card);
            });
        }

        modalContent.appendChild(header);
        modalContent.appendChild(listContainer);
        modal.appendChild(modalContent);
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.opacity = '0';
                modalContent.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    modal.remove();
                    if (puzzleGame.board) { puzzleGame.board.style.display = 'grid'; }
                    if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-stats-modal')) {
                        document.body.classList.remove('modal-open');
                        document.documentElement.classList.remove('modal-open');
                    }
                }, 300);
            }
        };
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.appendChild(modal);
        requestAnimationFrame(() => { modal.style.opacity = '1'; modalContent.style.transform = 'scale(1)'; });
    }

    static async showPuzzleStats(puzzleGame, puzzle, fromLibrary = false) {
        if (puzzleGame.board) { puzzleGame.board.style.display = 'none'; }
        const libraryModal = fromLibrary ? document.querySelector('.puzzle-completed-modal') : null;
        if (libraryModal) { libraryModal.style.display = 'none'; }

        const modal = document.createElement('div');
        modal.className = 'puzzle-stats-modal-overlay';
        const modalContent = document.createElement('div');
        modalContent.className = 'puzzle-stats-modal-content';

        const header = document.createElement('div');
        header.className = 'puzzle-stats-header';
        const titleContainer = document.createElement('div');
        titleContainer.className = 'puzzle-stats-title-container';
        const title = document.createElement('h2');
        title.innerHTML = `${icon('barChart', { size: 24 })} Статистика`;
        title.className = 'puzzle-stats-title';
        titleContainer.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        closeBtn.className = 'puzzle-stats-close-btn';
        closeBtn.onclick = () => {
            modal.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95)';
            setTimeout(() => {
                modal.remove();
                if (libraryModal) { libraryModal.style.display = 'flex'; libraryModal.style.opacity = '0'; libraryModal.style.transition = 'opacity 0.2s ease'; setTimeout(() => { libraryModal.style.opacity = '1'; }, 10); }
                else if (fromLibrary) { PuzzleUI.showCompletedModal(puzzleGame); }
                else { if (puzzleGame.board) { puzzleGame.board.style.display = 'grid'; } }
                if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-completed-modal')) {
                    document.body.classList.remove('modal-open');
                    document.documentElement.classList.remove('modal-open');
                }
            }, 300);
        };
        header.appendChild(titleContainer);
        header.appendChild(closeBtn);

        const imageContainer = document.createElement('div');
        imageContainer.className = 'puzzle-stats-image-container';
        const image = document.createElement('img');
        image.className = 'puzzle-stats-image';
        image.alt = 'Puzzle preview';
        image.onerror = () => { if (!image.dataset.fallbackApplied && puzzle.imageUrl && image.src !== puzzle.imageUrl) { image.dataset.fallbackApplied = 'true'; image.src = puzzle.imageUrl; } };
        const imageSrc = PuzzleStorage.getPuzzleImageUrl(puzzle);
        if (imageSrc) { image.src = imageSrc; }
        else if (puzzle?.post?.id || puzzle?.id) { PuzzleStorage.resolvePuzzleImageUrl(puzzle).then(resolved => { if (resolved) image.src = resolved; }).catch(() => {}); }
        imageContainer.appendChild(image);

        const variantsList = document.createElement('div');
        variantsList.className = 'puzzle-stats-variants';
        const getVariantPieces = (v) => v.targetPieces || ((v.cols && v.rows) ? v.cols * v.rows : null) || (v.size ? v.size * v.size : 0);
        puzzle.variants.sort((a, b) => getVariantPieces(a) - getVariantPieces(b)).forEach(variant => {
            const variantCols = variant.cols || variant.size || 4;
            const variantRows = variant.rows || variant.size || 4;
            const totalPieces = getVariantPieces(variant);
            const playSize = variant.targetPieces || totalPieces;

            const variantCard = document.createElement('div');
            variantCard.className = 'puzzle-stats-variant-card';

            const variantHeader = document.createElement('div');
            variantHeader.className = 'puzzle-stats-variant-header';
            const sizeLabel = document.createElement('div');
            sizeLabel.className = 'puzzle-stats-size-label';
            sizeLabel.textContent = `${variantCols} × ${variantRows}`;
            const piecesCount = document.createElement('div');
            piecesCount.className = 'puzzle-stats-pieces';
            piecesCount.textContent = `${totalPieces} деталей`;
            variantHeader.appendChild(sizeLabel);
            variantHeader.appendChild(piecesCount);

            const statsGrid = document.createElement('div');
            statsGrid.className = 'puzzle-stats-grid';
            const timeStat = document.createElement('div');
            timeStat.className = 'puzzle-stats-box';
            timeStat.innerHTML = `<span style="font-size:0.7rem;color:var(--adaptive-text-main, rgba(255,255,255,0.5));">${icon('clock', { size: 14 })} Время</span><span style="font-size:0.95rem;font-weight:600;color:var(--adaptive-text-main, #3b82f6);">${PuzzleStorage.formatTime(variant.time)}</span>`;
            const movesStat = document.createElement('div');
            movesStat.className = 'puzzle-stats-box';
            movesStat.innerHTML = `<span style="font-size:0.7rem;color:var(--adaptive-text-main, rgba(255,255,255,0.5));">${icon('target', { size: 14 })} Ходов</span><span style="font-size:0.95rem;font-weight:600;color:var(--adaptive-text-main, rgba(255,255,255,0.9));">${variant.moves}</span>`;
            statsGrid.appendChild(timeStat);
            statsGrid.appendChild(movesStat);

            const playBtn = document.createElement('button');
            playBtn.className = 'puzzle-stats-play-btn';
            playBtn.innerHTML = `<span style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Играть снова</span>`;
            playBtn.onclick = () => {
                modal.style.opacity = '0';
                modalContent.style.transform = 'scale(0.95)';
                setTimeout(() => { modal.remove(); puzzleGame.launchLibraryPuzzle(puzzle.post, playSize, puzzle.imageUrl); }, 300);
            };

            variantCard.appendChild(variantHeader);
            variantCard.appendChild(statsGrid);
            variantCard.appendChild(playBtn);
            variantsList.appendChild(variantCard);
        });

        const contentContainer = document.createElement('div');
        contentContainer.className = 'puzzle-stats-content-container';
        contentContainer.appendChild(variantsList);
        contentContainer.appendChild(imageContainer);

        modalContent.appendChild(header);
        modalContent.appendChild(contentContainer);
        modal.appendChild(modalContent);
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.opacity = '0';
                modalContent.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    modal.remove();
                    if (puzzleGame.board) { puzzleGame.board.style.display = 'grid'; }
                    if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-completed-modal')) {
                        document.body.classList.remove('modal-open');
                        document.documentElement.classList.remove('modal-open');
                    }
                }, 300);
            }
        };
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.appendChild(modal);
        requestAnimationFrame(() => { modal.style.opacity = '1'; modalContent.style.transform = 'scale(1)'; });
    }
}
