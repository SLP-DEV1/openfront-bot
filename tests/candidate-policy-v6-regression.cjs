'use strict';
const assert=require('node:assert/strict');
const policy=require('../trainer/candidate-policy-v6.cjs');
const v6feat=require('../trainer/v6-features.cjs');

// Contract: 38 inputs, two archs (24/40 hidden), 2 outputs.
assert.equal(policy.INPUTS,38);
assert.deepEqual(policy.ARCHES.sort(),['38x24x2-tanh','38x40x2-tanh']);
assert.equal(policy.lengthFor('38x24x2-tanh'),986);
assert.equal(policy.lengthFor('38x40x2-tanh'),1642);
assert.equal(v6feat.FEATURED_SCHEMA_VERSION,3);
assert.equal(v6feat.MANIFEST.length,38);

// Zero-init is neutral for BOTH archs (a dormant candidate, not a model).
for(const arch of policy.ARCHES){
  const zero=policy.zero(arch);
  assert.equal(zero.arch,arch);
  assert.equal(zero.weights.length,policy.lengthFor(arch));
  assert.equal(policy.validate(zero),zero);
  assert.deepEqual(policy.predict(zero,Array(policy.INPUTS).fill(0)),
    {heldGain:.5,lossRisk:.5},'zero init is neutral ('+arch+')');
  assert.equal(policy.sha(zero),policy.sha(policy.zero(arch)),'stable sha ('+arch+')');
}

// Feature vector: 38-dim, finite, in [0,1]; per-kind one-hot is correct.
const state={home:1500,maxTroops:3000,gold:1000000,land:2000,capacityUse:.5,
  frontCount:2,economyRelative:.8,frontReach:.3,partnerNeed:0,enemyBound:0,
  landTrend:.1,goldTrend:0,troopTrend:0,portAccess:.5,technologyCoverage:.4};
const cand={kind:'expand',costTroops:100,costGold:0,expectedLand:500,
  duration:120,returnTime:240,counterRisk:.2,thirdPartyRisk:0,
  infrastructureValue:.1,incomeValue:.1,recruitmentValue:0,siteRisk:.1,
  holdProbability:.9,legalConfidence:1};
const ctx={ownRu:80,ruTop1:110,ruTop2:95};
const features=policy.features(state,cand,ctx);
assert.equal(features.length,policy.INPUTS);
assert.ok(features.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
// idx 29-34 one-hot: hold, invest, attack, expand, naval, support.
assert.deepEqual(features.slice(29,35),[0,0,0,1,0,0],'expand one-hot');
const holdF=policy.features(state,{kind:'hold',costTroops:0,legalConfidence:1},{ownRu:110,ruTop1:110,ruTop2:95});
assert.deepEqual(holdF.slice(29,35),[1,0,0,0,0,0],'hold one-hot');
const supF=policy.features(state,{kind:'support',legalConfidence:1},{ownRu:0,ruTop1:110,ruTop2:95});
assert.deepEqual(supF.slice(29,35),[0,0,0,0,0,1],'support one-hot');
// rule-utility context: ownRu=80 -> (80+100)/200=0.9; gap1=(110-80)/100=0.3; gap2=(95-80)/100=0.15.
assert.ok(Math.abs(features[35]-0.9)<1e-9,'candidateRuleUtility');
assert.ok(Math.abs(features[36]-0.3)<1e-9,'utilityGapToRuleTop1');
assert.ok(Math.abs(features[37]-0.15)<1e-9,'utilityGapToRuleTop2');
// The rule leader has gap1=0.
const leadF=policy.features(state,cand,{ownRu:110,ruTop1:110,ruTop2:95});
assert.equal(leadF[36],0,'rule leader has zero gap to top-1');
// No ctx (legacy/absent) stays finite and in [0,1].
const noCtx=policy.features(state,cand);
assert.equal(noCtx.length,policy.INPUTS);
assert.ok(noCtx.every(x=>Number.isFinite(x)&&x>=0&&x<=1));

// Training builder === runtime contract (parity by construction).
const a=v6feat.buildFeatures(state,cand,ctx),b=policy.features(state,cand,ctx);
assert.deepEqual(a,b,'training/runtime feature parity');
v6feat.assertFeatureParity(state,cand,ctx);
const audit=v6feat.audit();
assert.equal(audit.inputs,38);
assert.equal(audit.constant.length,0,'all 38 features active at runtime');

// Fail-closed validate (schema 6, per-arch length).
const bad=(arch,changes)=>assert.throws(
  ()=>policy.validate({...policy.zero(arch),...changes}),
  /Invalid schema-6 candidate model/);
const L24=policy.lengthFor('38x24x2-tanh');
bad('38x24x2-tanh',{weights:new Array(L24)});
bad('38x24x2-tanh',{weights:Array(L24).fill(0).map((x,i)=>i===2?NaN:x)});
bad('38x24x2-tanh',{weights:Array(L24).fill(0).map((x,i)=>i===2?Infinity:x)});
bad('38x24x2-tanh',{weights:Array(L24+1).fill(0)});
bad('38x24x2-tanh',{outputs:['lossRisk','heldGain']});
bad('38x24x2-tanh',{outputs:['heldGain']});
bad('38x24x2-tanh',{arch:'38x20x2-tanh'});
bad('38x24x2-tanh',{schema:5});
// A 40-hidden zero must be rejected under the 24-hidden length contract.
const L40=policy.lengthFor('38x40x2-tanh');
bad('38x24x2-tanh',{weights:Array(L40).fill(0)});

// Predict rejects bad vector length / non-finite.
const zero24=policy.zero('38x24x2-tanh');
assert.throws(()=>policy.predict(zero24,Array(policy.INPUTS-1).fill(0)),
  /Invalid candidate feature vector/);
assert.throws(()=>policy.predict(zero24,Array(policy.INPUTS).fill(NaN)),
  /Invalid candidate feature vector/);
console.log('PASS P6 candidate-v6 schema, kind one-hots, rule-utility context, both archs, finite features, fingerprint, safe output order');
