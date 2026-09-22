@echo off
setlocal EnableExtensions
cd /d "%~dp0" || goto failed
rem -------------------------------------------------------------------
rem Neural V4 "Early Survival & Expansion" - Kampagnen-Treiber.
rem   Startmodell: A-champ (experimenteller Kandidat; stageC bleibt
rem   offizieller Champion). 7200-tick-Training Impossible/World,
rem   10 Generationen; darauf unabhaengiger gepaarter Holdout auf
rem   Hard + Impossible, World + Europe, 12 v4hold-Samen, 18000 Ticks.
rem   Kein automatischer Live-Bot-Austausch (autoDeploy=false).
rem Phasen: all (Default) | setup | train | holdout | report
rem -------------------------------------------------------------------
set "SHA=bb8af015b515b3b717bd4d901074c5f4c16641cb"
set "OUT=benchmark-results\neural-v4-early"
set "MODELS=..\neural-v3-overnight\benchmark-results\neural-v3-overnight-10h"

rem Engine-Checkout suchen (Worktree-Layout zuerst, dann Hauptlayout).
set "ENGINE="
for %%E in (..\..\..\OpenFrontIO-Impossible ..\OpenFrontIO-Impossible) do (
  if not defined ENGINE if exist "%%E\package.json" set "ENGINE=%%E"
)
if not defined ENGINE (
  echo Engine-Checkout OpenFrontIO-Impossible nicht gefunden.
  echo Erwartet: ..\..\..\OpenFrontIO-Impossible oder ..\OpenFrontIO-Impossible
  goto failed
)

where node >nul 2>&1 || goto failed
where git  >nul 2>&1 || goto failed

for /f "delims=" %%H in ('git -C "%ENGINE%" rev-parse HEAD 2^>nul') do set "ENGINE_HEAD=%%H"
if /i not "%ENGINE_HEAD%"=="%SHA%" (
  echo Engine-Commit stimmt nicht. Erwartet %SHA%, gefunden %ENGINE_HEAD%.
  goto failed
)
if not exist "%ENGINE%\node_modules\tsx" (
  echo Engine-Abhaengigkeiten fehlen: %ENGINE%\node_modules\tsx
  goto failed
)
if not exist "%MODELS%\starting\stageC-champion.json" goto failed
if not exist "%MODELS%\phaseA-medium\champion.json" goto failed
if not exist "%MODELS%\holdout\difficulty-Hard\matches\run3\v3hold-0-World-1\model.json" goto failed
if not exist "%OUT%\campaign.json" (
  echo Hinweis: setup-Phase wird als Teil des Laufs ausgefuehrt.
)

echo.
echo === Neural V4 - Early Survival ^&^ Expansion ===
echo Engine %SHA%  ^|  Start A-champ 0b526b77  ^|  stageC bleibt Champion
echo Training 7200 Ticks Impossible/World  ^|  Holdout Hard+Impossible World+Europe
echo Output: %OUT%
echo.

if /i not "%~1"=="" (
  set "PHASE=%~1"
) else (
  set "PHASE=all"
)
node tools\benchmark\v4-early-campaign.mjs %PHASE% --engine "%ENGINE%" --engineCommit %SHA% --modelsSource "%MODELS%" --out "%OUT%" --parallel 16 || goto failed
goto end

:failed
echo.
echo V4-Kampagnen-Lauf abgebrochen/fehlgeschlagen.
exit /b 1
:end
exit /b 0
