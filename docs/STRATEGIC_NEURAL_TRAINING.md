# Selbstlernende strategische Policy (Schema 3)

Das frühere Schema 1 änderte nur zwei Slider. Schema 2 sortierte bereits zugelassene Kandidaten. Schema 3 ist ein gemeinsames **16-Eingänge/16-verdeckte-Neuronen/16-Ausgänge**-Netz (544 trainierbare Gewichte), das mehrere Planer gleichzeitig anpasst. Die Nullgewichte bewahren die normalen Regeln.

## Aktuell lernbare Ausgänge

| Ausgabe | Wirkung |
|---|---|
| reserve | Zusätzlicher Heimtruppen-Puffer, unveränderte harte Front- und Invasionsuntergrenzen |
| aggression | Dynamische offensive Einstellung |
| neutralCommit | Truppengröße neutraler Expansion innerhalb des sicheren Budgets |
| enemyCommit | Kandidatenbewertung und Angriffsgröße innerhalb verfügbarer Heimreserve |
| warThreshold | Stärkevorteil zum Eröffnen eines erlaubten Krieges |
| navalThreshold | Kräfteverhältnis, bevor ein bereits legaler Transport versucht wird |
| landPriority, navalPriority, holdPriority | Zentrale Reihenfolge: Land, Marine oder warten |
| cityPriority, factoryPriority, portPriority, defensePriority | Gebäudeschwerpunkte bei zugelassenen Bauoptionen |
| nuclearPriority | Silo-Investitionspriorität |
| diplomacyPriority | Nutzen eines möglichen Bündnisses |
| fleetPriority | Planerzahl der Kriegsschiffe |

**Nicht lernbar und absichtlich verbindlich** bleiben Eigentums- und Allianzprüfung, das offizielle `me.actions()`-Legalitätsurteil, die Notverteidigung, Mindestreserven, Bausperren, Raketenschutz gegen eigenes/verbündetes Gebiet, Aktionsrate, Match-Berechtigung und Echtgeld-/Account-Aktionen. Das Modell schreibt keine JavaScript-Funktionen um. Es wählt beschränkte numerische Handlungsparameter anhand des beobachtbaren Spielzustands.

## Windows: Training beginnen

Aus dem Repository `Train_Strategic_Neural.bat` starten. **Vor dem Training erscheint eine Auswahl für die Gegner-Schwierigkeit:** `1 = Mittel (Medium)`, `2 = Schwer (Hard)`, `3 = Unmöglich (Impossible)`. Die Auswahl gilt für alle Trainings- **und** Vergleichsmatches desselben Laufs; sie ändert nicht die Aggressivitäts-Slider unseres eigenen Bots. Das Skript findet `../OpenFrontIO` oder klont die offizielle Engine, pinnt den exakten Referenz-Commit, installiert gegebenenfalls Node-Abhängigkeiten, startet den Trainingslauf und erzeugt **nur bei bestandenem Holdout** ein eigenständiges Tampermonkey-Skript.

Die Startdatei kann auch ohne Menü per `Train_Strategic_Neural.bat Medium`, `Train_Strategic_Neural.bat Hard` oder `Train_Strategic_Neural.bat Impossible` aufgerufen werden. Ohne Angabe im Node-Trainer bleibt `Impossible` der Standard.

Manuell auf Windows/Linux:

```sh
node trainer/train.mjs --engine ../OpenFrontIO \
  --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb \
  --maps World,Europe --nations 1,4 --generations 3 \
  --population 4 --trainSeeds 2 --evalSeeds 4 \
  --difficulty Hard \
  --ticks 18000 --parallel 2 --sigma 0.12 \
  --out benchmark-results/strategic-run
```

Der Trainingsplan (`plan.json`), die Match-Zeilen und die Generationsberichte enthalten die gewählte Schwierigkeit. Unterschiedliche Schwierigkeitsstufen werden beim Paarvergleich nicht vermischt. **Bei Wechsel der Schwierigkeit ein neues Training beginnen**; einen `--initialModel`-Champion von einer anderen Stufe nur mit eigener Vergleichsvalidierung übernehmen.

Der Trainingslauf erzeugt für jede Generation Kandidaten und testet alle auf denselben Training-Seeds. Nur der ausgewählte vorläufige Kandidat tritt auf **separaten Evaluation-Seeds** gegen das aktuelle Champion-Modell an. Unvollständige Spiele sind keine Siege. Ein Champion wird nur bei mehr bestätigten Siegen oder bei mehrfachen eindeutigen Überlebensgewinnen ohne Regression veröffentlicht. Nicht jede Generation führt zu einem Champion.

```sh
node trainer/deploy.mjs --model benchmark-results/strategic-run/champion.json \
  --out OpenFront_Solo_AggroBot_Neural.user.js
```

Schema-3-Deployments werden **bei frischer Installation** automatisch aktiviert; eine bereits gespeicherte manuelle Deaktivierung wird respektiert. Der Benchmark lädt die Modellgewichte nur in einer isolierten Loopback-Umgebung, keine automatische Online-Gewichtsänderung während einer öffentlichen Multiplayer-Partie.

**Wichtige Einschränkungen:** Das ist evolutionäres, Engine-basiertes Selbsttraining, kein universeller Code-Generator und kein garantierter stärkster Bot. Simulation gegen KI-Nationen ist kein Nachweis gegen menschliche Spieler. Modelle werden erst nach reproduzierbaren, vollständigen Vergleichspartien als stärker ausgewiesen. Bestehende Trainingsordner werden nicht überschrieben.
