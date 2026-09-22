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
