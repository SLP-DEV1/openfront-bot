# Schema-4 Neural-v2 — 2-Stunden-Lauf (2026-09-21)

Kompakte Analyse des Laufs `benchmark-results/neural-v2-2hour-20260921/`
(local, gitignored — hier nur die verdichteten Ergebnisse und die
Champion-Entscheidung).

## Ergebnis

**Kein Aufstieg (no-promotion).** Der stageC-Champion bleibt Champion.
Bester Provisional: **candidate-impossible** (separat abgelegt, Rank 1).

- **Engine (gepinnt):** `bb8af015b515b3b717bd4d901074c5f4c16641cb`
- **Bot bei Training/Evaluation:** v1.19.4,
  `botSHA256 f07144847e6ad55d9cf317c4f24f89d469589692a14609ab3752c64b948d6c9d`
  (pro Match in `run.json` gepinnt)
- **Start-Champion (unchanged):** Modell `84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1`,
  Datei-Hash `d2a5fce385fa9b0a1432b2ee336ef0dde04ebccd8278ba21cc171abe14c31e51`
  → `../training-analysis-20260921/schema4-ffa-curriculum-20260921-overnight/stageC/champion.json`
- **Provisionals:** candidate-impossible `5b745a8e7faeb4823b2ad7bdcf6d0ea4dfdba72838fb93ba90f472311bf09fa7`
  (Rank 1), candidate-hard `ceb9858b4d74648b669cd7055c22ad5a1bee4b3009076096941e5d866e8db685`
  (Rank 2) — beide 24x24x16-tanh, 1000 Gewichte.
- **Umfang:** 1.026 Partien (898 Training in 3 Stufen × bis 4 Generationen,
  128 unabhängige Evaluation, 0 Fehler), 120-min-Fenster, Ryzen 9 9950X3D.

## Unabhängige gepaarte Holdout (disjunkte `hold-*`-Samen, 16 Partien/Modell)

| Schwierig. | Modell | W/L | End-Land | Retention | Survival |
|---|---|---|---|---|---|
| Hard | baseline-stageC | 0/15 | 29 487 | 0.4953 | 10 913 |
| Hard | baseline-zero | **2/12** | **41 663** | **0.6399** | 10 262 |
| Hard | candidate-hard | 1/14 | 37 866 | 0.5704 | 9 141 |
| Hard | candidate-impossible | 0/14 | 31 425 | 0.5269 | 9 949 |
| Impossible | baseline-stageC | 0/15 | 24 633 | 0.3775 | 8 182 |
| Impossible | baseline-zero | 1/15 | 27 665 | 0.4425 | 7 605 |
| Impossible | candidate-hard | 0/15 | 27 314 | 0.4497 | 9 334 |
| Impossible | candidate-impossible | 0/15 | **28 753** | 0.4223 | **9 269** |

Vollständige Metriken (Peak-Land, TerritoryGained, Gold, Builds, Impact-Deltas):
`evaluation-summary.json` in diesem Verzeichnis.

## Warum kein Aufstieg

1. **Kein Kandidat dominiert beide Schwierigkeitsgrade.** Auf Hard ist die
   zero-Baseline (reine Regel-Planer ohne Neural-Bias) klar am stärksten:
   2 Siege, End-Land 41 663, Retention 0.6399, Gold 804 738 — kein Kandidat
   schlägt sie dort; beide Kandidaten überleben auf Hard kürzer als der
   Champion (9 141 / 9 949 vs. 10 913 Ticks).
2. **Auf Impossible** führt candidate-impossible zwar in End-Land (28 753),
   Peak-Land (54 364), Survival (9 269) und TerritoryGained (0.5625), aber
   ohne mehr Siege (0:1 gegen zero) und mit Retention unter candidate-hard
   (0.4497) — das v2-Gate verlangt bei gleichen Siegen wiederholbare,
   regression-freie Vorteile über **alle** Seeds.
3. Ein einzelnes starkes Teilresultat (Impossible) wird durch die
   Hard-Regressionsmuster nicht aufgewogen.

## Trainierende Stufen (Kurzfassung)

| Stufe | Gen. | trainScore (beste, letzte Gen.) | Exit | Provisional |
|---|---|---|---|---|
| stage1-medium | 1/4 (SIGTERM am Fenster-Rand) | 0.19738 (Gen 1) | SIGTERM | = Start-Champion |
| stage2-hard | 4/4 | −0.20021 (Gen 4) | 1 (Curriculum-Ende) | candidate-hard |
| stage3-impossible | 4/4 | −0.21383 (Gen 4) | 1 (Curriculum-Ende) | candidate-impossible |

Kein Aufstieg in 9/9 Generationen (Gate: `regressions-block-promotion`) —
per-Seed-Varianz bei Population 4 / 4 Generationen zu hoch für das strenge
v2-Gate (`trainer/evaluation-v2.cjs`).

## Provenanz & Hinweise

- **Reward-Redesign:** strategischer Qualitätsscore (Mean-Held-Land anti-Spike,
  End-Land, Retention, Netto-Territory, Brückenköpfe, produktive Gebäude,
  Gold, Survival; `lostFromPeak`-Strafe; Outcomes dominant, Tick-Limit
  rechtszensiert) in `trainer/reward.cjs` implementiert und vorab offline auf
  8 stageC-Partien validiert (Details: `plan.json` des Runs). Hinweis: Die
  unkommitierten Trainer-Änderungen wurden nach dem Lauf (20:20:01Z) durch
  eine parallele Repo-Operation (bulk Line-Ending-Normalisierung) auf die
  commitierte Version zurückgesetzt — alle Trainingspartien liefen vorher,
  Provenanz pro Match in `run.json`.
- **Live-Bot:** `OpenFront_AggroBot_Impossible_Run3.user.js` bleibt Fallback
  (nicht überschrieben); kein neues Live-Userscript (kein Aufstieg).
  `node --check` OK auf beiden Bots; Regressionstests: siehe
  `TRAINING_REPORT.md` des Runs (Abschnitt 9).
- **Keine Rohlogs auf GitHub:** `benchmark-results/` ist gitignored; dieser
  Ordner enthält nur die kompakte Analyse.
