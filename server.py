import os
import sys
import time
import logging
import argparse
from flask import Flask, request, jsonify, redirect, g
from handlers.core_utils import (
    BASE_DIR, is_allowed_origin, get_saved_api_key, get_turso_settings,
    set_network_mode, NETWORK_MODE_LOCAL, NETWORK_MODE_LAN
)
from handlers.startup_sync import run_startup_sync
from handlers import console_ui as ui

# Import Blueprints
from handlers.auth_routes import auth_bp, session_ok as auth_session_ok
from handlers.proxy_routes import proxy_bp
from handlers.user_routes import user_bp
from handlers.safescreen_routes import safescreen_bp
from handlers.game_routes import game_bp
from handlers.room_routes import room_bp

# Initialize Flask App
app = Flask(__name__, static_folder=os.path.join(BASE_DIR, 'R34', 'static'), static_url_path='/static')

# PORT
PORT = 3000
HOST = os.environ.get('HOST', '0.0.0.0')

CERT_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'local-https-cert.pem')
KEY_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'local-https-key.pem')

# Язык интерфейса по умолчанию. Хранится рядом с прочими локальными данными,
# чтобы при следующем запуске вопрос уже не задавался.
LANGUAGE_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'language.json')
SUPPORTED_LANGUAGES = ('ru', 'en')
# Интерфейс по умолчанию английский; русский остаётся доступен в настройках
# (и флагом --lang ru).
DEFAULT_LANGUAGE = 'en'


def load_saved_language():
    """Язык, выбранный в прошлый раз (или None, если его ещё не выбирали)."""
    import json
    try:
        with open(LANGUAGE_FILE, 'r', encoding='utf-8') as f:
            lang = str(json.load(f).get('lang', '')).strip().lower()
        return lang if lang in SUPPORTED_LANGUAGES else None
    except Exception:
        return None


def save_language(lang):
    """Запоминает язык интерфейса, чтобы не спрашивать его при следующем старте."""
    import json
    if lang not in SUPPORTED_LANGUAGES:
        return False
    try:
        os.makedirs(os.path.dirname(LANGUAGE_FILE), exist_ok=True)
        with open(LANGUAGE_FILE, 'w', encoding='utf-8') as f:
            json.dump({'lang': lang}, f)
        return True
    except Exception as e:
        ui.warn('Не удалось сохранить язык интерфейса / could not save interface language: %s' % e)
        return False


def choose_language(explicit_lang):
    """Определяет язык интерфейса.

    Порядок: флаг --lang -> сохранённый выбор -> вопрос в консоли -> en.
    Вопрос задаётся только ОДИН раз: после выбора язык пишется в файл, и при
    следующих запусках сервер молча берёт его оттуда.
    """
    if explicit_lang:
        save_language(explicit_lang)
        return explicit_lang

    saved = load_saved_language()
    if saved:
        return saved

    try:
        if not sys.stdin or not sys.stdin.isatty():
            return DEFAULT_LANGUAGE
    except Exception:
        return DEFAULT_LANGUAGE

    # Язык ещё не выбран, поэтому подписи дублируются на двух языках:
    # иначе половина пользователей видит непонятный им экран.
    print()
    ui.banner('en', None)
    print()
    print('  ' + ui.paint('Выберите язык интерфейса  /  Choose interface language', ui.BOLD))
    print()
    print('  1  ' + ui.paint('Русский', ui.CYAN))
    print('  2  ' + ui.paint('English', ui.CYAN))
    print()
    try:
        answer = input('  ' + ui.paint('Язык / Language [1/2], Enter = 2: ', ui.GREY)).strip()
    except (EOFError, KeyboardInterrupt):
        print()
        answer = ''

    lang = 'ru' if answer == '1' else DEFAULT_LANGUAGE
    save_language(lang)
    ui.good('Язык сохранён / language saved: ' + lang)
    return lang


def local_ipv4_addresses():
    """Все IPv4 машины — чтобы вписать их в сертификат: тогда он подходит
    для любого адреса, по которому откроют галерею в локальной сети.

    Одного способа мало: getaddrinfo по имени хоста возвращает не все
    адаптеры, а «пробный» UDP-сокет отдаёт только адрес маршрута по
    умолчанию — если поднят VPN-туннель, это будет его адрес, а домашний
    192.168.x.x потеряется. Поэтому на Windows дополнительно разбираем
    вывод ipconfig.
    """
    import socket
    addresses = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(info[4][0])
    except Exception:
        pass
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(('8.8.8.8', 80))
        addresses.add(probe.getsockname()[0])
        probe.close()
    except Exception:
        pass
    if os.name == 'nt':
        try:
            import subprocess
            import re
            raw = subprocess.run(['ipconfig'], capture_output=True, timeout=10).stdout
            text = raw.decode('cp866', errors='ignore')
            for match in re.findall(r'(\d{1,3}(?:\.\d{1,3}){3})', text):
                parts = match.split('.')
                if all(0 <= int(p) <= 255 for p in parts) and not match.startswith('255.'):
                    addresses.add(match)
        except Exception:
            pass
    addresses.add('127.0.0.1')
    # Автонастроенные 169.254.* и маски вида x.x.x.0 в сертификате бесполезны.
    return sorted(a for a in addresses if not a.startswith('169.254.') and not a.endswith('.0'))


def ensure_local_certificate():
    """Готовит самоподписанный сертификат для локального HTTPS и возвращает
    пути к нему.

    Зачем вообще HTTPS на домашнем сервере: браузеры выдают гироскоп
    (DeviceOrientation) и WebXR только «доверенным» источникам — это https,
    localhost и 127.0.0.1. Адрес вида 192.168.x.x к ним не относится, и на
    телефоне этих API просто нет, сколько ни правь код.

    Сертификат делается ОДИН раз и переиспользуется. Встроенный в Flask
    режим ssl_context='adhoc' выписывает новый сертификат при каждом запуске,
    из-за чего телефон ругался бы на него снова и снова; с постоянным файлом
    предупреждение принимается однократно.
    """
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return CERT_FILE, KEY_FILE

    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    import datetime
    import ipaddress

    os.makedirs(os.path.dirname(CERT_FILE), exist_ok=True)

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Rule34 Gallery Local')])

    alt_names = [x509.DNSName('localhost')]
    for address in local_ipv4_addresses():
        try:
            alt_names.append(x509.IPAddress(ipaddress.ip_address(address)))
        except ValueError:
            continue

    now = datetime.datetime.now(datetime.timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(alt_names), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    with open(KEY_FILE, 'wb') as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))
    with open(CERT_FILE, 'wb') as f:
        f.write(certificate.public_bytes(serialization.Encoding.PEM))

    print(f'Создан локальный сертификат: {CERT_FILE}')
    return CERT_FILE, KEY_FILE

@auth_bp.route('/api/app-language', methods=['GET', 'POST', 'OPTIONS'])
def app_language():
    """Текущий язык интерфейса.

    Стартовая страница спрашивает его, если пользователь ещё ничего не
    выбирал в браузере, а переключатель в настройках через POST держит
    серверный выбор в актуальном состоянии — тогда следующий запуск сервера
    уже не спрашивает язык.
    """
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        lang = str(data.get('lang', '')).strip().lower()
        if save_language(lang):
            return jsonify({'ok': True, 'lang': lang})
        return jsonify({'ok': False, 'error': 'unsupported_language'}), 400
    return jsonify({'ok': True, 'lang': load_saved_language() or DEFAULT_LANGUAGE})


# Register Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(proxy_bp)
app.register_blueprint(user_bp)
app.register_blueprint(safescreen_bp)
app.register_blueprint(game_bp)
app.register_blueprint(room_bp)

PROTECTED_API_PREFIXES = (
    '/api/settings',
    '/api/excluded-tags',
    '/api/favorites',
    '/api/my-favorites',
    '/api/puzzle-completed',
    '/api/turso-config',
)


@app.before_request
def _start_request_timer():
    """Отметка времени до всех остальных before_request.

    Регистрируется ПЕРВОЙ намеренно: если предыдущий обработчик уже вернул
    ответ (например, защита отдала 401), Flask остальные before_request не
    вызывает — и без этой строки такие ответы вообще не попадали в лог.
    """
    g._r34_started_at = time.perf_counter()


@app.before_request
def guard_user_data_api():
    """Одна точка защиты всех «пользовательских» ручек /api/*.

    Зачем именно здесь, а не в каждом обработчике: если защиту размазать по
    десятку функций, то следующая новая ручка появится без проверки, и никто
    этого не заметит. Здесь достаточно один раз добавить префикс в список.

    Полноценной авторизации тут нет и не подразумевается: cookie можно
    повторить вручную. Задача скромнее — закрыть доступ программам и чужим
    устройствам в сети, которые страницу входа никогда не проходили.
    """
    path = request.path
    protected = any(path == p or path.startswith(p + '/') or path.startswith(p + '?')
                    for p in PROTECTED_API_PREFIXES)
    if not protected:
        return None
    if auth_session_ok():
        return None
    return jsonify({'ok': False, 'error': ui.t(ui.current_language(), 'auth_required')}), 401


@app.after_request
def add_cors_headers(response):
    # Тип файла не должен угадываться браузером: подмена MIME у статики —
    # классический путь к исполнению чужого содержимого.
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    # Ответы API содержат личные данные (настройки, избранное, комнаты) и
    # не должны оставаться в кеше браузера или прокси.
    if request.path.startswith('/api/'):
        response.headers.setdefault('Cache-Control', 'no-store')
    origin = request.headers.get('Origin')
    if is_allowed_origin(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Range'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Vary'] = 'Origin'
    # Статика с версией в адресе (?v=3.0.1) неизменяема: её можно кэшировать
    # надолго. Раньше no-store стоял на всём, и при каждом обновлении страницы
    # браузер заново скачивал все CSS/JS (десятки тысяч строк) — только чтобы
    # получить те же байты. Всё остальное (HTML, модули без версии) отдаём с
    # no-cache: браузер перепроверяет файл и получает 304 вместо копии.
    is_static = request.path.startswith('/static/')
    if is_static and request.args.get('v'):
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    elif is_static or request.path.endswith(('.html', '.css', '.js', '/')) or request.path == '/':
        response.headers['Cache-Control'] = 'no-cache, must-revalidate'
    return response


# --------------------------------------------------------------------------
# Лог запросов
# --------------------------------------------------------------------------

def _response_error_detail(response):
    """Текст ошибки из JSON-ответа — чтобы он попал в строку лога."""
    try:
        if not response.is_json:
            return None
        data = response.get_json(silent=True) or {}
        message = data.get('error') or data.get('message')
        if message:
            return str(message)
    except Exception:
        pass
    return None


@app.after_request
def log_request_result(response):
    """Строка на каждый заметный запрос: метод, путь, статус, время, ошибка.

    Раньше единственным следом был лог werkzeug «GET /api/... 200»: в нём
    нет ни длительности, ни причины, а ошибки к тому же отдавались со
    статусом 200 и потому выглядели успехом. Путь печатается без
    query-строки: в ней встречаются api_key и прочие секреты.
    """
    # Самопроверка панели намеренно бьёт в закрытый API и в валидацию прокси
    # (401/400) — это проверка защиты, а не ошибка приложения, поэтому в лог
    # такие запросы не пишем.
    if request.headers.get('X-R34-Self-Test') == '1':
        return response
    started = getattr(g, '_r34_started_at', None)
    duration_ms = (time.perf_counter() - started) * 1000 if started else 0.0
    ui.log_request(request.method, request.path, response.status_code,
                   duration_ms, _response_error_detail(response))
    return response

# Расширения, для которых HTML-редирект бессмысленен и вреден: браузер получал
# index.html с типом text/html вместо файла и падал с «Failed to load module
# script ... MIME type of text/html», не показывая, какого файла не хватает.
ASSET_EXTENSIONS = (
    '.js', '.mjs', '.css', '.map', '.json', '.png', '.jpg', '.jpeg', '.gif',
    '.webp', '.svg', '.ico', '.mp4', '.webm', '.woff', '.woff2', '.ttf'
)


@app.errorhandler(404)
def page_not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': 'not_found'}), 404
    if request.path.lower().endswith(ASSET_EXTENSIONS):
        # Честный 404: пусть в консоли будет видно, ЧТО именно не нашлось.
        return 'Not found', 404, {'Content-Type': 'text/plain; charset=utf-8'}
    return redirect('/')

def choose_network_mode(explicit_mode, port, lang='en'):
    """Определяет режим сетевого доступа.

    Порядок такой: явный флаг --mode -> вопрос в консоли (если она вообще
    интерактивная) -> lan по умолчанию.

    Спрашивать нужно именно на старте, потому что после того как Flask уже
    занял 0.0.0.0, поменять это на ходу нельзя — придётся перезапускать.
    """
    if explicit_mode:
        return explicit_mode

    # Консоли нет или она не интерактивная (служба, перенаправленный stdin,
    # запуск из чужого скрипта) — спрашивать некого. Оставляем прежнее
    # поведение: сервер доступен в локальной сети.
    try:
        if not sys.stdin or not sys.stdin.isatty():
            return NETWORK_MODE_LAN
    except Exception:
        return NETWORK_MODE_LAN

    print()
    print('  ' + ui.paint(ui.t(lang, 'net_question'), ui.BOLD))
    print()
    print(f"  1  {ui.t(lang, 'net_local')}   "
          + ui.paint(f'http://127.0.0.1:{port}', ui.CYAN))
    print('     ' + ui.paint(ui.t(lang, 'net_local_note'), ui.GREY))
    print()
    print(f"  2  {ui.t(lang, 'net_lan')}")
    print('     ' + ui.paint(f'http://127.0.0.1:{port} / http://<ip>:{port}', ui.CYAN))
    print('     ' + ui.paint(ui.t(lang, 'net_lan_note'), ui.GREY))
    print()

    try:
        answer = input('  ' + ui.paint(f"{ui.t(lang, 'choice')} [1/2], Enter = 2: ", ui.GREY)).strip()
    except (EOFError, KeyboardInterrupt):
        print()
        answer = ''

    if answer == '1':
        return NETWORK_MODE_LOCAL
    return NETWORK_MODE_LAN


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Rule34 Gallery Standalone Flask Server')
    parser.add_argument('--port', '-p', type=int, default=PORT, help='Port to run server on')
    parser.add_argument('--host', '-H', type=str, default=None,
                        help='Host to bind to. Перебивает выбор режима (--mode)')
    parser.add_argument('--mode', '-m', choices=[NETWORK_MODE_LOCAL, NETWORK_MODE_LAN], default=None,
                        help="local - сервер слушает только 127.0.0.1; lan - 0.0.0.0, доступен устройствам в этой же сети. Если не указан, сервер спросит при запуске")
    parser.add_argument('--lang', '-l', choices=list(SUPPORTED_LANGUAGES), default=None,
                        help='Язык интерфейса: ru или en. Сохраняется и используется при следующих запусках; если не указан, сервер спросит язык при первом запуске')
    parser.add_argument('--https', action='store_true',
                        help='Запустить по HTTPS с самоподписанным сертификатом. Нужно для гироскопа и WebXR с телефона: браузеры дают эти API только в защищённом контексте (требует пакет cryptography)')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Логировать все запросы, включая статику. Без флага в лог попадают только /api и ошибки / log every request, including static files')
    args = parser.parse_args()

    # Язык спрашивается ДО режима сети: это первое, что видит пользователь.
    ui_lang = choose_language(args.lang)
    ui.configure(ui_lang, args.verbose)

    # Режим задаётся ДО app.run(): от него зависит и адрес бинда, и то, каким
    # Origin'ам будет выдаваться CORS с credentials (см. is_allowed_origin).
    mode = choose_network_mode(args.mode, args.port, ui_lang)
    set_network_mode(mode)

    if args.host:
        bind_host = args.host
    elif os.environ.get('HOST'):
        bind_host = os.environ['HOST']
    elif mode == NETWORK_MODE_LOCAL:
        bind_host = '127.0.0.1'
    else:
        bind_host = '0.0.0.0'

    # Синхронизация с Turso (если включена). Вся логика вынесена в
    # handlers/startup_sync.py — раньше она лежала прямо здесь, из-за чего под
    # gunicorn не выполнялась вообще.
    run_startup_sync(ui_lang)

    # Гироскоп (DeviceOrientation) и WebXR браузеры отдают только в
    # защищённом контексте: HTTPS либо localhost. При заходе с телефона по
    # http://<ip-в-локальной-сети>:3000 этих API просто нет — поэтому для
    # VR-режима с телефона сервер умеет подниматься по HTTPS с самоподписанным
    # сертификатом. Браузер один раз предупредит, что сертификат неизвестен —
    # это нормально, надо согласиться продолжить.
    ssl_context = None
    if args.https:
        try:
            ssl_context = ensure_local_certificate()
        except ImportError:
            ui.warn(ui.t(ui_lang, 'https_no_crypto'))
            print('    ' + ui.t(ui_lang, 'https_install'))
            print('    ' + ui.t(ui_lang, 'https_fallback'))
        except Exception as e:
            ui.warn(ui.t(ui_lang, 'https_cert_failed', error=e))
            print('    ' + ui.t(ui_lang, 'https_http_fallback'))

    scheme = 'https' if ssl_context else 'http'

    # Адреса считаем по режиму: в локальном режиме адресов в сети не
    # существует, и показывать их было бы ложью.
    local_url = f'{scheme}://127.0.0.1:{args.port}'
    lan_urls = []
    if mode != NETWORK_MODE_LOCAL:
        lan_urls = [f'{scheme}://{address}:{args.port}'
                    for address in local_ipv4_addresses()
                    if address != '127.0.0.1']

    # Две вещи, из-за которых «всё работает не так», но по стартовой строке
    # понять это было нельзя: сохранены ли ключи rule34 и включён ли Turso.
    try:
        user_id, _api_key = get_saved_api_key()
    except Exception:
        user_id = None
    try:
        turso_url, turso_token, turso_enabled = get_turso_settings()
    except Exception:
        turso_url, turso_token, turso_enabled = '', '', False
    # «Включена» и «работает» — разные вещи: адрес и токен могли не задать,
    # и тогда каждая синхронизация падает на пустом URL. Об этом надо
    # сказать сразу, а не показывать бодрое «включена».
    if not turso_enabled:
        turso_state = 'off'
    elif turso_url and turso_token:
        turso_state = 'on'
    else:
        turso_state = 'broken'

    # Werkzeug печатает свою строку на каждый запрос: она дублирует наш лог
    # и не содержит длительности. Оставляем от неё только ошибки.
    logging.getLogger('werkzeug').setLevel(logging.ERROR)

    game_cache_dir = os.path.join(BASE_DIR, 'game_data')

    # Проверки окружения выводятся в том же отчёте, что и адрес: иначе на
    # «почему не работает» приходится отвечать после открытия браузера.
    # cryptography — необязательная: нужна только для --https.
    import platform
    deps_status = []
    for module_name, label, optional in (
        ('flask', 'Flask', False),
        ('requests', 'requests', False),
        ('Crypto', 'pycryptodome', False),
        ('cryptography', 'cryptography', True),
    ):
        try:
            __import__(module_name)
            deps_status.append((label, True, optional))
        except Exception:
            deps_status.append((label, False, optional))

    ui.startup_report(ui_lang, {
        'python': platform.python_version(),
        'deps': deps_status,
        'mode': mode,
        'https': bool(ssl_context),
        'local_url': local_url,
        'lan_urls': lan_urls,
        'user_id': user_id,
        'turso': turso_state,
        'secrets_dir': os.path.join(BASE_DIR, 'R34', '.secrets'),
        'cache_dir': game_cache_dir if os.path.isdir(game_cache_dir) else '',
        'verbose': args.verbose,
    })
    print()

    # Flask печатает «* Serving Flask app» и «* Debug mode: off» уже после
    # нашего отчёта — это выглядит как хвост от чужой программы.
    try:
        import flask.cli
        flask.cli.show_server_banner = lambda *a, **k: None
    except Exception:
        pass

    try:
        app.run(host=bind_host, port=args.port, threaded=True, ssl_context=ssl_context)
    except KeyboardInterrupt:
        print()
        ui.info(ui.t(ui_lang, 'shutdown'))
