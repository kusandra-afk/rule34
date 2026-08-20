/**
 * Import and Export Settings Module
 */

export class ImportExportSettings {
    constructor(options = {}) {
        this.applyThemeSettings = options.applyThemeSettings || (() => {});
        this.applyCustomCss = options.applyCustomCss || (() => {});
        this.showConfirmModal = options.showConfirmModal || window.showConfirmModal || (async (title, msg) => confirm(msg));

        this.exportThemeBtn = document.getElementById('exportThemeBtn');
        this.importThemeBtn = document.getElementById('importThemeBtn');
        this.importThemeInput = document.getElementById('importThemeInput');
        this.copySettingsBtn = document.getElementById('copySettingsBtn');
        this.pasteSettingsBtn = document.getElementById('pasteSettingsBtn');
    }

    init() {
        this.bindEvents();
    }

    getAllSettings() {
        const settings = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('r34_')) {
                settings[key] = localStorage.getItem(key);
            }
        }
        return settings;
    }

    applySettings(settings) {
        // Clear existing r34_ settings
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('r34_')) {
                localStorage.removeItem(key);
            }
        }

        // Apply new settings
        Object.keys(settings).forEach(key => {
            localStorage.setItem(key, settings[key]);
        });

        // Apply theme settings
        this.applyThemeSettings();

        // Apply custom CSS if enabled
        if (settings['r34_custom_css_enabled'] === 'true') {
            this.applyCustomCss();
        }

        // Reload page to apply all changes
        location.reload();
    }

    bindEvents() {
        // Export theme
        if (this.exportThemeBtn) {
            this.exportThemeBtn.addEventListener('click', () => {
                const settings = this.getAllSettings();
                const themeData = {
                    version: '1.0',
                    timestamp: new Date().toISOString(),
                    settings: settings
                };

                const blob = new Blob([JSON.stringify(themeData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `r34-theme-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        }

        // Import theme
        if (this.importThemeBtn && this.importThemeInput) {
            this.importThemeBtn.addEventListener('click', () => {
                this.importThemeInput.click();
            });

            this.importThemeInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const themeData = JSON.parse(event.target.result);
                        if (themeData.settings && typeof themeData.settings === 'object') {
                            const confirmed = await this.showConfirmModal('Подтверждение', 'Это заменит все текущие настройки. Продолжить?');
                            if (confirmed) {
                                this.applySettings(themeData.settings);
                            }
                        } else {
                            await this.showConfirmModal('Ошибка', 'Неверный формат файла темы');
                        }
                    } catch (error) {
                        await this.showConfirmModal('Ошибка', 'Ошибка при чтении файла: ' + error.message);
                    }
                };
                reader.readAsText(file);
                this.importThemeInput.value = ''; // Reset input
            });
        }

        // Copy settings to clipboard
        if (this.copySettingsBtn) {
            this.copySettingsBtn.addEventListener('click', async () => {
                const settings = this.getAllSettings();
                const themeData = {
                    version: '1.0',
                    timestamp: new Date().toISOString(),
                    settings: settings
                };

                try {
                    await navigator.clipboard.writeText(JSON.stringify(themeData, null, 2));
                    this.copySettingsBtn.textContent = 'Скопировано!';
                    setTimeout(() => {
                        this.copySettingsBtn.textContent = 'Копировать';
                    }, 2000);
                } catch (error) {
                    await this.showConfirmModal('Ошибка', 'Ошибка при копировании: ' + error.message);
                }
            });
        }

        // Paste settings from clipboard
        if (this.pasteSettingsBtn) {
            this.pasteSettingsBtn.addEventListener('click', async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    const themeData = JSON.parse(text);

                    if (themeData.settings && typeof themeData.settings === 'object') {
                        const confirmed = await this.showConfirmModal('Подтверждение', 'Это заменит все текущие настройки. Продолжить?');
                        if (confirmed) {
                            this.applySettings(themeData.settings);
                        }
                    } else {
                        await this.showConfirmModal('Ошибка', 'Неверный формат настроек в буфере обмена');
                    }
                } catch (error) {
                    await this.showConfirmModal('Ошибка', 'Ошибка при вставке: ' + error.message);
                }
            });
        }
    }
}
