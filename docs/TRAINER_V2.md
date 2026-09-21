# Neural Trainer v2 (restored)

The current default `trainer/train.mjs` uses `trainer/reward.cjs` version
`strategic-held-land-v2` to **search for candidates** and
`trainer/evaluation-v2.cjs` to decide whether a candidate may replace a
champion. The archived `evaluation.cjs` remains available for historical
runs but is no longer the trainer default.

## What the search reward measures

The reward uses visible `trajectory.summary.meanLand` (held territory),
final land, retention and lost-from-peak, plus *recorded* territory receipts,
confirmed building count and observed gold income. Attack commands, naval
intentions and neutral landings are **not** counted as conquered enemy land.
The receipt/build/income terms are small proxies, not a proof of causal
strategy success. Outcomes dominate bounded strategic progress:
**confirmed victory > verified censored tick-limit > confirmed defeat >
invalid match**. A tick-limit never counts as a win.

This implementation reconstructs the v2 design from the September 21
training report; it cannot be verified as byte-identical to the earlier
uncommitted reward code, which was lost in a parallel workspace reset.
Do not compare old and new raw training scores as though their definitions
were identical.

## Promotion and provenance

Training rows and the plan identify `rewardVersion`; `plan.json` also
records `promotionGate: evaluation-v2` and pins the bot SHA/engine commit.
Candidate search runs use `train-*` seeds; paired independent holdout uses
`eval-*` seeds. Only verified, valid and matched outcomes are admitted.
A victory advantage permits **bounded** per-seed regression under v2;
equal-win promotion still requires repeatable improvement with **zero**
per-seed regressions. The output also reports
`decisionRoundNeeded` for ambiguous comparisons; it is advisory and does
not automatically run an extra round.

This is a trainer change, **not** a champion promotion. It neither modifies
the current live Run-3 userscript nor re-evaluates the local provisional
models. Training against the official engine still requires a local clean,
pinned engine checkout.

Validate without running engine matches:

```powershell
node --check trainer/train.mjs
node tests/neural-regression.cjs
node tests/neural-v2-regression.cjs
node trainer/train.mjs --dryRun true --schema 4
```
