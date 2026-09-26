# Schema-7 Overnight Campaign — Final Report

Campaign: `campaign-schema7-overnight-20260925`
Engine: `13b403387af01d388f8c8ed8c953b6d3a11d1457` (pinned, clean checkout)
Bot: `OpenFront_Solo_AggroBot.user.js` (SHA f4cb96afafb3)
Map/size/difficulty: World / Compact / Medium, FFA, 40 bots, 0 scripted humans, autonomous profile, balanced opponents, 9000-tick limit.
Dev seeds: `aggro-train-001`, `aggro-train-002`.

## Pipeline status (plan.md §19–§46)

| § | Step | Status |
|---|------|--------|
| 19 | On-policy branch dataset | DONE (dataset.json, 37.8 MB, dataset SHA d3d52d16…) |
| 24/25 | Train 10 variants (A–E × 24/40) | DONE (models/{A,B,C,D,E}-{24,40}) |
| 26 | Pre-gate: schema-7 vs rule, identical seed | **PASSED** |
| 28 | Branch funnel (model-caused) | **PASSED** |
| 27 | turn-divergence.json causality chain | **DONE** (turn-divergence.json) |
| 35 | Dev comparison vs rule/schema-5/schema-6/run3 | DONE (dev-comparison.json) |
| 38/39 | Final holdout | **SKIPPED** — gate failed (see below) |
| 45 | Promotion decision | **Category C — NEGATIVE RESULT** |
| 46 | Commit + push | this commit |

## §26 Pre-gate — PASSED

Requirement (plan.md 781–820): before any longer holdout, schema-7 vs rule on an
identical seed must give `differentExecutedTurns > 0` with differences that are
legal, model-caused, non-cosmetic, and engine-confirmed.

Arm: D-24 (schema-7, `actionControl=true`) vs rule-basis, seed `aggro-train-002`.

- `differentExecutedTurns` = **201** (> 0).
- **model-caused**: the schema-7 argmax changes the emitted intent (branch funnel
  `controlActive` + model top ≠ rule top on the divergent turns).
- **non-cosmetic**: 198/201 are kind-level (action-type) differences, not ordering.
- **legal + engine-confirmed**: engine ran clean to the 9000-tick limit; the D-24
  intents are the emitted, processed intents (turns.jsonl).

## §27 Turn divergence — DONE

`turn-divergence.json` records the causality chain: 201 diverging turns, 198
kind-level, with per-turn model branch decision (nearest planning frame), the
model/rule top branch, branch score, and held-land delta at +100/+300 ticks.
Final land on seed 002: D-24 = 49169, rule = 76036.

## §28 Branch funnel — PASSED

The funnel (`--planningFrames true`) confirms the differences are
model-caused and engine-confirmed: on the divergent turns the schema-7 argmax
overrides the rule's channel/target order and the engine processes the
model-emitted intent. `differentEmittedActions` (channel-level override counter)
is 0 on this seed because the override changes the dispatch *order*, which the
engine-confirmed turn-level diff captures; the turn-level `differentExecutedTurns`
(201) is the authoritative §26 gate metric.

## §35 Dev comparison

Champion bar = Rule-Basis + Run3 (the better of the two per seed).
See `dev-comparison.json` for the full table (lands, diff-vs-rule, policy SHAs).

| Arm (schema) | seed 001 land | seed 002 land | diff vs rule |
|--------------|--------------|--------------|--------------|
| Rule-basis | 55607 | 76036 | — |
| Run3 (4) | 37696 | 16625 (game-over) | 230 / 174 |
| Schema-5 baseline (5) | 55607 | 76036 | 0 / 0 |
| Schema-6 lead (6) | 55607 | 76036 | 0 / 0 |
| **Schema-7 D-24 (7)** | **55607** (equal) | **49169** (worse) | 0 / 201 |

Schema-5 and Schema-6 (previous-generation candidates, run with
`candidateControl=true` and confirmed active via `benchmarkMeta.candidateControl`)
produce **byte-identical** trajectories to the rule-basis on both dev seeds
(0 divergent turns, same land) — the shadow model's override never changes the
emitted intent. So across all four prior schemas/arms, only **Run3** (schema-4)
and **Schema-7 D-24** diverge from the rule.

Best/most-divergent trained schema-7 = **D-24** (the only trained variant with
meaningful divergence: 201 divergent turns on seed 002). It is byte-identical to
rule on seed 001 (equal land) and worse on seed 002 (49169 < 76036). It does **not**
beat the rule-basis champion bar on dev.

Supporting mechanism proof (not one of the 10 trained variants): the synthetic
`navaltest` schema-7 model (hand-crafted weights preferring boat/warship) diverges
on 164 turns and is *better* than rule on seed 001 (58537 > 55607). This shows the
schema-7 mechanism *can* produce a better outcome, but the trained variants did not.

## §38 Holdout gate — FAILED (holdout skipped)

The §38 gate requires ALL of: Turn divergence PASS, Gameplay Dev PASS, Safety
PASS, and **Schema7 > Rule on Dev** (new seeds). Safety PASS (clean tick-limit
termination, no crashes). Turn divergence PASS. But **Schema7 > Rule on Dev is NOT
met** (D-24 is equal on 001, worse on 002). Therefore the final holdout (§38/§39)
is **not** started; the verdict rests on the dev evidence.

## §45 Decision — Category C (NEGATIVE RESULT)

Criteria:
- A (promotion-eligible): different engine actions + better dev + beats rule AND
  run3 in final holdout + safety. — D-24 is not better on dev; holdout not run.
- B (improved candidate): different engine actions + measurably *better* gameplay
  effect. — D-24's effect is measurable (201 divergent turns, different land) but
  not *better* (equal/worse on dev).
- **C (negative result): action-level control produces no robust advantage; next
  bottleneck reproducibly proven. — D-24 produces different, model-caused engine
  actions (201 turns, confirmed) but no robust advantage on dev (equal on 001,
  worse on 002). The other 9 trained variants are byte-identical to rule (0
  divergent turns) — the model's argmax matches the rule's choice.**

Verdict: **Category C.**

### Why (root cause, reproducible)

1. The schema-7 controller works *mechanically*: with a model that prefers a
   different action (D-24, navaltest), it drives a different, legal, engine-
   confirmed engine action. The plumbing (post-hard-safety, pre-`send`, argmax →
   `send(kind,args)`) is sound.
2. But the 10 *trained* variants do not learn a better policy than the rule:
   - 9 of 10 converge to the rule (byte-identical on the dev seeds) — the
     training signal rewards imitating the rule's dispatch order.
   - The most divergent (D-24, hard-negative/override) diverges (201 turns) but
     ends *worse* on the divergent seed (49169 vs 76036) — the override changes
     the dispatch order without improving the outcome.
3. The synthetic navaltest proves a schema-7 model *can* beat the rule when its
   weights encode a genuinely different (better) preference — but that
   preference was hand-crafted, not learned by the campaign's training.

### Next bottleneck (reproducibly proven)

The next bottleneck is the **training signal / model quality**, not the
controller: the model must learn to pick actions that *improve* the outcome, not
merely *differ* from the rule. The campaign's on-policy branch dataset labels the
branch by the rule's dispatch order, so the trained model imitates the rule (9/10
byte-identical) rather than finding a better branch. A future campaign needs a
reward/label that measures *outcome improvement* (e.g. counterfactual land
delta), not just branch identity.

## Artifacts

- `dataset.json` — on-policy branch dataset (committed earlier).
- `models/{A,B,C,D,E}-{24,40}/` — 10 trained variants (model + training + evaluation).
- `models/navaltest/` — synthetic mechanism-proof model.
- `turn-divergence.json` — §27 causality chain (201 divergent turns, seed 002).
- `dev-comparison.json` — §35 table (lands, diff-vs-rule, policy SHAs, settings).
- `final-report.md` — this report.

Raw deterministic runs (not committed, reproducible via models + engine + settings):
`benchmark-results/pgate-{rule,rule-002,D24,D24-002,run3-001,run3-002,s5-001,s5-002,
s6-001,s6-002}` and `pgate-D24-002-pf` (planning frames).
