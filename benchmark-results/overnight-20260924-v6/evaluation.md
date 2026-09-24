# Evaluation Report — Final-Holdout (o7hold) for the V7 Schema-4 Candidate

**Campaign:** overnight-20260924-v6 · **Generated:** 2026-09-24T05:05Z
**Engine:** `bb8af015` (training engine for every schema-4 model; in-distribution for all arms)
**Bot:** `OpenFront_Solo_AggroBot.user.js` file-SHA `3c149957…` (canonical post-integration main-solo bot)
**Gate:** `trainer/evaluation-v2.cjs` `compare()` (paired, per-seed, right-censored)

## Candidate

| field | value |
|---|---|
| id | `v7-mixed-public` (base: stageC, opponentProfile `mixed`, Public multi-player, 3 scripted humans) |
| policy SHA | `4c5848c9b93a3923345c7525f28731e1de6f5595656a85ba530fd0c286bb8f52` |
| schema | 4 (24×24×16-tanh = 1000 weights) |
| selection | only V7 variant that beat stageC in training final-gen (held-land −0.3226 vs −0.3623) |

## Final-Holdout design (fresh, pre-registered)

- **Seeds:** `o7hold-0 … o7hold-7` (8 seeds), frozen **before** any match (manifest hash recorded in `o7hold/seeds-manifest.json`).
- **Arms (4):** candidate / stageC (`84d1f593…`) / run3 (`e0fceaef…`, file `65589feb…`) / rule-basis (no policy).
- **Modes (3):** 1v1 (FFA 2 bots/2 nations/1 human), official-2v2 (Team 2/2/3), ffa-duo (FFA 40/8/3).
- **Maps:** World, Europe. **Difficulty:** Impossible. **Ticks:** 18000. **Opponent:** mixed.
- **Total:** 3 × 4 × 8 × 2 = **192 matches**, all `verified=true` (provenance: engineCommit, seed, harness, botSHA, policySHA, gameConfig).

## Results (gate per mode)

| mode | ref | gate | paired | cand wins / ref wins | cand mean-land / ref mean-land |
|---|---|---|---|---|---|
| 1v1 | stageC | no-verified-improvement | 16 | 0 / 0 | 13401 / 10801 |
| 1v1 | run3 | no-verified-improvement | 16 | 0 / 0 | 13401 / 30274 |
| 1v1 | rule-basis | no-verified-improvement | 16 | 0 / 0 | 13401 / 28859 |
| official-2v2 | stageC | no-verified-improvement | 16 | 6 / 6 | 78491 / 81125 |
| official-2v2 | run3 | no-verified-improvement | 16 | 6 / 7 | 78491 / 90480 |
| official-2v2 | rule-basis | no-verified-improvement | 16 | 6 / 7 | 78491 / 73079 |
| ffa-duo | stageC | no-verified-improvement | 16 | 0 / 0 | 1445 / 4625 |
| ffa-duo | run3 | no-verified-improvement | 16 | 0 / 0 | 1445 / 3141 |
| ffa-duo | rule-basis | no-verified-improvement | 16 | 0 / 0 | 1445 / 1298 |

## Promotion decision

**`promote: false`** — criterion: candidate must beat **stageC AND run3 AND rule-basis** via the gate on **≥2/3** modes. The candidate beat **0/3** modes against every reference.

## Interpretation

- The candidate is **close to stageC (its parent)**: higher 1v1 land (13401 vs 10801) and tied official-2v2 wins (6–6), but the per-seed survival gains are not consistent enough to clear the gate (equal-win promotion requires `regressed==0` **and** ≥10000 survival-area or ≥600 survival-ticks).
- It is **not** better than run3 or rule-basis in 1v1 / ffa-duo (both score higher mean-land there), and it trails run3 on official-2v2 wins (6 vs 7).
- This is **consistent with the V6 line result** (`v6-final-holdout/decision.json`: "NO PROMOTION — no verified improvement over stageC, V4-prov, V5-A-prov or V5-V4-prov"). Two independent neural lines (V6 and V7) both converge to **no verified improvement over stageC**.

## Conclusion

- **Best checked candidate:** `v7-mixed-public` (`4c5848c9…`) — delivered, **not promoted** (no false promotion).
- **Active champion unchanged:** Run3 schema-4 (`65589feb…`, file-SHA verified unchanged). No live userscript swapped.
- The 5-hour budget was used for 3 V7 variants + a 192-match fresh Final-Holdout. No demonstrably-stronger candidate emerged; the candidate is a near-wash against its parent stageC and weaker than the run3 champion in the ffa/2v2 regimes.
