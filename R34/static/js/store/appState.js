/**
 * Central Application State Manager (Store)
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../config/constants.js';
import { StorageManager } from '../storage.js';

class AppState {
    constructor() {
        this.listeners = new Map();
        
        // Initial state loaded from storage or defaults
        this.state = {
            activeTags: [],
            excludedTags: [],
            currentSort: localStorage.getItem(STORAGE_KEYS.CURRENT_SORT) || DEFAULT_SETTINGS.sort,
            currentPage: 0,
            isLoading: false,
            isCountExpanded: false,
            gridColumns: parseInt(localStorage.getItem(STORAGE_KEYS.GRID_COLUMNS), 10) || 4,
            performanceMode: localStorage.getItem(STORAGE_KEYS.PERFORMANCE_MODE) === 'true',
            reducedMotion: localStorage.getItem(STORAGE_KEYS.REDUCED_MOTION) === 'true',
            activeModal: null,
            puzzleActive: false
        };
    }

    /**
     * Get specific key or entire state snapshot
     */
    get(key) {
        if (key) {
            return this.state[key];
        }
        return { ...this.state };
    }

    /**
     * Update state and notify subscribers
     */
    set(keyOrObj, value) {
        const changes = {};

        if (typeof keyOrObj === 'string') {
            changes[keyOrObj] = value;
        } else if (typeof keyOrObj === 'object' && keyOrObj !== null) {
            Object.assign(changes, keyOrObj);
        }

        let hasChanged = false;
        for (const [k, v] of Object.entries(changes)) {
            if (this.state[k] !== v) {
                this.state[k] = v;
                hasChanged = true;
                this.notify(k, v);
            }
        }

        if (hasChanged) {
            this.notify('*', this.state);
        }
    }

    /**
     * Subscribe to a state key change, or '*' for any change
     */
    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);

        // Return unsubscribe function
        return () => {
            const set = this.listeners.get(key);
            if (set) {
                set.delete(callback);
            }
        };
    }

    /**
     * Notify listeners of a change
     */
    notify(key, value) {
        const keyListeners = this.listeners.get(key);
        if (keyListeners) {
            keyListeners.forEach(cb => {
                try {
                    cb(value);
                } catch (err) {
                    console.error(`[AppState] Error in listener for "${key}":`, err);
                }
            });
        }
    }
}

export const appState = new AppState();
