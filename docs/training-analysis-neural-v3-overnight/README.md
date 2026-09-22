# Schema-4 Neural-V3 — 10-Stunden-Overnight-Lauf (2026-09-21 → 2026-09-22)

Kompakte Analyse des Laufs `benchmark-results/neural-v3-overnight-10h/`
(local, gitignored — hier nur die verdichteten Ergebnisse und die
Champion-Entscheidung).

## Ergebnis

**Kein Aufstieg (NO PROMOTION)** — sowohl Hard als auch Impossible.
Der **stageC-Champion** (restaurierter V2-Champion) bleibt Champion.
Kein neues Live-Userscript; `OpenFront_AggroBot_Impossible_Run3.user.js`
unverändert.

- **Engine (gepinnt):** `bb8af015b515b3b717bd4d901074c5f4c16641cb`
- **Bot:** `OpenFront_Solo_AggroBot.user.js`,
  `botSHA256 008c1a2536cd9ef324a6372de7f65c7400bb9587c46dca8c74e0d3f3a4dff246`
  (pro Phase byteidentisch als `pinned-bot.user.js` abgelegt, in jeder
  `run.json` verifiziert)
- **Policy:** Schema-4, 24x24x16-tanh, exakt 1000 Gewichte
- **Reward / Gate:** `strategic-held-land-v2` (`trainer/reward.cjs`) /
  `evaluation-v2` (`trainer/evaluation-v2.cjs`), beide unverändert
- **Umfang:** 4.640 Trainings-/Evaluation-Partien (4 Phasen × 10 Generationen
  × 116 Partien) + 960 Holdout-Partien (10 Modelle × 48 × 2 Schwierigkeitsgrade),
  0 Fehler, 600-min-Fenster eingehalten (Training 03:55Z, Holdout 01:32Z,
  Bericht 01:45Z — alle vor den Fristen 05:51Z / 07:11Z / 07:31Z)

## Modell-Katalog (Policy-SHA256)

| Label | SHA256 | Herkunft |
|---|---|---|
| zero | `a1e8b35677991f244e55c7734e21caa5a4f6cb6086192bef9857e3265084127e` | 1000 Nullen (reiner Regel-Bot) |
| stageC | `84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1` | restaurierter V2-Champion (Start-Incoming) |
| run3 | `e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968` | Live-Run3-Modell |
| v2-hard | `e4e80dc269252000b8b52484784cb620fcce09985f83f07e0787be5424349263` | V2-Kandidat Hard |
| v2-impossible | `0482f0ec3f5b72909a34f3dae6272f69ac0ad1c969977b822e8577670a74d9e8` | V2-Kandidat Impossible |
| A-champ | `0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5` | Phase A Champion (Gen 5, Medium) |
| A-prov | `2b0d3d90b57e93af7bab468ab7e773c8abacd6baadead91f4cf7373a0be45378` | Phase A Provisional (Gen 10) |
| B-prov | `a29f7985b7038e967e2364165bc28ba463e4d1adf3ab92841d7850b98b80e8fc` | Phase B Champion+Provisional (Gen 9, Hard) |
| C-prov | `ce7c780fc56579780756a08f42cda3de787596a2c82418562746466cb4aa1e52` | Phase C Provisional (Gen 10, Impossible) |
| D-prov | `b5b119c503b57639b9272068df69edaa221726a18bdbf736595104050e368dd8` | Phase D Provisional (Gen 10, Hard) |

## Unabhängige gepaarte Holdout (disjunkte `v3hold-*`-Samen, 48 Partien/Modell)

Seeds `v3hold-0…11` × {World, Europe} × nations {1,4}, Singleplayer/FFA,
0 scripted, balanced, 18000 Ticks — identisch für alle 10 Modelle, Seeds
disjunkt zu allen Trainings-/Eval-Seeds, pro Partie
provenanzverifiziert (480/480 pro Schwierigkeitsgrad, 0 Fehler).
Vollständige Metriken: `evaluation-summary.json` in diesem Verzeichnis.

### Hard

| Modell | W/L | Elim/TickLim | End-Land Ø | Peak Ø | Retention |
|---|---|---|---|---|---|
| zero | 1/42 | 13/5 | 32 793 | 52 682 | 0.533 |
| stageC | 1/40 | 14/7 | 31 805 | 48 282 | 0.531 |
| run3 | 0/45 | 13/3 | 22 822 | 48 714 | 0.403 |
| C-prov | 0/39 | 12/9 | 31 036 | **53 768** | 0.510 |
| B-prov | 1/39 | 11/8 | 31 292 | 50 172 | 0.514 |
| A-prov | 1/42 | 9/5 | 31 765 | 50 852 | 0.520 |
| A-champ | 0/42 | 9/6 | **34 642** | 49 859 | **0.590** |
| D-prov | 0/41 | 13/7 | 29 951 | 51 738 | 0.471 |
| v2-hard | 0/43 | 10/5 | 29 314 | 47 619 | 0.503 |
| v2-impossible | 0/46 | 13/2 | 25 259 | 46 239 | 0.468 |

### Impossible

| Modell | W/L | Elim/TickLim | End-Land Ø | Peak Ø | Retention |
|---|---|---|---|---|---|
| zero | 0/47 | 23/1 | 16 923 | 37 426 | 0.301 |
| stageC | 0/45 | 20/3 | 18 848 | 41 050 | 0.328 |
| run3 | 0/47 | 18/1 | 17 879 | 39 539 | 0.331 |
| C-prov | 0/45 | 17/3 | 18 959 | 36 197 | 0.370 |
| B-prov | 0/46 | 17/2 | 19 002 | 36 892 | 0.360 |
| A-champ | 0/44 | 20/4 | **23 639** | 39 707 | **0.378** |
| A-prov | 0/45 | 19/3 | 22 507 | 39 919 | 0.374 |
| D-prov | 0/47 | 21/1 | 17 017 | 37 408 | 0.345 |
| v2-hard | 0/48 | 18/0 | 15 926 | 38 674 | 0.338 |
| v2-impossible | 0/48 | 18/0 | 17 223 | 38 982 | 0.350 |

## Champion-Entscheidung (unverändertes `evaluation-v2.cjs`)

18 Paar-Vergleiche (9 Kandidaten × Referenzen stageC und B-prov × 2
Schwierigkeitsgrade), alle gültig (N=48), **alle `no-verified-improvement`** →
**NO PROMOTION**. Alle 18: `decisionRoundNeeded=true`. Enge Fälle:

| Ref → Kandidat | Schw. | I/C Siege | improved/regressed | net |
|---|---|---|---|---|
| stageC → B-prov | Hard | 1/1 | 25/19 | +6 |
| B-prov → A-champ | Impossible | 0/0 | 24/17 | +7 |
| stageC → A-champ | Impossible | 0/0 | 20/16 | +4 |
| stageC → C-prov | Hard | 1/0 | 24/21 | +3 |
| B-prov → C-prov | Hard | 1/0 | 23/18 | +5 |

## Warum kein Aufstieg

1. **Impossible ist eine Sieg-Wüste:** alle 10 Modelle 0/48 Siege. Das
   v2-Gate verlangt bei gleichen Siegen regression-freie, über alle Seeds
   reproduzierbare Survival-/Territoriumsgewinne — bei N=48 und der
   beobachteten Seed-Streuung hängen alle Kandidaten an 16–30
   per-Seed-Regressionen.
2. **Hard:** A-champ ist der Territorial-stärkste Kandidat (End-Land
   34 642, Retention 0.590), C-prov der überlebensstärkste (9 Tick-Limits,
   Peak 53 768) — aber keiner schlägt stageC in der Paarung mit
   akzeptabler Kollaps-Bilanz.
3. **A-champ generalisiert am besten:** der auf Medium trainierte Champion
   führt auf Impossible in End-Land/Mean-Land/Retention über alle
   Hard/Impossible-Trainier-Modelle — die einfachere frühere Phase liefert
   robustere Gewichte.
4. **V2-Kandidaten** liegen auf beiden Schwierigkeitsgraden unter den
   V3-Modellen und unter stageC.

## Trainierende Stufen (Kurzfassung)

| Phase | Gen. | trainScore (top, letzte Gen.) | Exit | Promotion |
|---|---|---|---|---|
| A-medium | 10/10 | 0.2493 (Gen 10), 0.4204 (Gen 5) | 0 | Gen 5 → Champion A-champ |
| B-hard | 10/10 | −0.1430 (Gen 10) | 0 | Gen 9 → Champion = Provisional B-prov |
| C-impossible | 10/10 | −0.3081 (Gen 10) | 0 | keine |
| D-targeted-hard | 10/10 | −0.1797 (Gen 10) | 0 | keine |

Kette stageC → A → B → C → D (initialModel = Provisional der Vorphase);
je 10 Generationen × 116 Partien, Population 6, sigma 0.12, trainSeeds 3,
evalSeeds 4, parallel 16.

## Provenanz & Vorfälle

- **Isolation:** eigener Worktree `.worktrees/neural-v3-overnight`,
  eigener Branch `neural-v3-overnight`; Engine-Commit und Bot-SHA in allen
  `plan.json`/`run.json` gepinnt; keine WIPs anderer Sessions, keine
  Live-Userscripts berührt.
- **Vorgang:** der erste Holdout-Start lieferte `EVAL_DIFFICULTY` mit
  angehängtem Leerzeichen (Background-Shell), wodurch alle 480 Spawns mit
  `Unknown enum Hard ` fehlschlugen. Fix: Treiber trimmt
  Umgebungsvariablen, Verzeichnis `difficulty-Hard ` → `difficulty-Hard`
  umbenannt (vorbereitete Modell-Ordner übernommen), Neustart — danach
  480/480 verifiziert. Kein Einfluss auf die Trainingsphasen.
- **Keine OOM/Timeouts** (25-Min-Spawn-Ceiling nie erreicht); 16 Worker
  laut Parallelitäts-Benchmark.
- **Keine Rohlogs auf GitHub:** `benchmark-results/` ist gitignored; dieser
  Ordner enthält nur die kompakte Analyse.

## Empfohlene nächste Schritte

1. Decision Round für **A-champ (Impossible)** (net +7 vs. B-prov,
   `decisionRoundNeeded`) mit verdoppelten Seeds (96+).
2. Decision Round für **C-prov (Hard)** (net +5 vs. B-prov).
3. Curriculum mit höheren evalSeeds (8 statt 4) für in-Loop-Entscheidungen.
4. Kartenspezifische (Europe) Holdout-Analyse der Schwächestruktur.
5. Sieg-Bonus-Eskalation im Reward für spätere Phasen.
