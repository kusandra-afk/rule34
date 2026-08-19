document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('api-login-form');
    const errorDiv = document.getElementById('login-error');
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.textContent = '';
        const user_id = form.user_id.value.trim();
        const api_key = form.api_key.value.trim();
        if (!user_id || !api_key) {
            errorDiv.textContent = 'Введите оба поля!';
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
        }

        try {
            const resp = await fetch('/api_key_login_ajax', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ user_id, api_key })
            });
            const data = await resp.json();
            if (data.ok) {
                window.location.href = '/';
            } else {
                errorDiv.textContent = data.error || 'Ошибка! Неверный user_id или api_key.';
            }
        } catch (err) {
            console.error('Login request error:', err);
            errorDiv.textContent = 'Ошибка сети или сервера. Попробуйте еще раз.';
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            }
        }
    });
});