/**
 * Application Constants and Configuration
 */

export const STORAGE_KEYS = {
    // Search and Tags
    ACTIVE_TAGS: 'r34_active_tags',
    TAG_SEARCH_HISTORY: 'r34_tag_search_history',
    CURRENT_SORT: 'r34_current_sort',
    TAG_MODE: 'r34_tag_mode',
    EXCLUDED_TAGS: 'r34_excluded_tags',

    // Settings
    GRID_COLUMNS: 'r34_grid_columns',
    MEDIA_PER_PAGE: 'r34_media_per_page',
    AUTO_PLAY_VIDEO: 'r34_autoplay_video',
    VIDEO_VOLUME: 'r34_video_volume',
    VIDEO_MUTED: 'r34_video_muted',
    VIDEO_LOOP: 'r34_video_loop',
    SAFE_MODE: 'r34_safe_mode',
    PERFORMANCE_MODE: 'r34_performance_mode',
    REDUCED_MOTION: 'r34_reduced_motion',
    THEME: 'r34_theme',
    CUSTOM_ACCENT: 'r34_custom_accent',

    // Puzzle Game
    PUZZLE_TARGET_PIECES: 'puzzleTargetPieces',
    PUZZLE_TRAY_COLS: 'puzzleTrayCols',
    PUZZLE_ALLOW_LONG_IMAGES: 'r34_puzzle_allow_long_images',
    PUZZLE_COMPLETED: 'puzzle_completed_library',

    // Favorites and History
    FAVORITES: 'r34_favorites',
    HISTORY: 'r34_history',
    SAVED_POSTS: 'r34_saved_posts'
};

export const API_ENDPOINTS = {
    RULE34_BASE: 'https://api.rule34.xxx/index.php',
    RULE34_AUTOCOMPLETE: 'https://api.rule34.xxx/autocomplete.php',
    PROXY: '/proxy?url=',
    EXCLUDED_TAGS: '/api/excluded-tags',
    FAVORITES: '/api/favorites',
    HISTORY: '/api/history',
    SETTINGS: '/api/settings',
    PUZZLE_COMPLETED: '/api/puzzle-completed'
};

export const DEFAULT_SETTINGS = {
    sort: 'new',
    mediaPerPage: 40,
    videoVolume: 0.8,
    videoMuted: true,
    videoLoop: true,
    autoplayVideo: false,
    performanceMode: false,
    reducedMotion: false,
    allowLongImages: false
};
