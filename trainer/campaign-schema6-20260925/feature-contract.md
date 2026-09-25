# Schema-6 Candidate Feature Contract (38-dim)

New, versioned model contract — **schema 6**, `FEATURED_SCHEMA_VERSION=3`.
Not a schema-5 fine-tune: the idx 29–37 additions are structurally new signals
(kind identity + rule-utility context) that schema-5 could not express.

- **inputs:** 38
- **outputs:** 2 (`heldGain`, `lossRisk`)
- **archs:** `38x24x2-tanh` (986 w), `38x40x2-tanh` (1642 w)
- **KINDS:** `hold, invest, attack, expand, naval, support`
- **RU constants:** `RU_ABS_OFFSET=100`, `RU_ABS_SCALE=200`, `RU_GAP_SCALE=100`

Machine-readable twin: `feature-contract.json`. Source of truth for the
train/runtime slice: `trainer/candidate-policy-v6.cjs` + `trainer/v6-features.cjs`
(`assertFeatureParity` enforces parity by construction; the slice is inlined
verbatim into the userscript and the build asserts byte-parity).

## idx 0–28 — state + candidate contract (byte-identical to schema-5)

| idx | name | source | transform |
|---|---|---|---|
| 0 | home_ratio | state.home/state.maxTroops | logrel(home, maxTroops) |
| 1 | gold | state.gold | logrel(gold, 1e7) |
| 2 | incoming_ratio | state.incoming/home | clamp(0,2)/2 |
| 3 | committed_ratio | state.committed/home | clamp(0,2)/2 |
| 4 | reserve_ratio | state.reserve/home | clamp(0,1) |
| 5 | economy_relative | state.economyRelative | clamp(0,2)/2 |
| 6 | capacity_use | state.capacityUse | clamp(0,1) |
| 7 | front_reach | state.frontReach | clamp(0,1) |
| 8 | partner_need | state.partnerNeed | clamp(0,1) |
| 9 | enemy_bound | state.enemyBound | clamp(0,1) |
| 10 | land_trend | state.landTrend | clamp(-1,1)/2+0.5 |
| 11 | gold_trend | state.goldTrend | clamp(-1,1)/2+0.5 |
| 12 | troop_trend | state.troopTrend | clamp(-1,1)/2+0.5 |
| 13 | front_count | state.frontCount/8 | clamp(0,1) |
| 14 | port_access | state.portAccess | clamp(0,1) |
| 15 | technology_coverage | state.technologyCoverage | clamp(0,1) |
| 16 | expected_land_ratio | candidate.expectedLand/state.land | clamp(0,1) |
| 17 | cost_troops_ratio | candidate.costTroops/home | clamp(0,1) |
| 18 | cost_gold_ratio | candidate.costGold/gold | clamp(0,1) |
| 19 | duration | candidate.duration/1200 | clamp(0,1) |
| 20 | return_time | candidate.returnTime/1200 | clamp(0,1) |
| 21 | counter_risk | candidate.counterRisk | clamp(0,1) |
| 22 | third_party_risk | candidate.thirdPartyRisk | clamp(0,1) |
| 23 | infrastructure_value | candidate.infrastructureValue | clamp(0,1) |
| 24 | income_value | candidate.incomeValue | clamp(0,1) |
| 25 | recruitment_value | candidate.recruitmentValue | clamp(0,1) |
| 26 | site_risk | candidate.siteRisk | clamp(0,1) |
| 27 | hold_probability | candidate.holdProbability | clamp(0,1) |
| 28 | legal_confidence | candidate.legalConfidence | clamp(0,1) |

## idx 29–34 — per-kind one-hot (fixes Blocker A)

Schema-5 carried one-hots for attack/investment(bug)/naval only, so
`hold`/`expand`/`support` were indistinguishable from each other. v6 emits an
explicit one-hot for **every** action kind the planner can emit:
`hold, invest, attack, expand, naval, support`.

| idx | name |
|---|---|
| 29 | kind_hold |
| 30 | kind_invest |
| 31 | kind_attack |
| 32 | kind_expand |
| 33 | kind_naval |
| 34 | kind_support |

## idx 35–37 — bounded rule-utility context (fixes control ceiling)

v5 scored candidates **without** rule-utility context, so it could not learn
"the rules already prefer X; override only when the evidence disagrees". v6
adds three bounded features, computable at both training binding and inference
(candidate set is rule-sorted before scoring), so train/runtime parity holds by
construction.

| idx | name | source | transform |
|---|---|---|---|
| 35 | candidate_rule_utility | ctx.ownRu | clamp((ownRu+100)/200, 0, 1) |
| 36 | utility_gap_to_rule_top1 | ctx.ruTop1 - ctx.ownRu | clamp((top1-ownRu)/100, 0, 1); 0.5 if non-finite |
| 37 | utility_gap_to_rule_top2 | ctx.ruTop2 - ctx.ownRu | clamp((top2-ownRu)/100, 0, 1); 0.5 if non-finite |

The absolute feature is an offset/scale map over the bounded rule-utility range
([~-1000 gated early attack, ~+150 strong candidate]); the gaps are
signed-bounded so a candidate far below the rule leader saturates at 1 without
the -1000 floor collapsing the whole frame.
