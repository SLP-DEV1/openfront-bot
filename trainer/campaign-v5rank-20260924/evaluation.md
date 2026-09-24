# §10 — Evaluation: is the Schema-5 candidate actually smarter?

Campaign: `openfront-neural-v5rank-20260924` · 2026-09-24 · pinned engine `13b40338…`

## Verdict

**The Schema-5 line is genuinely improved offline, but it is NOT yet demonstrably
smarter than rule-basis or the Run3 schema-4 champion in live play.** The
Run3 schema-4 champion remains **ACTIVE**. The candidate `arch-20-noreg` is the
best fully-checked Schema-5 artifact and is delivered as the improved schema-5
line, with the decisive bottleneck named below.

## The best fully-checked candidate

- `arch-20-noreg` — arch `32x20x2-tanh`, 702 weights, **runtime-compatible**.
- model SHA256 `a0bcf6439bee6274c17ef2101a8457b4bc89c1cd6af814cca0e96a90258f010f`,
  policy SHA256 `16b686d291addf4e9c14c7c03e80308b6cb7474fd90dbd5efb60065c9a2b4f93`.
- ranking-only objective, whole-match split, mini-batch SGD (bag 48, seed 1337), epoch 400.
- On the held-out val groups it is a clear improvement over the full-batch M2:
  same valRankLoss (0.854404) but **2.4× the within-frame score spread**
  (0.5031 vs 0.2121) and **6× the offline decision rate** (0.1796 vs 0.029).
  It also beats 32x40x2 on valRankLoss (0.854404 < 0.910058) and is the only
  runtime-compatible winner.

## Why it does not yet beat the baselines (the decisive bottleneck)

**The bottleneck is the offline→live *binding* gap, not training.** The model
learns a discriminative within-frame ordering (spread 0.5031, offline decision
rate 0.1796), but the **live gain-18 control gate + safety gate admit only ~2%
of those changes, and the admitted changes are land-neutral.** Measured:

| measurement | value | source |
|---|---|---|
| offline within-frame decision rate (val) | **0.1796** | training-manifest |
| live changedRate (12 scenarios) | **0.0201** (~9× lower) | decision-impact.json |
| schema-5 endLand == rule-basis endLand | **12/12 scenarios, delta exactly 0** | decision-impact.json |
| candidate land CI vs rule-basis (1v1) | **[0,0]** (identical) | s8-holdout-1v1 |
| candidate land CI vs rule-basis (2v2) | **[0,0]** (identical) | s8-holdout-2v2 |
| candidate land CI vs rule-basis (ffa) | **[0,0]** (identical) | s8-holdout-ffa |

The `endLand == rule-basis` in **every** scenario and pair is the load-bearing
fact: even where the model changed up to 14 decision frames (7.8% of a match),
the match trajectory and end land are unchanged. The changed picks are
land-neutral (different action id, same end land), so the model is
**non-binding live** — the same signature §3 identified for the frame-level
regression arm, now quantified for the improved ranker.

## Mode-by-mode holdout (fresh v5fh seeds, 24 matches each, paired, 95% CI)

| mode | eligible | gate | vs rule-basis (land) | vs Run3 (land) |
|---|---|---|---|---|
| 1v1 | **no** | invalid: incomplete-recording (7/8 tick-censored) | [0,0] identical | [1479.8, 99381.2] mean +50430 (higher; win n=1) |
| official-2v2 | **no** | invalid: incomplete-recording + insufficient-decisive-pairs | [0,0] identical | [-41872.5, 44568.8] mean +1348 (spans 0) |
| ffa-duo | **no** | invalid: incomplete-recording + insufficient-decisive-pairs | [0,0] identical | [-94363.0, 21426.5] mean -36468 (spans 0) |

In no mode is the paired **win** advantage over both baselines distinguishable
from 0 (win CI [0,0] or n=1). Versus Run3 the land signal is mixed and
inconclusive (higher in 1v1, neutral-to-lower in 2v2/ffa), and the strict
paired gate returns `valid=false` in all three modes because these modes
produce tick-limit-censored matches (the candidate never wins a *decisive*
enough margin to clear the gate). 0/0 and not-distinguishable never promote.

## What was fixed and what remains

**Fixed (offline, reproducible):** §3 root cause (frame-level labels →
near-constant score) is corrected by candidate-group ranking + whole-match
split + the ranking-only objective + mini-batch SGD. The held-out within-frame
spread rises from ~0.116 (regression) to **0.5031**, and the offline decision
rate from ~0 to **0.1796**. This is a real, measured improvement.

**Remaining (live):** the spread must survive the **gain-18 control gate +
safety gate** and produce *land-moving* decisions that convert into a decisive
win rate. Today it does not. **The next lever is the control gain / safety-gate
threshold and the score→utility calibration, not more training.** A targeted
per-frame study of (live rule-utility gap) vs (model score spread) at gain 18
will say exactly how much gain (or how much calibration) is needed to make the
0.5031 spread binding — that is the smallest decisive next experiment.

## Reproduction

- §5 training: `node trainer/train-v5rank-arch.cjs` (arch-20-noreg / arch-40-noreg); held-out metrics in `training-manifest.json`.
- §6 decision impact: `node tools/benchmark/v5-decision-capture.cjs --arms rule-basis,run3-schema4,schema-5,hybrid ...` then `node tools/benchmark/v5-decision-impact.cjs --out .../s6-decision-capture`.
- §8 holdout: `node tools/benchmark/paired-holdout.cjs --mode <1v1|official-2v2|ffa-duo> --arms rule-basis,run3-schema4,candidate --pairs 2 --gain 18` (v5fh seeds).
- All hashes, seeds, and per-match rows are in the campaign folder; see `holdout-manifest.json`, `promotion-decision.json`, and the three `s8-holdout-*/holdout.json`.
