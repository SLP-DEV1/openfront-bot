'use strict';
const assert=require('node:assert/strict');
const {splitReplays}=require('../tools/benchmark/replay-split.cjs');
const mk=(matchId,tick)=>({engineCommit:'a'.repeat(40),matchId,tick,
  visibleState:{home:1,gold:1,land:10,incoming:0,committed:0},
  action:{type:'hold'},outcome:null});
// two matches, three near frames each
const records=[...[10,20,30].map(t=>mk('A',t)),...[10,20,30].map(t=>mk('B',t))];

const s=splitReplays(records,{seed:'p2'});
// completeness: every frame is assigned, exactly once
assert.equal(s.train.length+s.holdout.length,records.length);
const trainSet=new Set(s.trainMatches),holdoutSet=new Set(s.holdoutMatches);
// both matches are present, and never on both sides at once
assert.deepEqual([...trainSet].concat([...holdoutSet]).sort(),['A','B']);
for(const k of trainSet)assert.equal(holdoutSet.has(k),false,'match on both sides');
// hard guarantee: a match's frames are never split across train/holdout
for(const matchId of ['A','B']){
  const inTrain=s.train.some(r=>r.matchId===matchId);
  const inHoldout=s.holdout.some(r=>r.matchId===matchId);
  assert.equal(inTrain||inHoldout,true,matchId+' assigned');
  assert.equal(inTrain&&inHoldout,false,matchId+' split across sides');
}
// determinism: same seed + same keys -> identical partition
const s2=splitReplays(records,{seed:'p2'});
assert.deepEqual(s2.trainMatches,s.trainMatches);
assert.deepEqual(s2.holdoutMatches,s.holdoutMatches);
// boundaries cover both sides
assert.equal(splitReplays(records,{seed:'p2',holdoutRatio:0}).holdout.length,0);
assert.equal(splitReplays(records,{seed:'p2',holdoutRatio:1}).train.length,0);
assert.throws(()=>splitReplays(records,{seed:'p2',holdoutRatio:1.5}),/\[0,1\]/);
// assignment depends only on (seed, key), never on frame content
const s3=splitReplays(records.map(r=>({
  ...r,visibleState:{home:999,gold:999,land:999,incoming:999,committed:999}})),{seed:'p2'});
assert.deepEqual(s3.trainMatches,s.trainMatches,'content must not change the partition');
assert.deepEqual(s3.holdoutMatches,s.holdoutMatches);
// stronger separation "as far as possible" via a custom key (player/style)
const sP=splitReplays(records.map(r=>({...r,playerId:'P1'})),
  {seed:'p2',keyOf:r=>r.matchId+'|'+r.playerId});
assert.equal(sP.train.length+sP.holdout.length,records.length);
// #159: custom identities must never partition two players in one match.
const multi=[
  {...mk('M',10),playerId:'alice',style:'rush'},
  {...mk('M',20),playerId:'bob',style:'turtle'},
  {...mk('N',10),playerId:'alice',style:'economy'},
  {...mk('Q',10),playerId:'carol',style:'naval'}
];
for(const keyOf of [r=>r.matchId+'|'+r.playerId,r=>r.style,
                    r=>r.playerId]){
  for(const seed of ['p2','custom-1','custom-2','custom-3']){
    const result=splitReplays(multi,{seed,holdoutRatio:0.5,keyOf});
    const inTrain=new Set(result.train.map(r=>r.matchId));
    assert.ok(result.holdout.every(r=>!inTrain.has(r.matchId)),
      'no match leakage under custom key: '+seed);
    assert.deepEqual(result,splitReplays(multi,{seed,holdoutRatio:0.5,keyOf}),
      'same custom split must be deterministic');
  }
}
const byPlayer=splitReplays(multi,{seed:'p2',holdoutRatio:0.5,
  keyOf:r=>r.playerId});
assert.equal(byPlayer.trainMatches.includes('M'),byPlayer.trainMatches.includes('N'),
  'shared player identity joins complete match components');
assert.throws(()=>splitReplays([{}]),/matchId/);
console.log('PASS replay split: per-match disjoint, deterministic, content-independent');
