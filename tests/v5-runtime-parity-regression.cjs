'use strict';
// P3 regression: end-to-end schema-5 feature parity between LIVE inference
// and TRAINING for the featuredSchemaVersion-2 contract.
//
// The chain under test:
//   runtime strategicCandidatePlan state (17 fields incl. v5StateExtension)
//   + per-candidate v5 contract (14 fields)
//   -> planningFrame() capture (flat frame in match.json planningFrames)
//   -> v5-dataset.frameRows (one row per candidate, visibleState)
//   -> train-v5 buildSamples state/cand reconstruction
//   -> feat.buildFeatures === candidate.features (same vector as live).
//
// If any field name/default diverges between these hops, the training data
// silently drifts from what the model actually sees live. This test pins
// the full chain on a synthetic planning frame shaped exactly like the
// deployed planningFrame() output.
const assert = require('node:assert/strict');
const {frameRows} = require('../tools/benchmark/v5-dataset.cjs');
const feat = require('../trainer/v5-features.cjs');
const candidate = require('../trainer/candidate-policy-v5.cjs');

// The 9 v5StateExtension fields as the runtime computes them (visible only).
const stateExt = {economyRelative: 0.75, frontReach: 0.3, partnerNeed: 0,
  enemyBound: 0.6, landTrend: 0.2, goldTrend: -0.1, troopTrend: 0.05,
  portAccess: 1, technologyCoverage: 0.5};
// The 17-field state strategicCandidatePlan scores (base + extension).
const liveState = {home: 120, maxTroops: 240, committed: 8, incoming: 5,
  reserve: 20, gold: 45000, land: 14, capacityUse: 0.45, frontCount: 2,
  ...stateExt};
// Per-candidate v5 contract as v5Contract() emits it (all 14 keys present).
const v5Contract = (kind, extra = {}) => ({kind, costTroops: 12,
  costGold: 400, expectedLand: 3, duration: 0, returnTime: 0,
  counterRisk: 0.3, thirdPartyRisk: 0.2, infrastructureValue: 0.1,
  incomeValue: 0, recruitmentValue: 0, siteRisk: 0.4, holdProbability: 0.7,
  legalConfidence: 1, ...extra});
const attack = v5Contract('attack');
const hold = v5Contract('hold', {costTroops: 0, expectedLand: 0,
  counterRisk: 0.4, holdProbability: 0.6, thirdPartyRisk: 0.5,
  infrastructureValue: 0, siteRisk: 0});
// The planning frame exactly as planningFrame() emits it now: 17 state
// fields flat at top level, candidates carrying their v5 contract.
const pf = {tick: 1000, land: 14, ...liveState,
  candidate: attack, candidates: [attack, hold]};

// The live feature vectors, built the way shadowV5.features receives them.
const liveVec = c => candidate.features(liveState, c);

// The training-side reconstruction, exactly as v5-dataset.assemble /
// train-v5.buildSamples rebuild state and candidate from visibleState.
function trainingVec(row){
  const vs = row.visibleState || {};
  const st = {home: vs.home, maxTroops: vs.maxTroops, committed: vs.committed,
    incoming: vs.incoming, reserve: vs.reserve, gold: vs.gold, land: vs.land,
    capacityUse: vs.capacityUse, frontCount: vs.frontCount,
    economyRelative: vs.economyRelative ?? 0, frontReach: vs.frontReach ?? 0,
    partnerNeed: vs.partnerNeed ?? 0, enemyBound: vs.enemyBound ?? 0,
    landTrend: vs.landTrend, goldTrend: vs.goldTrend,
    troopTrend: vs.troopTrend, portAccess: vs.portAccess ?? 0,
    technologyCoverage: vs.technologyCoverage ?? 0};
  const cand = {kind: row.action?.type, costTroops: vs.costTroops || 0,
    costGold: vs.costGold || 0, expectedLand: vs.expectedLand || 0,
    duration: vs.duration || 0, returnTime: vs.returnTime || 0,
    counterRisk: vs.counterRisk || 0, thirdPartyRisk: vs.thirdPartyRisk || 0,
    infrastructureValue: vs.infrastructureValue || 0,
    incomeValue: vs.incomeValue || 0,
    recruitmentValue: vs.recruitmentValue || 0, siteRisk: vs.siteRisk || 0,
    holdProbability: vs.holdProbability ?? 1,
    legalConfidence: vs.legalConfidence};
  return feat.buildFeatures(st, cand);
}

{
  // Current contract: every row (chosen AND unchosen) must reproduce the
  // live feature vector of its own candidate.
  const rows = frameRows(pf);
  assert.equal(rows.length, 2, 'one row per candidate');
  const byKind = k => rows.find(r => r.action.type === k);
  assert.equal(byKind('attack').observed, true, 'chosen row observed');
  assert.equal(byKind('hold').observed, false, 'unchosen row counterfactual');
  for (const row of rows){
    const live = liveVec(row.action.type === 'attack' ? attack : hold);
    assert.deepEqual(trainingVec(row), live,
      'training vector equals live vector for ' + row.action.type);
  }
}

// Legacy frame: candidates WITHOUT a v5 contract (old planningFrame). The
// live side falls back to {kind,costTroops,counterRisk,holdProbability};
// the training side must build the identical baseline vector.
{
  const legacyCand = c => ({kind: c.kind, costTroops: 12, counterRisk: 0.3,
    holdProbability: 0.7});
  const legacyPf = {tick: 1100, land: 14, ...liveState,
    candidate: legacyCand(attack),
    candidates: [legacyCand(attack), legacyCand(hold)]};
  const rows = frameRows(legacyPf);
  for (const row of rows){
    const orig = row.action.type === 'attack' ? attack : hold;
    const live = candidate.features(liveState, legacyCand(orig));
    assert.deepEqual(trainingVec(row), live,
      'legacy-frame training vector equals live fallback vector for '
        + row.action.type);
  }
}

// Absent-extension legacy frame: no v5State fields at all (pre-extension
// captures). The training baseline must equal live features built from the
// 9 base state fields only.
{
  const baseState = {home: liveState.home, maxTroops: liveState.maxTroops,
    committed: liveState.committed, incoming: liveState.incoming,
    reserve: liveState.reserve, gold: liveState.gold, land: liveState.land,
    capacityUse: liveState.capacityUse, frontCount: liveState.frontCount};
  const legacyPf = {tick: 1200, land: liveState.land, ...baseState,
    candidate: {kind: 'attack', costTroops: 12, counterRisk: 0.3,
      holdProbability: 0.7},
    candidates: [{kind: 'attack', costTroops: 12, counterRisk: 0.3,
      holdProbability: 0.7}]};
  const rows = frameRows(legacyPf);
  assert.equal(rows.length, 1);
  const live = candidate.features(baseState, {kind: 'attack', costTroops: 12,
    counterRisk: 0.3, holdProbability: 0.7});
  assert.deepEqual(trainingVec(rows[0]), live,
    'pre-extension legacy frame parity');
}

console.log('PASS runtime/training feature parity: planningFrame -> frameRows -> buildSamples reproduces live inference vectors (v2 contract + legacy fallbacks)');
