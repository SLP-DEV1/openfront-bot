# Neural V5 — Long-Horizon Curriculum, Two Lineages (Kampagnen-Spezifikation)

Kampagnen-Spezifikation für `benchmark-results/neural-v5-curriculum/`
(local, gitignored — Treiber: `tools/benchmark/v5-curriculum-campaign.mjs`,
Launcher: `Start_V5_Curriculum.bat`).

**Status: abgeschlossen** (Start und Ende 2026-09-22) — Ergebnis:
**NO PROMOTION**, stageC bleibt offizieller Champion. Verdichtete
Analyse: `evaluation-summary.json` (dieser Ordner, via `report`-Phase).

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
| Wall-Clock-Budget | 3 h pro Phase (Train **und** Holdout; `--wallBudget <Sekunden>` übersteuerbar) |
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

## Zeitbegrenzung & Resume (Dauerhaftigkeit)

Der Lauf ist auf Unterbrechbarkeit ausgelegt (abgesichert durch
`tests/v5-curriculum-regression.cjs`, Abschnitt „Trainer durability“):

- **Zeitbegrenzung:** Jede Aufruf-Instanz hat ein Wall-Clock-Budget von
  3 h. Der **Trainer** prüft es nur an Generations-Grenzen (Überschreitung
  also maximal eine Generation); ein budget-begrenzter Aufruf endet mit
  Exit 0 und `status: "budget-exceeded"` (`history.json` wird
  entsprechend markiert). Der **Holdout** hält an den Match-Grenzen und
  merkt sich den Zustand in `holdout-state.json`
  (`incomplete: true`, `reason: "wall-budget"`). Der Treiber übergibt
  `--wallBudgetSeconds` an den Trainer und legt zusätzlich ein
  Hang-Netz-Timeout (Budget + 6 h) pro Trainer-Call.
- **Generationenweises Resume:** Ein abgebrochener oder
  budget-beendeter Lauf wird durch einfaches erneutes Ausführen derselben
  Phase fortgesetzt (Start-Bat bleibt unverändert):
  - `plan.json` pinnt die exakte Trainingsidentität (Engine-Commit,
    Grid, Ticks-Schedule, Seeds, Sigma, Policy-Schema, Startmodell,
    Bot-SHA). Jede Abweichung erzwingt fail-closed ein frisches
    `--out`-Verzeichnis.
  - `history.json` + `provisional.json`/`incumbent.json` pinnen den
    Stammbaum-Zustand der letzten vollendeten Generation; der Lauf
    setzt bei der ersten unvollständigen Generation an.
  - Jede verifizierte Partie bleibt als `row.json` erhalten und wird bei
    identischer Job-Identität (Modell-SHA, Ticks, Bot-SHA, Parameter)
    wiederverwendet, statt neu aufgerufen.
  - Der Bot wird als `pinned-bot.user.js` kopiert; sein Digest wird
    beim Resume geprüft (geänderter Script ⇒ frisches Verzeichnis).
- **Kandidaten-Materialisierung:** Ein Resume kann unter demselben
  Kandidaten-Label ein neues Modell erzeugen (determinische Mutation ⇒
  bei identischem Verlauf identischer SHA). `train()` ersetzt dann die
  Datei in `models-source/` (References bleiben strikt unverändert).

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

## Ergebnis (Abschluss 2026-09-22)

**Entscheidung: NO PROMOTION** — kein Kandidat mit verifizierter
Verbesserung über stageC, A-champ oder V4-prov. stageC bleibt
offizieller Champion, `autoDeploy: false`; kein Live-Bot-Austausch.
Entscheidungs-Datei: `benchmark-results/neural-v5-curriculum/holdout/decision.json`
(gitignored), verdichtet: `evaluation-summary.json` (dieser Ordner).

- **Training:** Beide Stammbäume 10/10 Generationen à 200 Partien
  (Voll-Grid, Curriculum 7200→18000 Ticks) zu je ~48 min — weit
  innerhalb des 3-h-Budgets. Kein In-Loop-Champion divergierte
  (keine `*-champ`-Kandidaten, `published: false`). trainScoreFinal:
  Stammbaum A −0.2115, Stammbaum V4 −0.2314.
- **Kandidaten (finaler Provisional, Schema 4):**
  - `V5-A-prov` — `baad08d1eef3e2f795a5ab77fac6c7d06dbc27238af847444aeb164659ad8d9e`
  - `V5-V4-prov` — `c5268942dbd8276c2666e6e250f343027a9685f45b728271b140dd8ccd58abaa`
- **Holdout:** 672/672 verifiziert (7 Modelle × 2 Schwierigkeiten ×
  48 gepaarte Partien, 12 `v5hold-*`-Samen, 18000 Ticks), 1356 s,
  0 Fehler — fail-closed-Verifikation durchgängig bestanden.
- **Gate (14 Vergleiche, alle N=48, alle valid): 14× promoted=false.**
  - V5-A-prov: `no-verified-improvement` auf beiden Schwierigkeiten
    (Hard: Net +2/+1/+2, gemischt; Impossible: Net −12/−4/−6).
  - V5-V4-prov: auf **Hard** `wins-up-but-collapse-too-large`
    (4 Siege gegen 2 bei stageC, Net +7, aber 17 Regressionen >
    Collapse-Schranke 12 = N/4); auf **Impossible**
    `no-verified-improvement` (Net −8 vs. stageC, +7 vs. A-champ,
    −5 vs. V4-prov — gemischt, keine robuste Verbesserung).
- **Auffälligkeiten (Kontext, keine Gate-Gründe):**
  - Hard: V5-V4-prov mit der höchsten Siegquote (4/48 vs. stageC
    2/48), aber niedrigste Retention (0.454 vs. 0.503) und die
    größte Peak-Abgabe (−30.7k Land) — aggressiver, aber instabiler
    als die Referenzen.
  - Impossible: null Siege für alle Kandidaten; V5-V4-prov mit dem
    höchsten Mean-End-Land (23.3k vs. stageC 20.2k), aber 19
    Eliminierungen (stageC: 14).
