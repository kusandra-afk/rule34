/**
 * "Больше / Меньше" — угадай, у какого персонажа больше постов на Rule34.
 * Счёт строится на реальных данных (tag_info.count из уже загруженных постов),
 * классификация франшизы (аниме/игра/манга) — асинхронное украшение поверх,
 * никогда не блокирует саму механику игры.
 */
import { fetchPosts } from '../api.js';

const BEST_SCORE_KEY = 'r34_guess_best_score';

export function prettifyTag(tag) {
    return (tag || '')
        .replace(/_/g, ' ')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());
}

export class GuessGame {
    constructor() {
        this.pool = [];
        this.seenTags = new Set();
        this.current = null;
        this.hidden = null;
        this.score = 0;
        this.best = parseInt(localStorage.getItem(BEST_SCORE_KEY) || '0', 10) || 0;
        this.active = false;
    }

    _collectFromPosts(posts) {
        for (const post of (posts || [])) {
            const tagInfo = post && post.tag_info;
            if (!Array.isArray(tagInfo)) continue;
            const copyrightTags = tagInfo.filter(x => x.type === 'copyright' && x.tag).map(x => x.tag);
            for (const t of tagInfo) {
                if (t.type !== 'character' || !t.tag || !t.count || t.count < 2) continue;
                if (this.seenTags.has(t.tag)) continue;
                this.seenTags.add(t.tag);
                this.pool.push({ tag: t.tag, count: t.count, copyrightTags, post });
            }
        }
    }

    async ensurePool(minSize = 6) {
        const isFavActive = window.gallery && window.gallery.isFavoritesActive;
        const posts = (window.gallery && Array.isArray(isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts))
            ? (isFavActive ? window.gallery.favoritesPosts : window.gallery.currentPosts)
            : [];
        this._collectFromPosts(posts);

        let attempts = 0;
        while (this.pool.length < minSize && attempts < 6) {
            attempts++;
            try {
                const data = await fetchPosts('sort:random', false, 0);
                const fresh = Array.isArray(data) ? data
                    : Array.isArray(data && data.post) ? data.post
                    : (data && data.post) ? [data.post] : [];
                this._collectFromPosts(fresh);
            } catch (e) {
                console.error('[GuessGame] Failed to fetch fallback posts:', e);
                break;
            }
        }
        return this.pool.length >= 2;
    }

    _pickRandom(exclude) {
        const candidates = exclude ? this.pool.filter(c => c.tag !== exclude.tag) : this.pool;
        if (!candidates.length) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    async startRound() {
        const ok = await this.ensurePool(6);
        this.score = 0;
        this.active = ok;
        if (!ok) return false;
        this.current = this._pickRandom(null);
        this.hidden = this._pickRandom(this.current);
        if (!this.hidden) {
            await this.ensurePool(this.pool.length + 4);
            this.hidden = this._pickRandom(this.current);
        }
        this.active = !!(this.current && this.hidden);
        return this.active;
    }

    async guess(direction) {
        if (!this.active || !this.current || !this.hidden) return null;
        const correct = direction === 'more'
            ? this.hidden.count >= this.current.count
            : this.hidden.count <= this.current.count;

        const revealed = this.hidden;

        if (correct) {
            this.score++;
            if (this.score > this.best) {
                this.best = this.score;
                localStorage.setItem(BEST_SCORE_KEY, String(this.best));
            }
            this.current = this.hidden;
            this.hidden = this._pickRandom(this.current);
            if (!this.hidden) {
                await this.ensurePool(this.pool.length + 4);
                this.hidden = this._pickRandom(this.current);
                if (!this.hidden) {
                    this.active = false;
                    return { correct: true, revealed, gameOver: true, poolExhausted: true, score: this.score, best: this.best };
                }
            }
        } else {
            this.active = false;
        }

        return { correct, revealed, gameOver: !correct, score: this.score, best: this.best };
    }

    async classify(entry) {
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
            console.warn('[GuessGame] classify failed:', e);
            return null;
        }
    }
}
