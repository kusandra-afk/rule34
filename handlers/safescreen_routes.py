import os
import time
from werkzeug.utils import secure_filename
from flask import Blueprint, request, jsonify, send_from_directory
from handlers.core_utils import SAFE_SCREEN_DIR

safescreen_bp = Blueprint('safescreen_bp', __name__)

# Shared whitelist of extensions the safe-screen feature is meant to serve
# (images/videos only). Upload must be checked against this too, not just the
# listing endpoint — files saved under SAFE_SCREEN_DIR are served back verbatim
# by /safe_screen/<filename>, so an unchecked upload (e.g. a .html file) would
# get served from this server's own origin and could run as this site.
SAFE_SCREEN_VALID_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.mp4', '.webm', '.mov', '.ogg', '.m4v'}

@safescreen_bp.route('/safe_screen/<path:filename>')
def serve_safe_screen_file(filename):
    return send_from_directory(SAFE_SCREEN_DIR, filename)

@safescreen_bp.route('/api/safe-screen/files', methods=['GET', 'OPTIONS'])
def api_safe_screen_files():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        os.makedirs(SAFE_SCREEN_DIR, exist_ok=True)
        valid_exts = SAFE_SCREEN_VALID_EXTS
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

@safescreen_bp.route('/api/safe-screen/upload', methods=['POST', 'OPTIONS'])
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

        ext = os.path.splitext(filename)[1].lower()
        if ext not in SAFE_SCREEN_VALID_EXTS:
            return jsonify({'ok': False, 'error': f'Недопустимый тип файла ({ext or "без расширения"}). Разрешены только изображения и видео.'}), 400

        filepath = os.path.join(SAFE_SCREEN_DIR, filename)
        file.save(filepath)

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

@safescreen_bp.route('/api/safe-screen/delete', methods=['POST', 'DELETE', 'OPTIONS'])
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
