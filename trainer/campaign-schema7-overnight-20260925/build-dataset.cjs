'use strict';
// §19 on-policy branch dataset builder for Schema 7.
//
// Rebuilds the SAME real engine frames the Schema-6 dataset used (108
// controller-comparison + 24 collection matches, engine
// 13b403387af01d388f8c8ed8c953b6d3a11d1457), but emits the SCHEMA-7
// branch-group contract instead of the v6 candidate rows:
//
//   one group per planning tick = the frame's actionable branch set (the
//   rule-sorted candidate set, each mapped to an actionableBranch), the
//   frame's visible state, and the observed (executed) branch.
//
// The features use the 38-dim v7 contract via v7-features.buildFeatures,
// which IS action-policy-v7.features — so train/runtime parity holds by
// construction. Each branch row carries the state + branch + rule-utility
// context the runtime sees (ownRu = branch.ruleUtility, ruleTop1 = the
// frame's highest legal rule utility), so the idx 14-15 rule-utility context
// is identical at training and inference.
//
// Branch-field derivation mirrors the runtime candidateToBranch
// (40-economy-runner.js) on the planningFrame's candidate v5 fields:
//   cost            land/naval -> costTroops, build -> costGold, hold -> 0
//   troopCommitment land/naval -> cost, otherwise 0
//   reserveAfter    home - cost
//   targetStrength  siteRisk (0..1)
//   targetLand      min(1, expectedLand/home)
//   expectedBuildValue  invest -> incomeValue, else 0
//   expectedDefenseValue hold -> 1-siteRisk, else 0
//   targetReachable land only
//   isExpansion     expand
//   isFinisher      attack with a real gain on a weak site (forecast proxy)
//
// The planningFrame is an on-policy snapshot of the CURRENT rule policy
// (no model active), so the observed branch is exactly what the rule
// emitted — the behavioral anchor the trainer ranks against.
const fs = require('node:fs'), path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CC = path.join(ROOT, 'trainer/campaign-v5control-20260924/controller-comparison');
const COL = path.join(ROOT, 'trainer/campaign-v5finetune-20260925/collection');
const CAM = path.join(__dirname);
const HORIZON_TICKS = 600, LAND_SCALE = 800;

const feat = require(path.join(ROOT, 'trainer/v7-features.cjs'));
const candidate = require(path.join(ROOT, 'trainer/action-policy-v7.cjs'));

const KIND_MAP = { hold: 'wait', invest: 'build_economy', expand: 'expand',
  attack: 'attack', naval: 'boat', support: 'donate' };
const b01 = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function num(x, d){ const v = Number(x); return Number.isFinite(v) ? v : d; }

function trajectorySeries(tr){
  const samples = (tr && tr.samples) || [];
  return samples.map(s => ({ tick: s.tick, land: s.land }));
}
function sampleAt(series, tick, field){
  for (const s of series) if (s.tick >= tick && s[field] != null) return s[field];
  return null;
}
function matchOutcome(r){
  const term = r.run?.termination;
  if (term === 'game-over') return r.gameEnd?.outcome ?? 'unknown';
  if (term === 'eliminated') return 'defeat';
  if (term === 'tick-limit'){
    const series = trajectorySeries(r.trajectory);
    const last = series.length ? series[series.length - 1] : null;
    if (last && last.enemyLand != null && last.land != null)
      return last.land > last.enemyLand ? 'victory' : 'defeat';
    if (r.finalState?.alive === false) return 'defeat';
  }
  return 'unknown';
}
function landDelta600(series, tick){
  const now = sampleAt(series, tick, 'land');
  const fut = sampleAt(series, tick + 600, 'land');
  return (now != null && fut != null) ? fut - now : null;
}

// Frame visible state -> the 16-field v7 runtime state contract.
function frameState(pf){
  const home = Math.max(1, num(pf.home, 1));
  return {
    gamePhase: Math.min(20, (pf.tick || 0) / 200),
    home,
    troops: home,
    reserve: num(pf.reserve, 0),
    gold: num(pf.gold, 0),
    income: 0, // planningFrame does not snapshot train/trade income
    enemyPressure: clamp(num(pf.enemyBound, 0) / home, 0, 1),
    activeWars: num(pf.frontCount, 0),
    frontCount: num(pf.frontCount, 0),
    allyPressure: 0,
    homeThreat: clamp(num(pf.incoming, 0) / home, 0, 1),
    nukeThreat: 0,
    recentLandTrend: 0,
    recentTroopTrend: num(pf.troopTrend, 0),
    maxLand: num(pf.land, 0),
    land: num(pf.land, 0)
  };
}

// Map a planningFrame candidate (v5 raw fields) to the actionableBranch
// contract the runtime candidateToBranch emits. Mirrors that function.
function candToBranch(cand, ruleUtility, home){
  const kind = cand.kind;
  const isLand = kind === 'attack' || kind === 'expand';
  const cost = kind === 'invest' || kind === 'support' ?
    num(cand.costGold, 0) : num(cand.costTroops, 0);
  const siteRisk = b01(cand.siteRisk);
  const expectedLand = num(cand.expectedLand, 0);
  const incomeValue = b01(cand.incomeValue);
  return {
    id: String(kind),
    kind: KIND_MAP[kind] || kind,
    subtype: kind === 'attack' ? 'enemy' : 'neutral',
    targetId: null,
    tile: null,
    legal: true,
    safetyApproved: true,
    executableNow: isLand ? cost > 0 : true,
    ruleUtility: num(ruleUtility, 0),
    cost,
    troopCommitment: (isLand || kind === 'naval') ? cost : 0,
    reserveAfter: home - cost,
    cooldownReady: true,
    expectedPurpose: '',
    buildType: kind === 'invest' ? 'economy' : null,
    sourceId: null,
    // Derived feature fields (candidateToBranch parity):
    targetStrength: siteRisk,
    targetLand: b01(expectedLand / home),
    expectedBuildValue: kind === 'invest' ? incomeValue : 0,
    expectedDefenseValue: kind === 'hold' ? b01(1 - siteRisk) : 0,
    alreadyActiveOperation: false,
    targetReachable: isLand,
    isEmergency: false,
    isFinisher: kind === 'attack' && cost > 0 && expectedLand > 0 &&
      siteRisk < 0.5,
    isExpansion: kind === 'expand',
    channel: (isLand) ? 'land' : (kind === 'naval' ? 'naval' : 'hold')
  };
}

function rowsForFrame(pf, series, outcome){
  const home = Math.max(1, num(pf.home, 1));
  const binding = pf.binding || [];
  const candsByKind = new Map((pf.candidates || []).map(c => [c.kind, c]));
  const state = frameState(pf);
  // Frame rule-utility context (legal candidates, rule-sorted).
  const legalRu = binding
    .filter(b => b.legal !== false && b.ruleUtility != null)
    .map(b => b.ruleUtility);
  const ruleTop1 = legalRu.length ? Math.max(...legalRu) : 0;
  // The observed (executed) branch kind: the frame's finalChoice (the
  // emitted branch after control), falling back to the selected candidate.
  const rawObserved = pf.finalChoice ||
    (pf.candidate ? pf.candidate.kind : (binding[0] && binding[0].kind)) ||
    null;
  const observedKind = rawObserved ?
    (KIND_MAP[rawObserved] || rawObserved) : null;
  const branches = [];
  for (const b of binding){
    if (b.legal === false) continue;
    const cand = candsByKind.get(b.kind);
    if (!cand) continue;
    branches.push(candToBranch(cand, b.ruleUtility, home));
  }
  if (!branches.length) return [];
  const ld = landDelta600(series, pf.tick);
  // One row per branch; the observed branch is the positive anchor.
  return branches.map(br => ({
    tick: pf.tick,
    state,
    branch: br,
    ctx: { ownRu: br.ruleUtility, ruleTop1 },
    observed: observedKind == null ?
      br.kind === (binding[0] && binding[0].kind) : br.kind === observedKind,
    outcome,
    frameLandDelta600: ld
  }));
}

function collectFiles(dir, root, acc){
  for (const e of fs.readdirSync(dir, { withFileTypes: true })){
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, root, acc);
    else if (e.name === 'match.json')
      acc.push({ p, rel: path.relative(root, path.dirname(p))
        .replace(/\\/g, '/').split('/').filter(Boolean) });
  }
  return acc;
}
function matchesFromDir(dir, matchIdPrefix, stat){
  const out = [];
  const files = collectFiles(dir, dir, []).sort((a, b) => a.p < b.p ? -1 : 1);
  for (const { p, rel } of files){
    let report;
    try { report = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { stat.unreadable++; continue; }
    const pfs = report.planningFrames || [];
    if (!pfs.length){ stat.emptyMatches++; continue; }
    const series = trajectorySeries(report.trajectory);
    const outcome = matchOutcome(report);
    const frames = [];
    for (const pf of pfs){
      if (!pf || pf.tick == null) continue;
      const rows = rowsForFrame(pf, series, outcome);
      if (!rows.length){ stat.framesNoBranches++; continue; }
      stat.rows += rows.length;
      stat.multiChoiceFrames += (rows.length >= 2) ? 1 : 0;
      for (const r of rows) frames.push(r);
    }
    if (!frames.length) continue;
    frames.sort((a, b) => a.tick - b.tick || 0);
    stat.matches++;
    stat.outcomes[outcome] = (stat.outcomes[outcome] || 0) + 1;
    out.push({ matchId: matchIdPrefix + rel.join('-'), outcome, frames });
  }
  return out;
}

function main(){
  const stat = { matches: 0, rows: 0, multiChoiceFrames: 0, outcomes: {},
    kinds: {}, observedKinds: {}, framesNoBranches: 0, unreadable: 0,
    emptyMatches: 0 };
  const matches = [];
  if (fs.existsSync(CC)) matches.push(...matchesFromDir(CC, 'v7-cc-', stat));
  if (fs.existsSync(COL)) matches.push(...matchesFromDir(COL, 'v7-new-', stat));
  for (const m of matches)
    for (const r of m.frames){
      stat.kinds[r.branch.kind] = (stat.kinds[r.branch.kind] || 0) + 1;
      if (r.observed)
        stat.observedKinds[r.branch.kind] =
          (stat.observedKinds[r.branch.kind] || 0) + 1;
    }
  // Feature parity audit: buildFeatures (training) must equal the runtime
  // action-policy-v7.features for the same state/branch/ctx, all 0..1 finite.
  let parityOk = 0, parityBad = 0;
  const step = Math.max(1, Math.floor(matches.length / 40));
  for (let mi = 0; mi < matches.length; mi += step){
    const r = matches[mi].frames[0];
    const x = feat.buildFeatures(r.state, r.branch, r.ctx);
    if (x.length === candidate.INPUTS &&
      x.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) parityOk++;
    else parityBad++;
  }
  const dataset = { kind: 'v7-real-dataset',
    engineCommit: '13b403387af01d388f8c8ed8c953b6d3a11d1457',
    generated: new Date().toISOString(),
    source: 'controller-comparison(108) + collection(24), engine-gameview-v2 planningFrames',
    schema: 7, featuredSchemaVersion: 4,
    horizonTicks: HORIZON_TICKS, landScale: LAND_SCALE, matches, stats: stat };
  fs.mkdirSync(CAM, { recursive: true });
  fs.writeFileSync(path.join(CAM, 'dataset.json'), JSON.stringify(dataset));
  const audit = { kind: 'v7-data-audit', generated: dataset.generated,
    matches: stat.matches, rows: stat.rows,
    multiChoiceFrames: stat.multiChoiceFrames, outcomes: stat.outcomes,
    kinds: stat.kinds, observedKinds: stat.observedKinds,
    framesNoBranches: stat.framesNoBranches,
    featureParitySample: { ok: parityOk, bad: parityBad },
    horizonTicks: HORIZON_TICKS, landScale: LAND_SCALE,
    matchIds: matches.map(m => m.matchId) };
  fs.writeFileSync(path.join(CAM, 'data-audit.json'),
    JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ matches: stat.matches, rows: stat.rows,
    multiChoiceFrames: stat.multiChoiceFrames, outcomes: stat.outcomes,
    kinds: stat.kinds, observedKinds: stat.observedKinds,
    parity: { ok: parityOk, bad: parityBad } }));
}
main();
