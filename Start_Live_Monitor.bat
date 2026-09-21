@echo off
setlocal
cd /d "%~dp0" || exit /b 1
where node >nul 2>&1 || (echo Node.js fehlt.&pause&exit /b 1)
echo Lokalen AggroBot-Monitor starten. Fenster waehrend der Partie offen lassen.
node tools\live-monitor.cjs
pause
