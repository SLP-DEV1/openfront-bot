# OVERNIGHT MISSION: OpenFront Neural Schema 7 — 10 Stunden bis zum echten Action-Level-Champion

Du arbeitest im Repository:

`SLP-DEV1/openfront-bot`

Aktueller Ausgangspunkt:

* `origin/main` enthält mindestens Commit `0b6b8ec`
* Aktiver Champion: **Run3 Schema 4**
* Schema 5: kein Champion
* Schema 6: sauber implementiert und trainiert, aber **Category C / NEGATIVE RESULT**
* Letzte Kampagne:
  `trainer/campaign-schema6-20260925/`
* Schema-6-Lead:
  `E_38x40x2tanh`
* Schema-6-Divergent-Control:
  `A_38x40x2tanh`

Der entscheidende Befund der letzten Kampagne ist verbindlich:

> Schema 6 kann intern stark von der Rule-Basis abweichen, verändert aber keinen einzigen tatsächlich ausgeführten Engine-Turn.

Beispiel:

```text
A_38x40x2tanh:
148 / 165 Planning-Frames Modell != Regel
133 / 165 changedIntent
0 / 2000 unterschiedliche ausgeführte Turns
```

**Das ist kein weiteres Tuningproblem.**

Das neuronale Modell sitzt aktuell am falschen Punkt der Entscheidungsarchitektur.

Diese Kampagne baut deshalb einen **neuen Schema-7 Action-Branch Controller**.

---

# 1. Mission

Entwickle einen neuronalen Controller, der direkt diejenige Entscheidungsebene beeinflusst, die tatsächlich einen Intent an die Engine ausgeben kann.

Alt:

```text
State
↓
Schema 6 rankt abstrakte Kandidaten
↓
Director filtert / blockiert / berechnet neu
↓
ausgeführter Intent
```

Neu:

```text
State
↓
Director erzeugt aktuell ausführbare Branch-/Action-Kandidaten
↓
Hard Legality + Safety
↓
Schema 7 bewertet diese ACTIONABLE Branches
↓
eine Branch wird ausgewählt
↓
genau diese Branch erzeugt den Intent
↓
Engine
```

**Schema 7 muss auf der Action-/Emit-Ebene sitzen.**

---

# 2. Keine weitere Schema-6-Runde

Nicht erneut versuchen:

```text
mehr Gain
größeres Schema-6-Netz
noch mehr Candidate-Reordering
noch mehr changedIntent
andere globale kindBias-Werte
```

Die letzte Kampagne hat nachgewiesen, dass diese Ebene behavioraler No-op ist.

Schema 6 bleibt als reproduzierbare historische Referenz erhalten.

---

# 3. Git-Sicherheit

Vor Änderungen:

```powershell
git status --short
git branch --show-current
git fetch origin
git log -10 --oneline
git log -5 --oneline origin/main
```

Neueste kompatible Änderungen integrieren.

Nicht verwenden:

```text
git reset --hard
git clean -fd
force push
```

Bestehende Trainingsartefakte, Scratch-Daten anderer Arbeiten und Champion-Dateien nicht löschen.

---

# 4. Run3 bleibt unverändert

Der aktive Run3-Schema-4-Champion bleibt während der gesamten Kampagne unverändert.

Kein automatischer Modelltausch.

Selbst bei bestandenem Gate am Ende nur:

```text
PROMOTION-ELIGIBLE
```

melden.

Nicht automatisch deployen.

---

# 5. Zuerst den echten Action-Pipeline-Pfad kartieren

Bevor Schema 7 geschrieben wird, analysiere den vollständigen Weg bis zum tatsächlichen Intent.

Mindestens prüfen:

```text
src/userscript/
src/runtime/
20-military-and-planning.js
decision-kernels.cjs
channel director
military planners
economy/build planner
naval planner
alliance/team logic
nuclear logic
engine-match.mjs
```

Erstelle eine reproduzierbare Pipeline-Grafik bzw. Dokumentation:

```text
visible state
↓
planner
↓
branch generation
↓
hard legality
↓
cooldown
↓
budget
↓
reserve
↓
safety
↓
branch selection
↓
intent construction
↓
turn dispatch
↓
engine receipt
```

Bestimme exakt:

**An welcher letzten Stelle existieren noch mehrere legale Optionen, von denen eine tatsächlich unmittelbar einen unterschiedlichen Engine-Intent erzeugen würde?**

Genau dort muss Schema 7 eingreifen.

---

# 6. Actionable Branch Contract

Definiere einen klar versionierten Branch-Typ.

Zum Beispiel:

```text
actionableBranch = {
    id,
    kind,
    subtype,
    targetId,
    legal,
    safetyApproved,
    executableNow,
    ruleUtility,
    cost,
    troopCommitment,
    reserveAfter,
    cooldownReady,
    expectedPurpose,
    buildType,
    sourceId,
    targetId
}
```

Nur Branches mit:

```text
legal === true
safetyApproved === true
executableNow === true
```

dürfen vom Neural-Controller gegeneinander gerankt werden.

Das Netz darf keine illegale Aktion legal machen.

---

# 7. Die eigentlichen Branch-Klassen

Unterscheide mindestens handlungsnahe Kategorien wie:

```text
WAIT
HOLD_RESERVE

EXPAND

ATTACK_PLAYER
ATTACK_FRONT
FINISH_TARGET

BUILD_CITY
BUILD_FACTORY
BUILD_SAM
BUILD_SILO
BUILD_PORT

SEND_TRANSPORT
SEND_WARSHIP

DEFEND_FRONT
EMERGENCY_DEFENSE

SUPPORT_ALLY

NUCLEAR_ATTACK
ANTI_NUKE_ACTION
```

Nutze die tatsächlichen Branches des Codes.

Keine künstliche Klasse erzeugen, wenn sie im Bot nicht existiert.

---

# 8. Wichtig: WAIT ist ebenfalls eine echte Entscheidung

Die bisherigen Modelle konnten oft nur innerhalb eines Kandidaten-Sets umsortieren.

Schema 7 muss auch lernen können:

```text
jetzt handeln
vs
jetzt bewusst warten
```

Aber `WAIT` darf nicht automatisch gewinnen, nur weil es risikolos ist.

Logge genau, warum gewartet wurde.

Beispiele:

```text
wait_for_budget
wait_for_reserve
wait_for_cooldown
wait_no_target
wait_strategic
```

---

# 9. Hard Safety bleibt außerhalb der Lernentscheidung

Schema 7 darf niemals Hard-Safety überwinden.

Dazu gehören mindestens:

```text
Verbündete nicht angreifen
keine Nukes auf Verbündete
keine illegalen Ziele
keine ungültigen Builds
keine Reserve-Verletzung
keine ungültige Marineaktion
keine Spawn-/Capacity-Verletzung
keine bestätigte Emergency-Defense übergehen
```

Ablauf:

```text
alle Roh-Branches
↓
Hard legality + safety
↓
nur sichere actionable branches
↓
Schema 7
```

Nicht:

```text
Schema 7
↓
Safety vielleicht ignorieren
```

---

# 10. Neuer Schema-7 Feature-Vertrag

Schema 7 benötigt Features sowohl für den Spielzustand als auch für die konkrete Action-Branch.

Baue einen explizit versionierten Vertrag.

Beispiele für State-Features:

```text
gamePhase
land
troops
reserveRatio
gold
income
enemyPressure
activeWars
frontCount
allyPressure
homeThreat
nukeThreat
recentLandTrend
recentTroopTrend
```

Branch-spezifisch beispielsweise:

```text
branchKind one-hot
branchSubtype one-hot

ruleUtility
utilityGapToTop

costRatio
troopCommitmentRatio
reserveAfterRatio

targetStrengthRatio
targetLandRatio
targetBorderPressure

expectedBuildValue
expectedDefenseValue

cooldownReady
alreadyActiveOperation
targetReachable

isEmergency
isFinisher
isExpansion
```

Nur Features verwenden, die im Live-Runtime zuverlässig verfügbar sind.

---

# 11. Keine impliziten Action-Klassen

Jede semantisch verschiedene Branch-Art bekommt eine explizite Kodierung.

Kein:

```text
all zero = hold oder expand oder wait
```

Train-/Runtime-Parität muss exakt getestet werden.

---

# 12. Schema 7 ist eine neue Modellversion

Schema 6 nicht überschreiben.

Beispielsweise:

```json
{
  "schema": 7,
  "featureSchemaVersion": 4,
  "arch": "...",
  "outputs": [...]
}
```

Implementiere:

```text
candidate-policy-v7 / action-policy-v7
feature builder
validator
serialization
runtime inference
bundling
hashing
tests
fail-closed
```

Unbekannte Schema-Versionen müssen fail-closed bleiben.

---

# 13. Output-Design

Prüfe mindestens zwei Ansätze.

## Ansatz A — Branch Value

Ein Score pro Actionable Branch:

```text
branchScore
```

höchster sichere Score gewinnt.

## Ansatz B — Multi-Head

Beispielsweise:

```text
expectedGain
expectedRisk
expectedSurvival
```

und daraus kontrolliert ein Ranking bilden.

Nicht unnötig komplex starten.

Ein einfaches, korrekt platziertes Modell ist wertvoller als ein großes Netz an der falschen Stelle.

---

# 14. Training nur auf actionable decision frames

Schema 6 wurde auf sehr vielen Frames bewertet, in denen überhaupt keine ausführbare Action existierte.

Schema 7 trainiert primär auf:

```text
actionable decision frame
```

Definition:

```text
>= 2 sichere executable branches
```

oder mindestens:

```text
eine ausführbare Action vs echtes WAIT
```

Metriken separat ausweisen für:

```text
all planning frames
actionable frames
executed frames
```

---

# 15. Instrumentierung

Für jeden Actionable Frame loggen:

```text
tick
matchId

stateHash

branchId
branchKind
branchSubtype

legal
safetyApproved
executableNow

ruleUtility
modelScore

ruleChoice
modelChoice
finalChoice

emittedIntent

engineConfirmed

effectAfter100
effectAfter300
effectAfter600

landDelta
troopDelta
incomeDelta

matchOutcome
```

---

# 16. Executed-Action Attribution

Das Trainingssystem muss wissen:

```text
welche Branch tatsächlich gewählt wurde
```

und:

```text
welcher Intent daraus erzeugt wurde
```

sowie:

```text
ob die Engine ihn bestätigt hat
```

Kein Training auf bloßem internen `changedIntent`.

---

# 17. Keine falschen Counterfactuals

Weiterhin streng:

Eine nicht gewählte Branch bekommt **nicht** automatisch das Ergebnis der gewählten Branch.

Nicht beobachtete Alternativen bleiben unbekannt.

Verwende nur:

* echte ausgeführte Outcomes;
* sichere strukturelle Präferenzen;
* valide Pairwise-Signale;
* kontrollierte Rollouts, falls tatsächlich unabhängig simuliert.

---

# 18. Bootstrap-Daten

Nutze historische Daten aus:

```text
campaign-v5rank-20260924
campaign-v5control-20260924
campaign-v5finetune-20260925
campaign-schema6-20260925
```

aber nur, wenn die Daten auf den neuen Action-Branch-Contract sauber abbildbar sind.

Nicht blind alte abstrakte Candidate-Labels übernehmen.

---

# 19. Neue On-Policy-Daten

Erzeuge neue echte Engine-Matches speziell für Schema 7.

Ziel: viele Frames mit tatsächlich konkurrierenden ausführbaren Aktionen.

Suche Szenarien mit:

```text
Attack vs Wait
Expand vs Invest
Attack vs Expand
City vs Factory
SAM vs Economy
Silo vs Economy
Transport vs Landstrategie
Defense vs Expansion
```

---

# 20. Gegner- und Szenario-Diversität

Verwende:

```text
World
Europe

balanced
rush
defensive
economic
aggressive

1v1
FFA
official 2v2
FFA-duo
```

soweit vom Harness zuverlässig unterstützt.

---

# 21. Outcome-Horizonte

Nicht nur Match-Ende verwenden.

Für ausgeführte Branches mehrere Horizonte erfassen:

```text
+100 ticks
+300 ticks
+600 ticks
+1200 ticks
match end
```

Dadurch kann das Modell lernen:

```text
kurzfristiger Angriff schlecht,
langfristig aber gut
```

oder umgekehrt.

---

# 22. Reward / Ranking-Signal

Entwickle ein plausibles Multi-Horizon-Signal.

Berücksichtige beispielsweise:

```text
heldLand
landTrend
survival
troopEfficiency
income
economicRecovery
attackSuccess
defenseSuccess
teamSurvival
finalOutcome
```

Keine einzelne Metrik darf alles dominieren.

Dokumentiere die Formel.

---

# 23. Nicht einfach Rule Utility imitieren

Rule Utility darf ein Hilfssignal sein.

Aber Ziel ist nicht:

```text
Schema 7 = neuronale Kopie der Regeln
```

Sonst kann das Netz sie niemals schlagen.

Rule Utility verwenden für:

```text
bootstrap
hard-negative sanity
extreme bad-action detection
```

nicht als alleinige Ground Truth.

---

# 24. Modellarchitekturen

Teste mindestens zwei Größen.

Zum Beispiel abhängig von Feature-Anzahl `N`:

```text
N x 32 x 1
N x 48 x 1
```

oder bei Multi-Head:

```text
N x 32 x 3
N x 48 x 3
```

Optional ein zweischichtiges Modell, falls gerechtfertigt.

Nicht mehr als nötig.

---

# 25. Successive Halving

Trainiere mehrere Kandidaten.

Beispiel:

```text
8 Kandidaten
↓
Offline Gate
↓
4
↓
Actionable-frame validation
↓
2
↓
Engine turn-divergence
↓
1
```

Nicht alle 10 Stunden auf ein einziges Modell setzen.

---

# 26. DAS WICHTIGSTE PRE-GATE

Bevor irgendein längerer Holdout startet:

Schema 7 gegen Rule-Basis auf identischem Seed.

Es muss gelten:

```text
differentExecutedTurns > 0
```

UND die Unterschiede müssen:

```text
legal
model-caused
non-cosmetic
engine-confirmed
```

sein.

Wenn nicht:

**sofort strukturell debuggen.**

Nicht einfach weitertrainieren.

---

# 27. Turn-Divergence muss jetzt eine Kausalitätskette zeigen

Erzeuge:

```text
turn-divergence.json
```

Beispiel:

```text
tick 4812

rule:
WAIT

schema7:
ATTACK_PLAYER 17

Schema7 branchScore:
0.72

engine:
attack confirmed

100 ticks later:
+2400 held land

300 ticks later:
+5100 held land
```

Damit wird nachweisbar, dass das Netz wirklich Gameplay verändert.

---

# 28. Branch-Funnel

Für die neuen Runs messen:

```text
planningFrames
actionableFrames
multiChoiceFrames
modelDifferentFrames
differentEmittedActions
engineConfirmedDifferences
positiveOutcomeDifferences
negativeOutcomeDifferences
```

Das ist eine Kernmetrik der gesamten Kampagne.

---

# 29. 10-STUNDEN-NACHTKAMPAGNE

WICHTIG:

**Die 10 Stunden beginnen erst, nachdem Schema-7 Runtime-Wiring, Feature-Parität und kurze Smoke-Tests funktionieren.**

Git-Abgleich, Implementierung und initiale Debug-Arbeit zählen nicht zum eigentlichen Trainings-/Evaluationsfenster.

Starte danach einen monotonen 10-Stunden-Kampagnen-Timer.

Nutze ungefähr:

```text
Stunde 0–2
On-policy Actionable-Branch-Daten erzeugen

Stunde 2–4
erste Schema-7-Kandidaten trainieren

Stunde 4–5
Offline-Analyse / Hard-Negative Mining

Stunde 5–6
zweite Trainingsgeneration

Stunde 6–7
kurze Turn-Divergence-/Engine-Prescreens

Stunde 7–8
gezieltes Retraining auf echten Fehlern

Stunde 8–9
größere Dev-Evaluation der besten 1–2 Modelle

Stunde 9–10
Final-Holdout nur falls Dev-Gates bestanden
+ Abschlussreport
```

Dynamisch anpassen, wenn die Evidenz einen besseren Einsatz der Zeit zeigt.

---

# 30. Nicht vorzeitig fertig melden

Wenn nach zwei Stunden ein Kandidat trainiert wurde:

**nicht abbrechen und „Kampagne fertig“ melden.**

Nutze das verbleibende Zeitbudget für:

```text
neue Daten
Fehleranalyse
neue Generation
Engine-Vergleich
```

Die Kampagne soll tatsächlich über Nacht iterativ arbeiten.

---

# 31. Hintergrundjobs

Du darfst parallele Trainings-/Engine-Jobs starten.

Aber:

* Prozesse überwachen;
* Resultate einsammeln;
* Exit-Codes prüfen;
* keine gestarteten Jobs als abgeschlossen zählen;
* finalen Bericht erst erstellen, wenn relevante Jobs beendet oder bewusst abgebrochen wurden.

Keine „background job launched = task complete“-Logik.

---

# 32. Checkpoints

Mindestens stündlich einen Kampagnenstatus speichern:

```text
campaign-state.json
```

mit:

```text
elapsed
modelsTrained
matchesGenerated
actionableFrames
bestCandidate
bestDevResult
currentPhase
errors
```

Damit ist der Lauf nach Crash fortsetzbar.

---

# 33. Hard-Negative Mining

Nach jedem Prescreen:

Sammle Situationen, in denen Schema 7 eine tatsächlich ausgeführte Aktion verändert und diese klar schlechter abschneidet.

Diese Beispiele priorisiert wieder ins Training geben.

Besonders:

```text
schlechter Angriff
verpasste Expansion
falscher Build
unnötiges Warten
schlechte Marineentscheidung
schlechte Teamhilfe
```

---

# 34. Positive Mining

Ebenso Situationen sammeln, in denen das Modell eine Rule-Entscheidung erfolgreich verbessert.

Diese sind besonders wertvoll.

Aber nicht mehrfach duplizieren, bis der Datensatz nur noch aus wenigen Erfolgssituationen besteht.

---

# 35. Dev-Vergleich

Bestes Schema 7 vergleichen gegen:

```text
Rule-Basis
Schema-5 baseline
Schema-6 lead
Run3 Schema-4
```

Schema 5/6 dienen Diagnosezwecken.

Champion-Bar bleibt:

```text
Rule-Basis + Run3
```

---

# 36. Modus-Gates

Mindestens separat bewerten:

```text
1v1
official-2v2
FFA-duo
```

Falls ein Modell in einem Modus klar schlechter wird, dokumentieren und nicht durch Durchschnittswerte verstecken.

---

# 37. Entscheidendere Evaluation

Das bisherige Problem:

```text
7/8 tick-limit censored
```

muss behoben werden.

Gestalte das Evaluationsprotokoll so, dass genügend bestätigte Ergebnisse entstehen.

Ziel mindestens:

```text
>= 5 decisive paired outcomes
```

für relevante Win-Vergleiche.

Mögliche Mittel:

```text
mehr Ticks
kleinere/kompaktere Settings
entscheidendere Gegnerprofile
mehr Seeds
```

Protokoll VOR Final-Evaluation einfrieren.

---

# 38. Final-Holdout

Nur starten, wenn:

```text
Turn divergence PASS
Gameplay Dev PASS
Safety PASS
Schema7 > Rule auf Dev
```

Verwende komplett neue Seeds.

Nicht wiederverwenden:

```text
v6hold-*
o7hold
v5fh-*
v5di-*
v6pres-*
```

---

# 39. Finaler Vergleich

Final mindestens:

```text
Schema 7 vs Rule-Basis
Schema 7 vs Run3
```

gleiche Seeds, Maps und Gegner.

Ausweisen:

```text
confirmed wins
confirmed losses
censored
paired win delta
paired land delta
survival
economy
turn divergence
safety violations
```

---

# 40. Keine Gate-Manipulation

Nicht:

```text
censored als win
Seeds nach Ergebnis entfernen
schlechte Maps löschen
Promotion-Grenzen lockern
Safety deaktivieren
```

Wenn kein Champion entsteht, ist ein ehrliches negatives Ergebnis korrekt.

---

# 41. Testpflicht

Erstelle neue Schema-7-Regressionstests mindestens für:

```text
schema7 feature contract
runtime parity
branch serialization
branch validation
actionable filtering
hard safety preservation
intent provenance
executed-turn attribution
unknown schema fail-closed
schema5 backward compatibility
schema6 backward compatibility
turn divergence harness
```

Führe betroffene bestehende Tests ebenfalls aus.

---

# 42. Bestehende CI-/Strategy-Fehler

Bekannte vorbestehende Fehler nicht als Schema-7-Regression ausgeben.

Aber jeden Fehler gegen einen sauberen Parent-Commit reproduzieren, bevor er als „pre-existing“ bezeichnet wird.

---

# 43. Kampagnenordner

Erstelle:

```text
trainer/campaign-schema7-overnight-20260925/
```

oder passend zum tatsächlichen Startdatum.

Mindestens:

```text
pipeline-audit.md
branch-contract.md
branch-contract.json

data-audit.json
dataset-manifest.json

actionable-frame-analysis.json

training-manifest.json
candidate-comparison.json

hard-negatives.json
positive-examples.json

turn-divergence.json
branch-funnel.json

engine-prescreen.json
dev-evaluation.json

holdout-protocol.json
holdout-results.json

promotion-decision.json
failure-analysis.md
final-report.md

candidate-model.json
campaign-state.json
```

---

# 44. Modell-Provenienz

Für jeden Kandidaten:

```text
schema
featureSchemaVersion
arch
weights

featureNames

modelSHA256
policySHA256
datasetSHA256

trainingSeed
optimizer
epochs
learningRate
objective

engineCommit
botSHA256
gitCommit
```

---

# 45. Abschlussstatus

Am Ende exakt eine Kategorie:

```text
A) SCHEMA-7 PROMOTION-ELIGIBLE

Tatsächlich andere Engine-Aktionen,
bessere Dev-Ergebnisse,
Rule-Basis und Run3 im Final-Holdout geschlagen,
Safety bestanden.

B) SCHEMA-7 IMPROVED CANDIDATE

Tatsächlich andere Engine-Aktionen
und messbar bessere Gameplay-Wirkung,
aber Final-Evidenz reicht noch nicht für Promotion.

C) SCHEMA-7 NEGATIVE RESULT

Auch Action-Level-Control erzeugt keinen
robusten Gameplay-Vorteil.
Nächster Engpass reproduzierbar belegt.
```

---

# 46. Commit + Push

Nach Abschluss:

* Git-Status prüfen;
* nachvollziehbare Artefakte committen;
* keine riesigen temporären Scratch-Verzeichnisse committen, sofern nicht reproduktionsrelevant;
* sicher mit aktuellem `origin/main` abgleichen;
* kein Force-Push;
* Push durchführen;
* finalen Commit-SHA berichten.

---

# 47. Das eigentliche Ziel dieser Nacht

Wir haben inzwischen bewiesen:

```text
besserer Offline-Loss
    ≠ Champion

mehr Candidate-Divergenz
    ≠ ausgeführte Aktion

mehr changedIntent
    ≠ ausgeführter Turn

mehr Gain
    ≠ besser
```

Diese Nacht testen wir die erste Architektur, bei der das neuronale Modell **direkt zwischen tatsächlich ausführbaren Aktionen entscheidet**.

Das entscheidende Erfolgssignal lautet:

```text
Schema 7 wählt Action B
↓
Rule hätte Action A gewählt
↓
Action B wird tatsächlich an die Engine gesendet
↓
Engine bestätigt Action B
↓
Spielverlauf unterscheidet sich
↓
Action B verbessert das Ergebnis
```

**Erst dann haben wir ein echtes neuronales Gameplay-Signal.**

Beginne jetzt mit dem Pipeline-Audit und der Identifikation der letzten Multi-Choice-Stelle vor Intent-Emission. Implementiere dort Schema 7, verifiziere die Kausalitätskette und starte anschließend die vollständige 10-Stunden-Nachtkampagne.

---

# 48. Prescreen-Hintergrundjobs — Live-Verifikation (2026-09-25)

Die in §31 gestarteten Prescreen-Hintergrundjobs sind alle beendet.
Resultate eingesammelt, Exit-Codes geprüft:

* 13 Jobs: 11 × Exit 0, 2 × Arg-Parser-Fehler (nur Scratch, nicht reproduktionsrelevant):
  * `--candidateControl` ohne Wert → `Missing value for --candidateControl`;
  * `--candidateControlGain` → unbekannt; korrekt ist `--candidateGain`.
* Davon 9 Prescreen-Paare (Lead `E_38x40x2tanh`, Divergent `A_38x40x2tanh`)
  und 2 Smoke-Runs (`.tmp-v6-smoke`, `.tmp-v6-smoke2`) ohne Seed.

Live-Engine-Ergebnis bestätigt die committed Prescreen
(`engine-prescreen.json`, `turn-divergence.json`):

```text
seed        density   rule    v6-E (gated/rank)   v6-A (rank, capGain 60)
v6pres-001  2         22478   22478               22478
v6pres-002  2         6452    6452                -
v6pres-003  6         6127    6127                6127
```

In jedem Seed byte-identisch zur Rule-Basis → `differentExecutedTurns = 0`
(§26 Pre-Gate: FAIL; §28 Branch-Funnel: `differentEmittedActions = 0`).
Internes Re-Ranking (bis 90 % der Frames) ändert nie die emittierte Aktion,
weil die Block-Reasons invariabel gegenüber der Modell-Reihenfolge sind.

Determination C (NEGATIVE RESULT) durch Live-Engine bestätigt.
Run3 bleibt ACTIVE. Bereits in `0b6b8ec` committet und gepusht.
