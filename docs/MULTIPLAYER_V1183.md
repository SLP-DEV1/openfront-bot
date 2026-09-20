# AggroBot 1.18.3 — Public/Private risk & training scenarios

This document reconciles the 20 September 2026 audit written against local 1.18.0
with the repository's 1.18.2 baseline. Old audit line numbers and its 1.15.0
Singleplayer diagnosis are not evidence that the current revision still has
all the same defects. This change set is incremental, not a rewrite.

## Implemented

- Public/Private front memory observes **actual incoming hostile attacks**.
  Peaceful neighbors alone do not create a persistent hostile history.
  Singleplayer/Impossible retains its established heuristic; optional
  experimental Impossible ratios were not silently promoted.
- A shared fresh-state multiplayer reserve check is used before major land
  and player-transport commitments and before team troop donations. A legal
  worker response still requires a second alliance, ownership, target and
  troop check; none of these calculations can authorize an illegal intent.
- `attack_alternatives` periodically reports the best eligible land targets,
  bounded rejected examples and grouped rejection causes. Intent events
  record the remaining home troops and reserve; the diagnostic export includes
  limited front history. Worker non-offers do not become invented legal facts.
- Team troop help ranks partners by **incoming troops divided by own troops**,
  rather than choosing the largest raw incoming stack first.
- `trainer/train.mjs --bots 0,4` evaluates fixed mixtures of official Nation
  opponents and native OpenFront tribe bots using disjoint paired seeds.
  Each result and evaluation signature includes the native-tribe count;
  mixed populations are not mislabeled as humans.

## Not implemented / not established by these tests

- An official-engine local match with native tribes is **not** a match
  against a person. The existing runner is still Singleplayer FFA, and it
  does not simulate public human lobbies, live diplomacy, team donations or
  adversarial human behavioral profiles. Do not train or publish a
  “human-multiplayer champion” based on this harness alone.
- The audit's larger plans for a multi-client GameView runner, scripted
  human-like rival agents, controlled Team/FFA tournaments, peace negotiation,
  operation-specific war goals, long multi-window opponent memory and
  post-landing occupation tracking require separate implementation and tests.
- A pass in CI is not an observed victory in Impossible or Public.

## Native tribe + Nation training

The old `--bots 0` default is unchanged. To include both pure Nation
matches and mixed native-bot matches, use (with the correctly pinned,
locally installed engine):

```powershell
node trainer/train.mjs `
  --schema 4 `
  --engine ../OpenFrontIO `
  --engineCommit bb8af015b515b3b717bd4d901074c5f4c16641cb `
  --difficulty Impossible `
  --maps World,Europe `
  --nations 1,4 `
  --bots 0,4 `
  --generations 3 --population 4 --trainSeeds 2 --evalSeeds 4 `
  --ticks 18000 --parallel 4 `
  --out benchmark-results/v1183-mixed-unique-run
```

These settings schedule **432** full-engine match attempts (2 maps × 2 nation
counts × 2 tribe counts × [2 training seeds × 5 models + 4 holdout seeds ×
2 models] × 3 generations). Never reuse an existing `--out` directory.
Completed paired holdouts, not unverified timeouts, determine model promotion.
The native-tribe integration smoke uses the pinned official engine and
verifies that a game actually spawned without execution errors.
