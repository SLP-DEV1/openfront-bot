@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ENGINE=%~dp0..OpenFrontIO"
set "PIN=bb8af015b515b3b717bd4d901074c5f4c16641cb"
where node >nul 2>nul || (echo Node.js 24 fehlt. & exit /b 1)
where git >nul 2>nul || (echo Git fehlt. & exit /b 1)
if not exist "%ENGINE%\.git" (
  echo Lade offiziellen OpenFront-Engine-Code...
  git clone --depth 1 https://github.com/openfrontio/OpenFrontIO.git "%ENGINE%" || exit /b 1
)
for /f %%C in ('git -C "%ENGINE%" rev-parse HEAD') do set "ENGINE_HEAD=%%C"
if /i not "%ENGINE_HEAD%"=="%PIN%" (
  echo Wechsle auf verifizierte Engine-Version %PIN% ...
  git -C "%ENGINE%" fetch --depth 1 origin %PIN% || exit /b 1
  git -C "%ENGINE%" checkout --detach %PIN% || (
    echo Engine hat moeglicherweise lokale Aenderungen; wurde nicht ueberschrieben.
    exit /b 1
  )
)
if not exist "%ENGINE%\node_modules\tsx" (
  echo Installiere offizielle Engine-Abhaengigkeiten...
  pushd "%ENGINE%" || exit /b 1
  call npm ci --ignore-scripts
  set "NPM_STATUS=%ERRORLEVEL%"
  popd
  if not "%NPM_STATUS%"=="0" exit /b %NPM_STATUS%
)
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
if not defined STAMP (echo Kein Trainings-Zeitstempel verfuegbar. & exit /b 1)
set "OUT=benchmark-results\strategic-v3-%STAMP%"
echo Starte Lernen in echten offiziellen Impossible-Engine-Matches.
echo Trainings-Ergebnisse: %OUT%
node trainer/train.mjs --engine "%ENGINE%" --engineCommit %PIN% --maps World,Europe --nations 1,4 --generations 3 --population 4 --trainSeeds 2 --evalSeeds 4 --ticks 18000 --parallel 2 --sigma 0.12 --out "%OUT%"
if errorlevel 1 exit /b 1
if not exist "%OUT%\champion.json" (
  echo Kein belegbar besseres Modell gefunden. Keine automatische Freigabe.
  exit /b 0
)
set "DEPLOYED=OpenFront_Solo_AggroBot_Neural_%STAMP%.user.js"
node trainer/deploy.mjs --model "%OUT%\champion.json" --out "%DEPLOYED%" || exit /b 1
echo Champion gebaut: %DEPLOYED%
echo Installiere diese Datei manuell in Tampermonkey.
endlocal
