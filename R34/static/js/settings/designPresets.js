/**
 * Built-in Design Presets
 */

import { setRangeGradient } from '../utils.js';

export const designPresets = {
    minimal: {
        'r34_theme_accent': 'pink',
        'r34_theme_bg': 'obsidian',
        'r34_card_border_color': 'rgba(255, 255, 255, 0.12)',
        'r34_card_bg_opacity': '0',
        'r34_card_bg_blur': '0',
        'r34_card_border_width': '1',
        'r34_card_glow_intensity': '0',
        'r34_card_transition_speed': '150',
        'r34_card_tags_display': 'true',
        'r34_media_radius': '8',
        'r34_media_gap': '16',
        'r34_col_width': '280',
        'r34_hover_style': 'none',
        'r34_reduced_motion': 'true',
        'r34_header_style': 'transparent',
        'r34_tag_size': '10',
        'r34_base_font_size': '14',
        'r34_scrollbar_width': '6',
        'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.1)',
        'r34_api_limit': '60',
        'r34_api_timeout': '20',
        'r34_api_retries': '2'
    },
    glass: {
        'r34_theme_accent': 'pink',
        'r34_theme_bg': 'midnight',
        'r34_card_border_color': 'rgba(255, 255, 255, 0.08)',
        'r34_card_bg_opacity': '55',
        'r34_card_bg_blur': '14',
        'r34_card_border_width': '1',
        'r34_card_glow_intensity': '45',
        'r34_card_transition_speed': '300',
        'r34_card_tags_display': 'true',
        'r34_media_radius': '20',
        'r34_media_gap': '24',
        'r34_col_width': '300',
        'r34_hover_style': 'zoom',
        'r34_reduced_motion': 'false',
        'r34_header_style': 'glass',
        'r34_tag_size': '11',
        'r34_base_font_size': '16',
        'r34_scrollbar_width': '8',
        'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.14)',
        'r34_api_limit': '40',
        'r34_api_timeout': '15',
        'r34_api_retries': '3'
    },
    brutalist: {
        'r34_theme_accent': 'orange',
        'r34_theme_bg': 'obsidian',
        'r34_card_border_color': '#ffffff',
        'r34_card_bg_opacity': '100',
        'r34_card_bg_blur': '0',
        'r34_card_border_width': '3',
        'r34_card_glow_intensity': '0',
        'r34_card_transition_speed': '200',
        'r34_card_tags_display': 'true',
        'r34_media_radius': '0',
        'r34_media_gap': '20',
        'r34_col_width': '320',
        'r34_hover_style': 'borderPop',
        'r34_reduced_motion': 'false',
        'r34_header_style': 'dark',
        'r34_tag_size': '12',
        'r34_base_font_size': '16',
        'r34_scrollbar_width': '10',
        'r34_scrollbar_thumb_color': '#ffffff',
        'r34_api_limit': '50',
        'r34_api_timeout': '15',
        'r34_api_retries': '2'
    },
    neon: {
        'r34_theme_accent': 'cyan',
        'r34_theme_bg': 'midnight',
        'r34_card_border_color': 'rgba(0, 255, 255, 0.5)',
        'r34_card_bg_opacity': '70',
        'r34_card_bg_blur': '8',
        'r34_card_border_width': '2',
        'r34_card_glow_intensity': '85',
        'r34_card_transition_speed': '250',
        'r34_card_tags_display': 'true',
        'r34_media_radius': '12',
        'r34_media_gap': '20',
        'r34_col_width': '300',
        'r34_hover_style': 'glow',
        'r34_reduced_motion': 'false',
        'r34_header_style': 'accent',
        'r34_tag_size': '11',
        'r34_base_font_size': '16',
        'r34_scrollbar_width': '8',
        'r34_scrollbar_thumb_color': 'rgba(0, 255, 255, 0.4)',
        'r34_api_limit': '40',
        'r34_api_timeout': '15',
        'r34_api_retries': '3'
    },
    classic: {
        'r34_theme_accent': 'pink',
        'r34_theme_bg': 'obsidian',
        'r34_card_border_color': 'rgba(255, 255, 255, 0.06)',
        'r34_card_bg_opacity': '90',
        'r34_card_bg_blur': '0',
        'r34_card_border_width': '1',
        'r34_card_glow_intensity': '20',
        'r34_card_transition_speed': '300',
        'r34_card_tags_display': 'true',
        'r34_media_radius': '16',
        'r34_media_gap': '24',
        'r34_col_width': '300',
        'r34_hover_style': 'slide',
        'r34_reduced_motion': 'false',
        'r34_header_style': 'dark',
        'r34_tag_size': '11',
        'r34_base_font_size': '16',
        'r34_scrollbar_width': '8',
        'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.16)',
        'r34_api_limit': '40',
        'r34_api_timeout': '15',
        'r34_api_retries': '3'
    },
    performance: {
        'r34_theme_accent': 'pink',
        'r34_theme_bg': 'obsidian',
        'r34_card_border_color': 'rgba(255, 255, 255, 0.05)',
        'r34_card_bg_opacity': '0',
        'r34_card_bg_blur': '0',
        'r34_card_border_width': '0',
        'r34_card_glow_intensity': '0',
        'r34_card_transition_speed': '100',
        'r34_card_tags_display': 'false',
        'r34_media_radius': '4',
        'r34_media_gap': '12',
        'r34_col_width': '250',
        'r34_hover_style': 'none',
        'r34_reduced_motion': 'true',
        'r34_low_power_mode': 'true',
        'r34_load_limit_enabled': 'true',
        'r34_header_style': 'transparent',
        'r34_tag_size': '9',
        'r34_base_font_size': '14',
        'r34_scrollbar_width': '4',
        'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.08)',
        'r34_api_limit': '30',
        'r34_api_timeout': '10',
        'r34_api_retries': '1',
        'r34_preload_mode': 'off'
    },
    mobile: {
        'r34_theme_accent': 'pink',
        'r34_theme_bg': 'midnight',
        'r34_card_border_color': 'rgba(255, 255, 255, 0.08)',
        'r34_card_bg_opacity': '40',
        'r34_card_bg_blur': '8',
        'r34_card_border_width': '1',
        'r34_card_glow_intensity': '30',
        'r34_card_transition_speed': '200',
        'r34_card_tags_display': 'true',
        'r34_media_radius': '12',
        'r34_media_gap': '12',
        'r34_col_width': '150',
        'r34_hover_style': 'pulse',
        'r34_reduced_motion': 'true',
        'r34_fast_open_mode': 'true',
        'r34_header_style': 'glass',
        'r34_tag_size': '10',
        'r34_base_font_size': '15',
        'r34_scrollbar_width': '6',
        'r34_scrollbar_thumb_color': 'rgba(255, 255, 255, 0.12)',
        'r34_api_limit': '25',
        'r34_api_timeout': '20',
        'r34_api_retries': '2',
        'r34_preload_mode': 'near'
    },
    cinema: {
        'r34_theme_accent': 'violet',
        'r34_theme_bg': 'midnight',
        'r34_card_border_color': 'rgba(167, 139, 250, 0.2)',
        'r34_card_bg_opacity': '20',
        'r34_card_bg_blur': '4',
        'r34_card_border_width': '1',
        'r34_card_glow_intensity': '60',
        'r34_card_transition_speed': '400',
        'r34_card_tags_display': 'false',
        'r34_media_radius': '0',
        'r34_media_gap': '8',
        'r34_col_width': '400',
        'r34_hover_style': 'zoom',
        'r34_reduced_motion': 'false',
        'r34_header_style': 'transparent',
        'r34_tag_size': '10',
        'r34_base_font_size': '16',
        'r34_scrollbar_width': '4',
        'r34_scrollbar_thumb_color': 'rgba(167, 139, 250, 0.3)',
        'r34_api_limit': '20',
        'r34_api_timeout': '25',
        'r34_api_retries': '3',
        'r34_api_cache_enabled': 'true'
    },
    light: {
        'r34_theme_accent': 'blue',
        'r34_theme_bg': '#f0f2f5',
        'r34_card_border_color': 'rgba(0, 0, 0, 0.1)',
        'r34_card_bg_opacity': '95',
        'r34_card_bg_blur': '0',
        'r34_card_border_width': '1',
        'r34_card_glow_intensity': '10',
        'r34_card_transition_speed': '300',
        'r34_card_tags_display': 'true',
        'r34_media_radius': '16',
        'r34_media_gap': '24',
        'r34_col_width': '300',
        'r34_hover_style': 'slide',
        'r34_reduced_motion': 'false',
        'r34_header_style': 'dark',
        'r34_tag_size': '11',
        'r34_base_font_size': '16',
        'r34_scrollbar_width': '8',
        'r34_scrollbar_thumb_color': 'rgba(0, 0, 0, 0.2)',
        'r34_api_limit': '40',
        'r34_api_timeout': '15',
        'r34_api_retries': '3'
    }
};

export class DesignPresetsManager {
    constructor(options = {}) {
        this.applyThemeSettings = options.applyThemeSettings || (() => {});
        this.syncAllSettingsUI = options.syncAllSettingsUI || (() => {});
        this.presets = options.presets || designPresets;
    }

    init() {
        this.bindEvents();
    }

    applyPreset(presetName) {
        const presetConfig = this.presets[presetName];
        if (!presetConfig) return;

        const settingsToReset = [
            'r34_card_bg_opacity', 'r34_card_bg_blur', 'r34_card_border_width',
            'r34_card_glow_intensity', 'r34_card_transition_speed', 'r34_card_tags_display',
            'r34_media_radius', 'r34_media_gap', 'r34_col_width',
            'r34_hover_style', 'r34_reduced_motion',
            'r34_header_style', 'r34_tag_size', 'r34_base_font_size',
            'r34_scrollbar_width', 'r34_scrollbar_thumb_color',
            'r34_theme_accent', 'r34_theme_bg', 'r34_card_border_color',
            'r34_low_power_mode', 'r34_load_limit_enabled', 'r34_fast_open_mode',
            'r34_api_limit', 'r34_api_timeout', 'r34_api_retries',
            'r34_preload_mode'
        ];

        // Save preset settings
        Object.keys(presetConfig).forEach(key => {
            localStorage.setItem(key, presetConfig[key]);
        });

        // Reset unset values
        settingsToReset.forEach(key => {
            if (!presetConfig[key]) {
                localStorage.removeItem(key);
            }
        });

        // Update buttons state
        document.querySelectorAll('.preset-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-preset') === presetName);
        });

        // Apply theme settings
        this.applyThemeSettings();

        // Sync UI inputs
        this.syncAllSettingsUI(presetConfig);
    }

    bindEvents() {
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.getAttribute('data-preset');
                this.applyPreset(preset);
            });
        });
    }
}
