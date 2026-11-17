#!/usr/bin/env python3
"""Проверки Rule34 Gallery.

    python tests/run_tests.py             # всё (~6 с)
    python tests/run_tests.py --fast      # без HTTP-прогона и node --check
    python tests/run_tests.py --only js,live
    python tests/run_tests.py --list
    python tests/run_tests.py --strict    # пропуски = провал (для CI)
    python tests/run_tests.py -v          # время групп и подробности

Зависимостей нет: только стандартная библиотека Python. `node` нужен для
проверки JS и словарей переводов; без него эти проверки помечаются
пропущенными (с --strict это провал).

Каждая проверка возвращает список проблем вида «файл:строка — причина».
Пустой список — проверка прошла. Провал всегда показывает, где именно и что
не так, а не просто «не работает».

Что проверять — находится само: страницы, Python, JS, CSS и JSON ищутся
обходом проекта (кроме node_modules/vendor/__pycache__), точки входа
определяются по `if __name__ == '__main__'` и лаунчерам. Новый файл или
папка попадают в проверки без правки теста.

ВНИМАНИЕ: не запрашивайте GET /. Маршрут проверяет ключ на rule34 и при
неудаче удаляет R34/.secrets/api_credentials.json — прогон стёр бы вход.
"""

import argparse
import ast
import io
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request
from collections import Counter
from contextlib import redirect_stdout
from pathlib import Path

# __pycache__ не создаём: тесты не должны оставлять мусор в проекте.
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Консоль Windows по умолчанию в cp866: без этого русский текст падает
# с UnicodeEncodeError ещё до первой проверки.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:                                   # noqa: BLE001
    pass

from handlers import console_ui as ui               # noqa: E402

# ---------------------------------------------------------------------------
# Что проверять: всё, что есть в проекте
# ---------------------------------------------------------------------------

# Чужие каталоги: не наш код, в проверки не попадают.
SKIP_DIRS = {'__pycache__', 'node_modules', 'vendor', '.git', '.freebuff',
             'dist', 'build', 'venv', '.venv'}


def project_files(pattern):
    """Файлы проекта по маске — с любой глубины и в новых папках.

    Ничего не перечислено заранее: добавленный файл или каталог попадает
    в проверки сам, без правки теста.
    """
    return sorted(path for path in ROOT.rglob(pattern)
                  if not SKIP_DIRS & set(path.relative_to(ROOT).parts))


PAGES = project_files('*.html')
JS_FILES = project_files('*.js')
CSS_FILES = project_files('*.css')
R34 = ROOT / 'R34'

TITLE_WIDTH = 54
MAX_PROBLEMS = 6

# Язык вывода: 'ru' или 'en'. Берётся из настроек приложения (--lang важнее)
# ещё до разбора аргументов: от языка зависит текст --help.
LANG = 'ru'

# Перевод — таблица готовых фраз: печатается то же самое, что видно в консоли.
# Новая фраза без перевода остаётся по-русски, и это видно сразу.
TRANSLATIONS = [
    ('Проверки Rule34 Gallery.', 'Rule34 Gallery checks.'),
    ('проверки проекта', 'project checks'),
    ('язык вывода: ru или en (по умолчанию — из настроек)',
     'output language: ru or en (default: the app language)'),
    ('без HTTP-прогона и node --check', 'skip the HTTP run and node --check'),
    ('только эти группы, через запятую', 'only these groups, comma separated'),
    ('список групп', 'list groups'),
    ('пропуски считать провалом', 'count skips as failures'),
    ('время групп и все проблемы', 'per-group time and every problem'),
    ('ждать Enter в конце', 'wait for Enter at the end'),
    ('не ждать Enter', 'do not wait for Enter'),
    ('Неизвестные группы: ', 'Unknown groups: '),
    ('Есть: ', 'Available: '),
    ('Нажмите Enter, чтобы закрыть окно... ', 'Press Enter to close this window... '),
    ('Итог: ', 'Result: '),
    (' провалено', ' failed'),
    (' пропущено', ' skipped'),
    (' (провал)', ' (counted as a failure)'),
    ('Что не так:', 'What is wrong:'),
    ('Пропущено, а в режиме --strict это провал:',
     'Skipped, which --strict counts as a failure:'),
    ('Всё в порядке.', 'All good.'),
    ('… и ещё ', '… and '),
    ('проверка выполнилась', 'check ran'),

    # Группы
    ('СТАТИКА', 'ASSETS'),
    ('ПЕРЕВОДЫ', 'TRANSLATIONS'),
    ('КОНСОЛЬ', 'CONSOLE'),
    ('СЛУЖЕБНАЯ ПАНЕЛЬ', 'DEV PANEL'),
    ('МЁРТВЫЙ КОД', 'DEAD CODE'),
    ('ЛАУНЧЕРЫ', 'LAUNCHERS'),
    ('ЛОКАЛЬНЫЕ ДАННЫЕ', 'LOCAL DATA'),
    ('ЖИВОЙ СЕРВЕР', 'LIVE SERVER'),
    ('JS: МОДУЛИ', 'JS: MODULES'),

    # Названия проверок
    (' файлов .py компилируются', ' .py files compile'),
    ('server импортируется', 'server imports'),
    (' ключевых маршрутов', ' key routes'),
    ('(всего ', '(total '),
    (' защищённых /api', ' protected /api prefixes'),
    (' обращений к /api из страниц и JS', ' /api calls from pages and JS'),
    (' ссылок на статику со страниц', ' static links across pages'),
    (' id уникальны на своих страницах', ' ids unique per page'),
    ('разметка ', 'markup of '),
    (' страниц сходится', ' pages is balanced'),
    ('скобки в ', 'braces in '),
    ('переменные CSS: ', 'CSS variables: '),
    (' использований', ' uses'),
    (' ссылок из CSS на файлы', ' CSS file references'),
    (' импортов разрешаются', ' imports resolve'),
    ('node --check: режим --fast', 'node --check: skipped by --fast'),
    ('node --check: node не найден в PATH', 'node --check: node not found in PATH'),
    (' модулей', ' modules'),
    ('словарь EN найден', 'EN dictionary found'),
    ('в проекте нет en.js', 'no en.js in the project'),
    ('словари: node не найден в PATH', 'dictionaries: node not found in PATH'),
    ('словари загружаются', 'dictionaries load'),
    (' пар «русский → english»', ' ru → en pairs'),
    (' ключей заполнены', ' keys filled'),
    (' переводов находят свой текст', ' translations find their text'),
    (' строк консоли в ru и en', ' console strings in ru and en'),
    (' использований строк консоли', ' console string usages'),
    ('длительность: 240ms / 1.5s', 'duration: 240ms / 1.5s'),
    ('фильтр лога', 'log filter'),
    ('стартовый отчёт', 'startup report'),
    ('файлы панели на месте', 'panel files present'),
    ('страница с id="r34-dev-panel"', 'page with id="r34-dev-panel"'),
    ('CSS с правилом .r34-dev-panel', 'CSS with the .r34-dev-panel rule'),
    ('модуль с class DevPanel', 'module with class DevPanel'),
    ('подключена на странице и импортом', 'wired on the page and by import'),
    ('не прячется в играх', 'stays visible in games'),
    ('перетаскивается и запоминает место', 'draggable and remembers its place'),
    ('стили и телефонный режим', 'styles and phone layout'),
    (' подписей переведены', ' labels translated'),
    (' модулей .py импортируются', ' .py modules are imported'),
    (' функций и классов используются', ' functions and classes are used'),
    (' экспортов JS используются', ' JS exports are used'),
    (' модулей JS подключены', ' JS modules are connected'),
    (' CSS подключены', ' CSS files are linked'),
    (' переменных CSS используются', ' CSS variables are used'),
    ('JSON-файлов в проекте нет', 'no JSON files in the project'),
    ('JSON в проекте (', 'JSON in project ('),
    (' файлов)', ' files)'),
    ('сервер поднимается', 'server starts'),
    ('/login отдаёт страницу', '/login serves the page'),
    ('CSS со страницы с Content-Type', 'CSS from the page has a Content-Type'),
    ('JS со страницы отдаётся как модуль', 'JS from the page is served as a module'),
    ('API без входа → 401', 'API without login → 401'),
    ('нет API → 404 JSON', 'missing API → 404 JSON'),
    ('нет модуля → 404 text/plain', 'missing module → 404 text/plain'),
    ('пустой вход → 400', 'empty login → 400'),
    ('неизвестная страница → редирект', 'unknown page → redirect'),
    ('секреты не отдаются по HTTP', 'secrets are not served over HTTP'),
    ('заголовки статики и API', 'static and API headers'),
    ('лог сервера чистый', 'server log is clean'),

    # Причины провала
    (' — файл целиком: модуль никто не импортирует '
     '(проверьте имя в импортах или удалите файл)',
     ' — whole file: nothing imports this module '
     '(check the import name or delete the file)'),
    (' — файл целиком: никто не импортирует и нет <script>',
     ' — whole file: nobody imports it and no <script>'),
    (' — файл целиком: нет <link> ни на одной странице',
     ' — whole file: no <link> on any page'),
    (' нигде не используется', ' is never used'),
    (' определена, но нигде не используется', ' is defined but never used'),
    (' нигде не определена и без запасного значения: свойство будет '
     'проигнорировано',
     ' is defined nowhere and has no fallback: the property is dropped'),
    (' не существует: файла нет ни рядом со страницей, ни в R34',
     ' does not exist: no such file next to the page or in R34'),
    (' — пара ', ' — pair '),
    (': нужны два непустых текста', ': needs two non-empty texts'),
    (' — пустое значение у "', ' — empty value for "'),
    (' — перевод «', ' — translation "'),
    ('»: такого текста нет ни в разметке, ни в JS',
     '": this text is not in the markup or JS'),
    ('" есть только в одном языке', '" exists in only one language'),
    (' — строки "', ' — string "'),
    ('" нет в console_ui.STRINGS', '" is missing from console_ui.STRINGS'),
    ('console_ui.t — неизвестный ключ не возвращается как есть',
     'console_ui.t — an unknown key is not returned as is'),
    ('получено ', 'got '),
    (' попадёт в лог', ' reaches the log'),
    ('/api/settings ошибочно считается шумом',
     '/api/settings is wrongly treated as noise'),
    ('запрос к /api не логируется по умолчанию',
     'API requests are not logged by default'),
    ('404 на статике не логируется', 'static 404s are not logged'),
    ('успешная статика логируется без --verbose',
     'successful static is logged without --verbose'),
    ('с --verbose статика не логируется', 'static is not logged with --verbose'),
    ('адрес сервера', 'server address'),
    ('блок проверок', 'checks block'),
    ('блок запуска', 'launch block'),
    ('в отчёте нет ', 'the report has no '),
    ('панели нет в этой версии (ни разметки, ни CSS, ни DevPanel)',
     'no panel in this build (no markup, CSS or DevPanel)'),
    (' — не найден в проекте', ' — not found in the project'),
    (' — никто не импортирует модуль панели', ' — nobody imports the panel module'),
    (' — панель не создаётся (нет new DevPanel)',
     ' — the panel is never created (no new DevPanel)'),
    (' — не подключены стили ', ' — styles are not linked: '),
    (' — в GAME_SELECTORS ', ' — in GAME_SELECTORS '),
    (' селектор(ов), оверлеи игр не распознать',
     ' selector(s): game overlays cannot be detected'),
    (' — нет MutationObserver: панель не заметит открытие игры',
     ' — no MutationObserver: the panel will not notice a game opening'),
    (' — нет правила .r34-dev-panel', ' — no .r34-dev-panel rule'),
    (' — нет @media: телефонный режим не оформлен',
     ' — no @media: phone layout is not styled'),
    (' — подписи "', ' — label "'),
    ('" нет в словарях', '" is missing from the dictionaries'),
    ('run_windows.bat — файла нет', 'run_windows.bat — file missing'),
    ('run_termux.sh — файла нет', 'run_termux.sh — file missing'),
    (' — не UTF-8 (байт ', ' — not UTF-8 (byte '),
    (' в позиции ', ' at position '),
    (' — нет «chcp 65001»: консоль покажет мусор',
     ' — no "chcp 65001": the console will show garbage'),
    (' — не запускает «server.py %*»', ' — does not run "server.py %*"'),
    (' — перевод строки LF вместо CRLF', ' — LF line endings instead of CRLF'),
    (' — не проверяет зависимости перед запуском',
     ' — does not check dependencies before start'),
    (' — не запускает server.py', ' — does not run server.py'),
    ('режим --fast', '--fast mode'),
    ('сервер упал: ', 'server crashed: '),
    ('Turso ругается на пустой URL — синхронизация включена без адреса',
     'Turso complains about an empty URL: sync is on without an address'),
    ('в логе нет стартового отчёта', 'no startup report in the log'),
    ('не ответил за 30 с', 'no response in 30 s'),
    (' — не закрыт блок «{»', ' — unclosed block "{"'),
    (' — лишняя «}»', ' — extra "}"'),
    (' у пустого тега', ' on a void tag'),
    ('лог: ', 'log: '),
    ('(лог недоступен)', '(log unavailable)'),
    ('шум ', 'noise '),
    ('): файла нет', '): file missing'),
    (': файла нет', ': file missing'),
    ('" встречается ', '" appears '),
    (' раза (строки ', ' times (lines '),
    (' — нет <link> на CSS', ' — no <link> to CSS'),
    (' — нет <script> на JS', ' — no <script> for JS'),
    (' — нет X-Content-Type-Options: nosniff',
     ' — no X-Content-Type-Options: nosniff'),
    (' → 200: файл из .secrets отдаётся', ' → 200: a .secrets file is served'),
    (', ждали no-store', ', expected no-store'),
    (', ждали ', ', expected '),
    ('в теле нет ', 'the body has no '),
    ('пусто', 'empty'),
    ('HTML нет', 'no HTML'),
    ('такого маршрута нет в server.py', 'no such route in server.py'),
    (' — префикс ', ' — prefix '),
    (' не совпадает ни с одним маршрутом', ' matches no route'),
    (' не зарегистрирован ни одним blueprint', ' is not registered by any blueprint'),
    ('маршрут ', 'route '),
    ('без переменных', 'without variables'),
    ('» у пустого тега', '" on a void tag'),
    (' не закрыт: встретился </', ' is not closed: met </'),
    (' без открывающего', ' without an opening tag'),
    (' не закрыт до конца файла', ' is not closed at the end of the file'),
]

_EN = sorted(TRANSLATIONS, key=lambda pair: -len(pair[0]))


def _(text):
    """Строка вывода на выбранном языке.

    Хвост после « · » — строка исходника; её не переводим, иначе поедет код.
    Нет перевода — остаётся русский текст: это заметно и легко дописать.
    """
    if LANG == 'ru':
        return text
    head, separator, tail = text.partition(' · ')
    for source, target in _EN:
        if source in head:
            head = head.replace(source, target)
    return head + separator + tail


# ---------------------------------------------------------------------------
# Вывод
# ---------------------------------------------------------------------------

class Runner:
    def __init__(self, opts):
        self.opts = opts
        self.groups = []
        self.total = 0
        self.failed = 0
        self.skipped = 0

    def start(self, title):
        self.groups.append({'title': title, 'rows': [], 'skipped': False,
                            'started': time.time(), 'elapsed': 0.0})

    def finish(self):
        group = self.groups[-1]
        group['elapsed'] = time.time() - group['started']
        rows = group['rows']
        # Строка с problems=None — пропуск: она не прошла и не провалилась,
        # поэтому в числитель «passed» попадать не должна (иначе выходило
        # «2/1 · 1 пропущено»).
        passed = sum(1 for _, problems in rows
                     if problems is not None and not problems)
        skipped = sum(1 for _, problems in rows if problems is None)
        checks = len(rows) - skipped
        status = f'{passed}/{checks}' if checks else ''
        if skipped:
            status = (status + ' · ' if status else '') + f'{skipped} пропущено'
        if group['skipped']:
            color, mark = ui.GREY, ui._symbols()['dot']
        elif passed == checks:
            color, mark = ui.GREEN, ui._symbols()['ok']
        else:
            color, mark = ui.RED, ui._symbols()['bad']
        if self.opts.verbose:
            status += ' · ' + short_time(group['elapsed'])

        title = _(group['title'])
        ui._out()
        ui._out('  ' + ui.paint(title, ui.GREY, bold=True)
                + ' ' * max(2, TITLE_WIDTH - len(title))
                + ui.paint(mark + ' ' + status, color))
        for name, problems in rows:
            self._print_row(name, problems)

    def _print_row(self, name, problems):
        if problems is None:                        # пропуск
            ui._out('    ' + ui.paint(ui._symbols()['dot'], ui.GREY) + ' ' + _(name))
            return
        ok = not problems
        mark = ui.paint(ui._symbols()['ok' if ok else 'bad'],
                        ui.GREEN if ok else ui.RED, bold=not ok)
        ui._out('    ' + mark + ' ' + _(name))
        limit = len(problems) if self.opts.verbose else MAX_PROBLEMS
        for problem in problems[:limit]:
            ui._out('        ' + ui.paint(_(problem), ui.YELLOW))
        if len(problems) > limit:
            ui._out('        ' + ui.paint(
                    _('… и ещё ' + f'{len(problems) - limit}'), ui.GREY))

    # -- проверки ------------------------------------------------------------

    def check(self, name, problems=(), note=''):
        """problems: список «где и почему». Пустой список — проверка прошла."""
        if isinstance(problems, str):
            problems = [problems]
        problems = list(problems)
        self.total += 1
        if problems:
            self.failed += 1
        self.groups[-1]['rows'].append((name + (f'  {note}' if note else ''),
                                       problems))
        return not problems

    def skip(self, reason):
        self.total += 1
        self.skipped += 1
        self.groups[-1]['rows'].append((reason, None))

    def skip_group(self, reason):
        group = self.groups[-1]
        group['skipped'] = True
        self.total += 1
        self.skipped += 1
        group['rows'].append((reason, None))

    # -- итог ----------------------------------------------------------------

    def summary(self, elapsed):
        checks = self.total - self.skipped
        passed = checks - self.failed
        broken = self.opts.strict and self.skipped
        failed = self.failed + (self.skipped if broken else 0)
        color = ui.GREEN if failed == 0 else ui.RED

        parts = [f'{passed}/{checks}']
        if self.failed:
            parts.append(_(f'{self.failed} провалено'))
        if self.skipped:
            parts.append(_(f'{self.skipped} пропущено'
                           + (' (провал)' if broken else '')))
        parts.append(f'{elapsed:.1f} ' + ('s' if LANG == 'en' else 'с'))
        ui._out()
        ui._out('  ' + ui.paint(_('Итог: ') + ' · '.join(parts), color, bold=True))

        if self.failed:
            ui._out()
            ui._out('  ' + ui.paint(_('Что не так:'), ui.RED, bold=True))
            for group in self.groups:
                for name, problems in group['rows']:
                    if problems:
                        ui._out('    ' + ui.paint(_(group['title']), ui.RED,
                                                 bold=True)
                                + ' › ' + _(name))
                        for problem in problems:
                            ui._out('        ' + ui.paint(_(problem), ui.YELLOW))
        elif broken:
            ui._out()
            ui._out('  ' + ui.paint(_('Пропущено, а в режиме --strict это провал:'),
                                    ui.YELLOW))
            for group in self.groups:
                for name, problems in group['rows']:
                    if problems is None:
                        ui._out('    ' + _(group['title']) + ' › ' + _(name))
        else:
            ui._out('  ' + ui.paint(_('Всё в порядке.'), ui.GREEN))
        ui._out()
        return 1 if failed else 0


def short_time(seconds):
    ms, sec = ('ms', 's') if LANG == 'en' else ('мс', 'с')
    return f'{seconds * 1000:.0f} {ms}' if seconds < 0.1 else f'{seconds:.2f} {sec}'


# ---------------------------------------------------------------------------
# Помощники
# ---------------------------------------------------------------------------

def read(path):
    return Path(path).read_text(encoding='utf-8')


def rel(path):
    path = Path(path).resolve()
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def where(path, lineno):
    return f'{rel(path)}:{lineno}'


def numbered(path):
    return enumerate(read(path).splitlines(), 1)


def snippet(path, lineno, limit=70):
    """Строка исходника без отступов.

    Имя функции или переменной само по себе мало говорит: в консоли должно
    быть видно, что именно не используется и где это лежит.
    """
    try:
        line = read(path).splitlines()[lineno - 1]
    except (IndexError, OSError):
        return ''
    text = ' '.join(line.split())
    return text if len(text) <= limit else text[:limit - 1] + '…'


def py_files():
    """Все .py проекта, включая сами тесты: они тоже должны компилироваться."""
    return project_files('*.py')


def read_text(path):
    """Текст файла; кривую кодировку не роняем — заменяем битые байты."""
    try:
        return read(path)
    except UnicodeDecodeError:
        return Path(path).read_bytes().decode('utf-8', 'replace')


def index_page():
    """Главная страница: index.html, а если её переименуют — первая страница."""
    named = [p for p in PAGES if p.name == 'index.html']
    return (named or PAGES or [None])[0]


def resolve_ref(page, ref):
    """Куда указывает ссылка: рядом со страницей, в корне сайта, в корне проекта."""
    ref = strip_query(ref).lstrip('/')
    for base in (page.parent, R34, ROOT):
        candidate = (base / ref).resolve()
        if candidate.exists():
            return candidate
    return (page.parent / ref).resolve()


def strip_query(spec):
    return spec.split('?', 1)[0]


IMPORT_RE = re.compile(
    r"""(?:^|\n)[ \t]*(?:import|export)\s+(?:[^'\";]*?from\s+)?['"]([^'"]+)['"]""")


def line_of(text, offset):
    return text.count('\n', 0, offset) + 1


VAR_DEF_RE = re.compile(r'(--[a-z0-9-]+)\s*:')
VAR_USE_RE = re.compile(r'var\(\s*(--[a-z0-9-]+)\s*(,)?')
CSS_URL_RE = re.compile(r'url\(\s*([^)]+?)\s*\)')
CSS_IMPORT_RE = re.compile(r"@import\s+(?:url\()?\s*(['\"]?)([^'\");\s]+)\1")


def css_no_comments(text):
    # Только комментарии: содержимое url(...) в кавычках нужно сохранить.
    return re.sub(r'/\*.*?\*/',
                  lambda m: '\n' * m.group().count('\n'), text, flags=re.S)


def css_variables():
    """Определения и чтения CSS-переменных: имя -> место, плюс флаг fallback."""
    defined, reads = {}, []
    for path in CSS_FILES:
        text = css_no_comments(read(path))
        for match in VAR_DEF_RE.finditer(text):
            defined.setdefault(match.group(1), (path, line_of(text, match.start())))
        for match in VAR_USE_RE.finditer(text):
            reads.append((match.group(1), path, line_of(text, match.start()),
                          bool(match.group(2))))
    return defined, reads


def css_mentioned(names):
    """Какие из имён есть вне CSS: переменную может задавать или читать JS/HTML."""
    text = ''.join(read(path) for path in list(JS_FILES) + list(PAGES))
    return {name for name in names if name in text}


def css_ref_exists(path, ref):
    ref = strip_query(ref).lstrip('/')
    return any((base / ref).exists() for base in (path.parent, R34, ROOT))


def css_without_comments(text):
    # Комментарии заменяются переводами строк: номера строк должны совпадать.
    text = re.sub(r'/\*.*?\*/',
                  lambda m: '\n' * m.group().count('\n'), text, flags=re.S)
    return re.sub(r'"[^"\n]*"|\'[^\'\n]*\'', '', text)


def exception_place(exc):
    """Последний кадр трейсбека как «файл:строка — Тип: текст»."""
    frames = traceback.extract_tb(exc.__traceback__)
    if not frames:
        return f'{type(exc).__name__}: {exc}'
    frame = frames[-1]
    place = f'{rel(frame.filename)}:{frame.lineno}'
    if frame.line:
        place += f' [{frame.line.strip()}]'
    return f'{place} — {type(exc).__name__}: {exc}'


_NODE = False                                       # False — ещё не искали


def node():
    """Путь к node или None. Ищем один раз: запуск стоит ~0.1 с."""
    global _NODE
    if _NODE is not False:
        return _NODE
    _NODE = None
    for name in ('node', 'node.exe'):
        try:
            subprocess.run([name, '--version'], capture_output=True, check=True)
            _NODE = name
            break
        except Exception:                           # noqa: BLE001
            continue
    return _NODE


def node_script(script, *args):
    """Выполняет маленький ES-модуль и возвращает (данные, ошибка)."""
    tmpdir = Path(tempfile.mkdtemp(prefix='r34-node-'))
    path = tmpdir / 'check.mjs'
    path.write_text(script, encoding='utf-8')
    try:
        result = subprocess.run([node(), str(path), *map(str, args)],
                                capture_output=True, timeout=60)
        if result.returncode != 0:
            return None, result.stderr.decode('utf-8', 'replace').strip()[:300]
        return json.loads(result.stdout.decode('utf-8')), ''
    except Exception as exc:                        # noqa: BLE001
        return None, exception_place(exc)
    finally:
        for item in tmpdir.iterdir():
            item.unlink(missing_ok=True)
        tmpdir.rmdir()


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


# ---------------------------------------------------------------------------
# PYTHON
# ---------------------------------------------------------------------------

API_LITERAL_RE = re.compile(r"""['"`](/api/[^'"`\s]*)['"`]""")

VOID_TAGS = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
             'link', 'meta', 'param', 'source', 'track', 'wbr'}
OPTIONAL_CLOSE = {'li', 'p', 'td', 'th', 'tr', 'dt', 'dd', 'option',
                  'thead', 'tbody', 'tfoot', 'optgroup'}
TAG_RE = re.compile(r'<(/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*)>')


def api_pattern(path):
    """Путь без query и с подстановками вместо динамических частей."""
    path = path.split('?')[0].split('#')[0]
    path = re.sub(r'\$\{[^}]*\}', '*', path)
    path = re.sub(r'<[^>]*>', '*', path)
    return path.rstrip('/') or '/'


def html_markup(text):
    """Разметка без комментариев и тел script/style.

    В инлайн-скриптах встречаются строки вроде '<div class="x">'; это текст,
    а не теги, и в стек они попадать не должны.
    """
    text = re.sub(r'<!--.*?-->', lambda m: '\n' * m.group().count('\n'),
                  text, flags=re.S)
    return re.sub(r'<(script|style)\b[^>]*>.*?</\1\s*>',
                  lambda m: '\n' * m.group().count('\n'), text,
                  flags=re.S | re.I)


def html_tag_problems(path):
    """Незакрытые, лишние и перепутанные теги на странице."""
    text = html_markup(read(path))
    problems, stack = [], []
    for match in TAG_RE.finditer(text):
        closing, name, attrs = match.group(1), match.group(2).lower(), match.group(3)
        if attrs.rstrip().endswith('/'):            # <path />, <img /> и прочее
            continue
        line = line_of(text, match.start())
        if not closing:
            if name not in VOID_TAGS:
                stack.append((name, line))
            continue
        if name in VOID_TAGS:
            problems.append(f'{where(path, line)} — </{name}> у пустого тега')
            continue
        for index in range(len(stack) - 1, -1, -1):
            if stack[index][0] != name:
                continue
            for tag, opened in stack[index + 1:]:
                if tag not in OPTIONAL_CLOSE:
                    problems.append(f'{where(path, opened)} — <{tag}> не закрыт: '
                                    f'встретился </{name}>')
            del stack[index:]
            break
        else:
            problems.append(f'{where(path, line)} — </{name}> без открывающего')
    problems += [f'{where(path, opened)} — <{name}> не закрыт до конца файла'
                 for name, opened in stack if name not in OPTIONAL_CLOSE]
    return problems

def check_python(r):
    files = py_files()
    problems = []
    for path in files:
        source = read(path)
        try:
            compile(source, str(path), 'exec')
        except SyntaxError as exc:
            problems.append(f'{where(path, exc.lineno or 1)}:{exc.offset or 1} — '
                            f'{exc.msg}')
            if exc.text:
                problems.append(f'    {exc.text.strip()}')
    r.check(f'{len(files)} файлов .py компилируются', problems)

    try:
        import server
    except BaseException as exc:                    # noqa: BLE001
        r.check('server импортируется', [exception_place(exc)])
        return
    r.check('server импортируется', [])

    rules = {str(rule.rule) for rule in server.app.url_map.iter_rules()}
    required = ['/', '/login', '/logout', '/proxy', '/api/app-language',
                '/api/settings', '/api/favorites', '/api/my-favorites',
                '/api/puzzle-completed', '/api/game/classify']
    problems = [f'маршрут {path} не зарегистрирован ни одним blueprint'
                for path in required if path not in rules]
    r.check(f'{len(required)} ключевых маршрутов', problems,
            note=f'(всего {len(rules)})')

    server_lines = read(Path(server.__file__)).splitlines()
    problems = []
    for prefix in server.PROTECTED_API_PREFIXES:
        covered = any(rule == prefix or rule.startswith(prefix + '/') for rule in rules)
        if not covered:
            line = next((n for n, text in enumerate(server_lines, 1)
                         if f"'{prefix}'" in text), 0)
            problems.append(f'{where(Path(server.__file__), line)} — префикс {prefix} '
                            'не совпадает ни с одним маршрутом')
    r.check(f'{len(server.PROTECTED_API_PREFIXES)} защищённых /api', problems)

    # Обратная сторона маршрутов: фронтенд не может звать то, чего нет.
    patterns = {api_pattern(rule) for rule in rules}
    problems, calls = [], 0
    for path in list(JS_FILES) + list(PAGES):
        text = read(path)
        for match in API_LITERAL_RE.finditer(text):
            calls += 1
            if api_pattern(match.group(1)) not in patterns:
                problems.append(f'{where(path, line_of(text, match.start()))} — '
                                f'{match.group(1)}: такого маршрута нет в server.py')
    r.check(f'{calls} обращений к /api из страниц и JS', problems)


# ---------------------------------------------------------------------------
# СТАТИКА
# ---------------------------------------------------------------------------

def check_assets(r):
    # Страниц может стать больше: проверяем каждую, а не только главную.
    problems, refs = [], 0
    for page in PAGES:
        for lineno, line in numbered(page):
            for ref in re.findall(r'(?:href|src)="([^"]+)"', line):
                if not ref.lstrip('/').startswith('static/') \
                        and '/static/' not in ref:
                    continue
                refs += 1
                if not resolve_ref(page, ref).exists():
                    problems.append(f'{where(page, lineno)} — {ref} не существует: '
                                    'файла нет ни рядом со страницей, ни в R34')
    r.check(f'{refs} ссылок на статику со страниц', problems)

    problems, total = [], 0
    for page in PAGES:
        ids = {}
        for lineno, line in numbered(page):
            for ident in re.findall(r'\bid="([^"]+)"', line):
                ids.setdefault(ident, []).append(lineno)
        total += len(ids)
        for ident, lines in ids.items():
            if len(lines) > 1:
                problems.append(f'{where(page, lines[0])} — id="{ident}" '
                                f'встречается {len(lines)} раза '
                                f'(строки {", ".join(map(str, lines))})')
    r.check(f'{total} id уникальны на своих страницах', problems)

    problems = []
    for page in PAGES:
        problems += html_tag_problems(page)
    r.check(f'разметка {len(PAGES)} страниц сходится', problems)

    styles = CSS_FILES
    problems = []
    for path in styles:
        stack = []
        # Комментарии снимаем целиком по файлу: блочный комментарий тянется
        # несколько строк и может содержать скобки (в fullscreen.css так
        # объясняется правило «[hidden] { display: none }»), а построчный
        # разбор такой комментарий не распознаёт.
        markup = css_without_comments(read(path))
        for lineno, line in enumerate(markup.splitlines(), 1):
            for char in line:
                if char == '{':
                    stack.append(lineno)
                elif char == '}':
                    if not stack:
                        problems.append(f'{where(path, lineno)} — лишняя «}}»')
                        break
                    stack.pop()
        if stack:
            problems.append(f'{where(path, stack[0])} — не закрыт блок «{{»')
    r.check(f'скобки в {len(styles)} CSS', problems)

    # Переменная без определения и без fallback молча игнорируется браузером.
    defined, reads = css_variables()
    outside = css_mentioned({name for name, *_ in reads})
    problems = [f'{where(path, lineno)} — var({name}) нигде не определена и без '
                'запасного значения: свойство будет проигнорировано'
                for name, path, lineno, fallback in reads
                if name not in defined and not fallback and name not in outside]
    r.check(f'переменные CSS: {len(reads)} использований', problems)

    problems, refs = [], 0
    for path in CSS_FILES:
        text = css_no_comments(read(path))
        for match in CSS_URL_RE.finditer(text):
            ref = match.group(1).strip().strip('\'"')
            if not ref or ref.startswith(('data:', 'http:', 'https:', '//', '#')):
                continue
            refs += 1
            if not css_ref_exists(path, ref):
                problems.append(f'{where(path, line_of(text, match.start()))} — '
                                f'url({ref}): файла нет')
        for match in CSS_IMPORT_RE.finditer(text):
            ref = match.group(2)
            refs += 1
            if not css_ref_exists(path, ref):
                problems.append(f'{where(path, line_of(text, match.start()))} — '
                                f'@import {ref}: файла нет')
    r.check(f'{refs} ссылок из CSS на файлы', problems)


# ---------------------------------------------------------------------------
# JS
# ---------------------------------------------------------------------------

def check_js(r):
    files = JS_FILES
    problems, imports = [], 0
    for path in files:
        text = read(path)
        for match in IMPORT_RE.finditer(text):
            spec = match.group(1)
            if not spec.startswith('.'):
                continue
            imports += 1
            target = (path.parent / strip_query(spec)).resolve()
            if not target.exists():
                problems.append(f'{where(path, line_of(text, match.start()))} — '
                                f'import {spec}: файла нет')
    r.check(f'{imports} импортов разрешаются', problems)

    if r.opts.fast:
        r.skip('node --check: режим --fast')
        return
    exe = node()
    if not exe:
        r.skip('node --check: node не найден в PATH')
        return

    modules = files
    tmpdir = Path(tempfile.mkdtemp(prefix='r34-js-'))
    problems = []
    try:
        for index, path in enumerate(modules):
            # node --check для ESM смотрит на расширение, поэтому копия .mjs.
            # Индекс в имени: у модулей из разных папок может совпасть stem,
            # и вторая копия молча перезаписала бы первую — ошибка досталась
            # бы не тому файлу.
            copy = tmpdir / f'{index:03d}-{path.stem}.mjs'
            copy.write_bytes(path.read_bytes())
            result = subprocess.run([exe, '--check', str(copy)],
                                    capture_output=True)
            if result.returncode:
                stderr = result.stderr.decode('utf-8', 'replace')
                match = re.search(r'\.mjs:(\d+)', stderr)
                message = stderr.strip().splitlines()[-1] if stderr.strip() else ''
                place = where(path, int(match.group(1))) if match else rel(path)
                problems.append(f'{place} — {message}')
    finally:
        for item in tmpdir.iterdir():
            item.unlink(missing_ok=True)
        tmpdir.rmdir()
    r.check(f'node --check: {len(modules)} модулей', problems)


# ---------------------------------------------------------------------------
# ПЕРЕВОДЫ
# ---------------------------------------------------------------------------

CONSOLE_KEY_RES = [
    re.compile(r"ui\.t\([^,]+,\s*'([a-z0-9_]+)'"),
    re.compile(r"_section\(lang,\s*'([a-z0-9_]+)'"),
    re.compile(r"rows\s*=\s*\[\('([a-z_]+)'"),
    re.compile(r"rows\.append\(\('([a-z_]+)'"),
]


def locale_files():
    """Словарь EN и файлы пар рядом с ним — без списка имён."""
    for path in JS_FILES:
        if path.name == 'en.js':
            siblings = [p.name for p in sorted(path.parent.glob('*.js'))
                        if p.name != path.name]
            return path, siblings
    return None, []


def check_i18n(r):
    en_path, pair_files = locale_files()
    if en_path is None:
        r.check('словарь EN найден', ['в проекте нет en.js'])
        return
    if not node():
        r.skip('словари: node не найден в PATH')
    else:
        # Словари — ES-модули: пары бывают разбиты на две строки, объект EN
        # собирается в рантайме, поэтому импортируем их по-настоящему.
        script = '''
const base = process.argv[2];
const out = { pairs: 0, bad: [], keys: 0, empty: [] };
for (const name of __PAIR_FILES__) {
    const mod = await import(base + '/' + name);
    for (const key of Object.keys(mod)) {
        const list = mod[key];
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            out.pairs += 1;
            const ok = Array.isArray(entry) && entry.length === 2
                && entry.every(v => typeof v === 'string' && v.trim());
            if (!ok) out.bad.push({ file: name, entry: JSON.stringify(entry).slice(0, 70) });
        }
    }
}
const en = (await import(base + '/' + __EN_FILE__)).EN;
const keys = Object.keys(en);
out.keys = keys.length;
out.all = keys;
for (const key of keys) {
    const value = en[key];
    if (typeof value !== 'string' || !value.trim()) out.empty.push(key);
}
console.log(JSON.stringify(out));
'''
        script = (script.replace('__PAIR_FILES__', json.dumps(pair_files))
                        .replace('__EN_FILE__', json.dumps(en_path.name)))
        data, error = node_script(script, en_path.parent.as_uri())
        if data is None:
            r.check('словари загружаются', [error])
        else:
            problems = [f'{rel(en_path.parent / item["file"])} — пара '
                        f'{item["entry"]}: нужны два непустых текста'
                        for item in data['bad']]
            r.check(f'{data["pairs"]} пар «русский → english»', problems)
            problems = [f'{rel(en_path)} — пустое значение у "{key}"'
                        for key in data['empty']]
            r.check(f'EN: {data["keys"]} ключей заполнены', problems)

            # Ключи словаря — русский текст интерфейса. Если такого текста больше
            # нет ни в разметке, ни в JS, перевод остался от удалённой строки.
            sources = ''.join(read(p) for p in list(PAGES) + list(JS_FILES))
            flat = re.sub(r'\s+', ' ', sources)
            problems = [f'{rel(en_path)} — перевод «{key[:60]}»: такого текста нет '
                        'ни в разметке, ни в JS'
                        for key in data.get('all', [])
                        if '${' not in key
                        and re.sub(r'\s+', ' ', key).strip() not in flat]
            r.check(f'{data["keys"]} переводов находят свой текст', problems)

    ru, en = set(ui.STRINGS['ru']), set(ui.STRINGS['en'])
    problems = [f'console_ui.STRINGS — "{key}" есть только в одном языке'
                for key in sorted(ru ^ en)]
    r.check(f'{len(ru)} строк консоли в ru и en', problems)

    sources = [p for p in py_files() if 'tests' not in p.parts]
    problems, sites = [], 0
    for path in sources:
        for lineno, line in numbered(path):
            for pattern in CONSOLE_KEY_RES:
                for key in pattern.findall(line):
                    sites += 1
                    if key not in ru:
                        problems.append(f'{where(path, lineno)} — строки "{key}" '
                                        'нет в console_ui.STRINGS')
    if ui.t('ru', 'нет_такого_ключа') != 'нет_такого_ключа':
        problems.append('console_ui.t — неизвестный ключ не возвращается как есть')
    r.check(f'{sites} использований строк консоли', problems)


# ---------------------------------------------------------------------------
# КОНСОЛЬ
# ---------------------------------------------------------------------------

def check_console(r):
    from handlers import console_ui as cui

    got = (cui._duration_text(240), cui._duration_text(1500))
    r.check('длительность: 240ms / 1.5s',
            [] if got == ('240ms', '1.5s') else [f'получено {got[0]} / {got[1]}'])

    problems = []
    for path in ('/sw.js', '/.well-known/x', '/static/js/a.js.map'):
        if not cui._is_noise(path):
            problems.append(f'шум {path} попадёт в лог')
    if cui._is_noise('/api/settings'):
        problems.append('/api/settings ошибочно считается шумом')
    cui.configure('ru', False)
    if not cui.should_log('/api/settings', 200):
        problems.append('запрос к /api не логируется по умолчанию')
    if not cui.should_log('/static/js/main.js', 404):
        problems.append('404 на статике не логируется')
    if cui.should_log('/static/js/main.js', 200):
        problems.append('успешная статика логируется без --verbose')
    cui.configure('ru', True)
    if not cui.should_log('/static/js/main.js', 200):
        problems.append('с --verbose статика не логируется')
    cui.configure('ru', False)
    r.check('фильтр лога', problems)

    buffer = io.StringIO()
    try:
        with redirect_stdout(buffer):
            cui.startup_report('ru', {
                'mode': 'local', 'https': False,
                'local_url': 'http://127.0.0.1:1234', 'lan_urls': [],
                'user_id': '1', 'turso': 'off', 'secrets_dir': 'x',
                'cache_dir': '', 'verbose': False, 'python': '3.13.0',
                'deps': [('Flask', True, False)],
            })
        problems = []
    except Exception as exc:                        # noqa: BLE001
        problems = [exception_place(exc)]
    text = buffer.getvalue()
    for word, meaning in (('127.0.0.1:1234', 'адрес сервера'),
                          ('ПРОВЕРКИ', 'блок проверок'),
                          ('ЗАПУСК', 'блок запуска')):
        if word not in text:
            problems.append(f'в отчёте нет {meaning} ({word})')
    r.check('стартовый отчёт', problems)


# ---------------------------------------------------------------------------
# СЛУЖЕБНАЯ ПАНЕЛЬ
# ---------------------------------------------------------------------------

def check_panel(r):
    # Ищем по содержимому, а не по путям: файлы панели можно перенести
    # или переименовать, и проверка не должна из-за этого падать.
    panel = next((p for p in JS_FILES if re.search(r'class\s+DevPanel\b', read(p))),
                 None)
    css = next((p for p in CSS_FILES if '.r34-dev-panel' in read(p)), None)
    page = next((p for p in PAGES if 'id="r34-dev-panel"' in read(p)), None)
    if panel is None and css is None and page is None:
        # Старая сборка без панели: это не поломка, а другая версия проекта.
        # Частичное наличие — уже провал, ниже.
        r.skip_group('панели нет в этой версии (ни разметки, ни CSS, ни DevPanel)')
        return

    problems = []
    for what, found in (('страница с id="r34-dev-panel"', page),
                        ('CSS с правилом .r34-dev-panel', css),
                        ('модуль с class DevPanel', panel)):
        if found is None:
            problems.append(f'{what} — не найден в проекте')
    if problems:
        r.check('файлы панели на месте', problems)
        return

    importer = next((p for p in JS_FILES if p != panel and re.search(
        rf"from\s+'[^']*{re.escape(panel.stem)}\.js", read(p))), None)
    problems = []
    if importer is None:
        problems.append(f'{rel(panel)} — никто не импортирует модуль панели')
    elif not re.search(r'new DevPanel\(', read(importer)):
        problems.append(f'{rel(importer)} — панель не создаётся '
                        '(нет new DevPanel)')
    if not re.search(rf'href="[^"]*{re.escape(css.name)}', read(page)):
        problems.append(f'{rel(page)} — не подключены стили {css.name}')
    r.check('подключена на странице и импортом', problems)

    text = read(panel)
    problems = []
    # В мини-играх панель должна оставаться на экране: раньше она пряталась
    # по списку игровых оверлеев, и в пазле/угадайке отладки не было вовсе.
    if re.search(r'GAME_SELECTORS|_gameOverlay|_gameOpen', text):
        problems.append(f'{rel(panel)} — панель всё ещё прячется при открытии игры '
                        '(GAME_SELECTORS/_gameOverlay): в мини-играх её не видно')
    if '!inFullscreen' not in text:
        problems.append(f'{rel(panel)} — не видно условия видимости: панель должна '
                        'скрываться только в полноэкранном просмотре')
    r.check('не прячется в играх', problems)

    problems = []
    # Перетаскивание нужно и пальцем: на телефоне DevTools нет, а лист на всю
    # ширину закрывает игровое поле.
    if re.search(r"pointerType\s*===\s*'touch'", text):
        problems.append(f'{rel(panel)} — перетаскивание отключается для касаний '
                        "(pointerType === 'touch')")
    if text.count('POS_KEY') < 3:
        problems.append(f'{rel(panel)} — позиция не сохраняется и не '
                        'восстанавливается (POS_KEY)')
    if '_panelWidth' not in text:
        problems.append(f'{rel(panel)} — ширина панели не считается при переносе: '
                        'на телефоне лист схлопнется по содержимому')
    r.check('перетаскивается и запоминает место', problems)

    style = read(css)
    problems = []
    if '.r34-dev-panel' not in style:
        problems.append(f'{rel(css)} — нет правила .r34-dev-panel')
    if '@media' not in style:
        problems.append(f'{rel(css)} — нет @media: телефонный режим не оформлен')
    if 'touch-action' not in style:
        problems.append(f'{rel(css)} — у заголовка нет touch-action: палец будет '
                        'скроллить страницу вместо перетаскивания')
    r.check('стили и телефонный режим', problems)

    # Подписи ищем по всем модулям: не важно, в каком словаре они лежат.
    dictionary = ''.join(read(p) for p in JS_FILES)
    problems, labels = [], 0
    for lineno, line in numbered(panel):
        for label in re.findall(r"tr\('([^'\\]{2,60})'\)", line):
            labels += 1
            if f'"{label}"' not in dictionary:
                problems.append(f'{where(panel, lineno)} — подписи "{label}" '
                                'нет в словарях')
    r.check(f'{labels} подписей переведены', problems)


# ---------------------------------------------------------------------------
# МЁРТВЫЙ КОД
# ---------------------------------------------------------------------------

# Декораторы, которые связывают функцию с фреймворком: такие функции
# вызываются не по имени, искать их использование бессмысленно.
ROUTE_DECORATORS = {'route', 'errorhandler', 'before_request', 'after_request',
                    'teardown_request', 'command', 'context_processor',
                    'template_filter', 'template_global'}

EXPORT_RE = re.compile(
    r'^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)',
    re.M)

DYNAMIC_IMPORT_RE = re.compile(r"import\(\s*['\"]([^'\"]+)['\"]")


def dotted_name(path):
    return '.'.join(path.relative_to(ROOT).with_suffix('').parts)


def imported_names(path, tree):
    """Всё, что файл импортирует: модули и отдельные имена."""
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                parts = alias.name.split('.')
                names.update('.'.join(parts[:i]) for i in range(1, len(parts) + 1))
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ''
            if node.level:
                # from .core_utils import x — считаем от пакета файла.
                package = path.parent.relative_to(ROOT).parts
                base = package[:len(package) - (node.level - 1)] if node.level else package
                module = '.'.join(base + tuple(module.split('.') if module else ()))
            if module:
                parts = module.split('.')
                names.update('.'.join(parts[:i]) for i in range(1, len(parts) + 1))
                names.update(f'{module}.{alias.name}' for alias in node.names)
            names.update(alias.name for alias in node.names)
    return names


def scan_python():
    """Один обход всех .py: определения, используемые имена, импорты.

    Определения — функции и классы верхнего уровня, кроме обработчиков
    маршрутов: они вызываются декоратором, а не по имени.
    """
    definitions, used, imported = [], set(), set()
    for path in py_files():
        tree = ast.parse(read(path), str(path))
        imported |= imported_names(path, tree)
        for node in ast.walk(tree):
            if isinstance(node, ast.Name):
                used.add(node.id)
            elif isinstance(node, ast.Attribute):
                used.add(node.attr)
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                                     ast.ClassDef)):
                continue
            if node.name.startswith('__'):
                continue
            decorators = set()
            for decorator in node.decorator_list:
                target = decorator.func if isinstance(decorator, ast.Call) else decorator
                decorators.add(getattr(target, 'attr', None)
                               or getattr(target, 'id', ''))
            if decorators & ROUTE_DECORATORS:
                continue
            definitions.append((node.name, path, node.lineno))
    used |= imported
    return definitions, used, imported


def entry_points():
    """Модули, которые запускают, а не импортируют.

    Признаки: защита `if __name__ == '__main__'` или упоминание файла
    в лаунчере. Новый скрипт с такой защитой сам перестаёт считаться
    «мёртвым модулем» — список вести не нужно.
    """
    found = set()
    for path in py_files():
        if re.search(r"if\s+__name__\s*==\s*['\"]__main__['\"]", read(path)):
            found.add(dotted_name(path))
    for pattern in ('*.bat', '*.sh', '*.ps1', '*.command', '*.cmd'):
        for path in project_files(pattern):
            for name in re.findall(r'([\w./\\-]+\.py)\b', read_text(path)):
                for base in (path.parent, ROOT):
                    candidate = (base / name.replace('\\', '/')).resolve()
                    if candidate.is_file() and ROOT in candidate.parents:
                        found.add(dotted_name(candidate))
                        break
    return found


def check_dead(r):
    entry = entry_points()
    modules = {dotted_name(path): path for path in py_files()
               if not {'tests', 'test'} & set(path.relative_to(ROOT).parts)
               and path.stem != '__init__' and dotted_name(path) not in entry}
    definitions, used, imported = scan_python()
    problems = [f'{rel(path)} — файл целиком: модуль никто не импортирует '
                '(проверьте имя в импортах или удалите файл)'
                for name, path in modules.items() if name not in imported]
    r.check(f'{len(modules)} модулей .py импортируются', problems)

    problems = [f'{where(path, lineno)} — {name} нигде не используется · '
                f'{snippet(path, lineno)}'
                for name, path, lineno in definitions if name not in used]
    r.check(f'{len(definitions)} функций и классов используются', problems)

    texts = {path: read(path) for path in JS_FILES}
    pages = {path: read(path) for path in PAGES}

    # Вхождения имён считаем один раз: перебор «каждый экспорт × каждый файл»
    # делал эту проверку самой медленной. Использованием считается вхождение
    # в другом файле; вызов внутри своего модуля живым export не делает.
    totals = Counter()
    for text in list(texts.values()) + list(pages.values()):
        totals.update(re.findall(r'[A-Za-z_$][\w$]*', text))

    problems = []
    exports = 0
    for path, text in texts.items():
        own = Counter(re.findall(r'[A-Za-z_$][\w$]*', text))
        for match in EXPORT_RE.finditer(text):
            exports += 1
            name = match.group(1)
            # Из общего числа вхождений вычитаем собственные: объявление и
            # вызовы внутри своего модуля живым export не делают, иначе
            # мёртвый экспорт, который зовут только у себя, считался бы нужным.
            if totals[name] - own[name] <= 0:
                lineno = line_of(text, match.start())
                problems.append(f'{where(path, lineno)} — export {name} нигде '
                                f'не используется · {snippet(path, lineno)}')
    r.check(f'{exports} экспортов JS используются', problems)

    targets = set()
    for path, text in texts.items():
        specs = IMPORT_RE.findall(text) + DYNAMIC_IMPORT_RE.findall(text)
        for spec in specs:
            if spec.startswith('.'):
                targets.add((path.parent / strip_query(spec)).resolve())
    for page, text in pages.items():
        for src in re.findall(r'src="([^"]+\.js)(?:\?[^"]*)?"', text):
            targets.add(resolve_ref(page, src))

    problems = [f'{rel(path)} — файл целиком: никто не импортирует и нет <script>'
                for path in texts if path.resolve() not in targets]
    r.check(f'{len(texts)} модулей JS подключены', problems)

    linked = set()
    for page, text in pages.items():
        for href in re.findall(r'href="([^"]+\.css)(?:\?[^"]*)?"', text):
            linked.add(resolve_ref(page, href))
    problems = [f'{rel(path)} — файл целиком: нет <link> ни на одной странице'
                for path in CSS_FILES if path.resolve() not in linked]
    r.check(f'{len(CSS_FILES)} CSS подключены', problems)

    defined, reads = css_variables()
    used = {name for name, *_ in reads}
    outside = css_mentioned(set(defined))
    problems = [f'{where(path, lineno)} — {name} определена, но нигде '
                f'не используется · {snippet(path, lineno)}'
                for name, (path, lineno) in sorted(defined.items())
                if name not in used and name not in outside]
    r.check(f'{len(defined)} переменных CSS используются', problems)


# ---------------------------------------------------------------------------
# ЛАУНЧЕРЫ
# ---------------------------------------------------------------------------

def check_launchers(r):
    bat = ROOT / 'run_windows.bat'
    problems = []
    if not bat.exists():
        problems.append('run_windows.bat — файла нет')
    else:
        raw = bat.read_bytes()
        try:
            text = raw.decode('utf-8')
        except UnicodeDecodeError as exc:
            line = raw.count(b'\n', 0, exc.start) + 1
            problems.append(f'{where(bat, line)} — не UTF-8 '
                            f'(байт {raw[exc.start]:#04x} в позиции {exc.start})')
            text = raw.decode('cp866', 'replace')
        if 'chcp 65001' not in text:
            problems.append(f'{rel(bat)} — нет «chcp 65001»: консоль покажет мусор')
        if 'server.py %*' not in text:
            problems.append(f'{rel(bat)} — не запускает «server.py %*»')
        for lineno, line in enumerate(raw.split(b'\n'), 1):
            if line and not line.endswith(b'\r'):
                problems.append(f'{where(bat, lineno)} — перевод строки LF вместо CRLF')
                break
    r.check('run_windows.bat', problems)

    sh = ROOT / 'run_termux.sh'
    problems = []
    if not sh.exists():
        problems.append('run_termux.sh — файла нет')
    else:
        text = read(sh)
        if 'import flask' not in text:
            problems.append(f'{rel(sh)} — не проверяет зависимости перед запуском')
        if 'server.py' not in text:
            problems.append(f'{rel(sh)} — не запускает server.py')
    r.check('run_termux.sh', problems)


# ---------------------------------------------------------------------------
# ЛОКАЛЬНЫЕ ДАННЫЕ
# ---------------------------------------------------------------------------

def check_data(r):
    # Любой JSON в проекте: кеши game_data, настройки, новые конфиги.
    files = project_files('*.json')
    if not files:
        r.skip('JSON-файлов в проекте нет')
        return
    problems = []
    for path in files:
        try:
            json.loads(read(path))
        except json.JSONDecodeError as exc:
            problems.append(f'{where(path, exc.lineno)}:{exc.colno} — {exc.msg}')
        except Exception as exc:                    # noqa: BLE001
            problems.append(f'{rel(path)} — {type(exc).__name__}: {exc}')
    r.check(f'JSON в проекте ({len(files)} файлов)', problems)


# ---------------------------------------------------------------------------
# ЖИВОЙ СЕРВЕР
# ---------------------------------------------------------------------------

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def saved_language():
    """Язык из настроек: сервер сохранит его же, и прогон не сменит язык."""
    for path in project_files('*.json'):
        if path.name != 'language.json':
            continue
        try:
            return json.loads(read(path)).get('lang') or 'en'
        except Exception:                           # noqa: BLE001
            return 'en'
    return 'en'


def check_live(r):
    if r.opts.fast:
        r.skip_group('режим --fast')
        return

    port = free_port()
    log_path = Path(tempfile.gettempdir()) / f'r34-test-{port}.log'
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
    with open(log_path, 'wb') as log_file:
        proc = subprocess.Popen(
            [sys.executable, 'server.py', '--mode', 'local',
             '--lang', saved_language(), '--port', str(port)],
            cwd=str(ROOT), stdin=subprocess.DEVNULL,
            stdout=log_file, stderr=subprocess.STDOUT, env=env,
        )
        try:
            _http_checks(r, port, log_path)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

    log = log_path.read_text(encoding='utf-8', errors='replace')
    log_path.unlink(missing_ok=True)

    problems = []
    lines = log.splitlines()
    for index, line in enumerate(lines):
        if 'Traceback (most recent call last)' in line:
            tail = lines[index + 1:index + 3]
            problems.append(f'сервер упал: {line.strip()} / ' + ' / '.join(
                item.strip() for item in tail))
            break
    if 'Invalid URL' in log:
        problems.append('Turso ругается на пустой URL — синхронизация включена '
                        'без адреса')
    if 'RULE34 GALLERY' not in log.upper():
        problems.append('в логе нет стартового отчёта')
    r.check('лог сервера чистый', problems)


def _http_checks(r, port, log_path):
    # Прокси отключён: Windows отдаёт настройки прокси из реестра, и urllib
    # гонит запросы к 127.0.0.1 через него — соединение просто висит.
    # Редиректы запрещены: /login при сохранённых ключах ведёт на /, а /
    # проверяет ключ и при неудаче удаляет .secrets/api_credentials.json.
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), NoRedirect)
    base = f'http://127.0.0.1:{port}'

    def log_hint(path):
        """Строки лога про этот путь — они и объясняют причину."""
        try:
            lines = log_path.read_text(encoding='utf-8', errors='replace').splitlines()
        except Exception:                           # noqa: BLE001
            return []
        hits = [line.strip() for line in lines if path in line]
        return ['лог: ' + line for line in hits[-2:]]

    ready = False
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            with opener.open(base + '/api/app-language', timeout=1) as resp:
                ready = resp.status == 200
                if ready:
                    break
        except Exception:                           # noqa: BLE001
            time.sleep(0.3)
    if not ready:
        try:
            tail = log_path.read_text(encoding='utf-8', errors='replace')
            tail = tail.splitlines()[-8:]
        except Exception:                           # noqa: BLE001
            tail = ['(лог недоступен)']
        r.check('сервер поднимается', ['не ответил за 30 с'] +
                ['лог: ' + line.strip() for line in tail])
        return
    r.check('сервер поднимается', [])

    def fetch(path, data=None, method=None, headers=None):
        request = urllib.request.Request(base + path, data=data,
                                         method=method, headers=headers or {})
        try:
            with opener.open(request, timeout=15) as resp:
                return resp.status, resp.headers.get('Content-Type', ''), resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.headers.get('Content-Type', ''), exc.read()

    def expect(name, path, status, ctype=None, contains=None, **kwargs):
        got, got_ctype, body = fetch(path, **kwargs)
        problems = []
        if got != status:
            problems.append(f'GET {path} → {got}, ждали {status}')
            problems += log_hint(path)
        if ctype and ctype not in got_ctype:
            problems.append(f'Content-Type: {got_ctype or "пусто"}, ждали {ctype}')
        if contains and contains not in body:
            problems.append(f'в теле нет {contains!r}: {body[:90]!r}')
        r.check(name, problems)

    expect('/login отдаёт страницу', '/login', 200, 'text/html')

    # Статику берём прямо со страницы: переименование или смена версии
    # в ?v= не должны ломать проверку.
    page = index_page()
    html = read(page) if page else ''
    css_ref = re.search(r'href="(static/css/[^"?]+\.css)', html)
    js_ref = re.search(r'src="(static/js/[^"?]+\.js)', html)
    if not css_ref:
        r.check('CSS со страницы с Content-Type',
                [f'{rel(page)} — нет <link> на CSS'] if page else ['HTML нет'])
    else:
        expect('CSS со страницы с Content-Type', '/' + css_ref.group(1), 200, 'css')
    if not js_ref:
        r.check('JS со страницы отдаётся как модуль',
                [f'{rel(page)} — нет <script> на JS'] if page else ['HTML нет'])
    else:
        expect('JS со страницы отдаётся как модуль', '/' + js_ref.group(1), 200,
               'javascript')
    expect('API без входа → 401', '/api/settings', 401, contains=b'"ok"')
    expect('нет API → 404 JSON', '/api/nope', 404, contains=b'"ok"')
    expect('нет модуля → 404 text/plain', '/static/js/nope.js', 404, 'text/plain')
    expect('пустой вход → 400', '/api_key_login_ajax', 400, data=b'{}',
           method='POST', headers={'Content-Type': 'application/json'})
    expect('/api/app-language', '/api/app-language', 200, contains=b'"lang"')
    expect('неизвестная страница → редирект', '/some-page', 302)

    def head(path):
        request = urllib.request.Request(base + path)
        try:
            with opener.open(request, timeout=15) as resp:
                return resp.status, dict(resp.headers)
        except urllib.error.HTTPError as exc:
            return exc.code, dict(exc.headers)

    # Ключи и токены лежат в R34/.secrets. Ни прямой путь, ни обход через
    # /static/../ не должны отдавать файл.
    problems = []
    for path in ('/.secrets/api_credentials.json',
                 '/static/../.secrets/api_credentials.json',
                 '/.secrets/language.json'):
        status, _ = head(path)
        if status == 200:
            problems.append(f'GET {path} → 200: файл из .secrets отдаётся')
    r.check('секреты не отдаются по HTTP', problems)

    problems = []
    if css_ref:
        _, headers = head('/' + css_ref.group(1))
        if headers.get('X-Content-Type-Options') != 'nosniff':
            problems.append(f'GET /{css_ref.group(1)} — нет '
                            'X-Content-Type-Options: nosniff')
    _, headers = head('/api/app-language')
    cache = headers.get('Cache-Control', '')
    if 'no-store' not in cache:
        problems.append('GET /api/app-language — Cache-Control: '
                        f'{cache or "пусто"}, ждали no-store')
    r.check('заголовки статики и API', problems)


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------

GROUPS = [
    ('python', 'PYTHON', check_python),
    ('assets', 'СТАТИКА', check_assets),
    ('js', 'JS: МОДУЛИ', check_js),
    ('i18n', 'ПЕРЕВОДЫ', check_i18n),
    ('console', 'КОНСОЛЬ', check_console),
    ('panel', 'СЛУЖЕБНАЯ ПАНЕЛЬ', check_panel),
    ('dead', 'МЁРТВЫЙ КОД', check_dead),
    ('launchers', 'ЛАУНЧЕРЫ', check_launchers),
    ('data', 'ЛОКАЛЬНЫЕ ДАННЫЕ', check_data),
    ('live', 'ЖИВОЙ СЕРВЕР', check_live),
]


class Options:
    def __init__(self):
        self.fast = False
        self.verbose = False
        self.strict = False


def preset_lang(argv):
    """Язык вывода: --lang важнее выбора в приложении.

    Без флага берём тот язык, который пользователь выбрал в интерфейсе:
    его хранит R34/.secrets/language.json ({"lang": "ru" | "en"}).
    Файла нет или там что-то чужое — 'en', как и у сервера по умолчанию.
    Язык нужен до разбора аргументов: от него зависит текст --help.
    """
    for index, arg in enumerate(argv):
        if arg in ('--lang', '-l') and index + 1 < len(argv):
            value = argv[index + 1]
            return value if value in ('ru', 'en') else 'ru'
        if arg.startswith('--lang='):
            value = arg.split('=', 1)[1]
            return value if value in ('ru', 'en') else 'ru'
    saved = saved_language()
    return saved if saved in ('ru', 'en') else 'en'


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog='run_tests.py', description=_('Проверки Rule34 Gallery.'))
    parser.add_argument('--fast', action='store_true',
                        help=_('без HTTP-прогона и node --check'))
    parser.add_argument('--only', metavar=('GROUPS' if LANG == 'en' else 'ГРУППЫ'),
                        help=_('только эти группы, через запятую'))
    parser.add_argument('--list', action='store_true', help=_('список групп'))
    parser.add_argument('--strict', action='store_true',
                        help=_('пропуски считать провалом'))
    parser.add_argument('--verbose', '-v', action='store_true',
                        help=_('время групп и все проблемы'))
    parser.add_argument('--lang', '-l', choices=('ru', 'en'), default=LANG,
                        metavar='ru|en',
                        help=_('язык вывода: ru или en (по умолчанию — из настроек)'))
    parser.add_argument('--pause', action='store_true',
                        help=_('ждать Enter в конце'))
    parser.add_argument('--no-pause', action='store_true',
                        help=_('не ждать Enter'))
    return parser.parse_args(argv)


def selected(only):
    keys = [key for key, _, _ in GROUPS]
    if not only:
        return keys
    picked = [part.strip().lower() for part in only.replace(' ', ',').split(',')]
    unknown = [part for part in picked if part not in keys]
    if unknown:
        ui.error(_('Неизвестные группы: ') + ', '.join(unknown))
        ui.info(_('Есть: ') + ', '.join(keys))
        return None
    return [key for key in keys if key in picked]


def main(argv=None):
    global LANG
    LANG = preset_lang(argv if argv is not None else sys.argv[1:])
    args = parse_args(argv)
    LANG = args.lang

    if args.list:
        ui.banner(LANG, _('проверки проекта'))
        ui._out()
        for key, title, _check in GROUPS:
            ui._out('  ' + ui.paint(key.ljust(12), ui.GREY, bold=True) + _(title))
        ui._out()
        return 0, args

    keys = selected(args.only)
    if keys is None:
        return 2, args

    opts = Options()
    opts.fast, opts.verbose, opts.strict = args.fast, args.verbose, args.strict
    runner = Runner(opts)

    started = time.time()
    ui.banner(LANG, _('проверки проекта'))
    ui._out()
    ui._out('  ' + ui.paint(str(ROOT), ui.GREY))

    for key, title, func in GROUPS:
        if key not in keys:
            continue
        runner.start(title)
        try:
            func(runner)
        except Exception as exc:                    # noqa: BLE001
            # Падение самой проверки — тоже провал, но с адресом причины.
            runner.check('проверка выполнилась', [exception_place(exc)])
        runner.finish()

    return runner.summary(time.time() - started), args


def want_pause(args):
    if args.no_pause:
        return False
    if args.pause:
        return True
    return sys.stdin.isatty() and sys.stdout.isatty()


if __name__ == '__main__':
    try:
        code, parsed = main()
    except KeyboardInterrupt:
        ui._out()
        code = 130
    else:
        if want_pause(parsed):
            try:
                print()
                input(_('  Нажмите Enter, чтобы закрыть окно... '))
            except (EOFError, KeyboardInterrupt):
                pass
    sys.exit(code)
