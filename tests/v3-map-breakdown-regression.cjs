'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Issue #98 regression gate for the committed World/Europe map breakdown.
//
// The raw holdout under benchmark-results/ is local + gitignored, so this
// test validates the committed artifact
//   docs/training-analysis-neural-v3-overnight/map-breakdown.json
// that tools/benchmark/v3-map-breakdown.mjs exported from it. The gate
// asserts that the export is faithful and honest:
//   - pinned model/bot/engine provenance on every record
//   - exactly 48 matches per model/difficulty, all verified, none missing
//   - the per-map / per-nation split covers exactly 12 seeds x {World,
//     Europe} x {1,4} with no duplicates (no fabricated rows)
//   - missing values are null, never zero, and every mean discloses n
//   - the per-map split reproduces the published global mean end-land
//   - the paired per-seed diffs are null-honest and consistent with A/B

const OUT = path.join(
  __dirname,
  '..',
  'docs',
  'training-analysis-neural-v3-overnight',
  'map-breakdown.json'
);

// Pinned provenance (issue #98).
const EXPECTED = {
  botSHA256: '008c1a2536cd9ef324a6372de7f65c7400bb9587c46dca8c74e0d3f3a4dff246',
  engineCommit: 'bb8af015b515b3b717bd4d901074c5f4c16641cb',
  models: {
    'A-champ': '0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5',
    stageC: '84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1',
    run3: 'e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968',
  },
};

const DIFFICULTIES = ['Hard', 'Impossible'];
const MAPS = ['World', 'Europe'];
const NATIONS = [1, 4];
const SEEDS = Array.from({length: 12}, (_, i) => `v3hold-${i}`);
const MODELS = Object.keys(EXPECTED.models);
const EXPECTED_PER_MODEL = SEEDS.length * MAPS.length * NATIONS.length; // 48
const PAIRINGS = [
  {key: 'A-champ_vs_stageC', a: 'A-champ', b: 'stageC'},
  {key: 'A-champ_vs_Run3', a: 'A-champ', b: 'run3'},
];

// Published global mean end-land over all 48 matches (issue #98 target).
// The per-map split must reproduce these within 2-decimal rounding.
const EXPECTED_GLOBAL_END_LAND = {
  Hard: {'A-champ': 34641.92, stageC: 31805.31, run3: 22822.00},
  Impossible: {'A-champ': 23638.65, stageC: 18847.73, run3: 17879.23},
};

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
// null-honest scalar: a finite number or null. Never undefined, string, or NaN.
const isHonest = (v) => v === null || isFiniteNumber(v);
// a disclosed mean: {mean, n} with n an integer in [0, cap]; mean null iff n===0.
function assertDisclosedMean(label, m, cap) {
  assert.ok(m && typeof m === 'object', `${label}: mean must be an object`);
  assert.ok(Number.isInteger(m.n) && m.n >= 0 && m.n <= cap,
    `${label}: n=${m.n} must be an integer in [0, ${cap}]`);
  if (m.n === 0) assert.equal(m.mean, null, `${label}: n=0 requires mean=null (not 0)`);
  else assert.ok(isFiniteNumber(m.mean),
    `${label}: n=${m.n} requires a finite mean, got ${m.mean}`);
}

const json = JSON.parse(fs.readFileSync(OUT, 'utf8'));

// ---- source-level provenance ----
assert.equal(json.source.botSHA256, EXPECTED.botSHA256, 'source botSHA256 must be pinned');
assert.equal(json.source.engineCommit, EXPECTED.engineCommit, 'source engineCommit must be pinned');

// ---- per model x difficulty: grid, provenance, honesty, reproducibility ----
for (const model of MODELS) {
  const expectedPolicy = EXPECTED.models[model];
  assert.ok(json.models[model], `models.${model} missing`);
  for (const difficulty of DIFFICULTIES) {
    const bd = json.models[model][difficulty];
    assert.ok(bd, `${model}/${difficulty} missing`);

    // 48 matches, all verified, none missing, no provenance mismatches.
    assert.equal(bd.provenance.matches, EXPECTED_PER_MODEL,
      `${model}/${difficulty}: matches must be ${EXPECTED_PER_MODEL}`);
    assert.equal(bd.provenance.verified, EXPECTED_PER_MODEL,
      `${model}/${difficulty}: all ${EXPECTED_PER_MODEL} matches must be verified`);
    assert.equal(bd.provenance.matchMissing, 0,
      `${model}/${difficulty}: no match may be missing`);
    assert.deepEqual(bd.provenance.provenanceMismatches, [],
      `${model}/${difficulty}: provenance mismatches must be empty`);
    assert.equal(bd.provenance.expectedPolicy, expectedPolicy,
      `${model}/${difficulty}: pinned policy SHA mismatch`);
    assert.equal(bd.provenance.expectedBot, EXPECTED.botSHA256);
    assert.equal(bd.provenance.expectedEngine, EXPECTED.engineCommit);

    // no duplicate rows reported by the exporter
    assert.ok(!bd.duplicateKeys || bd.duplicateKeys.length === 0,
      `${model}/${difficulty}: duplicate keys reported: ${JSON.stringify(bd.duplicateKeys)}`);

    // ---- grid: 24 per map, 12 per map-nation, exact 12-seed coverage ----
    const seen = new Set();
    for (const map of MAPS) {
      const cell = bd.perMap[map];
      assert.ok(cell, `${model}/${difficulty}/${map}: perMap cell missing`);
      assert.equal(cell.records.length, 24,
        `${model}/${difficulty}/${map}: must have 24 records`);
      for (const nation of NATIONS) {
        const nationCell = bd.perMapNation[`${map}-${nation}`];
        assert.ok(nationCell, `${model}/${difficulty}/${map}-${nation}: cell missing`);
        assert.equal(nationCell.records.length, 12,
          `${model}/${difficulty}/${map}-${nation}: must have 12 records`);
        for (const r of nationCell.records) {
          assert.equal(r.map, map, `${model}/${difficulty}: wrong map in cell`);
          assert.equal(r.nation, nation, `${model}/${difficulty}: wrong nation in cell`);
          assert.ok(SEEDS.includes(r.seed),
            `${model}/${difficulty}: unexpected seed ${r.seed}`);
          // provenance on every record
          assert.equal(r.policySHA256, expectedPolicy,
            `${model}/${difficulty} ${r.seed}-${map}-${nation}: policy SHA`);
          assert.equal(r.botSHA256, EXPECTED.botSHA256,
            `${model}/${difficulty} ${r.seed}-${map}-${nation}: bot SHA`);
          assert.equal(r.engineCommit, EXPECTED.engineCommit,
            `${model}/${difficulty} ${r.seed}-${map}-${nation}: engine commit`);
          // honest scalars on the land metrics
          for (const f of ['endLand', 'peakLand', 'meanLand', 'retention', 'lostFromPeak', 'endTick']) {
            assert.ok(isHonest(r[f]),
              `${model}/${difficulty} ${r.seed}-${map}-${nation}: ${f} must be null or a finite number, got ${r[f]}`);
          }
          const key = `${map}|${nation}|${r.seed}`;
          assert.ok(!seen.has(key),
            `${model}/${difficulty}: duplicate row ${key}`);
          seen.add(key);
        }
      }
    }
    // exactly 48 unique (map, nation, seed) rows, none missing
    assert.equal(seen.size, EXPECTED_PER_MODEL,
      `${model}/${difficulty}: expected ${EXPECTED_PER_MODEL} unique rows, got ${seen.size}`);
    const expectedKeys = new Set(
      MAPS.flatMap((map) => NATIONS.flatMap((nation) => SEEDS.map((seed) => `${map}|${nation}|${seed}`)))
    );
    assert.deepEqual([...seen].sort(), [...expectedKeys].sort(),
      `${model}/${difficulty}: row grid does not match the seeded grid`);

    // ---- disclosed means on every aggregate (perMap + perMapNation) ----
    for (const [cellName, cell] of Object.entries({
      ...bd.perMap,
      ...Object.fromEntries(Object.entries(bd.perMapNation)),
    })) {
      const cap = cell.records.length;
      assert.equal(cell.aggregate.n, cap, `${model}/${difficulty}/${cellName}: aggregate.n`);
      assert.equal(cell.aggregate.verified, cap, `${model}/${difficulty}/${cellName}: all verified`);
      assert.equal(cell.aggregate.matchMissing, 0, `${model}/${difficulty}/${cellName}: no missing`);
      for (const [metric, m] of Object.entries(cell.aggregate.means)) {
        assertDisclosedMean(`${model}/${difficulty}/${cellName}.${metric}`, m, cap);
      }
    }

    // ---- the per-map split reproduces the published global mean end-land ----
    const all = [...bd.perMap.World.records, ...bd.perMap.Europe.records];
    const vals = all.map((r) => r.endLand).filter((x) => x != null);
    assert.equal(vals.length, EXPECTED_PER_MODEL,
      `${model}/${difficulty}: end-land denominator must be 48`);
    const globalMean = vals.reduce((s, x) => s + x, 0) / vals.length;
    const target = EXPECTED_GLOBAL_END_LAND[difficulty][model];
    assert.ok(Math.abs(globalMean - target) <= 0.01,
      `${model}/${difficulty}: global mean end-land ${globalMean.toFixed(4)} must reproduce ${target}`);
    // and the disclosed per-map means, recombined by their denominators, agree
    const wMean = bd.perMap.World.aggregate.means.endLand;
    const eMean = bd.perMap.Europe.aggregate.means.endLand;
    assert.ok(wMean.n + eMean.n === EXPECTED_PER_MODEL,
      `${model}/${difficulty}: per-map end-land denominators must sum to 48`);
    const weighted = (wMean.mean * wMean.n + eMean.mean * eMean.n) / (wMean.n + eMean.n);
    assert.ok(Math.abs(weighted - target) <= 0.01,
      `${model}/${difficulty}: weighted per-map end-land ${weighted} must reproduce ${target}`);
  }
}

// ---- paired per-seed comparisons: null-honest diffs, consistent results ----
for (const pair of PAIRINGS) {
  const p = json.paired[pair.key];
  assert.ok(p, `paired.${pair.key} missing`);
  assert.equal(p.a, pair.a, `${pair.key}: side A`);
  assert.equal(p.b, pair.b, `${pair.key}: side B`);
  // 96 records = 2 difficulties x 12 seeds x 2 maps x 2 nations
  const expectedPairs = DIFFICULTIES.length * SEEDS.length * MAPS.length * NATIONS.length;
  assert.equal(p.records.length, expectedPairs,
    `${pair.key}: must have ${expectedPairs} paired records`);

  const pairSeen = new Set();
  for (const r of p.records) {
    const k = `${r.difficulty}|${r.map}|${r.nation}|${r.seed}`;
    assert.ok(!pairSeen.has(k), `${pair.key}: duplicate paired row ${k}`);
    pairSeen.add(k);
    const {A, B, diff} = r;
    assert.ok(A && B, `${pair.key} ${k}: both sides must be present`);
    // every diff field is null-honest and null exactly when a side is null
    for (const f of Object.keys(diff)) {
      const x = A[f], y = B[f];
      if (x == null || y == null) {
        assert.equal(diff[f], null,
          `${pair.key} ${k}: diff.${f} must be null when a side is null (got ${diff[f]})`);
      } else {
        assert.ok(isFiniteNumber(diff[f]), `${pair.key} ${k}: diff.${f} must be finite`);
        assert.ok(Math.abs(diff[f] - (x - y)) < 1e-6,
          `${pair.key} ${k}: diff.${f} must equal A-B`);
      }
    }
    // result is consistent with the end-land diff
    if (diff.endLand == null) {
      assert.equal(r.result, 'missing', `${pair.key} ${k}: missing end-land diff must be result=missing`);
    } else if (diff.endLand > 0) {
      assert.equal(r.result, 'win', `${pair.key} ${k}: positive end-land diff must be win`);
    } else if (diff.endLand < 0) {
      assert.equal(r.result, 'loss', `${pair.key} ${k}: negative end-land diff must be loss`);
    } else {
      assert.equal(r.result, 'tie', `${pair.key} ${k}: zero end-land diff must be tie`);
    }
  }
  assert.equal(pairSeen.size, expectedPairs, `${pair.key}: paired grid not unique`);

  // per-map win/loss/tie aggregates are internally consistent
  for (const [bk, agg] of Object.entries(p.perMap)) {
    const [difficulty, map] = bk.split('/');
    const sub = p.records.filter((x) => x.difficulty === difficulty && x.map === map);
    assert.equal(agg.n, sub.length, `${pair.key} ${bk}: n must match the sub-set`);
    assert.equal(agg.wins, sub.filter((x) => x.result === 'win').length, `${pair.key} ${bk}: wins`);
    assert.equal(agg.losses, sub.filter((x) => x.result === 'loss').length, `${pair.key} ${bk}: losses`);
    assert.equal(agg.ties, sub.filter((x) => x.result === 'tie').length, `${pair.key} ${bk}: ties`);
    assert.equal(agg.missing, sub.filter((x) => x.result === 'missing').length, `${pair.key} ${bk}: missing`);
    assert.equal(agg.n, SEEDS.length * NATIONS.length,
      `${pair.key} ${bk}: must span all ${SEEDS.length * NATIONS.length} seeds/nations for that difficulty+map`);
  }
}

console.log(`PASS v3-map-breakdown: ${MODELS.length * DIFFICULTIES.length} model/difficulty grids (48 each), provenance, grid uniqueness, null-honesty, and ${PAIRINGS.length} paired comparisons verified`);


// Issue #105: exercise the exporter's real numeric normalizer against nullish
// and zero inputs, and confirm missing values do not count toward mean n.
{
  const exporter = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'benchmark', 'v3-map-breakdown.mjs'), 'utf8'
  );
  const vm = require('node:vm');
  const helper = exporter.match(/const num = \(v\) => \{[\s\S]*?\n\};/);
  assert.ok(helper, 'exporter must declare the null-honest num helper');
  const num = vm.runInNewContext(helper[0] + '\nnum;');
  assert.equal(num(null), null, 'explicit JSON null stays null');
  assert.equal(num(undefined), null, 'undefined stays null');
  assert.equal(num(''), null, 'blank string stays null');
  assert.equal(num('  '), null, 'whitespace-only string stays null');
  assert.equal(num(0), 0, 'real zero stays zero');
  assert.equal(num('12.5'), 12.5, 'valid numeric text stays numeric');
  const values = [num(null), num(undefined), num(0), num(12)];
  const disclosed = values.filter((x) => x != null);
  assert.equal(disclosed.length, 2, 'null observations do not increase denominator');
  assert.equal(disclosed.reduce((a, b) => a + b, 0) / disclosed.length, 6,
    'real zero contributes to mean and denominator');
}
