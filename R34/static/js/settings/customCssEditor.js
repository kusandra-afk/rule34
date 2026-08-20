/**
 * Custom CSS Editor Handler
 */

export class CustomCssEditor {
    constructor() {
        this.settingsCustomCssCheckbox = document.getElementById('settingsCustomCssCheckbox');
        this.customCssEditorContainer = document.getElementById('customCssEditorContainer');
        this.customCssEditor = document.getElementById('customCssEditor');
        this.applyCssBtn = document.getElementById('applyCssBtn');
        this.clearCssBtn = document.getElementById('clearCssBtn');
    }

    init() {
        // Load saved state into textarea
        if (this.customCssEditor) {
            this.customCssEditor.value = localStorage.getItem('r34_custom_css') || '';
        }

        const isEnabled = localStorage.getItem('r34_custom_css_enabled') === 'true';
        if (this.settingsCustomCssCheckbox) {
            this.settingsCustomCssCheckbox.checked = isEnabled;
        }
        if (this.customCssEditorContainer) {
            this.customCssEditorContainer.style.display = isEnabled ? 'block' : 'none';
        }

        if (isEnabled) {
            this.applyCustomCss();
        }

        this.bindEvents();
    }

    applyCustomCss() {
        const customCss = localStorage.getItem('r34_custom_css') || '';
        let styleEl = document.getElementById('r34-custom-css');

        if (customCss && customCss.trim() !== '') {
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'r34-custom-css';
                document.head.appendChild(styleEl);
            }
            styleEl.textContent = customCss;
        } else {
            if (styleEl) {
                styleEl.remove();
            }
        }
    }

    bindEvents() {
        if (this.settingsCustomCssCheckbox) {
            this.settingsCustomCssCheckbox.addEventListener('change', () => {
                const enabled = this.settingsCustomCssCheckbox.checked;
                localStorage.setItem('r34_custom_css_enabled', enabled ? 'true' : 'false');

                if (this.customCssEditorContainer) {
                    this.customCssEditorContainer.style.display = enabled ? 'block' : 'none';
                }

                if (enabled) {
                    this.applyCustomCss();
                } else {
                    const styleEl = document.getElementById('r34-custom-css');
                    if (styleEl) styleEl.remove();
                }
            });
        }

        if (this.applyCssBtn) {
            this.applyCssBtn.addEventListener('click', () => {
                if (this.customCssEditor) {
                    const cssCode = this.customCssEditor.value;
                    localStorage.setItem('r34_custom_css', cssCode);
                    this.applyCustomCss();
                }
            });
        }

        if (this.clearCssBtn) {
            this.clearCssBtn.addEventListener('click', () => {
                if (this.customCssEditor) {
                    this.customCssEditor.value = '';
                    localStorage.setItem('r34_custom_css', '');
                    const styleEl = document.getElementById('r34-custom-css');
                    if (styleEl) styleEl.remove();
                }
            });
        }
    }
}
