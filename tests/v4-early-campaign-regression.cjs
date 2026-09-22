'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

// Regression gate for the Neural V4 "Early Survival & Expansion" campaign
// driver (tools/benchmark/v4-early-campaign.mjs).
//
// The campaign runs locally against the pinned official engine; this test
// does NOT need an engine. It verifies, from the driver's own frozen plan:
//   - pinned provenance (engine commit, bot SHA, reference model SHAs,
//     schema-4 zero model digest)
//   - the early-game training focus: 7200-tick matches on Impossible/World,
//     10 generations x 58 matches
//   - the independent paired holdout: Hard + Impossible x World + Europe
//     x nations 1/4 x 12 v4hold-* seeds, 18000 ticks, 480 base matches
//   - seed disjointness: v4hold-* seeds are distinct from every v3hold-*
//     and from the trainer's train/eval seed format
//   - the evaluation-v2 gate contract the driver relies on (victory
//     primary, collapse guard, right-censored tick limits, fail-closed
//     on short/unpaired/invalid samples)
//   - candidate materialization: a completed train() writes every candidate
//     policy into models-source/<label>.json (the layout the holdout phase
//     consumes) and records matching SHAs in training-candidates.json
//   - report pairing: comparePaired() must map rows through gateRow before
//     pairing, or valid samples collapse to N=0 (regression: the gate
//     reported 0 pairs despite 480 verified holdout matches)

const ROOT = path.join(__dirname, '..');
const DRIVER = path.join(ROOT, 'tools', 'benchmark', 'v4-early-campaign.mjs');
const policyV4 = require(path.join(ROOT, 'trainer', 'strategic-policy-v4.cjs'));
const evaluationV2 = require(path.join(ROOT, 'trainer', 'evaluation-v2.cjs'));

const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');

// Pinned campaign provenance.
const EXPECTED = {
  engineCommit: 'bb8af015b515b3b717bd4d901074c5f4c16641cb',
  botSHA256: '008c1a2536cd9ef324a6372de7f65c7400bb9587c46dca8c74e0d3f3a4dff246',
  references: {
    zero: 'a1e8b35677991f244e55c7734e21caa5a4f6cb6086192bef9857e3265084127e',
    stageC: '84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1',
    run3: 'e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968',
    'A-champ': '0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5',
  },
  training: {
    difficulty: 'Impossible', maps: ['World'], nations: [1, 4], ticks: 7200,
    generations: 10, population: 6, trainSeeds: 3, evalSeeds: 4,
    sigma: 0.12, parallel: 16, matchesPerGeneration: 58, totalMatches: 580,
  },
  holdout: {
    difficulties: ['Hard', 'Impossible'], maps: ['World', 'Europe'],
    nations: [1, 4], ticks: 18000, matchesPerModelPerDifficulty: 48,
    baseMatches: 480, maxMatches: 576,
  },
};
const SEEDS = Array.from({length: 12}, (_, i) => `v4hold-${i}`);
const V3_SEEDS = Array.from({length: 12}, (_, i) => `v3hold-${i}`);

// ---- driver dry-run plan ----
assert.ok(fs.existsSync(DRIVER), 'driver missing: tools/benchmark/v4-early-campaign.mjs');
const run = (phase) => {
  const r = spawnSync(process.execPath, [DRIVER, phase, '--dryRun', 'true'],
    {cwd: ROOT, encoding: 'utf8'});
  assert.equal(r.status, 0, `driver ${phase} --dryRun failed:\n${r.stdout}\n${r.stderr}`);
  const lines = r.stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
};
const plan = run('setup');

// Provenance pins.
assert.equal(plan.engineCommit, EXPECTED.engineCommit, 'engine commit pin');
assert.equal(plan.botSHA256, EXPECTED.botSHA256, 'bot SHA pin');
assert.equal(plan.schema, 4, 'schema must be 4');
assert.equal(plan.gate, 'evaluation-v2', 'gate must be the unchanged evaluation-v2');
assert.equal(plan.autoDeploy, false, 'no automatic live swap');
assert.equal(plan.officialChampion, 'stageC', 'stageC stays official champion');
assert.equal(plan.initialModel, 'A-champ', 'A-champ is the experimental start model');
for (const [label, sha] of Object.entries(EXPECTED.references))
  assert.equal(plan.references?.[label], sha, `reference ${label} pin`);

// Early-game training focus.
for (const [key, value] of Object.entries(EXPECTED.training))
  assert.deepEqual(plan.training?.[key], value, `training.${key} must be frozen`);

// Holdout grid.
for (const [key, value] of Object.entries(EXPECTED.holdout))
  assert.deepEqual(plan.holdout?.[key], value, `holdout.${key} must be frozen`);
assert.deepEqual(plan.holdout?.seeds, SEEDS, 'holdout seeds must be v4hold-0..11');
assert.equal(plan.holdout?.profile, 'autonomous', 'holdout profile must be autonomous');
assert.equal(plan.holdout?.gameMode, 'FFA', 'holdout must be FFA');
assert.equal(plan.holdout?.scriptedHumans, 0, 'holdout must run 0 scripted humans');
assert.equal(plan.holdout?.opponentProfile, 'balanced', 'holdout opponent profile');

// ---- seed disjointness ----
for (const seed of SEEDS) assert.match(seed, /^v4hold-\d{1,2}$/);
assert.equal(new Set(SEEDS).size, 12, 'v4hold seeds must be distinct');
for (const v3 of V3_SEEDS)
  assert.ok(!SEEDS.includes(v3), `v4hold seed must not reuse v3 seed ${v3}`);
// Trainer seed format (train.mjs): (train|eval)-<gen>-<k>-<Map>-<nation>.
const trainerSeed = (phase, g, k, map, nation) => `${phase}-${g}-${k}-${map}-${nation}`;
for (const phase of ['train', 'eval'])
  for (let g = 1; g <= 10; g++)
    for (let k = 0; k < 4; k++)
      for (const map of ['World', 'Europe'])
        for (const nation of [1, 4])
          assert.ok(!SEEDS.includes(trainerSeed(phase, g, k, map, nation)),
            'v4hold seeds must not collide with trainer train/eval seeds');

// ---- zero model digest matches the pinned reference ----
const zero = policyV4.validate(policyV4.zero());
assert.equal(digest(JSON.stringify(zero)), EXPECTED.references.zero,
  'policyV4.zero() digest must equal the pinned zero reference');

// ---- evaluation-v2 gate contract (as consumed by the driver) ----
const row = (seed, outcome, endTick, land) => ({
  difficulty: 'Impossible', map: 'World', nation: 1,
  gameType: 'Singleplayer', gameMode: 'FFA', scriptedHumans: 0,
  opponentProfile: 'balanced', seed,
  outcome, validSample: true, exitCode: 0, endTick, land,
});
const N = 48;
const base = (suffix) => Array.from({length: N},
  (_, i) => row(`${suffix}-${i}`, 'defeat', 4000 + i, 20000));

// Equal wins: candidate must show repeatable gains, zero regressions,
// and a real territory gain (>= 10000 total area, per-seed threshold
// max(500, 8% of incumbent land)).
{
  const inc = base('inc');
  const cand = inc.map((r) => ({...r, land: r.land + 2000})); // +96k total area
  const c = evaluationV2.compare(inc, cand);
  assert.equal(c.valid, true);
  assert.equal(c.promoted, true,
    'equal wins with 0 regressions and >= 10000 area gain must promote');
}
// One extra victory, but net negative per-seed balance: no promotion.
{
  const inc = base('inc');
  const cand = inc.map((r, i) =>
    i === 0 ? {...r, outcome: 'victory'} : r);
  // Two seeds where the candidate collapses early (rank equal, much shorter).
  cand[10] = {...cand[10], endTick: 1000, land: 15000};
  cand[11] = {...cand[11], endTick: 1000, land: 15000};
  const c = evaluationV2.compare(inc, cand);
  assert.equal(c.valid, true);
  assert.equal(c.incumbentWins, 0);
  assert.equal(c.candidateWins, 1);
  assert.equal(c.regressed, 2, 'early collapses must count as regressions');
  assert.equal(c.net, -1, 'one win minus two regressions is net negative');
  assert.equal(c.promoted, false,
    'one extra win with negative net balance must not promote');
}
// Right-censoring: a tick limit is never a victory.
{
  const inc = base('inc');
  const cand = inc.map((r) => ({...r, outcome: 'incomplete', endTick: 18000}));
  const c = evaluationV2.compare(inc, cand);
  assert.equal(c.candidateWins, 0, 'tick limits must not count as victories');
  assert.ok(c.improved >= N / 2, 'survival to the limit beats early defeats');
}
// Fail-closed: short samples, duplicate/missing pairings, non-finite values.
{
  const short = [row('a-1', 'defeat', 1000, 10000), row('a-2', 'defeat', 1000, 10000)];
  assert.equal(evaluationV2.compare(short.slice(0, 1), short.slice(0, 1)).valid, false);
  const dup = short.map((r) => ({...r, seed: 'a-1'}));
  assert.equal(evaluationV2.compare(dup, dup).valid, false,
    'duplicate pair keys must invalidate');
  const badTick = short.map((r, i) => i === 0 ? {...r, endTick: Number.NaN} : r);
  assert.equal(evaluationV2.compare(badTick, short).valid, false,
    'non-finite endTick must invalidate');
  const badLand = short.map((r, i) => i === 1 ? {...r, land: null} : r);
  assert.equal(evaluationV2.compare(short, badLand).valid, false,
    'non-finite land must invalidate');
  const badExit = short.map((r, i) => i === 1 ? {...r, exitCode: 1} : r);
  assert.equal(evaluationV2.compare(short, badExit).valid, false,
    'non-zero exit code must invalidate');
}

// ---- candidate materialization (train phase, completed-training path) ----
// The holdout phase consumes every model from models-source/<label>.json,
// but training only produces training/provisional.json (+ champion.json).
// A completed train() must materialize each candidate into that layout and
// record the matching SHA in training-candidates.json (regression: all
// V4-prov holdout matches failed with "Missing model V4-prov.json").
{
  const os = require('node:os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-train-'));
  const training = path.join(out, 'training');
  fs.mkdirSync(training, {recursive: true});
  fs.writeFileSync(path.join(out, 'campaign.json'), JSON.stringify({
    engineCommit: EXPECTED.engineCommit,
    botSHA256: EXPECTED.botSHA256,
    references: EXPECTED.references,
  }));
  // Completed-training marker state: plan + full history + final model.
  const provModel = policyV4.validate(policyV4.zero());
  const champModel = policyV4.mutate(provModel, 'v4-regression-champ', 0.3);
  fs.writeFileSync(path.join(training, 'plan.json'), JSON.stringify({fixture: true}));
  fs.writeFileSync(path.join(training, 'history.json'), JSON.stringify({
    history: Array.from({length: 10}, (_, i) => ({generation: i + 1})),
  }));
  fs.writeFileSync(path.join(training, 'provisional.json'), JSON.stringify(provModel));
  fs.writeFileSync(path.join(training, 'champion.json'), JSON.stringify(champModel));

  const r = spawnSync(process.execPath, [DRIVER, 'train', '--out', out],
    {cwd: ROOT, encoding: 'utf8'});
  assert.equal(r.status, 0, `driver train (completed path) failed:\n${r.stdout}\n${r.stderr}`);

  const state = JSON.parse(fs.readFileSync(path.join(out, 'training-candidates.json'), 'utf8'));
  const byLabel = Object.fromEntries(state.candidates.map((c) => [c.label, c]));
  assert.deepEqual(Object.keys(byLabel).sort(), ['V4-champ', 'V4-prov'],
    'candidate list must cover provisional and diverged champion');
  assert.equal(byLabel['V4-prov'].policySHA256, policyV4.sha(provModel),
    'V4-prov SHA must be the final provisional policy digest');
  assert.equal(byLabel['V4-champ'].policySHA256, policyV4.sha(champModel),
    'V4-champ SHA must be the in-loop champion digest');
  // Holdout layout: every candidate must exist under models-source/<label>.json.
  for (const [label, model] of [['V4-prov', provModel], ['V4-champ', champModel]]) {
    const file = path.join(out, 'models-source', `${label}.json`);
    assert.ok(fs.existsSync(file), `models-source/${label}.json must be materialized`);
    const loaded = policyV4.validate(JSON.parse(fs.readFileSync(file, 'utf8')));
    assert.equal(policyV4.sha(loaded), byLabel[label].policySHA256,
      `models-source/${label}.json must match the recorded candidate SHA`);
  }
  fs.rmSync(out, {recursive: true, force: true});
}

// ---- report phase pairing (regression: pairs must not collapse to 0) ----
// A synthetic 480-match holdout OUT where the candidate beats every
// reference on identical pairings. comparePaired() must map rows through
// gateRow before pairing; raw rows lack `validSample`, so the old code
// skipped every pair and reported N=0 despite 480 verified matches.
{
  const os = require('node:os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-report-'));
  const provSha = 'c'.repeat(64); // stand-in digest for the candidate policy
  const shaFor = (model) => model === 'V4-prov' ? provSha : EXPECTED.references[model];
  fs.writeFileSync(path.join(out, 'campaign.json'), JSON.stringify({
    engineCommit: EXPECTED.engineCommit,
    botSHA256: EXPECTED.botSHA256,
    references: EXPECTED.references,
  }));
  fs.writeFileSync(path.join(out, 'training-candidates.json'), JSON.stringify({
    candidates: [{
      label: 'V4-prov', file: 'training/provisional.json',
      policySHA256: provSha, origin: 'regression fixture',
    }],
  }));
  const h = plan.holdout; // frozen grid: 12 seeds x 2 maps x 2 nations
  const models = [...Object.keys(EXPECTED.references), 'V4-prov'];
  for (const difficulty of h.difficulties)
    for (const model of models)
      h.seeds.forEach((seed, i) => {
        for (const map of h.maps)
          for (const nation of h.nations) {
            const dir = path.join(out, 'holdout', `difficulty-${difficulty}`,
              'matches', model, `${seed}-${map}-${nation}`);
            fs.mkdirSync(dir, {recursive: true});
            const land = model === 'V4-prov' ? 22000 : 20000; // +2000/seed
            fs.writeFileSync(path.join(dir, 'holdout-verified.json'), JSON.stringify({
              valid: true,
              policySHA256: shaFor(model),
              botSHA256: EXPECTED.botSHA256,
              engineCommit: EXPECTED.engineCommit,
            }));
            fs.writeFileSync(path.join(dir, 'match.json'), JSON.stringify({
              run: {tick: 4000 + i, termination: 'game-over'},
              gameEnd: {outcome: 'defeat'},
              victory: {progress: 10},
              engineWinner: null,
              trajectory: {summary: {
                endLand: land, peakLand: land + 500, meanLand: land,
                firstLand: 1500, landChange: land - 1500, retention: 0.9,
                peakHome: 100000, meanHome: 100000,
                meanEnemyLand: 1000, finalEnemyLand: 1000, sampleCount: 10,
              }},
              attackReceipts: {territoryGained: 0, confirmed: 0},
              income: {gold: 1000, trade: 0, train: 0},
              recording: {counts: {
                build_confirmed: 1, build_stalled: 1, attack_command: 1,
                decision_timeline: 1,
              }},
              marine: {stats: {
                transportArrived: 0, bridgeheadHeld: 0,
                bridgeheadLost: 0, warshipSent: 0,
              }},
            }));
          }
      });

  // report() also copies holdout/summary.json into docs/ — keep the repo clean.
  const docsFile = path.join(ROOT, 'docs', 'training-analysis-neural-v4-early',
    'evaluation-summary.json');
  const docsBackup = fs.existsSync(docsFile) ? fs.readFileSync(docsFile) : null;
  try {
    const r = spawnSync(process.execPath, [DRIVER, 'report', '--out', out],
      {cwd: ROOT, encoding: 'utf8'});
    assert.equal(r.status, 0, `driver report failed:\n${r.stdout}\n${r.stderr}`);

    const decision = JSON.parse(fs.readFileSync(
      path.join(out, 'holdout', 'decision.json'), 'utf8'));
    assert.deepEqual(decision.candidates, ['V4-prov']);
    assert.equal(decision.comparisons.length, 4,
      'candidate must be gated vs both references on both difficulties');
    for (const c of decision.comparisons) {
      assert.equal(c.pairs, h.matchesPerModelPerDifficulty,
        `pairing must be full for ${c.reference} ${c.difficulty} ` +
        '(regression: pairs collapsed to 0)');
      assert.equal(c.valid, true, `comparison ${c.reference} ${c.difficulty} must be valid`);
      assert.equal(c.promoted, true,
        'equal wins, 0 regressions and >= 10000 area gain must promote through the driver path');
    }
    assert.match(decision.verdict, /promoted on 4 comparison/,
      'decision must aggregate the promoted comparisons');
    for (const d of h.difficulties)
      assert.ok(fs.existsSync(path.join(out, 'holdout', `difficulty-${d}`, 'evaluation.json')),
        `evaluation.json must be written for ${d}`);
    assert.ok(fs.existsSync(docsFile), 'docs evaluation-summary copy must be written');
  } finally {
    if (docsBackup === null) {
      if (fs.existsSync(docsFile)) fs.unlinkSync(docsFile);
    } else {
      fs.writeFileSync(docsFile, docsBackup);
    }
    fs.rmSync(out, {recursive: true, force: true});
  }
}

console.log('v4-early-campaign-regression: all checks passed');
