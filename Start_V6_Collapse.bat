@echo off
setlocal EnableExtensions
cd /d "%~dp0" || goto failed
rem -------------------------------------------------------------------
rem Neural V6 "Collapse Prevention (Two Lineages)" - Kampagnen-Treiber.
rem   Zwei unabhaengige Kandidaten-Stammbaeume auf den finalen
rem   V5-Provisionals (V5-A-prov, V5-V4-prov). stageC bleibt offizieller
rem   Champion. Identisches, eingefrorenes Curriculum wie V5:
rem   Gen 1-5 bei 7200 Ticks, Gen 6-10 bei 18000 Ticks, Voll-Grid
rem   (Impossible+Hard x World+Europe, Nationen 1/4), 10 Generationen
rem   x 200 Partien/Generation = 2000 pro Stammbaum.
rem   V6-spezifisch: collapse-Phase — 17 gepinnte Hard-Regression-Cells
rem   unter dem neuen Posture-Bot (baseline-newbot = V5-V4-prov ohne
rem   Retraining gegen stageC + je eine Job pro Kandidatin).
rem   Darauf unabhaengiger gepaarter Holdout auf Hard + Impossible,
rem   World + Europe, 12 v6hold-Samen, 18000 Ticks. Gate: unveraendertes
rem   evaluation-v2 gegen stageC, V4-prov, V5-A-prov, V5-V4-prov.
rem   Kein automatischer Live-Bot-Austausch (autoDeploy=false).
rem Phasen: all (Default) | setup | train | holdout | collapse | report
rem -------------------------------------------------------------------
set "SHA=bb8af015b515b3b717bd4d901074c5f4c16641cb"
set "OUT=benchmark-results\neural-v6-collapse"
set "MODELS=..\neural-v5-curriculum\benchmark-results\neural-v5-curriculum\models-source"

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
if not exist "%MODELS%\zero.json" goto failed
if not exist "%MODELS%\stageC.json" goto failed
if not exist "%MODELS%\run3.json" goto failed
if not exist "%MODELS%\A-champ.json" goto failed
if not exist "%MODELS%\V4-prov.json" goto failed
if not exist "%MODELS%\V5-A-prov.json" goto failed
if not exist "%MODELS%\V5-V4-prov.json" goto failed
if not exist "%OUT%\campaign.json" (
  echo Hinweis: setup-Phase wird als Teil des Laufs ausgefuehrt.
)

echo.
echo === Neural V6 - Collapse Prevention (Two Lineages) ===
echo Engine %SHA%  ^|  Stammbaeume: V5-A-prov + V5-V4-prov  ^|  stageC bleibt Champion
echo Posture-Bot 57775ec7  ^|  Collapse: 17 Zellen (baseline-newbot + Kandidaten)
echo Holdout Hard+Impossible World+Europe  ^|  Gate evaluation-v2 (unveraendert)
echo Output: %OUT%
echo.

if /i not "%~1"=="" (
  set "PHASE=%~1"
) else (
  set "PHASE=all"
)
node tools\benchmark\v6-collapse-campaign.mjs %PHASE% --engine "%ENGINE%" --engineCommit %SHA% --modelsSource "%MODELS%" --out "%OUT%" --parallel 16 || goto failed
goto end

:failed
echo.
echo V6-Kampagnen-Lauf abgebrochen/fehlgeschlagen.
exit /b 1
:end
exit /b 0
