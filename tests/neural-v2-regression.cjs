'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {reward,trajectoryProgress,VERSION}=require('../trainer/reward.cjs');
const evaluation=require('../trainer/evaluation-v2.cjs');
const root=path.resolve(__dirname,'..');
const trainer=fs.readFileSync(path.join(root,'trainer/train.mjs'),'utf8');
assert.match(trainer,/import evaluation from '\.\/evaluation-v2\.cjs'/);
assert.match(trainer,/import scoring from '\.\/reward\.cjs'/);
assert.match(trainer,/endTick:elapsed,ticks:gt,trajectory:state\?\.trajectory,report:state/);
assert.match(trainer,/promotionGate:'evaluation-v2'/);
assert.equal(VERSION,'strategic-held-land-v2');

const base={validSample:true,confirmed:true,outcome:'defeat',
  land:20000,endTick:6000,ticks:18000};
const steady={summary:{peakLand:70000,meanLand:60000,endLand:60000,retention:6/7}};
const spike={summary:{peakLand:100000,meanLand:10000,endLand:20000,retention:.2}};
assert(trajectoryProgress(steady)>trajectoryProgress(spike),
  'held land and retention must outweigh momentary land spikes');
assert(reward({...base,land:60000,trajectory:steady})>
  reward({...base,land:20000,trajectory:spike}),
  'strategically stable defeat is rewarded more than a collapsed spike');
const flat=reward({...base,trajectory:steady,land:60000});
const attempts={recording:{counts:{attack_intent:10000,boat_intent:10000}},
  strategic:{neutralLandings:10000},attackReceipts:{territoryGained:0}};
assert.equal(reward({...base,land:60000,trajectory:steady,report:attempts}),flat,
  'commands and unverified landings are not captured enemy territory');
assert(reward({...base,land:60000,trajectory:steady,report:{
  attackReceipts:{territoryGained:4},recording:{counts:{build_confirmed:8}},
  income:{gold:300000}}})>flat,'observed receipts provide a bounded incentive');
assert.equal(reward({...base,validSample:false}),-1);
const worstWin=reward({validSample:true,confirmed:true,outcome:'victory',
  land:0,endTick:0,ticks:18000});
const bestCensored=reward({validSample:true,confirmed:false,outcome:'incomplete',
  land:100000,endTick:18000,ticks:18000,trajectory:steady,report:{
  attackReceipts:{territoryGained:100},recording:{counts:{build_confirmed:100}},
  income:{gold:1e10}}});
const bestDefeat=reward({...base,land:100000,endTick:18000,trajectory:steady,report:{
  attackReceipts:{territoryGained:100},recording:{counts:{build_confirmed:100}},
  income:{gold:1e10}}});
assert(worstWin>bestCensored&&bestCensored>bestDefeat&&bestDefeat>-1,
  'verified wins > censored outcomes > verified defeats > invalid');
assert(Number.isFinite(reward({...base,trajectory:{summary:{meanLand:Infinity}}})));

const row=(seed,outcome='defeat',endTick=4000,land=1000)=>({
  difficulty:'Impossible',map:'World',nation:1,seed,
  gameType:'Singleplayer',gameMode:'FFA',scriptedHumans:0,
  opponentProfile:'balanced',outcome,validSample:true,
  exitCode:0,endTick,land
});
const incumbent=['a','b','c','d'].map(seed=>row(seed));
const candidate=[row('a','victory'),row('b'),row('c'),row('d')];
let cmp=evaluation.compare(incumbent,candidate);
assert.equal(cmp.valid,true);
assert.equal(cmp.promoted,true);
assert.equal(cmp.reason,'more-observed-victories-with-collapse-guard');
const incumbentCensored=[row('a','incomplete',18000,60000),
  row('b','incomplete',18000,60000),row('c','defeat'),
  row('d','defeat')];
const mixed=[row('a','victory'),row('b','defeat'),
  row('c','defeat'),row('d','defeat')];
cmp=evaluation.compare(incumbentCensored,mixed);
assert.equal(cmp.promoted,true,'one winner plus one regression fits N=4 cap');
assert.equal(cmp.regressed,1);
assert.equal(cmp.maxCollapse,1);
const blocked=[row('a','victory'),row('b','defeat'),
  row('c','defeat'),row('d','defeat')];
cmp=evaluation.compare([row('a','defeat'),row('b','incomplete',18000,60000),
  row('c','incomplete',18000,60000),row('d','defeat')],blocked);
assert.equal(cmp.promoted,false,'two regressions exceed N=4 cap');
assert.equal(cmp.reason,'wins-up-but-collapse-too-large');
assert.equal(evaluation.compare(incumbent,
  candidate.map((x,i)=>i===0?{...x,exitCode:1}:x)).valid,false);
assert.equal(evaluation.compare(incumbent,
  candidate.map((x,i)=>i===0?{...x,seed:'wrong'}:x)).valid,false);
console.log('PASS neural-v2 reward, outcome ordering, paired gate and trainer wiring');
