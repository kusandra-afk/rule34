/**
 * Custom Presets System
 */

export class CustomPresetsManager {
    constructor(options = {}) {
        this.getAllSettings = options.getAllSettings || (() => ({}));
        this.applyThemeSettings = options.applyThemeSettings || (() => {});
        this.applyCustomCss = options.applyCustomCss || (() => {});
        this.syncAllSettingsUI = options.syncAllSettingsUI || (() => {});
        this.showConfirmModal = options.showConfirmModal || window.showConfirmModal || (async (title, msg) => confirm(msg));

        this.savePresetBtn = document.getElementById('savePresetBtn');
        this.customPresetName = document.getElementById('customPresetName');
        this.container = document.getElementById('customPresetsContainer');
        this.list = document.getElementById('customPresetsList');
    }

    init() {
        this.renderCustomPresets();
        this.bindEvents();
    }

    getCustomPresets() {
        try {
            const saved = localStorage.getItem('r34_custom_presets');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.error('Error loading custom presets:', e);
            return {};
        }
    }

    saveCustomPresets(presets) {
        try {
            localStorage.setItem('r34_custom_presets', JSON.stringify(presets));
        } catch (e) {
            console.error('Error saving custom presets:', e);
            this.showConfirmModal('Внимание', 'Ошибка при сохранении пресета: ' + e.message);
        }
    }

    renderCustomPresets() {
        if (!this.container || !this.list) return;

        const presets = this.getCustomPresets();
        const presetNames = Object.keys(presets);

        if (presetNames.length === 0) {
            this.container.style.display = 'none';
            return;
        }

        this.container.style.display = 'block';
        this.list.innerHTML = '';

        presetNames.forEach(name => {
            const item = document.createElement('div');
            item.className = 'custom-preset-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'custom-preset-name';
            nameSpan.textContent = name;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'custom-preset-delete';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = 'Удалить пресет';
            deleteBtn.addEventListener('click', async () => {
                const confirmed = await this.showConfirmModal('Удаление', `Удалить пресет "${name}"?`);
                if (confirmed) {
                    delete presets[name];
                    this.saveCustomPresets(presets);
                    this.renderCustomPresets();
                }
            });

            item.appendChild(nameSpan);
            item.appendChild(deleteBtn);

            item.addEventListener('click', (e) => {
                if (e.target !== deleteBtn) {
                    this.applyCustomPreset(presets[name]);
                }
            });

            this.list.appendChild(item);
        });
    }

    applyCustomPreset(presetConfig) {
        if (!presetConfig || typeof presetConfig !== 'object') return;

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
            'r34_preload_mode', 'r34_custom_css_enabled', 'r34_custom_css'
        ];

        Object.keys(presetConfig).forEach(key => {
            localStorage.setItem(key, presetConfig[key]);
        });

        settingsToReset.forEach(key => {
            if (!presetConfig[key]) {
                localStorage.removeItem(key);
            }
        });

        this.applyThemeSettings();

        if (presetConfig['r34_custom_css_enabled'] === 'true') {
            this.applyCustomCss();
        } else {
            const customStyle = document.getElementById('r34-custom-css');
            if (customStyle) customStyle.remove();
        }

        this.syncAllSettingsUI(presetConfig);

        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    }

    bindEvents() {
        if (this.savePresetBtn && this.customPresetName) {
            this.savePresetBtn.addEventListener('click', async () => {
                const name = this.customPresetName.value.trim();
                if (!name) {
                    await this.showConfirmModal('Внимание', 'Введите название пресета');
                    return;
                }

                const presets = this.getCustomPresets();
                const currentSettings = this.getAllSettings();
                presets[name] = currentSettings;

                this.saveCustomPresets(presets);
                this.customPresetName.value = '';

                this.renderCustomPresets();
                await this.showConfirmModal('Успех', `Пресет "${name}" сохранен!`);
            });
        }
    }
}
