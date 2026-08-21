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

    print(f"Server Rule34 Gallery started at http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, threaded=True)
