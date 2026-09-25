# Schema-6 Neural Model Contract — Final Report

**Result: SCHEMA-6 NEGATIVE RESULT (Category C).**

A new, cleanly-versioned **schema-6** neural model was built (not a schema-5
fine-tune), trained across two architectures, wired end-to-end, and run
autonomously through the §31 decision pipeline to a documented promotion
decision. **No schema-6 model changes the executed engine action.** The
ACTIVE champion — Run3 (schema-4) — is unchanged.

This is a **negative result with a named, evidenced structural bottleneck**,
which is the intended Category-C outcome the mission's §26/§31 framework
anticipates when the model's internal divergence does not translate into
executed-turn divergence.

---

## 1. What was built (Category C = the work succeeded, the model did not)

| Item | Result |
|---|---|
| Schema-6 contract | NEW — 38-dim, `FEATURED_SCHEMA_VERSION=3`, schema 6. idx 0–28 byte-identical to schema-5; idx 29–34 explicit per-kind one-hots (hold/invest/attack/expand/naval/support); idx 35–37 bounded rule-utility context (`candidateRuleUtility`, `utilityGapToRuleTop1`, `utilityGapToRuleTop2`). |
| Two architectures | `38x24x2-tanh` (986 w) and `38x40x2-tanh` (1642 w) — not a single capacity point. |
| Train/runtime parity | Holds **by construction** — `v6-features.cjs` `assertFeatureParity`, feature/validator/predict slice inlined verbatim into the userscript, build asserts byte-parity, `node tools/build-userscript.mjs` → 0 bytes missing. |
| Dataset | 5000 samples (4000 train / 1000 frozen holdout), 120 hard negatives, all v6 fields populated (`data-audit.json`). |
| Training | 10 candidates (5 objectives × 2 archs) trained; lead selected by offline comparison (`candidate-comparison.json`). |
| Runtime wiring | Model embeds (`candidateSchema:6`), v6 feature path exercised, schema-aware evidence labels, fail-closed on unknown schema. |

The §31 distinction the campaign had to test — **"Modellscore ≠ ausgeführte
Aktion"** — was confirmed literally in the engine.

## 2. Ordered gate status (§31)

| # | Gate | Status |
|---|---|---|
| 1 | git-status check | DONE (clean tree) |
| 2 | contract-audit | DONE (schema 6, FEATURED_SCHEMA_VERSION 3, parity verified) |
| 3 | schema-design | DONE (38-dim v6, 2 archs) |
| 4 | runtime-parity | DONE (build byte-parity; userscript builds clean) |
| 5 | dataset | DONE (5000 samples, 1000 frozen holdout, 120 hard negs) |
| 6 | training | DONE (10 candidates) |
| 7 | **Turn-Divergenz-Prescreen** | **DONE — FAILED (0/2000 in all 6 pairs)** |
| 8 | Dev-Evaluation | NOT REACHED (gate 7 failed first) |
| 9 | Final-Holdout | NOT REACHED (gate 7 failed first) |
| 10 | **Promotion-Entscheidung** | **DONE — Category C** (this report + `promotion-decision.json`) |

## 3. The decisive evidence (§15 pre-gate)

The candidate must send **at least one different, legal, non-cosmetic,
model-caused action** vs rule-basis on identical seeds. **It sent zero.**

| candidate | mode | seed | humans | turns diff | internal model≠rule | frames emitting an action |
|---|---|---|---|---|---|---|
| E (lead) | gated | 001 | 2 | 0/2000 | 0/163 | 4/163 |
| E (lead) | rank | 001 | 2 | 0/2000 | 0/163 | 4/163 |
| E (lead) | rank | 002 | 2 | 0/2000 | 0/165 | 1/165 |
| E (lead) | rank | 003 | 6 | 0/2000 | 30/165 | 2/165 |
| A (divergent) | rank | 001 | 2 | 0/2000 | 12/163 | 4/163 |
| A (divergent) | rank | 003 | 6 | 0/2000 | **148/165 (90%)** | 2/165 |

**The most-divergent model is the strongest evidence.** A_38x40x2tanh
(`a38d9870db5bad9e`) disagrees with the rule in **148/165 (90%)** of planning
frames and fires `changedIntent` in 133/165 — yet its `turns.jsonl` is
**byte-identical** to rule-basis. If candidate-order reordering were what moves
the executed action, the 90%-divergent model would have produced differences.
It did not. That rules out "the lead model was too conservative" and isolates a
structural cause.

**`changedIntent` ≠ executed turn.** A seed-003 tick 1661: model flips
`hold→invest` (`finalChoice=invest`, `changedIntent=true`), but the emitted
intent is a `build`; tick 1845 it is `alliance`. The internal choice changed; the
sent action did not.

**The gating layer is order-invariant.** The block reasons that decide whether
any action is emitted are identical between candidate and baseline
(`action-channel-coverage.json`): 146 "stabilize home/borders" + 17 "wait for
reserve/growth" + 17 "no-channel-action" in the A candidate **and** in the rule
baseline. Only 2/165 (1.2%) of sampled frames emit any action at all.

## 4. Next structural bottleneck (named)

> The schema-6 model is wired to **reorder the channel-director candidate
> list**, but the **executed action is selected downstream** by the director's
> actionable / cooldown / budget / safety gating, which is **invariant to
> candidate order**. Reordering candidates the director filters out (or filters
> identically) changes `finalChoice`/`changedIntent` (internal bookkeeping)
> but not the emitted intent.

Two properties must both hold for a candidate ranker to have any gameplay
effect; the current wiring satisfies **neither**:

- **(P1) The reordered candidate must survive the director's gating.** The
  "stabilize home / wait for reserve / no-channel-action" branches (88–95% of
  frames) emit no action independent of order. The model must influence *which
  branch fires*, not just the order within it.
- **(P2) The emitted action must actually differ.** Even in frames that do emit
  (build/alliance), the emitted intent is re-derived independently of the
  model's candidate order.

**Schema-7 direction (proposed, not built here):** score the director's
**action branches / actionable candidates** (the set that can actually emit
this tick), or gate the "stabilize / wait / no-channel-action" branches
directly. Equivalently: the model output should be a **per-branch override of
the director's emit/no-emit decision**, with candidate order as a secondary —
not primary — control signal.

## 5. Why this is not a tuning problem

- **Gain/mode:** tested `gated` and `rank`; lead (E) and divergent (A) — all byte-identical.
- **Seed/density:** 2- and 6-human across 3 seeds — all byte-identical.
- **Conservativeness:** the 90%-divergent A model is equally byte-identical.
- **Features:** the 38-dim contract is correct, parity holds, and the model
  learns distinct per-kind preferences (lead E `kindSelection`: invest 0.5567 /
  naval 0.231 / hold 0.2123 — spread, not degenerate). The features are scored
  at the **wrong level of the decision pipeline**, not the wrong features.

## 6. Promotion decision (§22)

| Category | Verdict |
|---|---|
| A — Promotion-Eligible | No — §15 pre-gate failed; no decisive executed-turn divergence vs Rule-Basis/Run3. |
| B — Improved Candidate | No — dev/holdout metrics not reached; and turns are byte-identical, so "turns differ" is false. |
| **C — Negative Result** | **Yes** — no live improvement; next structural bottleneck named with reproducible evidence. |

**Run3 (schema-4) remains ACTIVE.** Not auto-promoted (that is a separate
manual §26 step), and not demoted. The schema-5 baseline (`16b686d291…`) was not
run because the §15 pre-gate failed first, preserving the frozen holdout
budget (`wastedHoldoutPrevented: true`).

## 7. Reproduction

```
# full turn-divergence matrix + decision-frame funnel (turns.jsonl diff + stats)
node .tmp-prescreen-matrix.cjs
# per-pair turn diff
node .tmp-turn-diff.cjs <candidateDir> <baselineDir> [label]
# build + unit tests
node tools/build-userscript.mjs && node --test tests/
```

- Engine: `13b403387af01d388f8c8ed8c953b6d3a11d1457`, storage `of-solo-aggrobot-v1111`, 2000 ticks.
- Lead model (E_38x40x2tanh) canonical sha256: `33d716ff0c763d1ea8706193f06742d525f13c83a9fa4a06377e32eab58930bd`
- Divergent model (A_38x40x2tanh) canonical sha256: `8b97ba6e67ce59219d394e41dd7d0dc61e784bb27d2cdee34b7e333b9ee0b45f`
  (canonical = `candidate-policy-v6.sha` over `{schema,arch,outputs,weights}`, the slice the runtime embeds)
- Schema-5 baseline sha256: `16b686d291addf4e9c14c7c03e80308b6cb7474fd90dbd5efb60065c9a2b4f93` (not run)
- Campaign files committed under `trainer/campaign-schema6-20260925/` (see `git log`).

## 8. Artifacts (`trainer/campaign-schema6-20260925/`)

| File | Status |
|---|---|
| feature-contract.md / .json | done |
| data-audit.json | done (5000 samples, 1000 holdout, 120 hard negs) |
| dataset-manifest.json | done |
| action-channel-coverage.json | done (block-reason breakdown) |
| hard-negatives.json | done |
| training-manifest.json | done (10 candidates) |
| candidate-comparison.json | done (lead E selected) |
| turn-divergence.json | done (0/2000 in all 6 pairs → FAIL) |
| engine-prescreen.json | done (ABORT per §29) |
| holdout-protocol.json | done (defined, not run) |
| holdout-results.json | done (not-reached) |
| promotion-decision.json | done (Category C) |
| failure-analysis.md | done (next bottleneck + P1/P2) |
| candidate-model.json | done (canonical lead E_38x40x2tanh) |
| final-report.md | this file |
