import time
from flask import Blueprint, request, jsonify
from handlers.core_utils import (
    ROOM_LOCK, execute_turso_query
)

room_bp = Blueprint('room_bp', __name__)

# Публичный справочник живых P2P-комнат. Пазл и «больше/меньше» соединяются
# напрямую через PeerJS, поэтому серверного протокола с очередями и сигналами
# здесь нет: хранится только витрина «кто сейчас хостит», которую хост
# обновляет heartbeat-запросом.
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

