@echo off
setlocal
cd /d "%~dp0" || goto failed
rem Schema-4 FFA Curriculum (Overnight) - v2-Gate, gepinnter Bot + Engine.
rem Stufen A(Medium) - B(Hard) - C(Impossible) mit Champion-Vortrieb, dann
rem D (Final-Holdout: nur Evaluation, versiegelte neue Samen).
rem Jede Stage schreibt nach jeder Generation generation-N.json (Resumierbarkeit).
set "ENGINE=..\OpenFrontIO-Impossible"
set "SHA=bb8af015b515b3b717bd4d901074c5f4c16641cb"
set "RUNDIR=benchmark-results\schema4-ffa-curriculum-20260921-overnight"
set "BOT=%RUNDIR%\bot-v1.18.6.a6ec8c0c.user.js"
set "START=%RUNDIR%\..\schema4-impossible-world-europe-20260921-runE\champion.json"
rem Fenster ~4 h: A4 + B4 + C32 + D  =>  ~6.500 Partien, ~4 h (P=8).
rem Basis 124 Partien/Gen (4·(3·5 + 8·2), population 4) + 128 bei v2-Decision-Round (~30% -> Ø ~162).
set "CGEN=32"
set "COMMON=--engine %ENGINE% --engineCommit %SHA% --bot %BOT% --maps World,Europe --nations 1,4 --schema 4 --parallel 8 --trainSeeds 3 --evalSeeds 8 --ticks 18000"

where node >nul 2>&1 || goto failed
where git  >nul 2>&1 || goto failed
if not exist "%ENGINE%\package.json" (
    echo Engine-Checkout fehlt: %ENGINE%
    goto failed
)
for /f "delims=" %%H in ('git -C "%ENGINE%" rev-parse HEAD 2^>nul') do set "ENGINE_HEAD=%%H"
if /i not "%ENGINE_HEAD%"=="%SHA%" (
    echo Engine-Commit stimmt nicht. Erwartet %SHA%, gefunden %ENGINE_HEAD%.
    goto failed
)
if not exist "%BOT%" (
    echo Gepinnter Bot fehlt: %BOT%
    goto failed
)
if not exist "%START%" (
    echo Start-Modell fehlt: %START%
    goto failed
)

echo.
echo === Schema-4 FFA Curriculum (v2-Gate) ===
echo Engine %SHA%  ^|  Bot a6ec8c0c  ^|  Start 84d1f593  ^|  C=%CGEN% Gen
echo.

rem --- Stage A: Medium ---
if exist "%RUNDIR%\stageA\generation-4.json" (
    echo [A] Medium bereits fertig - ueberspringen.
) else (
    if exist "%RUNDIR%\stageA" rmdir /s /q "%RUNDIR%\stageA"
    echo [A] Medium ^(4 Gen^) ...
    node trainer\train.mjs %COMMON% --difficulty Medium --generations 4 --sigma 0.12 --initialModel "%START%" --out "%RUNDIR%\stageA" > "%RUNDIR%\stageA.log" 2>&1 || goto failed
)

rem --- Stage B: Hard ---
if exist "%RUNDIR%\stageB\generation-4.json" (
    echo [B] Hard bereits fertig - ueberspringen.
) else (
    if exist "%RUNDIR%\stageB" rmdir /s /q "%RUNDIR%\stageB"
    echo [B] Hard ^(4 Gen^) ...
    node trainer\train.mjs %COMMON% --difficulty Hard --generations 4 --sigma 0.08 --initialModel "%RUNDIR%\stageA\champion.json" --out "%RUNDIR%\stageB" > "%RUNDIR%\stageB.log" 2>&1 || goto failed
)

rem --- Stage C: Impossible ---
if exist "%RUNDIR%\stageC\generation-%CGEN%.json" (
    echo [C] Impossible bereits fertig - ueberspringen.
) else (
    if exist "%RUNDIR%\stageC" rmdir /s /q "%RUNDIR%\stageC"
    echo [C] Impossible ^(%CGEN% Gen^) ...
    node trainer\train.mjs %COMMON% --difficulty Impossible --generations %CGEN% --sigma 0.06 --initialModel "%RUNDIR%\stageB\champion.json" --out "%RUNDIR%\stageC" > "%RUNDIR%\stageC.log" 2>&1 || goto failed
)

rem --- Stage D: Final-Holdout (nur Evaluation) ---
if exist "%RUNDIR%\stageD\holdout.json" (
    echo [D] Holdout bereits fertig - ueberspringen.
) else (
    if exist "%RUNDIR%\stageD" rmdir /s /q "%RUNDIR%\stageD"
    echo [D] Final-Holdout ^(Medium/Hard/Impossible, neue Samen^) ...
    node tools\benchmark\holdout-eval.mjs --model "%RUNDIR%\stageC\champion.json" --bot %BOT% --engine %ENGINE% --engineCommit %SHA% --difficulties Medium,Hard,Impossible --seeds 2 --parallel 8 --out "%RUNDIR%\stageD" > "%RUNDIR%\stageD.log" 2>&1 || goto failed
)

echo.
echo === Curriculum fertig ===
echo Champion: %RUNDIR%\stageC\champion.json
echo Holdout : %RUNDIR%\stageD\holdout.json
goto end

:failed
echo.
echo Curriculum abgebrochen/fehlgeschlagen. Siehe zugehoeriges Log im selben Ordner.
exit /b 1
:end
exit /b 0
