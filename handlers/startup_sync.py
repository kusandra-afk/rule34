"""Первичная синхронизация локальных данных с Turso при старте сервера.

Раньше эти ~80 строк жили прямо в блоке `if __name__ == '__main__'` в
server.py. Из-за этого они выполнялись ТОЛЬКО при `python server.py`, но не
под gunicorn (а gunicorn есть в requirements.txt) — там `__name__` не равен
'__main__', блок пропускался целиком, и синхронизация с облаком тихо не
происходила вообще. Никакой ошибки, просто данные переставали съезжаться
между устройствами.

Теперь это обычная функция. Её можно вызвать откуда угодно: из server.py,
из gunicorn-хука, из ручного скрипта.
"""

from handlers import console_ui as ui
from handlers.core_utils import (
    get_turso_settings, initialize_turso_tables,
    get_turso_favorites, load_my_favorites, enrich_favorites_with_post_data,
    save_turso_favorites, get_turso_puzzles, load_puzzle_completed,
    optimize_puzzles, save_turso_puzzles, save_puzzle_completed_optimized,
    merge_puzzle_lists
)


def _merge_favorites(turso_favorites, local_favorites):
    """Объединяет избранное из облака и с диска.

    Побеждает запись с более свежим `change` — то есть то состояние, которое
    пользователь менял позже. Это важно для удалений: у удалённой записи
    is_deleted=1 и новый change, поэтому она перекроет старую живую запись из
    другого места, а не наоборот.
    """
    merged = {str(f.get('id')): f for f in turso_favorites}
    for fid, local_fav in {str(f.get('id')): f for f in local_favorites}.items():
        if fid not in merged:
            merged[fid] = local_fav
        elif local_fav.get('change', 0) > merged[fid].get('change', 0):
            merged[fid] = local_fav
    return list(merged.values())


def _merge_puzzles(turso_puzzles, local_puzzles):
    """Сливает пазлы по ключу записи (свежесть — lastUpdated и change)."""
    return merge_puzzle_lists(turso_puzzles, local_puzzles)


def _puzzles_changed(turso_puzzles, merged_puzzles):
    """Отличается ли слитый список от того, что уже лежит в Turso."""
    turso_map = {str(p.get('postId', p.get('id', ''))): p for p in turso_puzzles}
    for puzzle in merged_puzzles:
        pid = str(puzzle.get('postId', puzzle.get('id', '')))
        old = turso_map.get(pid)
        if old is None:
            return True
        if (puzzle.get('lastUpdated', '') != old.get('lastUpdated', '')
                or int(puzzle.get('change', 0) or 0) != int(old.get('change', 0) or 0)
                or int(puzzle.get('is_deleted', 0) or 0) != int(old.get('is_deleted', 0) or 0)
                or puzzle.get('variants') != old.get('variants')):
            return True
    return False


def sync_favorites_on_startup(lang='en'):
    """Сливает избранное. Возвращает (было_изменение, счётчик)."""
    turso_favorites = get_turso_favorites()
    local_favorites = load_my_favorites()

    if turso_favorites is None:
        if local_favorites:
            ui.info(ui.t(lang, 'turso_upload_fav', count=len(local_favorites)))
            if not save_turso_favorites(enrich_favorites_with_post_data(local_favorites)):
                ui.warn(ui.t(lang, 'turso_save_failed'))
            return True, len(local_favorites)
        return False, 0

    merged = _merge_favorites(turso_favorites, local_favorites)
    if len(merged) > len(turso_favorites):
        ui.info(ui.t(lang, 'turso_merge_fav', turso=len(turso_favorites),
                       local=len(local_favorites), merged=len(merged)))
        if not save_turso_favorites(enrich_favorites_with_post_data(merged)):
            ui.warn(ui.t(lang, 'turso_save_failed'))
        return True, len(merged)
    return False, len(turso_favorites)


def sync_puzzles_on_startup(lang='en'):
    """Сливает пазлы. Возвращает (было_изменение, счётчик)."""
    turso_puzzles = get_turso_puzzles()
    local_puzzles = load_puzzle_completed()

    if turso_puzzles and local_puzzles:
        merged = _merge_puzzles(turso_puzzles, local_puzzles)
        optimized = optimize_puzzles(merged)
        # Раньше наверх уезжало только когда записей стало БОЛЬШЕ. Изменение
        # уже существующего пазла (новый вариант, отметка удаления) количество
        # не меняет, и такой апдейт молча оставался локальным.
        if len(optimized) > len(turso_puzzles) or _puzzles_changed(turso_puzzles, optimized):
            ui.info(ui.t(lang, 'turso_merge_puz', turso=len(turso_puzzles),
                           local=len(local_puzzles), merged=len(optimized)))
            if not save_turso_puzzles(optimized):
                ui.warn(ui.t(lang, 'turso_save_failed'))
            save_puzzle_completed_optimized(optimized)
            return True, len(optimized)
        return False, len(turso_puzzles)

    if not turso_puzzles and local_puzzles:
        ui.info(ui.t(lang, 'turso_upload_puz', count=len(local_puzzles)))
        optimized = optimize_puzzles(local_puzzles)
        if not save_turso_puzzles(optimized):
            ui.warn(ui.t(lang, 'turso_save_failed'))
        return True, len(optimized)

    return False, len(turso_puzzles or [])


def run_startup_sync(lang='en'):
    """Точка входа: создаёт таблицы и сливает данные, если Turso включён.

    Все ошибки ловятся внутри: недоступный Turso не должен мешать серверу
    подняться на локальных данных.
    """
    try:
        url, token, enabled = get_turso_settings()
    except Exception as e:
        ui.warn(ui.t(lang, 'turso_settings_failed', error=e))
        return False

    # Выключенный Turso — не событие: его состояние видно в стартовом отчёте.
    if not enabled:
        return False
    if not url or not token:
        # Без адреса и токена каждая попытка синхронизации падала на пустом URL —
        # раньше это выглядело как «синхронизация включена», а данные тихо не
        # уезжали никогда. Отдельную строку здесь не печатаем: состояние Turso
        # есть в стартовом отчёте, дублировать его над баннером не нужно.
        return False

    try:
        if not initialize_turso_tables():
            ui.error(ui.t(lang, 'turso_tables_failed'))
            return False
    except Exception as e:
        ui.error(ui.t(lang, 'turso_tables_failed') + ': ' + str(e))
        return False

    ui.good(ui.t(lang, 'turso_tables_ok'))

    try:
        sync_favorites_on_startup(lang)
    except Exception as e:
        ui.warn(ui.t(lang, 'turso_fav_failed', error=e))

    try:
        sync_puzzles_on_startup(lang)
    except Exception as e:
        ui.warn(ui.t(lang, 'turso_puz_failed', error=e))

    return True
