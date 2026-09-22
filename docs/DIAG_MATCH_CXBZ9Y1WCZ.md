# Match cxBz9Y1WCZ — SPK/Kitsu follow-up

Based on the two user-provided diagnostic V2 ZIPs (SPK eliminated tick
5165; Kitsu eliminated tick 6446). This patch changes the bot only at
existing safety/legality gates. Do not infer that the changes are proven to
win until actual paired browser matches are compared.

## Early Duo support (survival before last-minute rescue)

`duoState.earlyCrisis` is advertised when observed incoming attackers exceed
2.5% of current home troops, an observed front exceeds 90% of home, or
sampled land/structure loss indicates deterioration. The peer additionally
shares land and surviving City/Factory counts. `coordinateDuo` treats
early crisis as an invasion warning, cancels unsafe rendezvous and exposes
partner land and warning in the common plan. `teamSupport` may donate on a
lower real-incoming threshold, or after collapse if the donor is safe and
sufficiently stronger; its home reserve, actual alliance, cooldown, legality
and action-budget gates remain mandatory. An advisory focus on the partner's
observed aggressor is not permission to open an unsafe front.

## Productive core recovery

After the last City or Factory is lost, a live, non-invaded player gets
a core-recovery priority over discretionary Port/Warship/Silo/rocket
savings. A city is not treated as a source of fabricated gold or a factory
as troop-cap relief. Existing worker-quoted costs, legal/owned placement,
shared pending-gold protection and defense checks remain in force. Real
incoming troops or incoming nukes still block an unsafe core investment.
No legal owned site is explicitly recorded as `core_recovery_block`;
an affordable worker quote by itself does not prove a buildable site.

## Evidence and what can still be unknown

`offense_drought` reports long spans with no newly emitted attack along
with actual readiness, available troops, target scoring, war locks and
reserve restrictions; this event never authorizes an attack. Engine
`DonateEvent` observations now expose a bounded
`duo_donation_capture_probe`, including whether GameView updates were
readable, channel counts, candidate events, matching events and the last
receipt tick. Numeric as well as string player IDs are normalized before
matching; sender and recipient must still match the actual player IDs.
Missing receipts remain unknown, not a proven transfer failure.

`summary.json.diagnosticV2.partnerId` retains only the last *verified
same-match* Duo identity if the peer disconnects just before elimination.
The ID resets on a genuinely new match.

Upload two complete ZIPs from another paired browser match to verify
whether earlier relief, core restoration, defense and actual land/army
outcomes improved. Tests exercise code behavior; they do not establish
a multiplayer win or a causal neural benefit.


---

## Addendum: two **single-browser Public Team** matches, Run3 1.21.2

The following diagnoses are **not Duo Relay matches**, and must not be
combined into one replay or evaluated as a Ranked 2v2 outcome.

| Evidence | Match `dZK7W1CkfP` | Match `drYuPivuTv` |
| --- | ---: | ---: |
| SPK player ID | `yuggtdvo` | `19jik396` |
| Own elimination | tick 7015 | tick 3581 |
| Peak snapshot territory | 62,969 | 53,075 |
| Last observed attack command | tick 1760 | tick 2377 |
| Confirmed attack commands | 15 | 16 |
| Observed ships / confirmed landings | 7 / 0 | 1 / 0 |
| Observed troop donation events | 51 (38 incoming, 13 outgoing) | 5 (0 incoming, 5 outgoing) |
| Event journal | 3416/3416, complete | 1893/1893, complete |

Both were Public Team games at Medium difficulty, one bot
per browser. `dZK7W1CkfP` used Las Vegas Strip and `drYuPivuTv`
used Giant World Map; neither may be treated as a same-map controlled
comparison. Both had `duoEnabled=false`, empty `duo.jsonl`, and both exports ended
with **own player eliminated / team outcome unknown**. A configured
`duoRoom` string is not proof that Duo was active. Both reports show embedded,
enabled schema-4 policy, 1000 weights, fingerprint
`fnv1a-2ba0d894-20161`; effectiveness versus rules alone is unproven.
`recording.dropped` describes the legacy UI ring, not the complete journal.

### Evidence that changes the existing priorities

- **P0: non-Duo offensive stagnation.** In `dZK7W1CkfP` territory remained
  62,969 across snapshots from ~2967 to ~4994. No attack command followed
  tick 1760, despite periods of >2 million home troops; observed
  `attack_block_report` repeatedly lists `war-lock` and `low-home-ratio`.
  In `drYuPivuTv`, the last command was tick 2377; before the large invasion
  reports list `war-lock` and `insufficient-available`. Do not interpret
  this as proof that a proposed attack was safe. Implement an explicit
  **offense-stagnation director**: track opponent focus, independent attack
  receipts, land progress and last safe opportunity; after bounded no-progress
  windows re-evaluate a stale war target, economic expansion and achievable
  naval alternatives. Release only a stale focus, never reserve/alliance/
  worker/action-cap safety checks. Log `stagnation_enter`,
  `stagnation_candidate`, `stagnation_release` and reasoned refusal.
  Regression: an unsafe alternate stays blocked, while a genuinely stale
  lock cannot freeze all *independently legal* options indefinitely.

- **P0: transport lifecycle, cancelled targets and long routes.** Seven ships
  were observed and then classified `boat_unresolved` with zero confirmed
  landings in `dZK7W1CkfP`. The journal separately contains **four**
  `cancelBoat` intents because their targets became allied; several occur
  near unresolved ships. These events lack a proven one-to-one ship/action
  link, so **do not count all seven as sunk or all four as confirmed
  cancellations**. One other boat in `drYuPivuTv` was still en route at
  elimination (estimated arrival tick 4030, elimination tick 3581).
  Carry transport actionId/shipId through cancellation intent, observed
  cancellation or missing vessel, destination ownership, ETA and beachhead.
  Avoid committing a force whose conservative ETA exceeds the useful match/
  war opportunity or leaves the home vulnerable; only rank reachable
  targets, reassess target friendship during transit, and quantify
  opportunity cost of stranded troops. Regression: ally cancellation is
  labelled `cancelled` only after receipt; unseen ship remains `unknown`.

- **P0: earlier solo-Team survival/recovery.** `drYuPivuTv` already had
  1.96m incoming at tick 3178 while owning ~50.6k land and ~2.04m home;
  by tick 3421 only ~4.7k land and ~248k home remained. `dZK7W1CkfP`
  first recorded a 3780-land loss at tick 5106 and eventually lost its own
  core. Extend the survival director beyond Duo: short-horizon incoming
  ratio, territory/structure loss and opponent fronts must trigger a
  *pre-collapse* choice between recalled armies, defensible placement,
  economical reconstruction, or safe team relief. Do not set reserve to
  94% and assume that alone can defeat millions of incoming troops.
  Test solo-Team scenarios, not only local Duo tests.

- **P1: economic priority when productive core survives but growth stalls.**
  The longer match held 62,969 land for thousands of ticks while retaining
  cities/factories, yet logged 170 `build_stalled` events, including
  83 SAM-saving messages, and 205 budget blocks (204 Warship). The observed
  SAM floors reached 1.5m and 3m; one SAM build was confirmed at tick 4731.
  The previous `coreRecovery` fix addresses missing *last* City/Factory;
  it does not solve this stagnation case. Introduce a legal-site-and-fresh-
  quote timeout for SAM/fleet savings and allocate affordable productive
  City/Factory or City upgrade **without** breaking imminent-nuke defense.
  Audit repeated defense-post purchases for location, build legality, and
  immediate protection rather than raw count. Regression: stale/no-site
  SAM fund must not starve legally quoted productive alternatives.

- **P1: non-Duo team assistance and evidence.** Donations were genuinely
  observed by the engine in both matches; this contradicts treating the
  earlier Duo's missing receipts as a universal capture failure. Long match
  had 38 incoming troop donations totalling 10,674,099 and 13 outgoing
  totalling 1,419,231 **observed amounts across the match**, not an estimate
  of final survivable strength. Short match had five outgoing totalling
  358,250 and zero observed incoming. Assess whether each *own* donation
  preserved forecasted local defense and whether teammates' incoming aid
  preceded a specific threat. Correlate donation receipts with sender,
  recipient, tick, defense forecast and home-reserve recovery; never infer
  absence of aid from a missing receipt or sum donations as net troop profit.

- **P1: neural ablation on identical scenarios.** Both matches ran the
  **same** embedded model; two eliminations alone cannot show whether the
  model caused bad war locks, expensive savings or boat choices. Compare
  fixed baseline, neural-enabled and candidate policy on identical engine
  seeds and scenario snapshots; report land/time-to-collapse, confirmed
  successful beachheads, missing-core duration, turns idle with safe
  opportunities, donations/own-defense cost, and unresolved outcomes.
  Keep rule/model/final decision and an explicit `unknown` causal flag.
  No self-learning reward for a ship's disappearance labelled as loss,
  a team outcome that remains unknown, or a gold delta attributed to one
  building without a receipt.

### Order and acceptance gates

1. Add deterministic **single-browser Team** regression fixtures for both
   trajectories (stagnant 62,969 plateau; rapid 50k-to-4.7k collapse)
   with strict conservation of attack/defense/alliance safety gates.
2. Fix cancellation/arrival/unresolved transport attribution before
   optimizing boat aggression or marine training rewards.
3. Implement bounded stale-war replanning and earlier solo-Team crisis
   director, then re-evaluate SAM savings and productive investment.
4. Benchmark full bot, not merely an action heuristic, on matched scenarios
   before adopting a candidate. Report failures and unknown receipts.
5. Compare **new actual-browser Team and Duo matches separately**. A CI
   pass, engine smoke or simulator seed does not establish multiplayer
   superiority or a verified team victory.
