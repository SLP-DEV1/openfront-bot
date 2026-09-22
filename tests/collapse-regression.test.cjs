'use strict';
// Regression gate for the Phase-1 collapse regression set
// (tools/benchmark/collapse-regression.cjs). No engine needed.
//
// Verifies:
//   - the 17 cells are pinned to the exact, reproducible Hard-holdout
//     parameters (Singleplayer FFA, 0 scripted, balanced, Hard, 18000 ticks)
//   - the 17 cells are precisely the V5-V4-prov-vs-stageC regression cells
//     from docs/training-analysis-neural-v5-curriculum/
//     analyse-17-hard-regressionen.md
//   - the collapse taxonomy (A/B/C) classifier behaves per spec
//   - seed disjointness: the v5hold-* regression seeds are distinct from
//     the v6train-* / v6hold-* seeds so the promotion grid stays disjoint
//   - (if the baseline report exists) exact reproducibility 17/17 and the
//     6A/2B/9C split recorded against the pinned historical holdout

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const mod = require(path.join(ROOT, 'tools', 'benchmark', 'collapse-regression.cjs'));
const { CELLS, CELL_PARAMS, cellKey, stats, classifyType } = mod;

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (e) { console.error('FAIL - ' + name + '\n  ' + (e && e.stack || e)); process.exitCode = 1; }
}

// The 17 regression cells (seed, map, nation). Must match the analysis.
const EXPECTED_CELLS = [
  ['v5hold-0', 'World', 1], ['v5hold-0', 'Europe', 1], ['v5hold-0', 'Europe', 4],
  ['v5hold-1', 'Europe', 1], ['v5hold-1', 'Europe', 4], ['v5hold-2', 'World', 1],
  ['v5hold-2', 'Europe', 4], ['v5hold-3', 'World', 1], ['v5hold-3', 'World', 4],
  ['v5hold-3', 'Europe', 4], ['v5hold-4', 'World', 1], ['v5hold-4', 'World', 4],
  ['v5hold-5', 'World', 1], ['v5hold-5', 'Europe', 4], ['v5hold-6', 'World', 4],
  ['v5hold-10', 'Europe', 4], ['v5hold-11', 'World', 1],
];
const EXPECTED_KEYS = new Set(EXPECTED_CELLS.map((c) => cellKey(c[0], c[1], c[2])));

check('17 regression cells, exact set', () => {
  assert.equal(CELLS.length, 17);
  const keys = new Set(CELLS.map((c) => cellKey(c[0], c[1], c[2])));
  assert.deepEqual([...keys].sort(), [...EXPECTED_KEYS].sort());
});

check('pinned reproducible cell parameters', () => {
  assert.equal(CELL_PARAMS.gameType, 'Singleplayer');
  assert.equal(CELL_PARAMS.gameMode, 'FFA');
  assert.equal(CELL_PARAMS.scriptedHumans, 0);
  assert.equal(CELL_PARAMS.opponentProfile, 'balanced');
  assert.equal(CELL_PARAMS.bots, 0);
  assert.equal(CELL_PARAMS.difficulty, 'Hard');
  assert.equal(CELL_PARAMS.ticks, 18000);
  assert.equal(CELL_PARAMS.size, 'Compact');
  assert.equal(CELL_PARAMS.profile, 'autonomous');
});

check('regression seeds are v5hold-* only (disjoint from v6 seeds)', () => {
  const seeds = new Set(CELLS.map((c) => c[0]));
  for (const s of seeds) assert.match(s, /^v5hold-\d+$/, 'unexpected seed ' + s);
  for (const s of seeds) {
    assert.ok(!s.startsWith('v6train-'), 'v6train seed in regression set: ' + s);
    assert.ok(!s.startsWith('v6hold-'), 'v6hold seed in regression set: ' + s);
  }
});

// --- Classifier: synthetic matches -----------------------------------------
const mkMatch = (endTick, land, peak, peakTick, c50, outcome) => ({
  trajectory: { samples: [{ tick: 0, land: 0 }, { tick: peakTick, land: peak },
    ...(c50 != null ? [{ tick: c50, land: peak * 0.4 }] : [])] },
  gameEnd: { tick: endTick, land, outcome },
  run: { termination: outcome === 'defeat' && land === 0 ? 'eliminated' : 'tick-limit' },
});

check('Type A: early total wipe (eliminated, land 0, before 6500, peak > 10k)', () => {
  const v = stats(mkMatch(4900, 0, 15547, 4200, null, 'defeat'));
  const c = stats(mkMatch(13101, 0, 18903, 7200, null, 'defeat'));
  assert.equal(classifyType(v, c), 'A');
});
check('Type B: large peak (>60k) then collapse, reference did not lose', () => {
  const v = stats(mkMatch(12451, 109000, 301000, 9600, 12400, 'defeat'));
  const c = stats(mkMatch(18000, 274000, 318000, 13200, null, 'incomplete'));
  assert.equal(classifyType(v, c), 'B');
});
check('Type C: early death / late deficit (neither A nor B)', () => {
  const v = stats(mkMatch(12001, 28600, 50000, 5000, null, 'defeat'));
  const c = stats(mkMatch(11341, 129500, 140000, 9000, null, 'victory'));
  assert.equal(classifyType(v, c), 'C');
});
check('Type C: peak > 60k collapse does NOT count as B if reference also lost', () => {
  const v = stats(mkMatch(11561, 27700, 158000, 6200, 9600, 'defeat'));
  const c = stats(mkMatch(10000, 0, 150000, 8000, 11000, 'defeat'));
  assert.equal(classifyType(v, c), 'C');
});

// --- Historical reproducibility report (if present) ------------------------
const REPORT = path.join(ROOT, 'benchmark-results', 'v6-collapse-regression', 'v5-baseline', 'collapse-regression.json');
if (fs.existsSync(REPORT)) {
  const rep = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  check('baseline report: 17/17 exactly reproducible', () => {
    assert.equal(rep.rows.length, 17);
    assert.equal(rep.historicalReproducible, '17/17');
  });
  check('baseline report: 6 Type A, 2 Type B, 9 Type C', () => {
    assert.deepEqual(rep.typeCounts, { A: 6, B: 2, C: 9 });
  });
} else {
  console.log('skip - baseline report not present (run collapse-regression.cjs to generate)');
}

console.log(`\n${passed} checks passed`);
