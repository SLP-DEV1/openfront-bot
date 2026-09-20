@echo off
setlocal
cd /d "%~dp0" || goto failed
set "ENGINE=..\OpenFrontIO-Impossible"
set "SHA=bb8af015b515b3b717bd4d901074c5f4c16641cb"
where node >nul 2>&1 || (echo Node.js 24+ fehlt.&goto failed)
where git >nul 2>&1 || (echo Git fehlt.&goto failed)
where qwen >nul 2>&1 || (echo Qwen Code fehlt im PATH.&goto failed)
if not exist "%ENGINE%\package.json" (
  echo Klone offiziellen OpenFront-Testcheckout ...
  git clone --depth 1 https://github.com/openfrontio/OpenFrontIO.git "%ENGINE%" || goto failed
  git -C "%ENGINE%" fetch --depth 1 origin %SHA% || goto failed
  git -C "%ENGINE%" checkout --detach %SHA% || goto failed
)
for /f "delims=" %%H in ('git -C "%ENGINE%" rev-parse HEAD 2^>nul') do set "HEAD=%%H"
if /i not "%HEAD%"=="%SHA%" (
  echo Engine-Commit stimmt nicht. Bestehender Checkout wird NICHT umgestellt.
  echo Erwartet %SHA%, gefunden %HEAD%.
  goto failed
)
if not exist "%ENGINE%\node_modules\tsx" (
  pushd "%ENGINE%" || goto failed
  call npm ci --ignore-scripts
  if errorlevel 1 (popd&goto failed)
  popd
)
set "AGGROBOT_START_BACKEND=1"
set "AGGROBOT_LIVE_QWEN=1"
set "AGGROBOT_OPEN_BROWSER=1"
echo Starte offiziellen OpenFront-Backend-Server und sichtbares LOKALES Testmatch mit Qwen Code.
echo Qwen bleibt read-only. Match startet im Browser automatisch.
echo Browser: http://127.0.0.1:5173/__aggrobot/?autostart=1
node tools\benchmark\serve-browser.mjs --engine "%ENGINE%" --engineCommit %SHA% --map World --size Compact --difficulty Impossible --nations 4 --bots 0 --ticks 18000 --seed visible-qwen-001 --profile autonomous
if errorlevel 1 goto failed
pause
exit /b 0
:failed
echo Start fehlgeschlagen. Fehler oben pruefen.
pause
exit /b 1
