import time
import queue
import json
from flask import Blueprint, request, jsonify, Response, stream_with_context
from werkzeug.security import generate_password_hash, check_password_hash
from handlers.core_utils import (
    ROOM_LOCK, ACTIVE_ROOMS, cleanup_stale_rooms, execute_turso_query
)

room_bp = Blueprint('room_bp', __name__)

# Публичный справочник живых P2P-комнат. Это НЕ ACTIVE_ROOMS: тот словарь
# обслуживает серверный протокол комнат с очередями и сигналами, а пазл и
# «больше/меньше» соединяются напрямую через PeerJS. Здесь хранится только
# витрина «кто сейчас хостит», которую хост обновляет heartbeat-запросом.
# Запись живёт 45 секунд: пропал хост (закрыл вкладку, потерял сеть) — комната
# исчезает из списка сама, без отдельной уборки.
ROOM_DIRECTORY = {}
ROOM_DIRECTORY_TTL = 45


def _prune_room_directory(now):
    for rid, room in list(ROOM_DIRECTORY.items()):
        if now - room.get('updatedAt', now) > ROOM_DIRECTORY_TTL:
            ROOM_DIRECTORY.pop(rid, None)


# Витрина комнат в Turso.
#
# Словарь ROOM_DIRECTORY живёт в процессе одного сервера, а у каждого игрока
# свой локальный сервер (комнаты P2P, общего бэкенда нет). Поэтому комната,
# созданная на другом устройстве, в памяти этого процесса просто не появлялась,
# и «Открытые комнаты» показывали только хостов с этой же машины.
#
# Чтобы витрина была общей, те же записи пишутся в Turso — он уже используется
# проектом для синхронизации избранного и пазлов. Если синхронизация
# выключена/не настроена, execute_turso_query вернёт None, и всё работает
# ровно как раньше — по памяти процесса.
_ROOMS_DB_READY = False


def _rooms_table_ready():
    global _ROOMS_DB_READY
    if _ROOMS_DB_READY:
        return True
    result = execute_turso_query(
        "CREATE TABLE IF NOT EXISTS puzzle_rooms ("
        "room_id TEXT PRIMARY KEY, host_id TEXT NOT NULL, host_name TEXT, "
        "game_type TEXT, mode TEXT, players INTEGER, max_players INTEGER, "
        "has_password INTEGER, updated_at REAL)"
    )
    if result is None:
        return False
    _ROOMS_DB_READY = True
    return True


def _rooms_db_rows(result):
    """Достаёт rows из ответа libsql HTTP API (формат бывает двух видов)."""
    if isinstance(result, dict):
        res = result.get('results')
        if isinstance(res, dict) and 'rows' in res:
            return res['rows']
        return None
    if isinstance(result, list) and result and isinstance(result[0], dict):
        res = result[0].get('results')
        if isinstance(res, dict) and 'rows' in res:
            return res['rows']
    return None


def _db_announce(entry):
    if not _rooms_table_ready():
        return False
    result = execute_turso_query(
        "INSERT INTO puzzle_rooms (room_id, host_id, host_name, game_type, mode, "
        "players, max_players, has_password, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(room_id) DO UPDATE SET host_id = excluded.host_id, "
        "host_name = excluded.host_name, game_type = excluded.game_type, "
        "mode = excluded.mode, players = excluded.players, "
        "max_players = excluded.max_players, has_password = excluded.has_password, "
        "updated_at = excluded.updated_at",
        params=[
            entry['id'], entry['hostId'], entry['hostName'], entry['gameType'],
            entry['mode'], entry['players'], entry['maxPlayers'],
            1 if entry['hasPassword'] else 0, entry['updatedAt']
        ]
    )
    return result is not None


def _db_list(game_type):
    if not _rooms_table_ready():
        return None
    sql = ("SELECT room_id, host_id, host_name, game_type, mode, players, "
           "max_players, has_password, updated_at FROM puzzle_rooms "
           "WHERE updated_at >= ?")
    params = [time.time() - ROOM_DIRECTORY_TTL]
    if game_type:
        sql += " AND game_type = ?"
        params.append(game_type)
    rows = _rooms_db_rows(execute_turso_query(sql, params=params))
    if rows is None:
        return None
    rooms = []
    for row in rows:
        try:
            rooms.append({
                'id': row[0],
                'hostId': row[1],
                'hostName': row[2] or 'Игрок',
                'gameType': row[3] or 'generic',
                'mode': row[4] or '',
                'players': int(row[5] or 1),
                'maxPlayers': int(row[6] or 8),
                'hasPassword': bool(row[7]),
                'updatedAt': float(row[8] or 0)
            })
        except Exception:
            continue
    return rooms


def _db_unannounce(room_id, host_id):
    if not _rooms_table_ready():
        return
    if host_id:
        execute_turso_query(
            "DELETE FROM puzzle_rooms WHERE room_id = ? AND host_id = ?",
            params=[room_id, host_id]
        )
    else:
        execute_turso_query(
            "DELETE FROM puzzle_rooms WHERE room_id = ?",
            params=[room_id]
        )


@room_bp.route('/api/rooms/announce', methods=['POST', 'OPTIONS'])
def api_rooms_announce():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        room_id = str(data.get('roomId', '')).strip().upper()
        host_id = str(data.get('hostId', '')).strip()
        if not room_id or not host_id:
            return jsonify({'ok': False, 'error': 'roomId and hostId are required'}), 400

        now = time.time()
        entry = {
            'id': room_id,
            'hostId': host_id,
            'hostName': str(data.get('hostName') or 'Игрок')[:24],
            'gameType': str(data.get('gameType') or 'puzzle')[:16],
            'mode': str(data.get('mode') or '')[:16],
            'players': max(1, int(data.get('players') or 1)),
            'maxPlayers': max(2, min(16, int(data.get('maxPlayers') or 8))),
            'hasPassword': bool(data.get('hasPassword')),
            'updatedAt': now
        }
        with ROOM_LOCK:
            _prune_room_directory(now)
            ROOM_DIRECTORY[room_id] = entry
        # Общая витрина (Turso) — чтобы комнату видели и на других устройствах.
        # Заодно подчищаем там записи пропавших хостов.
        if _db_announce(entry):
            execute_turso_query(
                "DELETE FROM puzzle_rooms WHERE updated_at < ?",
                params=[now - ROOM_DIRECTORY_TTL]
            )
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@room_bp.route('/api/rooms/list', methods=['GET', 'OPTIONS'])
def api_rooms_list():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    game_type = str(request.args.get('gameType') or '').strip()
    now = time.time()
    # Сначала общая витрина: комнаты, созданные на других устройствах, есть
    # только там. Если Turso недоступен — падаем на память этого процесса.
    rooms = _db_list(game_type)
    if rooms is None:
        with ROOM_LOCK:
            _prune_room_directory(now)
            rooms = [dict(room) for room in ROOM_DIRECTORY.values()
                     if not game_type or room['gameType'] == game_type]
    # Сначала полные комнаты: в них интереснее заходить.
    rooms.sort(key=lambda r: (-r['players'], r['id']))
    return jsonify({'ok': True, 'rooms': rooms})


@room_bp.route('/api/rooms/unannounce', methods=['POST', 'OPTIONS'])
def api_rooms_unannounce():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(silent=True) or {}
        room_id = str(data.get('roomId', '')).strip().upper()
        host_id = str(data.get('hostId', '')).strip()
        with ROOM_LOCK:
            room = ROOM_DIRECTORY.get(room_id)
            # Убрать запись может только тот, кто её создал: иначе любой
            # желающий «убирал» бы чужие комнаты из списка.
            if room and (not host_id or room['hostId'] == host_id):
                ROOM_DIRECTORY.pop(room_id, None)
        _db_unannounce(room_id, host_id)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


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
        try:
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
        finally:
            # Вкладку/страницу закрыли — очередь этого игрока больше никто не
            # читает. Раньше она вместе с накопленными сообщениями и потоком
            # SSE висела в комнате до самого её закрытия.
            with ROOM_LOCK:
                room = ACTIVE_ROOMS.get(room_id)
                if room:
                    room['queues'].pop(player_id, None)

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
