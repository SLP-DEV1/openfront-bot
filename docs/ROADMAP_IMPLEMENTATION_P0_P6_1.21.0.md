# P0–P6 implementation record — 1.21.0

This record separates shipped implementation from evidence. At the user's
request, no long-duration, two-client, league, or 120/600-tick effect matches
were executed for this package. Consequently it makes no new win-rate,
performance, promotion, multiplayer, or causal-effect claim.

## Implemented scope

| Phase | Implementation completed in the codebase |
| --- | --- |
| P0 | One source generates Run3; hashes/manifests and action/decision receipts already exist; versioned source and bundle remain coupled. |
| P1 | A time-labelled decision frame, stale-worker rejection, opponent histories, hold/counter/third-party scenarios, protected reserve, wait cost, rejected alternative, and a bounded 5–8 candidate/50 ms planner are present. The 50 ms value is a cutoff, not a measured P95 promise. |
| P2 | Capacity, cash, growth and infrastructure needs are separated. Legal proposals now carry 120/600-tick marginal value, build/site risk, opportunity cost, price source, payback estimate, site confirmation and expiry. Existing income attribution keeps purchases/donations separate from unexplained net change; connected spawn/duo room and neutral-front logic remain authoritative. |
| P3 | Operations retain objective, budget, progress window and stop conditions. Continue, reinforce, pause, retreat and switch are ranked repeatedly; a stalled operation can yield to a safer legal alternative. Forecasts remain labelled estimates and existing worker/reserve/alliance checks remain authoritative. |
| P4 | Joint options cover hold, invest, attack, relief, flank, landing and targeted aid. Own/partner budgets remain separate. Relay state now includes deterministic plan ID, reciprocal acknowledgement, start/expiry, individual budgets and abort reasons; stale or unacknowledged plans cannot launch. Transfer sizing is tied to observed pressure/shortage and own reserve. |
| P5 | Marine planning exports conservative distance/ETA, visible interception screen, escorts and route-local expiring uncertainty. Pending transports retain the route estimate and bridgehead audit. Trade embargoes require observed conflict and an explicit symmetric port/front cost proxy. Existing SAM, nuke collateral, trajectory, confirmation, alliance and diplomacy guards remain in force. |
| P6 | Frozen rule and Run3 arms remain supported. `league-plan.mjs` creates deterministic, map/seed/opponent-rotated match identities for distinct clients without inventing results. `replay-visible-state.cjs` rejects engine-mismatched or state-incomplete replay decisions. `candidate-policy-v5.cjs` provides a dormant legality-bounded held-gain/loss-risk ranker with relative economy, fronts, trends, partner need, candidate time/cost and risk features. It is not promoted or active without later evidence. |

## Deferred evidence (not performed)

- Long-duration browser matches and 120/600-tick effect follow-up.
- Two independent clients in FFA alliance and official 2v2, including relay
  delay/loss.
- Opponent-league execution, paired holdouts, training and model promotion.
- New causal claims for construction, transfers, naval landings, nukes or
  embargo income.

Unknown observations remain `null`/`unknown`; they are not converted to zero,
loss, success, or confirmation. Repository CI may independently run its normal
checks after publication, but no such result is claimed by this record.
