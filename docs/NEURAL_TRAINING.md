# Neural Impossible Trainer (experimental, 1.15.0)

Der Trainer fuehrt echte Singleplayer-FFA-Partien mit der offiziellen OpenFront-Engine und Nation-Schwierigkeit **Impossible** aus. Es ist **Neuroevolution / derivative-free Reinforcement Learning**, kein PyTorch-Backpropagationstraining: ein kleines 16→12→1-Tanh-Netz wird mit deterministisch erzeugten Gewichtsmutationen ueber echte Matchresultate optimiert. Keine GPU, PyTorch oder Cloud erforderlich; der limitierende Faktor sind die Engine-Simulationen.

## Spiel-Policy: Kandidaten statt Slider

Der Trainingslauf erzeugt jetzt ein neues **Schema-2-Netz (16→12→1,
217 Gewichte)**: Der Bot stellt aus der eigenen GameView beobachtbare
Lagedaten und **pro Kandidat** Typ, Basiswertung, Gegnerstaerke bzw.
Bauklasse, Gebiet/Front, Kosten/Truppeneinsatz und Risiko zusammen.
Die Netzausgabe aendert **nur die Sortierreihenfolge um maximal ±14
Scorepunkte**. Ein Nullgewichtsmodell entspricht exakt dem regulaeren
Heuristik-Ranking.

Die vorhandenen Regelpruefungen begrenzen die Wahl unveraendert:
Angriffsziele werden vor Aufnahme bewertet und vor Versand ueber
`legalTarget` sowie Reserve-, Front-, Allianz- und Feindpruefungen
nochmals validiert; Wirtschaftskandidaten erst nach Worker-Baupruefung,
Finanzierung, Besitz, Pflichtbau und Goldreserve; Marinekandidaten
vor dem Versand erneut auf Wasserweg, Besitz und Bedrohung.
Defensive Notfallrueckzuege und der Scheduler bleiben regelbasiert.
Der Kandidaten-Scorer darf **keine neue Aktion freischalten und keinen
direkten Intent erzeugen**. Bei akutem eingehendem Angriff oder
zu starkem Nachbarn wird er deaktiviert.

Das Scoring findet im bestehenden Attack-, Economy- und Marineplaner
statt, **nicht** als freier globaler Scheduler, der gleichzeitig zwischen
Bau und einem Angriff waehlt. Es ersetzt weder die taktischen
Heuristiken noch garantiert es ein strategisch gelungenes Spiel.

Schema-1-Modelle (8→8→2, frueher Slider) bleiben im Userscript
lesbar, sind aber mit dem neuen Training **nicht kompatibel**:
`--initialModel` verlangt nun Schema 2. Einen alten
`provisional.json`-Kandidaten nicht als Champion ausgeben.
Das Netz ist im normalen Userscript ohne gebuendelte Gewichte und
separates Opt-in **AUS**; nur die isolierte Engine-Benchmark-VM
aktiviert Testmodelle automatisch und protokolliert ihren SHA-256.

## Verlauf statt nur Schlussbild

Die echte Engine zeichnet im Matchbericht alle 200 Ticks einen
begrenzten, ausschliesslich ueber `GameView` sichtbaren Verlauf auf:
eigenes Land, Heimtruppen, Gold sowie sichtbares Gegnerland und
Gegnertruppen. Die Zusammenfassung enthaelt Hoechststand,
durchschnittlich gehaltenes Land und den beim Schluss verbliebenen
Anteil. Der Such-Reward beruecksichtigt daher **halten statt nur kurz
erobern** und unterscheidet nachgewiesene Niederlage, rechtszensierte
Tick-Limit-Partie und verifizierten Sieg.

Der Reward dient nur zum Erkunden und zur **vorlaeufigen**
Parent/Kandidat-Auswahl. Ein Tick-Limit zaehlt weiterhin nie als Sieg.
Ein Champion entsteht ausschliesslich bei mehr **bestaetigten Siegen
auf paarigen, getrennten Evaluations-Seeds** und vollstaendigen
Matchdaten. Ein hoeherer Reward allein erteilt keine Freigabe.

## Windows-Schnellstart

1. Im Bot-Repo `git pull --ff-only` ausfuehren; Node.js 24 und Git benoetigt. Qwen Code optional in PATH und mit deinem lokalen llama.cpp-Server konfiguriert. Das Batch-Skript benutzt den eigenen Trainings-Checkout `..\OpenFrontIO-Impossible` und klont ihn bei Fehlen. Der bisherige `..\OpenFrontIO`-Checkout mit dem alten Benchmark-Commit bleibt unveraendert. Ein bereits vorhandener Trainings-Checkout mit anderem Commit wird ebenfalls nicht automatisch umgestellt.
2. `Start_Training.bat` doppelklicken. Es installiert bei Bedarf die Engine-Abhaengigkeiten und startet standardmaessig **vier voneinander isolierte Engine-Partien gleichzeitig** (3 Generationen, eine und vier Impossible-Nationen). Nach jeder Generation fragt es Qwen Code nach einer *begrenzten* Mutation-Streuung (Sigma); ein fehlendes Qwen blockiert das Training nicht.
3. Berichte stehen unter `benchmark-results/neural-.../history.json`, detaillierte `generation-N.json` und einzelne Match-Ordner unter `matches/`. Im Match-Ordner stehen die echten `match.json`, `events.jsonl`, `turns.jsonl` sowie das getrennte Runner-Log.

Alternativ erst die Groesse pruefen (startet **kein** Match):

```powershell
cd C:\path\to\openfront
node trainer/train.mjs --dryRun true --generations 3 --population 4 --parallel 4 --trainSeeds 2 --evalSeeds 4 --nations 1,4
```

## Parallele Simulationen (Ryzen 9 9950X3D, 64 GB)

Die Engine-Matches sind separate **Node.js-Prozesse**, die gleichzeitig
laufen, nicht mehrere simulierte Gegner in einer einzigen Partie. Jedes
Match bekommt ein eigenes Modellfile, Seeds, Engine-GameView, Log und
Ergebnisverzeichnis. Der Trainer fasst alle Resultate erst nach Ende der
jeweiligen Trainings- bzw. Evaluationsphase zusammen. Qwen Code laeuft
**zwischen** den Phasen, nicht in jedem Engine-Prozess. Die RTX 4090
wird vom Engine-Runner nicht fuer diese Simulationen verwendet.

Der Batch-Start benutzt `--parallel 4`; bei knappen 64 GB RAM oder
parallel laufenden Spielen/llama.cpp mit `--parallel 2` beginnen.
`--parallel 6` nur nach Beobachtung von CPU-Auslastung, RAM und
Gesamtdurchsatz testen; bis zu 8 ist technisch erlaubt. Die Durchsatz-
steigerung ist nicht automatisch linear. Die Anzahl der Seeds und
die strenge Champion-Promotion bleiben bei allen Einstellungen gleich.

`--parallel` beschleunigt nur den lokalen Trainingsdurchlauf. Ein
Training ueber mehrere Start_Brain.bat-/Start_Training.bat-Fenster ist
nicht noetig; insbesondere gleichnamige Ausgabeordner vermeiden.

## Verlaessliche Promotion

- Trainings-Seeds: `train-<generation>-<index>-<map>-<nations>`; davon getrennte Evaluations-Seeds mit Prefix `eval-`. Kandidat und Champion spielen auf **gleichen** Evaluations-Seeds. Die Engine ist auf `bb8af015b515b3b717bd4d901074c5f4c16641cb` fixiert und der Checkout muss sauber sein.
- Der Such-Reward bewertet zusaetzlich den sichtbaren Matchverlauf: mittleres gehaltenes Land, Gebietshoechststand und Retention bei Partieende. Sieg-Nachweis und Champion-Freigabe bleiben strikt unabhaengig vom Reward; passives Ueberleben oder blosse Groesse kann dennoch zu einem suboptimalen Suchsignal fuehren.
- Nur wenn **alle** Auswertungsmatches abgeschlossen sind und der Kandidat **mehr bestaetigte Siege** als der aktuelle Champion hat, schreibt das System `champion.json`. Die besseren Trainingsgewichte landen sonst lediglich in `provisional.json` und werden **nicht** automatisch live installiert.
- Aufstiegsaussagen sind nur fuer die jeweiligen festen Karten/Gegnerzahlen/Seeds gueltig. Fuer ernstzunehmende Ergebnisse weitere Karten, Seeds, v.a. *neue* Evaluations-Seeds sowie reale Browser- und Multiplayer-Tests einsetzen. Das Netz kann trotz Training weiter 0/4 gegen Impossible erreichen.

## Qwen Code im Terminal

Mit `--qwen true` ruft der Trainer zwischen Generationen (nicht waehrend Engine-Ticks) `qwen --output-format json --approval-mode plan` auf und uebergibt den Prompt auf stdin. Das JSON-Transkript von Qwen Code 0.24.x enthaelt die Antwort teils im letzten Assistant-Text bei leerem abschliessendem `result`-Feld; beide Formen werden validiert. Qwen bekommt nur aggregierte, bestaetigte numerische Ergebnisse. Es darf das naechste Sigma zwischen 0.02 und 0.75 empfehlen; Kandidatenauswahl, Matchausgang, Champion-Promotion und Spielregeln bleiben **maschinengeprueft**. Vorschlaege und Fehler werden in `qwen-...`-Dateien protokolliert. `--qwen false` startet ohne Qwen. Qwen Code und der separate llama.cpp-Server muessen bereits korrekt installiert und konfiguriert sein; der Trainer startet llama.cpp nicht.

## Ein Modell in Tampermonkey uebernehmen

Nur wenn das Training **tatsaechlich** eine `champion.json` erstellt hat:

```powershell
node trainer/deploy.mjs --model 'benchmark-results\neural-...\champion.json' --out OpenFront_Solo_AggroBot_Neural.user.js
```

Das Deploy-Tool prueft das Modellschema, bettet die Gewichte in eine neue Userscript-Datei ein, prueft die JS-Syntax und ueberschreibt weder Originaldatei noch vorhandene Deploy-Datei. Vorheriges AggroBot-Userscript in Tampermonkey deaktivieren, neue Datei als Ersatz installieren, `Neurales Netz` bewusst einschalten. Die generierte Datei wird von Git ignoriert.

Zum Start einer neuen Kampagne mit einem **zuvor geprueften** Champion die Datei nach `trainer\champion.json` kopieren. Das Batch-Skript uebernimmt sie dann als Ausgangsmodell. Alternativ `--initialModel PFAD` angeben. Ein nicht aufgestiegener `provisional.json`-Kandidat darf nicht als Champion ausgegeben werden.

Die alten Impossible-Vergleiche hatten 0/4 Siege; der neue Trainingscode ist keine Behauptung, dass dieses Problem bereits geloest ist. Siehe [Impossible-Benchmarks](IMPOSSIBLE.md).
