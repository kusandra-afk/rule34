"""Оформление консоли: цвета, рамка стартового отчёта, лог запросов к API.

Зачем отдельный модуль: стартовый отчёт, подсказки и лог запросов должны
выглядеть одинаково и переводиться на выбранный язык. Раньше это были
разрозненные print() в server.py и startup_sync.py, частично только по-русски,
и без единого места, где видно, что именно произошло с запросом.

Модуль намеренно не зависит от Flask и от остальных handlers: его можно
импортировать откуда угодно (server.py, startup_sync.py, gunicorn-хук).

Про кодировки: консоль Windows исторически живёт в cp866/cp1251, и символы
рамки (─│╭╮) в неё не кодируются — процесс падал с UnicodeEncodeError ещё до
старта сервера. Поэтому здесь два набора символов: «красивый» (Unicode) и
ASCII-фолбэк, который включается, если текущий stdout их не принимает.
"""

import os
import sys
import time

# --------------------------------------------------------------------------
# Цвета
# --------------------------------------------------------------------------

RESET = '\033[0m'
BOLD = '\033[1m'
DIM = '\033[2m'
RED = '\033[31m'
GREEN = '\033[32m'
YELLOW = '\033[33m'
BLUE = '\033[34m'
MAGENTA = '\033[35m'
CYAN = '\033[36m'
GREY = '\033[90m'

_COLOR_ENABLED = None


def _enable_windows_ansi():
    """Включает обработку ANSI-последовательностей в консоли Windows."""
    if os.name != 'nt':
        return
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            # ENABLE_VIRTUAL_TERMINAL_PROCESSING
            kernel32.SetConsoleMode(handle, mode.value | 0x0004)
    except Exception:
        pass


def color_enabled():
    """Цвет включается только для терминала; NO_COLOR отключает, FORCE_COLOR — включает."""
    global _COLOR_ENABLED
    if _COLOR_ENABLED is not None:
        return _COLOR_ENABLED
    if os.environ.get('NO_COLOR'):
        _COLOR_ENABLED = False
        return False
    if os.environ.get('FORCE_COLOR'):
        _COLOR_ENABLED = True
        return True
    try:
        if not sys.stdout or not sys.stdout.isatty():
            _COLOR_ENABLED = False
            return False
    except Exception:
        _COLOR_ENABLED = False
        return False
    _enable_windows_ansi()
    _COLOR_ENABLED = True
    return True


def paint(text, color='', bold=False):
    if not color_enabled() or (not color and not bold):
        return text
    prefix = (BOLD if bold else '') + color
    return prefix + text + RESET


def _can_encode(text):
    """Примет ли текущий stdout эти символы (cp866 рамку не примет)."""
    stream = sys.stdout
    encoding = getattr(stream, 'encoding', None) or 'utf-8'
    try:
        text.encode(encoding)
        return True
    except Exception:
        return False


_UNICODE_BOX = None


def unicode_box():
    """True, если консоль умеет рисовать рамку красивыми символами."""
    global _UNICODE_BOX
    if _UNICODE_BOX is None:
        _UNICODE_BOX = _can_encode('╭─│╰╯»·')
    return _UNICODE_BOX


# --------------------------------------------------------------------------
# Подписи на двух языках
# --------------------------------------------------------------------------

STRINGS = {
    'ru': {
        'title': 'Rule34 Gallery',
        'subtitle_local': 'локальный сервер галереи',
        'subtitle_lan': 'сервер галереи для этой сети',
        'addr_local': 'Локальный адрес',
        'addr_lan': 'Адреса в сети',
        'mode': 'Режим доступа',
        'mode_local': 'только этот компьютер',
        'mode_lan': 'этот компьютер + устройства в сети',
        'https': 'HTTPS',
        'https_on': 'включён (самоподписанный сертификат)',
        'https_off': 'выключен — гироскоп и VR с телефона недоступны',
        'language': 'Язык интерфейса',
        'turso_broken_short': 'Turso включён, но адрес и токен не заданы',
        'turso_on_short': 'Turso подключён — синхронизация включена',
        'turso_off_short': 'Turso не настроен — синхронизация пропущена',
        'auth_required': 'Требуется вход в приложение',
        'sec_checks': 'Проверки',
        'sec_launch': 'Запуск',
        'python_line': 'Python {version}',
        'deps_ok': 'зависимости на месте ({count})',
        'deps_missing': 'не хватает: {names} — поставьте: pip install -r requirements.txt',
        'dep_optional_missing': '{name} нет (нужен только для HTTPS)',
        'keys_ok_short': 'ключи rule34 сохранены (user_id {user_id})',
        'keys_missing_short': 'ключей rule34 нет — спросит при первом открытии',
        'ready_hint': 'Готово. Откройте адрес выше, Ctrl+C — остановить сервер.',
        'turso_save_failed': 'Turso: запись не удалась, данные остались только локально',
        'data': 'Ключи и настройки',
        'cache': 'Кэш игр',
        'log': 'Лог запросов',
        'log_api': 'только /api и ошибки (--verbose — все)',
        'log_all': 'все запросы (--verbose)',
        'phone_https': 'Телефон один раз предупредит о сертификате — это ожидаемо:',
        'phone_https_next': '«Дополнительно» → «Перейти на сайт».',
        'starting': 'Запуск сервера…',
        'pick_language': 'Выберите язык интерфейса',
        'pick_language_hint': 'Choose interface language — введите номер / enter number',
        'enter_key': 'Enter',
        'lang_name': 'русский',
        'net_question': 'Куда открывать доступ к галерее?',
        'net_local': 'Только этот компьютер',
        'net_local_note': 'Другие устройства и посторонние сайты до сервера не достанут.',
        'net_lan': 'Этот компьютер и другие устройства в этой же сети',
        'net_lan_note': 'Нужно, если открывать галерею с телефона или другого ПК.',
        'choice': 'Выбор',
        'https_no_crypto': 'HTTPS запрошен, но не установлен пакет cryptography.',
        'https_install': 'Установите его командой:  pip install cryptography',
        'https_fallback': 'Продолжаю по обычному HTTP (гироскоп и WebXR с телефона будут недоступны).',
        'https_cert_failed': 'Не удалось подготовить сертификат: {error}',
        'https_http_fallback': 'Продолжаю по обычному HTTP.',
        'turso_tables_ok': 'Turso: таблицы готовы',
        'turso_tables_failed': 'Turso: не удалось подготовить таблицы',
        'turso_disabled': 'Turso: синхронизация выключена',
        'turso_upload_fav': 'Turso: отправлено {count} избранных',
        'turso_upload_puz': 'Turso: отправлено {count} пазлов',
        'turso_merge_fav': 'Turso: слито избранное ({turso} в облаке, {local} локально, {merged} итог)',
        'turso_merge_puz': 'Turso: слиты пазлы ({turso} в облаке, {local} локально, {merged} итог)',
        'turso_fav_failed': 'Turso: синхронизация избранного не удалась (не критично): {error}',
        'turso_puz_failed': 'Turso: синхронизация пазлов не удалась (не критично): {error}',
        'turso_settings_failed': 'Turso: не удалось прочитать настройки: {error}',
        'shutdown': 'Сервер остановлен.',
    },
    'en': {
        'title': 'Rule34 Gallery',
        'subtitle_local': 'local gallery server',
        'subtitle_lan': 'gallery server for this network',
        'addr_local': 'Local address',
        'addr_lan': 'Network addresses',
        'mode': 'Access mode',
        'mode_local': 'this computer only',
        'mode_lan': 'this computer + devices on this network',
        'https': 'HTTPS',
        'https_on': 'enabled (self-signed certificate)',
        'https_off': 'disabled — gyroscope and VR from a phone are unavailable',
        'language': 'Interface language',
        'turso_broken_short': 'Turso is enabled, but the address and token are missing',
        'turso_on_short': 'Turso connected — sync is on',
        'turso_off_short': 'Turso not configured — sync skipped',
        'auth_required': 'Sign-in required',
        'sec_checks': 'Checks',
        'sec_launch': 'Launch',
        'python_line': 'Python {version}',
        'deps_ok': 'dependencies in place ({count})',
        'deps_missing': 'missing: {names} — run: pip install -r requirements.txt',
        'dep_optional_missing': '{name} is missing (needed for HTTPS only)',
        'keys_ok_short': 'rule34 keys saved (user_id {user_id})',
        'keys_missing_short': 'no rule34 keys yet — will ask on first page open',
        'ready_hint': 'Ready. Open the address above, Ctrl+C stops the server.',
        'turso_save_failed': 'Turso: write failed, data kept locally only',
        'data': 'Keys and settings',
        'cache': 'Game cache',
        'log': 'Request log',
        'log_api': 'only /api and errors (--verbose for all)',
        'log_all': 'all requests (--verbose)',
        'phone_https': 'The phone will warn about the certificate once — that is expected:',
        'phone_https_next': '"Advanced" -> "Proceed to site".',
        'starting': 'Starting the server...',
        'pick_language': 'Choose interface language',
        'pick_language_hint': 'Выберите язык интерфейса — введите номер / enter number',
        'enter_key': 'Enter',
        'lang_name': 'english',
        'net_question': 'Where should the gallery be reachable?',
        'net_local': 'This computer only',
        'net_local_note': 'Other devices and third-party sites cannot reach the server.',
        'net_lan': 'This computer and other devices on the same network',
        'net_lan_note': 'Needed to open the gallery from a phone or another PC.',
        'choice': 'Choice',
        'https_no_crypto': 'HTTPS requested, but the cryptography package is not installed.',
        'https_install': 'Install it with:  pip install cryptography',
        'https_fallback': 'Falling back to plain HTTP (gyroscope and WebXR from a phone will not work).',
        'https_cert_failed': 'Could not prepare the certificate: {error}',
        'https_http_fallback': 'Falling back to plain HTTP.',
        'turso_tables_ok': 'Turso: tables are ready',
        'turso_tables_failed': 'Turso: could not prepare tables',
        'turso_disabled': 'Turso: sync is disabled',
        'turso_upload_fav': 'Turso: uploaded {count} favorites',
        'turso_upload_puz': 'Turso: uploaded {count} puzzles',
        'turso_merge_fav': 'Turso: merged favorites ({turso} in cloud, {local} local, {merged} total)',
        'turso_merge_puz': 'Turso: merged puzzles ({turso} in cloud, {local} local, {merged} total)',
        'turso_fav_failed': 'Turso: favorites sync failed (non-fatal): {error}',
        'turso_puz_failed': 'Turso: puzzles sync failed (non-fatal): {error}',
        'turso_settings_failed': 'Turso: could not read settings: {error}',
        'shutdown': 'Server stopped.',
    },
}


def t(lang, key, **kwargs):
    """Строка на выбранном языке; неизвестный язык — английский."""
    table = STRINGS.get(lang) or STRINGS['en']
    template = table.get(key) or STRINGS['en'].get(key) or key
    try:
        return template.format(**kwargs)
    except Exception:
        return template


# --------------------------------------------------------------------------
# Стартовый отчёт
# --------------------------------------------------------------------------

WIDTH = 66


def _box_lines(lang, subtitle):
    """Рамка с названием и подзаголовком внутри."""
    if unicode_box():
        top = '╭' + '─' * WIDTH + '╮'
        bottom = '╰' + '─' * WIDTH + '╯'
        side = '│'
    else:
        top = '+' + '-' * WIDTH + '+'
        bottom = '+' + '-' * WIDTH + '+'
        side = '|'

    lines = [top]
    head = '  ' + t(lang, 'title').upper()
    lines.append(side + head + ' ' * max(0, WIDTH - len(head)) + side)
    if subtitle:
        sub = '  ' + subtitle
        lines.append(side + sub + ' ' * max(0, WIDTH - len(sub)) + side)
    lines.append(bottom)
    return lines


def _symbols():
    """Галочки/крестики там, где консоль их принимает, и ASCII-замена иначе."""
    if unicode_box():
        return {'ok': '✓', 'warn': '!', 'bad': '×', 'dot': '·'}
    return {'ok': '+', 'warn': '!', 'bad': 'x', 'dot': '-'}


def _section(lang, key):
    """Заголовок блока отчёта."""
    _out()
    _out(paint('  ' + t(lang, key).upper(), GREY, bold=True))


def _check_row(kind, text, note=None):
    """Строка проверки: значок, текст, необязательное пояснение."""
    color = {'ok': GREEN, 'warn': YELLOW, 'bad': RED, 'dot': GREY}[kind]
    line = ('  ' + paint(_symbols()[kind], color, bold=kind in ('warn', 'bad'))
            + ' ' + text)
    if note:
        line += paint('  ' + note, GREY)
    _out(line)


def _out(text=''):
    """Печать с принудительным flush.

    Без flush вывод уходит в буфер, и при перенаправлении в файл
    (`python server.py > server.log`) строки лога запросов появляются
    только когда буфер наберётся или процесс завершится штатно. При
    Ctrl+C этого не происходит вообще: лог терялся, хотя запросы были.
    """
    print(text, flush=True)


def banner(lang='en', subtitle=None):
    for line in _box_lines(lang, subtitle):
        _out(paint(line, CYAN, bold=True))


def startup_report(lang, info):
    """Печатает стартовый отчёт.

    info — словарь:
        scheme      'http' | 'https'
        port        int
        local_url   str
        lan_urls    список str (может быть пустым)
        mode        'local' | 'lan'
        https       bool
        user_id     str | None
        turso       bool (включена ли синхронизация)
        secrets_dir str
        cache_dir   str
        verbose     bool
    """
    lanes = info.get('lan_urls') or []
    subtitle = t(lang, 'subtitle_lan') if info.get('mode') == 'lan' else t(lang, 'subtitle_local')
    banner(lang, subtitle)

    # --- что проверено ---------------------------------------------------
    _section(lang, 'sec_checks')

    python_version = info.get('python')
    if python_version:
        _check_row('ok', t(lang, 'python_line', version=python_version))

    deps = info.get('deps') or []
    missing = [name for name, ok, optional in deps if not ok and not optional]
    optional_missing = [name for name, ok, optional in deps if not ok and optional]
    if missing:
        _check_row('bad', t(lang, 'deps_missing', names=', '.join(missing)))
    elif deps:
        _check_row('ok', t(lang, 'deps_ok', count=len(deps)))
    for name in optional_missing:
        _check_row('warn', t(lang, 'dep_optional_missing', name=name))

    user_id = info.get('user_id')
    if user_id:
        _check_row('ok', t(lang, 'keys_ok_short', user_id=user_id))
    else:
        _check_row('warn', t(lang, 'keys_missing_short'))

    turso_state = info.get('turso') or 'off'
    if turso_state == 'on':
        _check_row('ok', t(lang, 'turso_on_short'))
    elif turso_state == 'broken':
        _check_row('warn', t(lang, 'turso_broken_short'))
    else:
        _check_row('dot', t(lang, 'turso_off_short'))

    # --- куда идти -------------------------------------------------------
    _section(lang, 'sec_launch')
    rows = [('addr_local', [info['local_url']])]
    if lanes:
        rows.append(('addr_lan', lanes))
    rows.append(('mode', [t(lang, 'mode_lan' if info.get('mode') == 'lan' else 'mode_local')]))
    rows.append(('https', [t(lang, 'https_on' if info.get('https') else 'https_off')]))
    rows.append(('log', [t(lang, 'log_all' if info.get('verbose') else 'log_api')]))
    rows.append(('data', [info.get('secrets_dir', '')]))
    if info.get('cache_dir'):
        rows.append(('cache', [info['cache_dir']]))

    labels = [t(lang, key) for key, _ in rows]
    label_width = max(len(' ' * 0 + lab) for lab in labels) + 2

    for (key, values), label in zip(rows, labels):
        first = True
        for value in values:
            left = ('  ' + label).ljust(label_width + 2)
            if first:
                _out(paint(left, GREY) + paint(value, BOLD))
                first = False
            else:
                _out(' ' * (label_width + 2) + paint(value, BOLD))

    if info.get('mode') == 'lan' and info.get('https'):
        _out()
        _out(paint('  ' + t(lang, 'phone_https'), YELLOW))
        _out('  ' + t(lang, 'phone_https_next'))
    _out()
    _out('  ' + paint(t(lang, 'ready_hint'), GREEN, bold=True))


# --------------------------------------------------------------------------
# Служебные сообщения
# --------------------------------------------------------------------------

_PREFIX = {'info': '·', 'good': '+', 'warn': '!', 'error': 'x'}


def _print_line(kind, text):
    prefix = _PREFIX.get(kind, '·')
    color = {'info': CYAN, 'good': GREEN, 'warn': YELLOW, 'error': RED}.get(kind, '')
    _out(paint('[' + prefix + ']', color, bold=(kind in ('warn', 'error'))) + ' ' + text)


def info(text):
    _print_line('info', text)


def good(text):
    _print_line('good', text)


def warn(text):
    _print_line('warn', text)


def error(text):
    _print_line('error', text)


def debug(text):
    """Внутренняя отладка: показывается только с --verbose.

    Раньше такие строки печатались всегда под префиксом [Turso Debug] и
    шли вперемешку с настоящими ошибками — по консоли нельзя было понять,
    что сломалось, а что просто трассировка.
    """
    if not _VERBOSE:
        return
    _out(paint('[debug]', GREY) + ' ' + paint(text, GREY))


# --------------------------------------------------------------------------
# Лог запросов
# --------------------------------------------------------------------------

_VERBOSE = False
_LANG = 'en'

STATUS_COLORS = {
    2: GREEN,
    3: CYAN,
    4: YELLOW,
    5: RED,
}

# Служебные пути, которые не несут смысла в логе: браузер сам их дёргает.
# Шум браузера, которого мы не заказывали: сюда не должны попадать ни в
# обычном режиме, ни с --verbose.
_NOISE_SUFFIXES = ('.map',)
_NOISE_PREFIXES = ('/.well-known/',)
_NOISE_PATHS = ('/favicon.ico', '/sw.js', '/robots.txt')


def configure(lang='en', verbose=False):
    """Задаёт язык и режим подробности для модуля целиком."""
    global _LANG, _VERBOSE
    _LANG = lang or 'en'
    _VERBOSE = bool(verbose)


def current_language():
    """Выбранный язык — чтобы обработчики отвечали на нём же."""
    return _LANG


def _is_noise(path):
    """Служебный шум браузера и инструментов.

    Карта кода (.js.map) запрашивается DevTools только при открытой панели,
    /.well-known/appspecific/... — это проба самого Chrome, /sw.js просит
    старая регистрация service worker'а (в проекте его нет). Всё это 404 by
    design и в логе только мешает искать настоящие ошибки.
    """
    if path.endswith(_NOISE_SUFFIXES) or path in _NOISE_PATHS:
        return True
    return path.startswith(_NOISE_PREFIXES)


def should_log(path, status):
    """Что попадает в лог: ошибки всегда, API — всегда, статику — только в --verbose."""
    if _is_noise(path):
        return False
    if status >= 400:
        return True
    if _VERBOSE:
        return True
    return path.startswith('/api/') or path in ('/proxy', '/', '/login', '/logout')


def _shorten(path, width=42):
    if len(path) <= width:
        return path
    return path[: width - 1] + '…' if unicode_box() else path[: width - 3] + '...'


def status_text(status):
    text = str(status)
    color = STATUS_COLORS.get(status // 100, '')
    return paint(text.rjust(3), color, bold=status >= 400)


def _duration_text(duration_ms):
    """Миллисекунды до секунды, дальше секунды: 240ms / 2.7s."""
    if duration_ms >= 1000:
        return '%.1fs' % (duration_ms / 1000.0)
    return '%.0fms' % duration_ms


def log_request(method, path, status, duration_ms, detail=None):
    """Одна строка лога запроса: время, метод, путь, статус, длительность."""
    if not should_log(path, status):
        return
    stamp = time.strftime('%H:%M:%S')
    # Долгие запросы подсвечиваем: 27-секундный /proxy иначе теряется среди
    # сотни одинаковых строк и выглядит как «всё нормально».
    if duration_ms >= 10000:
        duration_color = RED
    elif duration_ms >= 2000:
        duration_color = YELLOW
    else:
        duration_color = GREY
    line = '  '.join([
        paint(stamp, GREY),
        paint(method.ljust(6), BOLD if status >= 400 else ''),
        paint(_shorten(path).ljust(42), ''),
        status_text(status),
        paint(_duration_text(duration_ms).rjust(6), duration_color,
              bold=duration_ms >= 10000),
    ])
    if detail:
        detail = ' '.join(str(detail).split())[:110]
        line += '  ' + paint(detail, YELLOW if status < 500 else RED)
    _out(line)
