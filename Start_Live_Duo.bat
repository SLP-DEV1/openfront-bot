@echo off
setlocal
cd /d "%~dp0" || exit /b 1
where node >nul 2>&1 || (echo Node.js 24 oder neuer fehlt.&pause&exit /b 1)
echo AggroBot Duo-Relay nur auf 127.0.0.1:8767.
echo Dieses Fenster offen lassen. Beide Browser: gleiche Raumkennung,
echo gegenseitige exakte Spieler-ID und Duo-Modus aktivieren.
node tools\duo-relay.cjs
echo Duo-Relay beendet.
pause
