import assert from 'node:assert/strict';
import path from 'node:path';
import {parseArgs,visibleFrame} from '../tools/benchmark/replay-reconstruct.mjs';

const sha='a'.repeat(40);
const parsed=parseArgs(['--input','raw.json','--out','visible.json','--engine','./OpenFrontIO',
  '--engineCommit',sha,'--clientID','client-A','--usageRights','owner supplied']);
assert.equal(parsed.engineCommit,sha);
assert.equal(parsed.clientID,'client-A');
assert.throws(()=>parseArgs(['--input','a','--out','b','--engine','c',
  '--engineCommit','bad','--clientID','x','--usageRights','yes']),/40-hex/);

const attacksIn=[{retreating:false,troops:200},{retreating:true,troops:999}];
const attacksOut=[{retreating:false,troops:300},{retreating:false,troops:25}];
const me={hasSpawned:()=>true,isAlive:()=>true,troops:()=>5000,gold:()=>123456n,
  numTilesOwned:()=>777,incomingAttacks:()=>attacksIn,outgoingAttacks:()=>attacksOut};
const view={myPlayer:()=>me};
const turn={turnNumber:42};
const frame=visibleFrame(view,turn,sha,'game-1',[
  {type:'attack',clientID:'client-A'}
]);
assert.equal(frame.source,'GameView');
assert.equal(frame.observation,'pre-action-player-view');
assert.deepEqual(frame.visibleState,{home:5000,gold:123456,land:777,incoming:200,committed:325});
assert.equal(frame.action.type,'attack');
assert.equal(frame.outcome,null);

const multi=visibleFrame(view,{turnNumber:43},sha,'game-1',[
  {type:'donate_troops'},{type:'attack'}
]);
assert.equal(multi.action.type,'multi-intent');
assert.deepEqual(multi.action.intentTypes,['attack','donate_troops']);
assert.equal(multi.action.intentCount,2);

assert.equal(visibleFrame({myPlayer:()=>({...me,isAlive:()=>false})},turn,sha,'game-1',
  [{type:'attack'}]),null);

console.log('PASS raw replay reconstruction contract: exact args + pre-action GameView-only frame');
