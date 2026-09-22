# Neural V5 — Long-Horizon Curriculum, Two Lineages (Kampagnen-Spezifikation)

Kampagnen-Spezifikation für `benchmark-results/neural-v5-curriculum/`
(local, gitignored — Treiber: `tools/benchmark/v5-curriculum-campaign.mjs`,
Launcher: `Start_V5_Curriculum.bat`).

**Status: geplant** — dieser Ordner erhält nach dem Lauf die
verdichtete Analyse (`evaluation-summary.json` via `report`-Phase).

## Ziel

V4 wurde auf 7.200-Tick-Partien trainiert, aber erst auf 18.000 Ticks
evaluiert. Kurz-Trainingspartien geben damit nur eingeschränkte
Feedback-Signale darüber, ob frühe Entscheidungen letztlich zum Sieg
oder zum Kollaps führen. V5 behebt das mit einem **zweistufigen
Curriculum auf längeren Partien**:

- **Generationen 1–5 bei 7.200 Ticks** — Early Survival & Expansion
  (gleiches Fokusfenster wie V4),
- **Generationen 6–10 bei 18.000 Ticks** — volles Spiel; das
  Reward-Signal reicht bis zum tatsächlichen Sieg oder Kollaps.

Zusätzlich läuft in **jeder Generation das vollständige
Kontroll-Grid** (Voll-Grid, gleichgewichtet): Schwierigkeiten
Impossible **und** Hard × Karten World **und** Europe × Nationen 1/4.
V4 trainierte nur Impossible/World — V5 prüft, ob die gelernte
Strategie auf dem Kontroll-Grid stabil bleibt und nicht
Difficulty-/Karten-spezifisch überangepasst ist.

Zwei **unabhängige Kandidaten-Stammbäume** werden parallel als
experimentelle Startkandidaten geführt (V4 hat gezeigt, dass der
Startpunkt das Ergebnis maßgeblich steuert):

- **Stammbaum A:** Startmodell A-champ
  (`0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5`)
- **Stammbaum V4:** Startmodell V4-prov
  (`8dfcdcea8dc6be51dec602f0f89b04fab85de2740f35cfcd0523996daffade22`)

Beide Startmodelle bleiben als Referenzmodelle im Holdout; der
**offizielle Champion bleibt stageC**
(`84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1`).

## Startmodelle & Champion

- **A-champ** — experimenteller Kandidat (bestes Generalisierungsverhalten
  aus V3 Phase A).
- **V4-prov** — finaler V4-Provisional (überlebender Kandidat des V4-Laufs).
- Alle V5-Kandidaten müssen im gepaarten Holdout gegen **stageC,
  A-champ und V4-prov** die unveränderte `evaluation-v2`-Promotions-Regel
  bestehen (pro Schwierigkeit). Die Freigabe-Regel (Gate) bleibt
  unverändert, um einen V4-Sieg nicht per Gate-Änderung durchzuwinken.

## Trainings-Konfiguration (eingefroren im Treiber, beide Stammbäume)

| Parameter | Wert |
|---|---|
| Engine (gepinnt) | `bb8af015b515b3b717bd4d901074c5f4c16641cb` |
| Bot | `OpenFront_Solo_AggroBot.user.js`, `botSHA256 008c1a25…246` |
| Schema | 4 (24×24×16-tanh, exakt 1000 Gewichte) |
| Schwierigkeiten | Impossible **und** Hard (Voll-Grid, gleichgewichtet) |
| Karten | World **und** Europe |
| Nationen | 1, 4 |
| **Ticks (Curriculum)** | **Gen 1–5: 7200, Gen 6–10: 18000** (zweistufig) |
| Generationen | 10 |
| Population | 6 |
| trainSeeds / evalSeeds | 3 / 2 (disjunkt) |
| sigma | 0.12 |
| Parallel | 16 |
| Reward / Gate | `strategic-held-land-v2` / `evaluation-v2` (beide unverändert) |
| Partien/Generation | 2×2×2×(3×7+2×2) = **200** (Trainer-Limit) |
| Partien/Stammbaum | 200 × 10 = **2000** |
| Partien gesamt (Training) | **4000** (2 Stammbäume) |

Hinweis zum Seed-Budget: Das Voll-Grid verdreifacht die Bedingungen
gegenüber V4 (8 statt 3); um innerhalb des Trainer-Limits
(200 Partien/Generation) zu bleiben, wurden die **evalSeeds von 4 auf
2** reduziert. Das in-Training-Promotion bleibt dadurch provisorisch —
das maßgebliche, disjunkte Urteil ist der unabhängige Holdout.

Der Trainer wurde entsprechend erweitert (`trainer/train.mjs`):
`--difficulty` akzeptiert eine Komma-Liste (Voll-Grid, jede Generation
vollständig), `--ticksSchedule` legt pro Generation den Tick-Limit-Wert
fest (zweistufiges Curriculum). Beides ist dry-run- und
regressionstest-seziert (`tests/v5-curriculum-regression.cjs`).

## Unabhängiger gepaarter Holdout (disjunkte `v5hold-*`-Samen)

- **Modelle:** zero, stageC, run3, A-champ, V4-prov (5 Referenzen) +
  V5-Kandidaten (pro Stammbaum: Provisional, ggf. Champion) →
  5–9 Modelle
- **Schwierigkeiten:** Hard **und** Impossible
- **Karten:** World **und** Europe (Kontrolltest)
- **Nationen:** 1, 4
- **Samen:** `v5hold-0…11` (12 Seeds, disjunkt zu allen `v3hold-*`,
  `v4hold-*` und Trainings-/Eval-Seeds)
- **Setup:** Singleplayer/FFA, 0 scripted, balanced, 18000 Ticks,
  Profil `autonomous`
- **Umfang:** 48 Partien/Modell/Schwierigkeitsgrad
  → **672 Basismatches** (5 Referenzen + 2 Provisionals), bis 864 inkl.
  beider Champs
- Pro Partie provenanzverifiziert (Policy-SHA, Bot-SHA, Engine-Commit
  in `run.json`), fehlgeschlagene Partien werden einmal wiederholt;
  der Holdout ist fail-closed.

## Freigabe-Kriterien (Entscheidungs-Regel)

Ein V5-Kandidat wird nur dann als **Kandidat für die Freigabe**
empfohlen (nicht automatisch freigegeben), wenn im gepaarten Holdout
(beide Schwierigkeiten) gegenüber **stageC, A-champ und V4-prov** gilt:

- **unabhängige Siege** (victory, nicht Tick-Limit) gegen Referenzen
- **robuste Verbesserungen** gemäß `evaluation-v2`
  (regression-freie, über alle Seeds reproduzierbare Gewinne)
- **Kein automatischer Live-Bot-Austausch** — die Freigabe ist
  manuell (Deployment via `deploy.mjs` nach expliziter Entscheidung).

Entscheidungs-Datei: `decision.json` (aus `report`-Phase),
Zusammenfassung: `summary.json` und `evaluation-summary.json`.

## Ausgeführte Phasen

| Phase | Beschreibung |
|---|---|
| setup | Engine-Check, Bot-SHA-Verifikation, Referenzmodelle pinnen, `campaign.json` schreiben |
| train | 2 × 10 Generationen × 200 Partien (resumierbar, nacheinander) |
| holdout | 672+ Partien (5–9 Modelle × 2 Schwierigkeiten × 24 Partien) |
| report | `evaluation.json` pro Schwierigkeit, `decision.json`, `summary.json` |
| all | alle Phasen der Reihe nach |

## Referenzmodelle (Policy-SHA256)

| Label | SHA256 | Herkunft |
|---|---|---|
| zero | `a1e8b35677991f244e55c7734e21caa5a4f6cb6086192bef9857e3265084127e` | 1000 Nullen |
| stageC | `84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1` | offizieller Champion |
| run3 | `e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968` | Live-Run3 |
| A-champ | `0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5` | V3 Phase-A-Champion |
| V4-prov | `8dfcdcea8dc6be51dec602f0f89b04fab85de2740f35cfcd0523996daffade22` | V4 finaler Provisional |
