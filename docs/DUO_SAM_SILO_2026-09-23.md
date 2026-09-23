# Duo SAM/silo investment fix — 2026-09-23

Incident: two DiagnoseV2 exports for the same Public FFA match d6CZC11JGZ
(hqoj67np / n23g35ad, OpenFront 1.21.2). Both built repeated SAM
Launchers while neither file recorded a confirmed **own Missile Silo
construction**. However, both contained nuke launch confirmations. Do not
equate absence of a build receipt with proof no silo existed: an owned
silo could have been captured, preexisting or missed by the diagnostics.

## Changes

- Own City/Factory/Port/Silo assets drive own SAM demand, and verified
  allied SAMs can cover them. Allied uncovered assets may contribute a
  small placement bonus but cannot mandate our own SAM construction.
- The first relevant SAM guard may precede the initial silo. An enemy silo
  seen elsewhere is *not* an inbound missile emergency: after that guard,
  the tech lead funds its first silo before routine SAMs/upgrades.
- Only observed inbound nukes can interrupt first-silo savings for further
  SAM coverage. A repeatedly unavailable legal SAM site releases the
  speculative guard requirement; worker quotes never authorize a build.
- Duo tech lead is deterministically selected using verified, actually
  friendly same-match partner, core readiness, then player ID. A secondary
  can build its own silo once it observes the partner's silo. No trusted
  partner => solo fallback, not a wait forever. Both retain the ability
  to react to immediate threats.
- Once a silo exists, the first rocket budget is protected from routine
  SAM upgrades. Non-emergency Warship spending now preserves first silo /
  first rocket savings, subject to existing immediate-defense exceptions.
- The relay advertises gold, silos and SAM counts; economy evidence
  advertises the policy/role. First-seen owned silo IDs and confirmed
  own-build IDs are logged separately and linked to rocket attempts and
  launch confirmations. Unresolved origin is **unknown**, not asserted
  to be a captured silo.

Safety: no change to the worker's final legal-site / legal-price checks,
protected ally and nuke-collateral checks, or emergency defense lane.

## Regression and validation

`node tests/duo-nuclear-investment-regression.cjs`
`node tools/build-userscript.cjs --check`
`node tools/build-run3-bundle.cjs --check`

A matched, full-duo live match is still required to validate better game
outcomes and launcher interception behavior; static tests do not claim it.
