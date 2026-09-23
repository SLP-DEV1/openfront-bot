'use strict';
const assert=require('node:assert/strict');
const {actionFromIntent,visibleState,frameFor}=require('../tools/benchmark/replay-engine-extract-core.cjs');
assert.equal(actionFromIntent({type:'mark_disconnected',clientID:'x'}),null);
assert.deepEqual(actionFromIntent({type:'attack',targetID:'p',troops:123n}),
 {type:'attack',targetID:'p',troops:'123'});
const me={hasSpawned:()=>true,troops:()=>900,gold:()=>1000n,
 numTilesOwned:()=>77,incomingAttacks:()=>[{troops:50}],
 outgoingAttacks:()=>[{troops:120}]};
const view={myPlayer:()=>me,config:()=>({maxTroops:()=>1000})};
assert.deepEqual(visibleState(view),{home:900,gold:1000,land:77,
 incoming:50,committed:120,maxTroops:1000,capacityUse:.9});
const frame=frameFor(view,{engineCommit:'a'.repeat(40),matchId:'m',clientID:'c'},
 42,{type:'attack',targetID:'p',troops:50});
assert.equal(frame.source,'GameView');
assert.equal(frame.tick,42);
assert.equal(frame.playerClientID,'c');
assert.equal(frame.outcome,null);
assert.equal(frame.visibleState.land,77);
assert.equal(frame.action.type,'attack');
assert.equal(frameFor({myPlayer:()=>null},{engineCommit:'a'.repeat(40),
 matchId:'m',clientID:'c'},1,{type:'attack'}),null);
console.log('PASS exact-engine replay extraction core: selected GameView only, supported action mapping, no fabricated outcome');
