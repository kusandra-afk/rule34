import os
from flask import Blueprint, request, send_file, redirect, jsonify
from handlers.core_utils import (
    BASE_DIR, get_saved_api_key, check_api_key_valid, clear_creds, save_api_creds
)

# Cookie-метка «этот браузер уже прошёл вход». Всё, что связано с ней, живёт
# здесь, потому что именно auth_routes выдаёт главную страницу и обрабатывает
# вход/выход.
#
# Смысл: запрос к /api/* без этой метки получает 401. Чужое устройство в той же
# локальной сети больше не может прочитать настройки, избранное и конфиг Turso.
#
# Ограничение: это НЕ проверка личности. Запрос можно повторить с той же cookie
# вручную. Полноценной авторизацией тут и не пахнет — задача скромнее: закрыть
# доступ программам и устройствам, которые страницу входа не проходили.
#
# Значение не секрет: креды rule34 лежат зашифрованными на диске и в браузер не
# отдаются. Поэтому cookie намеренно доступна из JS — удобно для отладки.
SESSION_COOKIE = 'r34_session'
SESSION_VALUE = 'ok'


def session_ok():
    return request.cookies.get(SESSION_COOKIE) == SESSION_VALUE


def mark_session(response):
    response.set_cookie(SESSION_COOKIE, SESSION_VALUE, httponly=False, samesite='Lax', path='/')
    return response


def unmark_session(response):
    response.delete_cookie(SESSION_COOKIE, path='/')
    return response


auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/firebase-applet-config.json')
def firebase_config_page():
    config_path = os.path.join(BASE_DIR, 'firebase-applet-config.json')
    if os.path.exists(config_path):
        return send_file(config_path)
    return jsonify({}), 404

@auth_bp.route('/')
def index():
    user_id, api_key = get_saved_api_key()
    if user_id and api_key:
        if check_api_key_valid(user_id, api_key):
            # Заодно обновляем cookie: если браузер её потерял, а ключи на
            # диске целы, вход восстанавливается сам, без повторного ввода.
            return mark_session(send_file(os.path.join(BASE_DIR, 'R34', 'index.html')))
        else:
            print(f"Сохраненные ключи для пользователя {user_id} недействительны. Автоматический сброс...")
            clear_creds()
    return unmark_session(send_file(os.path.join(BASE_DIR, 'R34', 'login.html')))

@auth_bp.route('/login')
@auth_bp.route('/login.html')
def login_page():
    return send_file(os.path.join(BASE_DIR, 'R34', 'login.html'))

@auth_bp.route('/api_key_login_ajax', methods=['POST', 'OPTIONS'])
def api_key_login():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    data = request.json or {}
    user_id = str(data.get('user_id', '')).strip()
    api_key = str(data.get('api_key', '')).strip()
    
    if not user_id or not api_key:
        return jsonify({'ok': False, 'error': 'Введите оба поля!'})
        
    if not user_id.isdigit():
        clear_creds()
        return jsonify({'ok': False, 'error': 'User ID должен состоять только из цифр!'})

    if check_api_key_valid(user_id, api_key):
        if not save_api_creds(user_id, api_key):
            clear_creds()
            return jsonify({'ok': False, 'error': 'Не удалось сохранить ключи на диск. Проверьте права записи в папку R34/.secrets.'})
        return mark_session(jsonify({'ok': True}))
    else:
        clear_creds()
        return jsonify({'ok': False, 'error': 'Ошибка! Неверный user_id или api_key. Проверьте данные и повторите попытку.'})

@auth_bp.route('/logout')
def logout():
    clear_creds()
    return unmark_session(redirect('/'))
