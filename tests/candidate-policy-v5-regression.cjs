'use strict';
const assert=require('node:assert/strict');
const policy=require('../trainer/candidate-policy-v5.cjs');
const zero=policy.zero();
assert.equal(policy.INPUTS,32);
assert.equal(zero.weights.length,policy.LENGTH);
assert.equal(policy.validate(zero),zero);
assert.deepEqual(policy.predict(zero,Array(policy.INPUTS).fill(0)),
  {heldGain:.5,lossRisk:.5},'zero initialization is neutral, not a trained model');
const features=policy.features({home:1500,gold:1000,maxTroops:3000,land:2000},
  {kind:'attack',costTroops:100,expectedLand:500,legalConfidence:1});
assert.equal(features.length,policy.INPUTS);
assert.ok(features.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
assert.equal(features[29],1,'attack discriminator');
assert.equal(features[30],0,'investment discriminator');
assert.equal(features[31],0,'naval discriminator');
assert.equal(policy.features({},{}).length,policy.INPUTS);
assert.equal(policy.sha(zero),policy.sha(policy.zero()),'stable fingerprints');
const bad=(changes)=>assert.throws(()=>policy.validate({...policy.zero(),...changes}),
  /Invalid schema-5 candidate model/);
bad({weights:new Array(policy.LENGTH)});
bad({weights:Array(policy.LENGTH).fill(0).map((x,i)=>i===2?NaN:x)});
bad({weights:Array(policy.LENGTH).fill(0).map((x,i)=>i===2?Infinity:x)});
bad({outputs:['lossRisk','heldGain']});
bad({outputs:['heldGain']});
bad({arch:'incorrect'});
bad({schema:4});
assert.throws(()=>policy.predict(zero,Array(policy.INPUTS-1).fill(0)),
  /Invalid candidate feature vector/);
assert.throws(()=>policy.predict(zero,Array(policy.INPUTS).fill(NaN)),
  /Invalid candidate feature vector/);
console.log('PASS P6 candidate-v5 schema, finite features, model fingerprint and safe output order');
