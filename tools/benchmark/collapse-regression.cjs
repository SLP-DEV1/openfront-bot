#!/usr/bin/env node
'use strict';
// Phase-1 collapse regression set for OPENFRONT NEURAL V6.
//
// The 17 cells below are the Hard-holdout pairs where V5-V4-prov regressed
// against stageC (evaluation-v2, N=48). They are a DEV/REGRESSION set only —
// never promotion seeds (see docs/training-analysis-neural-v5-curriculum/
// analyse-17-hard-regressionen.md). Each cell is run against the real engine
// with pinned, exactly-reproducible parameters and classified into the
// collapse taxonomy:
//   Type A — early total wipe (eliminated, land ~0, before ~6500 ticks)
//   Type B — large peak then collapse (peak > 60k, drops below 50% of peak)
//   Type C — early death / late-territory deficit (died earlier than the
//           reference or with less end-land)
//
// The tool runs a candidate model AND the reference model (stageC) over all
// 17 cells with a given bot, classifies each cell from both matches, and
// optionally verifies exact reproducibility against a historical reference
// directory (--verifyDir). No conclusion is drawn from a single cell; the
// set is used to measure whether a V6 candidate fixes the collapse modes.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const common = require('./common.cjs');

// The 17 cells: (seed, map, nation). Pinned game parameters (exactly
// reproducible — verified byte-identical against the recorded V5 holdout):
//   --gameType Singleplayer --gameMode FFA --scriptedHumans 0
//   --opponentProfile balanced --bots 0 --difficulty Hard --ticks 18000
//   --profile autonomous --size Compact
const CELLS = Object.freeze([
  ['v5hold-0', 'World', 1], ['v5hold-0', 'Europe', 1], ['v5hold-0', 'Europe', 4],
  ['v5hold-1', 'Europe', 1], ['v5hold-1', 'Europe', 4], ['v5hold-2', 'World', 1],
  ['v5hold-2', 'Europe', 4], ['v5hold-3', 'World', 1], ['v5hold-3', 'World', 4],
  ['v5hold-3', 'Europe', 4], ['v5hold-4', 'World', 1], ['v5hold-4', 'World', 4],
  ['v5hold-5', 'World', 1], ['v5hold-5', 'Europe', 4], ['v5hold-6', 'World', 4],
  ['v5hold-10', 'Europe', 4], ['v5hold-11', 'World', 1],
]);
const CELL_PARAMS = Object.freeze({
  gameType: 'Singleplayer', gameMode: 'FFA', scriptedHumans: 0,
  opponentProfile: 'balanced', bots: 0, difficulty: 'Hard',
  ticks: 18000, profile: 'autonomous', size: 'Compact',
});

function cellKey(seed, map, nation) { return `${seed}-${map}-${nation}`; }

// Extract the collapse signature from a match.json.
function stats(m) {
  const s = m?.trajectory?.samples || [];
  let peak = 0, peakTick = 0, c50 = null;
  for (const p of s) if (p.land > peak) { peak = p.land; peakTick = p.tick; }
  for (const p of s) if (peak > 0 && p.tick > peakTick && c50 === null && p.land < peak * 0.5) c50 = p.tick;
  const ge = m?.gameEnd || {};
  return {
    outcome: ge.outcome ?? 'unknown',
    endTick: ge.tick ?? m?.run?.tick ?? 0,
    land: ge.land ?? m?.finalState?.land ?? 0,
    peak, peakTick, c50,
    termination: m?.run?.termination ?? 'unknown',
    failure: m?.run?.failure ?? null,
  };
}

// Classify a cell from the candidate (v) and reference (c) matches,
// reproducing the analysis taxonomy.
function classifyType(v, c) {
  const early = v.endTick < 6500;
  if (early && v.peak > 10000) return 'A';
  if (v.peak > 60000 && v.c50 !== null && c.outcome !== 'defeat') return 'B';
  return 'C';
}

function runMatch(engine, engineCommit, bot, model, cell, outDir) {
  const [seed, map, nation] = cell;
  const runner = path.join(__dirname, 'engine-match.mjs');
  const args = [runner,
    '--engine', engine, '--engineCommit', engineCommit,
    '--bot', bot, '--policy', model,
    '--seed', seed, '--map', map, '--size', CELL_PARAMS.size,
    '--difficulty', CELL_PARAMS.difficulty, '--gameType', CELL_PARAMS.gameType,
    '--gameMode', CELL_PARAMS.gameMode, '--scriptedHumans', String(CELL_PARAMS.scriptedHumans),
    '--opponentProfile', CELL_PARAMS.opponentProfile, '--bots', String(CELL_PARAMS.bots),
    '--nations', String(nation), '--ticks', String(CELL_PARAMS.ticks),
    '--profile', CELL_PARAMS.profile, '--out', outDir];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, err, outDir }));
  });
}

async function runPool(cells, fn, parallel) {
  const out = new Array(cells.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= cells.length) return;
      out[i] = await fn(cells[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, cells.length) }, worker));
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = { engine: null, engineCommit: common.IMPOSSIBLE_REFERENCE_COMMIT,
    bot: null, model: null, referenceModel: null, out: null,
    verifyDir: null, parallel: 8, dryRun: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !Object.hasOwn(opts, key)) throw new Error('Unknown option ' + argv[i]);
    if (key === 'dryRun') { opts[key] = true; continue; }
    const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error('Missing ' + key);
    opts[key] = key === 'parallel' ? Number(v) : v;
  }
  if (!Number.isInteger(opts.parallel) || opts.parallel < 1) throw new Error('Invalid --parallel');
  if (!/^[a-f0-9]{40}$/.test(opts.engineCommit)) throw new Error('Invalid engine SHA');

  const only = opts.only ? new Set(opts.only.split(',').map((s) => s.trim())) : null;
  const cells = only ? CELLS.filter((c) => only.has(cellKey(c[0], c[1], c[2]))) : CELLS;
  if (!cells.length) throw new Error('--only matched no cells');

  const name = (p) => (p ? path.basename(p).replace(/\.json$/, '') : null);
  const plan = {
    schema: 1, kind: 'v6-collapse-regression-set',
    cells: cells.length, params: CELL_PARAMS,
    candidate: name(opts.model), reference: name(opts.referenceModel),
    taxonomy: { A: 'early total wipe', B: 'peak-then-collapse', C: 'early death / late deficit' },
    note: 'Dev/regression set only — not promotion seeds.',
  };
  if (opts.dryRun) { console.log(JSON.stringify(plan, null, 2)); return plan; }

  if (!opts.engine) throw new Error('--engine is required');
  if (!opts.bot) throw new Error('--bot is required');
  if (!opts.model) throw new Error('--model is required');
  if (!opts.referenceModel) throw new Error('--referenceModel is required');
  if (!opts.out) throw new Error('--out is required');
  common.engineInfo(path.resolve(opts.engine), opts.engineCommit);
  const botSha = common.digest(fs.readFileSync(opts.bot));
  const outRoot = path.resolve(opts.out);
  if (fs.existsSync(outRoot)) throw new Error('Output already exists: ' + outRoot);
  fs.mkdirSync(outRoot, { recursive: true });

  const rows = [];
  const jobFor = (modelPath) => async (cell) => {
    const [seed, map, nation] = cell;
    const modelDir = path.basename(modelPath).replace(/\.json$/, '');
    const dir = path.join(outRoot, modelDir, cellKey(seed, map, nation));
    const { code, err } = await runMatch(path.resolve(opts.engine), opts.engineCommit,
      path.resolve(opts.bot), modelPath, cell, dir);
    let m = null, st;
    try { m = JSON.parse(fs.readFileSync(path.join(dir, 'match.json'), 'utf8')); } catch {}
    st = stats(m);
    if (code !== 0) st.error = `exit ${code}${err ? ': ' + err.trim().slice(-300) : ''}`;
    return { cell, dir, st };
  };
  const candResults = await runPool(cells, jobFor(opts.model), opts.parallel);
  const refResults = await runPool(cells, jobFor(opts.referenceModel), opts.parallel);

  const modelName = path.basename(opts.model).replace(/\.json$/, '');
  const verify = opts.verifyDir ? path.resolve(opts.verifyDir) : null;
  for (let i = 0; i < cells.length; i++) {
    const [seed, map, nation] = cells[i];
    const key = cellKey(seed, map, nation);
    const v = candResults[i], c = refResults[i];
    const type = classifyType(v.st, c.st);
    const row = { key, seed, map, nation, type,
      candidate: v.st, reference: c.st,
      candidateError: v.st.error ?? null, referenceError: c.st.error ?? null };
    if (verify) {
      const refFile = path.join(verify, modelName, key, 'match.json');
      let h = null;
      try { h = stats(JSON.parse(fs.readFileSync(refFile, 'utf8'))); } catch {}
      row.reproducible = h ? (h.outcome === v.st.outcome && h.endTick === v.st.endTick &&
        h.land === v.st.land && h.peak === v.st.peak) : false;
      row.historical = h ?? null;
    }
    rows.push(row);
  }
  const counts = { A: 0, B: 0, C: 0 };
  rows.forEach((r) => { counts[r.type]++; });
  const reproducible = rows.filter((r) => r.reproducible === true).length;
  const report = { ...plan, engineCommit: opts.engineCommit, botSHA256: botSha,
    rows, typeCounts: counts,
    ...(verify ? { historicalReproducible: `${reproducible}/${cells.length}` } : {}) };
  common.writeJSON(path.join(outRoot, 'collapse-regression.json'), report);
  for (const r of rows) console.log(JSON.stringify({ key: r.key, type: r.type,
    cand: `${r.candidate.outcome}@${r.candidate.endTick} peak=${r.candidate.peak}@${r.candidate.peakTick}`,
    ref: `${r.reference.outcome}@${r.reference.endTick} peak=${r.reference.peak}@${r.reference.peakTick}`,
    ...(verify ? { reproducible: r.reproducible } : {}) }));
  console.log(JSON.stringify({ typeCounts: counts,
    ...(verify ? { historicalReproducible: report.historicalReproducible } : {}) }));
  return report;
}

if (require.main === module) {
  main().catch((e) => { console.error(e.stack || String(e)); process.exitCode = 1; });
}
module.exports = { CELLS, CELL_PARAMS, cellKey, stats, classifyType };
