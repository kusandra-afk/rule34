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
        this.modeProfileBtn.classList.remove('active');

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
        this.modeGalleryBtn.classList.remove('active');

        if (this.searchContainer) this.searchContainer.style.display = 'none';

        // Баннер ошибки/rate-limit галереи (плавающий тост, не привязанный к
        // текущему экрану) относится только к загрузке страниц галереи —
        // "Избранное" грузится через свой отдельный /api/my-favorites и
        // никогда не вызывает rate-limit Rule34. Без явной очистки тост с
        // обратным отсчётом продолжал висеть поверх экрана "Избранное" до
        // истечения своего таймера, хотя к нему уже не имел отношения.
        if (window.galleryController && typeof window.galleryController._clearError === 'function') {
            window.galleryController._clearError();
        }

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
