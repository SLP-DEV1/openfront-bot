'use strict';
const assert=require('node:assert/strict');
const {winnerOutcome}=require('../tools/benchmark/winner-outcome.cjs');
const player=(clientID,teamID)=>({
  clientID:()=>clientID,
  team:()=>teamID==null?null:{id:()=>teamID}
});
const members=[
  player('aggrobot1','blue'),player('aggrobot2','blue'),
  player('aggrobot3','red'),player('aggrobot4','red')
];
assert.deepEqual(members.map(p=>winnerOutcome(['player','aggrobot2'],p)),
  ['defeat','victory','defeat','defeat'],'FFA only the named player wins');
assert.deepEqual(members.map(p=>winnerOutcome(['team','blue'],p)),
  ['victory','victory','defeat','defeat'],'first 2v2 team wins');
assert.deepEqual(members.map(p=>winnerOutcome(['team','red'],p)),
  ['defeat','defeat','victory','victory'],'opposing 2v2 team wins');
// Real GameImpl.makeWinner(team) appends every winning human ClientID.
assert.deepEqual(members.map(p=>winnerOutcome(['team','blue','aggrobot1','aggrobot2'],p)),
  ['victory','victory','defeat','defeat'],'real official team winner tuple');
assert.deepEqual(members.map(p=>winnerOutcome(['team','red','aggrobot3','aggrobot4'],p)),
  ['defeat','defeat','victory','victory'],'real opponent team winner tuple');
assert.equal(winnerOutcome(['player','aggrobot2','unexpected'],members[1]),'unknown',
  'malformed single-player winner tuple is rejected');
assert.deepEqual(members.map(p=>winnerOutcome(undefined,p)),
  ['incomplete','incomplete','incomplete','incomplete'],'no fabricated winner');
assert.equal(winnerOutcome(['team','blue'],player('aggrobot1',null)),
  'unknown','missing actual team ID must not infer membership from lineup');
assert.equal(winnerOutcome(['team','blue'],{clientID:()=> 'aggrobot1',team:()=> 'blue'}),'victory',
  'pinned engine exposes Team as a string');
assert.equal(winnerOutcome(['team','blue'],members[0]),'victory',
  'primary gameEnd and league outcome use the same winner resolution');

// Engine, never userscript heuristics, authoritatively ends a benchmark.
const {applyEngineOutcome}=require('../tools/benchmark/winner-outcome.cjs');
const local={gameEnd:{outcome:'victory',source:'userscript'}};
applyEngineOutcome(local,{player:members[0],tick:500,land:100,spawned:true});
assert.equal(local.gameEnd,undefined,'censored tick limit must not claim a victory');
assert.equal(local.botReportedGameEnd.outcome,'victory','preserve heuristic as diagnostic');
const verified={gameEnd:{outcome:'victory',source:'userscript'}};
applyEngineOutcome(verified,{hasWinUpdate:true,winner:['team','red','aggrobot3','aggrobot4'],
  player:members[0],tick:500,land:100,spawned:true});
assert.equal(verified.gameEnd.outcome,'defeat','engine result overrides local guess');
assert.equal(verified.gameEnd.source,'engine-WinUpdate');
const eliminated={};
applyEngineOutcome(eliminated,{player:{isAlive:()=>false},tick:510,
  land:0,spawned:true});
assert.equal(eliminated.gameEnd.outcome,'defeat','real elimination is authoritative');
const notSpawned={};
applyEngineOutcome(notSpawned,{player:{isAlive:()=>false},tick:10,
  land:0,spawned:false});
assert.equal(notSpawned.gameEnd,undefined,'unspawned player cannot be eliminated');

console.log('PASS FFA, both 2v2 teams, unknown teams, winnerless and primary result');
