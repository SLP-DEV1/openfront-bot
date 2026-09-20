# Live Qwen Code coach: sichtbares lokales OpenFront-Match

Start_Live_Qwen.bat startet den originalen OpenFront-Client mit Worker in deinem Standardbrowser. AggroBot spielt auf World / Compact gegen vier Impossible-Nationen. Qwen Code erhaelt asynchron alle ca. 30 Sekunden kompakte Bot-Telemetrie (Status, Lifetime-Aktionszaehler und letzte Ereignistypen) und zeigt Hinweise oberhalb des Spielfelds an. Nach Matchende wird im Ergebnisordner qwen-live-report.md geschrieben.

Dies ist **lokaler Singleplayer**, kein Multiplayer gegen Menschen, kein Qwen als eigener Spieler und keine Analyse von Pixeln oder Screenshots. Qwen steuert weder den Browser noch den Bot. Qwen-Hinweise sind Hypothesen, die gegen nachvollziehbare Ergebnisse geprueft werden muessen.

## Start unter Windows

Voraussetzungen: Node.js 24+, Git und Qwen Code im PATH. Das in Qwen Code konfigurierte lokale llama.cpp-Modell muss bereits laufen.

1. Im Bot-Repository git pull --ff-only ausfuehren.
2. Start_Live_Qwen.bat doppelklicken. Es erstellt bei Bedarf den separaten offiziellen Engine-Checkout ..\OpenFrontIO-Impossible mit dem festgelegten Commit bb8af015b515b3b717bd4d901074c5f4c16641cb. Ein vorhandener Checkout auf einem anderen Commit wird absichtlich NICHT veraendert.
3. Der Browser sollte http://127.0.0.1:5173/__aggrobot/?autostart=1 oeffnen und das Spiel automatisch starten. Sonst URL manuell aufrufen.
4. Im Serverterminal Strg+C zum Beenden. Browser und Server lokal auf 127.0.0.1 belassen.

Neuen Seed manuell aus PowerShell starten:

~~~powershell
cd C:\Users\SPK\Desktop\openfront
$env:AGGROBOT_LIVE_QWEN="1"
$env:AGGROBOT_OPEN_BROWSER="1"
node tools/benchmark/serve-browser.mjs --engine ../OpenFrontIO-Impossible --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --difficulty Impossible --nations 4 --bots 0 --seed visible-qwen-002 --ticks 18000
~~~

## Ergebnisse

Jeder Lauf bekommt einen eigenen benchmark-results-Unterordner mit run.json, events.jsonl, checkpoint.json und match.json. Bei erfolgreicher Modellantwort entsteht qwen-live-report.md. Das Browserfenster zeigt auch Qwen-Fehler an; ist Qwen aus oder laeuft es in einen Timeout, spielt AggroBot ungestoert weiter. Nur eine Modellanfrage laeuft gleichzeitig. Ein Tick-Limit oder manuelles Beenden ist kein Sieg.

Der Browser-Test ist noch nicht auf jedem Windows-System Ende zu Ende bestaetigt: bei Problemen sowohl Browser-Konsole als auch Serverterminal ansehen. Der Bericht allein belegt keine nachweislich bessere Spielweise.

## Optionale Verbesserung als getrennte Datei

Nach bestaetigtem Matchende und vollstaendigem Qwen-Bericht:

~~~powershell
node tools/benchmark/propose-live-fix.mjs --run "benchmark-results/DEIN-LAUF-ORDNER"
~~~

Dieses Tool prueft den SHA-256 des damals gespielten Userscripts. Qwen Code bekommt eine temporaere Kopie mit dem Report und darf im Auto-Edit-Modus **nur dort** einen kleinen Verbesserungsvorschlag umsetzen. Wenn eine Aenderung existiert und node --check besteht, wird proposed-AggroBot.user.js im Ergebnisordner abgelegt. Original-Userscript, Tampermonkey und main werden nicht ueberschrieben. Es gibt keine automatische Uebernahme oder Endlosschleife.

Mit dem normalen Browser-Test und --bot PFAD-ZUM-KANDIDATEN kannst du dieselbe Konfiguration mit anderem Seed wiederholen. Vergleichstests mit denselben Seeds fuer Kandidat und Baseline und unabhaengige Evaluation bleiben erforderlich, bevor man Verbesserungen behauptet.
