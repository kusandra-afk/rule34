/**
 * Gallery / Profile (Favorites) Mode Controller
 */

export class ModeController {
    constructor(options = {}) {
        this.gallery = options.gallery;
        this.tagSearch = options.tagSearch;
        this.onModeChange = options.onModeChange || (() => {});
        this.loadGalleryPosts = options.loadGalleryPosts || (() => {});

        this.modeGalleryBtn = document.getElementById('modeGalleryBtn');
        this.modeProfileBtn = document.getElementById('modeProfileBtn');
        this.searchContainer = document.querySelector('.search-container');
    }

    init() {
        if (!this.modeGalleryBtn || !this.modeProfileBtn) return;

        this.modeGalleryBtn.addEventListener('click', () => {
            this.setGalleryMode();
        });

        this.modeProfileBtn.addEventListener('click', () => {
            this.setProfileMode();
        });
    }

    setGalleryMode() {
        if (!this.modeGalleryBtn || !this.modeProfileBtn) return;

        this.modeGalleryBtn.classList.add('active');
        this.modeGalleryBtn.style.background = 'var(--accent)';
        this.modeGalleryBtn.style.color = '#fff';
        this.modeGalleryBtn.style.boxShadow = '0 4px 16px var(--accent-glow)';

        this.modeProfileBtn.classList.remove('active');
        this.modeProfileBtn.style.background = 'transparent';
        this.modeProfileBtn.style.color = 'rgba(255,255,255,0.7)';
        this.modeProfileBtn.style.boxShadow = 'none';

        if (this.searchContainer) this.searchContainer.style.display = '';

        if (this.gallery) {
            if (typeof this.gallery.showGalleryView === 'function') {
                this.gallery.showGalleryView();
            }
            if (!this.gallery.currentPosts || this.gallery.currentPosts.length === 0) {
                this.loadGalleryPosts();
            }
        } else {
            this.loadGalleryPosts();
        }

        this.onModeChange('gallery');
    }

    setProfileMode() {
        if (!this.modeGalleryBtn || !this.modeProfileBtn) return;

        this.modeProfileBtn.classList.add('active');
        this.modeProfileBtn.style.background = 'var(--accent)';
        this.modeProfileBtn.style.color = '#fff';
        this.modeProfileBtn.style.boxShadow = '0 4px 16px var(--accent-glow)';

        this.modeGalleryBtn.classList.remove('active');
        this.modeGalleryBtn.style.background = 'transparent';
        this.modeGalleryBtn.style.color = 'rgba(255,255,255,0.7)';
        this.modeGalleryBtn.style.boxShadow = 'none';

        if (this.searchContainer) this.searchContainer.style.display = 'none';

        if (this.gallery) {
            if (typeof this.gallery.showFavoritesView === 'function') {
                this.gallery.showFavoritesView(true);
            } else if (typeof this.gallery.renderProfileFavorites === 'function') {
                this.gallery.renderProfileFavorites(true);
            }
        }

        this.onModeChange('profile');
    }

    isProfileMode() {
        return this.modeProfileBtn ? this.modeProfileBtn.classList.contains('active') : false;
    }
}
