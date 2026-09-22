# Scenario Pack + Evidence Mode (#121)

## Visible Evidence Mode
Open the **Diagnose & Protokoll** section and select **Evidence AN**. The
default is OFF, and the preference is saved in the existing bot settings.
The UI reports the second-ranked planner candidate (not a proposed legal
attack), the reserve floor reason, age of the most recent border-worker data,
and the last emitted action/decision IDs with the most recently *observed*
effect. `unconfirmed` is not success or failure. No ranking or UI state
can authorize an intent or alter a budget, safety or alliance gate.

The budget row is visible in the diagnosis section even with Evidence OFF.
It is a read-only snapshot produced by the actual economy planner: cap use,
City demand, wanted SAM count and known recent quote, Port milestone and known
recent quote, and the shared baseline savings target. **Gold-Floor is not a
universal hard lock**: the existing budget logic has exemptions depending on
purpose and emergencies. Unknown worker quotes display as `?`; budget data
older than 300 game ticks is not presented as current. The same economy
snapshot is included in the diagnostic JSON and periodic records.

Solo and Impossible Run3 are generated from the same source. Run3 still
uses the existing schema-4 champion; the evidence UI never changes its weights.

## Reproducible engine scenarios
`tools/benchmark/scenario-pack.cjs` defines ten fixed, short game scenarios:
five World FFA profiles, two Europe FFA profiles, two World Team profiles and
one Europe Team profile. Team includes one allied and one opposing scripted
client; these **are deterministic heuristic clients, not actual human opponents**.

The normal CLI is a dry-run: no game is played and no synthetic outcome or
result directory is created.

```sh
node tools/benchmark/scenario-pack.cjs \
  --bot OpenFront_Solo_AggroBot.user.js
```

Run the three-case CI smoke or the ten-case full pack against the **exact**
official OpenFrontIO checkout, pinned at
`bb8af015b515b3b717bd4d901074c5f4c16641cb`:

```sh
node tools/benchmark/scenario-pack.cjs --execute --smoke \
  --engine ../OpenFrontIO --bot OpenFront_Solo_AggroBot.user.js \
  --out benchmark-results/scenario-smoke

node tools/benchmark/scenario-pack.cjs --execute \
  --engine ../OpenFrontIO --bot OpenFront_AggroBot_Impossible_Run3.user.js \
  --out benchmark-results/scenario-run3-full
```

A separate GitHub Actions workflow runs the three-case smoke for relevant
PR changes and can execute the full ten-case suite via manual dispatch
(`full=true`; optional `run3=true`). Each run saves
`scenario-pack.json` plus real `match.json` and per-game event/intent
journals. Each case checks the pin and bot SHA, seed, mode, player count,
spawn, recording completeness, visible metrics, sample order and trajectory
summary consistency. **These are metric/integration invariants, not a
victory or strategy-performance test.** Exact City/Factory capacity and
alliance semantics retain their existing targeted regression tests; the
short scenarios do not pretend to exercise all mid/late-game behaviors.

Failure preserves each case's errors and does not report a passed suite.
Outputs are create-only: use a new `--out` directory for each run.
