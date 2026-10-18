/**
 * Excluded Tags sync helper.
 *
 * This used to also drive a standalone "Хотите ли убрать эти тэги?" popup
 * (#tag-modal in index.html), opened from a "Сбросить скрытые теги" button in
 * settings. That button was removed from the UI (excluded tags are now
 * managed inline via the tag chips above the search bar), which left the
 * popup markup and all of its modal-only code unreachable — so it's been
 * removed here too. What's left is the part that actually still matters:
 * keeping the saved excluded-tags list in sync with tagSearch's active tags.
 */

export class ExcludedTagsModal {
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
