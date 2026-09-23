'use strict';
const assert=require('node:assert/strict');
const {importReplay}=require('../tools/benchmark/replay-visible-state.cjs');
const {detectEvents}=require('../tools/benchmark/replay-events.cjs');
const {splitReplays}=require('../tools/benchmark/replay-split.cjs');
const sha='a'.repeat(40);
const f=(matchId,tick,type,vs)=>({engineCommit:sha,matchId,tick,
  visibleState:Object.assign({home:100,gold:300,land:20,incoming:0,committed:10},vs),
  action:{type},outcome:null});
// two whole matches: A and B (near frames within each match)
const rows=[
  f('A',10,'attack',{committed:40,land:20}),
  f('A',20,'hold',{committed:10,land:20}),
  f('A',30,'transport',{committed:10,land:24}),
  f('B',10,'attack',{committed:40,land:18}),
  f('B',20,'hold',{committed:10,land:18}),
  f('B',30,'hold',{committed:10,land:18})
];
// 1) the import gate accepts the visible sequence as explicit learning pairs
const imported=importReplay(rows,sha);
assert.equal(imported.usable.length,rows.length,'all visible frames accepted');
assert.equal(imported.rejected.length,0);
assert.ok(imported.usable.every(r=>r.kind==='learning-pair'));
// 2) event tags are produced from the accepted learning pairs
const events=detectEvents(imported.usable);
for(const e of events){
  assert.equal(typeof e.source,'string');
  assert.equal(Number.isFinite(e.tick),true);
  assert.equal(typeof e.observation,'object');
  assert.equal(e.validity==='observed'||e.validity==='inferred',true);
  assert.equal(e.matchId==='A'||e.matchId==='B',true);
}
// 3) per-match separation never splits a match's near frames across sides
const split=splitReplays(imported.usable,{seed:'p2'});
assert.equal(split.train.length+split.holdout.length,imported.usable.length);
for(const matchId of ['A','B']){
  const inTrain=split.train.some(r=>r.matchId===matchId);
  const inHoldout=split.holdout.some(r=>r.matchId===matchId);
  assert.equal(inTrain&&inHoldout,false,matchId+' must not be split');
}
// 4) real human data needs provenance AND consent/usage rights before storage
assert.throws(()=>importReplay(rows,sha,{origin:'human-replay'}),/provenance/i);
const human=importReplay(rows,sha,{
  origin:'human-replay',provenance:'gameID=cR8SRtEEcR',usageRights:'consent'});
assert.equal(human.usable.length,rows.length);
assert.equal(human.origin,'human-replay');
// 5) an incomplete raw replay is still rejected (DoD: reproducible rejection)
const incomplete=importReplay([
  {engineCommit:sha,matchId:'A',tick:10,visibleState:{home:1,gold:1,land:1,incoming:0,committed:0},action:{type:'attack'}},
  {engineCommit:'b'.repeat(40),matchId:'A',tick:20,visibleState:{home:1,gold:1,land:1,incoming:0,committed:0},action:{type:'hold'}}
],sha);
assert.equal(incomplete.usable.length,1,'valid frame kept');
assert.equal(incomplete.rejected.length,1,'mismatched engine frame rejected');
assert.equal(incomplete.scenarioIdeas.length,1,'rejected frame kept as scenario idea');
console.log('PASS replay curriculum: gate -> learning pairs -> tags -> per-match split');
