# V3 overnight holdout — World/Europe map analysis (A-champ vs stageC vs run3)

Source: the per-map / per-nation / per-seed breakdown in
[`map-breakdown.json`](./map-breakdown.json), exported by
[`tools/benchmark/v3-map-breakdown.mjs`](../../tools/benchmark/v3-map-breakdown.mjs)
from the local, gitignored
`benchmark-results/neural-v3-overnight-10h/holdout/` results.

Provenance (re-verified per match, 48/48 each, 0 mismatches):

| Model | policy SHA256 |
|---|---|
| A-champ | `0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5` |
| stageC | `84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1` |
| run3 | `e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968` |

Bot `008c1a2536cd9ef324a6372de7f65c7400bb9587c46dca8c74e0d3f3a4dff246`,
engine `bb8af015b515b3b717bd4d901074c5f4c16641cb`. Grid: 12 seeds
(`v3hold-0…11`) × World/Europe × nations 1/4 = 48 matches per
model/difficulty, 18000 ticks, Impossible (and Hard). The weighted
World/Europe sums reproduce the published global means exactly
(A-champ 23,638.65 / stageC 18,847.73 / run3 17,879.23 on Impossible).

The published [`evaluation-summary.json`](./evaluation-summary.json) had only
aggregate means; this document and `map-breakdown.json` are the map-level
breakdown the issue asked for. Everything below is read from the exported
records. **Fact** lines are direct readings; **Hypothesis** lines are
interpretations that the current data does not by itself prove.

---

## (a) World vs Europe — where A-champ's Impossible end-land lead comes from

Impossible mean end-land by map (A-champ / stageC / run3):

| Map | A-champ | stageC | run3 | A vs stageC | A vs run3 |
|---|---:|---:|---:|---:|---:|
| World | 19,330 | 16,207 | 8,358 | **+3,123** | **+10,972** |
| Europe | 27,948 | 21,489 | 27,400 | **+6,459** | **+548** |
| (overall 48) | 23,639 | 18,848 | 17,879 | +4,791 | +5,760 |

Retention (end/peak mean) by map:

| Map | A-champ | stageC | run3 |
|---|---:|---:|---:|
| World | 0.24 | 0.21 | 0.18 |
| Europe | 0.51 | 0.45 | 0.48 |

**Fact.** A-champ beats stageC on *both* maps; the larger edge is on
Europe (+6,459 vs +3,123 on World). Against run3 the picture is
different: A-champ's edge is almost entirely **World** (+10,972), because
run3 collapses on World (8,358) while on Europe run3 is nearly level with
A-champ (27,400 vs 27,948, +548).

**Fact.** A-champ's own Europe figure (27,948) is its strongest map and its
Europe retention (0.51) is far above its World retention (0.24) — it holds
its Europe land much better than its World land.

**Hypothesis.** A-champ's overall Impossible lead is therefore not a single
map effect: against stageC it is a *both-maps* advantage (largest on
Europe), while against run3 it is a *World* advantage. The two comparisons
would point at different maps if cited alone, which is why the per-map split
is required. This is descriptive, not causal: it does not yet show *why*
A-champ retains Europe land better, only that it does.

## (b) Which nation-1 / nation-4 scenarios drive the difference

Impossible mean end-land by map-nation (A-champ / stageC / run3):

| Scenario | A-champ | stageC | run3 |
|---|---:|---:|---:|
| World-1 | 38,498 | 30,877 | 14,370 |
| World-4 | 161 | 1,537 | 2,346 |
| Europe-1 | 52,906 | 38,340 | 52,085 |
| Europe-4 | 2,989 | 4,638 | 2,716 |

**Fact.** The action is in the **nation-1** scenarios on both maps.
A-champ's lead over stageC is World-1 (+7,621) and Europe-1 (+14,566);
against run3 it is World-1 (+24,128), while Europe-1 is a near-tie
(52,906 vs 52,085, +821).

**Fact.** The **nation-4** scenarios are near-collapse for every model
(A-champ World-4 = 161, the lowest cell in the table). A-champ is in fact
the *worst* of the three on nation-4 on both maps, and stageC/run3 are
roughly comparable to each other there. So A-champ's aggregate lead is not
built on nation-4 at all.

**Fact.** A-champ's single strongest scenario is Europe-1 (52,906), but
run3 essentially matches it (52,085). A-champ's decisive, unrecovered edge is
**World-1** (38,498 vs stageC 30,877, vs run3 14,370).

**Hypothesis.** Because the nation-4 cells are near-zero for all models,
the aggregate differences are effectively the nation-1 differences. Any
conclusion about "map strength" on Impossible is really a conclusion about
the nation-1 scenario on each map.

## (c) Why there are 0 Impossible wins

**Fact — win condition.** Impossible is FFA; the recorded victory
threshold is `80` (80% of map tiles). A win requires `victory.progress` to
reach 0.80.

**Fact — no model reached it.** Across all 48 Impossible matches each:

| Model | best final progress | where | termination |
|---|---:|---|---|
| A-champ | **0.581** | v3hold-11 World n1 | tick-limit |
| stageC | 0.668 | v3hold-1 World n1 | tick-limit |
| run3 | 0.318 | v3hold-1 World n1 | tick-limit |

A-champ's best Impossible progress was **58.1%**; stageC's 66.8%; run3's
31.8%. None reached 80%, so 0 victories is expected from the end-states.

**Fact — the three A-champ failure modes (48 matches):**

| Mode | Count | What the end-state shows |
|---|---:|---|
| game-over defeat | 24 | an enemy nation hit 80% first; A-champ's progress was 9–15% |
| elimination | 20 | A-champ's land reached 0 before any win |
| tick-limit | 4 | survived to tick 18000 at 54.7–58.1% progress — right-censored, **not** a win |

**Reproducible failed-win cases** (from `map-breakdown.json`, no raw logs):

1. `v3hold-11 World n1` (tick-limit): A-champ alive at 18000, end-land
   91,809, progress **58.1%**, enemy-land 66,117, enemy-troops 2,700,419,
   `finalAlive=true`, `victoryThreat=null`, `engineWinner=null`. A-champ
   actually held *more* land than the enemy (91,809 vs 66,117) but the map is
   large enough that this is only ~58% of it — well short of 80%.
   (Derived: 91,809 / 0.5808 ≈ 158,070 total tiles → 80% ≈ 126,450, i.e. it
   was ~34,700 tiles short.)
2. `v3hold-0 Europe n1` (game-over defeat): ended tick 9,861, end-land
   86,831, progress **15.5%**, while the enemy **Iceland** hit 79.98%
   progress with 455,770 land; `engineWinner=["nation","Iceland"]`. The
   enemy swept the map while A-champ held ~15%.
3. `v3hold-2 World n1` (elimination): peak-land 55,717, eliminated at tick
   4,776, end-land 0, 46 attack commands but 0 territory-gained receipts.

**Fact — the tick-limits are the "closest to a win" cases, all World n1.**
All four A-champ tick-limit matches are World nation-1, with A-champ ahead on
raw land (86k–92k) but below threshold (54.7–58.1%). This is consistent with
(b): World-1 is A-champ's strongest *winning* scenario, and it still falls
short of 80%.

**Hypothesis.** The 0-win result is a *threshold* problem, not (only) a
survival problem: even A-champ's best end-states are ~58–67% complete.
Whether a slightly more aggressive end-game could push the World-n1
tick-limit cases over 80% is not testable from these end-states alone — it
needs the tick-by-tick land curve near the end, which `map-breakdown.json`
carries only as mean/peak/final samples. Treat the tick-limit cases as the
first candidates to inspect for a late-game push, but do not conclude a
specific late-game bug from the counts.

---

## Paired per-seed view (end-land, A-champ − other)

Per-map win/loss/tie counts are on the *per-seed* end-land difference
(`map-breakdown.json → paired.*.perMap`), and are **mixed even where the
mean is positive** — A-champ does not win every pair:

| Comparison | Map | wins / losses / ties | mean Δ end-land |
|---|---|---:|---:|
| A vs stageC | Impossible/World | 8 / 7 / 9 | +3,123 |
| A vs stageC | Impossible/Europe | 12 / 3 / 9 | +6,459 |
| A vs run3 | Impossible/World | 9 / 10 / 5 | +10,972 |
| A vs run3 | Impossible/Europe | 9 / 6 / 9 | +548 |

**Fact.** A-champ's mean end-land is higher than both references on every
map, but on a per-seed basis it *loses* to stageC on 7 of 24 World pairs and
to run3 on 10 of 24 World pairs. The positive mean is driven by a few large
Europe-1 / World-1 wins, not by uniform per-seed dominance.

## Scope and limits

- 48 matches per model/difficulty; 24 per map; 12 per map-nation. No
  fabricated rows; missing values are carried as `null` (denominators
  disclosed in `map-breakdown.json`).
- Enemy land/troops come from the `match.json` trajectory (not in the
  published summary); `engineWinner` is frequently `null` except on
  game-over defeats.
- This is a descriptive map split of a fixed holdout. It does **not** retune
  the promotion gate, change rewards, or promote A-champ. The paired v2 gate
  still does not promote on aggregate territory alone (see
  [`A_CHAMP_ANALYSIS.md`](./A_CHAMP_ANALYSIS.md)).

See [issue #98](https://github.com/SLP-DEV1/openfront-bot/issues/98).
