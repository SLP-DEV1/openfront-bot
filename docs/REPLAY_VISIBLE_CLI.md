# Replay visible-state CLI (issue #121)

`tools/benchmark/replay-cli.cjs` **does not infer a player's observations
from an omniscient raw replay**. It imports a *pre-extracted* visible
GameView decision-frame file only. Extraction must happen against the exact
official engine revision and the specific player's view, with an independently
auditable extraction log. The current CLI checks the supplied provenance and
completeness declaration; it **cannot independently verify** that a
third-party file was genuinely produced by OpenFront or contains no hidden
knowledge. Do not treat the result as authenticated training evidence without
checking the original extraction and replay artifacts.

Input is a JSON object:

```json
{
  "format": "openfront-visible-gameview-v1",
  "complete": true,
  "visibility": "player-view",
  "engineCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "matchId": "original-public-match-id",
  "frames": [
    {
      "source": "GameView",
      "engineCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "matchId": "original-public-match-id",
      "tick": 120,
      "visibleState": {
        "home": 1000,
        "gold": 50000,
        "land": 200,
        "incoming": 0,
        "committed": 150
      },
      "action": {"type": "attack"}
    }
  ]
}
```

Run:

```sh
node tools/benchmark/replay-cli.cjs \
  --input visible-extraction.json --out decision-frames.json \
  --engineCommit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

All frames must carry identical engine and match IDs, a strictly increasing
tick, required non-negative visible observations and an observed action;
the complete file must explicitly declare `complete:true`. A missing or
invalid frame rejects the **entire** export without writing an output.
Unobserved outcomes are `null`, never invented losses or victories.
Raw OpenFront JSON files or unverifiable extractions are explicitly rejected.

## Liga-Smoke

```sh
node tools/benchmark/league.cjs --smoke --engine ../OpenFrontIO \
  --engineCommit 13b403387af01d388f8c8ed8c953b6d3a11d1457
```

This only writes a plan, with exactly two short, fixed-seed FFA matches
of **two full bot clients**, no mocked/scripted opponents. Append
`--execute` and choose an unused `--out` directory to actually run them.
Full/default league mode and the separately pinned Impossible/Scenario
workflow remain available. Observed results require engine/bot-hash,
match metadata and complete recording checks. Never count an unplayed
plan as a win.
