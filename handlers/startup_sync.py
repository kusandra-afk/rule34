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

from handlers.core_utils import (
    get_turso_settings, initialize_turso_tables,
    get_turso_favorites, load_my_favorites, enrich_favorites_with_post_data,
    save_turso_favorites, get_turso_puzzles, load_puzzle_completed,
    optimize_puzzles, save_turso_puzzles, save_puzzle_completed_optimized
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
    """То же для пазлов, но свежесть определяется по lastUpdated (строкой)."""
    merged = {str(p.get('postId', p.get('id', ''))): p
              for p in turso_puzzles if p.get('postId') or p.get('id')}
    for pid, p in {str(x.get('postId', x.get('id', ''))): x
                   for x in local_puzzles if x.get('postId') or x.get('id')}.items():
        if pid not in merged:
            merged[pid] = p
            continue
        try:
            if p.get('lastUpdated', '') > merged[pid].get('lastUpdated', ''):
                merged[pid] = p
        except Exception:
            # Если lastUpdated не строка и сравнение падает — оставляем облачную
            # запись. Ронять из-за этого весь старт сервера незачем.
            pass
    return list(merged.values())


def sync_favorites_on_startup():
    """Сливает избранное. Возвращает (было_изменение, счётчик)."""
    turso_favorites = get_turso_favorites()
    local_favorites = load_my_favorites()

    if turso_favorites is None:
        if local_favorites:
            print(f'Uploading {len(local_favorites)} local favorites to Turso...')
            save_turso_favorites(enrich_favorites_with_post_data(local_favorites))
            return True, len(local_favorites)
        return False, 0

    merged = _merge_favorites(turso_favorites, local_favorites)
    if len(merged) > len(turso_favorites):
        print(f'Merging favorites: {len(turso_favorites)} in Turso, '
              f'{len(local_favorites)} local, {len(merged)} merged')
        save_turso_favorites(enrich_favorites_with_post_data(merged))
        return True, len(merged)
    return False, len(turso_favorites)


def sync_puzzles_on_startup():
    """Сливает пазлы. Возвращает (было_изменение, счётчик)."""
    turso_puzzles = get_turso_puzzles()
    local_puzzles = load_puzzle_completed()

    if turso_puzzles and local_puzzles:
        merged = _merge_puzzles(turso_puzzles, local_puzzles)
        optimized = optimize_puzzles(merged)
        if len(optimized) > len(turso_puzzles):
            print(f'Merging puzzles: {len(turso_puzzles)} in Turso, '
                  f'{len(local_puzzles)} local, {len(optimized)} merged')
            save_turso_puzzles(optimized)
            save_puzzle_completed_optimized(optimized)
            return True, len(optimized)
        return False, len(turso_puzzles)

    if not turso_puzzles and local_puzzles:
        print(f'Uploading {len(local_puzzles)} local puzzles to Turso...')
        optimized = optimize_puzzles(local_puzzles)
        save_turso_puzzles(optimized)
        return True, len(optimized)

    return False, len(turso_puzzles or [])


def run_startup_sync():
    """Точка входа: создаёт таблицы и сливает данные, если Turso включён.

    Все ошибки ловятся внутри: недоступный Turso не должен мешать серверу
    подняться на локальных данных.
    """
    try:
        url, token, enabled = get_turso_settings()
    except Exception as e:
        print(f'Could not read Turso settings: {e}')
        return False

    if not enabled:
        print('Turso sync is disabled or not configured')
        return False

    print('Turso sync is enabled, initializing tables...')
    try:
        if not initialize_turso_tables():
            print('Failed to initialize Turso tables')
            return False
    except Exception as e:
        print(f'Failed to initialize Turso tables: {e}')
        return False

    print('Turso tables initialized successfully')
    print('Checking for initial sync...')

    try:
        sync_favorites_on_startup()
    except Exception as e:
        print(f'Favorites startup sync failed (non-fatal): {e}')

    try:
        sync_puzzles_on_startup()
    except Exception as e:
        print(f'Puzzles startup sync failed (non-fatal): {e}')

    return True
