/**
 * API service for communication with the local backend server
 */

import { API_ENDPOINTS } from '../config/constants.js';

export const ServerApi = {
    /**
     * Fetch list of excluded tags from backend
     */
    async getExcludedTags() {
        try {
            const resp = await fetch(API_ENDPOINTS.EXCLUDED_TAGS);
            if (resp.ok) {
                const data = await resp.json();
                if (data.ok && Array.isArray(data.tags)) {
                    return data.tags;
                }
            }
        } catch (e) {
            console.error('[ServerApi] Failed to load excluded tags:', e);
        }
        return [];
    },

    /**
     * Save list of excluded tags to backend
     */
    async saveExcludedTags(tagsList) {
        try {
            const resp = await fetch(API_ENDPOINTS.EXCLUDED_TAGS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: tagsList })
            });
            if (resp.ok) {
                const data = await resp.json();
                return data.ok === true;
            }
        } catch (e) {
            console.error('[ServerApi] Failed to save excluded tags:', e);
        }
        return false;
    }
};
