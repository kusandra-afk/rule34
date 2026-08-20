import { fetchPuzzleCompleted, savePuzzleCompleted, fetchPostById } from '../api.js';

export class PuzzleStorage {
    static getStableImageUrl(puzzleGame) {
        return puzzleGame.post?.sample_url || puzzleGame.post?.file_url || puzzleGame.post?.preview_url || puzzleGame.imgUrl || puzzleGame.displayUrl || '';
    }

    static getPuzzleImageUrl(puzzle) {
        return puzzle?.imageUrl || puzzle?.thumbnail || puzzle?.post?.sample_url || puzzle?.post?.file_url || puzzle?.post?.preview_url || '';
    }

    static async resolvePuzzleImageUrl(puzzle) {
        const existing = PuzzleStorage.getPuzzleImageUrl(puzzle);
        if (existing) return existing;
        const postId = puzzle?.post?.id ?? puzzle?.id;
        if (!postId) return '';
        try {
            const post = await fetchPostById(String(postId));
            if (!post) return '';
            const resolved = post.sample_url || post.file_url || post.preview_url || '';
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
        if (completedPuzzles.length > 100) {
            completedPuzzles.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
            completedPuzzles.splice(100);
        }
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
