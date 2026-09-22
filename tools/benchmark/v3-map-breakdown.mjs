// V3 overnight holdout — World/Europe map breakdown + paired comparison export.
//
// Issue #98: export the per-map / per-nation / per-seed breakdown that the
// aggregate evaluation-summary.json lacks, for A-champ, stageC and run3 on
// Hard and Impossible. Also emits the paired A-vs-stageC and A-vs-run3
// per-(difficulty, map, nation, seed) records and per-map win/loss/tie
// aggregates.
//
// Source (local, gitignored):
//   benchmark-results/neural-v3-overnight-10h/holdout/
//     difficulty-<Hard|Impossible>/evaluation.json   (480 rows = 10 models x 48)
//     difficulty-<d>/matches/<model>/<seed>-<Map>-<nation>/match.json
//
// The evaluation.json rows carry the bot-side metrics (land, retention, build,
// transport, attacks, endTick). The match.json trajectory carries the enemy
// data (meanEnemyLand / finalEnemyLand / enemyTroops) that the rows lack.
//
// Provenance is re-verified per match: policySHA256 (model), botSHA256 and
// engineCommit must all match the pinned values, and the benchmarkMeta
// seed/map/nation must match the folder name. Missing values are carried as
// null (never 0) and the denominator of every mean is disclosed.
//
// Usage:
//   node tools/benchmark/v3-map-breakdown.mjs [--strict]
// Idempotent: always regenerates map-breakdown.json from the local results.
// --strict: exit non-zero if any match is missing or any provenance mismatches.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const HOLDOUT = path.join(ROOT, 'benchmark-results', 'neural-v3-overnight-10h', 'holdout');
const OUT = path.join(ROOT, 'docs', 'training-analysis-neural-v3-overnight', 'map-breakdown.json');

const STRICT = process.argv.includes('--strict');

// Pinned provenance (issue #98).
const EXPECTED = {
  botSHA256: '008c1a2536cd9ef324a6372de7f65c7400bb9587c46dca8c74e0d3f3a4dff246',
  engineCommit: 'bb8af015b515b3b717bd4d901074c5f4c16641cb',
  models: {
    'A-champ': '0b526b7717b5975ebad583d167441f2646b14caa625a2f727783803e33a978a5',
    'stageC': '84d1f593039166f9e953272524ac1018b4034adcf4304cb4e6c49757d752d2e1',
    'run3': 'e0fceaef90d542d3811dcd0b261fb3284577cf319912989a2f3eaa7647d39968',
  },
};

const DIFFICULTIES = ['Hard', 'Impossible'];
const MAPS = ['World', 'Europe'];
const NATIONS = [1, 4];
const SEEDS = Array.from({length: 12}, (_, i) => `v3hold-${i}`);
const MODELS = Object.keys(EXPECTED.models);
const MAX_TICKS = 18000;

// The paired comparisons required by the issue.
const PAIRINGS = [
  {key: 'A-champ_vs_stageC', a: 'A-champ', b: 'stageC'},
  {key: 'A-champ_vs_Run3', a: 'A-champ', b: 'run3'},
];

// ---- small helpers ----
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
};
// Null-safe mean: returns [mean, denominator]. Missing values are excluded,
// never treated as zero.
function meanDisclosed(xs) {
  const vals = xs.filter((x) => x != null);
  if (!vals.length) return [null, 0];
  return [vals.reduce((s, x) => s + x, 0) / vals.length, vals.length];
}

// ---- load a single difficulty's rows, keyed by (seed|map|nation) ----
function loadDifficulty(difficulty) {
  const evalPath = path.join(HOLDOUT, `difficulty-${difficulty}`, 'evaluation.json');
  const evalJson = readJson(evalPath);
  if (!evalJson) throw new Error(`missing evaluation.json for ${difficulty}`);
  const byKey = new Map();
  const duplicates = [];
  for (const row of evalJson.rows || []) {
    if (!MODELS.includes(row.label)) continue;
    const key = `${row.label}|${row.seed}|${row.map}|${row.nation}`;
    if (byKey.has(key)) duplicates.push(key);
    byKey.set(key, row);
  }
  return {evalJson, byKey, duplicates};
}

// ---- extract one record from a row + its match.json (null-honest) ----
function extractRecord(row, match) {
  const summary = match?.trajectory?.summary || {};
  const samples = match?.trajectory?.samples || [];
  const last = samples.length ? samples[samples.length - 1] : null;
  const fin = match?.finalState || {};
  return {
    seed: row.seed, map: row.map, nation: row.nation,
    verified: row.verified === true,
    confirmed: row.confirmed === true,
    termination: row.termination ?? null,
    outcome: row.outcome ?? null,
    // bot-side land trajectory (evaluation row)
    endLand: num(row.endLand), peakLand: num(row.peakLand),
    meanLand: num(row.meanLand), retention: num(row.retention),
    lostFromPeak: num(row.lostFromPeak),
    endTick: num(row.endTick),
    // economy / build
    buildConfirmed: num(row.buildConfirmed), buildStalled: num(row.buildStalled),
    // marine
    transportArrived: num(row.transportArrived), bridgeheadHeld: num(row.bridgeheadHeld),
    // attack commands vs actual territory-gain receipts
    attackCommands: num(row.attackCommands), territoryGained: num(row.territoryGained),
    // enemy data (match.json only; null when not recorded)
    finalEnemyLand: num(summary.finalEnemyLand),
    meanEnemyLand: num(summary.meanEnemyLand),
    enemyLand: last ? num(last.enemyLand) : null,
    enemyTroops: last ? num(last.enemyTroops) : null,
    // terminal state
    finalAlive: fin.alive ?? null,
    finalGold: fin.gold != null ? num(fin.gold) : null,
    victoryProgress: num(match?.victory?.progress),
    victoryThreat: match?.victoryThreat ? {name: match.victoryThreat.name, progress: num(match.victoryThreat.progress)} : null,
    engineWinner: match?.engineWinner ?? null,
    // provenance
    policySHA256: match?.benchmarkMeta?.policySHA256 ?? null,
    botSHA256: match?.benchmarkMeta?.botSHA256 ?? null,
    engineCommit: match?.benchmarkMeta?.engineCommit ?? null,
    matchComplete: match?.recording?.complete === true,
  };
}

// ---- aggregate a set of records into disclosed stats ----
function aggregate(records) {
  const n = records.length;
  const verified = records.filter((r) => r.verified).length;
  const errored = n - verified;
  const matchMissing = records.filter((r) => r.policySHA256 == null).length;

  const counts = {victory: 0, defeat: 0, eliminated: 0, gameOverDefeat: 0, tickLimit: 0};
  const byTermination = {};
  const byOutcome = {};
  for (const r of records) {
    if (r.outcome === 'victory') counts.victory++;
    else if (r.outcome === 'defeat') counts.defeat++;
    if (r.termination === 'eliminated') counts.eliminated++;
    if (r.termination === 'game-over' && r.outcome === 'defeat') counts.gameOverDefeat++;
    if (r.termination === 'tick-limit') counts.tickLimit++;
    byTermination[r.termination ?? 'null'] = (byTermination[r.termination ?? 'null'] || 0) + 1;
    byOutcome[r.outcome ?? 'null'] = (byOutcome[r.outcome ?? 'null'] || 0) + 1;
  }

  // every metric -> [mean, denominator]
  const metricKeys = ['endLand', 'meanLand', 'peakLand', 'retention', 'lostFromPeak', 'endTick',
    'buildConfirmed', 'buildStalled', 'transportArrived', 'bridgeheadHeld',
    'attackCommands', 'territoryGained', 'finalEnemyLand', 'meanEnemyLand',
    'enemyLand', 'enemyTroops', 'victoryProgress'];
  const means = {};
  for (const k of metricKeys) {
    const [m, d] = meanDisclosed(records.map((r) => r[k]));
    means[k] = {mean: m, n: d};
  }
  return {n, verified, errored, matchMissing, counts, byTermination, byOutcome, means};
}

// ---- build one model/difficulty breakdown ----
function buildModelBreakdown(model, difficulty, byKey) {
  const perMap = {};
  const perMapNation = {};
  const allRecords = [];
  const provenanceMismatches = [];

  for (const map of MAPS) {
    const mapRecords = [];
    for (const nation of NATIONS) {
      for (const seed of SEEDS) {
        const row = byKey.get(`${model}|${seed}|${map}|${nation}`);
        const matchDir = path.join(HOLDOUT, `difficulty-${difficulty}`, 'matches', model, `${seed}-${map}-${nation}`);
        const match = readJson(path.join(matchDir, 'match.json'));
        if (!row) {
          allRecords.push({seed, map, nation, verified: false, confirmed: false, termination: null,
            outcome: null, endLand: null, peakLand: null, meanLand: null, retention: null,
            lostFromPeak: null, endTick: null, buildConfirmed: null, buildStalled: null,
            transportArrived: null, bridgeheadHeld: null, attackCommands: null, territoryGained: null,
            finalEnemyLand: null, meanEnemyLand: null, enemyLand: null, enemyTroops: null,
            finalAlive: null, finalGold: null, victoryProgress: null, victoryThreat: null,
            engineWinner: null, policySHA256: null, botSHA256: null, engineCommit: null,
            matchComplete: false});
          continue;
        }
        const rec = extractRecord(row, match);
        // provenance check
        const expectedPolicy = EXPECTED.models[model];
        if (rec.policySHA256 !== expectedPolicy) provenanceMismatches.push(`${seed}-${map}-${nation}:policy ${rec.policySHA256}`);
        if (rec.botSHA256 !== EXPECTED.botSHA256) provenanceMismatches.push(`${seed}-${map}-${nation}:bot ${rec.botSHA256}`);
        if (rec.engineCommit !== EXPECTED.engineCommit) provenanceMismatches.push(`${seed}-${map}-${nation}:engine ${rec.engineCommit}`);
        // benchmarkMeta must agree with the folder / row key
        const meta = match?.benchmarkMeta || {};
        if (match && (meta.seed !== seed || meta.gameMap !== map || meta.gameConfig?.nations !== nation))
          provenanceMismatches.push(`${seed}-${map}-${nation}:meta seed=${meta.seed} map=${meta.gameMap} nations=${meta.gameConfig?.nations}`);
        mapRecords.push(rec);
      }
    }
    perMap[map] = {aggregate: aggregate(mapRecords), records: mapRecords};
    allRecords.push(...mapRecords);

    for (const nation of NATIONS) {
      const nationRecords = mapRecords.filter((r) => r.nation === nation);
      perMapNation[`${map}-${nation}`] = {aggregate: aggregate(nationRecords), records: nationRecords};
    }
  }

  return {
    policySHA256: EXPECTED.models[model],
    perMap, perMapNation,
    provenance: {
      expectedPolicy: EXPECTED.models[model],
      expectedBot: EXPECTED.botSHA256,
      expectedEngine: EXPECTED.engineCommit,
      matches: allRecords.length,
      verified: allRecords.filter((r) => r.verified).length,
      matchMissing: allRecords.filter((r) => r.policySHA256 == null).length,
      provenanceMismatches,
    },
  };
}

// ---- paired comparison ----
function buildPaired(pair, loaded) {
  const a = pair.a, b = pair.b;
  const records = [];
  for (const difficulty of DIFFICULTIES) {
    const dk = loaded[difficulty].byKey;
    for (const map of MAPS) for (const nation of NATIONS) for (const seed of SEEDS) {
      const ra = dk.get(`${a}|${seed}|${map}|${nation}`);
      const rb = dk.get(`${b}|${seed}|${map}|${nation}`);
      const matchDir = (m) => path.join(HOLDOUT, `difficulty-${difficulty}`, 'matches', m, `${seed}-${map}-${nation}`);
      const ma = readJson(path.join(matchDir(a), 'match.json'));
      const mb = readJson(path.join(matchDir(b), 'match.json'));
      const A = ra ? extractRecord(ra, ma) : null;
      const B = rb ? extractRecord(rb, mb) : null;
      const diffOf = (f) => {
        const x = A ? A[f] : null, y = B ? B[f] : null;
        return x != null && y != null ? x - y : null;
      };
      const deltaEndLand = diffOf('endLand');
      const result = deltaEndLand == null ? 'missing' : deltaEndLand > 0 ? 'win' : deltaEndLand < 0 ? 'loss' : 'tie';
      records.push({
        difficulty, map, nation, seed,
        A, B,
        diff: {
          endLand: deltaEndLand,
          meanLand: diffOf('meanLand'),
          peakLand: diffOf('peakLand'),
          retention: diffOf('retention'),
          lostFromPeak: diffOf('lostFromPeak'),
          endTick: diffOf('endTick'),
          finalEnemyLand: diffOf('finalEnemyLand'),
          enemyLand: diffOf('enemyLand'),
          enemyTroops: diffOf('enemyTroops'),
          buildStalled: diffOf('buildStalled'),
          buildConfirmed: diffOf('buildConfirmed'),
          attackCommands: diffOf('attackCommands'),
          territoryGained: diffOf('territoryGained'),
          transportArrived: diffOf('transportArrived'),
          bridgeheadHeld: diffOf('bridgeheadHeld'),
        },
        result,
      });
    }
  }

  // per (difficulty, map) win/loss/tie aggregate on end-land
  const perMap = {};
  for (const difficulty of DIFFICULTIES) for (const map of MAPS) {
    const sub = records.filter((r) => r.difficulty === difficulty && r.map === map);
    const wins = sub.filter((r) => r.result === 'win').length;
    const losses = sub.filter((r) => r.result === 'loss').length;
    const ties = sub.filter((r) => r.result === 'tie').length;
    const missing = sub.filter((r) => r.result === 'missing').length;
    const [meanDiffEndLand, nDiff] = meanDisclosed(sub.map((r) => r.diff.endLand));
    const [meanDiffMeanLand, nDiffMean] = meanDisclosed(sub.map((r) => r.diff.meanLand));
    perMap[`${difficulty}/${map}`] = {
      n: sub.length, wins, losses, ties, missing,
      meanDiffEndLand, meanDiffEndLandN: nDiff,
      meanDiffMeanLand, meanDiffMeanLandN: nDiffMean,
    };
  }
  return {comparison: pair.key, a, b, records, perMap};
}

// ---- main ----
function main() {
  const out = {
    title: 'V3 overnight holdout — World/Europe map breakdown & paired comparison',
    generatedAt: new Date().toISOString(),
    source: {
      holdout: path.relative(ROOT, HOLDOUT),
      engineCommit: EXPECTED.engineCommit,
      botSHA256: EXPECTED.botSHA256,
      difficulty: DIFFICULTIES,
      maps: MAPS,
      nations: NATIONS,
      seeds: SEEDS,
      maxTicks: MAX_TICKS,
    },
    models: {},
    paired: {},
  };

  // load each difficulty once and share across models + paired comparisons
  const loaded = {};
  for (const difficulty of DIFFICULTIES) loaded[difficulty] = loadDifficulty(difficulty);

  // per-model per-difficulty breakdown
  for (const model of MODELS) {
    out.models[model] = {};
    for (const difficulty of DIFFICULTIES) {
      out.models[model][difficulty] = buildModelBreakdown(model, difficulty, loaded[difficulty].byKey);
      if (loaded[difficulty].duplicates.length) out.models[model][difficulty].duplicateKeys = loaded[difficulty].duplicates;
    }
  }

  // paired
  for (const pair of PAIRINGS) out.paired[pair.key] = buildPaired(pair, loaded);

  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

  // console summary + strict gating
  let problems = 0;
  for (const model of MODELS) {
    for (const difficulty of DIFFICULTIES) {
      const bd = out.models[model][difficulty];
      const p = bd.provenance;
      const total = p.matches;
      const verified = p.verified;
      const mism = p.provenanceMismatches.length;
      const missing = p.matchMissing;
      const expectedPerModel = SEEDS.length * MAPS.length * NATIONS.length; // 48
      const ok = total === expectedPerModel && verified === expectedPerModel && mism === 0 && missing === 0;
      if (!ok) problems++;
      console.log(`${model} ${difficulty}: matches=${total}/${expectedPerModel} verified=${verified} missing=${missing} provMismatch=${mism} ${ok ? 'OK' : 'PROBLEM'}`);
    }
  }
  for (const pair of PAIRINGS) {
    const recs = out.paired[pair.key].records;
    const expectedPairs = DIFFICULTIES.length * SEEDS.length * MAPS.length * NATIONS.length; // 96
    const missingPairs = recs.filter((r) => r.result === 'missing').length;
    if (recs.length !== expectedPairs || missingPairs) problems++;
    console.log(`${pair.key}: records=${recs.length}/${expectedPairs} missingDiff=${missingPairs}`);
  }
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
  if (STRICT && problems) process.exitCode = 1;
}

main();
