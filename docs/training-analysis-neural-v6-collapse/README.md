# Neural V6 — Collapse Prevention, Two Lineages (Kampagnen-Spezifikation)

Kampagnen-Spezifikation für `benchmark-results/neural-v6-collapse/`
(local, gitignored — Treiber: `tools/benchmark/v6-collapse-campaign.mjs`,
Launcher: `Start_V6_Collapse.bat`).

**Status (2026-09-22):** `setup` abgeschlossen; **`baseline-newbot`
gemessen** (A=5, B=1, C=11 vs. Phase-1-Baseline A=6, B=2, C=9 —
Details unten); Voll-Lauf `all` gestartet (Trainingsphase Stammbaum A,
danach Stammbaum V4, Holdout, Collapse der Kandidaten, Report).
Der Lauf ist dry-run- und regressionstest-seziert
(`tests/v6-collapse-campaign-regression.cjs`); Start/Resume über
`Start_V6_Collapse.bat` (Phase `all` oder schrittweise).

## Hintergrund & Ziel

**V5 (abgeschlossen) ergab NO PROMOTION.** stageC bleibt offizieller
Champion. Der nächstgelegene Kandidat war **V5-V4-prov** auf Hard:
`wins-up-but-collapse-too-large` (4 Siege gegen 2 bei stageC, Net +7,
aber **17 Regressionen > Collapse-Schranke N/4 = 12**). Die
Kurz-Feedback-Problematik des V5-Curriculums war nicht das Trainings-
problem, sondern ein **Kollaps-Modus zur Laufzeit**: Der Bot kauft in
Threat-Situationen weiter aggressiv aus und kollabiert nach einem Peak
statt sich zu stabilisieren.

Darauf aufbauend:

- **Phase 1 (abgeschlossen):** 17 gepinnte Hard-Regression-Cells
  (die 17 Hard-Paare, in denen V5-V4-prov gegen stageC regressierte),
  exakt reproduzierbar und in die Kollaps-Taxonomie klassifiziert:
  **6 × Typ A** (früher Totalwipe), **2 × Typ B** (Peak > 60k dann
  Abbruch unter 50 % des Peaks), **9 × Typ C** (frühes Sterben /
  spätere Land-Defizite). Reproduzierbarkeit 17/17 bestätigt.
  Baseline-Bericht: `benchmark-results/v6-collapse-regression/v5-baseline/
  collapse-regression.json` (gitignored).
- **Phase 2 (abgeschlossen):** Defense-Posture-FSM direkt im Bot
  (`src/runtime/defense-posture.cjs`): vier Zustände
  NORMAL → THREATENED → CRITICAL → RECOVERING, eingefroren als
  `POSTURE_CONSTANTS = {MEGA_ATTACK: 1e6, CRITICAL_EXIT_TICKS: 60,
  RECOVER_MIN_TICKS: 120, RECOVER_MAX_TICKS: 900}`. Der Bot wird damit
  unter Kollapsdruck defensiv statt weiter aggressiv. **Dies ist der
  neue Posture-Bot** — seine SHA ist der Kern-Pin dieser Kampagne.
- **Phase 3 (diese Kampagne):** (a) **baseline-newbot** — der
  V5-V4-prov wird **ohne Retraining** auf dem neuen Posture-Bot gegen
  stageC über die 17 Zellen re-gemessen (isoliert den reinen
  Runtime-Effekt); (b) **Retraining** zweier unabhängiger
  Stammbäume auf den finalen V5-Provisionals (identisches,
  eingefrorenes Curriculum wie V5); (c) **collapse-Phase** — jede
  Kandidatin wird gegen stageC über die 17 Zellen gemessen;
  (d) **unabhängiger gepaarter Holdout** (neue `v6hold-*`-Samen) +
  unveränderter `evaluation-v2`-Gate.

Kampagnenziel: V6-Kandidaten, die **beide** Hürden nehmen —
weniger Kollaps-Zellen (Phase-1-Taxonomie) **und** verifizierte
Verbesserung im disjunkten Holdout (Gate).

## Startmodelle & Champion

- **V5-A-prov** — `baad08d1eef3e2f795a5ab77fac6c7d06dbc27238af847444aeb164659ad8d9e`
- **V5-V4-prov** — `c5268942dbd8276c2666e6e250f343027a9685f45b728271b140dd8ccd58abaa`
- **stageC** bleibt offizieller Champion
  (`84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1`),
  `autoDeploy: false`.
- Alle V6-Kandidaten müssen im gepaarten Holdout gegen **stageC,
  V4-prov, V5-A-prov und V5-V4-prov** die unveränderte
  `evaluation-v2`-Promotions-Regel bestehen (pro Schwierigkeit).
  Die Freigabe-Regel (Gate) bleibt unverändert, um einen V5-Sieg
  nicht per Gate-Änderung durchzuwinken.

## Trainings-Konfiguration (eingefroren im Treiber, beide Stammbäume)

**Exakt identisch zu V5** (damit sich die Delta gegenüber V5 nur auf
den Posture-Bot und die Startmodelle beziehen):

| Parameter | Wert |
|---|---|
| Engine (gepinnt) | `bb8af015b515b3b717bd4d901074c5f4c16641cb` |
| Bot | `OpenFront_Solo_AggroBot.user.js`, `botSHA256 57775ec7…` (neuer Posture-Bot) |
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

## Collapse-Phase (V6-spezifisch)

Werkzeug: `tools/benchmark/collapse-regression.cjs` (Phase-1-Tool,
unverändert). Re-run der **17 gepinnten** Hard-Regression-Cells unter
dem neuen Posture-Bot. Jobs:

- **`baseline-newbot`** — Modell `V5-V4-prov` (altes V5-Modell,
  **ohne Retraining**) gegen `stageC`. Isoliert den reinen
  Runtime-Effekt des Posture-Bots. Funktioniert **vor** dem Training
  (braucht keine Kandidaten).
- **je eine Job pro Kandidatin** — `V6-A-prov`/`V6-A-champ` (nur
  wenn distinct) und `V6-V4-prov`/`V6-V4-champ` (nur wenn distinct)
  gegen `stageC`.

Jede Job läuft 34 Partien (17 Zellen × 2 Modelle) bei 18000 Ticks,
`Hard`, `Singleplayer/FFA`, `balanced`, `autonomous`, `Compact` —
identisch zu Phase 1. Pro Job wird die Kollaps-Taxonomie (A/B/C)
aus beiden Partien klassifiziert und in
`benchmark-results/neural-v6-collapse/collapse/<job>/
collapse-regression.json` abgelegt; Aggregat:
`collapse/summary.json`.

**Pin-Drift-Guard:** Die `baseline-newbot`-Job muss exakt dieselben
17 Zell-Keys abdecken wie der Phase-1-Baseline-Bericht
(`benchmark-results/v6-collapse-regression/v5-baseline/
collapse-regression.json`, wenn vorhanden) — andernfalls wirft die
collapse-Phase fail-closed.

## Unabhängiger gepaarter Holdout (disjunkte `v6hold-*`-Samen)

- **Modelle:** zero, stageC, run3, A-champ, V4-prov, V5-A-prov,
  V5-V4-prov (7 Referenzen) + V6-Kandidaten (pro Stammbaum:
  Provisional, ggf. Champion) → 9–11 Modelle
- **Schwierigkeiten:** Hard **und** Impossible
- **Karten:** World **und** Europe (Kontrolltest)
- **Nationen:** 1, 4
- **Samen:** `v6hold-0…11` (12 Seeds, disjunkt zu allen
  `v3hold-*`, `v4hold-*`, `v5hold-*`, den 17 gepinnten
  Collapse-Cells und Trainings-/Eval-Seeds)
- **Setup:** Singleplayer/FFA, 0 scripted, balanced, 18000 Ticks,
  Profil `autonomous`
- **Umfang:** 48 Partien/Modell/Schwierigkeitsgrad
  → **864 Basismatches** (7 Referenzen + 2 Provisionals), bis
  **1056** inkl. beider Champs
- Pro Partie provenanzverifiziert (Policy-SHA, Bot-SHA, Engine-Commit
  in `run.json`), fehlgeschlagene Partien werden einmal wiederholt;
  der Holdout ist fail-closed.

## Freigabe-Kriterien (Entscheidungs-Regel)

Ein V6-Kandidat wird nur dann als **Kandidat für die Freigabe**
empfohlen (nicht automatisch freigegeben), wenn im gepaarten Holdout
(beide Schwierigkeiten) gegenüber **stageC, V4-prov, V5-A-prov und
V5-V4-prov** gilt:

- **unabhängige Siege** (victory, nicht Tick-Limit) gegen Referenzen
- **robuste Verbesserungen** gemäß `evaluation-v2`
  (regression-freie, über alle Seeds reproduzierbare Gewinne)
- **Collapse-Reduktion:** Die collapse-Phase muss zeigen, dass der
  Kandidat **weniger** Kollaps-Zellen (A/B) als die
  `baseline-newbot`-Job und als `stageC` aufweist
- **Kein automatischer Live-Bot-Austausch** — die Freigabe ist
  manuell (Deployment via `deploy.mjs` nach expliziter Entscheidung).

Entscheidungs-Datei: `decision.json` (aus `report`-Phase, enthält
`collapse`-Zusammenfassung), Zusammenfassung: `summary.json` und
`evaluation-summary.json`.

## Ausgeführte Phasen

| Phase | Beschreibung |
|---|---|
| setup | Engine-Check, Bot-SHA-Verifikation, Referenzmodelle pinnen, `campaign.json` schreiben |
| train | 2 × 10 Generationen × 200 Partien (resumierbar, nacheinander) |
| holdout | 864+ Partien (9–11 Modelle × 2 Schwierigkeiten × 48 Partien) |
| collapse | 17 Zellen × 2 Modelle pro Job (baseline-newbot + je eine pro Kandidatin) |
| report | `evaluation.json` pro Schwierigkeit, `decision.json`, `summary.json` (inkl. Collapse-Zusammenfassung) |
| all | alle Phasen der Reihe nach: `setup` → `train` → `holdout` → `collapse` → `report` |

## Referenzmodelle (Policy-SHA256)

| Label | SHA256 | Herkunft |
|---|---|---|
| zero | `a1e8b35677991f244e55c7734e21caa5a4f6cb6086192bef9857e3265084127e` | 1000 Nullen |
| stageC | `84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1` | offizieller Champion |
| run3 | `e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968` | Live-Run3 |
| A-champ | `0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5` | V3 Phase-A-Champion |
| V4-prov | `8dfcdcea8dc6be51dec602f0f89b04fab85de2740f35cfcd0523996daffade22` | V4 finaler Provisional |
| V5-A-prov | `baad08d1eef3e2f795a5ab77fac6c7d06dbc27238af847444aeb164659ad8d9e` | V5 Stammbaum-A finaler Provisional |
| V5-V4-prov | `c5268942dbd8276c2666e6e250f343027a9685f45b728271b140dd8ccd58abaa` | V5 Stammbaum-V4 finaler Provisional |

## Phase-1-Baseline (Referenz für die Collapse-Phase)

| Taxonomie | Zellen |
|---|---|
| Typ A (früher Totalwipe) | 6 |
| Typ B (Peak > 60k, dann Abbruch < 50 %) | 2 |
| Typ C (frühes Sterben / spätere Land-Defizite) | 9 |
| **Summe** | **17** (17/17 reproduzierbar) |

## baseline-newbot (gemessen 2026-09-22, V5-V4-prov ohne Retraining)

Reiner Posture-Bot-Runtime-Effekt, 17 Zellen, botSHA256
`57775ec7…`: **A=5, B=1, C=11** (Phase-1-Baseline altes Bot:
A=6, B=2, C=9). Ergebnis:
`benchmark-results/neural-v6-collapse/collapse/baseline-newbot/
collapse-regression.json`.

Zellweise (Kandidat, alt → neu):

| Zelle | altes Bot | neues Posture-Bot | Effekt |
|---|---|---|---|
| v5hold-2-Europe-4 | eliminated @4900, Land 0 | **tick-limit @18000, Land 41642** | A→C, gelöst |
| v5hold-5-Europe-4 | eliminated @4682, Land 0 | defeat @9731, Land 33435 | A→C, gelöst |
| v5hold-5-World-1 | eliminated @5648, Land 0 | defeat @6941, Land 694 | A→C, marginal |
| v5hold-3-World-4 | defeat @12471 | **SIEG @11971** | neue Sieg-Zelle |
| v5hold-0-Europe-4 | defeat @11561, Land 27695 | defeat @14431, Land 101202 | +2870 Ticks, 3,7× Land |
| v5hold-0-World-1 | defeat @12001, Land 28613 | defeat @6481, Land 7243 | **neu A** (überverteidigt) |
| v5hold-2-World-1 | defeat @7561, Land 4416 | eliminated @6242, Land 0 | **neu A** (überverteidigt) |
| v5hold-0-Europe-1 | defeat @12451, c50 @12400 | defeat @12681, c50 @12600 | Kollaps kaum verzögert |
| v5hold-3-Europe-4 | eliminated @5063 | eliminated @4864 | A, unverändert |
| v5hold-4-World-4 | defeat @4291 | defeat @5051 | A, unverändert |
| v5hold-11-World-1 | defeat @4791 | defeat @4491 | A, unverändert |
| (übrige 6 Zellen) | — | — | C, teils besser, teils schlechter |

Beantwortung der fünf Messfragen:

1. **Sechs frühe Totalverluste:** teilweise. 3 von 6 gelöst/verspätet
   (2-Europe-4, 5-World-1, 5-Europe-4), 3 unverändert strukturell
   (3-Europe-4, 4-World-4, 11-World-1 — alle sterben bei Tick
   4800–5050, Peak ≤ 42k: der Posture-Bot erreicht sie nicht früh
   genug), aber 2 **neue** Typ-A (0-World-1, 2-World-1). Netto A: 6→5.
2. **Mega-Angriff / Truppenbindungen:** nicht rechtzeitig. In
   0-Europe-1 Peak praktisch identisch (302050@9600 vs. 301514@9600)
   und Kollaps fast zum selben Tick (c50 12600 vs. 12400) — der Bot
   bindet weiter, verzögert nur ~200 Ticks. In 0-Europe-4 baute er
   später und höher (Peak 225652@12800) und hielt 2870 Ticks länger,
   kollapsed aber trotzdem (c50 14430).
3. **Beide Europe-Spätkollapse:** nicht verhindert. 0-Europe-1
   praktisch unverändert (End-Land 98092 vs. 109426), 0-Europe-4
   deutlich gebessert (End-Land 101202 vs. 27695), beide fallen
   trotzdem unter 50 % des Peaks. Die B→C-Umklassifikation beruht
   darauf, dass stageC unter dem neuen Bot in beiden Zellen ebenfalls
   verliert (Typ B verlangt überlebende Referenz).
4. **Neue Überverteidigungs-Probleme:** ja, 2 Zellen. 0-World-1
   (12001→6481) und 2-World-1 (7561→6242) erreichen denselben Peak
   wie das alte Bot, sterben aber deutlich früher — konsistent mit
   THREATENED/RECOVERING-Verharren ohne Re-Bindung. Zusätzlich
   schlechter: 10-Europe-4 (9991→7639, eliminated), 6-World-4
   (8211→7771, Peak 47346→34770), 4-World-1 (tick-limit, Land
   81183→60370). Das ist der Preis für die 3 gelösten A-Zellen.
5. **Schnelle World-Siege:** ja, erhalten und besser. stageC (neues
   Bot) gewinnt 3 von 4 relevanten World-Zellen statt 1: 0-World-1
   @8331 (vorher @11341, 3010 Ticks schneller), 5-World-1 @11391
   (vorher nur tick-limit), 11-World-1 @8351 (vorher Niederlage).
   Der Kandidat gewinnt neu 3-World-4 @11971.

**Zwischen-Fazit für die Dreier-Vergleichskette**
(V5-V4-prov altes Bot → V5-V4-prov Posture-Bot → V6-V4-prov
Posture-Bot): Der Posture-Bot allein liefert eine Netto-Verbesserung
(A 6→5, 1 neue Sieg-Zelle, stageC-Referenz deutlich stärker), aber
der Kollaps-Modus bleibt: 3 strukturelle A-Zellen + 2 neue
Überverteidigungs-Zellen. Genau diese 5 Zellen muss das Retraining
im V6-V4-Stammbaum attackieren; die Messung des Kandidaten gegen
`baseline-newbot` ist die Vergleichsgröße (Gate: weniger A/B-Zellen
als `baseline-newbot` und als stageC).

## Ergebnis

**Voll-Lauf läuft** (Stand 2026-09-22, Stammbaum A in Training).
Nach Abschluss: `benchmark-results/neural-v6-collapse/holdout/
decision.json` (gitignored), verdichtet: `evaluation-summary.json`
(dieser Ordner).
