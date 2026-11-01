/**
 * Переключатель языка интерфейса в настройках.
 *
 * Сам перевод делает i18n.js; здесь только разметка состояний кнопок и
 * сохранение выбора (localStorage + сервер), чтобы язык не сбрасывался.
 */

import { getLanguage, setLanguage } from '../i18n/i18n.js';
import { saveSettingsToServer } from '../init/initServerSync.js';

export function initLanguageSettings() {
    const container = document.getElementById('settingsLanguageSwitch');
    if (!container) return;

    const buttons = Array.from(container.querySelectorAll('.settings-lang-btn'));

    const paint = (lang) => {
        buttons.forEach((btn) => {
            const isActive = btn.dataset.lang === lang;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    paint(getLanguage());

    buttons.forEach((btn) => {
        const lang = btn.dataset.lang;
        if (!lang) return;
        btn.addEventListener('click', async () => {
            if (btn.classList.contains('active')) return;
            paint(lang);
            await setLanguage(lang);
            // Храним выбор и в общих настройках: тогда он приезжает вместе с
            // остальными параметрами на других устройствах.
            saveSettingsToServer();
        });
    });

    document.addEventListener('r34:language-changed', (event) => {
        paint(event.detail.lang);
    });
}
