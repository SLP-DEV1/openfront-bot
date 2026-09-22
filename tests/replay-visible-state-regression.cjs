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
console.log('PASS P6 replay-state: engine pin, visible nonnegative state and action boundary');
