# Neural Impossible Trainer (experimental, 1.14.0)

Der Trainer fuehrt echte Singleplayer-FFA-Partien mit der offiziellen OpenFront-Engine und Nation-Schwierigkeit **Impossible** aus. Es ist **Neuroevolution / derivative-free Reinforcement Learning**, kein PyTorch-Backpropagationstraining: ein kleines 8→8→2-Tanh-Netz wird mit deterministisch erzeugten Gewichtsmutationen ueber echte Matchresultate optimiert. Keine GPU, PyTorch oder Cloud erforderlich; der limitierende Faktor sind die Engine-Simulationen.

## Spiel-Policy

Die acht Eingaben sind normalisierte Heimtruppen/Kapazitaet, eingehende Truppen/Heimtruppen, staerkster Grenznachbar/Heimtruppen, gebundene Truppen/Heimtruppen, neutrales Land vorhanden, Anzahl erreichbarer Gegner, eigenes Gebiet und Late-Game-Indikator. Ausgaben aendern Aggressivitaet und Reserve um hoechstens ±8 Punkte relativ zur **ungelehrnten** regelbasierten Basis. Im Alarmfall, bei akutem Angriff oder sehr starkem Nachbarn wird das Netz nicht angewandt. Es erzeugt keine direkten Spielbefehle, fuehrt keine illegalen Aktionen aus, hebt nie Allianz- oder Worker-Pruefungen auf und ist ohne gueltige Gewichte AUS.

Die Nullgewicht-Policy ist exakt die bestehende regelbasierte Strategie. Live-Modelle werden NICHT automatisch aus Trainingsordnern geladen; nur ein ausdruecklich erzeugtes Deploy-Userscript enthaelt Gewichte. Im Tampermonkey-Panel bleibt `Neurales Netz` zunaechst AUS. Die lokale Benchmark-VM laedt Kandidaten ausschliesslich aus `--policy` und protokolliert ihren SHA-256 neben Engine- und Bot-Hash.

## Windows-Schnellstart

1. Im Bot-Repo `git pull --ff-only` ausfuehren; Node.js 24 und Git benoetigt. Qwen Code optional in PATH und mit deinem lokalen llama.cpp-Server konfiguriert. Die separate offizielle Engine liegt unter `..\OpenFrontIO`; das Batch-Skript klont sie bei Fehlen, wechselt aber einen bereits vorhandenen Checkout mit anderem Commit **nicht** ungefragt um.
2. `Start_Training.bat` doppelklicken. Es installiert bei Bedarf die Engine-Abhaengigkeiten, spielt standardmaessig 3 Generationen gegen eine und vier Impossible-Nationen und fragt nach jeder Generation Qwen Code nach einer *begrenzten* Mutation-Streuung (Sigma). Ein fehlendes oder fehlerhaftes Qwen blockiert den Trainingsprozess nicht.
3. Berichte stehen unter `benchmark-results/neural-.../history.json`, detaillierte `generation-N.json` und einzelne Match-Ordner unter `matches/`. Im Match-Ordner stehen die echten `match.json`, `events.jsonl`, `turns.jsonl` sowie das getrennte Runner-Log.

Alternativ erst die Groesse pruefen (startet **kein** Match):

```powershell
cd C:\Users\SPK\Desktop\openfront
node trainer/train.mjs --dryRun true --generations 3 --population 4 --trainSeeds 2 --evalSeeds 4 --nations 1,4
```

## Verlaessliche Promotion

- Trainings-Seeds: `train-<generation>-<index>-<map>-<nations>`; davon getrennte Evaluations-Seeds mit Prefix `eval-`. Kandidat und Champion spielen auf **gleichen** Evaluations-Seeds. Die Engine ist auf `bb8af015b515b3b717bd4d901074c5f4c16641cb` fixiert und der Checkout muss sauber sein.
- Die Trainingsbewertung verwendet bestaetigten Sieg als Hauptreward und minimalen Gebiets-/Zeitbonus nur fuer bestaetigt beendete Partien; unterbrochene Matches erhalten negativen Reward. Die Bewertung ist absichtlich *keine* Sieggarantie oder kalibrierte Gewinnwahrscheinlichkeit.
- Nur wenn **alle** Auswertungsmatches abgeschlossen sind und der Kandidat **mehr bestaetigte Siege** als der aktuelle Champion hat, schreibt das System `champion.json`. Die besseren Trainingsgewichte landen sonst lediglich in `provisional.json` und werden **nicht** automatisch live installiert.
- Aufstiegsaussagen sind nur fuer die jeweiligen festen Karten/Gegnerzahlen/Seeds gueltig. Fuer ernstzunehmende Ergebnisse weitere Karten, Seeds, v.a. *neue* Evaluations-Seeds sowie reale Browser- und Multiplayer-Tests einsetzen. Das Netz kann trotz Training weiter 0/4 gegen Impossible erreichen.

## Qwen Code im Terminal

Mit `--qwen true` ruft der Trainer zwischen Generationen (nicht waehrend Engine-Ticks) `qwen -p ... --output-format json --approval-mode plan` auf. Qwen bekommt nur aggregierte, bestaetigte numerische Ergebnisse. Es darf das naechste Sigma zwischen 0.02 und 0.75 empfehlen; Kandidatenauswahl, Matchausgang, Champion-Promotion und Spielregeln bleiben **maschinengeprueft**. Vorschlaege und Fehler werden in `qwen-...`-Dateien protokolliert. `--qwen false` startet ohne Qwen. Qwen Code und der separate llama.cpp-Server muessen bereits korrekt installiert und konfiguriert sein; der Trainer startet llama.cpp nicht.

## Ein Modell in Tampermonkey uebernehmen

Nur wenn das Training **tatsaechlich** eine `champion.json` erstellt hat:

```powershell
node trainer/deploy.mjs --model 'benchmark-results\neural-...\champion.json' --out OpenFront_Solo_AggroBot_Neural.user.js
```

Das Deploy-Tool prueft das Modellschema, bettet die Gewichte in eine neue Userscript-Datei ein, prueft die JS-Syntax und ueberschreibt weder Originaldatei noch vorhandene Deploy-Datei. Vorheriges AggroBot-Userscript in Tampermonkey deaktivieren, neue Datei als Ersatz installieren, `Neurales Netz` bewusst einschalten. Die generierte Datei wird von Git ignoriert.

Zum Start einer neuen Kampagne mit einem **zuvor geprueften** Champion die Datei nach `trainer\champion.json` kopieren. Das Batch-Skript uebernimmt sie dann als Ausgangsmodell. Alternativ `--initialModel PFAD` angeben. Ein nicht aufgestiegener `provisional.json`-Kandidat darf nicht als Champion ausgegeben werden.

Die alten Impossible-Vergleiche hatten 0/4 Siege; der neue Trainingscode ist keine Behauptung, dass dieses Problem bereits geloest ist. Siehe [Impossible-Benchmarks](IMPOSSIBLE.md).
