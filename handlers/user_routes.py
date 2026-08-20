import re
import time
import json
from flask import Blueprint, request, jsonify
from handlers.core_utils import (
    get_saved_api_key, load_my_favorites, get_turso_favorites, save_my_favorites_optimized,
    save_turso_favorites, are_favorites_equal, load_excluded_tags, save_excluded_tags,
    load_turso_config, save_turso_config, load_settings, save_settings, sanitize_settings,
    check_is_favorited, invalidate_caches, REAL_USER_AGENT, session, enrich_favorites_with_post_data,
    get_turso_puzzles, load_puzzle_completed, save_puzzle_completed_optimized, save_turso_puzzles,
    enrich_puzzles_with_post_data, optimize_puzzles
)

user_bp = Blueprint('user_bp', __name__)

@user_bp.route('/api/my-profile', methods=['GET', 'OPTIONS'])
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

@user_bp.route('/api/my-favorites', methods=['GET', 'POST', 'OPTIONS'])
def api_my_favorites_handler():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    if request.method == 'GET':
        turso_favorites = get_turso_favorites()
        local_favorites = load_my_favorites()
        
        print(f'[Favorites Sync] GET favorites: Turso={len(turso_favorites) if turso_favorites is not None else "Error"}, Local={len(local_favorites)}')
        
        if turso_favorites is not None:
            turso_fav_map = {str(f.get('id')): f for f in turso_favorites}
            local_fav_map = {str(f.get('id')): f for f in local_favorites}
            
            merged_favorites = list(turso_fav_map.values())
            for fid, local_fav in local_fav_map.items():
                if fid not in turso_fav_map:
                    merged_favorites.append(local_fav)
                else:
                    turso_change = turso_fav_map[fid].get('change', 0)
                    local_change = local_fav.get('change', 0)
                    if local_change > turso_change:
                        merged_favorites = [f for f in merged_favorites if str(f.get('id')) != fid]
                        merged_favorites.append(local_fav)
            
            need_save_local = not are_favorites_equal(merged_favorites, local_favorites)
            need_save_turso = not are_favorites_equal(merged_favorites, turso_favorites)
            
            if need_save_local:
                print(f'[Favorites Sync] Saving merged favorites ({len(merged_favorites)}) locally')
                save_my_favorites_optimized(merged_favorites)
            
            if need_save_turso:
                print(f'[Favorites Sync] Uploading merged favorites ({len(merged_favorites)}) to Turso')
                save_turso_favorites(merged_favorites)
                
            active_favorites = [f for f in merged_favorites if f.get('is_deleted', 0) == 0]
            return jsonify({'ok': True, 'favorites': active_favorites})
        else:
            active_favorites = [f for f in local_favorites if f.get('is_deleted', 0) == 0]
            return jsonify({'ok': True, 'favorites': active_favorites})
    else:
        data = request.json or {}
        post_id = data.get('postId')
        action = data.get('action')
        if not post_id or not action:
            return jsonify({'ok': False, 'error': 'Missing postId or action'}), 400

        favorites = load_my_favorites()
        pid_str = str(post_id)
        now_ts = int(time.time() * 1000)

        existing_idx = None
        for i, f in enumerate(favorites):
            if str(f.get('id')) == pid_str:
                existing_idx = i
                break

        if action == 'add':
            if existing_idx is not None:
                favorites[existing_idx]['is_deleted'] = 0
                favorites[existing_idx]['change'] = now_ts
            else:
                favorites.insert(0, {'id': pid_str, 'change': now_ts, 'is_deleted': 0})
        elif action == 'delete':
            if existing_idx is not None:
                favorites[existing_idx]['is_deleted'] = 1
                favorites[existing_idx]['change'] = now_ts
            else:
                favorites.insert(0, {'id': pid_str, 'change': now_ts, 'is_deleted': 1})

        save_my_favorites_optimized(favorites)
        save_turso_favorites(favorites)
        
        active_count = len([f for f in favorites if f.get('is_deleted', 0) == 0])
        return jsonify({'ok': True, 'favoritesCount': active_count})

@user_bp.route('/api/excluded-tags', methods=['GET', 'POST', 'OPTIONS'])
def api_excluded_tags_handler():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    if request.method == 'GET':
        tags = load_excluded_tags()
        return jsonify({'ok': True, 'tags': tags})
    else:
        data = request.json or {}
        tags = data.get('tags')
        print(f'[API] POST /api/excluded-tags: received {len(tags) if isinstance(tags, list) else "not a list"} tags')
        if not isinstance(tags, list):
            return jsonify({'ok': False, 'error': 'Invalid tags format'}), 400
        save_excluded_tags(tags)
        return jsonify({'ok': True, 'tags': tags})

@user_bp.route('/api/turso-config', methods=['GET', 'POST', 'OPTIONS'])
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

@user_bp.route('/api/settings', methods=['GET', 'POST', 'OPTIONS'])
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

@user_bp.route('/api/favorite', methods=['POST', 'OPTIONS'])
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

@user_bp.route('/api/favorites', methods=['GET', 'OPTIONS'])
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

@user_bp.route('/api/enrich-favorites', methods=['POST', 'OPTIONS'])
def api_enrich_favorites():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    data = request.json or {}
    ids = data.get('ids', [])
    if not isinstance(ids, list):
        return jsonify({'ok': False, 'error': 'Invalid IDs list'}), 400
    
    optimized_list = [{'id': fid} for fid in ids]
    enriched = enrich_favorites_with_post_data(optimized_list)
    return jsonify({'ok': True, 'posts': enriched})

@user_bp.route('/api/add-post-by-id', methods=['POST', 'OPTIONS'])
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

@user_bp.route('/api/puzzle-completed', methods=['GET', 'POST', 'OPTIONS'])
def api_puzzle_completed():
    try:
        if request.method == 'OPTIONS':
            return jsonify({'ok': True})
        if request.method == 'GET':
            turso_puzzles = get_turso_puzzles()
            local_puzzles = load_puzzle_completed()
            
            print(f'[Puzzles Sync] GET puzzles: Turso={len(turso_puzzles) if turso_puzzles else 0}, Local={len(local_puzzles)}')
            
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
            
            optimized_puzzles = optimize_puzzles(puzzles)
            save_puzzle_completed_optimized(optimized_puzzles)
            try:
                save_turso_puzzles(optimized_puzzles)
            except Exception:
                pass
            return jsonify({'ok': True})
    except Exception as e:
        print(f"Error in api_puzzle_completed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'ok': False, 'error': str(e)}), 500
