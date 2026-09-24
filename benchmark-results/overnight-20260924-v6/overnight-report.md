# Overnight Autonomous Campaign — Report

**Campaign:** `overnight-20260924-v6`
**Goal:** produce a **demonstrably-stronger** neural candidate (new SHA / lower MSE / more `changedIntent` are NOT enough). If no improvement is proven within the 5-hour budget, document why and deliver the best-checked candidate **without** a false promotion.

## Timeline (monotonic)

| event | UTC |
|---|---|
| **5h campaign window starts** (Step 2 done; V6 collapse + V7 training begin) | 2026-09-24T03:12:13Z |
| Step 2 regression re-run definitive (59 pass / 2 fail) | 2026-09-24T04:18:51Z |
| V7 training complete (`v7-mixed-public` provisional) | 2026-09-24T04:29:14Z |
| o7hold Final-Holdout seeds frozen | 2026-09-24T04:56:50Z |
| o7hold 192/192 matches done + promotion decision | 2026-09-24T05:04:49Z |
| **Wrap-up / this report** | 2026-09-24T05:05Z |

**Elapsed campaign time: ≈ 1h52m** (well within the 5-hour monotonic budget). The V6 independent holdout (960 matches) completed just before this window.

## Step-by-step

### Step 1 — Git security + model inventory ✅
- Working tree secured; **CRLF root cause fixed** (`.gitattributes` `eol=lf` pin for byte-sensitive build artifacts, commit `375afd7`). Origin/main integrated **without** deleting local work (backup branch `backup/main-pre-integration-20260924`).
- Model inventory built: **stageC** (policy `84d1f593…`, file `d2a5fce3…`), **run3** (policy `e0fceaef…`, file `65589feb…`, live champion), V5-V4-prov (schema-5), V6 candidates. All SHAs verified. Start point: V6-Collapse Schema-4 line.

### Step 2 — Reproducible #133 + regression suites ✅
- Reproducible #133 verified; canonical Solo/Run3 builds verified.
- **Definitive: 59 pass / 2 fail.** All 5 CRLF hard-safety tests PASS after `375afd7`.
- **2 explained failures (not regressions):**
  - `league-smoke-separation` — engine mismatch (expected `13b40338`, got `bb8af015`); expected during training, **fixed by restoring the engine to `13b40338` at wrap-up**.
  - `strategy-regression` (23) — pre-existing on origin/main (verified via 3-state worktree comparison); not hard-safety.

### Step 3 / 6 — Training + evaluation (V6 line + V7 variants) ✅
- **V6 line:** holdout 960/960 verified; collapse done; **NO PROMOTION** (`v6-final-holdout/decision.json`).
- **V7 variants (3, genuinely different regimes):** `v7-rush-stageC` (5 gens), `v7-defender-run3` (4 gens), `v7-mixed-public` (4 gens, Public multi-player). **Candidate selected:** `v7-mixed-public` — only variant that beat stageC in training final-gen.

### Step 4 — Diagnosis ✅
- `diagnosis.md` written: 8 sections; P1–P5 bottlenecks → V7 variants. **Posture-Bot OOD caveat** noted (the V6 native validation bot ≠ the main-solo comparison bot, so V6 candidates are tested out-of-distribution — a conservative bias).

### Step 7 — Fresh Final-Holdout + promotion decision ✅
- **192 matches** (3 modes × 4 arms × 8 seeds × 2 maps), all verified, on engine `bb8af015` / bot `3c149957…`.
- **Gate result: `no-verified-improvement` for all 9 candidate-vs-reference comparisons.** See `evaluation.md`.
- **`promote: false`** (candidate beat 0/3 modes vs each reference; required ≥2/3).

## Final decision

- **Best checked candidate:** `v7-mixed-public` (policy `4c5848c9…`, schema-4) — **delivered, not promoted**.
- **Why no promotion:** the candidate is a near-wash against its parent stageC (higher 1v1 land, tied official-2v2 wins, but per-seed survival gains don't clear the gate) and is weaker than the run3 champion in 1v1/ffa-duo land and official-2v2 wins. This **matches the independent V6 result** — two neural lines both converge to no verified improvement over stageC.
- **Active champion unchanged:** Run3 schema-4 `65589feb…` (file-SHA verified unchanged). No live userscript swapped; no gate weakened.

## Constraints honored

- Run3 schema-4 champion stays **active/unchanged** (`65589feb…` verified).
- **No auto model swap**; no weakened gates; no blind overwrite of main; no `git reset --hard` / `clean -fd` / force-push on a dirty tree.
- **Engine repo restored to `13b40338`** at wrap-up (fixes `league-smoke-separation`).
- Preserved: 2 stashes, `.tmp-*` files, `.ci/`, backup branch, worktrees.

## Artifacts

- `evaluation.md`, `overnight-report.md` (this file), `campaign-state.json`
- `o7hold/` — seeds-manifest.json, holdout.json, promotion-decision.json, matches/ (192)
- `v6-final-holdout/` — decision.json, summary.json (V6 line)
- `v7-mixed-public/provisional.json` (candidate), `v7-rush-stageC/`, `v7-defender-run3/`
- `regression-summary.json`, `diagnosis.md`, `model-inventory.md`
