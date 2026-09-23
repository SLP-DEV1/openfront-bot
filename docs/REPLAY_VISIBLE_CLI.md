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

## Original-Roh-Replay: nur Strukturvorprüfung, keine Lernframes

`tools/benchmark/replay-raw-preflight.cjs` nimmt ein originales
`v0.0.2`-GameRecord mit `gitCommit`, `info` und archivierten
`turns` entgegen. Der gewählte vollständige 40-stellige Engine-SHA muss
exakt übereinstimmen. Der Validator prüft geordnete Turnnummern, die
Anzahl ausgelassener (sparse) Turns, Intents, Spieleridentitäten und
gespeicherte Hash-Anker. Abweichende/nicht aufgeführte Client-IDs
werden **nur als Warnsignal** ausgewiesen; es werden keine Spieler-
beobachtungen daraus abgeleitet.

```sh
node tools/benchmark/replay-raw-preflight.cjs \
  --input original-record.json --engineCommit FULL_40_HEX_SHA
```

**Wichtig:** `engineHashesVerified:false`,
`visibleLearningPairs:0`. Der Validator rekonstruiert weder
`GameView` noch verifiziert er die gespeicherten Hashes durch eine
wirklich ausgeführte offizielle Engine. Das Roh-Replay darf weiterhin
**nicht** als menschliche Train-/Holdout-Evidenz durch
`replay-cli.cjs` importiert werden. Für die vollständige Abnahme
stehen die exakte Engine-Rekonstruktion, per-turn-Hashverifikation,
ausgewählte Player-GameView und beobachtete Aktionen weiterhin aus.

## Exakte Engine-Rekonstruktion aus einem Roh-Replay

`tools/benchmark/replay-engine-extract.mjs` schließt die Lücke zwischen
Roh-GameRecord und sichtbaren Lernframes. Es verlangt einen lokalen Checkout
des **exakten** `record.gitCommit`, spielt die archivierten Turns mit der
offiziellen OpenFront-Engine nach, vergleicht jeden vorhandenen Hash-Checkpoint
und hält genau einen ausgewählten `clientID` als echten `GameView`.

```sh
node tools/benchmark/replay-engine-extract.mjs \
  --input original-record.json \
  --out extracted-gameview.json \
  --engine ../OpenFrontIO \
  --engineCommit FULL_40_HEX_SHA \
  --clientID PLAYER_CLIENT_ID \
  --origin human-replay \
  --provenance "gameID=...; clientID=..." \
  --usageRights "documented permission"
```

Hash-Abweichung, unbekannte Client-ID, fehlende Hash-Anker oder fehlende
sichtbare Entscheidungen brechen fail-closed ab. Der Export trägt
`engineHashesVerified:true`; Zustände werden unmittelbar vor dem
archivierten Intent aus dem ausgewählten `GameView` gelesen. Outcomes bleiben
`null`, solange sie nicht separat beobachtet wurden. Der Output kann danach
durch `replay-cli.cjs` laufen.

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
