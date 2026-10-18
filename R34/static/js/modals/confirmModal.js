/**
 * Reusable Promise-based confirmation modal
 */

export function showConfirmModal(title, message, options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        if (!modal) {
            resolve(window.confirm(`${title}\n\n${message}`));
            return;
        }

        const titleEl = document.getElementById('confirm-modal-title');
        const messageEl = document.getElementById('confirm-modal-message');
        const cancelBtn = document.getElementById('confirm-modal-cancel');
        const confirmBtn = document.getElementById('confirm-modal-confirm');

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;
        // Модалка одна на всё приложение — сбрасываем display/текст кнопок
        // на дефолт при каждом вызове, иначе состояние от hideCancel одного
        // вызывающего протечёт в следующий, никак не связанный, вызов.
        if (cancelBtn) cancelBtn.style.display = options.hideCancel ? 'none' : '';
        if (confirmBtn) confirmBtn.textContent = options.confirmLabel || 'Подтвердить';

        modal.classList.add('open');

        const cleanup = () => {
            modal.classList.remove('open');
            if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            if (confirmBtn) confirmBtn.removeEventListener('click', onConfirm);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        const onConfirm = () => {
            cleanup();
            resolve(true);
        };

        if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
        if (confirmBtn) confirmBtn.addEventListener('click', onConfirm);
    });
}
