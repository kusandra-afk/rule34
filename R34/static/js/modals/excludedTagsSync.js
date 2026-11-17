/**
 * Excluded Tags sync.
 *
 * Excluded tags are managed inline via the tag chips above the search bar; the
 * old settings popup (#tag-modal) is gone. This module only keeps the saved
 * excluded-tags list in sync with tagSearch's active tags.
 */

export class ExcludedTagsSync {
    constructor(options = {}) {
        this.getSavedExcludedTags = options.getSavedExcludedTags || (() => []);
        this.saveSavedExcludedTags = options.saveSavedExcludedTags || (async () => {});
        this.getTagSearch = options.getTagSearch || (() => window.tagSearch);
        this.onReloadSearch = options.onReloadSearch || (() => {});

        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.syncInitialTagsToSearch();
    }

    syncInitialTagsToSearch() {
        const tagSearch = this.getTagSearch();
        if (!tagSearch || !tagSearch.activeTags) return;

        const initialExcluded = this.getSavedExcludedTags();

        // Remove inactive tags that are NOT in the server excluded list (cleanup stale tags)
        tagSearch.activeTags = tagSearch.activeTags.filter(t => {
            if (t.active) return true;
            return initialExcluded.includes(t.value);
        });

        // Add any missing excluded tags
        initialExcluded.forEach(tag => {
            if (!tagSearch.activeTags.some(t => t.value === tag)) {
                tagSearch.activeTags.push({ value: tag, active: false });
            }
        });
        tagSearch.updateActiveTagsDisplay();
    }
}
