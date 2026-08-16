# Tiny comment added by AI Assistant
from flask import Flask, request, send_file, send_from_directory, redirect, jsonify, Response, stream_with_context
from werkzeug.utils import secure_filename
import os
import json
import time
import re
import argparse
import requests
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes
import base64

# Import custom modules
from handlers import turso_handler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(BASE_DIR, 'R34', 'static'), static_url_path='/static')
PORT = 3000
HOST = os.environ.get('HOST', '0.0.0.0')

def is_allowed_origin(origin):
    if not origin:
        return False
    parsed = urlparse(origin)
    host = (parsed.hostname or '').lower()
    return (host in {'localhost', '127.0.0.1'} or 
            host.endswith('.localhost') or 
            host.endswith('.run.app') or 
            host.endswith('google.com') or 
            'aistudio' in host)


def is_allowed_target_url(target_url):
    try:
        parsed = urlparse(target_url)
    except Exception:
        return False
    if parsed.scheme not in {'http', 'https'}:
        return False
    host = (parsed.hostname or '').lower()
    return host in {'rule34.xxx', 'www.rule34.xxx', 'api.rule34.xxx'} or host.endswith('.rule34.xxx')


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if is_allowed_origin(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Range'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Vary'] = 'Origin'
    return response

# Configure session with retries and connection pooling for maximum throughput and low latency
session = requests.Session()
adapter = HTTPAdapter(
    max_retries=Retry(total=3, connect=3, backoff_factor=0.1),
    pool_connections=20,
    pool_maxsize=50
)
session.mount('https://', adapter)
session.mount('http://', adapter)

# Issue 3: Compatible file paths
API_KEY_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'api_credentials.json')
API_KEY_ENCRYPTION_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', '.api_key.key')
MY_FAVORITES_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'my_favorites.json')
EXCLUDED_TAGS_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'excluded_tags.json')
SETTINGS_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'settings.json')
PUZZLE_COMPLETED_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'puzzle_completed.json')
TURSO_CONFIG_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'turso_config.json')
SAFE_SCREEN_DIR = os.path.join(BASE_DIR, 'safe_screen')
os.makedirs(SAFE_SCREEN_DIR, exist_ok=True)

# In-memory caches for performance
validated_keys_cache = {}  # key -> (is_valid, timestamp)
VALIDATION_CACHE_TTL = 3600  # 1 hour TTL

favorite_cache = {}  # key -> (is_fav, timestamp) - Issue 5: Cache favorited status
FAVORITE_CACHE_TTL = 30  # 30 seconds TTL

# Turso settings
TURSO_URL = os.environ.get('TURSO_URL', '')
TURSO_AUTH_TOKEN = os.environ.get('TURSO_AUTH_TOKEN', '')
TURSO_ENABLED = bool(TURSO_URL and TURSO_AUTH_TOKEN)

def get_turso_settings():
    """Load Turso settings from settings.json"""
    return turso_handler.get_turso_settings(load_settings, load_turso_config)

def execute_turso_query(sql, params=None):
    """Execute a query on Turso database"""
    return turso_handler.execute_turso_query(sql, params, session, load_settings, load_turso_config)

def initialize_turso_tables():
    """Initialize Turso tables if they don't exist"""
    return turso_handler.initialize_turso_tables(session, load_settings, load_turso_config)

def get_turso_favorites():
    """Get favorites from Turso"""
    return turso_handler.get_turso_favorites(session, load_settings, load_turso_config)

def save_turso_favorites(favorites):
    """Save favorites to Turso"""
    return turso_handler.save_turso_favorites(favorites, session, load_settings, load_turso_config)

def get_turso_puzzles():
    """Get puzzles from Turso"""
    return turso_handler.get_turso_puzzles(session, load_settings, load_turso_config)

def save_turso_puzzles(puzzles):
    """Save puzzles to Turso"""
    return turso_handler.save_turso_puzzles(puzzles, session, load_settings, load_turso_config)

def set_validated_key(key, is_valid):
    if len(validated_keys_cache) >= 500:
        oldest = next(iter(validated_keys_cache))
        validated_keys_cache.pop(oldest, None)
    validated_keys_cache[key] = (is_valid, time.time())

def set_favorite_cache(key, is_fav):
    if len(favorite_cache) >= 1000:
        oldest = next(iter(favorite_cache))
        favorite_cache.pop(oldest, None)
    favorite_cache[key] = (is_fav, time.time())


def invalidate_caches():
    favorite_cache.clear()


REAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'


def get_encryption_key():
    if not os.path.exists(API_KEY_ENCRYPTION_FILE):
        os.makedirs(os.path.dirname(API_KEY_ENCRYPTION_FILE), exist_ok=True)
        key = get_random_bytes(32)  # 256-bit key for AES-256
        with open(API_KEY_ENCRYPTION_FILE, 'wb') as f:
            f.write(key)
        try:
            os.chmod(API_KEY_ENCRYPTION_FILE, 0o600)
        except Exception:
            pass
    with open(API_KEY_ENCRYPTION_FILE, 'rb') as f:
        return f.read()


def get_saved_api_key():
    if os.path.exists(API_KEY_FILE):
        try:
            with open(API_KEY_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            if not content:
                return None, None
            
            # Пытаемся прочитать как JSON
            try:
                creds_data = json.loads(content)
                if isinstance(creds_data, dict) and 'user_id' in creds_data and 'encrypted_api_key' in creds_data:
                    user_id = creds_data['user_id']
                    encrypted_api_key = creds_data['encrypted_api_key']
                    
                    # Расшифровываем API ключ
                    key = get_encryption_key()
                    encrypted_data = base64.b64decode(encrypted_api_key)
                    iv = encrypted_data[:16]  # First 16 bytes is IV
                    actual_encrypted = encrypted_data[16:]
                    cipher = AES.new(key, AES.MODE_CBC, iv)
                    decrypted_data = unpad(cipher.decrypt(actual_encrypted), AES.block_size)
                    api_key = decrypted_data.decode('utf-8')
                    
                    return user_id, api_key
            except json.JSONDecodeError:
                # Старый формат (простой текст с шифрованием)
                try:
                    key = get_encryption_key()
                    encrypted_data = base64.b64decode(content)
                    iv = encrypted_data[:16]  # First 16 bytes is IV
                    actual_encrypted = encrypted_data[16:]
                    cipher = AES.new(key, AES.MODE_CBC, iv)
                    decrypted_data = unpad(cipher.decrypt(actual_encrypted), AES.block_size)
                    payload = decrypted_data.decode('utf-8')
                    parts = payload.split(':', 1)
                    if len(parts) >= 2:
                        return parts[0], parts[1]
                except Exception:
                    parts = content.split(':')
                    if len(parts) >= 2:
                        return parts[0], ':'.join(parts[1:])
        except Exception as e:
            print('Error reading API key file:', e)
    return None, None


def save_api_creds(user_id, api_key):
    try:
        os.makedirs(os.path.dirname(API_KEY_FILE), exist_ok=True)
        
        # Шифруем только API ключ
        key = get_encryption_key()
        iv = get_random_bytes(16)  # Generate random IV
        cipher = AES.new(key, AES.MODE_CBC, iv)
        api_key_bytes = api_key.encode('utf-8')
        padded_data = pad(api_key_bytes, AES.block_size)
        encrypted_data = cipher.encrypt(padded_data)
        # Combine IV and encrypted data
        combined = iv + encrypted_data
        encrypted_api_key = base64.b64encode(combined).decode('utf-8')
        
        # Сохраняем в JSON с зашифрованным API ключом (без обычного api_key)
        creds_data = {
            'user_id': user_id,
            'encrypted_api_key': encrypted_api_key
        }
        
        with open(API_KEY_FILE, 'w', encoding='utf-8') as f:
            json.dump(creds_data, f, ensure_ascii=False, indent=2)
        try:
            os.chmod(API_KEY_FILE, 0o600)
        except Exception:
            pass
    except Exception as e:
        print('Error saving API creds:', e)
def clear_creds():
    validated_keys_cache.clear()
    invalidate_caches()
    if os.path.exists(API_KEY_FILE):
        try:
            os.remove(API_KEY_FILE)
        except Exception as e:
            print('Error clearing creds:', e)

def check_api_key_valid(user_id, api_key):
    if not user_id or not api_key:
        return False
        
    # Ensure user_id consists of digits
    if not user_id.isdigit():
        return False

    cache_key = f"{user_id}:{api_key}"
    now = time.time()
    if cache_key in validated_keys_cache:
        is_valid, ts = validated_keys_cache[cache_key]
        if now - ts < VALIDATION_CACHE_TTL:
            return is_valid

    url = 'https://api.rule34.xxx/index.php'
    params = {
        'page': 'dapi',
        's': 'post',
        'q': 'index',
        'user_id': user_id,
        'api_key': api_key,
        'limit': '1',
        'json': '1'
    }
    headers = {'User-Agent': REAL_USER_AGENT}
    try:
        resp = session.get(url, params=params, headers=headers, timeout=10)
        
        # Explicit authentication denial checks
        if resp.status_code in (401, 403):
            set_validated_key(cache_key, False)
            return False
            
        text = resp.text or ""
        if "Missing authentication" in text or "Unauthorized" in text:
            set_validated_key(cache_key, False)
            return False
            
        # If we got a successful status code, inspect the structure of the response
        if resp.status_code == 200:
            stripped = text.strip()
            # If it's valid JSON array or XML posts list, it's correct
            if stripped.startswith('[') or stripped.startswith('<'):
                set_validated_key(cache_key, True)
                return True
                
        print(f"Validation failed for {user_id} with status {resp.status_code}")
        set_validated_key(cache_key, False)
        return False
    except Exception as e:
        print('API key check error:', e)
        return False

@app.route('/firebase-applet-config.json')
def firebase_config_page():
    config_path = os.path.join(BASE_DIR, 'firebase-applet-config.json')
    if os.path.exists(config_path):
        return send_file(config_path)
    return jsonify({}), 404

@app.route('/')
def index():
    user_id, api_key = get_saved_api_key()
    if user_id and api_key:
        if check_api_key_valid(user_id, api_key):
            return send_file(os.path.join(BASE_DIR, 'R34', 'index.html'))
        else:
            print(f"Сохраненные ключи для пользователя {user_id} недействительны. Автоматический сброс...")
            clear_creds()
    return send_file(os.path.join(BASE_DIR, 'R34', 'login.html'))

@app.route('/login')
@app.route('/login.html')
def login_page():
    return send_file(os.path.join(BASE_DIR, 'R34', 'login.html'))

@app.route('/api_key_login_ajax', methods=['POST', 'OPTIONS'])
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
        save_api_creds(user_id, api_key)
        return jsonify({'ok': True})
    else:
        # При ошибке валидации обязательно очищаем старый файл, чтобы не было битых данных
        clear_creds()
        return jsonify({'ok': False, 'error': 'Ошибка! Неверный user_id или api_key. Проверьте данные и повторите попытку.'})

@app.route('/logout')
def logout():
    clear_creds()
    return redirect('/')

@app.route('/proxy', methods=['GET', 'OPTIONS'])
def proxy():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})

    target_url = request.args.get('url', '').strip()
    if not target_url:
        return 'Missing url parameter', 400
    if not is_allowed_target_url(target_url):
        return 'Disallowed target URL', 400

    user_id, api_key = get_saved_api_key()

    try:
        parsed = urlparse(target_url)
        query_params = parse_qsl(parsed.query, keep_blank_values=True)
        if user_id and api_key:
            if 'index.php' in parsed.path and 'page=dapi' in parsed.query:
                query_params.append(('user_id', user_id))
                query_params.append(('api_key', api_key))
            elif 'index.php' in parsed.path and 'page=favorites' in parsed.query:
                query_params.append(('user_id', user_id))
                query_params.append(('api_key', api_key))

        target_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(query_params, doseq=True), parsed.fragment))

        is_api_request = 'index.php' in target_url
        now = time.time()

        headers = {'User-Agent': REAL_USER_AGENT}
        if request.headers.get('Range'):
            headers['Range'] = request.headers.get('Range')
        response = session.get(target_url, headers=headers, timeout=30, stream=True)

        if response.status_code in (401, 403):
            clear_creds()
            return 'Ошибка авторизации Rule34 API. Пожалуйста, войдите заново.', 401

        content_type = response.headers.get('content-type', '')
        allowed_headers = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'content-disposition'
        ]

        pass_headers = {}
        for name, value in response.headers.items():
            if name.lower() in allowed_headers and value:
                pass_headers[name] = str(value)

        status_code = response.status_code if response.status_code in (200, 206) else 200

        if 'json' in content_type.lower() or 'xml' in content_type.lower():
            content_data = response.content
            text_preview = content_data[:200].decode('utf-8', errors='ignore') if content_data else ""
            if "Missing authentication" in text_preview or "Unauthorized" in text_preview:
                clear_creds()
                return 'Ошибка авторизации Rule34 API. Пожалуйста, войдите заново.', 401

            return Response(content_data, status=status_code, headers=pass_headers, content_type=content_type)

        def generate():
            for chunk in response.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk

        return Response(stream_with_context(generate()), status=status_code, headers=pass_headers, content_type=content_type)

    except Exception as e:
        return f"Proxy error: {str(e)}", 500

def load_my_favorites():
    try:
        if os.path.exists(MY_FAVORITES_FILE):
            with open(MY_FAVORITES_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, list):
                        # Check if data is in new optimized format (has only id and change)
                        if data and isinstance(data[0], dict) and 'id' in data[0] and len(data[0]) <= 2:
                            return data
                        # Old format - convert to new
                        print('Converting old favorites format to new optimized format...')
                        return convert_favorites_to_optimized(data)
        else:
            # Create file with empty array if it doesn't exist
            dir_path = os.path.dirname(MY_FAVORITES_FILE)
            if dir_path:
                os.makedirs(dir_path, exist_ok=True)
            with open(MY_FAVORITES_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error loading my_favorites.json:', e)
    return []

def convert_favorites_to_optimized(old_favorites):
    """Convert old favorites format to new optimized format"""
    optimized = []
    for fav in old_favorites:
        if isinstance(fav, dict):
            fav_id = fav.get('id')
            if fav_id:
                optimized.append({
                    'id': fav_id,
                    'change': fav.get('change', 0)
                })
    # Save converted data
    save_my_favorites_optimized(optimized)
    return optimized

def save_my_favorites(favorites):
    """Save favorites in new optimized format"""
    try:
        os.makedirs(os.path.dirname(MY_FAVORITES_FILE), exist_ok=True)
        with open(MY_FAVORITES_FILE, 'w', encoding='utf-8') as f:
            json.dump(favorites, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving my_favorites.json:', e)

def save_my_favorites_optimized(favorites):
    """Save favorites in optimized format (only ID and change)"""
    try:
        os.makedirs(os.path.dirname(MY_FAVORITES_FILE), exist_ok=True)
        with open(MY_FAVORITES_FILE, 'w', encoding='utf-8') as f:
            json.dump(favorites, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving my_favorites.json:', e)

def are_favorites_equal(list_a, list_b):
    """Compare two list of favorites for equality of content"""
    if not isinstance(list_a, list) or not isinstance(list_b, list):
        return False
    if len(list_a) != len(list_b):
        return False
    map_a = {str(f.get('id')): f for f in list_a if isinstance(f, dict)}
    for f in list_b:
        if not isinstance(f, dict):
            return False
        fid = str(f.get('id'))
        if fid not in map_a:
            return False
        if f.get('change', 0) != map_a[fid].get('change', 0) or f.get('is_deleted', 0) != map_a[fid].get('is_deleted', 0):
            return False
    return True

def enrich_favorites_with_post_data(optimized_favorites):
    """Enrich optimized favorites with fresh post data from API"""
    enriched = []
    for fav in optimized_favorites:
        if isinstance(fav, dict) and 'id' in fav and 'image' not in fav:
            fav_id = fav['id']
            post_data = fetch_post_data(fav_id)
            if post_data:
                enriched.append({
                    'id': fav_id,
                    'change': fav.get('change', 0),
                    'is_deleted': fav.get('is_deleted', 0),
                    **post_data
                })
            else:
                # If API fails, keep minimal structure with api_failed flag
                enriched.append({
                    'id': fav_id,
                    'change': fav.get('change', 0),
                    'is_deleted': fav.get('is_deleted', 0),
                    'api_failed': True
                })
        else:
            # Already has full data (old format)
            enriched.append(fav)
    return enriched

def load_excluded_tags():
    try:
        print(f'Loading excluded tags from: {EXCLUDED_TAGS_FILE}')
        if os.path.exists(EXCLUDED_TAGS_FILE):
            with open(EXCLUDED_TAGS_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, list):
                        print(f'Loaded {len(data)} excluded tags')
                        return data
        else:
            print(f'File not found: {EXCLUDED_TAGS_FILE}')
    except Exception as e:
        print('Error loading excluded_tags.json:', e)
    print('Returning empty list for excluded tags')
    return []

def save_excluded_tags(tags):
    try:
        os.makedirs(os.path.dirname(EXCLUDED_TAGS_FILE), exist_ok=True)
        with open(EXCLUDED_TAGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(tags, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving excluded_tags.json:', e)

def load_turso_config():
    try:
        if os.path.exists(TURSO_CONFIG_FILE):
            with open(TURSO_CONFIG_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    # Если есть зашифрованный токен, расшифровываем его
                    if 'encrypted_turso_token' in data:
                        try:
                            key = get_encryption_key()
                            encrypted_token = data['encrypted_turso_token']
                            encrypted_data = base64.b64decode(encrypted_token)
                            iv = encrypted_data[:16]
                            actual_encrypted = encrypted_data[16:]
                            cipher = AES.new(key, AES.MODE_CBC, iv)
                            decrypted_data = unpad(cipher.decrypt(actual_encrypted), AES.block_size)
                            token = decrypted_data.decode('utf-8')
                            data['turso_token'] = token
                        except Exception as e:
                            print('Error decrypting turso token:', e)
                            return {'turso_url': '', 'turso_token': ''}
                    return data
    except Exception as e:
        print('Error loading turso_config.json:', e)
    return {'turso_url': '', 'turso_token': ''}

def save_turso_config(config):
    try:
        os.makedirs(os.path.dirname(TURSO_CONFIG_FILE), exist_ok=True)
        
        # Шифруем токен Turso
        if 'turso_token' in config and config['turso_token']:
            key = get_encryption_key()
            iv = get_random_bytes(16)
            cipher = AES.new(key, AES.MODE_CBC, iv)
            token_bytes = config['turso_token'].encode('utf-8')
            padded_data = pad(token_bytes, AES.block_size)
            encrypted_data = cipher.encrypt(padded_data)
            combined = iv + encrypted_data
            encrypted_token = base64.b64encode(combined).decode('utf-8')
            
            # Сохраняем с зашифрованным токеном (без обычного)
            config_to_save = {
                'turso_url': config.get('turso_url', ''),
                'encrypted_turso_token': encrypted_token
            }
        else:
            config_to_save = {
                'turso_url': config.get('turso_url', ''),
                'encrypted_turso_token': ''
            }
        
        with open(TURSO_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config_to_save, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving turso_config.json:', e)

def load_settings():
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, dict):
                        sanitized = sanitize_settings(data)
                        if sanitized != data:
                            save_settings(sanitized)
                        return sanitized
    except Exception as e:
        print('Error loading settings.json:', e)
    return {}

def is_valid_settings_key(key):
    if not isinstance(key, str):
        return False
    if not key.startswith('r34_'):
        return False
    excluded_prefixes = (
        'r34_duration_',
        'r34_tagtype_',
        'r34_puzzle_',
        'r34_solved_',
        'r34_tagcnt_'
    )
    excluded_keys = {
        'r34_active_tags',
        'r34_excluded_tags_set'
    }
    if key in excluded_keys:
        return False
    return not any(key.startswith(prefix) for prefix in excluded_prefixes)


def sanitize_settings(settings):
    if not isinstance(settings, dict):
        return {}
    return {key: value for key, value in settings.items() if is_valid_settings_key(key)}


def save_settings(settings):
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(sanitize_settings(settings), f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving settings.json:', e)


def load_puzzle_completed():
    try:
        if os.path.exists(PUZZLE_COMPLETED_FILE):
            with open(PUZZLE_COMPLETED_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, list):
                        # Check if data is in new optimized format (has postId)
                        if data and isinstance(data[0], dict) and 'postId' in data[0]:
                            return data
                        # Old format - convert to new
                        print('Converting old puzzle format to new optimized format...')
                        return convert_puzzles_to_optimized(data)
        else:
            # Create file with empty array if it doesn't exist
            os.makedirs(os.path.dirname(PUZZLE_COMPLETED_FILE), exist_ok=True)
            with open(PUZZLE_COMPLETED_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error loading puzzle_completed.json:', e)
    return []

def optimize_puzzles(puzzles):
    """Convert any format of puzzles list to the clean, optimized format"""
    optimized = []
    for puzzle in puzzles:
        if isinstance(puzzle, dict):
            post_id = puzzle.get('postId') or puzzle.get('id') or (puzzle.get('post', {}).get('id') if isinstance(puzzle.get('post'), dict) else None)
            if post_id:
                image_url = puzzle.get('imageUrl') or puzzle.get('thumbnail')
                post_obj = puzzle.get('post') or {}
                if not image_url and isinstance(post_obj, dict):
                    image_url = post_obj.get('sample_url') or post_obj.get('file_url') or post_obj.get('preview_url')
                
                width = puzzle.get('width') or (post_obj.get('width') if isinstance(post_obj, dict) else None) or 1000
                height = puzzle.get('height') or (post_obj.get('height') if isinstance(post_obj, dict) else None) or 1000
                
                optimized.append({
                    'postId': str(post_id),
                    'imageUrl': image_url or '',
                    'width': int(width) if str(width).isdigit() else 1000,
                    'height': int(height) if str(height).isdigit() else 1000,
                    'variants': puzzle.get('variants', []),
                    'lastUpdated': puzzle.get('lastUpdated', '')
                })
    return optimized

def convert_puzzles_to_optimized(old_puzzles):
    """Convert old puzzle format to new optimized format"""
    optimized = optimize_puzzles(old_puzzles)
    # Save converted data
    save_puzzle_completed_optimized(optimized)
    return optimized

def save_puzzle_completed(puzzles):
    """Save puzzles in new optimized format"""
    try:
        optimized = optimize_puzzles(puzzles)
        os.makedirs(os.path.dirname(PUZZLE_COMPLETED_FILE), exist_ok=True)
        with open(PUZZLE_COMPLETED_FILE, 'w', encoding='utf-8') as f:
            json.dump(optimized, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving puzzle_completed.json:', e)

def save_puzzle_completed_optimized(puzzles):
    """Save puzzles in optimized format (only ID and metadata)"""
    try:
        optimized = optimize_puzzles(puzzles)
        os.makedirs(os.path.dirname(PUZZLE_COMPLETED_FILE), exist_ok=True)
        with open(PUZZLE_COMPLETED_FILE, 'w', encoding='utf-8') as f:
            json.dump(optimized, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving puzzle_completed.json:', e)

def fetch_post_data(post_id):
    """Fetch fresh post data from Rule34 API by ID"""
    try:
        # Try direct API call with user_id and api_key as query parameters
        user_id, api_key = get_saved_api_key()
        url = f"https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&id={post_id}&json=1&fields=tag_info"
        if user_id:
            url += f"&user_id={user_id}"
        if api_key:
            url += f"&api_key={api_key}"
        headers = {'User-Agent': REAL_USER_AGENT}
        response = session.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            text = response.text
            if text and text.strip().startswith('['):
                posts = json.loads(text)
                if isinstance(posts, list) and len(posts) > 0:
                    return posts[0]
    except Exception as e:
        print(f'Error fetching post data for ID {post_id}: {e}')
    return None

def enrich_puzzles_with_post_data(optimized_puzzles):
    """Enrich optimized puzzles with fresh post data or construct minimal post data on the fly"""
    enriched = []
    for puzzle in optimized_puzzles:
        if isinstance(puzzle, dict):
            post_id = puzzle.get('postId') or puzzle.get('id') or (puzzle.get('post', {}).get('id') if isinstance(puzzle.get('post'), dict) else None)
            if not post_id:
                continue

            # Ensure we have image_url and dimensions
            image_url = puzzle.get('imageUrl') or puzzle.get('thumbnail')
            post_obj = puzzle.get('post') or {}
            if not image_url and isinstance(post_obj, dict):
                image_url = post_obj.get('sample_url') or post_obj.get('file_url') or post_obj.get('preview_url')
            
            width = puzzle.get('width') or (post_obj.get('width') if isinstance(post_obj, dict) else None)
            height = puzzle.get('height') or (post_obj.get('height') if isinstance(post_obj, dict) else None)

            # If we don't have the image_url, try to fetch it from the API as a fallback
            if not image_url and post_id:
                post_data = fetch_post_data(post_id)
                if post_data:
                    image_url = post_data.get('sample_url') or post_data.get('file_url') or post_data.get('preview_url') or ""
                    width = post_data.get('width') or 1000
                    height = post_data.get('height') or 1000
                    # Store fetched data in the puzzle so we don't have to fetch it next time
                    puzzle['imageUrl'] = image_url
                    puzzle['width'] = width
                    puzzle['height'] = height

            image_url = image_url or ""
            width = width or 1000
            height = height or 1000

            # Construct the minimal post object
            minimal_post = {
                'id': int(post_id) if str(post_id).isdigit() else post_id,
                'width': width,
                'height': height,
                'sample_url': image_url,
                'file_url': image_url,
                'preview_url': image_url
            }

            enriched.append({
                'id': post_id,
                'postId': post_id,
                'imageUrl': image_url,
                'thumbnail': image_url,
                'width': width,
                'height': height,
                'post': minimal_post,
                'variants': puzzle.get('variants', []),
                'lastUpdated': puzzle.get('lastUpdated', '')
            })
        else:
            enriched.append(puzzle)
    return enriched

def check_is_favorited(user_id, post_id):
    pid_str = str(post_id)
    cache_key = f"{user_id}:{pid_str}"
    now = time.time()
    if cache_key in favorite_cache:
        is_fav, ts = favorite_cache[cache_key]
        if now - ts < FAVORITE_CACHE_TTL:
            return is_fav  # Issue 5: Cached favorited status

    try:
        fav_url = f"https://rule34.xxx/index.php?page=favorites&s=view&id={user_id}"
        headers = {'User-Agent': REAL_USER_AGENT, 'Cookie': f'user_id={user_id}'}
        resp = session.get(fav_url, headers=headers, timeout=10)
        if resp.status_code == 200:
            html = resp.text
            if (f'id="p{pid_str}"' in html or f'id=p{pid_str}' in html 
                or f'page=post&s=view&id={pid_str}' in html 
                or f'page=post&amp;s=view&amp;id={pid_str}' in html):
                set_favorite_cache(cache_key, True)
                return True
    except Exception as e:
        print('Error in check_is_favorited HTML:', e)

    try:
        url = f"https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=fav:{user_id}&json=1"
        headers = {'User-Agent': REAL_USER_AGENT}
        resp = session.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            text = resp.text
            if text and text.strip().startswith('['):
                posts = json.loads(text)
                if isinstance(posts, list) and any(str(p.get('id')) == pid_str for p in posts):
                    set_favorite_cache(cache_key, True)
                    return True
    except Exception as e:
        print('Error in check_is_favorited DAPI:', e)

    set_favorite_cache(cache_key, False)
    return False

@app.route('/api/my-profile', methods=['GET', 'OPTIONS'])
def api_my_profile():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    user_id, api_key = get_saved_api_key()
    favorites = load_my_favorites()
    return jsonify({
        'ok': True,
        'userId': user_id or '',
        'hasApiKey': bool(api_key),
        'favoritesCount': len(favorites)
    })

@app.route('/api/my-favorites', methods=['GET', 'POST', 'OPTIONS'])
def api_my_favorites_handler():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    if request.method == 'GET':
        # Merge Turso and local data
        turso_favorites = get_turso_favorites()
        local_favorites = load_my_favorites()
        
        print(f'[Favorites Sync] GET favorites: Turso={len(turso_favorites) if turso_favorites is not None else "Error"}, Local={len(local_favorites)}')
        
        if turso_favorites is not None:
            # Merge by ID, keeping most recent by change timestamp
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
            
            # Check if we need to write changes back to local/Turso
            need_save_local = not are_favorites_equal(merged_favorites, local_favorites)
            need_save_turso = not are_favorites_equal(merged_favorites, turso_favorites)
            
            if need_save_local:
                print(f'[Favorites Sync] Saving merged favorites ({len(merged_favorites)}) locally')
                save_my_favorites_optimized(merged_favorites)
            
            if need_save_turso:
                print(f'[Favorites Sync] Uploading merged favorites ({len(merged_favorites)}) to Turso')
                save_turso_favorites(merged_favorites)
                
            # Return only active favorites in optimized format
            active_favorites = [f for f in merged_favorites if f.get('is_deleted', 0) == 0]
            return jsonify({'ok': True, 'favorites': active_favorites})
        else:
            # Return only active favorites in optimized format
            active_favorites = [f for f in local_favorites if f.get('is_deleted', 0) == 0]
            return jsonify({'ok': True, 'favorites': active_favorites})
    else:
        data = request.json or {}
        post_id = data.get('postId')
        action = data.get('action')
        post_data = data.get('postData')

        if not post_id or not action:
            return jsonify({'ok': False, 'error': 'Missing postId or action'}), 400

        favorites = load_my_favorites()
        pid_str = str(post_id)
        now_ts = int(time.time() * 1000)

        # Find existing index to update it, or insert new
        existing_idx = None
        for i, f in enumerate(favorites):
            if str(f.get('id')) == pid_str:
                existing_idx = i
                break

        if action == 'add':
            if existing_idx is not None:
                # Update existing entry with is_deleted=0 and new change timestamp
                favorites[existing_idx]['is_deleted'] = 0
                favorites[existing_idx]['change'] = now_ts
            else:
                # Insert new active favorite
                favorites.insert(0, {'id': pid_str, 'change': now_ts, 'is_deleted': 0})
        elif action == 'delete':
            if existing_idx is not None:
                # Soft delete existing entry
                favorites[existing_idx]['is_deleted'] = 1
                favorites[existing_idx]['change'] = now_ts
            else:
                # Insert soft deleted entry
                favorites.insert(0, {'id': pid_str, 'change': now_ts, 'is_deleted': 1})

        # Save in optimized format
        save_my_favorites_optimized(favorites)
        
        # Also save to Turso if enabled (in optimized format)
        save_turso_favorites(favorites)
        
        # Return only count of active favorites
        active_count = len([f for f in favorites if f.get('is_deleted', 0) == 0])
        return jsonify({'ok': True, 'favoritesCount': active_count})

@app.route('/api/excluded-tags', methods=['GET', 'POST', 'OPTIONS'])
def api_excluded_tags_handler():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    if request.method == 'GET':
        tags = load_excluded_tags()
        return jsonify({'ok': True, 'tags': tags})
    else:
        data = request.json or {}
        tags = data.get('tags')
        if not isinstance(tags, list):
            return jsonify({'ok': False, 'error': 'Invalid tags format'}), 400
        save_excluded_tags(tags)
        return jsonify({'ok': True, 'tags': tags})

@app.route('/api/turso-config', methods=['GET', 'POST', 'OPTIONS'])
def api_turso_config_handler():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    if request.method == 'GET':
        config = load_turso_config()
        return jsonify({'ok': True, 'config': config})
    else:
        data = request.json or {}
        url = str(data.get('turso_url', '')).strip()
        token = str(data.get('turso_token', '')).strip()
        config = {'turso_url': url, 'turso_token': token}
        save_turso_config(config)
        return jsonify({'ok': True, 'config': config})

@app.route('/api/settings', methods=['GET', 'POST', 'OPTIONS'])
def api_settings_handler():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    if request.method == 'GET':
        settings = load_settings()
        return jsonify({'ok': True, 'settings': settings})
    else:
        data = request.json or {}
        settings = data.get('settings')
        if not isinstance(settings, dict):
            return jsonify({'ok': False, 'error': 'Invalid settings format'}), 400
        sanitized = sanitize_settings(settings)
        save_settings(sanitized)
        return jsonify({'ok': True, 'settings': sanitized})

@app.route('/api/favorite', methods=['POST', 'OPTIONS'])
def api_favorite():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    data = request.json or {}
    post_id = data.get('postId')
    action = data.get('action')

    if not post_id or not action:
        return jsonify({'ok': False, 'error': 'Missing postId or action'}), 400

    user_id, api_key = get_saved_api_key()
    if not user_id or not api_key:
        return jsonify({'ok': False, 'error': 'Необходима авторизация!'}), 401

    pid_str = str(post_id)
    try:
        is_fav_initially = check_is_favorited(user_id, pid_str)
        if action == 'add' and is_fav_initially:
            invalidate_caches()
            return jsonify({'ok': True, 'verified': True, 'message': 'Уже в фаворитах'})
        if action == 'delete' and not is_fav_initially:
            invalidate_caches()
            return jsonify({'ok': True, 'verified': True, 'message': 'Уже не в фаворитах'})

        headers_base = {
            'User-Agent': REAL_USER_AGENT,
            'Referer': f'https://rule34.xxx/index.php?page=post&s=view&id={pid_str}',
            'Cookie': f'user_id={user_id}; pass_hash={api_key}; api_key={api_key}',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }

        candidates = []
        if action == 'add':
            candidates = [
                f"https://rule34.xxx/index.php?page=favorites&s=save&id={pid_str}&user_id={user_id}&api_key={api_key}",
                f"https://api.rule34.xxx/index.php?page=dapi&s=favorite&q=add&id={pid_str}&user_id={user_id}&api_key={api_key}",
                f"https://rule34.xxx/index.php?page=favorites&s=add&id={pid_str}&user_id={user_id}&api_key={api_key}"
            ]
        else:
            candidates = [
                f"https://rule34.xxx/index.php?page=favorites&s=delete&id={pid_str}&user_id={user_id}&api_key={api_key}",
                f"https://api.rule34.xxx/index.php?page=dapi&s=favorite&q=delete&id={pid_str}&user_id={user_id}&api_key={api_key}"
            ]

        verified = False
        for url in candidates:
            try:
                session.get(url, headers=headers_base, timeout=10)
                favorite_cache.clear()
                is_fav_now = check_is_favorited(user_id, pid_str)
                if (action == 'add' and is_fav_now) or (action == 'delete' and not is_fav_now):
                    verified = True
                    break
            except Exception:
                pass

        invalidate_caches()
        return jsonify({'ok': True, 'verified': verified})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/favorites', methods=['GET', 'OPTIONS'])
def api_get_favorites():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    user_id, api_key = get_saved_api_key()
    if not user_id or not api_key:
        return jsonify({'ok': False, 'error': 'Unauthorized'}), 401

    try:
        url = f"https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=fav:{user_id}&user_id={user_id}&api_key={api_key}&json=1&limit=1000&fields=tag_info"
        resp = session.get(url, headers={'User-Agent': REAL_USER_AGENT}, timeout=15)
        if resp.status_code == 200:
            try:
                text = resp.text
                if text and text.strip().startswith('['):
                    data = json.loads(text)
                    if isinstance(data, list):
                        return jsonify(data)
            except Exception:
                pass
        favorites = load_my_favorites()
        active_favorites = [f for f in favorites if f.get('is_deleted', 0) == 0]
        return jsonify(active_favorites)
    except Exception:
        favorites = load_my_favorites()
        active_favorites = [f for f in favorites if f.get('is_deleted', 0) == 0]
        return jsonify(active_favorites)

@app.route('/api/enrich-favorites', methods=['POST', 'OPTIONS'])
def api_enrich_favorites():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    data = request.json or {}
    ids = data.get('ids', [])
    if not isinstance(ids, list):
        return jsonify({'ok': False, 'error': 'Invalid IDs list'}), 400
    
    # We construct minimal optimized objects to pass to enrich_favorites_with_post_data
    optimized_list = [{'id': fid} for fid in ids]
    enriched = enrich_favorites_with_post_data(optimized_list)
    return jsonify({'ok': True, 'posts': enriched})

@app.route('/api/add-post-by-id', methods=['POST', 'OPTIONS'])
def api_add_post_by_id():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    data = request.json or {}
    post_id = data.get('postId')
    if not post_id:
        return jsonify({'ok': False, 'error': 'Укажите ID поста'}), 400
    
    pid = re.sub(r'\D', '', str(post_id))
    if not pid:
        return jsonify({'ok': False, 'error': 'Неверный ID поста'}), 400

    try:
        url = f"https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&id={pid}&json=1&fields=tag_info"
        resp = session.get(url, headers={'User-Agent': REAL_USER_AGENT}, timeout=15)
        if resp.status_code == 200:
            text = resp.text
            if text and text.strip().startswith('['):
                posts = json.loads(text)
                if isinstance(posts, list) and len(posts) > 0 and posts[0]:
                    post = posts[0]
                    favorites = load_my_favorites()
                    pid_str = str(pid)
                    now_ts = int(time.time() * 1000)
                    
                    existing_idx = None
                    for i, f in enumerate(favorites):
                        if str(f.get('id')) == pid_str:
                            existing_idx = i
                            break
                    
                    if existing_idx is not None:
                        favorites[existing_idx]['is_deleted'] = 0
                        favorites[existing_idx]['change'] = now_ts
                    else:
                        favorites.insert(0, {'id': pid_str, 'change': now_ts, 'is_deleted': 0})
                        
                    save_my_favorites_optimized(favorites)
                    save_turso_favorites(favorites)
                    
                    active_count = len([f for f in favorites if f.get('is_deleted', 0) == 0])
                    return jsonify({'ok': True, 'post': post, 'totalFavorites': active_count})
        return jsonify({'ok': False, 'error': 'Пост с таким ID не найден на Rule34'}), 404
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/puzzle-completed', methods=['GET', 'POST', 'OPTIONS'])
def api_puzzle_completed():
    try:
        if request.method == 'OPTIONS':
            return jsonify({'ok': True})
        if request.method == 'GET':
            # Merge Turso and local data
            turso_puzzles = get_turso_puzzles()
            local_puzzles = load_puzzle_completed()
            
            print(f'[Puzzles Sync] GET puzzles: Turso={len(turso_puzzles) if turso_puzzles else 0}, Local={len(local_puzzles)}')
            
            # Merge optimized format puzzles
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
                        except:
                            pass
                
                merged_puzzles = list(merged_map.values())
                optimized_puzzles = optimize_puzzles(merged_puzzles)
                
                # Save merged data in optimized format to local file and Turso
                save_puzzle_completed_optimized(optimized_puzzles)
                save_turso_puzzles(optimized_puzzles)
                
                enriched_puzzles = enrich_puzzles_with_post_data(optimized_puzzles)
                return jsonify({'ok': True, 'puzzles': enriched_puzzles})
            elif turso_puzzles:
                optimized_puzzles = optimize_puzzles(turso_puzzles)
                save_puzzle_completed_optimized(optimized_puzzles)
                enriched_puzzles = enrich_puzzles_with_post_data(optimized_puzzles)
                return jsonify({'ok': True, 'puzzles': enriched_puzzles})
            else:
                optimized_puzzles = optimize_puzzles(local_puzzles)
                enriched_puzzles = enrich_puzzles_with_post_data(optimized_puzzles)
                return jsonify({'ok': True, 'puzzles': enriched_puzzles})
        else:
            data = request.json or {}
            puzzles = data.get('puzzles')
            if not isinstance(puzzles, list):
                return jsonify({'ok': False, 'error': 'Invalid puzzles format'}), 400
            
            # Convert to optimized format before saving
            optimized_puzzles = optimize_puzzles(puzzles)
            
            # Save in optimized format
            save_puzzle_completed_optimized(optimized_puzzles)
            # Sync to Turso as well if available
            try:
                save_turso_puzzles(optimized_puzzles)
            except:
                pass
            return jsonify({'ok': True})
    except Exception as e:
        print(f"Error in api_puzzle_completed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'ok': False, 'error': str(e)}), 500





@app.route('/safe_screen/<path:filename>')
def serve_safe_screen_file(filename):
    return send_from_directory(SAFE_SCREEN_DIR, filename)

@app.route('/api/safe-screen/files', methods=['GET', 'OPTIONS'])
def api_safe_screen_files():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        os.makedirs(SAFE_SCREEN_DIR, exist_ok=True)
        valid_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.mp4', '.webm', '.mov', '.ogg', '.m4v'}
        files = []
        for f in os.listdir(SAFE_SCREEN_DIR):
            if f.startswith('.'):
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in valid_exts:
                files.append({
                    'filename': f,
                    'url': f'/safe_screen/{f}',
                    'type': 'video' if ext in {'.mp4', '.webm', '.mov', '.ogg', '.m4v'} else 'image'
                })
        return jsonify({'ok': True, 'files': files, 'count': len(files)})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e), 'files': [], 'count': 0}), 500

@app.route('/api/safe-screen/upload', methods=['POST', 'OPTIONS'])
def api_safe_screen_upload():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        os.makedirs(SAFE_SCREEN_DIR, exist_ok=True)
        if 'file' not in request.files:
            return jsonify({'ok': False, 'error': 'Файл не выбран'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'ok': False, 'error': 'Файл не выбран'}), 400
        
        filename = secure_filename(file.filename)
        if not filename:
            filename = f"upload_{int(time.time())}"
        filepath = os.path.join(SAFE_SCREEN_DIR, filename)
        file.save(filepath)
        
        ext = os.path.splitext(filename)[1].lower()
        file_type = 'video' if ext in {'.mp4', '.webm', '.mov', '.ogg', '.m4v'} else 'image'
        return jsonify({
            'ok': True, 
            'file': {
                'filename': filename,
                'url': f'/safe_screen/{filename}',
                'type': file_type
            }
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/safe-screen/delete', methods=['POST', 'DELETE', 'OPTIONS'])
def api_safe_screen_delete():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        filename = data.get('filename') or request.args.get('filename')
        if not filename:
            return jsonify({'ok': False, 'error': 'Filename is required'}), 400
        
        clean_filename = os.path.basename(filename)
        filepath = os.path.join(SAFE_SCREEN_DIR, clean_filename)
        if os.path.exists(filepath) and os.path.isfile(filepath):
            os.remove(filepath)
            return jsonify({'ok': True, 'filename': clean_filename})
        else:
            return jsonify({'ok': False, 'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

# ==============================================================================
# ROOM SIGNALING & MULTIPLAYER RELAY HUB
# ==============================================================================
import threading
import queue

ROOM_LOCK = threading.Lock()
ACTIVE_ROOMS = {}

def cleanup_stale_rooms():
    now = time.time()
    stale_ids = []
    for r_id, r in ACTIVE_ROOMS.items():
        # Remove room if inactive for > 2 hours or if empty for > 3 minutes
        if now - r.get('last_active', 0) > 7200:
            stale_ids.append(r_id)
        elif len(r.get('players', {})) == 0 and (now - r.get('last_active', 0) > 180):
            stale_ids.append(r_id)
    for s_id in stale_ids:
        ACTIVE_ROOMS.pop(s_id, None)

@app.route('/api/room/create', methods=['POST', 'OPTIONS'])
def api_room_create():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        room_id = str(data.get('roomId', '')).strip().upper()
        player_id = str(data.get('playerId') or data.get('hostId') or '').strip()
        player_name = data.get('playerName') or data.get('hostName') or 'Игрок'
        room_data = data.get('roomData')
        game_type = data.get('gameType', 'generic')
        
        if not room_id or not player_id:
            return jsonify({'ok': False, 'error': 'roomId and playerId are required'}), 400
            
        with ROOM_LOCK:
            cleanup_stale_rooms()
            p_queue = queue.Queue(maxsize=500)
            ACTIVE_ROOMS[room_id] = {
                'id': room_id,
                'host_id': player_id,
                'game_type': game_type,
                'created_at': time.time(),
                'last_active': time.time(),
                'players': {
                    player_id: {
                        'id': player_id,
                        'name': player_name,
                        'is_host': True,
                        'last_seen': time.time()
                    }
                },
                'queues': {
                    player_id: p_queue
                },
                'room_data': room_data
            }
        return jsonify({'ok': True, 'roomId': room_id})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/room/join', methods=['POST', 'OPTIONS'])
def api_room_join():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        room_id = str(data.get('roomId', '')).strip().upper()
        player_id = str(data.get('playerId', '')).strip()
        player_name = data.get('playerName', 'Игрок')
        player_info = data.get('playerInfo', {})
        
        if not room_id or not player_id:
            return jsonify({'ok': False, 'error': 'roomId and playerId are required'}), 400
            
        with ROOM_LOCK:
            cleanup_stale_rooms()
            if room_id not in ACTIVE_ROOMS:
                return jsonify({'ok': False, 'error': 'room_not_found', 'message': 'Комната не найдена!'}), 404
            
            room = ACTIVE_ROOMS[room_id]
            room['last_active'] = time.time()
            if player_id not in room['queues']:
                room['queues'][player_id] = queue.Queue(maxsize=500)
            
            room['players'][player_id] = {
                'id': player_id,
                'name': player_name,
                'is_host': (player_id == room['host_id']),
                'last_seen': time.time(),
                'info': player_info
            }
            
            # Send join packet to host queue if this is a new participant
            if player_id != room['host_id'] and room['host_id'] in room['queues']:
                host_q = room['queues'][room['host_id']]
                join_msg = {
                    'type': 'JOIN',
                    'playerId': player_id,
                    'player': {
                        'id': player_id,
                        'name': player_name,
                        'isHost': False,
                        **player_info
                    }
                }
                try:
                    if host_q.full():
                        host_q.get_nowait()
                    host_q.put_nowait(join_msg)
                except Exception:
                    pass
            
            return jsonify({
                'ok': True,
                'roomId': room_id,
                'hostId': room['host_id'],
                'players': room['players'],
                'roomData': room.get('room_data')
            })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/room/signal', methods=['POST', 'OPTIONS'])
def api_room_signal():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        room_id = str(data.get('roomId', '')).strip().upper()
        sender_id = str(data.get('senderId', '')).strip()
        target_id = data.get('targetId')
        if target_id is not None:
            target_id = str(target_id).strip()
        packet = data.get('packet', {})
        
        if not room_id or not sender_id:
            return jsonify({'ok': False, 'error': 'roomId and senderId are required'}), 400
            
        with ROOM_LOCK:
            if room_id not in ACTIVE_ROOMS:
                return jsonify({'ok': False, 'error': 'room_not_found'}), 404
            
            room = ACTIVE_ROOMS[room_id]
            room['last_active'] = time.time()
            if sender_id in room['players']:
                room['players'][sender_id]['last_seen'] = time.time()
                
            # Cache room state if present
            if isinstance(packet, dict):
                p_type = packet.get('type')
                if p_type in ('ROOM_STATE', 'ROOM_DATA'):
                    r_data = packet.get('roomData') or packet.get('data')
                    if r_data:
                        room['room_data'] = r_data
            
            # Message targeting
            if target_id and target_id not in ('all', 'broadcast', ''):
                if target_id in room['queues']:
                    q = room['queues'][target_id]
                    try:
                        if q.full():
                            q.get_nowait()
                        q.put_nowait(packet)
                    except Exception:
                        pass
            else:
                # Broadcast to everyone EXCEPT sender
                for p_id, q in room['queues'].items():
                    if p_id != sender_id:
                        try:
                            if q.full():
                                q.get_nowait()
                            q.put_nowait(packet)
                        except Exception:
                            pass
                            
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/room/events', methods=['GET'])
def api_room_events():
    room_id = request.args.get('roomId', '').strip().upper()
    player_id = request.args.get('playerId', '').strip()
    
    if not room_id or not player_id:
        return jsonify({'ok': False, 'error': 'roomId and playerId required'}), 400
        
    with ROOM_LOCK:
        if room_id not in ACTIVE_ROOMS:
            return jsonify({'ok': False, 'error': 'room_not_found'}), 404
        room = ACTIVE_ROOMS[room_id]
        if player_id not in room['queues']:
            room['queues'][player_id] = queue.Queue(maxsize=500)
        player_queue = room['queues'][player_id]

    def event_stream():
        yield f"data: {json.dumps({'type': 'CONNECTED', 'playerId': player_id, 'roomId': room_id})}\n\n"
        last_keepalive = time.time()
        while True:
            try:
                msg = player_queue.get(timeout=1.0)
                yield f"data: {json.dumps(msg)}\n\n"
            except queue.Empty:
                if time.time() - last_keepalive > 10:
                    last_keepalive = time.time()
                    yield ": keepalive\n\n"
                with ROOM_LOCK:
                    if room_id not in ACTIVE_ROOMS:
                        yield f"data: {json.dumps({'type': 'ROOM_CLOSED', 'message': 'Комната закрыта'})}\n\n"
                        break

    return Response(
        stream_with_context(event_stream()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )

@app.route('/api/room/poll', methods=['POST', 'OPTIONS'])
def api_room_poll():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        room_id = str(data.get('roomId', '')).strip().upper()
        player_id = str(data.get('playerId', '')).strip()
        
        if not room_id or not player_id:
            return jsonify({'ok': False, 'error': 'roomId and playerId required'}), 400
            
        messages = []
        with ROOM_LOCK:
            if room_id in ACTIVE_ROOMS:
                room = ACTIVE_ROOMS[room_id]
                room['last_active'] = time.time()
                if player_id in room['queues']:
                    q = room['queues'][player_id]
                    while not q.empty() and len(messages) < 100:
                        try:
                            messages.append(q.get_nowait())
                        except Exception:
                            break
            else:
                return jsonify({'ok': False, 'error': 'room_not_found'}), 404
                
        return jsonify({'ok': True, 'messages': messages})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/room/leave', methods=['POST', 'OPTIONS'])
def api_room_leave():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        room_id = str(data.get('roomId', '')).strip().upper()
        player_id = str(data.get('playerId', '')).strip()
        
        with ROOM_LOCK:
            if room_id in ACTIVE_ROOMS:
                room = ACTIVE_ROOMS[room_id]
                is_host = (room.get('hostId') == player_id)
                room['players'].pop(player_id, None)
                room['queues'].pop(player_id, None)
                
                if is_host:
                    # Broadcast ROOM_CLOSED packet to all remaining participants
                    close_packet = {'type': 'ROOM_CLOSED', 'playerId': player_id, 'message': 'Хост закрыл комнату'}
                    for p_id, q in list(room['queues'].items()):
                        try:
                            q.put_nowait(close_packet)
                        except Exception:
                            pass
                    ACTIVE_ROOMS.pop(room_id, None)
                else:
                    # Broadcast LEAVE packet to remaining participants
                    leave_packet = {'type': 'LEAVE', 'playerId': player_id}
                    for p_id, q in list(room['queues'].items()):
                        try:
                            q.put_nowait(leave_packet)
                        except Exception:
                            pass
                    if len(room['players']) == 0:
                        ACTIVE_ROOMS.pop(room_id, None)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/api/room/ice_servers', methods=['GET', 'OPTIONS'])
def api_room_ice_servers():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    # Provide robust public STUN and open TURN servers
    servers = [
        {'urls': 'stun:stun.l.google.com:19302'},
        {'urls': 'stun:stun1.l.google.com:19302'},
        {'urls': 'stun:stun2.l.google.com:19302'},
        {'urls': 'stun:stun3.l.google.com:19302'},
        {'urls': 'stun:stun4.l.google.com:19302'},
        {'urls': 'stun:stun.cloudflare.com:3478'},
        {'urls': 'stun:stun.services.mozilla.com'},
        {'urls': 'stun:stun.sipgate.net:3478'},
        {'urls': 'stun:stun.nextcloud.com:443'}
    ]
    return jsonify({'ok': True, 'iceServers': servers})

@app.errorhandler(404)
def page_not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'error': 'not_found'}), 404
    return redirect('/')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Rule34 Gallery Standalone Flask Server')
    parser.add_argument('--port', '-p', type=int, default=PORT, help='Port to run server on')
    parser.add_argument('--host', '-H', type=str, default=HOST, help='Host to bind to')
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
            if turso_favorites and local_favorites:
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
                    # Enrich with fresh post data before saving to Turso
                    enriched_favorites = enrich_favorites_with_post_data(merged_favorites)
                    save_turso_favorites(enriched_favorites)
            elif not turso_favorites and local_favorites:
                print(f'Uploading {len(local_favorites)} local favorites to Turso...')
                # Enrich with fresh post data before saving to Turso
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
                        except:
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

    print(f"Server Rule34 Gallery started at http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port)
