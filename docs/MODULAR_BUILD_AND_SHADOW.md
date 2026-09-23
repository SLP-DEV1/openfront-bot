# Deterministic userscript source / module workflow (#121)

The canonical Solo userscript source is split at **top-level function
boundaries** into six `src/userscript/*.js` sections. Their concatenation is
byte-identical to the installed
`OpenFront_Solo_AggroBot.user.js`, except that two side-effect-free panel
selectors are inlined from the directly importable
`src/runtime/panel-state.cjs`. There is no new browser network dependency,
module loader or changed event timing. This is a behavior-preserving **first
modularization stage**, not a claim that every military, naval and economic
closure is already independently importable: much of that logic still shares
the userscript IIFE state.

```sh
node tools/build-userscript.cjs --check
node tools/build-userscript.cjs --write
node tools/build-run3-bundle.cjs --write
node tools/build-run3-bundle.cjs --check
node tests/modular-build-regression.cjs
```

Change the canonical `src/userscript/*.js` sections and/or
`src/runtime/panel-state.cjs` **first**, then explicitly regenerate both
delivered userscripts. A check-only run fails on mismatched bytes or an
out-of-sync embedded schema-5 ranker. The Run3 builder embeds only the
already reviewed **schema-4 champion**; shadow-v5 uses an independent,
opt-in deployment and cannot supersede it.

Source-map markers for the six chunks are intentionally omitted from
distributed code, so the complete generated userscript is **byte-for-byte
identical** to the previous stable version when its source contents are
unchanged. Userscript sections currently share lexical state inside one IIFE.
Further fine-grained exports of `military`, `economy`, `naval`,
`duo`, and `neural` require their dependencies to be passed explicitly;
doing that without regression and gameplay comparison would change semantics.

## V5 shadow candidate

A v5 model remains evaluation-only and cannot be bundled by
`trainer/deploy.mjs`. For *separate* observer-only tests:

```sh
node trainer/shadow-deploy.mjs --model candidate-v5.json \
  --source OpenFront_AggroBot_Impossible_Run3.user.js \
  --out OpenFront_Experimental_Shadow.user.js
```

Install **only** that generated userscript (disable all other AggroBot
scripts); then turn **Schema-5 Shadow AN** on. Without an explicitly
provided valid v5 model the switch logs nothing. It reranks only the
already-computed, bounded planning candidates. It does not alter the
existing rule-ranked plan, outgoing intent, reserve, economy spend,
diplomacy, legal worker checks or schema-4 champion. The diagnostics
report `wouldPrefer`, observed rule choice and `changedIntent:false`.
This is **not** a promotion gate or evidence of improved play.

## V5 bounded candidate control (P5)

P5 adds a **bounded** control arm on top of the shadow scorer, selected
per-run (it is *not* a default and does not replace the schema-4 champion).
The engine harness (`tools/benchmark/engine-match.mjs`) or a userscript can
set, in the `of-solo-aggrobot-v1111` store:

- `shadowRankEnabled:true` — the schema-5 ranker scores every bounded
  candidate (identical in both modes below).
- `candidateControlEnabled:true` — **only** when this is `true`, each
  candidate's utility is shifted by `gain * score` where `gain` is clamped
  to `[0, 60]` (default 18) and the candidate list is re-sorted, so the model
  can drive the channel director. Downstream legality (director + planners)
  remains authoritative in every case.
- `candidateControlEnabled:false` (the shadow default) — the model only
  observes; `changedIntent` is provably `false` because it is defined as
  `controlActive && selected?.id !== ruleChoice` with `controlActive` false.
  Its output is never read by any intent, budget, reserve, legality or
  target selector.

With control on, `changedIntent` is `true` exactly when the re-ranking
changes the pick (`selected` differs from the pure-rule choice); otherwise
the model agrees with the rule ranking. Both arms are compared on the **same
bot code** in the P5 paired holdout
(`tools/benchmark/paired-holdout.cjs`), where the candidate arm's bot SHA
reflects the schema-5 model embedded into the source exactly as the harness
embeds it.
