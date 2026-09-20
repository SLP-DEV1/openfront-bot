# Impossible Counterplay – AggroBot 1.13.0

Die Architektur ist auf die offizielle Nation-KI auf Schwierigkeit **Impossible**
ausgerichtet, nicht auf den einfachen PlayerType.Bot. Der Bot verwendet weiterhin
seine eigene GameView-/EventBus-Anbindung. Seine Intent- und Worker-Sicherheitsprüfungen
dürfen nicht durch ein Modell oder Scoring umgangen werden.

## Strategie und Verteidigung

- Front-Risikobudget für einen gewählten Angriffsgegner: sonstige sichtbare
  und kürzlich gesehene nicht verbündete Grenznachbarn zählen als Gegenbedrohung.
  Vor Ausführung wird nach jedem asynchronen Worker-Check erneut gerechnet.
- Beobachtete Grenztruppen bleiben bei vorübergehend fehlender Grenze höchstens
  240 Ticks als gedämpfte defensive Information relevant; nach 360 Ticks wird
  der Kontakt vollständig gelöscht. Erinnerung erlaubt ausdrücklich **keine**
  Angriffe auf unsichtbare Ziele.
- Beobachteter massiver Gebietsverlust neben einem starken Nachbarn hält die
  defensive Wiederaufbauphase aufrecht, auch bei kurzen Angriffspausen.
- Schwächere Nebenfronten sind keine automatische Angriffserlaubnis:
  gegnerabhängige Heimreserve, eigenes Truppenverhältnis und die Frontbindung
  bleiben verbindlich. Neutrale Expansion nahe einer großen Bedrohung bleibt klein.

## Wirtschaft und Marine

- Stadt/Fabrik, erster Hafen, Silo- und Notfallgebäude werden getrennt priorisiert.
  Nicht baubare Nicht-Hafen-Kandidaten bekommen einen zeitlich begrenzten
  Negativ-Cache, ohne ihre ganze Gebäudeart zu deaktivieren.
- Für den ersten Hafen wird auch bei überfülltem allgemeinen Worker-Budget ein
  eigener Küstenkandidat geprüft. Nach acht erfolglosen Hafendurchläufen wird
  nach 800 Ticks erneut geplant. Der Worker entscheidet über die Legalität.
- Neutrale Inselziele werden nach nahegelegenem freien Land, feindlicher
  Nachbarschaft und Entfernung bewertet; negativ geprüfte Transportziele
  erhalten einen kurzen Cooldown. Spielerlandungen behalten Hauptkriegsziel-,
  Allianzen-, Heimreserve- und Worker-Sicherheitsprüfungen.

## Optional kontrollierte Qwen-Hinweise

Qwen ist weiter optional; Brain und Userscript spielen ohne laufendes Modell
mit der eigenen Policy. Im Panel gibt es zusätzlich den **standardmäßig
ausgeschalteten** Schalter „Qwen-Hinweise (Test)“. Nur authentisierte,
persistierte, bereits fertig berechnete Empfehlungen aus **demselben Match**
und höchstens 480 Ticks alte Einträge können als gebundener Strategie-Hinweis
dienen. Akzeptiert werden ausschließlich DEFEND, ECONOMY und EXPAND;
manuelle Strategie, laufender Krieg, Wiederaufbau, eingehender Angriff,
frischer feindlicher Druck und der bestehende Aktions-/Reserve-/Allianzschutz
gehen vor. Das Modell sendet niemals ein Spiel-Intent oder einen direkten Angriff.
Qwen-Betrieb ist kein Nachweis einer besseren Gewinnquote.

## Offizielle Engine und Reproduzierbarkeit

Der bewährte ältere Harness-Pin bleibt standardmäßig
`13b403387af01d388f8c8ed8c953b6d3a11d1457`.
Zusätzlich erlaubt `--engineCommit` einen **expliziten** 40-stelligen
Git-Commit. Der untersuchte offizielle Nation-Impossible-Stand war
`bb8af015b515b3b717bd4d901074c5f4c16641cb` (20.09.2026).
Jeder Einzelreport enthält den verwendeten Commit. Der Runner lehnt
abweichende Checkouts und veränderte getrackte Engine-Dateien ab.

Der separate CI-Workflow `Impossible Engine Smoke` klont exakt diesen
aktuellen offiziellen Commit und spielt einen begrenzten
World/Compact-Impossible-Engine-Integrationslauf. Ein Tick-Limit ist
**kein Sieg**. Die Engine-/GameView-Adapter-Kompatibilität muss an diesem
Commit bestätigt werden, bevor eine volle Vergleichsmatrix repräsentativ ist.

### Lokale Vorbereitung (PowerShell, Node.js 24 und Git)

```powershell
cd C:\Users\SPK\Desktop\openfront
git pull --ff-only
git clone https://github.com/openfrontio/OpenFrontIO.git ..\OpenFrontIO
git -C ..\OpenFrontIO checkout bb8af015b515b3b717bd4d901074c5f4c16641cb
Push-Location ..\OpenFrontIO
npm run inst
Pop-Location
git show e07288007d27bd0d5ad253b64d2758cb6682b310:OpenFront_Solo_AggroBot.user.js | Set-Content -Encoding utf8 .\baseline.user.js
```

Wenn `..\OpenFrontIO` bereits existiert, **nicht** erneut klonen:
mit `git -C ..\OpenFrontIO fetch` und
`git -C ..\OpenFrontIO checkout <SHA>` den separaten,
sauberen Engine-Checkout auswählen. Die Baseline-Datei muss im
**Bot-Repository** liegen; der `git show`-Befehl oben ist dort auszuführen
(gegebenenfalls den Speicherort im eigenen Checkout kontrollieren).

### Gleiche Seeds: alte gegen neue Policy

```powershell
node tools/benchmark/impossible-matrix.mjs --dryRun true --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb
node tools/benchmark/impossible-matrix.mjs --engine ../OpenFrontIO --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb --baseline baseline.user.js --candidate OpenFront_Solo_AggroBot.user.js --maps World --size Compact --nations 1,4,8 --bots 0 --seeds impossible-101,impossible-102,impossible-103 --ticks 18000 --out benchmark-results/impossible-compare-01
```

Die Maschine benötigt ausreichende Zeit und RAM. Jede Partie liegt in
einem eigenen Ordner, `matrix.json` enthält Abschlussstatus und
Vergleichspaare. Nur beobachtete `victory`/`defeat` bei
`game-over`/`eliminated` werden als beendete Matches gezählt.
Tick-Limits und Prozessfehler bleiben unvollständig. Für die Browser-
und Multiplayer-Validierung gilt weiterhin docs/BENCHMARKS.md / Issue #12.

**Keine unbelegten Siege:** Die 90/100 Duelle und 80 % FFA-Siege aus dem
ursprünglichen Plan sind Abnahmekriterien, keine bislang gemessenen Resultate.
