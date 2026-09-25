'use strict';
const assert=require('node:assert/strict');
const policy=require('../trainer/action-policy-v7.cjs');
const v7feat=require('../trainer/v7-features.cjs');

// Contract: 38 inputs, two archs (24/40 hidden), 1 output (branchScore).
assert.equal(policy.INPUTS,38);
assert.equal(policy.OUTPUTS,1);
assert.deepEqual(policy.ARCHES.sort(),['38x24x2-tanh','38x40x2-tanh']);
assert.equal(policy.lengthFor('38x24x2-tanh'),961);
assert.equal(policy.lengthFor('38x40x2-tanh'),1601);
assert.equal(v7feat.FEATURED_SCHEMA_VERSION,4);
assert.equal(v7feat.MANIFEST.length,38);

// Zero-init is neutral for BOTH archs (a dormant branch, not a model).
for(const arch of policy.ARCHES){
  const zero=policy.zero(arch);
  assert.equal(zero.arch,arch);
  assert.equal(zero.schema,7);
  assert.deepEqual(zero.outputs,['branchScore']);
  assert.equal(zero.weights.length,policy.lengthFor(arch));
  assert.equal(policy.validate(zero),zero);
  assert.deepEqual(policy.predict(zero,Array(policy.INPUTS).fill(0)),
    {branchScore:.5},'zero init is neutral ('+arch+')');
  assert.equal(policy.sha(zero),policy.sha(policy.zero(arch)),'stable sha ('+arch+')');
}

// Feature vector: 38-dim, finite, in [0,1]; per-kind one-hot is correct.
const state={home:100,land:5,gold:500,troops:80,reserve:40,income:1,
  enemyPressure:.3,activeWars:1,frontCount:2,allyPressure:.1,homeThreat:.2,
  nukeThreat:0,recentLandTrend:.1,recentTroopTrend:-.1,gamePhase:3,maxLand:20};
const branch={kind:'attack',ruleUtility:10,cost:20,troopCommitment:30,
  reserveAfter:10,targetStrength:.5,targetLand:.4,expectedBuildValue:0,
  expectedDefenseValue:.2,cooldownReady:true,alreadyActiveOperation:false,
  targetReachable:true,isEmergency:false,isFinisher:true,isExpansion:false};
const ctx={ownRu:10,ruleTop1:12};
const features=policy.features(state,branch,ctx);
assert.equal(features.length,policy.INPUTS);
assert.ok(features.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
// idx 1 landRatio: 5/20 = 0.25; idx 2 troopRatio: 80/100 = 0.8;
// idx 3 reserveRatio: 40/100 = 0.4.
assert.ok(Math.abs(features[1]-0.25)<1e-9,'landRatio');
assert.ok(Math.abs(features[2]-0.8)<1e-9,'troopRatio');
assert.ok(Math.abs(features[3]-0.4)<1e-9,'reserveRatio');
// idx 14 ruleUtility: (10+100)/200 = 0.55; idx 15 gap: (12-10)/100 = 0.02.
assert.ok(Math.abs(features[14]-0.55)<1e-9,'ruleUtility');
assert.ok(Math.abs(features[15]-0.02)<1e-9,'utilityGapToTop');
// idx 29-37 one-hot: wait,expand,attack,boat,warship,build_warship,nuclear,
// build_economy,donate. 'attack' -> idx 31.
assert.deepEqual(features.slice(29,38),[0,0,1,0,0,0,0,0,0],'attack one-hot');
const boatF=policy.features(state,{kind:'boat',cooldownReady:true},ctx);
assert.deepEqual(boatF.slice(29,38),[0,0,0,1,0,0,0,0,0],'boat one-hot');
const waitF=policy.features(state,{kind:'wait'},ctx);
assert.deepEqual(waitF.slice(29,38),[1,0,0,0,0,0,0,0,0],'wait one-hot');
// The rule leader has gap 0.
const leadF=policy.features(state,branch,{ownRu:12,ruleTop1:12});
assert.equal(leadF[15],0,'rule leader has zero gap to top-1');
// No ctx (absent) stays finite and in [0,1] (gap defaults to 0.5).
const noCtx=policy.features(state,branch);
assert.equal(noCtx.length,policy.INPUTS);
assert.ok(noCtx.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
assert.equal(noCtx[15],0.5,'missing rule-utility context -> 0.5 gap');

// Training builder === runtime contract (parity by construction).
const a=v7feat.buildFeatures(state,branch,ctx),b=policy.features(state,branch,ctx);
assert.deepEqual(a,b,'training/runtime feature parity');
v7feat.assertFeatureParity(state,branch,ctx);
const audit=v7feat.audit();
assert.equal(audit.inputs,38);
assert.equal(audit.constant.length,0,'all 38 features active at runtime');

// Fail-closed validate (schema 7, per-arch length).
const bad=(arch,changes)=>assert.throws(
  ()=>policy.validate({...policy.zero(arch),...changes}),
  /Invalid schema-7 action model/);
const L24=policy.lengthFor('38x24x2-tanh');
bad('38x24x2-tanh',{weights:new Array(L24)});
bad('38x24x2-tanh',{weights:Array(L24).fill(0).map((x,i)=>i===2?NaN:x)});
bad('38x24x2-tanh',{weights:Array(L24).fill(0).map((x,i)=>i===2?Infinity:x)});
bad('38x24x2-tanh',{weights:Array(L24+1).fill(0)});
bad('38x24x2-tanh',{outputs:['branchScore','x']});
bad('38x24x2-tanh',{outputs:['heldGain']});
bad('38x24x2-tanh',{arch:'38x20x2-tanh'});
bad('38x24x2-tanh',{schema:6});
// A 40-hidden zero must be rejected under the 24-hidden length contract.
const L40=policy.lengthFor('38x40x2-tanh');
bad('38x24x2-tanh',{weights:Array(L40).fill(0)});

// Predict rejects bad vector length / non-finite.
const zero24=policy.zero('38x24x2-tanh');
assert.throws(()=>policy.predict(zero24,Array(policy.INPUTS-1).fill(0)),
  /Invalid action-branch feature vector/);
assert.throws(()=>policy.predict(zero24,Array(policy.INPUTS).fill(NaN)),
  /Invalid action-branch feature vector/);
console.log('PASS P7 action-v7 schema, kind one-hots, rule-utility context, both archs, finite features, fingerprint, fail-closed');
