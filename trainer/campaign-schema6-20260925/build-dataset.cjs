'use strict';
// §4/§5 dataset builder for campaign-schema6-20260925 (Schema 6).
//
// Rebuilds the same real engine frames the Schema-5 finetune used (108
// controller matches + 24 targeted §4 collection matches, engine
// 13b403387af01d388f8c8ed8c953b6d3a11d1457), but emits the SCHEMA-6 row
// contract: on top of the v5fn fields (ru, hardNeg, frameLandDelta600,
// ruleTop1) each row now carries the per-frame rule-utility context the new
// 38-dim contract needs:
//   ruTop1   the frame's highest legal candidate ruleUtility (value)
//   ruTop2   the frame's second-highest legal candidate ruleUtility (value)
// The row's own `ru` is its candidate ruleUtility. Together these let
// train-v6-variants.cjs build idx 35-37 (candidateRuleUtility,
// utilityGapToRuleTop1, utilityGapToRuleTop2) with the exact values the
// runtime sees (the candidate set is rule-sorted before scoring).
//
// This builder does NOT oversample; the trainer applies the §8 expand/attack
// oversampling and documents it. The builder is a superset of the v5fn
// dataset contract, so a v5 row is also a valid v6 row.
const fs = require('node:fs'), path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CC = path.join(ROOT, 'trainer/campaign-v5control-20260924/controller-comparison');
const COL = path.join(ROOT, 'trainer/campaign-v5finetune-20260925/collection');
const CAM = path.join(ROOT, 'trainer/campaign-schema6-20260925');
const HARDNEG = path.join(CAM, 'hard-negatives.json');
const HORIZON_TICKS = 600, LAND_SCALE = 800;

function trajectorySeries(tr){
  const samples = (tr && tr.samples) || [];
  return samples.map(s => ({tick: s.tick, land: s.land}));
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

// One row per candidate. Adds ruTop1/ruTop2 (frame rule-utility context) to
// the v5fn fields so the 38-dim contract can be built with runtime values.
function rowsForFrame(pf, series, hardNegFrame, outcome){
  const base = {home: pf.home, maxTroops: pf.maxTroops, committed: pf.committed,
    incoming: pf.incoming, reserve: pf.reserve, gold: pf.gold,
    capacityUse: pf.capacityUse, frontCount: pf.frontCount,
    economyRelative: pf.economyRelative ?? 0, frontReach: pf.frontReach ?? 0,
    partnerNeed: pf.partnerNeed ?? 0, enemyBound: pf.enemyBound ?? 0,
    landTrend: pf.landTrend, goldTrend: pf.goldTrend, troopTrend: pf.troopTrend,
    portAccess: pf.portAccess ?? 0, technologyCoverage: pf.technologyCoverage ?? 0};
  const cands = pf.candidates && pf.candidates.length ? pf.candidates : [pf.candidate];
  const chosen = pf.candidate;
  const chosenJson = chosen && chosen.kind ? JSON.stringify(chosen) : null;
  const binding = pf.binding || [];
  const ruById = new Map(binding.map(b => [b.id, b.ruleUtility]));
  // Frame rule-utility context (legal candidates only), for idx 35-37.
  const legalRus = binding
    .filter(b => b.legal !== false && b.ruleUtility != null)
    .map(b => b.ruleUtility)
    .sort((a, b) => b - a);
  const ruTop1 = legalRus[0] ?? null;
  const ruTop2 = legalRus.length > 1 ? legalRus[1] : null;
  let topId = null, topRu = -Infinity;
  for (const b of binding)
    if (b.legal !== false && b.ruleUtility != null && b.ruleUtility > topRu){ topRu = b.ruleUtility; topId = b.id; }
  const ld = landDelta600(series, pf.tick);
  const rows = [];
  for (const c of cands){
    if (!c || !c.kind) continue;
    const observed = chosenJson != null && (c === chosen || JSON.stringify(c) === chosenJson);
    rows.push({tick: pf.tick, observed,
      visibleState: {...base, land: pf.land,
        costTroops: c.costTroops || 0, costGold: c.costGold || 0,
        expectedLand: c.expectedLand || 0, duration: c.duration || 0,
        returnTime: c.returnTime || 0, counterRisk: c.counterRisk || 0,
        thirdPartyRisk: c.thirdPartyRisk || 0,
        infrastructureValue: c.infrastructureValue || 0,
        incomeValue: c.incomeValue || 0,
        recruitmentValue: c.recruitmentValue || 0, siteRisk: c.siteRisk || 0,
        holdProbability: c.holdProbability ?? 1,
        legalConfidence: c.legalConfidence},
      action: {type: c.kind},
      ru: ruById.has(c.kind) ? ruById.get(c.kind) : null,
      ruTop1, ruTop2,
      hardNeg: hardNegFrame ? true : false,
      frameLandDelta600: ld,
      ruleTop1: topId != null && topId === c.kind});
  }
  return rows;
}

function collectFiles(dir, root, acc){
  for (const e of fs.readdirSync(dir, {withFileTypes: true})){
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, root, acc);
    else if (e.name === 'match.json')
      acc.push({p, rel: path.relative(root, path.dirname(p)).replace(/\\/g, '/').split('/').filter(Boolean)});
  }
  return acc;
}
function matchesFromDir(dir, matchIdPrefix, hardNegMap, stat){
  const out = [];
  const files = collectFiles(dir, dir, []).sort((a, b) => a.p < b.p ? -1 : 1);
  for (const {p, rel} of files){
    let report;
    try { report = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { stat.unreadable++; continue; }
    const pfs = report.planningFrames || [];
    if (!pfs.length){ stat.emptyMatches++; continue; }
    const series = trajectorySeries(report.trajectory);
    const outcome = matchOutcome(report);
    const frames = [];
    for (const pf of pfs){
      if (!pf || pf.tick == null) continue;
      const key = pf.binding && pf.binding.length ?
        rel.join('|') + '|' + pf.tick : null;
      const hn = key != null && hardNegMap ? hardNegMap.get(key) : null;
      const rows = rowsForFrame(pf, series, hn, outcome);
      if (!rows.length){ stat.framesNoCandidates++; continue; }
      stat.rows += rows.length;
      stat.hardNegFrames += rows.some(r => r.hardNeg) ? 1 : 0;
      for (const r of rows) frames.push(r);
    }
    if (!frames.length) continue;
    frames.sort((a, b) => a.tick - b.tick || 0);
    const matchId = matchIdPrefix + rel.join('-');
    stat.matches++;
    stat.outcomes[outcome] = (stat.outcomes[outcome] || 0) + 1;
    out.push({matchId, outcome, frames});
  }
  return out;
}

function main(){
  const hardNegAll = fs.existsSync(HARDNEG) ?
    JSON.parse(fs.readFileSync(HARDNEG, 'utf8')) : null;
  const hardNegMap = new Map();
  if (hardNegAll)
    for (const f of hardNegAll.frames)
      hardNegMap.set(f.scenario + '|' + f.arm + '|' + f.tick, f);
  const stat = {matches: 0, rows: 0, hardNegFrames: 0, framesNoCandidates: 0,
    unreadable: 0, emptyMatches: 0, outcomes: {}, kinds: {},
    ruRows: 0, noRuRows: 0, ruleTop1Rows: 0, hardNegRows: 0,
    ruTop1Rows: 0, ruTop2Rows: 0, ctxComplete: 0,
    // Per-kind OBSERVED (chosen) rows: the frames the planner actually took.
    observedKinds: {}};
  const matches = [];
  if (fs.existsSync(CC))
    matches.push(...matchesFromDir(CC, 'v6-cc-', hardNegMap, stat));
  if (fs.existsSync(COL))
    matches.push(...matchesFromDir(COL, 'v6-new-', null, stat));
  for (const m of matches)
    for (const r of m.frames){
      stat.kinds[r.action.type] = (stat.kinds[r.action.type] || 0) + 1;
      if (r.observed) stat.observedKinds[r.action.type] =
        (stat.observedKinds[r.action.type] || 0) + 1;
      if (r.ru != null) stat.ruRows++; else stat.noRuRows++;
      if (r.ruleTop1) stat.ruleTop1Rows++;
      if (r.hardNeg) stat.hardNegRows++;
      if (r.ruTop1 != null) stat.ruTop1Rows++;
      if (r.ruTop2 != null) stat.ruTop2Rows++;
      if (r.ru != null && r.ruTop1 != null) stat.ctxComplete++;
    }
  // Feature parity audit (38-dim contract, same as the runtime kernel).
  const feat = require(path.join(ROOT, 'trainer/v6-features.cjs'));
  const candidate = require(path.join(ROOT, 'trainer/candidate-policy-v6.cjs'));
  let parityOk = 0, parityBad = 0;
  const step = Math.max(1, Math.floor(matches.length / 40));
  for (let mi = 0; mi < matches.length; mi += step){
    const r = matches[mi].frames[0];
    const vs = r.visibleState;
    const st = {home: vs.home, maxTroops: vs.maxTroops, committed: vs.committed,
      incoming: vs.incoming, reserve: vs.reserve, gold: vs.gold, land: vs.land,
      capacityUse: vs.capacityUse, frontCount: vs.frontCount,
      economyRelative: vs.economyRelative ?? 0, frontReach: vs.frontReach ?? 0,
      partnerNeed: vs.partnerNeed ?? 0, enemyBound: vs.enemyBound ?? 0,
      landTrend: vs.landTrend, goldTrend: vs.goldTrend,
      troopTrend: vs.troopTrend, portAccess: vs.portAccess ?? 0,
      technologyCoverage: vs.technologyCoverage ?? 0};
    const cand = {kind: r.action.type, costTroops: vs.costTroops || 0,
      costGold: vs.costGold || 0, expectedLand: vs.expectedLand || 0,
      duration: vs.duration || 0, returnTime: vs.returnTime || 0,
      counterRisk: vs.counterRisk || 0, thirdPartyRisk: vs.thirdPartyRisk || 0,
      infrastructureValue: vs.infrastructureValue || 0,
      incomeValue: vs.incomeValue || 0, recruitmentValue: vs.recruitmentValue || 0,
      siteRisk: vs.siteRisk || 0, holdProbability: vs.holdProbability ?? 1,
      legalConfidence: vs.legalConfidence};
    const ctx = {ownRu: r.ru, ruTop1: r.ruTop1, ruTop2: r.ruTop2};
    const x = feat.buildFeatures(st, cand, ctx);
    if (x.length === candidate.INPUTS && x.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) parityOk++;
    else parityBad++;
  }
  const dataset = {kind: 'v6-real-dataset',
    engineCommit: '13b403387af01d388f8c8ed8c953b6d3a11d1457',
    generated: new Date().toISOString(),
    source: 'controller-comparison(108) + collection(24), engine-gameview-v2 planningFrames',
    schema: 6, featuredSchemaVersion: 3,
    horizonTicks: HORIZON_TICKS, landScale: LAND_SCALE, matches,
    stats: stat};
  fs.mkdirSync(CAM, {recursive: true});
  fs.writeFileSync(path.join(CAM, 'dataset.json'), JSON.stringify(dataset));
  const audit = {kind: 'v6-data-audit', generated: dataset.generated,
    matches: stat.matches, rows: stat.rows, outcomes: stat.outcomes,
    kinds: stat.kinds, observedKinds: stat.observedKinds,
    hardNegFrames: stat.hardNegFrames, hardNegRows: stat.hardNegRows,
    ruRows: stat.ruRows, noRuRows: stat.noRuRows, ruleTop1Rows: stat.ruleTop1Rows,
    ruTop1Rows: stat.ruTop1Rows, ruTop2Rows: stat.ruTop2Rows, ctxComplete: stat.ctxComplete,
    framesNoCandidates: stat.framesNoCandidates,
    featureParitySample: {ok: parityOk, bad: parityBad},
    horizonTicks: HORIZON_TICKS, landScale: LAND_SCALE,
    matchIds: matches.map(m => m.matchId)};
  fs.writeFileSync(path.join(CAM, 'data-audit.json'), JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({matches: stat.matches, rows: stat.rows,
    outcomes: stat.outcomes, kinds: stat.kinds, observedKinds: stat.observedKinds,
    ruTop1Rows: stat.ruTop1Rows, ruTop2Rows: stat.ruTop2Rows,
    parity: {ok: parityOk, bad: parityBad}}));
}
main();
