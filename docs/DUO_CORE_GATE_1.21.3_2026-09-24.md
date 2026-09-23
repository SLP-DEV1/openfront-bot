# Follow-up: v1.21.3 duo match dt4wd9jdpm

Two DiagnoseV2 ZIPs (q60ek853, 7mjlf9kq), Public / Medium / Free For All, both personally eliminated at ticks 6194 and 5729 respectively. This is a single live match, not a controlled A/B comparison.

Observed player 7mjlf9kq: 13 own-build receipts (2 City, 1 Factory, 1 Port, 9 Defense Post), **0 SAMs**, **0 silos** and **0 nuclear launches**. The second factory was never completed; a 1.5M SAM quote/fund was reported with 3 cities and 1 factory around tick 4,255, and 1.36M peak observed gold before losses. An unbuilt SAM should not be counted as a SAM purchase.

Observed player q60ek853: 11 own-build receipts (2 City, 2 Factory, 1 Port, 5 Defense Post, 1 SAM); the SAM cost 1.5M and was confirmed at tick 4,226, while the second factory was not built until tick 5,279 / confirmed 5,286. There were **0 silos** and **0 nuclear launches**. Post-SAM investment status sometimes still claimed 'SAM-Schutz vor Raketenfonds' despite one owned SAM, no inbound rocket and no additional wanted SAM.

Root causes in v1.21.3: (1) firstGuard accepted any visible enemy silo while the two City/two Factory milestone was still incomplete; (2) an uncompleted Factory did not receive a durable priority boost, while Port milestone was unlocked with just one of each; (3) the observed 1.5M first SAM quote could reserve cash otherwise usable by the missing second Factory. Strict two-and-two coreReady meanwhile vetoed first-silo planning. These together made the earlier v1.21.3 silo-starvation fix unreachable.

v1.21.4 change: defer speculative SAM guards and first harbor until the productive 2+2 core; boost missing second City/Factory; retain legal-site recovery for a repeatedly unbuildable core; allow a genuinely observed inbound nuclear missile to trigger SAM before the core is complete. All final worker legality, immediate defense and ally safety checks remain unchanged. Correct the stale SAM investment status. Verify with newly expanded regression and repeat live duo.

Neither v1.21.3 export has a silo_seen, silo_origin, nuke_attempt or nuke_confirmed event. In this match, unlike the previous v1.21.2 incident, the current logs do not imply a rocket was launched without a recorded own silo.
