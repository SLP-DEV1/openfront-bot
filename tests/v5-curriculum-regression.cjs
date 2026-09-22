'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

// Regression gate for the Neural V5 "Long-Horizon Curriculum (Two
// Lineages)" campaign driver (tools/benchmark/v5-curriculum-campaign.mjs).
//
// The campaign runs locally against the pinned official engine; this test
// does NOT need an engine. It verifies, from the driver's own frozen plan:
//   - pinned provenance (engine commit, bot SHA, reference model SHAs
//     including V4-prov as a reference, schema-4 zero model digest)
//   - the two-stage curriculum: generations 1-5 at 7200 ticks,
//     generations 6-10 at 18000 ticks, on the FULL control grid
//     (Impossible + Hard, World + Europe, nations 1/4), 10 generations,
//     200 matches/generation (the trainer cap), 2000 per lineage
//   - the two independent lineages (start models A-champ and V4-prov;
//     stageC stays official champion)
//   - the independent paired holdout: Hard + Impossible x World + Europe
//     x nations 1/4 x 12 v5hold-* seeds, 18000 ticks, 672 base matches
//   - seed disjointness: v5hold-* seeds are distinct from every v3hold-*,
//     v4hold-* and from the trainer's train/eval seed format
//   - the evaluation-v2 gate contract the driver relies on (victory
//     primary, collapse guard, right-censored tick limits, fail-closed
//     on short/unpaired/invalid samples)
//   - candidate materialization: a completed train() writes every candidate
//     policy of BOTH lineages into models-source/<label>.json (the layout
//     the holdout phase consumes) and records matching SHAs in
//     training-candidates.json
//   - report pairing: comparePaired() must map rows through gateRow before
//     pairing, or valid samples collapse to N=0
//   - trainer durability (no engine needed): a crashed or budget-stopped
//     run must resume at the first incomplete generation, reuse every
//     verified row.json as-is (no re-spawn), and --wallBudgetSeconds must
//     stop the invocation with exit 0 + status "budget-exceeded" so a
//     re-run can continue

const ROOT = path.join(__dirname, '..');
const DRIVER = path.join(ROOT, 'tools', 'benchmark', 'v5-curriculum-campaign.mjs');
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
    'V4-prov': '8dfcdcea8dc6be51dec602f0f89b04fab85de2740f35cfcd0523996daffade22',
  },
  training: {
    difficulties: ['Impossible', 'Hard'], maps: ['World', 'Europe'],
    nations: [1, 4], ticks: 7200,
    ticksSchedule: [7200, 7200, 7200, 7200, 7200, 18000, 18000, 18000, 18000, 18000],
    generations: 10, population: 6, trainSeeds: 3, evalSeeds: 2,
    sigma: 0.12, parallel: 16,
    wallBudgetSeconds: 3 * 60 * 60,
    matchesPerGeneration: 200, totalMatchesPerLineage: 2000,
  },
  lineages: [
    {key: 'A', initialModel: 'A-champ', candidatePrefix: 'V5-A'},
    {key: 'V4', initialModel: 'V4-prov', candidatePrefix: 'V5-V4'},
  ],
  holdout: {
    difficulties: ['Hard', 'Impossible'], maps: ['World', 'Europe'],
    nations: [1, 4], ticks: 18000, matchesPerModelPerDifficulty: 48,
    baseMatches: 672, maxMatches: 864,
    gateReferences: ['stageC', 'A-champ', 'V4-prov'],
    wallBudgetSeconds: 3 * 60 * 60,
  },
};
const SEEDS = Array.from({length: 12}, (_, i) => `v5hold-${i}`);
const V3_SEEDS = Array.from({length: 12}, (_, i) => `v3hold-${i}`);
const V4_SEEDS = Array.from({length: 12}, (_, i) => `v4hold-${i}`);

// ---- driver dry-run plan ----
assert.ok(fs.existsSync(DRIVER), 'driver missing: tools/benchmark/v5-curriculum-campaign.mjs');
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
for (const [label, sha] of Object.entries(EXPECTED.references))
  assert.equal(plan.references?.[label], sha, `reference ${label} pin`);

// Two independent lineages with frozen start models.
assert.equal(plan.lineages?.length, 2, 'must define exactly two lineages');
for (const [i, lineage] of EXPECTED.lineages.entries())
  for (const [key, value] of Object.entries(lineage))
    assert.deepEqual(plan.lineages[i]?.[key], value, `lineage[${i}].${key} must be frozen`);

// Two-stage curriculum on the full control grid.
for (const lineagePlan of plan.lineages ?? []) {
  for (const [key, value] of Object.entries(EXPECTED.training))
    assert.deepEqual(lineagePlan.training?.[key], value,
      `training.${key} must be frozen (lineage ${lineagePlan?.key})`);
}
// The curriculum must actually span both stages: early half 7200, late
// half 18000, one value per generation, matching the generation count.
const schedule = EXPECTED.training.ticksSchedule;
assert.equal(schedule.length, EXPECTED.training.generations,
  'ticksSchedule must have one value per generation');
const half = Math.floor(schedule.length / 2);
assert.ok(schedule.slice(0, half).every((t) => t === 7200),
  'first half of generations must run 7200 ticks');
assert.ok(schedule.slice(half).every((t) => t === 18000),
  'second half of generations must run 18000 ticks');

// Holdout grid.
for (const [key, value] of Object.entries(EXPECTED.holdout))
  assert.deepEqual(plan.holdout?.[key], value, `holdout.${key} must be frozen`);
assert.deepEqual(plan.holdout?.seeds, SEEDS, 'holdout seeds must be v5hold-0..11');
assert.equal(plan.holdout?.profile, 'autonomous', 'holdout profile must be autonomous');
assert.equal(plan.holdout?.gameMode, 'FFA', 'holdout must be FFA');
assert.equal(plan.holdout?.scriptedHumans, 0, 'holdout must run 0 scripted humans');
assert.equal(plan.holdout?.opponentProfile, 'balanced', 'holdout opponent profile');

// ---- seed disjointness ----
for (const seed of SEEDS) assert.match(seed, /^v5hold-\d{1,2}$/);
assert.equal(new Set(SEEDS).size, 12, 'v5hold seeds must be distinct');
for (const v3 of V3_SEEDS)
  assert.ok(!SEEDS.includes(v3), `v5hold seed must not reuse v3 seed ${v3}`);
for (const v4 of V4_SEEDS)
  assert.ok(!SEEDS.includes(v4), `v5hold seed must not reuse v4 seed ${v4}`);
// Trainer seed format (train.mjs): (train|eval)-<gen>-<k>-<Map>-<nation>.
const trainerSeed = (phase, g, k, map, nation) => `${phase}-${g}-${k}-${map}-${nation}`;
for (const phase of ['train', 'eval'])
  for (let g = 1; g <= 10; g++)
    for (let k = 0; k < 4; k++)
      for (const map of ['World', 'Europe'])
        for (const nation of [1, 4])
          assert.ok(!SEEDS.includes(trainerSeed(phase, g, k, map, nation)),
            'v5hold seeds must not collide with trainer train/eval seeds');

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
// but training only produces training-<key>/provisional.json (+ champion.json).
// A completed train() for BOTH lineages must materialize each candidate
// into that layout and record the matching SHA in training-candidates.json.
{
  const os = require('node:os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-train-'));
  const provByLineage = {};
  const champByLineage = {};
  for (const lineage of EXPECTED.lineages) {
    const training = path.join(out, `training-${lineage.key}`);
    fs.mkdirSync(training, {recursive: true});
    const provModel = policyV4.validate(policyV4.zero());
    const champModel = policyV4.mutate(provModel, `v5-regression-${lineage.key}`, 0.3);
    provByLineage[lineage.key] = provModel;
    champByLineage[lineage.key] = champModel;
    // Completed-training marker state: plan + full history + final model.
    fs.writeFileSync(path.join(training, 'plan.json'), JSON.stringify({fixture: true}));
    fs.writeFileSync(path.join(training, 'history.json'), JSON.stringify({
      history: Array.from({length: 10}, (_, i) => ({generation: i + 1})),
    }));
    fs.writeFileSync(path.join(training, 'provisional.json'), JSON.stringify(provModel));
    fs.writeFileSync(path.join(training, 'champion.json'), JSON.stringify(champModel));
  }
  fs.writeFileSync(path.join(out, 'campaign.json'), JSON.stringify({
    engineCommit: EXPECTED.engineCommit,
    botSHA256: EXPECTED.botSHA256,
    references: EXPECTED.references,
  }));

  const r = spawnSync(process.execPath, [DRIVER, 'train', '--out', out],
    {cwd: ROOT, encoding: 'utf8'});
  assert.equal(r.status, 0, `driver train (completed path) failed:\n${r.stdout}\n${r.stderr}`);

  const state = JSON.parse(fs.readFileSync(path.join(out, 'training-candidates.json'), 'utf8'));
  const byLabel = Object.fromEntries(state.candidates.map((c) => [c.label, c]));
  const expectedLabels = [];
  for (const lineage of EXPECTED.lineages)
    expectedLabels.push(`${lineage.candidatePrefix}-prov`, `${lineage.candidatePrefix}-champ`);
  assert.deepEqual(Object.keys(byLabel).sort(), expectedLabels.sort(),
    'candidate list must cover provisional and diverged champion of both lineages');
  for (const lineage of EXPECTED.lineages) {
    assert.equal(byLabel[`${lineage.candidatePrefix}-prov`]?.policySHA256,
      policyV4.sha(provByLineage[lineage.key]),
      `${lineage.candidatePrefix}-prov SHA must be the final provisional policy digest`);
    assert.equal(byLabel[`${lineage.candidatePrefix}-champ`]?.policySHA256,
      policyV4.sha(champByLineage[lineage.key]),
      `${lineage.candidatePrefix}-champ SHA must be the in-loop champion digest`);
  }
  // Holdout layout: every candidate must exist under models-source/<label>.json.
  for (const lineage of EXPECTED.lineages) {
    for (const [label, model] of [
      [`${lineage.candidatePrefix}-prov`, provByLineage[lineage.key]],
      [`${lineage.candidatePrefix}-champ`, champByLineage[lineage.key]],
    ]) {
      const file = path.join(out, 'models-source', `${label}.json`);
      assert.ok(fs.existsSync(file), `models-source/${label}.json must be materialized`);
      const loaded = policyV4.validate(JSON.parse(fs.readFileSync(file, 'utf8')));
      assert.equal(policyV4.sha(loaded), byLabel[label].policySHA256,
        `models-source/${label}.json must match the recorded candidate SHA`);
    }
  }
  fs.rmSync(out, {recursive: true, force: true});
}

// ---- report phase pairing (regression: pairs must not collapse to 0) ----
// A synthetic holdout OUT where both candidates beat every reference on
// identical pairings. comparePaired() must map rows through gateRow before
// pairing; raw rows lack `validSample`, so the old code skipped every pair
// and reported N=0 despite verified holdout matches.
{
  const os = require('node:os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-report-'));
  const provShaByLabel = {};
  const shaFor = (model) => {
    if (model in provShaByLabel) return provShaByLabel[model];
    return EXPECTED.references[model];
  };
  const candidateLabels = [];
  for (const lineage of EXPECTED.lineages) {
    const label = `${lineage.candidatePrefix}-prov`;
    provShaByLabel[label] = (lineage.key === 'A' ? 'c' : 'd').repeat(64);
    candidateLabels.push(label);
  }
  fs.writeFileSync(path.join(out, 'campaign.json'), JSON.stringify({
    engineCommit: EXPECTED.engineCommit,
    botSHA256: EXPECTED.botSHA256,
    references: EXPECTED.references,
  }));
  fs.writeFileSync(path.join(out, 'training-candidates.json'), JSON.stringify({
    candidates: candidateLabels.map((label) => ({
      label, file: `training-${label.includes('V5-A') ? 'A' : 'V4'}/provisional.json`,
      policySHA256: provShaByLabel[label], origin: 'regression fixture',
    })),
  }));
  const h = plan.holdout; // frozen grid: 12 seeds x 2 maps x 2 nations
  const models = [...Object.keys(EXPECTED.references), ...candidateLabels];
  for (const difficulty of h.difficulties)
    for (const model of models)
      h.seeds.forEach((seed, i) => {
        for (const map of h.maps)
          for (const nation of h.nations) {
            const dir = path.join(out, 'holdout', `difficulty-${difficulty}`,
              'matches', model, `${seed}-${map}-${nation}`);
            fs.mkdirSync(dir, {recursive: true});
            const isCandidate = candidateLabels.includes(model);
            const land = isCandidate ? 22000 : 20000; // +2000/seed
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
  const docsFile = path.join(ROOT, 'docs', 'training-analysis-neural-v5-curriculum',
    'evaluation-summary.json');
  const docsBackup = fs.existsSync(docsFile) ? fs.readFileSync(docsFile) : null;
  try {
    const r = spawnSync(process.execPath, [DRIVER, 'report', '--out', out],
      {cwd: ROOT, encoding: 'utf8'});
    assert.equal(r.status, 0, `driver report failed:\n${r.stdout}\n${r.stderr}`);

    const decision = JSON.parse(fs.readFileSync(
      path.join(out, 'holdout', 'decision.json'), 'utf8'));
    assert.deepEqual(decision.candidates.sort(), candidateLabels.sort());
    // Per difficulty: 2 candidates x 3 gate references + 1 candidate pair.
    const comparisonsPerDifficulty =
      candidateLabels.length * EXPECTED.holdout.gateReferences.length + 1;
    assert.equal(decision.comparisons.length,
      comparisonsPerDifficulty * h.difficulties.length,
      'each candidate must be gated vs all gate references on both difficulties');
    for (const c of decision.comparisons) {
      assert.equal(c.pairs, h.matchesPerModelPerDifficulty,
        `pairing must be full for ${c.reference} ${c.difficulty} ` +
        '(regression: pairs collapsed to 0)');
      assert.equal(c.valid, true, `comparison ${c.reference} ${c.difficulty} must be valid`);
      const isPairComparison = candidateLabels.includes(c.reference);
      assert.equal(c.promoted, !isPairComparison,
        'candidates beat every reference (+2000/seed); candidate pair ties must not promote');
    }
    const promotedCount = comparisonsPerDifficulty * h.difficulties.length - h.difficulties.length;
    assert.match(decision.verdict, new RegExp(`promoted on ${promotedCount} comparison`),
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

// ---------------------------------------------------------------------------
// Trainer durability: generation-wise resume + wall budget (engine-free).
// ---------------------------------------------------------------------------
// Fixture config: Impossible x World x nation 1, population 2, trainSeeds
// 1, evalSeeds 2, ticks 1000 -> 7 jobs per generation (3 training + 4
// evaluation). Every fixture row is a fully verified sample, so a resumed
// run must complete without spawning the engine at all (the --engine
// directory deliberately does not exist).
{
  const os = require('node:os');
  const TRAINER = path.join(ROOT, 'trainer', 'train.mjs');
  const botFile = path.join(ROOT, 'OpenFront_Solo_AggroBot.user.js');
  const botSHA = digest(fs.readFileSync(botFile, 'utf8'));
  const zero = policyV4.validate(policyV4.zero());
  const zeroSha = policyV4.sha(zero);
  const modelSha = (model) => policyV4.sha(policyV4.validate(model));
  // Must mirror the trainer's deterministic candidate derivation.
  const candidate = (gen, i) =>
    policyV4.mutate(zero, `neural-${gen}-${Math.floor(i / 2)}`, 0.12, i % 2 ? -1 : 1);
  const rowPath = (out, gen, index, seed, phase) =>
    path.join(out, 'matches', `${phase}-${gen}-${index}-Impossible-World-1-${seed}`, 'row.json');
  const writeGenRows = (out, gen) => {
    const rows = [
      {phase: 'training', index: 'parent', seed: `train-${gen}-0-World-1`, model: zero},
      {phase: 'training', index: 'p0', seed: `train-${gen}-0-World-1`, model: candidate(gen, 0)},
      {phase: 'training', index: 'p1', seed: `train-${gen}-0-World-1`, model: candidate(gen, 1)},
      {phase: 'evaluation', index: 'champion', seed: `eval-${gen}-0-World-1`, model: zero},
      {phase: 'evaluation', index: 'candidate', seed: `eval-${gen}-0-World-1`, model: zero},
      {phase: 'evaluation', index: 'champion', seed: `eval-${gen}-1-World-1`, model: zero},
      {phase: 'evaluation', index: 'candidate', seed: `eval-${gen}-1-World-1`, model: zero},
    ];
    for (const r of rows) {
      const p = rowPath(out, gen, r.index, r.seed, r.phase);
      fs.mkdirSync(path.dirname(p), {recursive: true});
      fs.writeFileSync(p, JSON.stringify({
        phase: r.phase, generation: gen, index: r.index,
        difficulty: 'Impossible', map: 'World', nation: 1, seed: r.seed,
        ticks: 1000, gameType: 'Singleplayer', gameMode: 'FFA',
        scriptedHumans: 0, opponentProfile: 'balanced',
        model: modelSha(r.model), botSHA256: botSHA,
        validSample: true, confirmed: true, outcome: 'defeat',
        exitCode: 0, endTick: 1000, land: 5000, reward: 0,
        termination: 'eliminated', error: null, sentinel: 1,
      }));
    }
  };
  // A crashed/budget-stopped run at the end of generation 1: gen-1 report
  // in history, provisional.json = zero, no incumbent/champion files (so
  // the incumbent resolves to plan.initialModel = 'zero').
  const seedFixture = (out, generations) => {
    fs.mkdirSync(out, {recursive: true});
    fs.copyFileSync(botFile, path.join(out, 'pinned-bot.user.js'));
    const dry = spawnSync(process.execPath, [
      TRAINER, '--dryRun', 'true', '--schema', '4',
      '--nations', '1',
      '--generations', String(generations), '--population', '2',
      '--trainSeeds', '1', '--evalSeeds', '2', '--ticks', '1000',
      '--bot', botFile,
    ], {cwd: ROOT, encoding: 'utf8'});
    assert.equal(dry.status, 0, 'trainer dry-run failed: ' + dry.stderr);
    const plan = JSON.parse(dry.stdout);
    plan.botSHA256 = botSHA;
    fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify(plan));
    fs.writeFileSync(path.join(out, 'provisional.json'), JSON.stringify(zero));
    fs.writeFileSync(path.join(out, 'history.json'), JSON.stringify({
      plan: null, published: false, status: 'completed',
      history: [{generation: 1, provisionalModel: zeroSha, championModel: 'zero'}],
    }));
    writeGenRows(out, 2);
  };
  const runTrainer = (out, extra) => {
    const args = [
      TRAINER, '--schema', '4',
      '--engine', path.join(out, 'no-engine'),
      '--bot', botFile,
      '--nations', '1',
      '--generations', extra.generations,
      '--population', '2', '--trainSeeds', '1', '--evalSeeds', '2',
      '--ticks', '1000', '--out', out,
    ];
    if (extra.wallBudgetSeconds != null)
      args.push('--wallBudgetSeconds', String(extra.wallBudgetSeconds));
    const r = spawnSync(process.execPath, args, {cwd: ROOT, encoding: 'utf8'});
    if (r.status !== 0)
      throw new Error(`trainer exited ${r.status}:\n${r.stdout}\n${r.stderr}`);
    const lastLine = r.stdout.trim().split('\n').pop();
    return {r, last: JSON.parse(lastLine)};
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v5-trainer-'));
  try {
    // (a) Crash resume: gen 1 in history, gen 2 fully row-resumable.
    const outA = path.join(tmp, 'training-A');
    seedFixture(outA, 2);
    let {r, last} = runTrainer(outA, {generations: '2'});
    assert.equal(r.status, 0, 'trainer resume failed:\n' + r.stdout + '\n' + r.stderr);
    assert.match(r.stdout, /resuming from generation 2/, 'must log the resume point');
    assert.deepEqual(last, {
      finished: true, status: 'completed', completedGenerations: 2,
      remainingGenerations: 0, championPublished: false, out: outA,
    });
    const histA = JSON.parse(fs.readFileSync(path.join(outA, 'history.json'), 'utf8'));
    assert.equal(histA.status, 'completed', 'history must mark completion');
    assert.deepEqual(histA.history.map(h => h.generation), [1, 2],
      'history must contain both generations in order');
    const parentDir = path.dirname(rowPath(outA, 2, 'parent', 'train-2-0-World-1', 'training'));
    const rowA = JSON.parse(fs.readFileSync(path.join(parentDir, 'row.json'), 'utf8'));
    assert.equal(rowA.sentinel, 1, 'reused row must not be rewritten');
    assert.ok(!fs.existsSync(path.join(parentDir, 'match.json')),
      'reused row must not spawn a new engine match');

    // (b) Wall budget: 3 required generations, tiny budget -> clean stop
    // after gen 2 with exit 0 and status "budget-exceeded".
    const outB = path.join(tmp, 'training-B');
    seedFixture(outB, 3);
    ({r, last} = runTrainer(outB, {generations: '3', wallBudgetSeconds: 0.001}));
    assert.equal(r.status, 0, 'budget stop must exit 0:\n' + r.stdout + '\n' + r.stderr);
    assert.equal(last.finished, false);
    assert.equal(last.status, 'budget-exceeded', 'must report the budget stop');
    assert.equal(last.completedGenerations, 2);
    assert.equal(last.remainingGenerations, 1);
    let histB = JSON.parse(fs.readFileSync(path.join(outB, 'history.json'), 'utf8'));
    assert.equal(histB.status, 'budget-exceeded');
    assert.equal(histB.history.length, 2);

    // (c) Re-run continues after the budget stop: gen 3 rows are
    // row-resumable, so the run finishes at generation 3.
    writeGenRows(outB, 3);
    ({r, last} = runTrainer(outB, {generations: '3'}));
    assert.equal(r.status, 0, 'resume after budget stop failed:\n' + r.stdout + '\n' + r.stderr);
    assert.match(r.stdout, /resuming from generation 3/, 'must resume at generation 3');
    assert.equal(last.status, 'completed');
    assert.equal(last.completedGenerations, 3);
    assert.equal(last.remainingGenerations, 0);
    histB = JSON.parse(fs.readFileSync(path.join(outB, 'history.json'), 'utf8'));
    assert.equal(histB.status, 'completed');
    assert.deepEqual(histB.history.map(h => h.generation), [1, 2, 3]);
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

console.log('v5-curriculum-regression: all checks passed');
