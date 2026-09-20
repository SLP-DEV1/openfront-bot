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
  Each result and evaluation signature includes the native-tribe count.
- The optional `--rivals rush,economy` launches **scripted local clients**
  with separate official GameViews; their spawn/attack/build commands go
  through the same stamped engine-intent validation. Available profiles:
  `rush`, `economy`, `defense`, `opportunist` (up to four, no repeats).
  Holdouts also check the exact scripted-rival mix. Their in-game type is
  Human because they are client-controlled, but there is **no person** behind
  these reproducible scripts.

## Not implemented / not established by these tests

- An official-engine local match with native tribes is **not** a match
  against a person. The existing runner is still Singleplayer FFA, and it
  does not simulate public human lobbies, live diplomacy, team donations or
  adversarial human behavioral profiles. Do not train or publish a
  “human-multiplayer champion” based on this harness alone.
- This is a first, deliberately simple multi-client GameView runner,
  **not** a full approximation of skilled human behavior. Scripted clients
  use basic fixed strategies and the test remains Singleplayer FFA. Controlled
  Team/FFA tournaments with donations, peace negotiation, operation-specific
  war goals, long multi-window opponent memory and post-landing occupation
  tracking require additional implementation and full-browser tests.
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
2 models] × 3 generations). To add two fixed scripted rivals to every one
of these scenarios, pass `--rivals rush,economy`; use a **new** output folder.
Completed paired holdouts, not unverified timeouts, determine model promotion.
The native-tribe and scripted-client integration smokes use the pinned
official engine and verify a game actually spawned without execution errors.
Neither smoke measures real Public-Medium win rate.
