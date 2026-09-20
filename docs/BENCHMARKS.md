# Reproduzierbare Match-Tests

Ab v1.10.9 gibt es zwei getrennte Testwege und eine begrenzte Parametersuche.
Die Engine-Tests simulieren echte Kämpfe, Wirtschaft und Gegner. Sie sind keine
Mock-Regressionen, ersetzen aber weder Browser-/Worker-Integrationstests noch
Matches gegen Menschen. Die Testanbindung aktiviert niemals öffentliche oder
private Multiplayer-Partien automatisch.

## Einrichtung

Voraussetzung: Node.js 24 und Git. Die OpenFront-Version ist absichtlich fixiert;
ein anderer Commit oder Änderungen an getrackten Engine-Dateien werden abgelehnt.

```bash
git clone https://github.com/openfrontio/OpenFrontIO.git ../OpenFrontIO
git -C ../OpenFrontIO checkout 13b403387af01d388f8c8ed8c953b6d3a11d1457
(cd ../OpenFrontIO && npm run inst)
```

Die Abhängigkeiten kommen aus dem offiziellen OpenFront-Lockfile; im Bot-Repository
ist kein zusätzliches `npm install` nötig. Maps liegen im offiziellen Repository.
Ein frischer, separater Checkout verhindert Konflikte mit eigener Engine-Entwicklung.

## Eine Engine-Partie

```bash
node tools/benchmark/engine-match.mjs --engine ../OpenFrontIO \
  --map World --size Compact --difficulty Medium --bots 40 --nations 8 \
  --seed aggro-train-001 --ticks 18000 --profile autonomous
```

- `createGameRunner`, `GameView`, Karten und Gegner stammen aus der echten Engine.
- Der Bot erhält ausschließlich die Client-Spielansicht. Seine asynchronen
  Bau-/Angriffsprüfungen werden an die tatsächlichen `GameRunner`-Methoden geleitet.
  Das ist ein Adapter im selben Prozess, kein echter Web Worker.
- Event-Konstruktoren werden aus dem offiziellen `Transport.ts` übernommen;
  übersetzte Befehle durchlaufen die offizielle Intent-Schema-Prüfung.
- `GameStartInfo.gameID` ist hier der Seed. Die normale Spielkonfiguration hat
  kein Seed-Feld. Der Harness dokumentiert Quelle und Engine-Version ausdrücklich.
- Eine virtuelle Uhr mit 100 ms je Tick erhält Zeitbudgets und Cooldowns.
  Bot-Zyklen werden seriell abgewartet, die Bot-Zufallsfolge wird ebenfalls fixiert.
  Echte Worker-Latenz, Rendering und Browser-Races sind damit nicht nachgewiesen.
- Das Ende ist ein offizielles `WinUpdate`, eine beobachtete Eliminierung nach
  Spawn oder ein explizites Limit/Fehler. Ein Tick-Limit ist **kein Sieg**.

Optional: `--bot /path/to/variant.user.js` für eine andere Version mit Testanbindung
und `--out /path/to/new-result-directory`. Vorhandene Läufe werden nicht überschrieben.
Die maximale Tickzahl ist 72.000. Getestet wurde der oben fixierte Engine-Stand;
`engine-gameview-v1` identifiziert das Adapterverfahren.

## Vollständiger Browserlauf

```bash
node tools/benchmark/serve-browser.mjs --engine ../OpenFrontIO \
  --map World --difficulty Medium --seed aggro-browser-001 --ticks 18000
```

Die ausgegebene lokale Adresse öffnen und **Testpartie starten** anklicken. Der
Controller lädt den originalen OpenFront-Client in einem Frame, startet genau eine
Singleplayer-Partie über dessen `join-lobby`-Ereignis und aktiviert das Userscript
nach Erkennung der Spielansicht. `LocalServer`, Rendering und Web Worker bleiben
Bestandteil des offiziellen Clients. Das ist keine Automatisierung der Menüauswahl.

Der Browser benötigt gültige achtstellige Spiel-IDs. Hier wird deshalb explizit
`sha256(seed)[0:8]` als `gameID` verwendet; diese Ableitung steht in den Metadaten.
Engine- und Browserläufe werden aufgrund unterschiedlicher Harness-/Seedquellen
nicht als direkt vergleichbare Paare behandelt.

Der Testserver bindet nur an `127.0.0.1` (standardmäßig Port 5173). Die Testanbindung
existiert nur auf Loopback mit explizitem Harness-Opt-in und verweigert Multiplayer
sowie Replays. Das installierbare Userscript startet auf openfront.io weiter manuell.
Der lokale Controller lädt es direkt; zusätzliche Tampermonkey-Matches sind unnötig.

Fortschritt wird alle zehn Sekunden gesichert; Ereignisse werden laufend an den
lokalen Server geschrieben. **Beenden und sichern** beendet die Messung mit
`manual-stop`, nicht mit einem erfundenen Ergebnis. Nach Testende den Server mit
Strg+C beenden. Für unabhängige Browser-Messungen eine separate Browsersitzung nutzen.

**Validierungsstand 20.09.2026:** Serverstart und Syntax geprüft. Der verfügbare
Cloud-Browser konnte Loopback wegen `net::ERR_BLOCKED_BY_CLIENT` nicht öffnen.
Dieser Browserpfad ist deshalb noch nicht Ende zu Ende validiert; Issue #12 bleibt offen.

## Aufzeichnung und Auswertung

Jeder Lauf liegt in `benchmark-results/` (von Git ignoriert):

| Datei | Inhalt |
|---|---|
| `run.json` | Engine-Commit, Bot-SHA256, Seedquelle, Einstellungen, Szenario |
| `events.jsonl` | Vollständiger fortlaufender Entscheidungsstrom mit Sequenznummern |
| `turns.jsonl` | Engine-Läufe: die tatsächlich eingespielten Befehle je Turn |
| `checkpoint.json` | Browser: letzter erfolgreicher Zwischenstand |
| `match.json` | Endzustand, Ergebnis, Abbruchgrund, kumulative Zähler |
| `warnings.log` | Engine-Läufe: Warnungen des Bot-Codes, sofern vorhanden |

Der Diagnosepuffer im Userscript bleibt speicherbegrenzt. Kumulative Zähler und der
externe Ereignisstrom verhindern, dass frühe Aktionen bei langen Tests verschwinden.
`recording.complete` zeigt, ob der aufgezeichnete Strom vollständig ist. Bei hartem
Prozessabbruch bleiben vorhandene Ereignisse/Turns erhalten; ein fehlender Endreport
wird nicht als abgeschlossene Partie behandelt.

```bash
node tools/match-report.cjs --json benchmark-results/run-a/match.json \
  benchmark-results/run-b/match.json
```

Vergleichspaare erfordern ein bestätigtes Ergebnis und identische Engine, Harness,
Seedquelle, Seed, vollständige Spielkonfiguration und Tickgrenze. Bot-SHA256 bzw.
Profil müssen sich unterscheiden. Ein gleicher Versionsname reicht nicht aus.
Unvollständige Spiele werden separat ausgewiesen. Gebäudezählungen umfassen auch
Upgrades; bestätigte Angriffe können über mehrere Entscheidungswege entstehen.
Befehls- und Bestätigungszähler sind deshalb keine allgemeine Erfolgsquote.

## Automatische Parametersuche

```bash
node tools/benchmark/suite.mjs --engine ../OpenFrontIO \
  --profiles autonomous,balanced,cautious,expansion \
  --train-seeds aggro-train-001,aggro-train-002 \
  --test-seeds aggro-holdout-101,aggro-holdout-102
```

Die Profile verändern Aggressivität, Reserve, Aktionsbudget und Zielprüfungen.
`autonomous` nutzt die bestehende Vollautomatik; die anderen Profile verwenden
feste Sliderwerte bei weiterhin aktiver Strategieauswahl. Dies ist eine endliche
Parametersuche, kein Training eines neuronalen Netzes.

Die Auswahl verwendet nur Trainingsstarts. Ein Profil qualifiziert sich erst,
wenn alle seine Trainingsspiele ohne Prozessfehler ein bestätigtes Endergebnis
haben. Zeitlimits werden nicht als Niederlage gewertet und nicht aus einer
angeblichen Gewinnquote herausgerechnet. Bei gleicher Siegeszahl hat die bestehende
Vollautomatik Vorrang. Danach werden das gewählte Profil und die Vollautomatik auf
getrennten Prüfstarts getestet. Falls kein Profil qualifiziert ist, wird nur die
Vollautomatik auf den Prüfstarts untersucht und kein Gewinnerprofil behauptet.

Maximal 40 Partien je Suite, jeweils mit Prozesszeitlimit. `suite-progress.json`
sichert Zwischenergebnisse, `suite.json` die Auswahl und Prüfung.
**Die Parametersuche überschreibt keine produktiven Bot-Einstellungen.** Eine kleine
Stichprobe ist keine belastbare Multiplayer-Gewinnrate. Neue Änderungen sollten
zusätzlich auf Inselkarten, Team-Partien und im echten Browser geprüft werden.
