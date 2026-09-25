# §13 identical-seed comparison — verdict (campaign-v5finetune-20260925)

Date: 2026-09-25 (UTC) · Status: **§13 NOT PASSED — documented negative result**

Authoritative artifacts:
- `comparison-13/comparison.json` (generated 12:19:01Z)
- `holdout-13-d/holdout.json`, `holdout-13-baseline/holdout.json`
- `holdout-13-d-protocol/holdout.json` (pre-registered protocol)
- prior campaign: `../campaign-v5rank-20260924/s8-holdout-1v1/holdout.json`

## Result

Variant D (policySHA256 `2d7a6c57…`, arch `32x20x2-tanh`, kindBias wiring active)
was compared against the existing Schema-5 baseline (`16b686d2…`,
arch-20-noreg) on the same 8 pre-registered v5fh 1v1 scenarios
(World/Europe × balanced/rush × p1/p2, seeds verified identical to the
prior campaign).

**D is an exact tie with the baseline. D does not beat it. §13 fails.**

| comparison | land delta | win delta | decisive | verdict |
|---|---|---|---|---|
| D vs baseline | 0.0 in all 8 scenarios, CI [0, 0] | 0-0 (n=1) | 1 | exact tie |
| D vs rule-basis (within-run) | 0, CI [0, 0] | 0-0 | 1 | exact tie |
| D vs run3-schema4 (within-run) | +50430.5, CI [1479.8, 99381.2] | 0-0 | 1 | above run3, not distinguishable |
| baseline vs rule-basis | 0, CI [0, 0] | 0-0 | 1 | exact tie (control no-op) |
| baseline vs run3-schema4 | +50430.5, CI [1479.8, 99381.2] | 0-0 | 1 | above run3, not distinguishable |

- Only 1 of 8 scenarios ended in a confirmed game-over (World-balanced-p1:
  all arms defeat at 4067 land). The other 7 are tick-limited (18000) and
  censored, so land deltas are descriptive observations.
- Harness rule applied: `distinguishable = gatePasses && win.n >= 5 &&
  win.ciLow > 0` → false for every arm. "0/0 or not-distinguishable never
  promote."
- `gatesPass=false` for both runs: `incomplete-recording-or-unverified`
  (1v1 tick-limited rows) + `insufficient-decisive-pairs` (1 < minPairsPerCell 2
  in the World-balanced cell).

All 9 provenance/protocol checks in `comparison.json` pass, including:
protocol identity (d-run vs baseline-run vs prior campaign), row
verification, arm SHA integrity, D-run carries variant D, baseline-run
carries the prior baseline exactly, and the baseline no-op run reproduces
the prior campaign's candidate rows on every scenario (the new kindBias
wiring is behavior-preserving for models without `training.kindBias`).

## Root cause (verified on current on-disk data)

The candidate control is **active but behaviorally a no-op**:

1. **Byte-identical turn streams.** In every one of the 8 scenarios of
   both runs, the candidate arm's `turns.jsonl` is byte-identical to the
   rule-basis arm's (e.g. 6021/6021 lines, World-balanced-p1). The model
   never changes a single executed turn in either run.
2. **Disagreements occur where nothing is executable.** Across 1154
   decision frames per run, only 38 frames (3.3%) have any emitted action.
   Model top-1 ≠ rule top-1 in 41 frames (D run) / 60 frames (baseline run),
   but only 2 / 1 of those have an executable action. In 97% of planning
   frames there is no channel action at all — nothing for the control
   kernel to reorder.
3. **Control ceiling below typical rule gaps.** With `candidateGain=18` the
   score swing is ±36–72 utility units. Where actions do exist, the rule
   utility gap between the leading candidates exceeds that swing, so
   `round(utility + g*score)` never reorders the final choice. (Hard-flip
   gaps in the training data: p50 = 8, p90 = 48.)
4. **The model's scores are near-binary kind gates.** 98.8% of the 1064
   training-set model flips went to a LOWER rule-utility action (1051);
   naval ×1.61 / invest ×1.16 over-selection, hold ×0.23 under-selection
   (see `error-analysis.md`). The kindBias is verifiably live (e.g. an invest
   score of −1.2627 = base −0.3478 + bias 0.9148 in D-run ranked scores) but
   only rotates the kind ordering, which the ceiling in (3) absorbs.

This is a true negative result, not a harness artifact: deterministic
engine (pinned commit `13b40338…`), identical seeds, verified provenance,
and an independent no-op proof (baseline arm reproduces prior rows
exactly).

## Follow-up within budget: variant F

Per the error-analysis "Consequences for training" items 2–4, a combined
variant **F = B+C+D+E** (utility alignment + outcome-aware weighting +
kind bias + hard-negative boost) was added to
`trainer/train-v5fn-variants.cjs` and trained with the same hyperparameters
as A–E (200 epochs, lr 0.1, seed 1337; `variants/F/`, sha256 `923c43a2…`):

| metric (validation) | A | B | C | D | E | **F** | rule share |
|---|---|---|---|---|---|---|---|
| flipRate | 0.3269 | 0.3261 | 0.3261 | 0.3109 | 0.3262 | **0.3314** | — |
| flipToLowerRate | 0.8985 | 0.8695 | 0.9012 | 0.8478 | 0.9004 | **0.8234** | — |
| invest top-1 share | 0.6632 | 0.6648 | 0.6642 | 0.8329 | 0.6639 | **0.8704** | 0.616 |
| hold top-1 share | 0.0699 | 0.0699 | 0.0699 | 0.0000 | 0.0699 | **0.0000** | 0.2383 |
| naval top-1 share | 0.2341 | 0.2232 | 0.2341 | 0.1217 | 0.2341 | **0.0729** | 0.1457 |

F's learned kindBias: `{attack +0.886, expand +0.382, hold −0.800,
invest +0.181, naval −0.649}`. F improves flipToLowerRate (0.8478 →
0.8234) but remains invest-dominated and slightly higher in flipRate than
D. **Marginal, not breakthrough.** F does not earn a full §13 re-holdout
within the campaign budget: its behavioral no-op risk is unchanged (same
32-dim contract, same control ceiling), so a re-holdout would very likely
tie again at 0.0 land delta.

## Decision

- **Accept the documented negative result** for variant D's promotion.
  §13 stays pending until a candidate demonstrably beats the baseline on
  identical seeds; D (and F) do not qualify.
- The blocking issues are structural, not objective-tuning:
  1. **Feature gap:** the 32-dim contract carries kind one-hots only for
     attack/invest/naval (inputs 29–31). Hold and expand share an
     all-zero kind encoding, so the network cannot directly
     distinguish them. Fixing it requires a feature-contract + kernel +
     architecture change (next cycle).
  2. **Dataset:** 34757 rows are 97.3% invest/hold/naval (expand 786,
     attack 133 of 109 matches; 20 victories / 49 defeats / 40 unknown).
     Most frames are self-distilled from model-driven matches and there is
     no expansion-pressure data (error-analysis item 5).
  3. **Control ceiling:** gain 18 gives ±36–72 utility swing, below
     typical rule gaps — the model must beat the rule, not mirror it, yet
     every correction objective (including F) pushes it *toward* the rule,
     i.e. toward a no-op. A higher ceiling or a rank/gated control mode is
     the secondary lever (per mandate, not the primary one).
  4. **Holdout decisiveness:** 1v1 @18000 ticks yields 1/8 confirmed
     outcomes → 7 censored pairs. A valid §13 needs ≥5 decisive win pairs,
     so longer horizons or more decisive scenarios are required.

## Next-cycle plan (ordered)

1. Collect new data with expansion pressure (frames where expand is
   actually executed and rewarded/penalized).
2. Extend the feature contract with hold/expand kind one-hots (kernel +
   architecture change, new schema version).
3. Retrain with the F-style combined objective on the new dataset.
4. Cheap pre-screen: 1–2 engine matches per candidate; require visible
   turn-stream divergence from rule-basis in the predicted-positive
   direction before spending a full §13 holdout.
5. Full §13 identical-seed comparison vs the incumbent baseline
   (`16b686d2…`), with a protocol sized for ≥5 decisive pairs.
