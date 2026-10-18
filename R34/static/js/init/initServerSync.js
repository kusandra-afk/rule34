/**
 * Server Settings & Excluded Tags Synchronization Module
 */

import { StorageManager } from '../storage.js';
import { API_ENDPOINTS } from '../config/constants.js';

let serverExcludedTags = [];
let serverSettings = null;
let serverTursoConfig = null;
let settingsSaveTimeout = null;

const SETTINGS_SYNC_EXCLUDE_PREFIXES = [
    'r34_duration_',
    'r34_video_position_',
    'liked_',
    'r34_tagtype_',
    'r34_puzzle_',
    'r34_solved_',
    'r34_tagcnt_'
];

const SETTINGS_SYNC_EXCLUDE_KEYS = new Set([
    'r34_active_tags',
    'r34_turso_url',
    'r34_turso_token'
]);

export const getSavedExcludedTags = () => {
    return Array.isArray(serverExcludedTags) ? serverExcludedTags : [];
};

export const saveSavedExcludedTags = async (tagsList) => {
    const normalizedTags = (Array.isArray(tagsList) ? tagsList : [])
        .map(tag => String(tag || '').trim())
        .filter(Boolean);
    await saveExcludedTagsToServer(normalizedTags);
};

export function isSettingsSyncKey(key) {
    return key && key.startsWith('r34_') && !SETTINGS_SYNC_EXCLUDE_KEYS.has(key) && !SETTINGS_SYNC_EXCLUDE_PREFIXES.some(prefix => key.startsWith(prefix));
}

export async function loadExcludedTagsFromServer(onLoaded) {
    try {
        const response = await fetch(API_ENDPOINTS.EXCLUDED_TAGS);
        if (response.ok) {
            const data = await response.json();
            if (data.ok && Array.isArray(data.tags)) {
                serverExcludedTags = data.tags;
                // Also sync to localStorage for GalleryController client-side filtering
                localStorage.setItem('r34_excluded_tags', JSON.stringify(data.tags));
                
                if (typeof onLoaded === 'function') {
                    onLoaded(data.tags);
                }
                return data.tags;
            }
        }
    } catch (e) {
        console.error('[ServerSync] Error loading excluded tags from server:', e);
    }
    return [];
}

export async function saveExcludedTagsToServer(tagsList, onSaved) {
    console.log('[ServerSync] Saving excluded tags to server:', tagsList);
    // Also sync to localStorage for GalleryController client-side filtering
    localStorage.setItem('r34_excluded_tags', JSON.stringify(tagsList));
    
    try {
        const response = await fetch(API_ENDPOINTS.EXCLUDED_TAGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: tagsList })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.ok) {
                console.log('[ServerSync] Excluded tags saved successfully:', data.tags);
                serverExcludedTags = Array.isArray(data.tags) ? data.tags : tagsList;
                if (typeof onSaved === 'function') {
                    onSaved(serverExcludedTags);
                }
                return true;
            }
        }
        console.error('[ServerSync] Error response while saving excluded tags:', response.status);
    } catch (e) {
        console.error('[ServerSync] Error saving excluded tags to server:', e);
    }
    return false;
}

export async function loadSettingsFromServer() {
    try {
        const response = await fetch(API_ENDPOINTS.SETTINGS);
        if (response.ok) {
            const data = await response.json();
            if (data.ok && typeof data.settings === 'object') {
                serverSettings = data.settings;
                Object.keys(data.settings).forEach(key => {
                    if (isSettingsSyncKey(key)) {
                        try {
                            localStorage.setItem(key, data.settings[key]);
                        } catch (e) {
                            console.error('[ServerSync] Error restoring setting to localStorage:', key, e);
                        }
                    }
                });
                return data.settings;
            }
        }
    } catch (e) {
        console.error('[ServerSync] Error loading settings from server:', e);
    }
    return {};
}

export async function saveSettingsToServer() {
    const allSettings = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (isSettingsSyncKey(key)) {
            allSettings[key] = localStorage.getItem(key);
        }
    }

    try {
        const response = await fetch(API_ENDPOINTS.SETTINGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: allSettings })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.ok) {
                serverSettings = data.settings;
                return true;
            }
        }
    } catch (e) {
        console.error('[ServerSync] Error saving settings to server:', e);
    }
    return false;
}

export async function loadTursoConfigFromServer() {
    try {
        const response = await fetch('/api/turso-config');
        if (response.ok) {
            const data = await response.json();
            if (data.ok && typeof data.config === 'object') {
                serverTursoConfig = data.config;
                if (data.config.turso_url !== undefined) {
                    localStorage.setItem('r34_turso_url', data.config.turso_url);
                }
                if (data.config.turso_token !== undefined) {
                    localStorage.setItem('r34_turso_token', data.config.turso_token);
                }
                return data.config;
            }
        }
    } catch (e) {
        console.error('[ServerSync] Error loading turso config from server:', e);
    }
    return { turso_url: '', turso_token: '' };
}

export async function saveTursoConfigToServer(url, token) {
    try {
        const response = await fetch('/api/turso-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ turso_url: url, turso_token: token })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.ok) {
                serverTursoConfig = data.config;
                return true;
            }
        }
    } catch (e) {
        console.error('[ServerSync] Error saving turso config to server:', e);
    }
    return false;
}

/**
 * Initializes automatic server synchronization hooks for localStorage
 */
export function initServerSync() {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        try {
            originalSetItem.call(this, key, value);
        } catch (e) {
            if (StorageManager.isQuotaExceeded(e)) {
                console.warn('[ServerSync] LocalStorage quota exceeded. Cleaning up...', key);
                StorageManager.cleanup();
                try {
                    originalSetItem.call(this, key, value);
                } catch (retryError) {
                    console.error('[ServerSync] LocalStorage still full after cleanup.', retryError);
                }
            } else {
                console.error('[ServerSync] LocalStorage setItem error:', e);
            }
        }

        if (isSettingsSyncKey(key)) {
            if (settingsSaveTimeout) clearTimeout(settingsSaveTimeout);
            settingsSaveTimeout = setTimeout(() => {
                saveSettingsToServer();
            }, 1000);
        }
    };

    const originalRemoveItem = localStorage.removeItem;
    localStorage.removeItem = function(key) {
        const existed = this.getItem(key);
        originalRemoveItem.call(this, key);
        if (isSettingsSyncKey(key) && existed !== null) {
            if (settingsSaveTimeout) clearTimeout(settingsSaveTimeout);
            settingsSaveTimeout = setTimeout(() => {
                saveSettingsToServer();
            }, 1000);
        }
    };
}
