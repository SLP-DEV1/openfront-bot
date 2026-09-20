@echo off
setlocal
cd /d "%~dp0" || goto failed
set "ENGINE=..\OpenFrontIO"
set "SHA=bb8af015b515b3b717bd4d901074c5f4c16641cb"

where node >nul 2>&1 || (
    echo Fehler: Node.js 24 oder neuer installieren.
    goto failed
)
where git >nul 2>&1 || (
    echo Fehler: Git fehlt im PATH.
    goto failed
)

if not exist "%ENGINE%\package.json" (
    echo Klone offizielle OpenFront-Engine...
    git clone --depth 1 https://github.com/openfrontio/OpenFrontIO.git "%ENGINE%" || goto failed
    git -C "%ENGINE%" fetch --depth 1 origin %SHA% || goto failed
    git -C "%ENGINE%" checkout --detach %SHA% || goto failed
)
for /f "delims=" %%H in ('git -C "%ENGINE%" rev-parse HEAD 2^>nul') do set "ENGINE_HEAD=%%H"
if /i not "%ENGINE_HEAD%"=="%SHA%" (
    echo Der separate Engine-Checkout hat einen anderen Commit.
    echo Erwartet: %SHA%
    echo Gefunden: %ENGINE_HEAD%
    echo Nicht automatisch umstellen, um lokale Aenderungen zu schuetzen.
    goto failed
)
if not exist "%ENGINE%\node_modules\tsx" (
    echo Installiere Engine-Abhaengigkeiten...
    pushd "%ENGINE%" || goto failed
    call npm ci --ignore-scripts
    if errorlevel 1 (
        popd
        goto failed
    )
    popd
)

where qwen >nul 2>&1 || echo Hinweis: Qwen Code fehlt. Training laeuft trotzdem; Qwen-Review wird protokolliert.
set "INITIAL="
if exist "trainer\champion.json" set "INITIAL=--initialModel trainer\champion.json"
set "OUTPUT=benchmark-results\neural-%RANDOM%-%RANDOM%"

echo.
echo Starte neuronales Training gegen echte Impossible-Nationen.
echo Ergebnisse: %OUTPUT%
echo Qwen Code analysiert nach jeder Generation und darf nur Sigma vorschlagen.
echo Zum Unterbrechen Strg+C. Keine Modelle werden ohne bestaetigte Siege freigegeben.
echo.

node trainer\train.mjs --engine "%ENGINE%" --engineCommit %SHA% --bot OpenFront_Solo_AggroBot.user.js --generations 3 --population 4 --trainSeeds 2 --evalSeeds 4 --nations 1,4 --maps World --ticks 18000 --qwen true --out "%OUTPUT%" %INITIAL%
if errorlevel 1 goto failed
echo.
echo Training beendet. Nur eine vorhandene champion.json hat den Aufstiegstest bestanden.
echo Details in %OUTPUT%\history.json
pause
exit /b 0

:failed
echo.
echo Training nicht gestartet bzw. fehlgeschlagen. Siehe Meldung oben.
pause
exit /b 1
