@echo off
setlocal
cd /d "%~dp0" || (
    echo Fehler: Bot-Verzeichnis nicht erreichbar.
    pause
    exit /b 1
)

where node >nul 2>&1 || (
    echo Fehler: Node.js fehlt oder ist nicht im PATH.
    echo Installiere Node.js und starte diese Datei erneut.
    pause
    exit /b 1
)

if not exist "brain\server.cjs" (
    echo Fehler: brain\server.cjs fehlt.
    echo Lege Start_Brain.bat in das Hauptverzeichnis von openfront-bot.
    pause
    exit /b 1
)

rem Qwen ist optional. Setze AGGROBOT_QWEN_ENABLED=0, um es abzuschalten.
if not defined AGGROBOT_QWEN_ENABLED set "AGGROBOT_QWEN_ENABLED=1"
if not defined AGGROBOT_QWEN_API_KEY set "AGGROBOT_QWEN_API_KEY=local"

echo Starte AggroBot Brain auf http://127.0.0.1:8765
echo Qwen aktiviert: %AGGROBOT_QWEN_ENABLED%
echo Hinweis: llama.cpp muss bei Qwen-Nutzung separat auf Port 8080 laufen.
echo Zum Beenden Strg+C druecken.
echo.

node "brain\server.cjs"
set "EXITCODE=%ERRORLEVEL%"

echo.
echo Brain wurde beendet (Exitcode %EXITCODE%).
pause
exit /b %EXITCODE%
