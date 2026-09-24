# §5 / §7 — Training report: from frame-level regression to a discriminative control ranker

Campaign: `openfront-neural-v5rank-20260924` · 2026-09-24 · pinned engine `13b40338…`

## The §3 root cause (why the old schema-5 arm did nothing)

`failure-analysis.json` measured the reason the prior schema-5 candidate was
**binding-identical to rule-basis**: the labels are **frame-level**. In a given
planning frame every candidate row shares the same visible state, so the
model predicts a **near-constant** `heldGain − lossRisk` across candidates in
that frame (measured cross-candidate score spread ≈ 0.116). The runtime
`--candidateGain 18` only re-orders a candidate when its score spread exceeds
the gap between rule utilities; a 0.116 spread is far smaller than those gaps,
so the model never changed a decision (prior campaign: endLand exactly equal to
rule-basis in every scenario).

## §4 — Data fix

The v5full-v2 dataset (28 matches, 3958 frames) had **zero confirmed
victories** (24 unknown / 4 defeat), so labels rarely saw a decisive horizon.
The §4 targeted curriculum added **34 real pinned-engine matches** (8807 frames)
to reach a combined **62 matches / 12765 frames** with **4 confirmed
victories** and broader opponent/mode coverage
(`data-audit.json`). The combined dataset is the training base for every
§5 arm.

## §5 — The iterative loop (train → analyze → improve)

Every arm below trains on the **combined** dataset with a **whole-match
split** (`sideOf(matchId, 21)` → a match is entirely train or entirely val;
854 train groups / 3483 held-out val groups, so the val numbers are
generalization estimates, not in-sample). No blind epoch increase: all
combined arms hold at epoch 400.

| arm (dir) | objective | arch | optimizer | valRankLoss | valCrossStd | decisionRate |
|---|---|---|---|---|---|---|
| M1 `v5rank-combined-lambda1-e400` | reg+rank λ=1 | 32x20x2 | full-batch | — | — | — |
| **M2** `v5rank-combined-noreg-e400` | **ranking-only** | 32x20x2 | full-batch Xavier `0x2545F491` | 0.854404 | 0.2121 | 0.029 |
| **arch-20-noreg** ← **winner** | **ranking-only** | 32x20x2 | **mini-batch SGD, bag 48** | **0.854404** | **0.5031** | **0.1796** |
| arch-40-noreg | ranking-only | 32x40x2 (1402) | mini-batch SGD, bag 48 | 0.910058 | — | 0.109 |

(`valRankLoss`/`valCrossStd` computed with the same tool on the held-out val
groups for both 32x20x2 arms; `decisionRate` = share of val frames where the
model's argmax departs from the rule-utility argmax, `meanStd` = mean
cross-candidate score std. 5000 val frames for the decision metrics.)

### What each iteration found

1. **Objective.** ranking-only (`noRegression`) is the right objective for a
   *control* ranker. The regression term calibrates `heldGain`/`lossRisk` to
   absolute horizon values but does nothing to spread candidates apart within a
   frame. M1 (reg+rank) carries the regression cost without decision benefit.
2. **Architecture.** 32x20x2 ≥ 32x40x2 on the ranking objective (valRankLoss
   0.854404 < 0.910058) and on offline decision departures (0.1796 > 0.109).
   32x40x2 (1402 weights) is the best-offline model of the prior *regression*
   line but is **runtime-incompatible**: `candidate-policy-v5.validate()` hard
   locks `arch==='32x20x2-tanh'` and `weights.length===702`. 32x40x2 therefore
   requires a *versioned* kernel to deploy; it is kept as a future candidate.
3. **Optimizer.** This is the decisive §5 discovery. M2 and arch-20 are the
   **same architecture and the same objective**, yet M2 (full-batch GD, Xavier
   init) reaches valRankLoss 0.854404 with cross-std **0.2121**, while arch-20
   (mini-batch SGD, bag 48, LCG init) reaches the **same** valRankLoss 0.854404
   with cross-std **0.5031** and decisionRate **0.1796 vs 0.029**. Mini-batch
   SGD escapes the near-constant solution that full-batch converges to: at
   equal ranking loss it produces a solution whose within-frame score spread is
   ~2.4× larger — which is exactly the property the gain-18 control gate
   needs to re-order candidates.

## The §5 candidate: `arch-20-noreg`

- arch `32x20x2-tanh`, 702 weights, **runtime-compatible**
- policySHA256 `16b686d291addf4e9c14c7c03e80308b6cb7474fd90dbd5efb60065c9a2b4f93`
- model SHA256 `a0bcf6439bee6274c17ef2101a8457b4bc89c1cd6af814cca0e96a90258f010f`
- objective ranking-only, epoch 400, lr 0.1, mini-batch bag 48, seed 1337
- canonical artifact: `candidate-model.json`

## Decisive technical bottleneck (named, with numbers)

The offline fix is real and measurable: the ranking objective + mini-batch SGD
raise the held-out cross-candidate score spread from ~0.116 (frame-level
regression) to **0.5031**, and the offline decision-departure rate from near 0
to **0.1796**. The remaining bottleneck is now **runtime, not training**:
whether the gain-18 control gate + safety gate actually let that 0.5031 spread
override the rule utilities in live engine matches, and whether the resulting
changed decisions translate into a decisive (confirmed) win rate that beats
both rule-basis and the Run3 schema-4 champion on a fresh holdout. That is what
§6 (decision-impact) and §8 (paired holdout) measure next. If the live
spread-vs-rule-gap margin is still too small, the next lever is the control
**gain** / safety-gate threshold, not more training.
