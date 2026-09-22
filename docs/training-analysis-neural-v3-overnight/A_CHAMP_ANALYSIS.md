# A-champ vs stageC vs Run3 — verified aggregate analysis

Source: [V3 holdout evaluation-summary.json](./evaluation-summary.json), worktree
bot SHA `008c1a2536cd9ef324a6372de7f65c7400bb9587c46dca8c74e0d3f3a4dff246`,
engine `bb8af015b515b3b717bd4d901074c5f4c16641cb`. All figures
are reported means over **48 matches per model/difficulty** on the *same*
12 seeds × World/Europe × 1/4 nations. These are aggregate observations,
**not map-specific results or proof of causality**.

## Impossible

| Metric | A-champ | stageC | Run3 |
|---|---:|---:|---:|
| Verified victories | 0/48 | 0/48 | 0/48 |
| Defeats / tick-limits | 44 / 4 | 45 / 3 | 47 / 1 |
| Eliminations | 20 | 20 | 18 |
| Mean end-land | **23,639** | 18,848 | 17,879 |
| Mean held-land (trajectory average) | **25,477** | 25,335 | 23,076 |
| Mean peak-land | 39,707 | **41,050** | 39,539 |
| Mean land retention | **0.378** | 0.328 | 0.331 |
| Mean peak-to-end loss | **16,068** | 22,202 | 21,659 |
| Mean attack commands | 24.65 | 23.75 | 23.46 |
| Mean territory-gained receipt | 0.0625 | 0 | 0.0208 |
| Mean builds confirmed / stalled | 7.5 / 224.0 | 8.2 / 206.1 | 6.7 / 167.6 |
| Mean end-tick (not individual survival) | 7,655 | 7,396 | 6,585 |

A-champ finishes with about **4,791 (+25.4%)** more land than stageC and
**5,759 (+32.2%)** more than Run3. Yet its peak-land is **1,343 lower**
than stageC, and its mean held-land is only **143 higher**. Its distinctive
aggregate effect is **reduced late territorial collapse**, not evidence of
much stronger expansion: peak-to-end loss is about **6,134 lower** than
stageC. The group-average ratio of end-land to peak-land is **not**
the reported mean retention; the latter averages per-match ratios.

A-champ did not win more games. Its 20 eliminations equal stageC's,
versus Run3's 18, so the winless result cannot be attributed simply to
more complete personal eliminations. `game-over` defeats and right-censored
tick-limits must be inspected by seed to establish any mechanism.

## Hard

| Metric | A-champ | stageC | Run3 |
|---|---:|---:|---:|
| Victories | 0/48 | 1/48 | 0/48 |
| Defeats / tick-limits | 42 / 6 | 40 / 7 | 45 / 3 |
| Mean end-land | **34,642** | 31,805 | 22,822 |
| Mean held-land | **32,941** | 31,378 | 29,936 |
| Mean peak-land | **49,859** | 48,282 | 48,714 |
| Mean retention | **0.590** | 0.531 | 0.403 |
| Mean peak-to-end loss | **15,217** | 16,565 | 25,892 |
| Mean builds stalled | 355.3 | 333.1 | 269.9 |

A-champ averages about **2,837 (+8.9%)** more final land than stageC
and **11,820 (+51.8%)** more than Run3, but has **0 observed Hard
victories** against stageC's 1. The paired v2 gate correctly does not
promote it based on aggregate territory alone.

## Hypotheses requiring individual match evidence

- **Area preservation without decisive victory:** better end-land and
  less peak-to-end loss may reflect reserve/defense behavior, but these
  aggregates cannot distinguish that from favorable seed outcomes or
  different enemy progress. Pair the trajectories and attack/defense
  timelines.
- **Economy/build pressure:** A-champ records more stalled build events
  on both difficulties than either reference, but counts do not establish
  the cause (unaffordable, bad placement, cooldown, unavailable targets,
  or telemetry duplication). Inspect building type/reasons per seed.
- **Conquest bottleneck:** ~24.6 attack commands but only 0.0625 mean
  `territoryGained` on Impossible. This **could be a receipt/measurement
  issue**, not proof that almost no territory changed; reconcile against
  visible land/enemy-land trajectories and recorded attack results.
- **Marine bridgeheads vs conquest:** A-champ shows more transport arrivals
  and bridgeheads than Run3, but the aggregated report does not
  establish whether they were against enemy rather than neutral land,
  nor whether they survived to game end.
- **A late win condition is unmet:** 0 victories for all models in
  480 Impossible evaluations, but the aggregate has no final
  enemy territories, game-over winner identity, or attack target sequence.
  Do **not** diagnose a specific attack or game-win bug from these counts.

## Map separation: not yet established

The published JSON contains `difficulties.Hard.summary` and
`difficulties.Impossible.summary` plus paired aggregate impacts. It
does **not** contain `map`, `nation`, `seed`, or per-match rows.
The local, gitignored
`benchmark-results/neural-v3-overnight-10h/holdout/`
has the necessary per-match evaluations. Until they are exported,
one cannot say whether A-champ's +25.4% Impossible end-land comes
from **World**, **Europe**, both, or only a small set of matches.

Export exactly the same seeded records for A-champ, stageC, Run3, each
Hard/Impossible, using the local results; publish compact 24-match
World and Europe statistics, then 12-match World-1/World-4/Europe-1/
Europe-4 statistics; a paired per-seed comparison; and outcome/terminal
enemy-land/build/attack evidence. Keep raw logs local. See [issue #98](https://github.com/SLP-DEV1/openfront-bot/issues/98) for
fields and verification gates.

Do not retune the promotion criteria on this holdout or replace
the Run3 live userscript based on this descriptive analysis.
