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
assert.deepEqual(members.map(p=>winnerOutcome(undefined,p)),
  ['incomplete','incomplete','incomplete','incomplete'],'no fabricated winner');
assert.equal(winnerOutcome(['team','blue'],player('aggrobot1',null)),
  'unknown','missing actual team ID must not infer membership from lineup');
assert.equal(winnerOutcome(['team','blue'],{clientID:()=> 'aggrobot1',team:()=> 'blue'}),'victory',
  'pinned engine exposes Team as a string');
assert.equal(winnerOutcome(['team','blue'],members[0]),'victory',
  'primary gameEnd and league outcome use the same winner resolution');
console.log('PASS FFA, both 2v2 teams, unknown teams, winnerless and primary result');
