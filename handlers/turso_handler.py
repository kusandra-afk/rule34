import json
import time
import os

def get_turso_settings(load_settings_func=None, load_turso_config_func=None):
    """Load Turso settings from turso_config.json"""
    try:
        url = ''
        token = ''
        enabled = False
        
        # Load URL and token from turso_config.json using the provided function (which handles decryption)
        if load_turso_config_func:
            config = load_turso_config_func()
            url = config.get('turso_url', '')
            token = config.get('turso_token', '')
            print(f'[DEBUG] Loaded Turso config - URL: {url[:50]}... Token: {"***" if token else "EMPTY"}')
        else:
            # Fallback: direct file read (without decryption - for backward compatibility)
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            turso_config_file = os.path.join(base_dir, 'R34', '.secrets', 'turso_config.json')
            
            if os.path.exists(turso_config_file):
                with open(turso_config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    url = config.get('turso_url', '')
                    token = config.get('turso_token', '')
        
        # Load enabled setting from settings.json
        if load_settings_func:
            settings = load_settings_func()
            enabled_setting = settings.get('r34_turso_sync_enabled', False) or settings.get('turso_sync_enabled', False)
            # Convert string 'true'/'false' to boolean
            if isinstance(enabled_setting, str):
                enabled = enabled_setting.lower() == 'true'
            else:
                enabled = bool(enabled_setting)
            # Also check for fallback URL/token in settings.json if not found in turso_config.json
            if not url:
                url = settings.get('r34_turso_url', '') or settings.get('turso_url', '')
            if not token:
                token = settings.get('r34_turso_token', '') or settings.get('turso_token', '')
        
        return url, token, enabled
    except Exception as e:
        print(f'Error loading Turso settings: {e}')
        return '', '', False

def execute_turso_query(sql, params=None, session=None, load_settings_func=None, load_turso_config_func=None):
    """Execute a query on Turso database"""
    url, token, enabled = get_turso_settings(load_settings_func, load_turso_config_func)
    if not enabled or not url or not token:
        return None
    
    try:
        # Convert libsql:// URL to https:// for HTTP API
        if url.startswith('libsql://'):
            url = url.replace('libsql://', 'https://')
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        body = {
            'statements': [{
                'q': sql,
                'params': params or []
            }]
        }
        response = session.post(url, headers=headers, json=body, timeout=10)
        if response.status_code == 200:
            return response.json()
        else:
            return None
    except Exception as e:
        return None

def initialize_turso_tables(session=None, load_settings_func=None, load_turso_config_func=None):
    """Initialize Turso tables if they don't exist"""
    url, token, enabled = get_turso_settings(load_settings_func, load_turso_config_func)
    if not enabled:
        return False
    
    # Create favorites table with is_deleted column
    execute_turso_query('''
        CREATE TABLE IF NOT EXISTS favorites (
            id TEXT PRIMARY KEY,
            change INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0
        )
    ''', session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func)
    
    # Try to add is_deleted column if table existed before without it
    try:
        execute_turso_query('ALTER TABLE favorites ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0', session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func)
    except Exception:
        pass
    
    # Create puzzles table
    execute_turso_query('''
        CREATE TABLE IF NOT EXISTS puzzles (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
    ''', session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func)
    
    return True

def get_turso_favorites(session=None, load_settings_func=None, load_turso_config_func=None, purge_days=None):
    """Get favorites from Turso (optimized format - only id, change, is_deleted)"""
    # Permanently purge tombstoned favorites (is_deleted=1) that are older than
    # `purge_days`. This runs directly against Turso every time favorites are
    # fetched from it, rather than depending on a background job — since the
    # local Flask server isn't always running, but every real sync (server
    # startup, every /api/my-favorites poll from the browser) does call this,
    # so the purge fires opportunistically whenever anything actually talks to
    # Turso. Best-effort: if the DELETE fails (e.g. Turso unreachable, or the
    # is_deleted column doesn't exist yet on an old table), we just skip it and
    # continue on to the normal SELECT below — this must never block reading
    # favorites.
    if purge_days:
        try:
            cutoff = int(time.time() * 1000) - purge_days * 24 * 60 * 60 * 1000
            execute_turso_query(
                'DELETE FROM favorites WHERE is_deleted = 1 AND change < ?',
                params=[cutoff],
                session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func
            )
        except Exception as e:
            print(f'[Turso Debug] Purge of old tombstoned favorites failed (non-fatal): {e}')

    result = execute_turso_query('SELECT id, change, is_deleted FROM favorites ORDER BY updated_at DESC', session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func)
    
    # Check for missing column error in result
    has_column_error = False
    err_msg = ""
    if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict) and 'error' in result[0]:
        has_column_error = True
        err_msg = result[0]['error']
    elif isinstance(result, dict) and 'error' in result:
        has_column_error = True
        err_msg = result['error']
        
    if has_column_error and 'is_deleted' in err_msg:
        print('[Turso Debug] is_deleted column is missing. Attempting self-healing ALTER TABLE...')
        try:
            execute_turso_query('ALTER TABLE favorites ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0', session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func)
        except Exception as alter_err:
            print(f'[Turso Debug] ALTER TABLE failed: {alter_err}')
        
        # Retry original query
        result = execute_turso_query('SELECT id, change, is_deleted FROM favorites ORDER BY updated_at DESC', session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func)

    if result:
        try:
            # Handle both dict and list response formats
            rows = None
            if isinstance(result, dict):
                if 'results' in result and isinstance(result['results'], dict) and 'rows' in result['results']:
                    rows = result['results']['rows']
            elif isinstance(result, list) and len(result) > 0:
                if isinstance(result[0], dict) and 'results' in result[0]:
                    res_obj = result[0]['results']
                    if isinstance(res_obj, dict) and 'rows' in res_obj:
                        rows = res_obj['rows']
            
            if rows is None:
                # If we still have an error (like no is_deleted even after alter), fallback to selecting just id, change
                print(f'[Turso Debug] query resulted in rows=None (or error). Result: {result}')
                print('[Turso Debug] Falling back to query without is_deleted column...')
                result_fallback = execute_turso_query('SELECT id, change FROM favorites ORDER BY updated_at DESC', session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func)
                
                rows = None
                if isinstance(result_fallback, dict):
                    if 'results' in result_fallback and isinstance(result_fallback['results'], dict) and 'rows' in result_fallback['results']:
                        rows = result_fallback['results']['rows']
                elif isinstance(result_fallback, list) and len(result_fallback) > 0:
                    if isinstance(result_fallback[0], dict) and 'results' in result_fallback[0]:
                        res_obj = result_fallback[0]['results']
                        if isinstance(res_obj, dict) and 'rows' in res_obj:
                            rows = res_obj['rows']
                
                if rows is None:
                    return None
            
            favorites = []
            for row in rows:
                try:
                    # Row format: [id, change, is_deleted] or [id, change]
                    fav_id = row[0]
                    change = row[1] if len(row) > 1 else 0
                    is_deleted = row[2] if len(row) > 2 else 0
                    favorites.append({
                        'id': fav_id,
                        'change': change,
                        'is_deleted': is_deleted
                    })
                except Exception as e:
                    pass
            return favorites
        except Exception as e:
            print(f'[Turso Debug] Error parsing favorites result: {e}')
            return None
    else:
        print('[Turso Debug] execute_turso_query returned None')
    return None

def save_turso_favorites(favorites, session=None, load_settings_func=None, load_turso_config_func=None):
    """Save favorites to Turso in optimized format (only id, change, is_deleted)"""
    url, token, enabled = get_turso_settings(load_settings_func, load_turso_config_func)
    if not enabled:
        print('Turso sync disabled, skipping favorites save')
        return False
    
    try:
        # Convert libsql:// URL to https:// for HTTP API
        if url.startswith('libsql://'):
            url = url.replace('libsql://', 'https://')
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        statements = []
        # Clear existing
        statements.append({'q': 'DELETE FROM favorites', 'params': []})
        
        # Insert new (optimized format - only id, change, is_deleted)
        now = int(time.time() * 1000)
        for fav in favorites:
            fav_id = str(fav.get('id', ''))
            change = fav.get('change', 0) if isinstance(fav, dict) else 0
            is_deleted = fav.get('is_deleted', 0) if isinstance(fav, dict) else 0
            statements.append({
                'q': 'INSERT INTO favorites (id, change, updated_at, is_deleted) VALUES (?, ?, ?, ?)',
                'params': [fav_id, change, now, is_deleted]
            })
        
        body = {
            'statements': statements
        }
        
        response = session.post(url, headers=headers, json=body, timeout=15)
        if response.status_code == 200:
            print(f'[Turso DB] Successfully batched and synced {len(favorites)} favorites (optimized format)')
            return True
        else:
            print(f'[Turso DB] Failed to save favorites batch. Status code: {response.status_code}')
            return False
    except Exception as e:
        print(f'[Turso DB] Error saving favorites to Turso: {e}')
        return False

def get_turso_puzzles(session=None, load_settings_func=None, load_turso_config_func=None):
    """Get puzzles from Turso"""
    result = execute_turso_query('SELECT data FROM puzzles ORDER BY updated_at DESC', session=session, load_settings_func=load_settings_func, load_turso_config_func=load_turso_config_func)
    if result:
        try:
            # Handle both dict and list response formats
            rows = None
            if isinstance(result, dict):
                if result.get('results') and result['results'].get('rows'):
                    rows = result['results']['rows']
            elif isinstance(result, list) and len(result) > 0:
                if isinstance(result[0], dict) and result[0].get('results'):
                    if isinstance(result[0]['results'], dict) and result[0]['results'].get('rows'):
                        rows = result[0]['results']['rows']
            
            if not rows:
                return None
            
            puzzles = []
            for row in rows:
                try:
                    data = json.loads(row[0])
                    puzzles.append(data)
                except Exception as e:
                    pass
            return puzzles
        except Exception as e:
            return None
    return None

def save_turso_puzzles(puzzles, session=None, load_settings_func=None, load_turso_config_func=None):
    """Save puzzles to Turso in an optimized single batch"""
    url, token, enabled = get_turso_settings(load_settings_func, load_turso_config_func)
    if not enabled:
        print('Turso sync disabled, skipping puzzles save')
        return False
    
    try:
        # Convert libsql:// URL to https:// for HTTP API
        if url.startswith('libsql://'):
            url = url.replace('libsql://', 'https://')
        
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        statements = []
        # Clear existing
        statements.append({'q': 'DELETE FROM puzzles', 'params': []})
        
        # Insert new
        now = int(time.time() * 1000)
        for puzzle in puzzles:
            data = json.dumps(puzzle, ensure_ascii=False)
            puzzle_id = str(puzzle.get('post', {}).get('id', puzzle.get('id', puzzle.get('postId', ''))))
            statements.append({
                'q': 'INSERT INTO puzzles (id, data, updated_at) VALUES (?, ?, ?)',
                'params': [puzzle_id, data, now]
            })
        
        body = {
            'statements': statements
        }
        
        response = session.post(url, headers=headers, json=body, timeout=15)
        if response.status_code == 200:
            print(f'[Turso DB] Successfully batched and synced {len(puzzles)} puzzles (all existing overwritten)')
            return True
        else:
            print(f'[Turso DB] Failed to save puzzles batch. Status code: {response.status_code}')
            return False
    except Exception as e:
        print(f'[Turso DB] Error saving puzzles to Turso: {e}')
        return False
