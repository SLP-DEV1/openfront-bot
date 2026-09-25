# Schema-6 Failure Analysis — next structural bottleneck

**Result: SCHEMA-6 NEGATIVE RESULT (Category C).** No schema-6 model changes the
executed engine action. The next structural bottleneck is named below with
reproducible evidence.

## What was built and verified

- A clean, versioned **schema-6** model contract (38-dim, `FEATURED_SCHEMA_VERSION=3`):
  explicit per-kind one-hots for all six kinds at idx 29–34 (fixes Blocker A:
  hold/expand/support were previously all-zero-indistinguishable), plus three
  bounded rule-utility context features at idx 35–37
  (`candidateRuleUtility`, `utilityGapToRuleTop1`, `utilityGapToRuleTop2`).
  idx 0–28 are byte-identical to schema-5. See `feature-contract.json`.
- Train/runtime parity holds **by construction** (`v6-features.cjs`
  `assertFeatureParity`; the feature/validator/predict slice is inlined
  verbatim into the userscript and the build asserts byte-parity).
- 10 candidates trained (5 objectives × 2 archs), compared offline
  (`candidate-comparison.json`). Lead = **E_38x40x2tanh**
  (valRankLoss 0.4724, decisionAccuracy 0.8784, flipToLowerRate 0.0974).
- Runtime wiring confirmed end-to-end: model embeds (`candidateSchema:6`), v6
  feature path exercised, schema-aware evidence labels, fail-closed on unknown
  schema, userscript builds clean.

## The gate that failed

§15 turn-stream divergence pre-gate. The candidate must send **at least one
different, legal, non-cosmetic, model-caused action** vs rule-basis on identical
seeds.

**Result: 0 different turns in all 6 pairs** (`turn-divergence.json`).

| candidate | mode | seed | humans | turns diff | internal model≠rule | frames emitting an action |
|---|---|---|---|---|---|---|
| E (lead) | gated | 001 | 2 | 0/2000 | 0/163 | 4/163 |
| E (lead) | rank | 001 | 2 | 0/2000 | 0/163 | 4/163 |
| E (lead) | rank | 002 | 2 | 0/2000 | 0/165 | 1/165 |
| E (lead) | rank | 003 | 6 | 0/2000 | 30/165 | 2/165 |
| A (divergent) | rank | 001 | 2 | 0/2000 | 12/163 | 4/163 |
| A (divergent) | rank | 003 | 6 | 0/2000 | **148/165 (90%)** | 2/165 |

## Reproducible evidence for the bottleneck

1. **The most divergent model is also byte-identical.** A_38x40x2tanh disagrees
   with the rule in **148/165 (90%)** of planning frames, yet its `turns.jsonl`
   is byte-identical to rule-basis. If the candidate-order reordering were
   what moves the executed action, the 90%-divergent model would have produced
   differences. It did not. So the bottleneck is structural, not "the model
   didn't diverge enough."

2. **`changedIntent` ≠ executed turn.** In A seed-003, `changedIntent` fires in
   133/165 frames. At tick 1661 the model flips `hold→invest`
   (`finalChoice=invest`, `changedIntent=true`), but the **emitted** intent is a
   `build` action; at tick 1845 it is `alliance`. Neither matches the model's
   `invest` pick. The internal choice changed; the sent action did not.

3. **The gating layer is order-invariant.** The block reasons that decide
   whether an action is emitted are identical between candidate and baseline:
   146 "stabilize home/borders" + 17 "wait for reserve/growth" + 17
   "no-channel-action" (A seed-003 vs rule seed-003). The model's reordering
   never changes these.

4. **The model decides where almost nothing is decided.** Only **2/165
   (1.2%)** of sampled frames emit any action. In 88% of frames the director is
   "stabilizing home troops and borders," so no channel action is possible
   regardless of candidate order. The network is scored on candidate order but
   its effect is gated downstream of that order.

## The next structural bottleneck (named)

**The schema-6 model is wired to reorder the channel-director candidate list,
but the executed action is selected downstream by the director's
actionable / cooldown / budget / safety gating, which is invariant to candidate
order.** Reordering candidates that the director is about to filter out (or
filter identically) changes `finalChoice`/`changedIntent` (internal
bookkeeping) but not the emitted intent.

Concretely, two properties must both hold for a candidate ranker to have any
gameplay effect, and the current wiring satisfies neither:

- **(P1) The reordered candidate must survive the director's gating.** The
  director's "stabilize home / wait for reserve / no-channel-action" branches
  (88–95% of frames) emit no action independent of order. The model must
  influence *which* branch fires, not just the order within it.
- **(P2) The emitted action must actually differ.** Even in the frames that do
  emit (build/alliance), the emitted intent is re-derived independently of the
  model's candidate order.

**Direction for schema-7 (proposed, not built here):** control at the layer that
selects the *emitted* action — e.g. score the director's **action branches /
actionable candidates** (the set that can actually emit this tick), or gate the
"stabilize / wait / no-channel-action" branches directly, rather than reordering
the full candidate list before the director filters it. Equivalently: the model's
output should be a **per-branch override of the director's emit/no-emit
decision**, with the candidate order as a secondary input — not the primary
control signal.

## Why this is not a tuning problem

- Not a gain/mode problem: tested `gated` and `rank` modes, lead (E) and
  divergent (A) candidates — all byte-identical.
- Not a seed/density problem: tested 2-human and 6-human scenarios across 3
  seeds.
- Not a conservative-model problem: the 90%-divergent A model is equally
  byte-identical.
- Not a feature problem this round: the 38-dim contract is correct and
  train/runtime parity holds; the model *does* learn distinct per-kind
  preferences (kindSelection is spread, not degenerate). The features are
  scored at the wrong level of the decision pipeline.

## Reproduction

```
# full turn-divergence matrix + funnel (turns.jsonl diff + decision-frame stats)
node .tmp-prescreen-matrix.cjs
# per-pair turn diff
node .tmp-turn-diff.cjs <candidateDir> <baselineDir> [label]
# action-channel coverage (block-reason breakdown)
#   analyze .tmp-pres-*/match.json decisionFrames (see .tmp-prescreen-matrix.cjs)
```

Output dirs: `.tmp-pres-v6*` (lead E, gated/rank), `.tmp-pres-A-rank*`
(divergent A, rank), `.tmp-pres-rule*` (rule-basis baselines), all 2000 ticks,
engine `13b403387af01d388f8c8ed8c953b6d3a11d1457`.
