@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"
title Rule34 Gallery

rem Файл сохранён в UTF-8, поэтому первым делом chcp 65001: иначе консоль
rem читает его как cp866 и вместо букв показывает мусор.
rem Скобки в echo внутри if (...) ломают разбор (они закрывают блок раньше
rem времени, и cmd обрывает прогон до pause — окно захлопывается). Поэтому
rem здесь только goto-метки: ни одного блока с текстом внутри.

echo.
echo   +----------------------------------------------------------+
echo   ^|  RULE34 GALLERY                                          ^|
echo   ^|  локальный сервер галереи / local gallery server         ^|
echo   +----------------------------------------------------------+
echo.

set "PYTHON_EXE=python"
where python >nul 2>nul
if not errorlevel 1 goto have_python
where py >nul 2>nul
if errorlevel 1 goto no_python
set "PYTHON_EXE=py -3"

:have_python
call %PYTHON_EXE% --version >nul 2>&1
if errorlevel 1 goto bad_python

echo   [1/3] Python .................. ok
echo.

echo   [2/3] Зависимости / dependencies
%PYTHON_EXE% -c "import flask, requests, Crypto" >nul 2>&1
if not errorlevel 1 goto deps_ready

echo         ставим из requirements.txt, это может занять минуту...
echo         installing from requirements.txt, this may take a minute...
%PYTHON_EXE% -m pip install --upgrade pip >nul 2>&1
%PYTHON_EXE% -m pip install -r requirements.txt > "%~dp0.pip-install.log" 2>&1
if errorlevel 1 goto deps_failed
echo         ok - установлено / installed
goto deps_done

:deps_ready
echo         ok - уже установлены, pip пропущен / already installed, pip skipped
goto deps_done

:deps_done
echo.

echo   [3/3] Сервер / server
echo.
call %PYTHON_EXE% server.py %*
goto end

:no_python
echo.
echo   [x] Python не найден / Python not found
echo       Установите Python 3 и запустите файл снова.
echo       Install Python 3 and run this file again:
echo       https://www.python.org/downloads/windows/
echo.
pause
exit /b 1

:bad_python
echo   [x] Не удалось запустить Python / Failed to start Python
pause
exit /b 1

:deps_failed
echo.
echo   [x] Установка не удалась / install failed
echo       лог / log: .pip-install.log
echo.
type "%~dp0.pip-install.log"
echo.
pause
exit /b 1

:end
echo.
pause
