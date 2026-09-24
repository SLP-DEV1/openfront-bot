# OpenFront Schema-5 v5rank — Model & File Audit (§2)

Campaign id: `openfront-neural-v5rank-20260924`
Purpose: develop an actually-smarter OpenFront bot on the **Schema-5 line**
(32×20×2-tanh, 702 weights, arch `32x20x2-tanh`), demonstrably beating the Run3
schema-4 champion in real pinned-engine matches. Run3 stays ACTIVE until an
explicit, gated promotion.

This document is the complete model/file audit (mandate §2). Every SHA below was
recomputed at audit time (2026-09-24) against the files on disk.

## 0. Provenance pins

| Artifact | Value | State |
|---|---|---|
| git HEAD (openfront) | `f480076d9ffaeecd1ee3b0ecc0795f0af8210bdf` | clean, in sync with origin/main |
| integrated ancestor | `850803f` "new" (adds v5-dataset.cjs + planning-frame wiring) | ancestor of main, not unpushed |
| backup branch | `backup/main-pre-integration-20260924` @ `59803c8` | safety reference |
| engine (OpenFrontIO) | `13b403387af01d388f8c8ed8c953b6d3a11d1457` | detached, clean |
| Impossible reference | `bb8af015b515b3b717bd4d901074c5f4c16641cb` | clean |

Untracked (preserved, not part of the change): `.tmp-*` files, and the
user-owned unstaged deletion of `plan.md`.

## 1. Schema-5 candidate models

All trained on dataset `tools/benchmark/v5full-v2/dataset.json`, deterministic
full-batch GD, Xavier init seed `0x2545F491`, per-match split 21 train / 7 val
→ 1035 train / 352 val samples.

| name | arch | weights | model SHA256 (prefix) | valMSE | status |
|---|---|---|---|---|---|
| lr0.1-e300-baseline | 32x20x2-tanh | 702 | `6ed491fa866ee14d…` | 0.11568991 | **byte-identical to frozen `trainer/candidate-v5-v2.json`** (liveDeployment:false) |
| lr0.05-e500 | 32x20x2-tanh | 702 | `ea31c730…` | 0.11725491 | offline |
| **lr0.2-e200** | 32x20x2-tanh | 702 | `5041e9aaeb3759be…` | **0.11307833** | **best runtime-compatible; engine-tested in prior campaign** |
| lr0.01-e1000 | 32x20x2-tanh | 702 | `d15ddd4d…` | 0.12465221 | offline |
| arch32x40x2-lr0.1-e300 | 32x40x2-tanh | 1402 | `ef28d5feb001…` | 0.10786673 | **best offline, runtime-incompatible** (validate() requires 32x20x2 / 702) |

Baseline references on the same 352-row val set:
- null (zero weights) MSE **0.23144517**
- fixed-rule MSE **0.21885130**
- mean-constant MSE **0.14570720**

All five candidates beat all three baselines on valMSE — but valMSE is a
**frame-level** regression metric and does not measure cross-candidate
discrimination (see `failure-analysis.json`, §3).

Frozen shadow candidate: `trainer/candidate-v5-v2.json`
(`6ed491fa866ee14d…`, 14320 B, candidateVersion
`schema5-v2-corrected-lr0.1-e300-xavier`, liveDeployment:false, frozen 2026-09-24).
It is the lr0.1-e300-baseline — **not** the engine-tested lr0.2-e200.

## 2. Schema-4 (Run3 champion line — ACTIVE)

| artifact | value |
|---|---|
| Run3 champion policy SHA256 | `e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968` |
| Run3 champion file SHA256 | `65589febcf8a376c9dbd0e895e4ce643d2591b1ac185270012e148a9315f7ff3` |
| byte-identical copies | `benchmark-results/overnight-20260924-v6/references/run3.json`; `docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json` |
| stageC official champion | policy `84d1f5930391…`, file `d2a5fce385fa…` |
| V7-mixed-public best V6 schema-4 (NOT promoted) | policy `4c5848c9b93a3923345c7525f28731e1de6f5595656a85ba530fd0c286bb8f52`, file `156b99c4da417cda30c0f29b93003158381299abecb4f94ad9cd48dec9a457a6` |

Schema-4 (`24x24x16-tanh`, 1000 weights, 16 output channels) only BIASES the rule
planners (additive/multiplicative neuralChannel + bounded neuralActionDelta);
it cannot emit an intent. This is the line the Schema-5 controller must beat.

## 3. Bots on disk

| role | file SHA256 (prefix) | bytes | note |
|---|---|---|---|
| Solo (rule-basis arm) | `3c149957793c88ad…` | 473125 | `OpenFront_Solo_AggroBot.user.js`, SHADOW_V5_BUNDLED_MODEL=null |
| Run3 live | `8de3b7098e027de6…` | 493341 | supersedes older V6-recorded `beb1ada0…` |
| Monitor | `c3151fa86d1f47ce…` | 2884 | `OpenFront_AggroBot_Monitor.user.js` |

## 4. Training dataset

- file: `tools/benchmark/v5full-v2/dataset.json`
- SHA256: `3ba5a4058a613f78a27259d632b88add1af757372193df9686170dcaedbe9ede` (2752411 B)
- kind `v5-real-dataset`, engine `13b40338…`, horizonTicks 600, landScale 800
- **28 matches** (`v5d-<map>/<difficulty>/<seed>`), frames every 100 ticks
- stats: 3958 rows, 1387 usable labels, 1555 observed / 2403 counterfactual
- outcomes: unknown 24, defeat 4 — **zero confirmed victories**
- kinds: naval 784, invest 1555, hold 1555, **expand 37, attack 27**
- labels are NOT stored; recomputed by `trainer/v5-labels.cjs buildLabels` at
  train time (frame-level heldGain/lossRisk — see failure-analysis §3).

## 5. Holdout seed namespaces already consumed (do NOT reuse for the fresh final holdout)

- `o7hold-0..7` (V6 final)
- all `holdout-1v1-*` / `holdout-ffa-*` / `holdout-official-*` (paired-holdout)
- paired-holdout dirs: paired-holdout-20260924-v5v2-{1v1,official-2v2,ffa-duo}[-frozen],
  -dry/-sample/-smoke, holdout-ffa-duo-v2[-run], v5full-{1v1,2v2,ffa},
  holdout-finalA/C/D
- training matchIds: 28 `v5d-*`
- `v6hold-*` prefix: confirmed absent in repo (grep 0 matches); avoided anyway.

## 6. Promotion status summary

- **ACTIVE champion: Run3 schema-4** (`e0fceaef90d5…` policy). Unchanged.
- Schema-5 candidate arm (lr0.2-e200, gain 18): prior 72 engine matches →
  endLand **exactly equal** to rule-basis in every scenario (diff 0), ahead of
  Run3 on average in all 3 modes but CIs span 0 → NOT distinguishable; gate
  NOT-ELIGIBLE (censored tick-limit rows). Run3 NOT auto-replaced.

See `failure-analysis.json` for the measured root cause of the identical-land
result.
