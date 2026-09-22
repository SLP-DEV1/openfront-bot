// Neural V6 "Collapse Prevention, Two Lineages" — campaign driver.
//
// Fixed campaign spec (see docs/training-analysis-neural-v6-collapse/README.md):
//   * V5 (same engine, same training grid, same holdout protocol) ended
//     NO PROMOTION on the old bot: V5-V4-prov had the highest Hard win
//     rate but also the largest collapse — the pinned 17-cell
//     Hard-holdout set classifies 6 Type A + 2 Type B regressions against
//     stageC (baseline 6A/2B/9C). The V6 bot adds the runtime
//     defense-posture state machine (NORMAL/THREATENED/CRITICAL/
//     RECOVERING, 1M mega-attack corroboration, 60-tick stabilization
//     exit, 120/900-tick recovery bound). V6 re-trains both V5 lineages
//     on the NEW bot so the holdout delta isolates the
//     collapse-prevention runtime:
//     - Lineage A:  start model V5-A-prov  (V5 lineage-A provisional)
//     - Lineage V4: start model V5-V4-prov (V5 lineage-V4 provisional)
//   * Everything else is frozen identical to V5: engine commit, two-stage
//     curriculum (generations 1-5 at 7200 ticks, 6-10 at 18000 ticks),
//     full control grid (Impossible + Hard, World + Europe, nations 1/4),
//     10 generations, population 6, trainSeeds 3, evalSeeds 2, sigma 0.12,
//     parallel 16, schema 4. 200 matches/generation (the trainer cap),
//     2000 per lineage.
//   * Holdout: 18000-tick matches, Hard + Impossible, World + Europe,
//     nations 1/4, seeds v6hold-0..11 (disjoint from every v3hold-*,
//     v4hold-*, v5hold-* and train/eval seed), models zero, stageC, run3,
//     A-champ, V4-prov, V5-A-prov, V5-V4-prov plus the candidate(s)
//     produced by both training lineages.
//   * Gate: unchanged evaluation-v2. Each candidate is compared per
//     difficulty against stageC, V4-prov, V5-A-prov and V5-V4-prov, plus
//     pairwise candidate-vs-candidate comparisons. Promotion is a
//     candidate-level verdict only — the official champion and the live
//     bot change only through a separate decision.
//   * Collapse phase (V6-specific): re-runs the 17 pinned regression
//     cells (tools/benchmark/collapse-regression.cjs) under the new bot.
//     "baseline-newbot" repeats the V5-V4-prov vs stageC pairing that
//     produced the 6A/2B/9C baseline, isolating the pure runtime effect;
//     one job per trained candidate classifies candidate vs stageC.
//
// Time limits and resume semantics:
//   * train: each lineage runs under a wall-clock budget (CAMPAIGN.training.
//     wallBudgetSeconds, override: --wallBudget <seconds>). The trainer
//     checks the budget at generation boundaries and exits 0 with status
//     "budget-exceeded"; re-running the train phase resumes the lineage at
//     its first incomplete generation (completed matches are reused). The
//     spawn timeout is budget + 6 h as a hang net.
//   * holdout: the phase runs under CAMPAIGN.holdout.wallBudgetSeconds. On
//     budget exhaustion it stops, keeps every verified match and throws;
//     re-running the holdout phase continues the remainder. Each match
//     still has its own 30-minute timeout.
//
// Phases (each resumable): setup, train, holdout, collapse, report, all.
//   node tools/benchmark/v6-collapse-campaign.mjs <phase> [--engine <dir>]
//         [--engineCommit <sha>] [--modelsSource <dir>] [--out <dir>]
//         [--parallel N] [--wallBudget <seconds>] [--allowPartial] [--dryRun true]
//
// State under --out (default benchmark-results/neural-v6-collapse):
//   campaign.json
//   models-source/{zero,stageC,run3,A-champ,V4-prov,V5-A-prov,V5-V4-prov}.json
//     (+ candidates)
//   training-A/                     (lineage A: trainer/train.mjs output)
//   training-V4/                   (lineage V4: trainer/train.mjs output)
//   training-candidates.json
//   holdout/difficulty-<D>/matches/<model>/<seed>-<Map>-<nation>/
//   holdout/difficulty-<D>/evaluation.json
//   holdout/summary.json
//   holdout/decision.json
//   collapse/<job>/collapse-regression.json   (17-cell reports, new bot)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import common from './common.cjs';
import policyV4 from '../../trainer/strategic-policy-v4.cjs';
import evaluationV2 from '../../trainer/evaluation-v2.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const CAMPAIGN = Object.freeze({
  title: 'Neural V6 — Collapse Prevention (Two Lineages)',
  schema: 4,
  bot: 'OpenFront_Solo_AggroBot.user.js',
  botSHA256: '57775ec70f9df387ee2429b52355bf02e93d127536e4dcd81829f0a391e22d9c',
  engineCommit: 'bb8af015b515b3b717bd4d901074c5f4c16641cb',
  // Pinned reference models. zero/stageC/run3/A-champ are the V3/V4
  // references; V4-prov is the V4 final provisional; V5-A-prov and
  // V5-V4-prov are the final V5 provisionals (one of them is the other
  // lineage's start model; both are gate references of their own).
  references: Object.freeze({
    zero: 'a1e8b35677991f244e55c7734e21caa5a4f6cb6086192bef9857e3265084127e',
    stageC: '84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1',
    run3: 'e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968',
    'A-champ': '0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5',
    'V4-prov': '8dfcdcea8dc6be51dec602f0f89b04fab85de2740f35cfcd0523996daffade22',
    'V5-A-prov': 'baad08d1eef3e2f795a5ab77fac6c7d06dbc27238af847444aeb164659ad8d9e',
    'V5-V4-prov': 'c5268942dbd8276c2666e6e250f343027a9685f45b728271b140dd8ccd58abaa',
  }),
  // Reference model files as laid out by the V5 campaign's models-source/
  // directory (flat: <label>.json per reference).
  referenceFiles: Object.freeze({
    zero: path.join('zero.json'),
    stageC: path.join('stageC.json'),
    run3: path.join('run3.json'),
    'A-champ': path.join('A-champ.json'),
    'V4-prov': path.join('V4-prov.json'),
    'V5-A-prov': path.join('V5-A-prov.json'),
    'V5-V4-prov': path.join('V5-V4-prov.json'),
  }),
  // Common frozen training configuration shared by BOTH lineages.
  // Full control grid, every generation, equal weight. The two-stage
  // curriculum: first half of generations at 7200 ticks (early survival),
  // second half at 18000 ticks (late-game victory/collapse feedback).
  training: Object.freeze({
    difficulties: ['Impossible', 'Hard'], maps: ['World', 'Europe'],
    size: 'Compact', nations: [1, 4],
    ticks: 7200,
    ticksSchedule: [7200, 7200, 7200, 7200, 7200, 18000, 18000, 18000, 18000, 18000],
    generations: 10, population: 6, trainSeeds: 3, evalSeeds: 2, sigma: 0.12,
    parallel: 16, gameType: 'Singleplayer', gameMode: 'FFA',
    scriptedHumans: 0, opponentProfile: 'balanced',
    // Wall-clock budget per lineage, per trainer invocation (seconds).
    // Checked at generation boundaries: a stopped run exits cleanly and the
    // train phase re-run resumes at the first incomplete generation.
    // Expected runtime is well under an hour per lineage; the budget is a
    // hard safety bound, not a target.
    wallBudgetSeconds: 3 * 60 * 60,
  }),
  // Two independent candidate lineages, continuing the two V5 lineages on
  // the new posture bot (both kept as separate experimental candidates;
  // stageC remains the official champion).
  lineages: Object.freeze([
    Object.freeze({key: 'A', initialModel: 'V5-A-prov', candidatePrefix: 'V6-A'}),
    Object.freeze({key: 'V4', initialModel: 'V5-V4-prov', candidatePrefix: 'V6-V4'}),
  ]),
  holdout: Object.freeze({
    difficulties: ['Hard', 'Impossible'], maps: ['World', 'Europe'],
    nations: [1, 4], seeds: Array.from({length: 12}, (_, i) => `v6hold-${i}`),
    ticks: 18000, size: 'Compact', profile: 'autonomous',
    gameType: 'Singleplayer', gameMode: 'FFA', scriptedHumans: 0,
    opponentProfile: 'balanced',
    // Wall-clock budget for the holdout phase (seconds). Already-verified
    // matches are kept; re-running the phase continues the remainder.
    wallBudgetSeconds: 3 * 60 * 60,
  }),
  // V6-specific: re-run the 17 pinned regression cells
  // (tools/benchmark/collapse-regression.cjs) under the new bot.
  // "baseline-newbot" repeats the exact V5-V4-prov vs stageC pairing that
  // produced the 6A/2B/9C baseline report, isolating the pure
  // runtime collapse-prevention effect (no retraining); the remaining
  // jobs run each trained candidate against stageC.
  collapse: Object.freeze({
    baselineModel: 'V5-V4-prov',
    referenceModel: 'stageC',
    cells: 17,
  }),
  // evaluation-v2 is unchanged; these are the comparison references each
  // candidate is gated against (per difficulty): the official champion,
  // the previous round's experimental candidate, and both V5 candidates.
  gateReferences: ['stageC', 'V4-prov', 'V5-A-prov', 'V5-V4-prov'],
  gate: 'evaluation-v2',
  autoDeploy: false,
});

const DEFAULT_OUT = path.join('benchmark-results', 'neural-v6-collapse');
const DEFAULT_MODELS_SOURCE = path.join('..', 'neural-v5-curriculum',
  'benchmark-results', 'neural-v5-curriculum', 'models-source');

// ---- small helpers ----
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
};
const writeJson = (p, data) => {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n');
};
const writeJsonWx = (p, data) => {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', {flag: 'wx'});
};
const rmrf = (p) => {
  if (fs.existsSync(p)) fs.rmSync(p, {recursive: true, force: true, maxRetries: 5});
};
function loadModel(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const model = policyV4.validate(raw);
  return {file, model, sha: digest(JSON.stringify(model))};
}
function requireSha(sha, expected, label) {
  if (sha !== expected) throw Error(`${label} SHA mismatch: expected ${expected}, got ${sha}`);
}
function pool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const runners = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i]);
    }
  });
  return Promise.all(runners);
}

// ---- CLI ----
const argv = process.argv.slice(2);
const phaseArg = argv[0];
if (!['setup', 'train', 'holdout', 'collapse', 'report', 'all']
  .includes(phaseArg))
  throw Error('Usage: v6-collapse-campaign.mjs <setup|train|holdout|collapse|report|all> [options]');
const opts = {engine: null, engineCommit: CAMPAIGN.engineCommit,
  modelsSource: DEFAULT_MODELS_SOURCE, out: DEFAULT_OUT,
  parallel: CAMPAIGN.training.parallel, wallBudget: null,
  allowPartial: false, dryRun: false};
for (let i = 1; i < argv.length; i++) {
  const key = argv[i].replace(/^--/, '');
  if (!Object.hasOwn(opts, key)) throw Error('Unknown option ' + argv[i]);
  if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('Missing value for ' + argv[i]);
  const value = argv[++i];
  if (key === 'parallel' || key === 'allowPartial' || key === 'dryRun')
    opts[key] = key === 'parallel' ? Number(value) : value === 'true';
  else if (key === 'wallBudget') opts[key] = Number(value);
  else opts[key] = value;
}
if (!Number.isInteger(opts.parallel) || opts.parallel < 1 || opts.parallel > 16)
  throw Error('Invalid --parallel');
if (opts.wallBudget != null &&
    (!Number.isFinite(opts.wallBudget) || opts.wallBudget <= 0))
  throw Error('Invalid --wallBudget (finite seconds > 0)');
const OUT = path.resolve(opts.out);
const MODELS_SOURCE = path.resolve(opts.modelsSource);
const BOT_FILE = path.join(ROOT, CAMPAIGN.bot);
const RUNNER = process.execPath;

function trainingPlanInfo() {
  const t = CAMPAIGN.training;
  const perGen = t.difficulties.length * t.maps.length * t.nations.length *
    (t.trainSeeds * (t.population + 1) + t.evalSeeds * 2);
  return {
    difficulties: t.difficulties, maps: t.maps, nations: t.nations,
    ticks: t.ticks, ticksSchedule: t.ticksSchedule,
    generations: t.generations, population: t.population,
    trainSeeds: t.trainSeeds, evalSeeds: t.evalSeeds, sigma: t.sigma,
    parallel: t.parallel, gameType: t.gameType, gameMode: t.gameMode,
    scriptedHumans: t.scriptedHumans, opponentProfile: t.opponentProfile,
    wallBudgetSeconds: t.wallBudgetSeconds,
    matchesPerGeneration: perGen, totalMatchesPerLineage: perGen * t.generations,
  };
}

function dryRunPlan() {
  const t = CAMPAIGN.training;
  const h = CAMPAIGN.holdout;
  const perModelPerDifficulty = h.maps.length * h.nations.length * h.seeds.length;
  const referenceModels = Object.keys(CAMPAIGN.references);
  const maxCandidates = CAMPAIGN.lineages.length * 2; // -prov + -champ each
  const tp = trainingPlanInfo();
  return {
    title: CAMPAIGN.title, phase: phaseArg,
    engineCommit: CAMPAIGN.engineCommit, bot: CAMPAIGN.bot,
    botSHA256: CAMPAIGN.botSHA256, schema: CAMPAIGN.schema,
    references: CAMPAIGN.references,
    lineages: CAMPAIGN.lineages.map((l) => ({
      key: l.key, initialModel: l.initialModel,
      candidatePrefix: l.candidatePrefix,
      training: tp,
    })),
    holdout: {
      difficulties: h.difficulties, maps: h.maps, nations: h.nations,
      seeds: h.seeds, ticks: h.ticks, size: h.size, profile: h.profile,
      gameType: h.gameType, gameMode: h.gameMode,
      scriptedHumans: h.scriptedHumans, opponentProfile: h.opponentProfile,
      wallBudgetSeconds: h.wallBudgetSeconds,
      matchesPerModelPerDifficulty: perModelPerDifficulty,
      matchesPerModel: perModelPerDifficulty * h.difficulties.length,
      referenceModels,
      gateReferences: CAMPAIGN.gateReferences,
      candidateModels: CAMPAIGN.lineages.map((l) =>
        [`${l.candidatePrefix}-prov`, `${l.candidatePrefix}-champ (only if distinct)`]),
      baseMatches: (referenceModels.length + CAMPAIGN.lineages.length) *
        perModelPerDifficulty * h.difficulties.length,
      maxMatches: (referenceModels.length + maxCandidates) *
        perModelPerDifficulty * h.difficulties.length,
    },
    collapse: {
      tool: 'tools/benchmark/collapse-regression.cjs',
      cells: CAMPAIGN.collapse.cells,
      baselineJob: 'baseline-newbot',
      baselineModel: CAMPAIGN.collapse.baselineModel,
      referenceModel: CAMPAIGN.collapse.referenceModel,
      candidateJobs: CAMPAIGN.lineages.map((l) =>
        [`${l.candidatePrefix}-prov`, `${l.candidatePrefix}-champ (only if distinct)`]),
      note: 'Re-runs the pinned 17 regression cells under the posture bot.',
    },
    gate: CAMPAIGN.gate,
    autoDeploy: CAMPAIGN.autoDeploy,
    officialChampion: 'stageC',
    out: path.relative(ROOT, OUT) || OUT,
  };
}
if (opts.dryRun) {
  console.log(JSON.stringify(dryRunPlan()));
  process.exit(0);
}

// ---- shared state ----
function loadCampaign() {
  const file = path.join(OUT, 'campaign.json');
  const campaign = readJson(file);
  if (!campaign) throw Error('Missing campaign.json — run the setup phase first');
  if (campaign.engineCommit !== CAMPAIGN.engineCommit ||
      campaign.botSHA256 !== CAMPAIGN.botSHA256)
    throw Error('campaign.json pins do not match this driver');
  for (const [label, sha] of Object.entries(CAMPAIGN.references))
    if (campaign.references?.[label] !== sha)
      throw Error(`campaign.json reference ${label} does not match this driver`);
  return campaign;
}
function candidateState() {
  return readJson(path.join(OUT, 'training-candidates.json'));
}
function candidateModels() {
  const state = candidateState();
  return state ? state.candidates.map((c) => c.label) : [];
}
function expectedShaFor(model) {
  if (model in CAMPAIGN.references) return CAMPAIGN.references[model];
  return candidateState()?.candidates.find((c) => c.label === model)
    ?.policySHA256 ?? null;
}
function setup(opts2) {
  const {engine, engineCommit} = opts2;
  if (!engine) throw Error('Provide --engine /path/to/OpenFrontIO');
  common.engineInfo(path.resolve(engine), engineCommit);
  if (!fs.existsSync(BOT_FILE)) throw Error('Missing bot ' + BOT_FILE);
  requireSha(digest(fs.readFileSync(BOT_FILE, 'utf8')), CAMPAIGN.botSHA256, 'bot');
  // All seven reference models are pinned files from the V5 campaign's
  // models-source/ directory, copied into models-source/.
  const modelsDir = path.join(OUT, 'models-source');
  const wanted = {};
  for (const [label, rel] of Object.entries(CAMPAIGN.referenceFiles)) {
    const src = path.join(MODELS_SOURCE, rel);
    const loaded = loadModel(src);
    requireSha(loaded.sha, CAMPAIGN.references[label], `reference ${label}`);
    wanted[label] = loaded;
  }
  const zero = policyV4.validate(policyV4.zero());
  requireSha(digest(JSON.stringify(zero)), CAMPAIGN.references.zero, 'zero');
  fs.mkdirSync(modelsDir, {recursive: true});
  for (const [label, info] of Object.entries(wanted)) {
    const dest = path.join(modelsDir, `${label}.json`);
    if (!fs.existsSync(dest)) writeJsonWx(dest, info.model);
    else {
      const loaded = policyV4.validate(JSON.parse(fs.readFileSync(dest, 'utf8')));
      requireSha(digest(JSON.stringify(loaded)), info.sha, `models-source ${label}`);
    }
  }
  const campaignFile = path.join(OUT, 'campaign.json');
  const campaign = {
    title: CAMPAIGN.title, created: new Date().toISOString(),
    engineCommit: CAMPAIGN.engineCommit, bot: CAMPAIGN.bot,
    botSHA256: CAMPAIGN.botSHA256, schema: CAMPAIGN.schema,
    references: CAMPAIGN.references,
    referenceSource: {modelsSource: MODELS_SOURCE},
    modelsDir: path.relative(OUT, modelsDir),
    training: CAMPAIGN.training, lineages: CAMPAIGN.lineages,
    holdout: CAMPAIGN.holdout, collapse: CAMPAIGN.collapse,
    gateReferences: CAMPAIGN.gateReferences,
    gate: CAMPAIGN.gate, autoDeploy: CAMPAIGN.autoDeploy,
    officialChampion: 'stageC',
  };
  if (!fs.existsSync(campaignFile)) writeJsonWx(campaignFile, campaign);
  console.log('setup OK: engine, bot and all reference models pinned');
  return campaign;
}

// ---- training phase (one independent lineage) ----
function trainLineage(lineage, opts2) {
  const t = CAMPAIGN.training;
  const trainingDir = path.join(OUT, `training-${lineage.key}`);
  const planFile = path.join(trainingDir, 'plan.json');
  const historyFile = path.join(trainingDir, 'history.json');
  const provFile = path.join(trainingDir, 'provisional.json');
  const champFile = path.join(trainingDir, 'champion.json');
  const historyComplete = () => {
    const hist = readJson(historyFile);
    return hist && Array.isArray(hist.history) &&
      hist.history.length === t.generations && fs.existsSync(provFile);
  };
  if (historyComplete()) {
    console.log(`lineage ${lineage.key}: training already complete (${t.generations} generations)`);
  } else {
    // A planless directory (crash before the first generation report) has
    // nothing reusable. A directory WITH plan.json is resumed by the
    // trainer itself: completed generations are skipped and every
    // completed match row (row.json) is reused.
    if (fs.existsSync(trainingDir) && !fs.existsSync(planFile)) {
      console.log(`lineage ${lineage.key}: removing planless training directory: ` + trainingDir);
      rmrf(trainingDir);
    }
    const budgetSec = opts2.wallBudget ?? t.wallBudgetSeconds;
    const args = ['trainer/train.mjs',
      '--schema', String(CAMPAIGN.schema),
      '--engine', path.resolve(opts2.engine),
      '--engineCommit', CAMPAIGN.engineCommit,
      '--bot', BOT_FILE,
      '--initialModel', path.join(OUT, 'models-source', `${lineage.initialModel}.json`),
      '--maps', t.maps.join(','),
      '--size', t.size,
      '--nations', t.nations.join(','),
      '--difficulty', t.difficulties.join(','),
      '--generations', String(t.generations),
      '--population', String(t.population),
      '--trainSeeds', String(t.trainSeeds),
      '--evalSeeds', String(t.evalSeeds),
      '--ticks', String(t.ticks),
      '--ticksSchedule', t.ticksSchedule.join(','),
      '--sigma', String(t.sigma),
      '--parallel', String(opts2.parallel),
      '--gameType', t.gameType, '--gameMode', t.gameMode,
      '--scriptedHumans', String(t.scriptedHumans),
      '--opponentProfile', t.opponentProfile,
      '--out', trainingDir,
      '--wallBudgetSeconds', String(budgetSec)];
    const completedSoFar = () => {
      const h = readJson(historyFile);
      return h && Array.isArray(h.history) ? h.history.length : 0;
    };
    console.log(`lineage ${lineage.key}: starting training (wall budget ${budgetSec}s; resumes at the first incomplete generation): ` + args.slice(2).join(' '));
    const logFd = fs.openSync(path.join(OUT, `training-${lineage.key}.train.log`), 'a');
    // Hang net: the trainer self-reports a budget stop (exit 0); the spawn
    // timeout only fires on a hang (budget + 6h for the in-flight gen).
    const result = spawnSync(RUNNER, args, {
      cwd: ROOT, encoding: 'utf8',
      timeout: budgetSec * 1000 + 6 * 60 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', logFd, logFd],
    });
    fs.closeSync(logFd);
    if (result.error)
      throw Error(`lineage ${lineage.key}: trainer ${result.error.code === 'ETIMEDOUT' ? 'hung beyond budget + 6h hang net' : result.error.message} (completed generations: ${completedSoFar()}; re-run to resume)`);
    if (result.signal)
      throw Error(`lineage ${lineage.key}: training terminated by ${result.signal} (completed generations: ${completedSoFar()}; re-run to resume)`);
    if (result.status !== 0)
      throw Error(`lineage ${lineage.key}: training exited ${result.status} (completed generations: ${completedSoFar()}; re-run to resume) — see training-${lineage.key}.train.log`);
  }
  const plan = readJson(planFile);
  if (!plan) throw Error('training plan.json missing');
  const hist = readJson(historyFile);
  if (!hist || !Array.isArray(hist.history) || hist.history.length === 0)
    throw Error('training history missing: ' + historyFile);
  const completed = hist.history.length;
  // A wall-budget stop (status 'budget-exceeded') is a CLEAN partial: the
  // trainer persisted its full state and a re-run resumes from the first
  // incomplete generation. Any other short history is a non-clean stop.
  const budgetExceeded = hist.status === 'budget-exceeded';
  if (!budgetExceeded && completed !== t.generations)
    throw Error('training history incomplete: ' + completed + '/' + t.generations + ' — re-run the train phase to resume');
  // Candidates: the final provisional policy (always) and, if the in-loop
  // champion diverged from it and from the start model, that champion too.
  const prov = loadModel(provFile);
  const modelByLabel = {};
  const candidates = [{
    label: `${lineage.candidatePrefix}-prov`,
    file: path.relative(OUT, provFile),
    policySHA256: prov.sha,
    origin: `training-${lineage.key}/provisional.json (final generation, start model ${lineage.initialModel})`,
  }];
  modelByLabel[candidates[0].label] = prov.model;
  const champ = readJson(champFile);
  if (champ) {
    const champModel = policyV4.validate(champ);
    const champSha = digest(JSON.stringify(champModel));
    if (champSha !== prov.sha && champSha !== CAMPAIGN.references[lineage.initialModel]) {
      const label = `${lineage.candidatePrefix}-champ`;
      modelByLabel[label] = champModel;
      candidates.push({label, file: path.relative(OUT, champFile),
        policySHA256: champSha,
        origin: `training-${lineage.key}/champion.json (in-loop promotion)`});
    }
  }
  return {lineage, candidates, modelByLabel,
    status: budgetExceeded ? 'budget-exceeded' : 'completed',
    completedGenerations: completed,
    remainingGenerations: t.generations - completed,
    trainScoreFinal: hist.history[hist.history.length - 1]?.trainScore ?? null,
    published: hist.published === true};
}

function train(opts2) {
  loadCampaign();
  const results = [];
  for (const lineage of CAMPAIGN.lineages)
    results.push(trainLineage(lineage, opts2));
  const candidates = results.flatMap((r) => r.candidates);
  writeJson(path.join(OUT, 'training-candidates.json'), {
    generatedAt: new Date().toISOString(),
    lineages: results.map((r) => ({
      key: r.lineage.key, initialModel: r.lineage.initialModel,
      generations: CAMPAIGN.training.generations,
      status: r.status,
      completedGenerations: r.completedGenerations,
      remainingGenerations: r.remainingGenerations,
      trainScoreFinal: r.trainScoreFinal, published: r.published,
    })),
    candidates,
  });
  // Materialize candidate policies where the holdout phase consumes every
  // model from a single layout: models-source/<label>.json. A resumed or
  // budget-stopped re-run may yield a NEW policy under the same label, so
  // a changed file is replaced (verified holdout matches are keyed by
  // SHA and will re-run for the new model). References stay strict.
  const modelsDir = path.join(OUT, 'models-source');
  for (const r of results)
    for (const c of r.candidates) {
      const dest = path.join(modelsDir, `${c.label}.json`);
      if (!fs.existsSync(dest)) writeJsonWx(dest, r.modelByLabel[c.label]);
      else {
        const loaded = policyV4.validate(JSON.parse(fs.readFileSync(dest, 'utf8')));
        const sha = digest(JSON.stringify(loaded));
        if (sha === c.policySHA256) continue;
        fs.rmSync(dest, {force: true, maxRetries: 5});
        writeJsonWx(dest, r.modelByLabel[c.label]);
      }
    }
  console.log('training candidates: ' +
    candidates.map((c) => `${c.label}=${c.policySHA256.slice(0, 12)}`).join(', '));
  return candidates;
}

// ---- holdout phase ----
async function holdout(opts2) {
  const campaign = loadCampaign();
  const candidates = candidateModels();
  const models = [...Object.keys(CAMPAIGN.references), ...candidates];
  const h = CAMPAIGN.holdout;
  const holdoutRoot = path.join(OUT, 'holdout');
  const jobs = [];
  for (const model of models)
    for (const difficulty of h.difficulties)
      for (const seed of h.seeds)
        for (const map of h.maps)
          for (const nation of h.nations)
            jobs.push({model, difficulty, seed, map, nation,
              dir: path.join(holdoutRoot, `difficulty-${difficulty}`, 'matches', model,
                `${seed}-${map}-${nation}`)});
  const isDone = (job) => {
    const v = readJson(path.join(job.dir, 'holdout-verified.json'));
    return v?.valid === true && v.policySHA256 === expectedShaFor(job.model);
  };
  const verifiedShaOk = (dir, model) => {
    const v = readJson(path.join(dir, 'holdout-verified.json'));
    const expected = expectedShaFor(model);
    return expected != null && v?.valid === true && v.policySHA256 === expected;
  };
  const startedAt = Date.now();
  // Wall-clock budget for THIS holdout run. Verified matches persist on
  // disk (isDone), so a budget stop is clean and a re-run continues the
  // remainder. Each match still has its own 30-minute timeout.
  const budgetSec = opts2.wallBudget ?? h.wallBudgetSeconds;
  const deadline = budgetSec > 0 ? startedAt + budgetSec * 1000 : Infinity;
  let budgetHit = false;
  let done = 0;
  const failures = [];
  const spawnMatch = (args) => new Promise((resolve) => {
    const child = spawn(RUNNER, args, {cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += String(d); });
    const timer = setTimeout(() => child.kill(), 30 * 60 * 1000);
    child.on('error', (e) => { clearTimeout(timer); resolve({error: e, stderr}); });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({status, signal, stderr});
    });
  });
  const runOne = async (job) => {
    if (Date.now() >= deadline) { budgetHit = true; return 'budget'; }
    const args = ['tools/benchmark/holdout-eval.mjs',
      '--engine', path.resolve(opts2.engine),
      '--engineCommit', CAMPAIGN.engineCommit,
      '--bot', BOT_FILE,
      '--policy', path.join(OUT, 'models-source', `${job.model}.json`),
      '--map', job.map, '--size', h.size, '--difficulty', job.difficulty,
      '--bots', '0', '--nations', String(job.nation), '--seed', job.seed,
      '--gameType', h.gameType, '--gameMode', h.gameMode,
      '--scriptedHumans', String(h.scriptedHumans),
      '--opponentProfile', h.opponentProfile,
      '--ticks', String(h.ticks), '--profile', h.profile,
      '--out', job.dir];
    rmrf(job.dir);
    fs.mkdirSync(path.dirname(job.dir), {recursive: true});
    let attempt = await spawnMatch(args);
    if (!verifiedShaOk(job.dir, job.model)) {
      rmrf(job.dir);
      fs.mkdirSync(path.dirname(job.dir), {recursive: true});
      attempt = await spawnMatch(args);
    }
    if (!verifiedShaOk(job.dir, job.model)) {
      failures.push({job, status: attempt.status, signal: attempt.signal,
        stderr: attempt.stderr.slice(-2000)});
      return false;
    }
    return true;
  };
  const pending = jobs.filter((job) => !isDone(job));
  console.log(`holdout: ${jobs.length - pending.length}/${jobs.length} already verified, ${pending.length} to run (wall budget ${budgetSec}s)`);
  for (let i = 0; i < pending.length; i += 100) {
    const chunk = pending.slice(i, i + 100);
    await pool(chunk, opts2.parallel, async (job) => {
      const ok = await runOne(job);
      done++;
      console.log(`${ok === 'budget' ? 'budget' : ok ? 'ok' : 'FAIL'} ${job.model} ${job.difficulty} ${job.seed} ${job.map} n${job.nation} (${done}/${jobs.length})`);
      return ok;
    });
  }
  const wallSec = Math.round((Date.now() - startedAt) / 1000);
  const verified = jobs.filter((job) => isDone(job)).length;
  writeJson(path.join(holdoutRoot, 'holdout-state.json'), {
    startedAt: new Date(startedAt).toISOString(), finishedAt: new Date().toISOString(),
    wallSec, total: jobs.length, verified,
    incomplete: budgetHit || failures.length > 0,
    reason: budgetHit ? 'wall-budget' : failures.length ? 'failures' : 'complete',
    budgetSeconds: budgetSec,
    failed: failures.map((f) => f.job),
  });
  if (budgetHit) {
    if (opts2.allowPartial) {
      console.warn(`holdout stopped by wall budget after ${wallSec}s — ${verified}/${jobs.length} verified (--allowPartial); re-run to continue`);
      return failures;
    }
    throw Error(`holdout stopped by wall budget after ${wallSec}s — ${verified}/${jobs.length} verified; re-run the holdout phase to continue`);
  }
  if (failures.length) {
    console.error(`holdout: ${failures.length} match(es) failed after one retry`);
    if (!opts2.allowPartial) {
      for (const f of failures) console.error(`  ${f.job.model} ${f.job.difficulty} ${f.job.seed} ${f.job.map} n${f.job.nation}: exit=${f.status}${f.stderr ? '\n' + f.stderr : ''}`);
      throw Error('holdout incomplete — re-run the holdout phase to fill gaps');
    }
  } else {
    console.log(`holdout complete: ${jobs.length}/${jobs.length} verified (${wallSec}s)`);
  }
  return failures;
}

// ---- collapse phase (V6-specific: 17 pinned regression cells) ----
// Re-runs the exact Phase-1 pinned regression cells under the NEW posture
// bot. "baseline-newbot" repeats the V5-V4-prov vs stageC pairing that
// produced the 6A/2B/9C baseline report on the old bot — isolating the
// pure runtime collapse-prevention effect (no retraining). Each trained
// candidate gets one job against stageC (works before training too: the
// baseline job needs no candidates). Resumable: a job is complete when
// its report file validates (cell count, pins, no per-cell errors); the
// tool itself requires a fresh output directory, so a completed job is
// never re-run.
const COLLAPSE_REPORT = 'collapse-regression.json';
function collapseReportFile(job) {
  return path.join(OUT, 'collapse', job.label, COLLAPSE_REPORT);
}
function collapseJobValid(job) {
  const r = readJson(collapseReportFile(job));
  if (!r || r.kind !== 'v6-collapse-regression-set') return false;
  if (r.cells !== CAMPAIGN.collapse.cells ||
      r.botSHA256 !== CAMPAIGN.botSHA256 ||
      r.engineCommit !== CAMPAIGN.engineCommit)
    return false;
  if (r.candidate !== job.model || r.reference !== job.referenceModel)
    return false;
  if (!Array.isArray(r.rows) || r.rows.length !== r.cells) return false;
  return r.rows.every((row) =>
    row.candidateError == null && row.referenceError == null);
}
function collapseJobs() {
  const c = CAMPAIGN.collapse;
  const jobs = [{
    label: 'baseline-newbot',
    model: c.baselineModel,
    referenceModel: c.referenceModel,
  }];
  for (const label of candidateModels())
    jobs.push({label, model: label, referenceModel: c.referenceModel});
  return jobs;
}
function runCollapseJob(job, opts2) {
  const outDir = path.join(OUT, 'collapse', job.label);
  const args = ['tools/benchmark/collapse-regression.cjs',
    '--engine', path.resolve(opts2.engine),
    '--engineCommit', CAMPAIGN.engineCommit,
    '--bot', BOT_FILE,
    '--model', path.join(OUT, 'models-source', `${job.model}.json`),
    '--referenceModel', path.join(OUT, 'models-source', `${job.referenceModel}.json`),
    '--out', outDir, '--parallel', String(opts2.parallel)];
  rmrf(outDir);
  fs.mkdirSync(outDir, {recursive: true});
  const logFd = fs.openSync(path.join(OUT, `collapse-${job.label}.log`), 'a');
  // 34 matches (17 cells x 2 models) at 18000 ticks; 30 min is a
  // generous hang net, not a target.
  const result = spawnSync(RUNNER, args, {
    cwd: ROOT, encoding: 'utf8',
    timeout: 30 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', logFd, logFd],
  });
  fs.closeSync(logFd);
  if (result.error)
    throw Error(`collapse ${job.label}: ${result.error.code === 'ETIMEDOUT' ? 'hung beyond 30 min' : result.error.message} — see collapse-${job.label}.log`);
  if (result.signal || result.status !== 0)
    throw Error(`collapse ${job.label} failed (exit=${result.status}) — see collapse-${job.label}.log`);
}
function collapsePhase(opts2) {
  loadCampaign();
  const jobs = collapseJobs();
  const pending = jobs.filter((job) => !collapseJobValid(job));
  console.log(`collapse: ${jobs.length - pending.length}/${jobs.length} job(s) already complete, ${pending.length} to run (${CAMPAIGN.collapse.cells} pinned cells each, reference ${CAMPAIGN.collapse.referenceModel})`);
  for (const job of pending) {
    console.log(`collapse ${job.label}: ${job.model} vs ${job.referenceModel}`);
    runCollapseJob(job, opts2);
  }
  const jobSummaries = jobs.map((job) => {
    if (!collapseJobValid(job))
      throw Error(`collapse job ${job.label} report invalid — re-run the collapse phase`);
    const r = readJson(collapseReportFile(job));
    return {
      job: job.label, model: job.model,
      referenceModel: job.referenceModel,
      typeCounts: r.typeCounts,
      cells: r.rows.map((row) => row.key),
    };
  });
  // Pin-drift guard: the baseline-newbot job must cover exactly the same
  // cell keys as the Phase-1 pinned baseline report (when present).
  const pinnedFile = path.join(ROOT, 'benchmark-results',
    'v6-collapse-regression', 'v5-baseline', COLLAPSE_REPORT);
  const pinned = readJson(pinnedFile);
  const baselineSummary = jobSummaries.find((j) => j.job === 'baseline-newbot');
  if (pinned && baselineSummary) {
    const keys = (rows) => rows.map((row) => row.key).sort();
    if (JSON.stringify(keys(pinned.rows)) !== JSON.stringify(baselineSummary.cells.sort()))
      throw Error('collapse: baseline-newbot cell keys differ from the pinned v5-baseline cell set (pin drift)');
  }
  writeJson(path.join(OUT, 'collapse', 'summary.json'), {
    generatedAt: new Date().toISOString(),
    botSHA256: CAMPAIGN.botSHA256,
    engineCommit: CAMPAIGN.engineCommit,
    jobs: jobSummaries,
  });
  for (const s of jobSummaries)
    console.log(`collapse ${s.job}: A=${s.typeCounts.A} B=${s.typeCounts.B} C=${s.typeCounts.C}`);
  return jobSummaries;
}

// ---- report phase ----
const mPath = (dir) => path.join(dir, 'match.json');
function extractRow(label, seed, map, nation, dir, expectedSha) {
  const v = readJson(path.join(dir, 'holdout-verified.json'));
  const m = readJson(mPath(dir));
  const verified = v?.valid === true;
  const row = {
    label, seed, map, nation, verified, confirmed: false,
    termination: null, outcome: null,
    endLand: null, peakLand: null, meanLand: null, retention: null,
    firstLand: null, landChange: null, lostFromPeak: null,
    territoryGained: null, receiptsConfirmed: null,
    goldIncome: null, tradeIncome: null, trainIncome: null,
    buildConfirmed: null, buildStalled: null,
    transportArrived: null, bridgeheadHeld: null, bridgeheadLost: null,
    warshipSent: null, homeMax: null, attackCommands: null,
    decisionTimeline: null, endTick: null,
    victoryProgress: null, engineWinner: null,
    policySHA256: v?.policySHA256 ?? m?.benchmarkMeta?.policySHA256 ?? null,
    botSHA256: v?.botSHA256 ?? null,
    engineCommit: v?.engineCommit ?? m?.benchmarkMeta?.engineCommit ?? null,
  };
  if (!verified) {
    row.policySHA256Ok = row.policySHA256 === expectedSha;
    return row;
  }
  const tr = m.trajectory?.summary || {};
  const atk = m.attackReceipts || {};
  const inc = m.income || {};
  const c = m.recording?.counts || {};
  const ms = m.marine?.stats || {};
  const termination = m.run?.termination ?? null;
  const outcome = m.gameEnd?.outcome ?? null;
  row.confirmed = ['game-over', 'eliminated'].includes(termination) &&
    ['victory', 'defeat'].includes(outcome);
  row.outcome = row.confirmed ? outcome : 'incomplete';
  row.termination = termination;
  row.endLand = num(tr.endLand);
  row.peakLand = num(tr.peakLand);
  row.meanLand = num(tr.meanLand);
  row.retention = num(tr.retention);
  row.firstLand = num(tr.firstLand);
  row.landChange = num(tr.landChange);
  if (row.peakLand != null && row.endLand != null)
    row.lostFromPeak = row.peakLand - row.endLand;
  row.territoryGained = num(atk.territoryGained);
  row.receiptsConfirmed = num(atk.confirmed);
  row.goldIncome = num(inc.gold);
  row.tradeIncome = num(inc.trade);
  row.trainIncome = num(inc.train);
  row.buildConfirmed = num(c.build_confirmed);
  row.buildStalled = num(c.build_stalled);
  row.transportArrived = num(ms.transportArrived);
  row.bridgeheadHeld = num(ms.bridgeheadHeld);
  row.bridgeheadLost = num(ms.bridgeheadLost);
  row.warshipSent = num(ms.warshipSent);
  row.homeMax = num(tr.peakHome);
  row.attackCommands = num(c.attack_command);
  row.decisionTimeline = num(c.decision_timeline);
  row.endTick = num(m.run?.tick);
  row.victoryProgress = num(m.victory?.progress);
  row.engineWinner = m.engineWinner ?? null;
  row.policySHA256Ok = row.policySHA256 === expectedSha;
  return row;
}

function summarize(label, rows) {
  const n = rows.length;
  const verified = rows.filter((r) => r.verified).length;
  const wins = rows.filter((r) => r.outcome === 'victory').length;
  const losses = rows.filter((r) => r.outcome === 'defeat').length;
  const eliminations = rows.filter((r) => r.termination === 'eliminated').length;
  const tickLimits = rows.filter((r) => r.termination === 'tick-limit').length;
  const mean = (k) => {
    const xs = rows.map((r) => r[k]).filter((x) => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return {n, verified, errored: n - verified, wins, losses, eliminations,
    tickLimits, winRate: n ? wins / n : null,
    meanEndLand: mean('endLand'), meanPeakLand: mean('peakLand'),
    meanMeanLand: mean('meanLand'), meanRetention: mean('retention'),
    meanLostFromPeak: mean('lostFromPeak'),
    meanTerritoryGained: mean('territoryGained'),
    meanReceiptsConfirmed: mean('receiptsConfirmed'),
    meanGoldIncome: mean('goldIncome'), meanBuildConfirmed: mean('buildConfirmed'),
    meanBuildStalled: mean('buildStalled'), meanTransportArrived: mean('transportArrived'),
    meanBridgeheadHeld: mean('bridgeheadHeld'), meanWarshipSent: mean('warshipSent'),
    meanHomeMax: mean('homeMax'), meanAttackCommands: mean('attackCommands'),
    meanDecisionTimeline: mean('decisionTimeline'), meanEndTick: mean('endTick')};
}
function impact(label, rows, zeroRows) {
  const pairs = Math.min(rows.length, zeroRows.length);
  const delta = (k) => {
    const d = [];
    for (let i = 0; i < pairs; i++) {
      const a = rows[i][k], b = zeroRows[i][k];
      if (a != null && b != null) d.push(a - b);
    }
    return d.length ? d.reduce((s, x) => s + x, 0) / d.length : null;
  };
  let pairedWinsVsZero = 0, pairedLossesVsZero = 0;
  for (let i = 0; i < pairs; i++) {
    const a = rows[i].endLand, b = zeroRows[i].endLand;
    if (a != null && b != null) {
      if (a > b) pairedWinsVsZero++;
      else if (a < b) pairedLossesVsZero++;
    }
  }
  return {pairs, meanAttackCommandDelta: delta('attackCommands'),
    meanDecisionTimelineDelta: delta('decisionTimeline'),
    meanEndLandDelta: delta('endLand'), meanTerritoryGainedDelta: delta('territoryGained'),
    pairedWinsVsZero, pairedLossesVsZero};
}
function gateRow(row) {
  return {
    difficulty: row.difficulty, map: row.map, nation: row.nation,
    gameType: 'Singleplayer', gameMode: 'FFA', scriptedHumans: 0,
    opponentProfile: 'balanced', seed: row.seed,
    outcome: row.confirmed ? row.outcome : 'incomplete',
    validSample: row.confirmed || (row.verified && row.termination === 'tick-limit'),
    exitCode: 0,
    endTick: row.endTick ?? NaN,
    land: row.endLand ?? NaN,
  };
}
// The collapse phase's per-job summary, embedded in decision.json and
// summary.json so the report is self-contained (null when the collapse
// phase has not run yet).
function collapseSummary() {
  const summary = readJson(path.join(OUT, 'collapse', 'summary.json'));
  if (!summary) return null;
  const out = {};
  for (const j of summary.jobs)
    out[j.job] = {
      model: j.model, referenceModel: j.referenceModel,
      typeCounts: j.typeCounts, cells: j.cells.length,
    };
  return out;
}
function comparePaired(refRows, candRows) {
  const byKey = (rows) => {
    const m = new Map();
    for (const r of rows)
      m.set([r.difficulty, r.map, r.nation, r.seed].join('|'), r);
    return m;
  };
  // Map through gateRow first: it is where validSample is derived
  // (raw holdout rows do not carry that field).
  const a = byKey(refRows.map((r) => gateRow({...r})));
  const b = byKey(candRows.map((r) => gateRow({...r})));
  const pairs = [];
  for (const [key, ra] of a) {
    const rb = b.get(key);
    if (!rb) continue;
    if (!ra.validSample || !rb.validSample) continue;
    pairs.push([ra, rb]);
  }
  return {pairs: pairs.length, result: evaluationV2.compare(
    pairs.map(([x]) => x), pairs.map(([, x]) => x))};
}
function report(opts2) {
  const campaign = loadCampaign();
  const candidates = candidateModels();
  const models = [...Object.keys(CAMPAIGN.references), ...candidates];
  const h = CAMPAIGN.holdout;
  const holdoutRoot = path.join(OUT, 'holdout');
  const state = readJson(path.join(holdoutRoot, 'holdout-state.json'));
  const allComparisons = [];
  const summary = {};
  for (const difficulty of h.difficulties) {
    const diffDir = path.join(holdoutRoot, `difficulty-${difficulty}`);
    const rowsByModel = {};
    for (const model of models) {
      const rows = [];
      for (const seed of h.seeds)
        for (const map of h.maps)
          for (const nation of h.nations) {
            const dir = path.join(diffDir, 'matches', model, `${seed}-${map}-${nation}`);
            const row = extractRow(model, seed, map, nation, dir, expectedShaFor(model));
            row.difficulty = difficulty;
            rows.push(row);
          }
      rowsByModel[model] = rows;
    }
    const summarySection = {};
    for (const model of models)
      summarySection[model] = summarize(model, rowsByModel[model]);
    summary[difficulty] = summarySection;
    const zeroRows = rowsByModel.zero || [];
    const impactSection = {};
    for (const model of models)
      if (model !== 'zero') impactSection[model] = impact(model, rowsByModel[model], zeroRows);
    writeJson(path.join(diffDir, 'evaluation.json'), {
      engineCommit: CAMPAIGN.engineCommit,
      bot: CAMPAIGN.bot,
      botSHA256: CAMPAIGN.botSHA256,
      difficulty,
      maps: h.maps, nations: h.nations, seeds: h.seeds,
      ticks: h.ticks,
      generatedAt: new Date().toISOString(),
      wallSec: state?.wallSec ?? null,
      note: 'Neural V6 independent paired holdout: seeds v6hold-* disjoint from all v3hold-*, v4hold-*, v5hold-* and train/eval seeds. Identical conditions for all models. Provenance-verified per match.',
      summary: summarySection,
      impact: impactSection,
      rows: models.flatMap((m) => rowsByModel[m]),
    });
    console.log(`report ${difficulty}: ${models.length} models x ${h.seeds.length * h.maps.length * h.nations.length} rows`);
    // Gate: each V6 candidate vs every gate reference, per difficulty.
    for (const candidate of candidates) {
      for (const reference of CAMPAIGN.gateReferences) {
        const {pairs, result} = comparePaired(rowsByModel[reference], rowsByModel[candidate]);
        allComparisons.push({candidate, reference, difficulty, pairs, ...result});
      }
    }
    for (let i = 0; i < candidates.length; i++)
      for (let j = i + 1; j < candidates.length; j++) {
        const {pairs, result} = comparePaired(rowsByModel[candidates[i]], rowsByModel[candidates[j]]);
        allComparisons.push({candidate: candidates[j], reference: candidates[i],
          difficulty, pairs, ...result});
      }
  }
  const promoted = allComparisons.filter((c) => c.promoted);
  const decision = {
    title: CAMPAIGN.title,
    generatedAt: new Date().toISOString(),
    gate: CAMPAIGN.gate,
    gateReferences: CAMPAIGN.gateReferences,
    autoDeploy: CAMPAIGN.autoDeploy,
    officialChampion: 'stageC',
    candidates,
    referenceModels: Object.keys(CAMPAIGN.references),
    comparisons: allComparisons,
    collapse: collapseSummary(),
    verdict: candidates.length === 0
      ? 'no V6 candidates yet — training phase not completed'
      : promoted.length
        ? `promoted on ${promoted.length} comparison(s) — review before any live swap`
        : 'NO PROMOTION — no verified improvement over stageC, V4-prov, V5-A-prov or V5-V4-prov',
    note: 'stageC remains the official champion. No live userscript is modified by this campaign; a live swap requires a separate explicit decision.',
  };
  writeJson(path.join(holdoutRoot, 'decision.json'), decision);
  writeJson(path.join(holdoutRoot, 'summary.json'), {
    title: CAMPAIGN.title, generatedAt: new Date().toISOString(),
    models, holdout: h, summary, collapse: collapseSummary(),
  });
  const docsDir = path.join(ROOT, 'docs', 'training-analysis-neural-v6-collapse');
  fs.mkdirSync(docsDir, {recursive: true});
  fs.copyFileSync(path.join(holdoutRoot, 'summary.json'),
    path.join(docsDir, 'evaluation-summary.json'));
  for (const c of allComparisons)
    console.log(`gate ${c.candidate} vs ${c.reference} ${c.difficulty}: N=${c.pairs} promoted=${c.promoted} (${c.reason})`);
  console.log('decision: ' + decision.verdict);
  return decision;
}

// ---- main ----
const phases = phaseArg === 'all'
  ? ['setup', 'train', 'holdout', 'collapse', 'report']
  : [phaseArg];
for (const phase of phases) {
  if (phase === 'setup') setup(opts);
  else if (phase === 'train') train(opts);
  else if (phase === 'holdout') await holdout(opts);
  else if (phase === 'collapse') collapsePhase(opts);
  else if (phase === 'report') report(opts);
}
console.log('campaign phase(s) complete: ' + phases.join(', '));
