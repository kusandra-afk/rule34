#!/data/data/com.termux/files/usr/bin/bash

# Тот же порядок шагов, что и в run_windows.bat: сначала видно, что именно
# проверяется, и только потом — что ставится. Раньше вывод pkg и pip уходил
# в /dev/null, а ошибки установки не печатались вообще, поэтому «запуск
# завис / ничего не произошло» было обычным делом.
cd "$(dirname "$0")"

echo
echo "  +----------------------------------------------------------+"
echo "  |  RULE34 GALLERY                                          |"
echo "  |  локальный сервер галереи / local gallery server         |"
echo "  +----------------------------------------------------------+"
echo

echo "  [1/3] Termux пакеты / packages"
pkg update -y >/dev/null 2>&1 || echo "        update не удался, продолжаю / update failed, continuing"
pkg upgrade -y >/dev/null 2>&1 || true
pkg install python rust binutils make cmake clang -y >/dev/null 2>&1 \
    || echo "        часть пакетов не встала, продолжаю / some packages failed, continuing"
echo "        ok"
echo

echo "  [2/3] Зависимости / dependencies"
if python -c "import flask, requests, Crypto" >/dev/null 2>&1; then
    echo "        ok - уже установлены, pip пропущен / already installed, pip skipped"
else
    echo "        ставлю из requirements.txt / installing, this may take a minute..."
    python -m pip install --upgrade pip >/dev/null 2>&1
    if python -m pip install -r requirements.txt > .pip-install.log 2>&1; then
        echo "        ok - установлено / installed"
    else
        echo "        [x] установка не удалась / install failed - лог: .pip-install.log"
        tail -n 20 .pip-install.log
        exit 1
    fi
fi
echo

echo "  [3/3] Сервер / server"
echo
exec python server.py "$@"
