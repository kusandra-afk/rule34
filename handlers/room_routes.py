import time
import queue
import json
from flask import Blueprint, request, jsonify, Response, stream_with_context
from werkzeug.security import generate_password_hash, check_password_hash
from handlers.core_utils import (
    ROOM_LOCK, ACTIVE_ROOMS, cleanup_stale_rooms
)

room_bp = Blueprint('room_bp', __name__)

@room_bp.route('/api/room/create', methods=['POST', 'OPTIONS'])
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
        password = str(data.get('password') or '').strip()

        if not room_id or not player_id:
            return jsonify({'ok': False, 'error': 'roomId and playerId are required'}), 400

        with ROOM_LOCK:
            cleanup_stale_rooms()
            p_queue = queue.Queue(maxsize=500)
            ACTIVE_ROOMS[room_id] = {
                'id': room_id,
                'host_id': player_id,
                'game_type': game_type,
                'password_hash': generate_password_hash(password) if password else None,
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

@room_bp.route('/api/room/join', methods=['POST', 'OPTIONS'])
def api_room_join():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        room_id = str(data.get('roomId', '')).strip().upper()
        player_id = str(data.get('playerId', '')).strip()
        player_name = data.get('playerName', 'Игрок')
        player_info = data.get('playerInfo', {})
        password = str(data.get('password') or '').strip()

        if not room_id or not player_id:
            return jsonify({'ok': False, 'error': 'roomId and playerId are required'}), 400

        with ROOM_LOCK:
            cleanup_stale_rooms()
            if room_id not in ACTIVE_ROOMS:
                return jsonify({'ok': False, 'error': 'room_not_found', 'message': 'Комната не найдена!'}), 404

            room = ACTIVE_ROOMS[room_id]

            # Комнату уже создал игрок, повторный "join" хоста (например, после
            # переподключения) не должен требовать пароль повторно
            password_hash = room.get('password_hash')
            if password_hash and player_id != room['host_id']:
                if not password:
                    return jsonify({'ok': False, 'error': 'password_required', 'message': 'Комната защищена паролем'}), 401
                if not check_password_hash(password_hash, password):
                    return jsonify({'ok': False, 'error': 'invalid_password', 'message': 'Неверный пароль'}), 403

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

@room_bp.route('/api/room/signal', methods=['POST', 'OPTIONS'])
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
            # Отправлять пакеты может только тот, кто реально прошёл /api/room/join
            # (и, соответственно, проверку пароля) — иначе пароль комнаты можно
            # было бы обойти, просто угадав чужой playerId и слав пакеты напрямую.
            if sender_id not in room['players']:
                return jsonify({'ok': False, 'error': 'not_joined'}), 403
            room['last_active'] = time.time()
            if sender_id in room['players']:
                room['players'][sender_id]['last_seen'] = time.time()
                
            if isinstance(packet, dict):
                p_type = packet.get('type')
                if p_type in ('ROOM_STATE', 'ROOM_DATA'):
                    r_data = packet.get('roomData') or packet.get('data')
                    if r_data:
                        room['room_data'] = r_data
            
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

@room_bp.route('/api/room/events', methods=['GET'])
def api_room_events():
    room_id = request.args.get('roomId', '').strip().upper()
    player_id = request.args.get('playerId', '').strip()
    
    if not room_id or not player_id:
        return jsonify({'ok': False, 'error': 'roomId and playerId required'}), 400
        
    with ROOM_LOCK:
        if room_id not in ACTIVE_ROOMS:
            return jsonify({'ok': False, 'error': 'room_not_found'}), 404
        room = ACTIVE_ROOMS[room_id]
        # Как и в /signal — только уже присоединившийся игрок (прошедший
        # проверку пароля в /join) может слушать события комнаты.
        if player_id not in room['players']:
            return jsonify({'ok': False, 'error': 'not_joined'}), 403
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

@room_bp.route('/api/room/poll', methods=['POST', 'OPTIONS'])
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
                if player_id not in room['players']:
                    return jsonify({'ok': False, 'error': 'not_joined'}), 403
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

@room_bp.route('/api/room/leave', methods=['POST', 'OPTIONS'])
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
                is_host = (room.get('host_id') == player_id)
                room['players'].pop(player_id, None)
                room['queues'].pop(player_id, None)
                
                if is_host:
                    close_packet = {'type': 'ROOM_CLOSED', 'playerId': player_id, 'message': 'Хост закрыл комнату'}
                    for p_id, q in list(room['queues'].items()):
                        try:
                            q.put_nowait(close_packet)
                        except Exception:
                            pass
                    ACTIVE_ROOMS.pop(room_id, None)
                else:
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

@room_bp.route('/api/room/ice_servers', methods=['GET', 'OPTIONS'])
def api_room_ice_servers():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
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
