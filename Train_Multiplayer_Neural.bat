@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ENGINE=%~dp0..\OpenFrontIO"
set "PIN=bb8af015b515b3b717bd4d901074c5f4c16641cb"
set "PARALLEL=8"
set "MODE=FFA"
if not "%~1"=="" set "PARALLEL=%~1"
if not "%~2"=="" set "MODE=%~2"

for /f "delims=0123456789" %%A in ("%PARALLEL%") do (
  echo Fehler: Parallelitaet muss eine ganze Zahl von 1 bis 16 sein.
  exit /b 1
)
if %PARALLEL% LSS 1 (
  echo Fehler: Parallelitaet muss 1 bis 16 sein.
  exit /b 1
)
if %PARALLEL% GTR 16 (
  echo Fehler: Parallelitaet muss 1 bis 16 sein.
  exit /b 1
)
if /I not "%MODE%"=="FFA" if /I not "%MODE%"=="Team" (
  echo Fehler: Modus muss FFA oder Team sein.
  exit /b 1
)

where node >nul 2>nul || (echo Node.js fehlt. & exit /b 1)
where git >nul 2>nul || (echo Git fehlt. & exit /b 1)

if not exist "%ENGINE%\.git" (
  echo Lade offiziellen OpenFront-Engine-Code...
  git clone --depth 1 https://github.com/openfrontio/OpenFrontIO.git "%ENGINE%" || exit /b 1
)
for /f %%C in ('git -C "%ENGINE%" rev-parse HEAD') do set "ENGINE_HEAD=%%C"
if /i not "%ENGINE_HEAD%"=="%PIN%" (
  echo Wechsle auf verifizierte Engine-Version %PIN% ...
  git -C "%ENGINE%" fetch --depth 1 origin %PIN% || exit /b 1
  git -C "%ENGINE%" checkout --detach %PIN% || exit /b 1
)
if not exist "%ENGINE%\node_modules\tsx" (
  pushd "%ENGINE%" || exit /b 1
  call npm ci --ignore-scripts
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
set "OUT=benchmark-results\strategic-v4-Public-%MODE%-humans-%STAMP%"

echo.
echo AggroBot Neural Multiplayer Training
echo Modus: %MODE%
echo Scripted Humans: 4
echo Profile: mixed
echo Parallel: %PARALLEL%
echo Ergebnis: %OUT%
echo.
echo HINWEIS: Scripted Humans sind deterministische Testgegner und kein Ersatz fuer echte Menschen.
echo.

node trainer/train.mjs ^
  --schema 4 ^
  --engine "%ENGINE%" ^
  --engineCommit %PIN% ^
  --difficulty Medium ^
  --maps World,Europe ^
  --nations 0 ^
  --gameType Public ^
  --gameMode %MODE% ^
  --scriptedHumans 4 ^
  --opponentProfile mixed ^
  --generations 8 ^
  --population 4 ^
  --trainSeeds 3 ^
  --evalSeeds 5 ^
  --ticks 18000 ^
  --parallel %PARALLEL% ^
  --sigma 0.12 ^
  --out "%OUT%"
if errorlevel 1 exit /b 1

set "DEPLOYED=OpenFront_Solo_AggroBot_Neural_Multiplayer_%MODE%_%STAMP%.user.js"
if exist "%OUT%\champion.json" (
  node trainer/deploy.mjs --model "%OUT%\champion.json" --out "%DEPLOYED%" || exit /b 1
  echo Champion erzeugt: %DEPLOYED%
) else (
  echo Kein bestaetigter Champion. Es wird kein Produktionsmodell erzeugt.
)
endlocal
