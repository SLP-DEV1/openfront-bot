'use strict';
const assert=require('node:assert/strict');
const {parse}=require('../tools/benchmark/common.cjs');
const {summarize,compare}=require('../tools/match-report.cjs');
const base={bot:'1.10.9',gameType:'Singleplayer',difficulty:'Medium',
  benchmarkMeta:{gameMap:'World',gameMapSize:'Compact',gameMode:'Free For All',seed:'test-1',
    seedSource:'GameStartInfo.gameID',harness:'engine-gameview-v1',engineCommit:'123',
    botSHA256:'old',profile:'autonomous',maxTicks:18000,gameConfig:{bots:40,nations:8}},
  gameEnd:{outcome:'victory',land:100,tick:300},
  recording:{total:1500,counts:{attack_confirmed:32},dropped:100,complete:true},records:[]};
const copy=x=>JSON.parse(JSON.stringify(x));
const other=copy(base);other.benchmarkMeta.botSHA256='new';
assert.equal(compare([summarize(base),summarize(other)]).length,1);
for(const [key,value] of [['engineCommit','456'],['harness','browser-localserver-worker-v1'],
  ['seed','test-2'],['seedSource',null],['maxTicks',9000],['gameConfig',{bots:41,nations:8}]]){
  const changed=copy(other);changed.benchmarkMeta[key]=value;
  assert.equal(compare([summarize(base),summarize(changed)]).length,0,key);
}
for(const outcome of ['incomplete','unknown']){
  const changed=copy(other);changed.gameEnd.outcome=outcome;
  assert.equal(summarize(changed).finished,false);
  assert.equal(compare([summarize(base),summarize(changed)]).length,0);
}
assert.equal(summarize(base).attackConfirmed,32,'lifetime counters survive ring truncation');
assert.equal(summarize({...base,gameEnd:null,finalState:{land:55},run:{tick:100}}).finalLand,55);
assert.throws(()=>parse(['--engine','/tmp/engine','--ticks','NaN']),/Invalid ticks/);
assert.throws(()=>parse(['--engine','/tmp/engine','--seed','../oops']),/Seed/);
assert.throws(()=>parse(['--engine','/tmp/engine','--mystery','1']),/Unknown option/);
assert.throws(()=>parse(['--engine','/tmp/engine','--profile','nope']),/Unknown profile/);
console.log('PASS benchmark report isolation, censored results, lifetime counters and CLI validation');
