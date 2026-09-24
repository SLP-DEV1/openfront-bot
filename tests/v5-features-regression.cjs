'use strict';
// P3 regression: schema-5 feature availability audit + runtime feature parity.
const assert = require('node:assert/strict');
const feat = require('../trainer/v5-features.cjs');
const candidate = require('../trainer/candidate-policy-v5.cjs');

// featuredSchemaVersion 2: the runtime (strategicCandidatePlan) provides the
// full 17 state + 14 candidate field contract, so all 32 features are active
// and no feature is masked/constant.
assert.equal(feat.FEATURED_SCHEMA_VERSION, 2, 'featured schema version 2');
const a = feat.audit();
assert.equal(a.inputs, 32, 'inputs must be 32');
const expectedActive = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
  15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
assert.deepEqual(a.active, expectedActive, 'all 32 features active');
assert.deepEqual(a.constant, [], 'no constant features');
assert.equal(a.active.length + a.constant.length, 32, 'partition covers all');
// Independent re-derivation: a feature is active iff every source field the
// runtime provides is present. (Recompute from the raw runtime field sets,
// and check those sets match the trainer's declared contract.)
const runtimeState = new Set(['home','maxTroops','committed','incoming','reserve','gold','land','capacityUse','frontCount','economyRelative','frontReach','partnerNeed','enemyBound','landTrend','goldTrend','troopTrend','portAccess','technologyCoverage']);
const runtimeCand = new Set(['kind','costTroops','costGold','expectedLand','duration','returnTime','counterRisk','thirdPartyRisk','infrastructureValue','incomeValue','recruitmentValue','siteRisk','holdProbability','legalConfidence']);
assert.deepEqual([...feat.RUNTIME_STATE_FIELDS].sort(),
  [...runtimeState].sort(), 'declared runtime state fields');
assert.deepEqual([...feat.RUNTIME_CANDIDATE_FIELDS].sort(),
  [...runtimeCand].sort(), 'declared runtime candidate fields');
const MANIFEST = [
  ['state:home','state:maxTroops'],['state:gold'],['state:incoming'],['state:committed'],
  ['state:reserve'],['state:economyRelative'],['state:capacityUse'],['state:frontReach'],
  ['state:partnerNeed'],['state:enemyBound'],['state:landTrend'],['state:goldTrend'],
  ['state:troopTrend'],['state:frontCount'],['state:portAccess'],['state:technologyCoverage'],
  ['candidate:expectedLand','state:land'],['candidate:costTroops'],['candidate:costGold'],
  ['candidate:duration'],['candidate:returnTime'],['candidate:counterRisk'],
  ['candidate:thirdPartyRisk'],['candidate:infrastructureValue'],['candidate:incomeValue'],
  ['candidate:recruitmentValue'],['candidate:siteRisk'],['candidate:holdProbability'],
  ['candidate:legalConfidence'],['candidate:kind'],['candidate:kind'],['candidate:kind']
];
assert.deepEqual(MANIFEST, feat.MANIFEST, 'manifest pin');
const rederived = [];
MANIFEST.forEach((fields, i) => {
  const ok = fields.every(f => {
    const s = f.indexOf(':'); const scope = f.slice(0, s), name = f.slice(s + 1);
    return (scope === 'state' ? runtimeState : runtimeCand).has(name);
  });
  if (ok) rederived.push(i);
});
assert.deepEqual(a.active, rederived, 'audit matches independent re-derivation');

// Feature parity: the training builder IS the runtime feature function.
// Full 17-field state + 14-field candidate contract (featuredSchemaVersion 2).
const state = {home: 120, maxTroops: 240, committed: 8, incoming: 5, reserve: 20,
  gold: 45000, land: 14, capacityUse: 0.45, frontCount: 2,
  economyRelative: 0.75, frontReach: 0.3, partnerNeed: 0, enemyBound: 0.6,
  landTrend: 0.2, goldTrend: -0.1, troopTrend: 0.05, portAccess: 1,
  technologyCoverage: 0.5};
const cand = {kind: 'attack', costTroops: 12, costGold: 400, expectedLand: 3,
  duration: 0, returnTime: 0, counterRisk: 0.3, thirdPartyRisk: 0.2,
  infrastructureValue: 0.1, incomeValue: 0, recruitmentValue: 0,
  siteRisk: 0.4, holdProbability: 0.7, legalConfidence: 1};
const training = feat.buildFeatures(state, cand);
const runtime = candidate.features(state, cand);
assert.equal(training.length, candidate.INPUTS, 'feature length');
training.forEach((v, i) => assert.equal(v, runtime[i], 'parity at ' + i));
// Trend default semantics: an ABSENT trend field maps to baseline 0, while an
// explicit zero trend maps to 0.5 (they are different signals).
assert.equal(training[10], 0.6, 'landTrend 0.2 maps to 0.6');
const noTrend = {...state}; delete noTrend.landTrend; delete noTrend.goldTrend; delete noTrend.troopTrend;
const tAbsent = feat.buildFeatures(noTrend, cand);
assert.equal(tAbsent[10], 0, 'absent landTrend maps to baseline 0');
assert.equal(tAbsent[11], 0, 'absent goldTrend maps to baseline 0');
assert.equal(tAbsent[12], 0, 'absent troopTrend maps to baseline 0');
// Active features must actually vary: changing a source field must change
// the feature vector (spot-check gold, kind and an extension field).
const t2 = feat.buildFeatures({ ...state, gold: 90000 }, cand);
assert.notEqual(t2[1], training[1], 'gold feature varies');
const t3 = feat.buildFeatures(state, { ...cand, kind: 'naval' });
assert.notEqual(t3[31], training[31], 'kind feature varies');
const t5 = feat.buildFeatures({ ...state, partnerNeed: 1 }, cand);
assert.notEqual(t5[8], training[8], 'partnerNeed feature varies');
// assertFeatureParity must succeed for a real runtime-shaped input.
const p = feat.assertFeatureParity(state, cand);
assert.equal(p.length, 32, 'parity vector length');
console.log('PASS P3 feature audit + runtime feature parity (' +
  a.active.length + ' active / ' + a.constant.length + ' constant)');
