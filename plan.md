# MISSION: OpenFront Neural Schema 6 – neuer Modellvertrag statt weiterer Schema-5-No-Op-Runden

Du arbeitest im Repository:

`SLP-DEV1/openfront-bot`

Aktueller Referenzstand:

* `origin/main`: mindestens Commit `173630c`
* Aktiver Champion: Run3 Schema 4
* Aktueller Schema-5-Baseline-Kandidat:
  `16b686d291addf4e9c14c7c03e80308b6cb7474fd90dbd5efb60065c9a2b4f93`
* Letzte Kampagne:
  `trainer/campaign-v5finetune-20260925/`
* §13: **NICHT bestanden**
* Variante D: exakt gleich zur Schema-5-Baseline
* Variante F: marginale Offline-Verbesserung, kein Live-Durchbruch
* Run3 bleibt ACTIVE

Dies ist **kein weiterer Schema-5-Finetuning-Auftrag**.

Die bisherigen Ergebnisse zeigen strukturelle Grenzen des bestehenden Schema-5-Vertrags. Entwickle deshalb eine **neue, sauber versionierte neuronale Modellgeneration mit neuem Feature-Vertrag**.

Nenne sie vorläufig:

`Schema 6`

sofern die Repository-Konventionen keinen besseren Namen verlangen.

---

# 1. Ziel

Wir wollen einen Neural-Controller, der:

1. alle relevanten Kandidatenarten eindeutig unterscheiden kann;
2. bessere Aktionspräferenzen lernt;
3. tatsächlich andere ausgeführte Engine-Turns erzeugt;
4. diese Änderungen im Durchschnitt positive Gameplay-Wirkung haben;
5. am Ende Rule-Basis und Run3 in einer sauberen Evaluation schlagen kann.

**Ein neuer SHA, niedrigere Loss oder mehr `changedIntent` sind kein Erfolg.**

Der Erfolgspfad lautet:

```text
besserer Feature-Vertrag
↓
besseres Candidate Ranking
↓
tatsächlich andere ausführbare Aktionen
↓
veränderte Turn-Streams
↓
bessere Match-Ergebnisse
↓
bestandener Promotion-Gate
```

---

# 2. Ausgangsdiagnose verbindlich übernehmen

Die letzte Kampagne hat vier strukturelle Blocker belegt.

## Blocker A – Feature-Lücke

Im aktuellen Schema-5-Vertrag besitzen nur bestimmte Aktionsarten eigene Kind-Kodierungen.

Insbesondere fehlen explizite Kind-One-Hots für:

```text
hold
expand
```

Dadurch können mehrere Kandidatentypen im Feature-Vektor strukturell nicht sauber genug unterschieden werden.

## Blocker B – schiefer Datensatz

Der letzte Datensatz ist stark dominiert durch:

```text
invest
hold
naval
```

`attack` und insbesondere `expand` sind deutlich unterrepräsentiert.

## Blocker C – behavioraler No-Op

Die Modelle erzeugen interne Ranking-Unterschiede, diese ändern aber praktisch keine tatsächlich ausgeführten Engine-Turns.

Der §13-Vergleich zeigte byte-identische Turn-Streams.

## Blocker D – Holdout zu wenig entscheidend

7/8 1v1-Szenarien waren tick-limit-zensiert.

Ein Champion-Gate benötigt deutlich mehr bestätigte Ergebnisse.

**Behebe diese vier Punkte in genau dieser Reihenfolge.**

---

# 3. Git-Sicherheit

Vor jeder Änderung:

```powershell
git status --short
git branch --show-current
git fetch origin
git log -10 --oneline
git log -5 --oneline origin/main
```

Arbeite auf dem aktuellen kompatiblen Stand.

Keine lokalen Arbeiten löschen.

Kein:

```text
git reset --hard
git clean -fd
force push
```

Der bestehende Run3-Champion und die bisherigen Schema-5-Artefakte bleiben unverändert erhalten.

---

# 4. Neuen Feature-Vertrag entwerfen

Analysiere zuerst:

```text
trainer/v5-features.cjs
trainer/candidate-policy-v5.cjs
src/runtime/decision-kernels.cjs
src/userscript/20-military-and-planning.js
tools/benchmark/v5-dataset.cjs
tools/benchmark/v5-decision-capture.cjs
trainer/train-v5fn-variants.cjs
```

Erstelle einen neuen Feature-Vertrag.

Mindestens alle Kandidatenarten müssen explizit kodierbar sein:

```text
hold
invest
attack
expand
naval
```

Vermeide ein implizites:

```text
all-zero = irgendeine andere Aktionsart
```

für semantisch unterschiedliche Kandidaten.

## Mindestanforderung

Der neue Vertrag enthält explizite Action-Kind-Features für alle fünf Kandidatentypen.

Beispielsweise:

```text
isHold
isInvest
isAttack
isExpand
isNaval
```

Prüfe zusätzlich, ob weitere kandidatenspezifische Informationen fehlen.

Mögliche sinnvolle Features:

```text
candidateRuleUtility
utilityGapToRuleTop1
utilityGapToRuleTop2

candidateTroopCommitment
candidateReserveAfterAction

targetWeakness
targetStrengthRatio
targetBorderPressure

candidateExpectedIncomeImpact
candidateExpectedDefenseImpact

hasLandTarget
hasNavalTarget

currentExpansionPressure
safeExpansionAvailable

frontCount
activeWars
enemyPressure

gamePhase
```

Aber:

**Nicht blind Features hinzufügen.**

Für jedes neue Feature dokumentieren:

* Semantik
* Wertebereich
* Normalisierung
* Quelle
* Runtime-Verfügbarkeit
* Train-/Runtime-Parität

---

# 5. Schema-Version sauber erhöhen

Schema 5 darf nicht stillschweigend verändert werden.

Implementiere einen neuen Vertrag, zum Beispiel:

```text
schema: 6
```

mit neuer Architekturkennung.

Beispiel:

```text
37x24x2-tanh
```

oder eine andere sinnvolle Größe.

Die konkrete Dimension ergibt sich aus dem tatsächlichen Feature-Vertrag.

Implementiere:

* Feature-Builder;
* Modell-Validator;
* Runtime-Inferenz;
* Hashing;
* Serialization;
* Bundling;
* Tests;
* Fail-closed bei unbekanntem Schema.

Schema 5 muss weiterhin reproduzierbar ladbar bleiben.

---

# 6. Runtime-Parität ist Pflicht

Erstelle Tests, die garantieren:

```text
trainingFeatures === runtimeFeatures
```

für denselben sichtbaren Zustand und denselben Kandidaten.

Teste explizit alle fünf Kinds:

```text
hold
invest
attack
expand
naval
```

Kein Kandidat darf versehentlich denselben Kind-Vektor wie ein semantisch anderer Kandidat bekommen.

---

# 7. Neue Trainingsdaten sammeln

Verwende nicht nur die bisherigen selbst-destillierten Schema-5-Daten.

Baue einen neuen Curriculum-Datensatz mit gezieltem Oversampling unterrepräsentierter Entscheidungstypen.

Zielverteilung soll nicht künstlich exakt gleich sein, aber `attack` und `expand` dürfen nicht wieder statistisch verschwinden.

Sammle insbesondere echte Engine-Situationen für:

## Expand

```text
sichere Expansion möglich
Expansion unter Druck
Expansion vs Hold
Expansion vs Invest
Expansion vs Attack
Expansion im Early Game
Expansion im Mid Game
Expansion im Late Game
```

## Attack

```text
klar guter Angriff
klar schlechter Angriff
Grenzfall
schwacher Gegner
starker Gegner
Mehrfrontenkrieg
zu hohe Truppenbindung
günstiger Finisher
```

## Hold

```text
Hold wirklich sinnvoll
Hold trotz guter Expansion schlecht
Hold wegen Reserve sinnvoll
Hold wegen unmittelbarer Gefahr sinnvoll
```

## Invest

```text
City
Factory
SAM
Silo
sonstige Investition
gute Investition
zu frühe Investition
wirtschaftlich gefährliche Investition
```

## Naval

```text
sinnvoller Transport
sinnloser Transport
Warship sinnvoll
Warship irrelevant
Landroute vorhanden
keine Landroute vorhanden
```

---

# 8. Datenqualitäts-Gates

Erstelle vor Training einen Daten-Audit.

Mindestens:

```text
matches
frames
rows

kindDistribution
outcomeDistribution
mapDistribution
modeDistribution
difficultyDistribution

confirmedWins
confirmedLosses
censoredMatches

executedActionDistribution
```

Setze Mindestanforderungen.

Ein Datensatz darf NICHT in die finale Trainingsrunde, wenn z. B.:

```text
expand < 5 %
```

oder:

```text
attack < 5 %
```

der für Ranking geeigneten Gruppen ausmacht, sofern ausreichend reale Situationen erzeugbar sind.

Falls die Engine diese Anteile natürlich nicht hergibt, dokumentiere das und oversample relevante Gruppen beim Training.

---

# 9. Keine falschen Counterfactual-Labels

Behalte die bereits korrigierte Regel bei:

**Nicht ausgeführte Kandidaten bekommen nicht automatisch das Outcome der gewählten Aktion.**

Unbeobachtete Counterfactuals bleiben unbekannt.

Ranking-Signale dürfen nur aus nachvollziehbarer Evidenz entstehen.

Zulässige Quellen:

* tatsächlich ausgeführte Aktion;
* beobachtete spätere Wirkung;
* sichere strukturelle Constraints;
* klar definierte Hard-Negative-Kriterien;
* relative Kandidateninformationen innerhalb desselben Frames, wenn deren Bedeutung valide ist.

---

# 10. Neues Trainingsziel

Verwende die Erkenntnisse aus Variante F als Ausgangspunkt, aber nicht als Endlösung.

Teste mindestens diese Modellziele:

## S6-A – Ranking baseline

Candidate-group ranking mit neuem Feature-Vertrag.

## S6-B – Ranking + Utility Alignment

Hilfsterm für offensichtliche starke Abweichungen von brauchbarer Rule-Utility.

Rule-Utility bleibt Hilfssignal, nicht Ground Truth.

## S6-C – Outcome-aware Ranking

Gewichte Entscheidungen stärker, wenn danach klare langfristige Wirkung beobachtbar ist.

## S6-D – Hard-Negative Ranking

Fehlentscheidungen aus:

```text
campaign-v5control-20260924
campaign-v5finetune-20260925
```

gezielt als Hard Negatives verwenden.

## S6-E – Combined

Kombination der besten Elemente.

---

# 11. Kind-Bias nicht als Ersatz für Features verwenden

Die letzte Runde hat gezeigt, dass ein globaler `kindBias` nur Reihenfolgen verschiebt.

Das reicht nicht.

Ein globaler Bias wie:

```text
invest +0.18
naval -0.65
```

ist kein Ersatz für ein Modell, das anhand des Zustands erkennt:

```text
wann invest gut ist
wann naval gut ist
wann expand gut ist
wann hold gut ist
```

Bias darf höchstens als kleiner Kalibrierungsterm bestehen.

---

# 12. Architekturvergleich

Teste mindestens zwei Architekturen.

Zum Beispiel:

```text
small:
N x 24 x 2

medium:
N x 40 x 2
```

mit:

```text
N = neue Feature-Dimension
```

Optional zusätzlich:

```text
N x 32 x 16 x 2
```

wenn Training und Runtime dadurch nicht unnötig komplex werden.

Vergleiche nicht nur Loss.

Messe:

```text
valRankLoss
crossCandidateSpread
decisionAccuracy
kindSelectionDistribution
hardNegativeAccuracy
flipToLowerRate
flipToHigherRate
```

---

# 13. Drei-Stunden-Trainingsbudget

Nach Feature-Implementierung, Tests und Datensatzaufbau startet ein **echtes 3-Stunden-Kampagnenfenster**.

Nutze es ungefähr:

```text
0:00–0:45
neue zielgerichtete Engine-Daten

0:45–1:30
mehrere Schema-6-Kandidaten trainieren

1:30–2:15
Offline-Auswertung + Hard-Negative-Retraining

2:15–2:40
billige Engine-Prescreens

2:40–3:00
besten Kandidaten weitertrainieren / validieren
```

Nicht drei Stunden mit derselben Konfiguration rechnen.

Nutze Successive Halving.

---

# 14. Successive Halving

Beispiel:

```text
8 Kandidaten
↓
Offline-Gates
↓
4 Kandidaten
↓
Hard-Negative-Test
↓
2 Kandidaten
↓
Engine-Prescreen
↓
1 Kandidat
```

Schlechte Modelle früh verwerfen.

---

# 15. WICHTIG: Turn-Stream-Divergenz als neues Pre-Gate

Der letzte §13-Lauf zeigte:

```text
Kandidat und Baseline:
byte-identische turns.jsonl
```

Das darf nicht erst nach einem großen Holdout entdeckt werden.

Vor jeder teuren Evaluation:

Führe 1–2 kurze identische Seed-Paare aus.

Vergleiche:

```text
candidate turns.jsonl
vs
baseline turns.jsonl
```

Der Kandidat darf nur weiterkommen, wenn:

1. tatsächlich mindestens eine andere ausführbare Aktion gesendet wurde;
2. diese Abweichung durch den Neural-Controller verursacht wurde;
3. die Abweichung legal war;
4. die Abweichung nicht nur kosmetisch ist.

Erzeuge:

```text
turn-divergence.json
```

mit:

```text
totalTurns
identicalTurns
differentTurns

firstDifferentTick
ruleAction
candidateAction

modelReason
ruleUtility
modelScore
```

---

# 16. Action-Channel-Coverage untersuchen

Der letzte Lauf zeigte:

```text
1154 Planungsframes
nur 38 Frames mit ausgegebenem Action
≈ 3.3 %
```

Das ist extrem wichtig.

Untersuche, warum 97 % der Frames keinen ausführbaren Channel-Action besitzen.

Trenne:

```text
kein legaler Kandidat
keine Aktion notwendig
Planner erzeugt keine Aktion
Cooldown
Budget blockiert
Safety blockiert
bereits laufende Aktion
kein Ziel
sonstiger Grund
```

Wir wollen wissen, ob das Netz an einer Stelle entscheidet, an der überhaupt keine Gameplay-Wirkung möglich ist.

Erstelle:

```text
action-channel-coverage.json
```

---

# 17. Modell nur dort anwenden, wo es Wirkung haben kann

Falls bestätigt wird, dass viele Planning-Frames überhaupt keinen ausführbaren Action-Kanal besitzen:

Trainiere bzw. evaluiere das Candidate-Ranking primär auf Frames mit tatsächlich auswählbaren, ausführbaren Alternativen.

Das Modell soll nicht dafür belohnt werden, tausende interne No-Op-Rankings zu produzieren.

Unterscheide:

```text
planning frame
decision frame
actionable decision frame
executed decision frame
```

Offline-Metriken primär auf:

```text
actionable decision frames
```

berechnen.

---

# 18. Controller nicht blind verstärken

Der neue Schema-6-Kandidat soll zunächst mit einem konservativen Controller laufen.

Aber:

Wenn der neue Score nachweislich besser kalibriert ist, darf eine neue Version des Mapping-Kernels entwickelt werden.

Nicht einfach:

```text
gain = sehr hoch
```

setzen.

Ein Modell muss durch bessere Präferenzen gewinnen, nicht durch rohe Übersteuerung.

---

# 19. Pre-Screen gegen Schema-5-Baseline

Vergleiche den besten Schema-6-Kandidaten zuerst gegen:

```text
16b686d291addf4e...
```

mit identischen Seeds.

Pre-Screen-Kriterien:

* Turn-Streams unterscheiden sich tatsächlich;
* neural verursachte Aktionen werden ausgeführt;
* kein Safety-Regression;
* kein extremer Kind-Bias;
* deutlich niedrigerer `flipToLowerRate`;
* mindestens keine offensichtliche Gameplay-Verschlechterung.

Nur dann größere Evaluation.

---

# 20. Pre-Screen gegen Rule-Basis

Danach:

```text
Schema 6
vs
rule-basis
```

Ein Kandidat, dessen ausgeführte Turn-Streams anders sind, aber dessen Ergebnis systematisch schlechter ist, wird verworfen.

---

# 21. Pre-Screen gegen Run3

Erst danach:

```text
Schema 6
vs
Run3 Schema 4
```

Run3 bleibt der aktive Champion.

---

# 22. Holdout-Protokoll neu gestalten

Der alte §13-Test war zu stark zensiert:

```text
1/8 decisive
7/8 tick-limit
```

Entwickle ein Holdout-Protokoll, das ausreichend bestätigte Ergebnisse erzeugt.

Ziel:

```text
>= 5 decisive paired outcomes
```

pro zentralem Vergleich, bevor ein Win-Gate überhaupt interpretiert wird.

Mögliche Hebel:

* längerer Tick-Horizont;
* stärker entscheidende Szenarien;
* kompaktere Maps;
* geeignetere Gegnerprofile;
* mehr Seed-Paare.

Aber:

Protokoll vor der finalen Auswertung einfrieren.

Keine nachträgliche Auswahl günstiger Szenarien.

---

# 23. Final-Holdout nur bei echtem Dev-Sieg

Final-Holdout erst starten, wenn Schema 6:

1. Schema-5-Baseline schlägt;
2. Rule-Basis auf Dev-Seeds schlägt oder klar verbessert;
3. tatsächliche Turn-Divergenz produziert;
4. keine Safety-Regression zeigt.

Neue Seeds verwenden.

Nicht wiederverwenden:

```text
v6hold-*
o7hold
v5fh-*
v5di-*
```

---

# 24. Promotion-Gate

Ein neuer Champion muss:

* Run3 schlagen;
* Rule-Basis schlagen;
* genügend decisive pairs haben;
* Safety-Gates bestehen;
* Provenienz bestehen;
* keine schwerwiegenden Modus-Regressionen zeigen.

Keine Promotion auf Basis von:

```text
Loss
MSE
RankLoss
changedIntent
Land-only bei zensierten Matches
```

---

# 25. Tests für Schema 6

Mindestens neue Tests für:

```text
schema6 feature contract
schema6 serialization
schema6 model validation
schema6 runtime parity
all five action kind one-hots
unknown schema fail-closed
schema5 backward compatibility
schema6 candidate scoring
turn-divergence harness
action-channel coverage
```

Bestehende Regressionen weiterhin ausführen.

---

# 26. Keine Änderung am aktiven Champion

Run3 bleibt unverändert.

Keine automatische Live-Promotion.

Auch wenn Schema 6 den Gate besteht:

Ergebnis nur als:

```text
PROMOTION-ELIGIBLE
```

markieren.

Nicht automatisch Run3 ersetzen.

---

# 27. Kampagnenordner

Erstelle:

```text
trainer/campaign-schema6-20260925/
```

mit mindestens:

```text
feature-contract.md
feature-contract.json

data-audit.json
dataset-manifest.json

action-channel-coverage.json
hard-negatives.json

training-manifest.json
candidate-comparison.json

turn-divergence.json
engine-prescreen.json

holdout-protocol.json
holdout-results.json

promotion-decision.json
failure-analysis.md
final-report.md

candidate-model.json
```

---

# 28. Provenienz

Für jedes trainierte Modell:

```text
schema
arch
featureSchemaVersion
featureNames
weightCount

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

# 29. Abbruchbedingungen

Breche einen Kandidaten früh ab, wenn:

```text
turn streams identisch zur Baseline
```

oder:

```text
flipToLowerRate extrem hoch bleibt
```

oder:

```text
nur globaler kind bias gelernt wird
```

oder:

```text
Gameplay im Prescreen schlechter ist
```

Verschwende dann keinen großen Holdout.

---

# 30. Abschlussentscheidung

Der finale Bericht muss exakt eine Kategorie ausgeben:

```text
A) SCHEMA-6 PROMOTION-ELIGIBLE

Schema 6 schlägt Schema-5-Baseline,
Rule-Basis und Run3 mit ausreichender Evidenz.

B) SCHEMA-6 IMPROVED CANDIDATE

Schema 6 verändert tatsächlich Turns
und verbessert relevante Dev-Metriken,
aber Promotion-Evidenz reicht noch nicht.

C) SCHEMA-6 NEGATIVE RESULT

Kein Modell verbessert das Live-Verhalten.
Der nächste strukturelle Engpass ist
mit reproduzierbarer Evidenz benannt.
```

Keine künstliche Erfolgsmeldung.

---

# 31. Wichtigste Regel dieser Kampagne

Die letzten Läufe haben gezeigt:

```text
Modellscore ≠ ausgeführte Aktion
changedIntent ≠ Turn-Divergenz
Turn-Divergenz ≠ bessere Aktion
bessere Offline-Metrik ≠ Champion
```

Deshalb gilt diesmal:

**Ein Kandidat darf nur weiterkommen, wenn seine neuronale Entscheidung tatsächlich die Engine-Aktion verändert und diese Änderung messbar besser ist.**

Beginne jetzt mit:

1. Git-Abgleich
2. Feature-Contract-Audit
3. Schema-6-Design
4. Runtime-/Training-Parität
5. neuem Expansion-/Attack-Datensatz
6. 3-Stunden-Training
7. Turn-Divergenz-Prescreen
8. Dev-Evaluation
9. ggf. Final-Holdout
10. dokumentierter Promotion-Entscheidung

Arbeite selbstständig bis zum Abschluss und committe/pushe alle nachvollziehbaren Artefakte.
