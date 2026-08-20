import os
import json
import time
import re
import base64
import queue
import threading
import functools
import requests
from urllib.parse import urlparse
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from Crypto.Random import get_random_bytes

# Import turso_handler
from handlers import turso_handler

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

# Issue 3: Compatible file paths
API_KEY_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'api_credentials.json')
API_KEY_ENCRYPTION_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', '.api_key.key')
MY_FAVORITES_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'my_favorites.json')
EXCLUDED_TAGS_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'excluded_tags.json')
SETTINGS_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'settings.json')
PUZZLE_COMPLETED_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'puzzle_completed.json')
TURSO_CONFIG_FILE = os.path.join(BASE_DIR, 'R34', '.secrets', 'turso_config.json')

# How many days a tombstoned favorite (is_deleted=1) stays around before being
# permanently purged (physically removed from both my_favorites.json and the
# Turso 'favorites' table), instead of lingering forever as a hidden row.
FAVORITES_PURGE_DAYS = 20
SAFE_SCREEN_DIR = os.path.join(BASE_DIR, 'safe_screen')
os.makedirs(SAFE_SCREEN_DIR, exist_ok=True)

# Locks
CACHE_LOCK = threading.RLock()
FILE_LOCK = threading.RLock()
ROOM_LOCK = threading.Lock()

# In-memory caches for performance
validated_keys_cache = {}  # key -> (is_valid, timestamp)
VALIDATION_CACHE_TTL = 3600  # 1 hour TTL

favorite_cache = {}  # key -> (is_fav, timestamp)
FAVORITE_CACHE_TTL = 30  # 30 seconds TTL

# Multiplayer rooms state
ACTIVE_ROOMS = {}

# Requests Session
session = requests.Session()
adapter = HTTPAdapter(
    max_retries=Retry(total=3, connect=3, backoff_factor=0.1),
    pool_connections=20,
    pool_maxsize=50
)
session.mount('https://', adapter)
session.mount('http://', adapter)

def with_file_lock(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with FILE_LOCK:
            return func(*args, **kwargs)
    return wrapper

def is_allowed_origin(origin):
    if not origin:
        return False
    parsed = urlparse(origin)
    host = (parsed.hostname or '').lower()
    if not host:
        return False
    # NOTE: these used to be `host.endswith('google.com')` and `'aistudio' in host`,
    # which match on a bare substring/missing-dot basis — `evil-google.com` passes
    # `endswith('google.com')`, and `notaistudio.example.com` (or anything with
    # "aistudio" anywhere in it) passes `'aistudio' in host`. Since CORS here also
    # allows credentials, a host that slips through this check can make authenticated
    # requests to this server's /api/* endpoints (Turso settings, favorites, etc.)
    # on the user's behalf. Checking for an exact host or a proper `.suffix` (with the
    # separating dot) closes that off without changing which real Google/AI-Studio
    # origins are allowed.
    return (host in {'localhost', '127.0.0.1'} or
            host.endswith('.localhost') or
            host.endswith('.run.app') or
            host == 'google.com' or host.endswith('.google.com') or
            host == 'aistudio.google.com' or host.endswith('.aistudio.google.com'))

def is_allowed_target_url(target_url):
    try:
        parsed = urlparse(target_url)
    except Exception:
        return False
    if parsed.scheme not in {'http', 'https'}:
        return False
    host = (parsed.hostname or '').lower()
    return host in {'rule34.xxx', 'www.rule34.xxx', 'api.rule34.xxx'} or host.endswith('.rule34.xxx')

def set_validated_key(cache_key, is_valid):
    with CACHE_LOCK:
        if len(validated_keys_cache) >= 500:
            try:
                oldest = next(iter(validated_keys_cache))
                validated_keys_cache.pop(oldest, None)
            except Exception:
                pass
        validated_keys_cache[cache_key] = (is_valid, time.time())

def set_favorite_cache(cache_key, is_fav):
    with CACHE_LOCK:
        if len(favorite_cache) >= 1000:
            try:
                oldest = next(iter(favorite_cache))
                favorite_cache.pop(oldest, None)
            except Exception:
                pass
        favorite_cache[cache_key] = (is_fav, time.time())

def invalidate_caches():
    with CACHE_LOCK:
        favorite_cache.clear()

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

@with_file_lock
def get_saved_api_key():
    if os.path.exists(API_KEY_FILE):
        try:
            with open(API_KEY_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            if not content:
                return None, None
            
            try:
                creds_data = json.loads(content)
                if isinstance(creds_data, dict) and 'user_id' in creds_data and 'encrypted_api_key' in creds_data:
                    user_id = creds_data['user_id']
                    encrypted_api_key = creds_data['encrypted_api_key']
                    
                    key = get_encryption_key()
                    encrypted_data = base64.b64decode(encrypted_api_key)
                    iv = encrypted_data[:16]
                    actual_encrypted = encrypted_data[16:]
                    cipher = AES.new(key, AES.MODE_CBC, iv)
                    decrypted_data = unpad(cipher.decrypt(actual_encrypted), AES.block_size)
                    api_key = decrypted_data.decode('utf-8')
                    
                    return user_id, api_key
            except json.JSONDecodeError:
                try:
                    key = get_encryption_key()
                    encrypted_data = base64.b64decode(content)
                    iv = encrypted_data[:16]
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

@with_file_lock
def save_api_creds(user_id, api_key):
    try:
        os.makedirs(os.path.dirname(API_KEY_FILE), exist_ok=True)
        
        key = get_encryption_key()
        iv = get_random_bytes(16)
        cipher = AES.new(key, AES.MODE_CBC, iv)
        api_key_bytes = api_key.encode('utf-8')
        padded_data = pad(api_key_bytes, AES.block_size)
        encrypted_data = cipher.encrypt(padded_data)
        combined = iv + encrypted_data
        encrypted_api_key = base64.b64encode(combined).decode('utf-8')
        
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

@with_file_lock
def clear_creds():
    with CACHE_LOCK:
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
        
    if not user_id.isdigit():
        return False

    cache_key = f"{user_id}:{api_key}"
    now = time.time()
    with CACHE_LOCK:
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
        
        if resp.status_code in (401, 403):
            set_validated_key(cache_key, False)
            return False
            
        text = resp.text or ""
        if "Missing authentication" in text or "Unauthorized" in text:
            set_validated_key(cache_key, False)
            return False
            
        if resp.status_code == 200:
            stripped = text.strip()
            if stripped.startswith('[') or stripped.startswith('<'):
                set_validated_key(cache_key, True)
                return True
                
        print(f"Validation failed for {user_id} with status {resp.status_code}")
        set_validated_key(cache_key, False)
        return False
    except Exception as e:
        print('API key check error:', e)
        return False

def purge_old_deleted_favorites(favorites, days=FAVORITES_PURGE_DAYS):
    """Physically drop tombstoned favorites (is_deleted=1) whose 'change'
    timestamp is older than `days` days — this is the actual permanent-delete
    step of the mark-then-purge lifecycle: is_deleted=1 stops a favorite from
    being shown/re-added, and after this many days it's dropped from the list
    entirely instead of lingering forever. Only ever touches records already
    marked is_deleted=1 — an active favorite is never removed here regardless
    of how old it is. Returns (kept_list, changed_bool)."""
    if not favorites:
        return favorites, False
    cutoff = int(time.time() * 1000) - days * 24 * 60 * 60 * 1000
    kept = [
        f for f in favorites
        if not (isinstance(f, dict) and f.get('is_deleted', 0) == 1 and f.get('change', 0) < cutoff)
    ]
    return kept, len(kept) != len(favorites)

@with_file_lock
def load_my_favorites():
    try:
        if os.path.exists(MY_FAVORITES_FILE):
            with open(MY_FAVORITES_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, list):
                        # Detect "old" (pre-optimized) format by the presence of full post-data
                        # fields (tags/file_url/etc). NOTE: this used to be `len(data[0]) <= 2`,
                        # which broke the moment `is_deleted` became a normal 3rd field on every
                        # entry — every already-optimized favorite (id, change, is_deleted) was
                        # misdetected as "old format" and silently stripped of is_deleted on
                        # every single load (see convert_favorites_to_optimized below), which is
                        # why removed favorites kept coming back. Checking for the real markers
                        # of the old raw-post format is what actually distinguishes the formats.
                        OLD_FORMAT_MARKER_KEYS = ('tags', 'file_url', 'sample_url', 'preview_url', 'score', 'rating')
                        looks_old = bool(data) and isinstance(data[0], dict) and any(k in data[0] for k in OLD_FORMAT_MARKER_KEYS)
                        if data and isinstance(data[0], dict) and 'id' in data[0] and not looks_old:
                            purged, changed = purge_old_deleted_favorites(data)
                            if changed:
                                print(f'[Favorites Purge] Removed {len(data) - len(purged)} tombstoned favorite(s) older than {FAVORITES_PURGE_DAYS} days (local)')
                                save_my_favorites_optimized(purged)
                            return purged
                        print('Converting old favorites format to new optimized format...')
                        converted = convert_favorites_to_optimized(data)
                        purged, changed = purge_old_deleted_favorites(converted)
                        if changed:
                            print(f'[Favorites Purge] Removed {len(converted) - len(purged)} tombstoned favorite(s) older than {FAVORITES_PURGE_DAYS} days (local)')
                            save_my_favorites_optimized(purged)
                        return purged
        else:
            dir_path = os.path.dirname(MY_FAVORITES_FILE)
            if dir_path:
                os.makedirs(dir_path, exist_ok=True)
            with open(MY_FAVORITES_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error loading my_favorites.json:', e)
    return []

@with_file_lock
def convert_favorites_to_optimized(old_favorites):
    optimized = []
    for fav in old_favorites:
        if isinstance(fav, dict):
            fav_id = fav.get('id')
            if fav_id:
                # Preserve is_deleted if it's already present on the entry — this function is
                # meant for genuinely old raw-post-data records that never had it, but defensively
                # carrying it over (instead of dropping it) means a false "old format" detection
                # can no longer silently un-delete a tombstoned favorite.
                optimized.append({
                    'id': fav_id,
                    'change': fav.get('change', 0),
                    'is_deleted': fav.get('is_deleted', 0)
                })
    save_my_favorites_optimized(optimized)
    return optimized

@with_file_lock
def save_my_favorites_optimized(favorites):
    try:
        os.makedirs(os.path.dirname(MY_FAVORITES_FILE), exist_ok=True)
        with open(MY_FAVORITES_FILE, 'w', encoding='utf-8') as f:
            json.dump(favorites, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving my_favorites.json:', e)

def are_favorites_equal(list_a, list_b):
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
                enriched.append({
                    'id': fav_id,
                    'change': fav.get('change', 0),
                    'is_deleted': fav.get('is_deleted', 0),
                    'api_failed': True
                })
        else:
            enriched.append(fav)
    return enriched

@with_file_lock
def load_excluded_tags():
    try:
        if os.path.exists(EXCLUDED_TAGS_FILE):
            with open(EXCLUDED_TAGS_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, list):
                        return data
    except Exception as e:
        print('Error loading excluded_tags.json:', e)
    return []

@with_file_lock
def save_excluded_tags(tags):
    try:
        os.makedirs(os.path.dirname(EXCLUDED_TAGS_FILE), exist_ok=True)
        with open(EXCLUDED_TAGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(tags, f, ensure_ascii=False, indent=2)
        print(f'[Storage] Saved {len(tags)} excluded tags to {EXCLUDED_TAGS_FILE}')
    except Exception as e:
        print('Error saving excluded_tags.json:', e)

@with_file_lock
def load_turso_config():
    try:
        if os.path.exists(TURSO_CONFIG_FILE):
            with open(TURSO_CONFIG_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
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

@with_file_lock
def save_turso_config(config):
    try:
        os.makedirs(os.path.dirname(TURSO_CONFIG_FILE), exist_ok=True)
        if 'turso_token' in config and config['turso_token']:
            key = get_encryption_key()
            iv = get_random_bytes(16)
            cipher = AES.new(key, AES.MODE_CBC, iv)
            token_bytes = config['turso_token'].encode('utf-8')
            padded_data = pad(token_bytes, AES.block_size)
            encrypted_data = cipher.encrypt(padded_data)
            combined = iv + encrypted_data
            encrypted_token = base64.b64encode(combined).decode('utf-8')
            
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

@with_file_lock
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

@with_file_lock
def save_settings(settings):
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(sanitize_settings(settings), f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving settings.json:', e)

@with_file_lock
def load_puzzle_completed():
    try:
        if os.path.exists(PUZZLE_COMPLETED_FILE):
            with open(PUZZLE_COMPLETED_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, list):
                        if data and isinstance(data[0], dict) and 'postId' in data[0]:
                            return data
                        print('Converting old puzzle format to new optimized format...')
                        return convert_puzzles_to_optimized(data)
        else:
            os.makedirs(os.path.dirname(PUZZLE_COMPLETED_FILE), exist_ok=True)
            with open(PUZZLE_COMPLETED_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error loading puzzle_completed.json:', e)
    return []

def optimize_puzzles(puzzles):
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

@with_file_lock
def convert_puzzles_to_optimized(old_puzzles):
    optimized = optimize_puzzles(old_puzzles)
    save_puzzle_completed_optimized(optimized)
    return optimized

@with_file_lock
def save_puzzle_completed_optimized(puzzles):
    try:
        optimized = optimize_puzzles(puzzles)
        os.makedirs(os.path.dirname(PUZZLE_COMPLETED_FILE), exist_ok=True)
        with open(PUZZLE_COMPLETED_FILE, 'w', encoding='utf-8') as f:
            json.dump(optimized, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('Error saving puzzle_completed.json:', e)

def fetch_post_data(post_id):
    try:
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
    enriched = []
    for puzzle in optimized_puzzles:
        if isinstance(puzzle, dict):
            post_id = puzzle.get('postId') or puzzle.get('id') or (puzzle.get('post', {}).get('id') if isinstance(puzzle.get('post'), dict) else None)
            if not post_id:
                continue

            image_url = puzzle.get('imageUrl') or puzzle.get('thumbnail')
            post_obj = puzzle.get('post') or {}
            if not image_url and isinstance(post_obj, dict):
                image_url = post_obj.get('sample_url') or post_obj.get('file_url') or post_obj.get('preview_url')
            
            width = puzzle.get('width') or (post_obj.get('width') if isinstance(post_obj, dict) else None)
            height = puzzle.get('height') or (post_obj.get('height') if isinstance(post_obj, dict) else None)

            if not image_url and post_id:
                post_data = fetch_post_data(post_id)
                if post_data:
                    image_url = post_data.get('sample_url') or post_data.get('file_url') or post_data.get('preview_url') or ""
                    width = post_data.get('width') or 1000
                    height = post_data.get('height') or 1000
                    puzzle['imageUrl'] = image_url
                    puzzle['width'] = width
                    puzzle['height'] = height

            image_url = image_url or ""
            width = width or 1000
            height = height or 1000

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
    with CACHE_LOCK:
        if cache_key in favorite_cache:
            is_fav, ts = favorite_cache[cache_key]
            if now - ts < FAVORITE_CACHE_TTL:
                return is_fav

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

def get_turso_settings():
    return turso_handler.get_turso_settings(load_settings, load_turso_config)

def execute_turso_query(sql, params=None):
    return turso_handler.execute_turso_query(sql, params, session, load_settings, load_turso_config)

def initialize_turso_tables():
    return turso_handler.initialize_turso_tables(session, load_settings, load_turso_config)

def get_turso_favorites():
    return turso_handler.get_turso_favorites(session, load_settings, load_turso_config, purge_days=FAVORITES_PURGE_DAYS)

def save_turso_favorites(favorites):
    return turso_handler.save_turso_favorites(favorites, session, load_settings, load_turso_config)

def get_turso_puzzles():
    return turso_handler.get_turso_puzzles(session, load_settings, load_turso_config)

def save_turso_puzzles(puzzles):
    return turso_handler.save_turso_puzzles(puzzles, session, load_settings, load_turso_config)

# NOTE: this function does NOT acquire ROOM_LOCK itself. Every current caller
# (api_room_create, api_room_join in room_routes.py) already holds ROOM_LOCK
# when calling this, and ROOM_LOCK is a plain threading.Lock() (non-reentrant),
# so acquiring it again here would deadlock the calling thread forever.
# If you add a new caller, make sure it already holds ROOM_LOCK before calling
# this, or acquire the lock at that call site instead of inside this function.
def cleanup_stale_rooms():
    now = time.time()
    stale_ids = []
    for r_id, r in ACTIVE_ROOMS.items():
        if now - r.get('last_active', 0) > 7200:
            stale_ids.append(r_id)
        elif len(r.get('players', {})) == 0 and (now - r.get('last_active', 0) > 180):
            stale_ids.append(r_id)
    for s_id in stale_ids:
        ACTIVE_ROOMS.pop(s_id, None)
