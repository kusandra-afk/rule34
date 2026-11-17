<div align="center">

[🇷🇺 Русский](README.md) &nbsp;•&nbsp; **🇬🇧 English**

# 🧪 Project Checks

**A self-checking test suite for Rule34 Gallery: it checks the project, not a list of files.**

![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?style=flat-square&logo=python&logoColor=white)
![Deps](https://img.shields.io/badge/dependencies-stdlib%20only-2ea44f?style=flat-square)
![Node](https://img.shields.io/badge/node-optional-339933?style=flat-square&logo=node.js&logoColor=white)
![Checks](https://img.shields.io/badge/checks-47-8b5cf6?style=flat-square)
![Time](https://img.shields.io/badge/run-~6%20s-f59e0b?style=flat-square)

</div>

One file, `tests/run_tests.py`, no frameworks and no browser: Python standard
library only. The suite walks the project, finds pages, modules, styles and
dictionaries by itself, and every failure names the file, the line and the reason.

---

## ⚡ Quick start

```bash
python tests/run_tests.py             # everything (~6 s), app language
python tests/run_tests.py --fast      # skip the HTTP run and node --check
python tests/run_tests.py --only js,live
python tests/run_tests.py --list      # list groups
python tests/run_tests.py --strict    # count skips as failures (CI)
python tests/run_tests.py --lang en   # English output
```

| Flag | What it does |
|---|---|
| `--fast` | skips the live server and `node --check` |
| `--only js,live` | only these groups, comma separated |
| `--list` | prints the group keys |
| `--strict` | a skipped check counts as a failure |
| `-v`, `--verbose` | per-group time and every problem, nothing collapsed |
| `--lang ru\|en`, `-l` | output language; without it, the one picked in the app |
| `--pause` / `--no-pause` | wait for Enter at the end or not |

No dependencies — Python standard library only. `node` is needed for the JS and
dictionary checks; without it those checks are reported as skipped (a failure
under `--strict`).

Exit code: `0` — clean, `1` — failures, `2` — unknown group. In a terminal it
waits for Enter at the end, in a pipe and in CI it does not.

---

## 🧭 How it works

Not a list of files but the project itself: pages (`*.html`), Python, JS, CSS and
JSON are discovered by walking the tree at any depth. A new folder, page, module
or dictionary joins the checks without editing the test. Only foreign
directories are skipped: `node_modules`, `vendor`, `__pycache__`, `venv`,
`dist`, `build`.

Entry points for dead-code detection are discovered too: a file with
`if __name__ == '__main__'` or one mentioned in a launcher (`.bat`, `.sh`,
`.ps1`) is treated as a program, not as a module to import.

---

## 🔤 Output language

The banner, group titles, check names, failure reasons and the summary exist in
two languages, and the suite speaks the one the user picked in the interface:

```bash
python tests/run_tests.py             # the app language
python tests/run_tests.py --lang en   # English output
python tests/run_tests.py --lang ru   # Russian
```

The server stores the user's choice in `R34/.secrets/language.json`, a file like
`{"lang": "en"}`. `saved_language()` reads it (and passes the same language to
the server used by `LIVE SERVER`, so a run never changes the setting), and
`preset_lang()` uses it as the default. `--lang` is enough to speak another
language without touching the settings; with no file, or an unknown value, it
falls back to `en`, the server's own default.

Translations live in the `TRANSLATIONS` table at the top of
`tests/run_tests.py`: the key is the finished Russian phrase. A phrase without a
translation stays Russian — that is visible immediately and one line fixes it.
The tail after ` · ` (a source line) is never translated, or the code would break.

---

## ❗ Reading a failure

Every check returns a list of problems shaped `file:line — reason`. An empty list
means it passed. A failure always says where and why:

```
  ASSETS                                                × 3/4
    × braces in 9 CSS
        R34/static/css/devpanel.css:310 — unclosed block "{"

  JS: MODULES                                           × 1/2
    × 121 imports resolve
        R34/static/js/main.js:25 — import ./components/devPanel-missing.js: file missing
```

At the end the failures are repeated under "What is wrong:". For HTTP checks the
reason also carries the status, the response body and the matching server log
line.

Dead-code checks show the source line itself — a bare name in the console does
not tell you what it is:

```
    × 176 functions and classes are used
        handlers/console_ui.py:430 — step is never used · def step(self, text, glyph='•••'):
    × 110 JS exports are used
        R34/static/js/a.js:12 — export RippleEffect is never used · export class RippleEffect {
```

When the dead thing is a whole file there is no line, so the message says so
explicitly instead of looking like a finding inside the file:

```
    × 9 CSS files are linked
        R34/static/css/orphan.css — whole file: no <link> on any page
        handlers/legacy.py — whole file: nothing imports this module
```

The console shows the first 6 problems per check and collapses the rest into
"… and N"; `-v` prints all of them.

---

## 🗂 Groups

| Title | Key | What it checks |
|---|---|---|
| `PYTHON` | `python` | every `.py` compiles, `server` imports, routes, protected `/api` prefixes, `/api` calls from JS/HTML |
| `ASSETS` | `assets` | static links on every page, duplicate `id`s per page, HTML tag pairing, CSS braces, undefined `var(--x)`, `url()`/`@import` |
| `JS: MODULES` | `js` | relative imports, `node --check` |
| `TRANSLATIONS` | `i18n` | ru→en pairs, the `EN` dictionary, translations with no matching text in the UI, console strings in both languages |
| `CONSOLE` | `console` | duration format, log filter, startup report |
| `DEV PANEL` | `panel` | wiring, visibility inside mini-games, dragging with saved position, phone styles, labels; if the build has no panel at all the group is skipped, not failed |
| `DEAD CODE` | `dead` | modules with no imports/`<script>`, functions and classes with no calls, unused `export`s, CSS with no `<link>`, dead CSS variables |
| `LAUNCHERS` | `launchers` | `.bat` in UTF-8/CRLF with `chcp 65001`, the termux script |
| `LOCAL DATA` | `data` | every JSON in the project (`game_data`, `.secrets`, new configs) |
| `LIVE SERVER` | `live` | statuses and Content-Types of a real server, `.secrets` unreachable, `nosniff` on static, `no-store` on `/api` |

---

## 🕳 What counts as dead

The checks are deliberately conservative so they do not shout at live code:

- A Python function counts as used when its name appears anywhere else: a call,
  an attribute or an import (including under an alias). String literals are
  deliberately ignored: a `'step'` string inside a function does not make it live.
- Flask handlers are skipped: they are called by a decorator (`@app.route`,
  `@bp.before_request` and the like), not by name.
- Entry points and `tests/` do not have to be imported by anything.
- A JS export counts as live when its name appears anywhere else: in another
  module, on a page or inside its own file. That keeps normal internal exports
  alive; only names that never appear again stay dead.
- `login.js` lives in `login.html`: any `*.html` counts as a page.
- A CSS variable counts as live when it is read through `var(--x)` or mentioned
  in JS/HTML (`style.setProperty('--x', …)`). A read with no definition and no
  `var(--x, fallback)` is a separate `ASSETS` check: the browser silently drops
  such a property.

---

## 👀 Blind spots

What the checks cannot see: class methods and nested functions, calls built from
a string (`getattr(mod, f'{kind}_handler')`), modules loaded through
`importlib.import_module`, API URLs assembled from variables
(`fetch(base + '/x')`), translations with substitutions (`${…}`) and tags that JS
adds at runtime. In those cases the check either reports "dead" or stays silent —
fix the allowlist, not the code.

---

## ➕ A new check

```python
def check_mine(r):
    problems = []
    for lineno, line in numbered(SOME_FILE):
        if line != 'ok':
            problems.append(f'{where(SOME_FILE, lineno)} — what is wrong')
    r.check('short label', problems)
```

Then add `('mine', 'TITLE', check_mine)` to `GROUPS`. If the check name or a
failure reason should also read in Russian, add the phrase to `TRANSLATIONS`.
A check must never modify user data.

---

## ⚠️ Careful: GET /

**Never request `GET /`.** That route validates the key against rule34 and on
failure deletes `R34/.secrets/api_credentials.json` — a run would wipe the login.
Use `/login` for the "page is served" check. The HTTP run disables proxies
(`ProxyHandler({})`), otherwise loopback goes through the system proxy on Windows
and hangs, and it forbids redirects (`NoRedirect`) so `/login` cannot drag it to `/`.
