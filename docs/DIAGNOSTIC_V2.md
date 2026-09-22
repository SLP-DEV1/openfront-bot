# Match diagnosis v2 — paired browser export

The Solo and Impossible Run3 userscripts share this implementation. The model
bundled in Run3 is unchanged by diagnostic work.

## Export and recovery

The **Diagnose** button generates one ZIP per local player, named
`OpenFront_<version>_<playerID>_DiagnoseV2.zip`. The bot also attempts one
automatic download when the current player is eliminated or the match ends.
Browsers may block automatic downloads; if none appears, click Diagnose before
closing the tab, and permit downloads for openfront.io if required.

The package contains:
- `summary.json`: existing diagnostic snapshot, plus `diagnosticV2` identity,
  personal elimination tick, match-end tick and recording-integrity fields.
- `events.jsonl`: every retained journalled telemetry event in ascending
  per-session sequence order.
- `snapshots.jsonl`: the `snapshot` subset (normally every 80 game ticks).
- `duo.jsonl`: Duo connection, exchange, help, plan, donation and Duo-labelled
  action events, in sequence order.
- `README.txt`: session and integrity warning.

IndexedDB stores full journal events continuously in batches rather than
retaining only the last 1,400 UI records. The old ring buffer and critical-event
buffer remain visible in summary for compatibility. A tab-scoped
`sessionStorage` checkpoint can resume the same session after reload only when
the actual match ID and player identity match; different matches and browser
tabs have different session IDs. If IndexedDB is unavailable, full history is
**not** claimed: the package falls back to the current UI buffer and
`diagnosticV2.journal.complete` is false. Full completeness also requires an
unbroken 1-based sequence and no reported storage errors/drops. A browser
closing before queued IndexedDB writes commit can still lose events; check the
integrity flag, not just the presence of a ZIP file.

**Upload both players' ZIP files** when reviewing a Duo match. Join by
`diagnosticV2.matchId` (not filenames or export time) and distinguish the
`playerId`, `session`, `gameEnd.tick` and
`diagnosticV2.personalEliminationTick`. The match replay must have the same
match ID to serve as evidence for the pair. Order events within one session by
`seq`, across browsers by game tick and timestamp while acknowledging that
the client clocks and observations can differ.

## Evidence semantics

`action` records contain `actionId`, `decisionId`, requested troop
amount where available and `emission: event-bus`. This is **not** server
acceptance or successful combat. `actionTrace.ledger` contains a bounded,
recent view of action receipts and before/after *observations*. Its
`actualTroopOutflow`, `actualGoldCost` and `effect` stay `unknown`
unless separately established; a change in total home troops or gold cannot
by itself prove a particular action's effect. Construction `build_quote`
records quote the worker's cost, not a verified payment. Attack, building and
transport receipt events are preserved with their action IDs where available.

## Request-to-receipt and action follow-up (evidence completion)

Each `duo_help_request` has an independent `requestId`, requester and
partner IDs, rule-based `requestedSupportTroops`, deadline, and native
`estimatedArrivalTick` only when an explicit GameView field is available.
Otherwise ETA is null and `arrivalEvidence` says unknown. The 180-game-tick
deadline is a **diagnostic retry policy**, not an engine prediction; expiry
does not mean troops were lost. `duo_help_received` and
`duo_help_ack_seen` prove transmission/acknowledgment only.
`duo_help_accepted` and `duo_help_action_sent` are emitted only after the
partner passes the existing safe donation checks and the donation *intent*
was actually emitted. They carry the same request ID and a local action ID.
A partner-advertised action creates `duo_help_commitment_seen`, not
`support_observed`.

The official OpenFront `DonateEvent` exposes `donationType`,
`senderId`, `recipientId`, and an actual bigint `amount`. When a
matching event is present in `GameView.updatesSinceLastTick()`, the
diagnostic emits `donation_observed` and
`duo_help_support_observed`, with request/action IDs when safely matched;
the donor's action ledger can then record actual troop outflow. Such
updates are transient: browser polling may miss one. If missing,
`duo_help_action_unconfirmed` retains `supportObserved: unknown`
and does **not** infer a failed donation from changing home troops.
`duo_help_expired` is a timeout, elimination or match-end without
a conclusive request resolution. The absence of an event is not proof
that no assistance happened.

`attack_outcome_observed` links a previous attack's action ID to the
observed before/after player and defender land, labeled non-causal.
Regular snapshots now include explicit incoming attack and recall
candidates, worker/quote evidence, and action-linked ship IDs, ETA and
bridgehead checkpoints. `neural_strategy_choice` separates rules,
learning, neural proposal and final tuning. Actual building gold charges,
unobservable casualties and unspecified engine receipt fields remain
`unknown`; a quoted build price is not a payment receipt.

Duo `duo_transition` records state when a peer appeared or disappeared;
`duo_exchange` periodically captures the two advertised states.
`duo_plan_state` records changes to target, plan ID, strike tick,
partner ACK, role and budget. `duo_help_request` and
`duo_help_received` distinguish sending from reception;
`duo_help_ack_seen` acknowledges **receipt only**, not a troop commitment.
`duo_help_resolved` means incoming pressure went below the threshold and
does not prove a partner rescued the player. Donations remain separate actions.

## Resource limits and what is not guaranteed

- The in-memory UI buffer keeps 1,400 events and the separate critical buffer
  1,200; IndexedDB is the source for the complete package.
- Storage quota, denied IndexedDB, browser termination, ZIP size limits and
  download restrictions are surfaced through missing records, the error
  marker, or a browser warning, not silently described as full recordings.
- The journal does not add permissions to the bot and does not imply a
  verified victory unless the official winner update is observed.
- Even a complete event stream cannot attribute causal troop losses or exact
  spend to one intent without an engine-level receipt.
