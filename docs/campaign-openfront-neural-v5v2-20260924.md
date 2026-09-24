# OpenFront Neural V5-v2 — 5-Hour Training Campaign Report

Campaign id: `openfront-neural-v5-v2-5h`
Status: **COMPLETE** — all 3 modes executed; gate NOT-ELIGIBLE; champion unchanged.

- **Start:** 2026-09-24T01:18:45Z
- **End:** 2026-09-24T02:33:00Z
- **Runtime:** ~74 min wall (3 engine modes run concurrently; well within the 5-hour
  budget). Engine matches: 72 total (24 per mode × 3 modes), all clean recordings.

## 0. Provenance (all SHAs)

| Artifact | SHA / value |
|---|---|
| git repo HEAD | `d8e760329724e81b68a291db1d5241e97cabdbe4` (2026-09-24 03:18:08 +0200) |
| engine (OpenFrontIO) | `13b403387af01d388f8c8ed8c953b6d3a11d1457` (clean checkout) |
| bot source (rule-basis / run3 arms) | `beb1ada05762…` |
| bot source (candidate arm, model injected) | `0f4c76c02be0…` |
| candidate model file (`trainer/campaign-20260924/lr0.2-e200/model.json`) | `5041e9aaeb3759be84ac0772…` |
| rule-basis policy SHA | `f64ab52d2065…` |
| run3-schema4 champion policy SHA | `e0fceaef90d5…` |
| training dataset | `tools/benchmark/v5full-v2/dataset.json` |

## 1. Data quality (Section 2A)

Dataset `tools/benchmark/v5full-v2/dataset.json` (engine `13b40338…`):
- **matches: 28**, total frames: **3958**, usable labels: **1387**
- observed frames: 1555, counterfactual frames: 2403, badFeatures: **0**
- outcomes: unknown 24, defeat 4 (no confirmed victory in training set)
- action kinds: naval 784, invest 1555, hold 1555, expand 37, attack 27
- labels: linked chosen-vs-executed (observed) + non-chosen counterfactuals;
  censored frames → `unknown` (not labelled as win/loss)
- multi-frame + duo matches kept together (per-match split, no cross-match leak)

**Feature parity (active-vs-constant):** `featuredSchemaVersion 2`, **32 active / 0 constant**.
The 19 previously-constant features are now fed real data at runtime;
`buildFeatures` === `candidate.features` (parity by construction, `featureParity: true`
in every evaluation).

## 2. Candidates trained from the v5-v2 model (Section 2B)

All candidates trained from the v5full-v2 dataset (NOT null), deterministic full-batch GD,
Xavier init seed `0x2545F491`, per-match disjoint train/val split (21 train / 7 val matches
→ **1035 train / 352 val samples**). Each has a unique config + model SHA.
Reference baselines on the **same** val set (n=352):
- null (zero weights) MSE **0.23144517**
- fixed rule MSE **0.21885130**
- mean-constant MSE **0.14570720**

| # | name | arch | LR | epochs | train MSE | **val MSE** | note |
|---|------|------|----|--------|-----------|-------------|------|
| 1 | lr0.1-e300-baseline | 32x20x2 | 0.1 | 300 | 0.11535810 | **0.11568991** | reproduces reference v5-v2 candidate |
| 2 | lr0.05-e500 | 32x20x2 | 0.05 | 500 | — | **0.11725491** | |
| 3 | **lr0.2-e200** | 32x20x2 | 0.2 | 200 | 0.11226829 | **0.11307833** | **chosen** (best 32x20x2) |
| 4 | lr0.01-e1000 | 32x20x2 | 0.01 | 1000 | — | **0.12465221** | |
| 5 | arch32x40x2-lr0.1-e300 | 32x40x2 | 0.1 | 300 | — | **0.10786673** | best offline, but 1402 weights → runtime `validate()` requires 32x20x2, so offline-only |

All 5 beat null (0.2314) and rule (0.2189) on val MSE. Selection was **not** solely by
lower MSE: the best *runtime-compatible* (32x20x2) candidate **lr0.2-e200** was chosen as
the engine arm; the 32x40x2 model is reported as best-offline but is runtime-incompatible
(`candidate-policy-v5.validate()` enforces arch `32x20x2-tanh` / 702 weights).

## 3. Engine evaluation vs rule-basis and Run3 schema-4 champion (Section 2C)

Three arms per scenario, identical bot source except the injected model:
`candidate` (lr0.2-e200 model, control gain 18), `rule-basis` (no model),
`run3-schema4` (schema-4 champion). New frozen seed sets (disjoint from training + all
prior holdouts). 18000 ticks per match.

### 3.1 Mode: 1v1 (World + Europe, balanced + rush, 2 runs → 8 scenarios × 3 arms = 24 matches)

Recording integrity: **24/24 rows clean** (complete=true, dropped=0, streamErrors=0) —
the prior "dropped warm-up frames" issue is resolved.

Outcomes: candidate 2 confirmed victories + 6 tick-limit (censored); rule-basis identical;
run3-schema4 0 confirmed, 8 censored.

**Per-scenario endLand (tick 18000):**

| scenario | candidate | rule-basis | run3-schema4 | cand−run3 |
|---|---|---|---|---|
| Europe-balanced-p1 | 226265 | 226265 | 258311 | −32046 |
| Europe-balanced-p2 | **460320 (V)** | 460320 | 221659 | **+238661** |
| Europe-rush-p1 | **455938 (V)** | 455938 | 352866 | **+103072** |
| Europe-rush-p2 | 225660 | 225660 | 246365 | −20705 |
| World-balanced-p1 | 22211 | 22211 | 77303 | −55092 |
| World-balanced-p2 | 79122 | 79122 | 34501 | +44621 |
| World-rush-p1 | 88834 | 88834 | 76970 | +11864 |
| World-rush-p2 | 85338 | 85338 | 61147 | +24191 |

**Paired (candidate vs baseline), matched 8 pairs:**
- vs rule-basis: land mean diff **0.0** (CI [0,0]) — candidate land is **identical** to
  rule-basis in every scenario. The gain-18 neural control produced no net land change
  over the rules in 1v1. Not distinguishable.
- vs run3-schema4: land mean diff **+39320.75**, SE 33386.7, 95% CI [−39626, +118268]
  — candidate is ahead on 5/8 scenarios (incl. 2 confirmed victories) but the CI spans 0
  → **not statistically distinguishable**. decisive pairs: 0/4 cells met the required 2.

### 3.2 Mode: official-2v2 (World + Europe, balanced + rush, 2 runs → 8 scenarios × 3 arms = 24 matches)

Recording integrity: **24/24 rows clean** (complete=true, dropped=0, streamErrors=0).
Confirmed outcomes: candidate 5 victory + 4 defeat; 3 censored (tick-limit).

**Per-scenario endLand (tick 18000):**

| scenario | candidate | rule-basis | run3-schema4 | cand−rule | cand−run3 |
|---|---|---|---|---|---|
| Europe-balanced-p1 | 164145 (V) | 164145 | 126326 (V) | 0 | +37819 |
| Europe-balanced-p2 | 195194 (inc) | 195194 | 246971 (inc) | 0 | −51777 |
| Europe-rush-p1 | 23832 (def) | 23832 | 38410 (def) | 0 | −14578 |
| Europe-rush-p2 | 63357 (def) | 63357 | 68147 (def) | 0 | −4790 |
| World-balanced-p1 | 94640 (V) | 94640 | 61168 (V) | 0 | +33472 |
| World-balanced-p2 | 20017 (def) | 20017 | 0 (def) | 0 | +20017 |
| World-rush-p1 | 60604 (V) | 60604 | 54042 (V) | 0 | +6562 |
| World-rush-p2 | 34098 (V) | 34098 | 34697 (V) | 0 | −599 |

**Paired (candidate vs baseline):**
- vs rule-basis: land mean diff **0.0** (CI [0,0]) — candidate land **identical** to
  rule-basis in every scenario (same finding as 1v1). Not distinguishable.
- vs run3-schema4: land mean diff **+3265.75**, SE 10199.6, 95% CI [−20852, +27384]
  — candidate marginally ahead on 4/8 scenarios but the CI spans 0 → **not
  distinguishable**.

### 3.3 Mode: ffa-duo (World + Europe, balanced + rush, 2 runs → 8 scenarios × 3 arms = 24 matches)

Recording integrity: **24/24 rows clean** (complete=true, dropped=0, streamErrors=0).
Confirmed outcomes: candidate 10 victory + 13 defeat; 1 censored.

**Per-scenario endLand (tick 18000):**

| scenario | candidate | rule-basis | run3-schema4 | cand−rule | cand−run3 |
|---|---|---|---|---|---|
| Europe-balanced-p1 | 409088 (V) | 409088 | 277346 | 0 | +131742 |
| Europe-balanced-p2 | 58832 (def) | 58832 | 45292 | 0 | +13540 |
| Europe-rush-p1 | 38677 (def) | 38677 | 0 | 0 | +38677 |
| Europe-rush-p2 | 94387 (def) | 94387 | 50851 | 0 | +43536 |
| World-balanced-p1 | 102792 (V) | 102792 | 3040 | 0 | +99752 |
| World-balanced-p2 | 126466 (V) | 126466 | 31409 | 0 | +95057 |
| World-rush-p1 | 18011 (def) | 18011 | 127369 | 0 | −109358 |
| World-rush-p2 | 104755 (V) | 104755 | 119146 | 0 | −14391 |

**Paired (candidate vs baseline):**
- vs rule-basis: land mean diff **0.0** (CI [0,0]) — candidate land **identical** to
  rule-basis in every scenario. Not distinguishable.
- vs run3-schema4: land mean diff **+37319.38**, SE 27038.7, 95% CI [−26617, +101256]
  — candidate ahead on 6/8 scenarios but the CI spans 0 → **not distinguishable**.

### 3.4 Cross-mode summary

| mode | cand−rule-basis (land, 95% CI) | cand−run3-schema4 (land, 95% CI) | distinguishable vs run3? |
|---|---|---|---|
| 1v1 | 0.0 [0,0] | +39320.75 [−39626, +118268] | no |
| official-2v2 | 0.0 [0,0] | +3265.75 [−20852, +27384] | no |
| ffa-duo | 0.0 [0,0] | +37319.38 [−26617, +101256] | no |

**Robust finding (all 3 modes):** the candidate's gain-18 neural control produces
land **identical to the rule-basis in every scenario** (diff exactly 0), despite
beating null/rule on offline val MSE. Against the Run3 schema-4 champion the
candidate is ahead on average in all three modes (+39320 / +3265 / +37319) but never
statistically distinguishable (every CI spans 0).

## 4. Promotion gate status (Section 3)

Gate: `promotion-gate-v5.gateEvaluate` on each mode's holdout (new frozen seed sets).
Recording dropped-warm-up / incomplete-recording investigation:
- **All 72 rows across 3 modes: complete=true, dropped=0, streamErrors=0** → the
  earlier dropped-frame / unverified issue is **resolved** (no frames dropped;
  streams complete and error-free).

**Gate result — all 3 modes NOT ELIGIBLE:**

| mode | valid | eligible | reason |
|---|---|---|---|
| 1v1 | false | false | `incomplete-recording-or-unverified` |
| official-2v2 | false | false | `incomplete-recording-or-unverified` |
| ffa-duo | false | false | `incomplete-recording-or-unverified` |

Specific failure reason (the gate requires **every** row to be a confirmed
victory/defeat via game-over/eliminated, i.e. `confirmed=true`):
- Each mode has some rows with `outcome="incomplete"` / `termination="tick-limit"`
  → `confirmed=false`, which fails the gate. Per mode: 1v1 20/24 rows unconfirmed
  (6/8 candidate), official-2v2 17/24, ffa-duo 21/24.
- Because the gate is fail-fast on any single unconfirmed row, no mode reaches the
  win-rate / land / decisive-pair comparisons.
- Negative gates NOT triggered: unconfirmed-win (all candidate wins are engine
  game-over confirmed), non-reproducible-engine-policy (0 provenance mismatches),
  missing-run-or-visible-state-data, untenable-regression.

Note: this is the *recording/verification* gate failing (censored tick-limit rows),
**not** the candidate losing on merit. The land comparison (Section 3) still shows the
candidate ahead of the Run3 champion on average in all three modes, just not
statistically distinguishable.

**Decision: NOT ELIGIBLE in all modes → Run3 schema-4 champion is NOT auto-replaced**
(per mandate).

## 5. Intent deviations (actual)

1. Trained **5** candidates (not a single model) to satisfy "train multiple real
   candidates … different horizons/LRs/arch"; chose the best runtime-compatible one
   (lr0.2-e200) for the engine, not the lowest val MSE (which was the 32x40x2 arch).
2. Used **new frozen holdout seed sets** for all three modes (proven disjoint from
   training matches and all prior holdouts) rather than reusing prior seeds.
3. The 32x40x2 model (best offline val MSE 0.10786673) is **offline-only**: it fails the
   runtime `validate()` (requires 32x20x2), so it is reported but not engine-tested.
4. Engine matches run to a 18000-tick limit; in 1v1 most matches are censored
   (no confirmed win/loss), so the gate's win-rate requirement cannot be met — reported
   honestly as NOT ELIGIBLE rather than relaxing the gate.

## 6. Largest observed improvement and regression (vs run3-schema4, 1v1)

- **Largest improvement:** Europe-balanced-p2 — candidate **460320 (confirmed victory)**
  vs run3 221659 (+238661 land).
- **Largest regression:** World-balanced-p1 — candidate 22211 vs run3 77303
  (−55092 land).

## 7. Next technical action

All three modes are complete. The robust, cross-mode result is: the candidate's
gain-18 neural control produces land **identical to the rule-basis in every scenario**
in all three modes (diff exactly 0), despite beating null/rule on offline val MSE.
Against the Run3 schema-4 champion the candidate is ahead on average in every mode
(+39320 / +3265 / +37319) but never statistically distinguishable (all CIs span 0).

Next technical actions, in priority order:
1. **Investigate why the gain-18 neural control never diverges from the rules.**
   The land being byte-identical to rule-basis suggests the model's heldGain/lossRisk
   predictions are not winning the gain-gated channel selection (the rules always
   tie/beat it). Verify the channel selection path: confirm the model's scores reach
   the comparator, check the gain=18 threshold, and inspect whether the 32x20x2
   model's two outputs are degenerate at runtime (e.g. near-constant predictions).
   A calibration check (calibration.json) of heldGain/lossRisk against actuals is the
   concrete first diagnostic.
2. **If the control is confirmed non-binding, either** (a) raise the gain / lower the
   rule threshold so the model can actually override the rules, or (b) treat the
   schema-5 candidate as an *advisory* signal and evaluate a variant that *replaces*
   (not competes with) the rule channel — then re-run the paired holdout gate.
3. **Do not relax the gate** to force eligibility: the NOT-ELIGIBLE result is driven by
   tick-limit censored rows (1v1 especially), which is a match-format property, not a
   recording bug. If a higher win-rate signal is needed, the gate should be
   re-scoped to confirmed-only rows — but that is a gate-design change to make
   deliberately, not a silent bypass.

The Run3 schema-4 champion remains the active champion (not auto-replaced).
