# OpenFront AggroBot – Overnight Neural Campaign (modellagnostisch)

> **Arbeitsplan für Qwen Code.** Repository: `SLP-DEV1/openfront-bot`.  
> **Ziel:** Den neuesten **tatsächlich trainierten und validierten** Neural-Kandidaten aus den vorhandenen Modelllinien ermitteln, gezielt verbessern und gegen unveränderte Baselines mit echter Engine-Evidenz prüfen. **Fünf Stunden tatsächliche Kampagnenlaufzeit** für Datenerhebung, Training und Evaluation **nach** Git-/Integrations- und Pflichtprüfungen. Die gesamten Vorbereitungs- und Abschlussarbeiten dürfen zusätzlich Zeit benötigen.  
> **Wichtig:** „Neural V6“, „v5-v2“, Modell-`schema`, Experimentversion, Botversion und aktiver Champion sind **verschiedene Begriffe**. Keine Modellversion aufgrund ihres Namens als aktuell, aktiv, besser oder kompatibel behandeln. Die historische V6-Collapse-Kampagne ist zu berücksichtigen, aber kein Beleg für eine V6-Promotion.

## 0. Nicht verhandelbare Grenzen

- **Selbstständig ausführen, nicht nur planen.** Fortschritt und Ergebnisse lokal dauerhaft sichern, sodass der Lauf auch nach Shell-/Agent-Neustart nachvollziehbar bleibt. Kein Warten auf Rückfragen für gewöhnliche technische Entscheidungen.
- **Run3-Schema-4-Champion nicht ersetzen.** Sein voller Modellhash, Bot-Dateihash und Runtime-Status werden vor Beginn gepinnt. Kein automatisches Deployment, kein stilles Umbenennen eines Kandidaten in „Champion“.
- **Keine lokalen Änderungen oder untracked Dateien verwerfen:** niemals `git reset --hard`, `git clean -fd`, Force-Push oder blindes `git pull` auf schmutzigen Tree. Besondere Rücksicht auf `.tmp-*`, `lastEmission`, `.ci/`, lokale Rohlogs, unbekannte Worktrees.
- **Neue Gameplay-Änderungen auf `origin/main` erhalten**, insbesondere Duo-/SAM-/Silo-/Wirtschafts-/Marine-Fixes. Nichts auf ältere Bundles zurücksetzen. Kanonische `src/userscript/*`-Quellen ändern; beide erzeugten Solo-/Run3-Skripte mit den vorhandenen Build-Werkzeugen reproduzieren und prüfen.
- **Hard safety beibehalten:** aktuelle Team-/Allianz-Zuordnung, Eigentum, Legalität/`me.actions()`, Nuklear-Freundschutz, Heimat-/Truppen-/Goldreserven, Worker- und Aktionslimits dürfen vom Modell nicht umgangen werden. Browser-/Engine-Inferenz muss mit denselben verfügbaren sichtbaren Inputs funktionieren.
- **Keine Trainingsevidenz erfinden:** `tick-limit`, persönliche Team-Eliminierung, verschwundene Schiffe, gesendete aber unbestätigte Intents und fehlende Telemetrie sind keine bestätigten Siege oder Erfolge. Eine Partie ist die statistische Einheit; Duo-Exports eines Matches nicht doppelt zählen.
- **Kein Gate-Weichzeichnen oder Holdout-Leakage:** Falsche Aufzeichnung reparieren statt `recording.dropped` blind ignorieren; verbrauchte Final-Seeds sind nie wieder unabhängiger Final-Holdout. Kein Final-Holdout als Optimierungsschleife verwenden.
- Qwen/llama.cpp darf Code und Berichte unterstützen, **nicht** pro Engine-Tick im Live-Bot benötigt werden. Alle trainierten Modelle müssen offline reproduzierbar und lokal inferierbar sein.
- Im Abschluss strikt trennen: `implementiert` / `lokale Tests bestanden` / `echte Engine-Matches ausgewertet` / `Human-Multiplayer getestet` / `Promotion bestanden`. Ein Exit-Code 1 des Holdout-Runners kann bei `NOT-ELIGIBLE` erwartetes Gate-Verhalten sein; das allein besagt nichts über Crash oder Datenintegrität.

## 1. Git- und Modellinventar vor irgendeinem Training

**Shell-Kommandos zu Beginn (PowerShell):**

```powershell
 git status --short
 git branch --show-current
 git log -12 --oneline
 git remote -v
 git fetch origin
 git log -8 --oneline origin/main
 git branch -avv
 git worktree list
```

1. Vergleiche lokalen HEAD mit `origin/main`, allen relevanten Trainingsbranches, Tags und vorhandenen Modellartefakten. Frühere lokal gemeldete SHA-Kürzel wie `59803c8`, `d79874e`, `aa0df2d`, `dabe7d4` **nur nutzen, falls `git cat-file -t` sie tatsächlich findet**. Frühere V6-Tooling-Commit `6b00341` und die zugehörigen Artefakte/Reports auf Zugehörigkeit und Reproduzierbarkeit prüfen; nicht annehmen, dass der Commit derzeit auf `main` liegt.
2. Für jede Modelllinie eine Inventartabelle anlegen: **Modell-ID, Experiment-/Kampagnenname, `schema`, Architektur/Gewichte, Feature-Version, Modell-SHA256, Engine-Pin, Bot-Code-SHA, Datensatz-SHA, Train/Validation/Final-Splits, Engine-Matchergebnisse, Gate-Status, Speicherpfad, Nachvollziehbarkeit, aktiver Deployment-Status.** Mindestens Run3-Schema-4, V5/v5-v2 und V6-/Collapse-Linien prüfen. Inkompatible Schemas **nicht** als direkt resume-fähig behandeln.
3. **Neuester ≠ bester.** Als Ausgangspunkt den neuesten *verifiziert trainierten und validierten, mit aktuellen Gameplay-Fixes kompatiblen* Kandidaten nehmen. Falls V6 nur eine Trainingskampagnenversion auf Schema-4-Basis ist, diese korrekt so bezeichnen. Falls das aktuellste **geeignete** Modell aus der V5-Linie stammt, ebenfalls korrekt benennen. Trainierbare Linien nur mit explizit dokumentierter Migration/Distillation kombinieren, niemals Gewichtsarrays schemablind mischen.
4. Sichere Merge-/Integrationsstrategie: eigenen Branch/Worktree von aktuellem `origin/main`, notwendige v5-/v6-Arbeiten nachvollziehbar integrieren oder gezielt portieren. Konflikte an `src/userscript`, den beiden generierten Scripts, `trainer/`, `tools/benchmark/` und CI gezielt lösen. Original-Worktree unangetastet lassen.
5. Schreibe `benchmark-results/overnight-<campaign-id>/inventory.json` und eine kompakte lesbare Inventarnotiz. Pinnen, was anfangs aktiv ist; alten Champion **niemals** überschreiben.

**Stop-Kriterium:** Keine neue Kampagne auf unklarem Git-Stand, beschädigtem Modell, nicht reproduzierbarer Inferenz, inkonsistenten Bundles oder unbekanntem Engine-Pin starten. Blocker sauber dokumentieren und in einem isolierten Branch reparieren.

## 2. Reproduzierbarkeit und Pflichtregressionen

- Repariere den gemeldeten `#133 budget-block telemetry is reasoned and time-deduplicated`-Ausfall, falls er im integrierten Stand noch reproduzierbar ist. Prüfe `samFund`, Kerninvestitionen, `suppressedSinceLast`, Session-Key und Deduplizierungsfenster: **Codefehler beheben oder sachlich veraltete Fixture aktualisieren; Assertion nicht stumm entfernen.** Mit altem Commit nur bei tatsächlich identischen Inputs vergleichen.
- Prüfe Build-/Bundle-Parität mit den **im Repo tatsächlich existierenden** Kommandos (z. B. `node tools/build-userscript.cjs --check`, `node tools/build-run3-bundle.cjs --check`). Laufzeit-/Schema-/Feature-/Holdout-/Strategie-/Duo-/Marine-/Wirtschaftsregressionen ausführen; nicht existente Dateinamen nicht erfinden.
- Falls GitHub Actions wegen Billing vor Runner-Start scheitert: dokumentiere `CI not run / infrastructure`, nicht `tests failed` oder `CI green`. Lokale Tests mit Kommando, Exit, Zeit, Commit und Logpfad belegen.
- Kampagnenstart erst nach Integrationsprüfung. Vorbestehende fehlschlagende Tests müssen ausdrücklich erklärt und nach Möglichkeit behoben sein. Kein Einsatz eines Kandidaten, wenn Hard-safety-Tests scheitern.

## 3. Zeitbudget und Orchestrierung

**Kampagnenzeit:** ab Beginn der *echten Trainings-/Datenerhebungs-/Benchmark-Phase* 5 Stunden monotone, verstrichene Zeit. Vorbereitungszeit separat erfassen. „Über Nacht“ bedeutet selbstständig bis zum Abschluss weiterarbeiten, **nicht** eine fiktive Anzahl Trainingsepochen oder eine Garantie auf einen Sieger.

- Führe eine resumierbare Kampagnensteuerung mit `startedAt`, `monotonicElapsed`, `phase`, `modelSHA`, `datasetSHA`, `engineCommit`, `nextJob`, `jobs`, `errors` und atomisch gespeicherten Checkpoints. Keine parallelen Shells ohne saubere Job-IDs/Abschlussprüfung.
- Zeitheuristik für die fünf Stunden: ~30 % gezielte Engine-Datenerhebung, ~30 % Kandidatentraining, ~30 % echte Evaluation, ~10 % Analyse/Final-Holdout. An tatsächliche Laufzeiten anpassen; nicht minutenlang untätig oder gleiche wertlose Trainingsepochen wiederholen.
- Mindestens einmal früh einen *günstigen, echten* Kandidaten-Entscheidungscheck und kurze Engine-Evaluation machen, damit die Kampagne erkennt, ob überhaupt ein Signal vorhanden ist.
- Schlechte Kandidaten früh aussortieren, aussichtsreiche mit mehr Matchbudget prüfen. Für jeden Kandidaten immutable Manifest/Checkpoints anlegen; Zwischenstände nicht überschreiben.
- Unbeabsichtigte `output directory exists`, Shell-Exit, OOM oder hängende Engine-Prozesse kontrolliert behandeln; keine Vollwiederholung bereits erfolgreich protokollierter Jobs.

## 4. Ursachenanalyse: Warum blieb vorherige Neural-Policy ohne Sieggewinn?

Ermittle anhand echter Artefakte, nicht anhand reiner Dateinamen:

1. **Coverage:** Wie viele von allen Modellinputs variieren in echten Runtime-Frames? Welche sind maskiert, konstant, veraltet oder nicht im Candidate-Projektor enthalten? Trainings- und Laufzeitinputs byte-/wertgleich prüfen.
2. **Kontrolle:** Differenzieren sich Scores pro legaler Kandidatengruppe? Wie oft unterscheiden sich `modelChoice`, `ruleChoice`, `actualIntent` und bestätigter Engine-Befehl? Hohe `changedIntent`-Quote ohne besseren Outcome **nicht** als Fortschritt zählen.
3. **Kausalität/Labels:** Enthalten Zeilen für *nicht gewählte* Alternativen den beobachteten Outcome der tatsächlich gewählten Aktion? Wenn ja, korrekte Attribution herstellen. Nicht gewählte Kandidaten erhalten `unknown`, außer es gibt saubere, vorregistrierte, reproduzierbare Game-State-Rollouts mit eigener Provenienz. Mehrere Kandidaten desselben Ticks erhalten **nicht** blind gleiche Erfolgslabels.
4. **Sichtbarkeit:** Kein verstecktes Engine-Wissen als Live-Eingabe; unbekannte Gegnertruppen, Marine-/ETA- und Outcome-Infos maskieren.
5. **Targets:** Vergleiche kurze/mittlere/lange Horizonte; gehaltenes Land, wirtschaftliche Handlungsfähigkeit, Truppenverluste, defensive Krisen, bestätigtes Ergebnis. Persönliches Team-Aus ≠ Team-Niederlage; Tick-Limit zensiert. Schätze Label-Varianz, Klassenbalance, Korrelation, Kalibrierung, train-vs-validation-gap und echte Ablationen.
6. **Verhaltensdegeneration:** Prüfe passive `hold`-Last, Angriffsdürre/War-Lock, Goldhorten, 2. City/Factory, SAM/Silo-Fehlpriorisierung, Marine ohne Landung, zu späte Verteidigung, Duo-/Allianzfehler.
7. **Modelle vergleichen:** V6-/V5-/Schema-4-Linien nicht durch historische ungepaarte Ergebnisse rangieren; gleiche Botversion/Engine/Seeds/Baselines für neue direkte Aussagen nutzen.

Ausgabe `diagnosis.md`: priorisierte **belegte** Engpässe und welcher Trainingsversuch welchen Engpass adressiert.

## 5. Echte Datenerhebung und Lernziele

- Nutze gepinnte, legal sichtbare Engine-GameView-Frames, protokolliere `matchId`, Perspektive, Seed, Karte, Modus, Gegnerprofil, Engine-/Bot-/Policy-SHA, Tick, Zustand, Kandidaten, gewählten Kandidaten, gesendeten Intent, bestätigte Aktion, beobachteten Effekt, Outcomes und Zensierung.
- Markiere Quellen als `real-engine`, `human-replay-validated`, `synthetic-fixture` etc.; keine Vermischung von Fixture und Spielbeleg. Für Human-Replays Provenienz/Nutzungsrecht und Engine-Pin einhalten.
- Train-/Validation-Split auf **ganzen Matches**; verwandte Duo-Perspektiven und ähnliche Replays nicht in beide Splits. Final-Holdout streng getrennt.
- Aktions-/Situationsabdeckung ausbalancieren: Rush, Landangriff, Rückzug, Defense, Kern-Wirtschaft, Silo/SAM, Transport/Escort/Landung, Teamhilfe, Late-Game und Siegabschluss. Hard/Impossible, World/Europe, unterschiedliche gefrorene Gegnerstile und beide Kernmodi berücksichtigen. Keine „100 % Sieg“ durch nur leichte Gegner erzeugen.
- Bei Off-policy-Daten keine Ergebnislabels jeder theoretischen Alternative zuweisen. Falls Ranking-Loss verwendet wird, nur vergleichbare **wirklich beobachtete** Handlungen/korrekt kontrollierte Rollouts mit gültiger Provenienz paaren. Achte auf Selection Bias. Szenario-Rollouts müssen sichtbare Spielzustände korrekt rekonstruieren und die Engine-Legalität erhalten.
- Prüfe Datenpipeline mit Tests: `unknown` bleibt `unknown`, keine falsche Held-Gain-Zuordnung, kein Frame-Leakage, keine unbestätigten Gewinne, keine doppelte Duo-Partie.

## 6. Trainiere *den nachweislich neuesten geeigneten Modellstand*, nicht den Namen „V5“

- Modellpipeline auf Schema/Architektur des inventarisierten Ausgangsmodells ausrichten. V6 als Kampagnenversion nicht mit `schema:6` gleichsetzen. Beim Ändern der Featureanzahl/Architektur ein **neues Schema-/Featuremanifest** und reproduzierbare Migration anlegen, nicht still weights neu interpretieren.
- Wenn die aktuelle Linie echter Evolutions-/Policy-Suchtrainer (z. B. V6-Collapse) ist, benutze deren existierende Cross-Generation-/Collapse-Mechanik und Champion-Schutz. Wenn die geeignete Linie ein Schema-5-Kandidatenranker ist, benutze dessen validierte Inferenz, Trainer und korrekte Outcome-Labels. Ermittle anhand der Ergebnisse, ob Distillation auf gemeinsame sichere Aktionsschnittstellen sinnvoll ist; nur als eigene, geprüfte Variante.
- Vergleichbare Varianten vorregistrieren: sinnvoll unterschiedliche Horizonte, ausgewogene Stichproben, Lernrate/Epochen, outcome-/ranking-basierte Losses, Risiko-/Landgewichte, ggf. größere Architektur **nur bei belegtem Underfitting**. Dieselben Daten mit minimal verschiedenen LR-Werten sind kein Ersatz für echte Lernsignale.
- Pro Variante: volle Modell-SHA, Daten-/Code-/Engine-Pin, featurisierte Schema-Version, Seeds, Config, Train-/Validation-Loss, Kalibrierung, Score-Streuung, Entscheidungsänderungen, Fail-safe-Häufigkeit, ggf. Collapse-Wächter. Getrennte Validation-Splits; keine Optimierung auf Final-Holdout.
- Mehr Training ist nur sinnvoll, wenn Validierung, sinnvoller Rankingabstand **und** echte Engine-Resultate eine Richtung zeigen. Schlechte Linien verwerfen oder gezielt reparieren; nicht fünf Stunden lang Nullgewichte trainieren.

## 7. Evaluation und Promotion – keine Abkürzung

**Baselines:** unveränderte Regelbasis und aktiver Run3-Schema-4-Champion **auf demselben aktuellen Bot-Code**, plus vorheriger geeigneter Neural-Kandidat. Für eine V6-Evolutionslinie zusätzlich die im eigenen Protokoll gepinnten älteren Champions/Provisionals. Keine unkontrollierte Bot-Code-Änderung als „neuraler Gewinn“ deklarieren.

- Erst günstige echte Entscheidungstests und kurze Engine-Matches auf **Development-/Validation-Seeds**; bestätigter Sieg vs zensierter Tick-Limit getrennt. Harte Fehler (Allianz/Nuke, Safety, Economy-Collapse, Marine-Stall) stoppen Kandidaten früh.
- Für Final-Holdout erst **nach** Kandidatenauswahl neue, unbenutzte Seeds und Szenarien einfrieren (Manifest mit Hash **vor** Start speichern). Keine zuvor benutzten V5-/V6-/v5-v2-Holdouts als unabhängige Bestätigung ausgeben.
- Final, soweit Zeitbudget und Engine erlauben: gepaarter Drei-Arm-Vergleich (`candidate`, `rule-basis`, `run3-schema4`) pro 1v1, offizielles 2v2, FFA-Duo **getrennt**. Nicht erzwingen, dass alle Modi in fünf Stunden genügend decisive Paare liefern; unvollständige Arbeit bleibt `not completed`.
- Je Modus: ausgeführte Partien, bestätigte Siege/Niederlagen, zensierte/ungültige Partien, Paare pro vorregistrierter Zelle, Held-Land/Survival als auxiliary, gepaarte Effekte + Unsicherheitsintervalle, Safety-/Collapse-Gates und fehlerfreie Provenienz. 48 Partien = 16 Szenarien × 3 Arme, **nicht** 48 gepaarte Beobachtungen.
- Gate-Fehler genau erklären: absichtlich `eligible ? 0 : 1` vs Prozesscrash; `recording.dropped`, Streamfehler, fehlende Frames, Nichtabschluss und zu wenige decisive Paare. Gate nicht nachträglich lockern. Keine Promotion bei Gleichstand, Nichtunterscheidbarkeit, Regression, unvollständigem Gate oder fehlender Final-Evidenz.
- Bei positivem Befund **nur** versionierten Promotion-Vorschlag mit Belegen erzeugen. Run3 bleibt aktiv, bis gesondert explizit und mit vollständigen Sicherheitsprüfungen freigegeben.

## 8. Abschluss der Nacht

Erzeuge dauerhaft:

- `campaign-manifest.json`: Git-/Engine-/Baseline-/Modell-/Daten-SHAs, echte Zeitstempel und monotone Kampagnenlaufzeit, verwendete Ressourcen, Jobs/Exitcodes.
- `model-inventory.md` mit klarer **V5 vs V6 vs Schema-4**-Unterscheidung und aktivem Champion.
- `diagnosis.md`: warum vorige Linien nicht besser waren, was repariert/geändert wurde, echte Befunde vs Hypothesen.
- Pro trainiertem Kandidaten immutable Modell-/Config-/Validation-/Ablationsartefakte mit hashes.
- `evaluation.md`: je Modus echte Engine-Matches, alle zensierten Partien, Verifikation, n pro Arm/Pair, Vergleich gegen beide Baselines, Unsicherheiten, Negative Gates.
- `promotion-decision.json`: `eligible`, `promote:false` standardmäßig, nachvollziehbare Gate-Gründe. Nie Verbesserung allein aus Modellhash oder `changedIntent` ableiten.
- `overnight-report.md`: Zeitaufwand **vor** Kampagne vs **5h** Kampagne vs Abschluss, erledigt/offen, vollständige lokale Tests, CI-Status, Laufzeitgründe bei vorzeitigem Abbruch und konkrete nächste Maßnahme.

Wenn ein Repo-Skript Log/Artefaktpfade anders definiert, vorhandene Konvention übernehmen. Große Rohresultate nicht versehentlich in Git committen; kompakte verifizierbare Manifeste/Reports versionieren. Kein Push auf `main` durch Force, keine laufenden Jobs als „abgeschlossen“ deklarieren. Nach Lauf alle Kindprozesse beenden/prüfen, Branch/Tree sowie SHA-Pins dokumentieren und bei sauberem Teststand nachvollziehbar committen. Ob und wohin zu pushen ist, an vorhandene Projektpraxis und Berechtigungen anpassen, ohne fremde Arbeit zu überschreiben.

## 9. Definition of Done

- [ ] Vorheriger Run3-Champion/Schema-4-Fingerprint bestätigt und unverändert; keine heimliche V5/V6-Promotion.
- [ ] Git-Integration mit neueren `origin/main`-Gameplay-Fixes und beide Bundles geprüft.
- [ ] V5-/V6-/Schema-4-Modellinventar mit korrekten SHA-/Schema-/Kampagnenbegriffen.
- [ ] Daten- und Modellursachen priorisiert, Label-/Feature-Probleme geprüft bzw. behoben.
- [ ] Tatsächliche 5h Kampagnenlaufzeit oder dokumentierter technischer Stop mit Checkpoints.
- [ ] Mehrere sinnvoll verschiedene Kandidaten evaluiert; schlechte früh ausgeschieden.
- [ ] Echte Engine-Evidence mit korrekten Zensierungs- und Paarzahlen, frischem Final-Holdout soweit durchgeführt.
- [ ] Unverändertes Gate ehrlich angewandt; keine „NO PROMOTION“ als technischen Absturz etikettiert.
- [ ] Tests, Docs, Artefaktprovenienz und vollständiger Nachtbericht gesichert.

**Leitgedanke:** Ein neuer Dateiname oder „V7“ ist kein Fortschritt. Gesucht ist ein belegbar besserer, sicherer Kandidat. Falls fünf Stunden keinen nachweisbaren Vorteil ergeben, gilt der Lauf als sauber ausgewertete Forschungskampagne – **nicht** als erfolgreiche Promotion.
