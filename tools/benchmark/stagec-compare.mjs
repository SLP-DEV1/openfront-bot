// Controlled comparison: stageC champion vs. the rule-based bot and the other
// DIFFERENT schema-4 champions, all under identical maps / seeds / opponent config.
//
// Entities (7): stageC (reference), rule-based (no neural), runC, run2, run3, runD, runA.
// Grid (8): World/Europe x nation 1/4 x variant A/B, Impossible, Compact, bots 0,
//           18000 ticks, autonomous, FFA, opponentProfile balanced, scriptedHumans 0.
// Engine: ../OpenFrontIO-Impossible @ bb8af015 (the training commit).
//
// Metrics captured SEPARATELY per model:
//   1) Tatsaechliche Siege        2) Ueberlebensdauer   3) Landbesitz
//   4) Wirtschaft                5) militaerische Entscheidungen
//
// Usage:
//   node tools/benchmark/stagec-compare.mjs [--parallel 8] [--report-only]
// Idempotent: existing COMPLETE matches are skipped; a report is always regenerated.

import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const runner = path.join(__dirname, 'engine-match.mjs');

const ENGINE = path.resolve(ROOT, '../OpenFrontIO-Impossible');
const ENGINE_COMMIT = 'bb8af015b515b3b717bd4d901074c5f4c16641cb';
const ANALYSIS = path.join(ROOT, 'docs/training-analysis-20260921');

const ENTITIES = [
  {key: 'rule-based', label: 'Regelbasierter Bot (ohne Neural-Policy)', bot: 'OpenFront_Solo_AggroBot.user.js', policy: null,
   note: 'OpenFront_Solo_AggroBot v1.19.4, reine Heuristik (kein --policy)'},
  {key: 'stageC', label: 'stageC Champion (Kurrikulum, Impossible)', bot: 'OpenFront_Solo_AggroBot.user.js',
   policy: path.join(ANALYSIS, 'schema4-ffa-curriculum-20260921-overnight/stageC/champion.json'),
   note: 'Referenzmodell; == stageA/B/runE (validierter Hash 84d1f593…)'},
  {key: 'runC', label: 'runC Champion (Hard)', bot: 'OpenFront_Solo_AggroBot.user.js',
   policy: path.join(ANALYSIS, 'schema4-hard-world-europe-20260921-runC/champion.json'), note: 'validierter Hash 50035302…'},
  {key: 'run2', label: 'run2 Champion (Impossible)', bot: 'OpenFront_Solo_AggroBot.user.js',
   policy: path.join(ANALYSIS, 'schema4-impossible-world-europe-20260920-run2/champion.json'), note: 'validierter Hash c04c0d59…'},
  {key: 'run3', label: 'run3 Champion (Impossible)', bot: 'OpenFront_Solo_AggroBot.user.js',
   policy: path.join(ANALYSIS, 'schema4-impossible-world-europe-20260920-run3/champion.json'), note: 'validierter Hash e0fceaef…'},
  {key: 'runD', label: 'runD Champion (Impossible)', bot: 'OpenFront_Solo_AggroBot.user.js',
   policy: path.join(ANALYSIS, 'schema4-impossible-world-europe-20260921-runD/champion.json'), note: 'validierter Hash 1e005aed…'},
  {key: 'runA', label: 'runA Champion (Medium)', bot: 'OpenFront_Solo_AggroBot.user.js',
   policy: path.join(ANALYSIS, 'schema4-medium-world-europe-20260921-runA/champion.json'), note: 'validierter Hash 2c0698d8…'},
];

const MAPS = ['World', 'Europe'];
const NATIONS = [1, 4];
const VARIANTS = ['A', 'B'];
const CONFIGS = [];
for (const map of MAPS) for (const nation of NATIONS) for (const v of VARIANTS)
  CONFIGS.push({map, nation, variant: v, seed: `cmp-${map}-${nation}-${v}`, id: `${map}-${nation}-${v}`});

const COMMON_ARGS = {
  difficulty: 'Impossible', size: 'Compact', bots: 0, ticks: 18000,
  profile: 'autonomous', gameType: 'Singleplayer', gameMode: 'FFA',
  opponentProfile: 'balanced', scriptedHumans: 0,
};
const OUTROOT = path.join(ROOT, 'benchmark-results', 'stageC-compare');

// ---- CLI ----
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? Number.isInteger(Number(v)) ? Number(v) : v : dflt;
};
const PARALLEL = Math.max(1, opt('--parallel', 8));
const REPORT_ONLY = argv.includes('--report-only');

const statusFile = path.join(OUTROOT, 'status.json');
const progressFile = path.join(OUTROOT, 'progress.log');
const reportMd = path.join(OUTROOT, 'report.md');
const reportJson = path.join(OUTROOT, 'report.json');
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.mkdirSync(OUTROOT, {recursive: true});
  fs.appendFileSync(progressFile, line + '\n');
  console.log(line);
};

function status(patch) {
  let s = {};
  if (fs.existsSync(statusFile)) { try { s = JSON.parse(fs.readFileSync(statusFile, 'utf8')); } catch {} }
  s = {...s, ...patch, updatedAt: new Date().toISOString()};
  fs.writeFileSync(statusFile, JSON.stringify(s, null, 2) + '\n');
  return s;
}

function completeReport(dir) {
  const f = path.join(dir, 'match.json');
  if (!fs.existsSync(f)) return null;
  try {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (r?.recording?.complete === true && r.run) return r;
    return null;
  } catch { return null; }
}

function runOneMatch(entity, config) {
  const dir = path.join(OUTROOT, entity.key, config.id);
  const existing = completeReport(dir);
  if (existing) { log(`skip ${entity.key}/${config.id} (already complete)`); return {dir, status: 'done'}; }
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  const args = [runner,
    '--engine', ENGINE, '--engineCommit', ENGINE_COMMIT,
    '--map', config.map, '--nations', String(config.nation), '--bots', String(COMMON_ARGS.bots),
    '--difficulty', COMMON_ARGS.difficulty, '--size', COMMON_ARGS.size,
    '--seed', config.seed, '--ticks', String(COMMON_ARGS.ticks), '--profile', COMMON_ARGS.profile,
    '--gameType', COMMON_ARGS.gameType, '--gameMode', COMMON_ARGS.gameMode,
    '--opponentProfile', COMMON_ARGS.opponentProfile, '--scriptedHumans', String(COMMON_ARGS.scriptedHumans),
    '--bot', path.join(ROOT, entity.bot)];
  if (entity.policy) args.push('--policy', entity.policy);
  args.push('--out', dir);
  return new Promise((resolve) => {
    const t0 = Date.now();
    log(`start ${entity.key}/${config.id} seed=${config.seed}`);
    const child = spawn(process.execPath, args, {cwd: ROOT, env: process.env});
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('error', e => {
      fs.writeFileSync(path.join(dir, 'match.stderr.log'), String(e));
      resolve({dir, status: 'error', error: String(e)});
    });
    child.on('close', code => {
      const ms = Date.now() - t0;
      fs.writeFileSync(path.join(dir, 'match.run.log'), out);
      const rep = completeReport(dir);
      const st = rep ? 'done' : (code === 0 ? 'no-report' : 'failed');
      status({done: countDone()});
      log(`${st} ${entity.key}/${config.id} exit=${code} ${ms}ms ${rep ? ('tick=' + rep.run.tick + ' outcome=' + rep.gameEnd?.outcome) : ''}`);
      resolve({dir, status: st, ms});
    });
  });
}

function countDone() {
  let n = 0;
  for (const e of ENTITIES) for (const c of CONFIGS) if (completeReport(path.join(OUTROOT, e.key, c.id))) n++;
  return n;
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

// ---- Metric extraction ----
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
function extractMatch(r) {
  const c = r.recording?.counts || {};
  const tr = r.trajectory?.summary || {};
  const fin = r.finalState || {};
  const inc = r.income || {};
  const atk = r.attackReceipts || {};
  const rock = r.rockets || {};
  const tele = r.strategicTelemetry || {};
  return {
    outcome: r.gameEnd?.outcome ?? 'unknown',
    termination: r.run?.termination ?? 'unknown',
    tick: num(r.run?.tick ?? r.gameEnd?.tick),
    complete: r.recording?.complete === true,
    // Land
    peakLand: num(tr.peakLand), meanLand: num(tr.meanLand), endLand: num(tr.endLand),
    retention: num(tr.retention), finalLand: num(fin.land),
    // Economy
    incomeGold: num(inc.gold), incomeTrain: num(inc.train), incomeTrade: num(inc.trade),
    endGold: num(fin.gold),
    buildConfirmed: c.build_confirmed ?? 0, buildStalled: c.build_stalled ?? 0,
    economyPosture: c.economy_posture ?? 0, neuralEconChoice: c.neural_economy_choice ?? 0,
    incomeAfterBuild: c.income_after_build ?? 0,
    // Military
    attackIntent: c.attack_intent ?? 0, attackConfirmed: c.attack_confirmed ?? 0,
    boatIntent: c.boat_intent ?? 0, boatConfirmed: c.boat_confirmed ?? 0, boatArrived: c.boat_arrived ?? 0,
    directorDecision: c.director_decision ?? 0, decision: c.decision ?? 0, action: c.action ?? 0,
    rocketsConfirmed: rock.confirmed ?? 0, rocketsAttempts: rock.attempts ?? 0,
    territoryGained: atk.territoryGained ?? 0,
    assists: tele.assists ?? 0, neutralLandings: tele.neutralLandings ?? 0, favorableVictims: tele.favorableVictims ?? 0,
  };
}
const mean = (xs) => { const a = xs.filter(x => x != null); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
const sum = (xs) => xs.reduce((s, x) => s + (x || 0), 0);
function aggregate(rows) {
  const keys = Object.keys(rows[0] || {});
  const out = {matches: rows.length, victories: 0, defeat: 0, incomplete: 0, tickLimit: 0, eliminated: 0, gameOver: 0};
  for (const k of keys) {
    const vals = rows.map(r => r[k]);
    if (typeof vals[0] === 'number' || vals.every(v => typeof v === 'number' || v == null)) {
      const m = mean(vals); if (m != null) out['mean_' + k] = m; out['sum_' + k] = sum(vals);
    }
  }
  for (const r of rows) {
    if (r.outcome === 'victory') out.victories++;
    else if (r.outcome === 'defeat') out.defeat++;
    else if (r.outcome === 'incomplete') out.incomplete++;
    if (r.termination === 'tick-limit') out.tickLimit++;
    if (r.termination === 'eliminated') out.eliminated++;
    if (r.termination === 'game-over') out.gameOver++;
  }
  return out;
}

function buildReport() {
  const perEntity = [];
  for (const e of ENTITIES) {
    const rows = []; const perMatch = [];
    for (const c of CONFIGS) {
      const dir = path.join(OUTROOT, e.key, c.id);
      const rep = completeReport(dir);
      const x = rep ? extractMatch(rep) : null;
      perMatch.push({config: c.id, seed: c.seed, map: c.map, nation: c.nation,
        outcome: x?.outcome ?? null, termination: x?.termination ?? null, tick: x?.tick ?? null,
        complete: x?.complete ?? false});
      if (x) rows.push(x);
    }
    perEntity.push({key: e.key, label: e.label, policy: e.policy, note: e.note,
      rows: rows.length, complete: rows.length, aggregate: aggregate(rows), perMatch});
  }
  return perEntity;
}

function fmt(v, dec = 1) { return v == null ? '—' : Number(v).toLocaleString('de-DE', {maximumFractionDigits: dec, minimumFractionDigits: 0}); }

function renderMarkdown(perEntity) {
  const L = [];
  L.push('# Stage C – kontrollierter Modellvergleich');
  L.push('');
  L.push('Vergleich von **stageC** (Referenz) gegen den **regelbasierten Bot** und die übrigen **unterschiedlichen Champion-Modelle**');
  L.push('');
  L.push('## Identische Bedingungen (alle Entitäten, alle 8 Konfigurationen)');
  L.push('');
  L.push('| Parameter | Wert |');
  L.push('|---|---|');
  L.push('| Engine-Commit | `' + ENGINE_COMMIT + '` |');
  L.push('| Karten / Größe | World, Europe / Compact |');
  L.push('| Nationen (Gegner) | 1 und 4 (AI, Impossible) |');
  L.push('| Seeds | `cmp-<Map>-<Nation>-<A/B>` (8, für alle identisch) |');
  L.push('| Schwierigkeit / Bots | Impossible / 0 |');
  L.push('| Ticks / Profil | 18000 / autonomous |');
  L.push('| Modus / Gegnerprofil | FFA / balanced, scriptedHumans 0 |');
  L.push('| Bot | `OpenFront_Solo_AggroBot.user.js` v1.19.4 (identischer Code) |');
  L.push('| Neural | Champions: `--policy <champion.json>` · regelbasiert: kein Policy |');
  L.push('');
  L.push('Bestimmung: identische Karten, Seeds und Gegnerkonfiguration; Bot-Zufallsfolge ist seedfixiert, Engine-Commit gepinnt → direkte Vergleichbarkeit.');
  L.push('');

  L.push('## 1) Tatsächliche Siege');
  L.push('');
  L.push('| Modell | Siege (bestätigt) | Niederlagen | Unvollständig/Tick-Limit | Eliminiert | Game-Over |');
  L.push('|---|---|---|---|---|---|');
  for (const e of perEntity) { const a = e.aggregate;
    L.push(`| ${e.key} | ${a.victories} | ${a.defeat} | ${a.incomplete} (${a.tickLimit}) | ${a.eliminated} | ${a.gameOver} |`); }
  L.push('');
  L.push('Siege = `gameEnd.outcome === "victory"` (bestätigt per Engine-WinUpdate). Ein Tick-Limit ist **kein** Sieg.');
  L.push('');

  L.push('## 2) Überlebensdauer (End-Tick)');
  L.push('');
  L.push('| Modell | Ø End-Tick | Max End-Tick | Tick-Limits |');
  L.push('|---|---|---|---|');
  for (const e of perEntity) { const a = e.aggregate;
    const ticks = e.perMatch.map(x => x.tick).filter(t => t != null);
    L.push(`| ${e.key} | ${fmt(a.mean_tick, 0)} | ${ticks.length ? Math.max(...ticks) : '—'} | ${a.tickLimit} |`); }
  L.push('');
  L.push('End-Tick = `run.tick` (letzter gespielter Tick bis zum Endergebnis).');
  L.push('');

  L.push('## 3) Landbesitz');
  L.push('');
  L.push('| Modell | Ø Peak-Land | Ø Ø-Land | Ø End-Land | Ø Retention (End/Peak) |');
  L.push('|---|---|---|---|---|');
  for (const e of perEntity) { const a = e.aggregate;
    L.push(`| ${e.key} | ${fmt(a.mean_peakLand, 0)} | ${fmt(a.mean_meanLand, 0)} | ${fmt(a.mean_endLand, 0)} | ${fmt(a.mean_retention, 2)} |`); }
  L.push('');
  L.push('Aus `trajectory.summary` (sichtbare Bot-GameView-Samples, alle 200 Ticks).');
  L.push('');

  L.push('## 4) Wirtschaft');
  L.push('');
  L.push('| Modell | Ø Gold-Einnahmen | Ø End-Gold | Ø bestätigte Bauten | Bau-Stillstände | Ø Wirtschafts-/Neural-Entscheidungen |');
  L.push('|---|---|---|---|---|---|');
  for (const e of perEntity) { const a = e.aggregate;
    const econ = mean([a.mean_buildConfirmed, 0]) != null ? a.mean_economyPosture + a.mean_neuralEconChoice : null;
    L.push(`| ${e.key} | ${fmt(a.mean_incomeGold, 0)} | ${fmt(a.mean_endGold, 0)} | ${fmt(a.mean_buildConfirmed, 1)} | ${fmt(a.mean_buildStalled, 1)} | ${fmt(econ, 1)} |`); }
  L.push('');
  L.push('`income.gold` (beobachtete Gold-Einnahmen), `finalState.gold` (End-Gold), `recording.counts.build_confirmed`/`build_stalled`, `economy_posture`+`neural_economy_choice`.');
  L.push('');

  L.push('## 5) Militärische Entscheidungen');
  L.push('');
  L.push('| Modell | Ø Angriffs-Entscheidungen | Angriffs-Bestätigungen | Ø Marine-Entscheidungen | Marine-Ankünfte | Ø Operations-Entscheidungen | Nuklear (Best./Vers.) | Ø errungenes Territorium |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const e of perEntity) { const a = e.aggregate;
    L.push(`| ${e.key} | ${fmt(a.mean_attackIntent, 1)} | ${fmt(a.mean_attackConfirmed, 1)} | ${fmt(a.mean_boatIntent, 1)} | ${fmt(a.mean_boatArrived, 1)} | ${fmt(a.mean_directorDecision, 1)} | ${fmt(a.mean_rocketsConfirmed, 1)}/${fmt(a.mean_rocketsAttempts, 1)} | ${fmt(a.mean_territoryGained, 0)} |`); }
  L.push('');
  L.push('Aus `recording.counts` (`attack_intent`, `attack_confirmed`, `boat_intent`, `boat_arrived`, `director_decision`), `rockets`, `attackReceipts.territoryGained`.');
  L.push('');

  L.push('## Pro-Partie-Detail');
  L.push('');
  L.push('| Modell | World-1-A | World-1-B | World-4-A | World-4-B | Europe-1-A | Europe-1-B | Europe-4-A | Europe-4-B |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  const colIds = ['World-1-A', 'World-1-B', 'World-4-A', 'World-4-B', 'Europe-1-A', 'Europe-1-B', 'Europe-4-A', 'Europe-4-B'];
  for (const e of perEntity) {
    const cells = colIds.map(id => {
      const p = e.perMatch.find(x => x.config === id);
      if (!p || p.outcome == null) return '—';
      return `${p.outcome.slice(0, 1)}·${p.tick}`;
    });
    L.push(`| ${e.key} | ${cells.join(' | ')} |`);
  }
  L.push('');
  L.push('Zellen: `Outcome-Initial·End-Tick` (v=Victory, d=Defeat, i=Unvollständig).');
  L.push('');

  L.push('## Entitäten');
  L.push('');
  L.push('| Schlüssel | Beschreibung | Policy |');
  L.push('|---|---|---|');
  for (const e of perEntity) L.push(`| ${e.key} | ${e.label} | ${e.policy ? path.relative(ROOT, e.policy) : '— (reine Heuristik)'} |`);
  L.push('');
  L.push('---');
  L.push('Erstellt von `tools/benchmark/stagec-compare.mjs`. Rohdaten: `report.json`, Einzelmatches: `benchmark-results/stageC-compare/<modell>/<config>/match.json`.');
  L.push('');
  return L.join('\n');
}

// ---- Main ----
status({startedAt: new Date().toISOString(), total: ENTITIES.length * CONFIGS.length, done: countDone(), finishedAt: null});
if (!REPORT_ONLY) {
  log(`run: ${ENTITIES.length} entities x ${CONFIGS.length} configs = ${ENTITIES.length * CONFIGS.length} matches, parallel=${PARALLEL}`);
  const tasks = [];
  for (const e of ENTITIES) for (const c of CONFIGS) tasks.push({e, c});
  await pool(tasks, PARALLEL, async ({e, c}) => runOneMatch(e, c));
}
const perEntity = buildReport();
const done = perEntity.reduce((s, e) => s + e.rows, 0);
const total = ENTITIES.length * CONFIGS.length;
const allDone = done === total;
status({done, total, finishedAt: new Date().toISOString(), allComplete: allDone,
  engineCommit: ENGINE_COMMIT, grid: {maps: MAPS, nations: NATIONS, variants: VARIANTS, ticks: COMMON_ARGS.ticks, difficulty: COMMON_ARGS.difficulty}});
fs.writeFileSync(reportJson, JSON.stringify({
  generated: new Date().toISOString(), engineCommit: ENGINE_COMMIT,
  config: {maps: MAPS, nations: NATIONS, variants: VARIANTS, ...COMMON_ARGS, seedPrefix: 'cmp-'},
  entities: perEntity,
}, null, 2) + '\n');
fs.writeFileSync(reportMd, renderMarkdown(perEntity));
log(`report written: ${path.relative(ROOT, reportMd)} (matches ${done}/${total}, complete=${allDone})`);
console.log(JSON.stringify({report: path.relative(ROOT, reportMd), matches: done, total, complete: allDone, done}));
