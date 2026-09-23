'use strict';
const assert=require('node:assert/strict');
const {audit}=require('../tools/benchmark/replay-raw-preflight.cjs');
const SHA='a'.repeat(40);
const sample={
 version:'v0.0.2',gitCommit:SHA,
 info:{gameID:'replay-1',config:{gameMap:'Italia'},
   players:[{clientID:'client-A'}],num_turns:16},
 turns:[
  {turnNumber:0,intents:[{type:'mark_disconnected',
    clientID:'client-A',isDisconnected:false}],hash:123},
  {turnNumber:5,intents:[{type:'attack',clientID:'client-A'}],hash:456},
  {turnNumber:10,intents:[{type:'spawn',clientID:'client-B'}],hash:789}
 ]
};
const report=audit(sample,SHA);
assert.equal(report.recordedTurns,3);
assert.equal(report.declaredTicks,16);
assert.equal(report.omittedTurns,13,
 'sparse raw turns are NOT complete visible GameView snapshots');
assert.equal(report.hashAnchors,3);
assert.equal(report.visibleLearningPairs,0);
assert.equal(report.engineHashesVerified,false);
assert.equal(report.unlistedActorCount,1);
assert.match(report.identityWarning,/independent verification/);
assert.equal(report.status,'structurally-validated-only');
const bad=record=>()=>audit(record,SHA);
assert.throws(()=>audit(sample,'b'.repeat(40)),/engine commit mismatch/);
assert.throws(bad({...sample,turns:[sample.turns[0],sample.turns[0]]}),
 /out of order/);
assert.throws(bad({...sample,turns:[{...sample.turns[0],hash:null}]}),
 /no independent hash anchors/);
assert.throws(bad({...sample,turns:[{
 ...sample.turns[0],intents:[{type:'spawn',clientID:null}]
}]}),/intent identity/);
assert.throws(bad({...sample,info:{...sample.info,num_turns:10}}),
 /out of order or invalid/);
assert.throws(bad({...sample,info:{...sample.info,players:[
 {clientID:'client-A'},{clientID:'client-A'}]}}),
 /duplicate GameRecord clientID/);
console.log('PASS raw replay preflight: sparse turns, exact pin, hash anchors, no fabricated player GameView');
