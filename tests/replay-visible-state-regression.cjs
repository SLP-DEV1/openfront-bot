'use strict';
const assert=require('node:assert/strict');
const {normalizeDecision,importReplay}=
  require('../tools/benchmark/replay-visible-state.cjs');
const engine='a'.repeat(40);
const row={engineCommit:engine,matchId:'match-1',tick:120,
  visibleState:{home:300,gold:100,land:500,incoming:20,committed:40,
    partnerNeed:.2,economyRelative:1.1},action:{type:'attack'},
  outcome:null};
const clone=x=>JSON.parse(JSON.stringify(x));
const accepted=normalizeDecision(row,engine);
assert.equal(accepted.usable,true);
assert.equal(accepted.record.missingOutcome,true);
assert.equal(accepted.record.outcome,null,'unknown stays null');
assert.equal(accepted.record.visibleState.partnerNeed,.2);
const rejects=(change,reason)=>{
  const r=clone(row);change(r);
  assert.deepEqual(normalizeDecision(r,engine),{usable:false,reason});
};
rejects(r=>r.engineCommit='b'.repeat(40),'engine-mismatch');
rejects(r=>r.tick=-1,'missing-visible-state');
rejects(r=>r.visibleState=null,'missing-visible-state');
rejects(r=>r.visibleState=[],'missing-visible-state');
rejects(r=>r.visibleState.home=-1,'incomplete-visible-state');
rejects(r=>r.visibleState.gold=NaN,'incomplete-visible-state');
rejects(r=>delete r.visibleState.incoming,'incomplete-visible-state');
rejects(r=>r.action.type='  ','missing-action');
rejects(r=>r.action=null,'missing-action');
const imported=importReplay([row,{...row,engineCommit:'b'.repeat(40)}],engine);
assert.equal(imported.usable.length,1);
assert.deepEqual(imported.rejected,['engine-mismatch']);
assert.equal(imported.usable[0].outcome,null);
assert.throws(()=>importReplay([],null),/Rows and exact engine commit/);
// P2: usable records are explicit learning pairs
assert.equal(imported.usable[0].kind,'learning-pair');
// P2: rejected rows are kept as non-binding scenario ideas (not dropped)
assert.equal(imported.scenarioIdeas.length,1);
assert.equal(imported.scenarioIdeas[0].reason,'engine-mismatch');
assert.equal(imported.scenarioIdeas[0].matchId,'match-1');
assert.equal(imported.scenarioIdeas[0].tick,120);
// P2: real human data is only accepted with provenance AND consent/usage rights
assert.throws(()=>importReplay([row],engine,{origin:'human-replay'}),/provenance/i);
assert.throws(()=>importReplay([row],engine,
  {origin:'human-replay',provenance:'gameID=cR8SRtEEcR'}),/usage rights|consent/i);
const human=importReplay([row],engine,{
  origin:'human-replay',
  provenance:'gameID=cR8SRtEEcR clientID=nzSEztci',
  usageRights:'consent'});
assert.equal(human.origin,'human-replay');
assert.equal(human.usable[0].kind,'learning-pair');
assert.equal(typeof human.provenance,'string');
assert.equal(typeof human.usageRights,'string');
assert.equal(human.schema,'aggrobot-visible-replay-v2');
// P2: an unknown origin is rejected, engine-simulation stays provenance-free
assert.throws(()=>importReplay([row],engine,{origin:'mystery'}),/origin/i);
assert.equal(imported.origin,'engine-simulation');
console.log('PASS P6 replay-state: engine pin, visible nonnegative state and action boundary');
