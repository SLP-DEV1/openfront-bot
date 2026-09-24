# Diagnose: Warum die vorherigen Neural-Linien (V5 / V6 / Schema-4) keinen Sieggewinn brachten

**Kampagne:** overnight-20260924-v6 · **Datum:** 2026-09-24 · **Engine-Pin für alle Armierungen:** `bb8af015` (Trainingseinheit aller Schema-4-Modelle)
**Methode:** Nur reale Artefakte (plan.json, generation-N.json, comparison-Blöcke, Code der Policy), keine Namensannahmen.

## 0. Begriffs-Schärfe (vor der Analyse)

| Begriff | Bedeutung | Beweis |
|---|---|---|
| **Schema-4** „Strategische Policy v4 (24 Signale)" | 24×24×16-tanh = 1000 Gewichte. **Primäre** Policy-Kanale. | `trainer/strategic-policy-v4.cjs` |
| **v5-v2 (Schema-5)** | 32×20×2 = 702 Gewichte. **Shadow** Kandidaten-Ranker. | `trainer/campaign-20260924/lr0.2-e200/model.json` |
| **„V6" (V6-Collapse)** | **Trainingskampagnen-Version** auf Schema-4-Basis, **nicht** `schema:6`. | `.worktrees/neural-v6/...` |
| **`changedIntent`** | Gehört zum **Schema-5 Shadow** (`shadowV5Model`), **nicht** zu Schema-4. | `OpenFront_Solo_AggroBot.user.js:2701,2717` |

Schema-4 und v5-v2 haben **unterschiedlichen Feature-Raum (24 vs 32) und unterschiedliche Outputs (16 vs 2)** und dürfen nicht vermischt werden.

## 1. Coverage (Abdeckung der Inputs)

- **Feature-Satz (24):** 16 Basis-Signale + 8 hinzugefügte (`secondary/home`, `landLoss/land`, `trainIncome`, `tradeIncome`, `uncovered`, `recentPressure`, `defenses`, `navalFailures`). Alle sind `GameView`-sichtbar (Code-Kommentar: *„All signals are GameView-visible"*).
- **Train-/Runtime-Identität:** Das Training spawnt dieselbe Engine (`engine-match.mjs`) mit demselben Bot + Policy (`pinned-bot.user.js`) wie der Live-Lauf. Die Inputs werden also **byte-/wertgleich** berechnet; es gibt keinen separaten Feature-Extraktor, der abdriften könnte.
- **Einschränkung:** Der Modell-Input wird nur für die **gewählte** Regel-Action bewertet (es ist eine Biasing-Ebene, kein Ranking aller legalen Kandidaten). Die Coverage über *ungewählte* Alternativen wird also nicht explizit modelliert (→ Abschnitt 3).

## 2. Kontrolle (wie stark steuert das Modell wirklich?)

**Entscheidender Befund (Code):** `strategic-policy-v4.cjs` — *„The model only biases existing rule planners and cannot emit an intent."*

- `neuralChannel(name,...)` liefert einen tanh-Wert (−1…1) und wird **additiv/multiplikativ in die regelbasierten Scores** gemischt, z. B. `score += neuralChannel('landPriority',...)*28`, `*(1+neuralChannel('enemyCommit',...)*.22)`, `(1+neuralChannel('neutralCommit',...)*.35)` (`OpenFront_Solo_AggroBot.user.js:3458,4243,4298,3556,...`).
- `neuralActionDelta(kind,score,...)` legt einen **begrenzten Delta** auf die Action-Score hinzu (attack/economy/naval).
- **Folge:** `modelChoice == ruleChoice` ist strukturell fast immer gleich; das Modell kann die relatige Bewertung der **bereits vom Regel-Planner erdachten** Actions verschieben, aber **keine eigenständige Intent emittieren**. Die Kontrolle ist **an den Regel-Baseline-Aktionsraum gebunden** (obere Grenze).
- `changedIntent` (Schema-5 Shadow) ist für Schema-4 **nicht** der relevante Kontrol-Maßstab; bei Schema-4 ist es die **Größe der Kanal-Bias** (tanh-Betrags), die begrenzt ist.
- **Hoch-`changedIntent` ohne besseren Outcome zählt nicht als Fortschritt** (§4.2) — für Schema-4 ist die Bias-Stärke klein genug, dass sie Sieg-Muster nur selten erzwingen kann.

## 3. Kausalität / Labels

- **Belohnung:** `strategic-held-land-v2` (Reward-Version in allen `row`-Datensätzen). Sie bewertet das **beobachtete Ergebnis der tatsächlich gewählten Aktion** (gehaltenes Land, Survival, bestätigtes Ergebnis). Es gibt **kein off-policy Ranking** aller Alternativen → das Problem „ungewählte Kandidaten erhalten falsche Held-Gain-Labels" tritt bei Schema-4 **nicht** auf (anders als beim Schema-5 Ranker).
- **Zensierung:** `tick-limit` = zensiert (kein Sieg, kein Verlust). Persönliche Elimination (`eliminated`/`game-over`) wird als `confirmed` gezählt, aber als **kein Sieg**. `endTick`/`ticks` werden als End-Tick censored behandelt.
- **Paare:** Das Gate `evaluation-v2` arbeitet auf **gesamten Matches** (Paare pro vorregistrierter Zelle), nicht auf Telemetrie-Events. Duo-Perspektiven werden nicht doppelt gezählt.

## 4. Sichtbarkeit

- Alle 24 Inputs sind **sichtbare GameView-Zustände** (Home, Land, Income, Defense, Naval-Failures, Pressure). Kein verstecktes Engine-Wissen.
- Unbekannte Gegnertruppen / Marine-ETA / Outcome-Infos werden **nicht** als Live-Input verwendet (nur sichtbare Aggregaten).
- **Befund:** Sichtbarkeit ist **nicht** der primäre Engpass. Kontrolle (Abschnitt 2) und Schwierigkeits-Decke (Abschnitt 5) sind es.

## 5. Targets / Kausalitäts-Decke (wichtigster Befund)

**Befund (generation-10.json, beide V6-Linien, Schwierigkeit `Impossible`):**

| Linie | incumbentWins | candidateWins | net | improved/regressed/tied | survivalTicks | survivalArea | promoted | Grund |
|---|---|---|---|---|---|---|---|---|
| A (Basis V5-A-prov) | **0** | **0** | **−3** | 6/9/1 | −1522 | +37598 | false | `no-verified-improvement` |
| V4 (Basis V5-V4-prov) | **0** | **0** | **+5** | 9/4/3 | **+13904** | **+126614** | false | `no-verified-improvement` |

- **Beide Linien: 0 Siege für incumbent UND candidate** auf `Impossible`. Die Decke ist real: selbst die Basis (Regel-Policy) gewinnt 0; der Neural-Delta kann das nicht durchbrechen.
- **V4-Kandidat überlebt länger** (+13904 Ticks, +126614 Fläche) → Survival-/Territoriumsgewinn **ist** messbar. Aber das Gate verlangt **entweder** „mehr Siege mit begrenzten Regressionen" **oder** „reproduzierbare Survival-/Territoriumsgewinne **ohne** pro-Seed-Regressionen". V4 hat **4 pro-Seed-Regressionen** → Weg 2 scheitert; Weg 1 (mehr Siege) scheitert bei 0:0. → `no-verified-improvement`, `decisionRoundNeeded=true`.
- **Label-Varianz / Klassenbalance:** Die Klassen sind extrem unausgewogen (0 Siege vs viele Eliminierungen). Das macht ein outcomes-basiertes Learning schwer: der „Sieg"-Label ist selten und von der Bias-Ebene kaum erreichbar.
- **Train-vs-Validation-Gap:** `trainScoreFinal` A = **−0.174**, V4 = **−0.101** (beide **negativ**) → selbst die besten Trainings-Samples haben negativen Reward. Das Modell lernt **besseres Überleben**, nicht **Siegen**.

## 6. Verhaltensdegeneration

Aus den `trajectory`-Zusammenfassungen (z. B. V7-rush-stageC gen-1, `row`-Datensätze):
- **Land-Collapse:** Das Bot baut Land auf (peakLand ≈ 55 000) und verliert es dann fast vollständig (`endLand` 0–3 000, `retention` 0.0–0.43) → **Eliminierung vor Sieg**. Das ist exakt der „Collapse", den V6-Collapse attackiert, aber **nicht** vollständig gelöst.
- **War-Lock / Rush-Fragilität:** Gegen `rush`-Gegner wird die Basis (stageC) in den ersten ~2 000–4 500 Ticks eliminiert (`endTick` 2130–4568 in gen-1). Die Basis kann den frühen Rush nicht abwehren → der frühe Rush-Kill ist der dominante Verlier-Mechanismus.
- **Kein Gold-Horten / SAM-Silo-Missprios** als primäres Muster sichtbar; der dominante Defekt ist **früher Rush-Collapse + späteres Land-Verlust** vor Sieg.

## 7. Modelle vergleichen (faire Vergleiche)

- **Nicht** über historische ungepaarte Ergebnisse rangieren. Stattdessen:
  - **Job A (V6-nativ):** Alle 9 Modelle (zero, stageC, run3, V4-prov, V5-A-prov, V5-V4-prov, V6-A-prov, V6-V4-prov, V6-V4-champ) auf **derselben** Engine (`bb8af015`) + **demselben Posture-Bot** (`57775ec7`, dem V6-Trainings-Bot) + **frischen** `v6hold-*` Seeds → direkter, fairer Vergleich.
  - **Final-Holdout (nach Kandidatenwahl):** candidate / rule-basis / run3-schema4 / stageC auf **demselben Main-Solo-Bot** (`9cff544d`) + **derselben Engine** + frische `o7hold*` Seeds → 1v1, offizielles 2v2, FFA-Duo getrennt.
- **OOD-Hinweis (Posture-Bot):** V6 wurde auf dem Posture-Bot (`57775ec7`, mit `src/runtime/defense-posture.cjs` FSM) trainiert. Auf dem Main-Solo-Bot (`9cff544d`, ohne Posture-FSM) sind die V6-Kandidaten **out-of-distribution** → konservativer Test. Die **nativ** faire Bewertung ist Job A (Posture-Bot).

## 8. Priorisierte, belegte Engpässe + welcher V7-Versuch adressiert welchen

| # | Engpass (belegt) | Adressierender V7-Versuch |
|---|---|---|
| **P1** | **0-Siege-Decke auf `Impossible`** (Abschnitt 5): selbst die Regel-Basis gewinnt 0; die Bias-Ebene kann das nicht durchbrechen. | **v7-defender-run3**: absenkende Decke (`Hard` statt `Impossible`) + `defender`-Gegner → testet, ob bei geringerer Schwierigkeits-Decke ein **Sieg-Signal** (statt nur Survival) erreichbar ist. |
| **P2** | **Früher Rush-Collapse** (Abschnitt 6): Basis wird in ~2 000–4 500 Ticks vom Rush eliminiert. | **v7-rush-stageC**: Basis stageC gegen `rush`-Gegner auf `Impossible` → trainiert gezielt die **Anti-Rush-Abwehr**, die fehlende Komponente. |
| **P3** | **Einzel-FFA-Regime** (Abschnitt 5/7): alle V5/V6-Evidenz kommt aus Singleplayer-FFA; Multiplayer-Dynamik ungetestet. | **v7-mixed-public**: `Public` + 3 scripted humans + `mixed`-Gegner → **Multiplayer-Regime** mit Team-/Allianz-Dynamik, die V5/V6 nie sahen. |
| **P4** | **Kontroll-Decke der Bias-Ebene** (Abschnitt 2): Modell kann keine eigenständige Intent emittieren. | Alle drei V7-Varianten **behalten** die Schema-4-Architektur (bewusst: kontrollierter Vergleich, kein Archi-Wechsel). Falls P1–P3 einen Sieg liefern, ist die Bias-Ebene **trotz** ihrer Decke ausreichend; sonst ist ein größeres Architektur-Schema nötig (eigene, geprüfte Variante). |
| **P5** | **Pro-Seed-Regressionen** trotz Survival-Gewinn (Abschnitt 5): Gate verlangt 0 Regressionen für den Survival-Weg. | **v7-defender-run3** + **Final-Holdout** mit mehr Seeds/Partien → reduziert das pro-Seed-Rauschen, um zu prüfen, ob die Regressionen auf Stichprobenrauschen (nicht systematisch) beruhen. |

**Zusammenfassung:** Der dominante, belegte Engpass ist **P1 (0-Siege-Decke auf Impossible)** kombiniert mit **P2 (früher Rush-Collapse)**. Die Bias-Ebene (P4) ist die strukturelle Ursache, warum V5/V6 nur **Survival** (nicht **Sieg**) verbessern konnten. Die V7-Varianten adressieren gezielt P1 (absenkbare Decke), P2 (Anti-Rush) und P3 (Multiplayer) — **nicht** „noch mehr Epochen auf demselben Single-FFA-Impossible-Setup".

**Hypothese vs Befund:**
- **Befund (belegt):** 0:0 Siege auf Impossible, Gate `no-verified-improvement`, Bias-Ebene kann keine Intent emittieren, Rush-Collapse in ~3k Ticks.
- **Hypothese (zu testen):** Absenken der Decke auf `Hard` + Anti-Rush-Training + Multiplayer-Regime liefert einen **Sieg-Signal**, den die Bias-Ebene erreichen kann. → wird von den 3 V7-Trainings + Final-Holdout geprüft.
