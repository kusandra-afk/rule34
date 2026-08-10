// Turso Sync Module - Optional cloud sync for favorites and puzzles
// Uses Turso (SQLite in cloud) for cross-device synchronization

class TursoSync {
    constructor() {
        this.enabled = false;
        this.url = '';
        this.token = '';
        this.initialized = false;
    }

    init() {
        const enabled = localStorage.getItem('r34_turso_sync_enabled') === 'true';
        const url = localStorage.getItem('r34_turso_url') || '';
        const token = localStorage.getItem('r34_turso_token') || '';

        this.enabled = enabled && url && token;
        this.url = url;
        this.token = token;
        this.initialized = true;

        if (this.enabled) {
            console.log('[Turso Sync] Initialized with URL:', url);
        } else {
            console.log('[Turso Sync] Disabled or not configured');
        }
    }

    updateSettings(enabled, url, token) {
        this.enabled = enabled && url && token;
        this.url = url;
        this.token = token;

        localStorage.setItem('r34_turso_sync_enabled', enabled ? 'true' : 'false');
        localStorage.setItem('r34_turso_url', url);
        localStorage.setItem('r34_turso_token', token);

        if (this.enabled) {
            console.log('[Turso Sync] Settings updated, enabled');
        } else {
            console.log('[Turso Sync] Settings updated, disabled');
        }
    }

    async testConnection(url, token) {
        url = (url || this.url || '').trim();
        token = (token || this.token || '').trim();
        if (!url || !token) {
            return { ok: false, error: 'Укажите URL и Token' };
        }
        let apiUrl = url;
        if (apiUrl.startsWith('libsql://')) {
            apiUrl = apiUrl.replace('libsql://', 'https://');
        }
        if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
            apiUrl = 'https://' + apiUrl;
        }

        try {
            const response = await fetch(`${apiUrl}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    statements: [{ q: 'SELECT 1;', params: [] }]
                })
            });

            if (response.ok) {
                return { ok: true, message: 'Успешный ответ от Turso!' };
            } else if (response.status === 401 || response.status === 403) {
                return { ok: false, error: 'Ошибка авторизации (401/403): Неверный токен' };
            } else {
                return { ok: false, error: `Код ответа ${response.status} ${response.statusText}` };
            }
        } catch (error) {
            return { ok: false, error: 'Сеть: ' + error.message };
        }
    }

    async executeQuery(sql, params = []) {
        if (!this.enabled || !this.url || !this.token) {
            console.warn('[Turso Sync] Not enabled or configured');
            return null;
        }

        try {
            // Convert libsql:// URL to https:// for HTTP API
            let apiUrl = this.url;
            if (apiUrl.startsWith('libsql://')) {
                apiUrl = apiUrl.replace('libsql://', 'https://');
            }

            const response = await fetch(`${apiUrl}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    statements: [{
                        q: sql,
                        params: params
                    }]
                })
            });

            if (!response.ok) {
                console.error('[Turso Sync] Query failed:', response.status, response.statusText);
                return null;
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[Turso Sync] Query error:', error);
            return null;
        }
    }

    async executeBatch(statements) {
        if (!this.enabled || !this.url || !this.token) {
            console.warn('[Turso Sync] Not enabled or configured');
            return null;
        }
        if (!statements || statements.length === 0) return null;

        try {
            let apiUrl = this.url;
            if (apiUrl.startsWith('libsql://')) {
                apiUrl = apiUrl.replace('libsql://', 'https://');
            }

            const response = await fetch(`${apiUrl}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    statements: statements
                })
            });

            if (!response.ok) {
                console.error('[Turso Sync] Batch failed:', response.status, response.statusText);
                return null;
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[Turso Sync] Batch error:', error);
            return null;
        }
    }

    async initializeTables() {
        if (!this.enabled) return false;

        await this.executeBatch([
            {
                q: `CREATE TABLE IF NOT EXISTS favorites (
                    id TEXT PRIMARY KEY,
                    change INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL
                )`,
                params: []
            },
            {
                q: `CREATE TABLE IF NOT EXISTS puzzles (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )`,
                params: []
            }
        ]);

        console.log('[Turso Sync] Tables initialized');
        return true;
    }

    async getFavorites() {
        if (!this.enabled) return null;

        const result = await this.executeQuery('SELECT id, change FROM favorites ORDER BY updated_at DESC');
        
        if (result && result.results && result.results[0] && result.results[0].rows) {
            const favorites = result.results[0].rows.map(row => {
                try {
                    // Row format: [id, change]
                    return {
                        id: row[0],
                        change: row[1] || 0
                    };
                } catch (e) {
                    console.error('[Turso Sync] Failed to parse favorite data:', e);
                    return null;
                }
            }).filter(Boolean);
            
            console.log('[Turso Sync] Loaded favorites from cloud (optimized format):', favorites.length);
            return favorites;
        }

        return null;
    }

    async saveFavorites(favorites) {
        if (!this.enabled) return false;

        try {
            const now = Date.now();
            const statements = [
                { q: 'DELETE FROM favorites', params: [] }
            ];

            for (const fav of favorites) {
                const favId = String(fav.id || fav);
                const change = fav.change || 0;
                statements.push({
                    q: 'INSERT INTO favorites (id, change, updated_at) VALUES (?, ?, ?)',
                    params: [favId, change, now]
                });
            }

            await this.executeBatch(statements);
            console.log('[Turso Sync] Saved favorites to cloud (optimized format):', favorites.length);
            return true;
        } catch (error) {
            console.error('[Turso Sync] Failed to save favorites:', error);
            return false;
        }
    }

    async getPuzzles() {
        if (!this.enabled) return null;

        const result = await this.executeQuery('SELECT data FROM puzzles ORDER BY updated_at DESC');
        
        if (result && result.results && result.results[0] && result.results[0].rows) {
            const puzzles = result.results[0].rows.map(row => {
                try {
                    return JSON.parse(row[0]);
                } catch (e) {
                    console.error('[Turso Sync] Failed to parse puzzle data:', e);
                    return null;
                }
            }).filter(Boolean);
            
            console.log('[Turso Sync] Loaded puzzles from cloud:', puzzles.length);
            return puzzles;
        }

        return null;
    }

    async savePuzzles(puzzles) {
        if (!this.enabled) return false;

        try {
            const now = Date.now();
            const statements = [
                { q: 'DELETE FROM puzzles', params: [] }
            ];

            for (const puzzle of puzzles) {
                const data = JSON.stringify(puzzle);
                statements.push({
                    q: 'INSERT INTO puzzles (id, data, updated_at) VALUES (?, ?, ?)',
                    params: [String(puzzle.id || puzzle.postId), data, now]
                });
            }

            await this.executeBatch(statements);
            console.log('[Turso Sync] Saved puzzles to cloud (batched):', puzzles.length);
            return true;
        } catch (error) {
            console.error('[Turso Sync] Failed to save puzzles:', error);
            return false;
        }
    }

    async syncFavorites(localFavorites) {
        if (!this.enabled) return localFavorites;

        try {
            const cloudFavorites = await this.getFavorites();
            
            if (cloudFavorites) {
                // Merge local and cloud favorites
                const merged = new Map();
                
                // Add cloud favorites
                cloudFavorites.forEach(fav => {
                    merged.set(String(fav.id), fav);
                });
                
                // Override with local favorites (local takes precedence)
                localFavorites.forEach(fav => {
                    merged.set(String(fav.id), fav);
                });
                
                const result = Array.from(merged.values());
                
                // Save merged back to cloud
                await this.saveFavorites(result);
                
                console.log('[Turso Sync] Favorites synced, total:', result.length);
                return result;
            } else {
                // No cloud data, save local to cloud
                await this.saveFavorites(localFavorites);
                return localFavorites;
            }
        } catch (error) {
            console.error('[Turso Sync] Failed to sync favorites:', error);
            return localFavorites;
        }
    }

    async syncPuzzles(localPuzzles) {
        if (!this.enabled) return localPuzzles;

        try {
            const cloudPuzzles = await this.getPuzzles();
            
            if (cloudPuzzles) {
                // Merge local and cloud puzzles
                const merged = new Map();
                
                // Add cloud puzzles
                cloudPuzzles.forEach(puzzle => {
                    const key = String(puzzle.id || puzzle.postId);
                    merged.set(key, puzzle);
                });
                
                // Override with local puzzles (local takes precedence)
                localPuzzles.forEach(puzzle => {
                    const key = String(puzzle.id || puzzle.postId);
                    merged.set(key, puzzle);
                });
                
                const result = Array.from(merged.values());
                
                // Save merged back to cloud
                await this.savePuzzles(result);
                
                console.log('[Turso Sync] Puzzles synced, total:', result.length);
                return result;
            } else {
                // No cloud data, save local to cloud
                await this.savePuzzles(localPuzzles);
                return localPuzzles;
            }
        } catch (error) {
            console.error('[Turso Sync] Failed to sync puzzles:', error);
            return localPuzzles;
        }
    }
}

// Export singleton instance
export const tursoSync = new TursoSync();
