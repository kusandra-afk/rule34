# CHECKPOINT: Project checkpoint comment added successfully
import os
import argparse
from flask import Flask, request, jsonify, redirect
from handlers.core_utils import (
    BASE_DIR, is_allowed_origin, get_turso_settings, initialize_turso_tables,
    get_turso_favorites, load_my_favorites, enrich_favorites_with_post_data,
    save_turso_favorites, get_turso_puzzles, load_puzzle_completed,
    optimize_puzzles, save_turso_puzzles, save_puzzle_completed_optimized
)

# Import Blueprints
from handlers.auth_routes import auth_bp
from handlers.proxy_routes import proxy_bp
from handlers.user_routes import user_bp
from handlers.safescreen_routes import safescreen_bp
from handlers.game_routes import game_bp

# Initialize Flask App
app = Flask(__name__, static_folder=os.path.join(BASE_DIR, 'R34', 'static'), static_url_path='/static')

# PORT
PORT = 3000
HOST = os.environ.get('HOST', '0.0.0.0')

CERT_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'local-https-cert.pem')
KEY_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'local-https-key.pem')


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

# Register Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(proxy_bp)
app.register_blueprint(user_bp)
app.register_blueprint(safescreen_bp)
app.register_blueprint(game_bp)

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if is_allowed_origin(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Range'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Vary'] = 'Origin'
    # Prevent stale browser caching of CSS/JS/HTML during development
    if request.path.endswith(('.html', '.css', '.js', '/')) or request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

@app.errorhandler(404)
def page_not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': 'not_found'}), 404
    return redirect('/')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Rule34 Gallery Standalone Flask Server')
    parser.add_argument('--port', '-p', type=int, default=PORT, help='Port to run server on')
    parser.add_argument('--host', '-H', type=str, default=HOST, help='Host to bind to')
    parser.add_argument('--https', action='store_true',
                        help='Запустить по HTTPS с самоподписанным сертификатом. Нужно для гироскопа и WebXR с телефона: браузеры дают эти API только в защищённом контексте (требует пакет cryptography)')
    args = parser.parse_args()

    # Initialize Turso tables if enabled
    url, token, enabled = get_turso_settings()
    if enabled:
        print('Turso sync is enabled, initializing tables...')
        if initialize_turso_tables():
            print('Turso tables initialized successfully')
            
            # Initial sync: merge local and Turso data
            print('Checking for initial sync...')
            turso_favorites = get_turso_favorites()
            local_favorites = load_my_favorites()
            
            # Merge favorites by ID, keeping the most recent by change timestamp
            if turso_favorites is not None and local_favorites is not None:
                turso_fav_map = {str(f.get('id')): f for f in turso_favorites}
                local_fav_map = {str(f.get('id')): f for f in local_favorites}
                
                merged_favorites = list(turso_fav_map.values())
                for fid, local_fav in local_fav_map.items():
                    if fid not in turso_fav_map:
                        merged_favorites.append(local_fav)
                    else:
                        # Keep the one with more recent change timestamp
                        turso_change = turso_fav_map[fid].get('change', 0)
                        local_change = local_fav.get('change', 0)
                        if local_change > turso_change:
                            merged_favorites = [f for f in merged_favorites if str(f.get('id')) != fid]
                            merged_favorites.append(local_fav)
                
                if len(merged_favorites) > len(turso_favorites):
                    print(f'Merging favorites: {len(turso_favorites)} in Turso, {len(local_favorites)} local, {len(merged_favorites)} merged')
                    enriched_favorites = enrich_favorites_with_post_data(merged_favorites)
                    save_turso_favorites(enriched_favorites)
            elif turso_favorites is None and local_favorites is not None:
                print(f'Uploading {len(local_favorites)} local favorites to Turso...')
                enriched_favorites = enrich_favorites_with_post_data(local_favorites)
                save_turso_favorites(enriched_favorites)
            
            turso_puzzles = get_turso_puzzles()
            local_puzzles = load_puzzle_completed()
            
            # Merge puzzles by ID, keeping the most recent by lastUpdated
            if turso_puzzles and local_puzzles:
                turso_map = {str(p.get('postId', p.get('id', ''))): p for p in turso_puzzles if p.get('postId') or p.get('id')}
                local_map = {str(p.get('postId', p.get('id', ''))): p for p in local_puzzles if p.get('postId') or p.get('id')}
                
                merged_map = {}
                for pid, p in turso_map.items():
                    merged_map[pid] = p
                for pid, p in local_map.items():
                    if pid not in merged_map:
                        merged_map[pid] = p
                    else:
                        try:
                            t_update = merged_map[pid].get('lastUpdated', '')
                            l_update = p.get('lastUpdated', '')
                            if l_update > t_update:
                                merged_map[pid] = p
                        except Exception:
                            pass
                
                merged_puzzles = list(merged_map.values())
                optimized_puzzles = optimize_puzzles(merged_puzzles)
                
                if len(optimized_puzzles) > len(turso_puzzles):
                    print(f'Merging puzzles: {len(turso_puzzles)} in Turso, {len(local_puzzles)} local, {len(optimized_puzzles)} merged')
                    save_turso_puzzles(optimized_puzzles)
                    save_puzzle_completed_optimized(optimized_puzzles)
            elif not turso_puzzles and local_puzzles:
                print(f'Uploading {len(local_puzzles)} local puzzles to Turso...')
                optimized_puzzles = optimize_puzzles(local_puzzles)
                save_turso_puzzles(optimized_puzzles)
        else:
            print('Failed to initialize Turso tables')
    else:
        print('Turso sync is disabled or not configured')

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
            print('HTTPS запрошен, но не установлен пакет cryptography.')
            print('Установите его командой:  pip install cryptography')
            print('Продолжаю по обычному HTTP (гироскоп и WebXR будут недоступны с телефона).')
        except Exception as e:
            print(f'Не удалось подготовить сертификат: {e}')
            print('Продолжаю по обычному HTTP.')

    scheme = 'https' if ssl_context else 'http'
    print(f"Server Rule34 Gallery started at {scheme}://{args.host}:{args.port}")
    if ssl_context:
        print('Открыть с телефона (гироскоп и VR работают только так):')
        for address in local_ipv4_addresses():
            if address != '127.0.0.1':
                print(f'    {scheme}://{address}:{args.port}')
        # Только ASCII-совместимые символы: консоль Windows работает в cp1251,
        # и «экзотика» вроде стрелки U+2192 роняет процесс с UnicodeEncodeError
        # ещё до app.run() — сервер просто не стартует.
        print('Телефон один раз предупредит о неизвестном сертификате - это ожидаемо')
        print('для домашнего сервера: "Дополнительно" -> "Перейти на сайт".')
    app.run(host=args.host, port=args.port, threaded=True, ssl_context=ssl_context)
