import time
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
from flask import Blueprint, request, Response, stream_with_context, jsonify
from handlers.core_utils import (
    is_allowed_target_url, get_saved_api_key, clear_creds, REAL_USER_AGENT, session
)

proxy_bp = Blueprint('proxy_bp', __name__)

@proxy_bp.route('/proxy', methods=['GET', 'OPTIONS'])
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
