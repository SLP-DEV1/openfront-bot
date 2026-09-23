'use strict';
// P3 regression: schema-5 feature availability audit + runtime feature parity.
const assert = require('node:assert/strict');
const feat = require('../trainer/v5-features.cjs');
const candidate = require('../trainer/candidate-policy-v5.cjs');

// The audit must partition the 32 features into the ones the runtime
// (strategicCandidatePlan) actually varies and the ones that are constant.
const a = feat.audit();
assert.equal(a.inputs, 32, 'inputs must be 32');
const expectedActive = [0, 1, 2, 3, 4, 6, 13, 17, 21, 27, 29, 30, 31];
assert.deepEqual(a.active, expectedActive, 'active feature indices');
assert.equal(a.active.length + a.constant.length, 32, 'partition covers all');
// Constant features must equal the all-absent baseline (runtime mask value).
const baseline = candidate.features({}, {});
for (const i of a.constant) assert.equal(a.constantValues[i], baseline[i],
  'constant value for feature ' + i);
// Independent re-derivation: a feature is active iff every source field the
// runtime provides is present. (Recompute from the raw runtime field sets.)
const runtimeState = new Set(['home','maxTroops','committed','incoming','reserve','gold','land','capacityUse','frontCount']);
const runtimeCand = new Set(['kind','costTroops','counterRisk','holdProbability']);
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
const state = {home: 120, maxTroops: 240, committed: 8, incoming: 5, reserve: 20,
  gold: 45000, land: 14, capacityUse: 0.45, frontCount: 2};
const cand = {kind: 'attack', costTroops: 12, counterRisk: 0.3, holdProbability: 0.7};
const training = feat.buildFeatures(state, cand);
const runtime = candidate.features(state, cand);
assert.equal(training.length, candidate.INPUTS, 'feature length');
training.forEach((v, i) => assert.equal(v, runtime[i], 'parity at ' + i));
// Constant features must equal their baseline even with a full state present
// (they are masked at runtime, so a full runtime frame cannot move them).
for (const i of a.constant)
  assert.equal(training[i], a.constantValues[i], 'masked constant at runtime, idx ' + i);
// Active features must actually vary: changing a source field must change
// the feature vector (spot-check gold and kind).
const t2 = feat.buildFeatures({ ...state, gold: 90000 }, cand);
assert.notEqual(t2[1], training[1], 'gold feature varies');
const t3 = feat.buildFeatures(state, { ...cand, kind: 'naval' });
assert.notEqual(t3[31], training[31], 'kind feature varies');
// assertFeatureParity must succeed for a real runtime-shaped input.
const p = feat.assertFeatureParity(state, cand);
assert.equal(p.length, 32, 'parity vector length');
console.log('PASS P3 feature audit + runtime feature parity (' +
  a.active.length + ' active / ' + a.constant.length + ' constant)');
