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
