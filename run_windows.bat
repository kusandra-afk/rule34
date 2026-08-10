@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "PYTHON_EXE=python"
where python >nul 2>nul
if errorlevel 1 (
    where py >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_EXE=py -3"
    ) else (
        echo Python not found.
        echo Install Python 3 and run this file again.
        echo Link: https://www.python.org/downloads/windows/
        pause
        exit /b 1
    )
)

call %PYTHON_EXE% --version >nul 2>&1
if errorlevel 1 (
    echo Failed to start Python.
    pause
    exit /b 1
)

echo Checking dependencies...
call %PYTHON_EXE% -m pip install --upgrade pip >nul 2>&1
echo Installing dependencies...
<nul (set/p z=)
for /L %%i in (1,1,3) do (
    <nul set/p =.
    timeout /t 1 /nobreak >nul
)
<nul set/p = 
call %PYTHON_EXE% -m pip install -r requirements.txt >nul 2>&1
if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)
echo Done.

echo Starting server...
call %PYTHON_EXE% server.py

pause
