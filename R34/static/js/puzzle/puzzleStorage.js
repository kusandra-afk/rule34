import { fetchPuzzleCompleted, savePuzzleCompleted, fetchPostById } from '../api.js';

export class PuzzleStorage {
    // Единственная формула «сколько деталей в варианте». Была продублирована в
    // puzzleUI.js (строки 171 и 266) — теперь все считают через неё.
    static getVariantPieces(variant) {
        if (!variant || typeof variant !== 'object') return 0;
        if (variant.targetPieces) return variant.targetPieces;
        if (variant.cols && variant.rows) return variant.cols * variant.rows;
        if (variant.size) return variant.size * variant.size;
        return 0;
    }

    // Сколько деталей у варианта по размеру сетки (для подписи "N×M").
    static getVariantGrid(variant) {
        if (!variant || typeof variant !== 'object') return { cols: 0, rows: 0 };
        const cols = variant.cols || variant.size || 0;
        const rows = variant.rows || variant.size || 0;
        return { cols, rows };
    }

    // Безопасное чтение lastUpdated: битая/пустая дата не должна ронять
    // отрисовку всей библиотеки.
    static getPuzzleDate(puzzle) {
        const raw = puzzle?.lastUpdated;
        if (!raw) return null;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }

    // Удаление пазла: сервер помечает is_deleted=1 (tombstone), физически
    // запись стирается только через PUZZLES_PURGE_DAYS. UI просто убирает
    // карточку из активного списка. Возвращает новый активный список.
    static async deletePuzzle(puzzle, completedPuzzles) {
        const pid = String(puzzle?.postId || puzzle?.id || puzzle?.post?.id || '');
        if (!pid) {
            console.warn('[Puzzle Library] deletePuzzle: no post id');
            return completedPuzzles;
        }
        const next = (completedPuzzles || []).filter(p =>
            String(p.postId || p.id || p.post?.id) !== pid
        );
        await PuzzleStorage._postAction('delete', pid);
        return next;
    }

    // Восстановление из «корзины»: снимает is_deleted. Возвращает свежий список
    // активных пазлов, перечитанный с сервера.
    static async restorePuzzle(puzzle) {
        const pid = String(puzzle?.postId || puzzle?.id || puzzle?.post?.id || '');
        if (!pid) return null;
        await PuzzleStorage._postAction('restore', pid);
        return PuzzleStorage.fetchActive();
    }

    // Общий POST-хелпер для delete/restore.
    static async _postAction(action, postId) {
        try {
            await fetch('/api/puzzle-completed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, postId })
            });
        } catch (e) {
            console.error(`[Puzzle Library] failed to ${action} on server:`, e);
        }
    }

    // Перечитывает активные пазлы с сервера (после restore/clear).
    static async fetchActive() {
        try {
            const data = await fetchPuzzleCompleted();
            return Array.isArray(data) ? data.filter(p => !p.is_deleted) : [];
        } catch (e) {
            console.error('[Puzzle Library] fetchActive failed:', e);
            return [];
        }
    }

    // Достаёт «корзину»: удалённые, но ещё не вычищенные пазлы.
    static async fetchTrash() {
        try {
            const resp = await fetch('/api/puzzle-completed?includeDeleted=1');
            if (!resp.ok) return [];
            const data = await resp.json();
            const list = Array.isArray(data.puzzles) ? data.puzzles : [];
            return list.filter(p => p.is_deleted);
        } catch (e) {
            console.error('[Puzzle Library] fetchTrash failed:', e);
            return [];
        }
    }

    // Сводная статистика библиотеки: суммы по всем вариантам всех пазлов.
    static summarize(puzzles) {
        const list = Array.isArray(puzzles) ? puzzles : [];
        let totalTime = 0;
        let totalMoves = 0;
        let totalVariants = 0;
        let bestTime = Infinity;
        let bestTimeMoves = 0;

        for (const p of list) {
            const variants = Array.isArray(p.variants) ? p.variants : [];
            totalVariants += variants.length;
            for (const v of variants) {
                const t = Number(v.time);
                const m = Number(v.moves);
                if (isFinite(t) && t >= 0) {
                    totalTime += t;
                    if (t < bestTime) {
                        bestTime = t;
                        bestTimeMoves = isFinite(m) ? m : 0;
                    }
                }
                if (isFinite(m) && m >= 0) totalMoves += m;
            }
        }

        return {
            total: list.length,
            totalVariants,
            totalTime,
            totalMoves,
            bestTime: isFinite(bestTime) ? bestTime : null,
            bestTimeMoves
        };
    }

    static getStableImageUrl(puzzleGame) {
        const post = puzzleGame.post;
        if (!post) return puzzleGame.imgUrl || puzzleGame.displayUrl || '';

        // Для GIF-файлов используем file_url (оригинал с анимацией), для остальных - sample_url
        const isGif = (post.file_url || '').toLowerCase().endsWith('.gif');
        if (isGif) {
            return post.file_url || post.sample_url || post.preview_url || puzzleGame.imgUrl || puzzleGame.displayUrl || '';
        }

        return post.sample_url || post.file_url || post.preview_url || puzzleGame.imgUrl || puzzleGame.displayUrl || '';
    }

    static getPuzzleImageUrl(puzzle) {
        const post = puzzle?.post;
        if (!post) return puzzle?.imageUrl || puzzle?.thumbnail || '';

        // Для GIF-файлов используем file_url (оригинал с анимацией), для остальных - sample_url
        const isGif = (post.file_url || '').toLowerCase().endsWith('.gif');
        if (isGif) {
            return puzzle?.imageUrl || puzzle?.thumbnail || post.file_url || post.sample_url || post.preview_url || '';
        }

        return puzzle?.imageUrl || puzzle?.thumbnail || post.sample_url || post.file_url || post.preview_url || '';
    }

    static async resolvePuzzleImageUrl(puzzle) {
        const existing = PuzzleStorage.getPuzzleImageUrl(puzzle);
        if (existing) return existing;
        const postId = puzzle?.post?.id ?? puzzle?.id;
        if (!postId) return '';
        try {
            const post = await fetchPostById(String(postId));
            if (!post) return '';

            // Для GIF-файлов используем file_url (оригинал с анимацией), для остальных - sample_url
            const isGif = (post.file_url || '').toLowerCase().endsWith('.gif');
            const resolved = isGif ? (post.file_url || post.sample_url || post.preview_url || '') : (post.sample_url || post.file_url || post.preview_url || '');

            if (resolved) {
                puzzle.imageUrl = resolved;
                puzzle.thumbnail = resolved;
                if (puzzle.post && typeof puzzle.post === 'object') {
                    if (!puzzle.post.sample_url && post.sample_url) puzzle.post.sample_url = post.sample_url;
                    if (!puzzle.post.file_url && post.file_url) puzzle.post.file_url = post.file_url;
                    if (!puzzle.post.preview_url && post.preview_url) puzzle.post.preview_url = post.preview_url;
                }
                return resolved;
            }
        } catch (e) {
            console.warn('[Puzzle Library] Failed to resolve image for puzzle:', e);
        }
        return '';
    }

    static async saveCompletedPuzzle(puzzleGame) {
        if (puzzleGame.isSolving) return;

        // Save locally to solved list
        if (puzzleGame.post && puzzleGame.post.id) {
            try {
                let solved = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]');
                if (!solved.includes(puzzleGame.post.id)) {
                    solved.push(puzzleGame.post.id);
                    localStorage.setItem('r34_solved_puzzles', JSON.stringify(solved));
                }
            } catch (e) { console.error('Error saving solved puzzle ID:', e); }
        }

        // Save locally to best records
        if (!puzzleGame.wasAutoSolved) {
            const postId = (puzzleGame.post && puzzleGame.post.id) ? `_post_${puzzleGame.post.id}` : '';
            const key = `r34_puzzle_best${postId}_${puzzleGame.cols}x${puzzleGame.rows}`;
            let isNewLocalRecord = false;
            try {
                const existing = localStorage.getItem(key);
                if (!existing) isNewLocalRecord = true;
                else {
                    const data = JSON.parse(existing);
                    if (!data || puzzleGame.seconds < data.seconds || (puzzleGame.seconds === data.seconds && puzzleGame.moves < data.moves)) isNewLocalRecord = true;
                }
            } catch (e) { isNewLocalRecord = true; }
            if (isNewLocalRecord) {
                try {
                    localStorage.setItem(key, JSON.stringify({ seconds: puzzleGame.seconds, moves: puzzleGame.moves }));
                    if (typeof puzzleGame.loadRecord === 'function') puzzleGame.loadRecord();
                } catch (e) { console.error('Error saving record to localStorage:', e); }
            }
        }

        // Sync with server/sync storage
        const completedPuzzles = await fetchPuzzleCompleted();
        const puzzleRecord = { cols: puzzleGame.cols, rows: puzzleGame.rows, targetPieces: puzzleGame.targetPieces, time: puzzleGame.seconds, moves: puzzleGame.moves, date: new Date().toISOString() };
        const currentPostId = puzzleGame.post?.id || null;
        let puzzleEntry = completedPuzzles.find(p => p.imageUrl === puzzleGame.imgUrl || (currentPostId && (p.postId === currentPostId || p.id === currentPostId)));
        if (!puzzleEntry) {
            const stableImageUrl = PuzzleStorage.getStableImageUrl(puzzleGame);
            puzzleEntry = { 
                id: currentPostId,
                postId: currentPostId,
                imageUrl: stableImageUrl, 
                thumbnail: stableImageUrl, 
                post: puzzleGame.post, 
                variants: [], 
                lastUpdated: new Date().toISOString() 
            };
            completedPuzzles.push(puzzleEntry);
        } else {
            if (currentPostId && !puzzleEntry.postId) {
                puzzleEntry.postId = currentPostId;
                puzzleEntry.id = currentPostId;
            }
            if (puzzleGame.post && !puzzleEntry.post) {
                puzzleEntry.post = puzzleGame.post;
            }
        }
        let variant = puzzleEntry.variants.find(v => (v.cols === puzzleGame.cols && v.rows === puzzleGame.rows) || v.targetPieces === puzzleGame.targetPieces || v.size === puzzleGame.targetPieces || v.size === puzzleGame.cols);
        if (variant) {
            if (puzzleRecord.time < variant.time || (puzzleRecord.time === variant.time && puzzleRecord.moves < variant.moves)) {
                variant.time = puzzleRecord.time;
                variant.moves = puzzleRecord.moves;
                variant.date = puzzleRecord.date;
            }
        } else {
            puzzleEntry.variants.push(puzzleRecord);
        }
        puzzleEntry.lastUpdated = new Date().toISOString();
        await savePuzzleCompleted(completedPuzzles);
    }

    static loadRecord(puzzleGame) {
        const postId = (puzzleGame.post && puzzleGame.post.id) ? `_post_${puzzleGame.post.id}` : '';
        const key = `r34_puzzle_best${postId}_${puzzleGame.cols}x${puzzleGame.rows}`;
        try {
            const best = localStorage.getItem(key);
            if (best) {
                const data = JSON.parse(best);
                if (data && typeof data.seconds === 'number' && typeof data.moves === 'number') {
                    const m = Math.floor(data.seconds / 60).toString().padStart(2, '0');
                    const s = (data.seconds % 60).toString().padStart(2, '0');
                    if (puzzleGame.recordLabel) puzzleGame.recordLabel.textContent = `${m}:${s} (${data.moves}х)`;
                    return;
                }
            }
        } catch (e) { console.error('Error loading puzzle record:', e); }
        if (puzzleGame.recordLabel) puzzleGame.recordLabel.textContent = '--';
    }

    static formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}
