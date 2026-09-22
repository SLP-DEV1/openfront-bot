'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SCENARIOS,assertMatch,parse,main}=require('../tools/benchmark/scenario-pack.cjs');
assert.equal(SCENARIOS.length,10);
assert.equal(new Set(SCENARIOS.map(x=>x.id)).size,10);
assert.equal(new Set(SCENARIOS.map(x=>x.seed)).size,10);
assert.equal(SCENARIOS.filter(x=>x.gameMode==='Team').length,3);
assert(SCENARIOS.every(x=>x.scriptedHumans>=2));
assert.throws(()=>parse(['--execute']),/requires --engine/);
assert.throws(()=>parse(['--ticks','Infinity']),/Invalid scenario tick/);
assert.throws(()=>parse(['--bad']),/Unknown option/);
const engineCommit='b'.repeat(40),botSHA256='f'.repeat(64);
const fixture={
 benchmarkMeta:{engineCommit,botSHA256,seed:SCENARIOS[0].seed,scriptedHumans:2,
   gameConfig:{gameMode:'Free For All'}},
 run:{failure:null,termination:'tick-limit',spawned:true},
 recording:{complete:true},
 trajectory:{samples:[
  {tick:100,land:2,home:90,gold:100,enemyLand:14,enemyTroops:130},
  {tick:300,land:5,home:130,gold:120,enemyLand:11,enemyTroops:100}],
 summary:{sampleCount:2,finalEnemyLand:11,endLand:5}}
};
const check=r=>assertMatch(r,SCENARIOS[0],{engineCommit,botSHA256});
const copy=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(check(fixture),[]);
for(const [mutate,pattern] of [
 [r=>r.benchmarkMeta.botSHA256='wrong',/bot SHA/],
 [r=>r.benchmarkMeta.gameConfig.gameMode='Team',/game mode/],
 [r=>r.run.failure='error',/engine failure/],
 [r=>r.recording.complete=false,/recording incomplete/],
 [r=>r.run.spawned=false,/not spawned/],
 [r=>r.trajectory.samples[1].enemyLand=-1,/invalid enemyLand/],
 [r=>r.trajectory.samples[1].tick=100,/non-increasing/],
 [r=>r.trajectory.summary.sampleCount=3,/sample count/],
 [r=>r.trajectory.summary.finalEnemyLand=12,/hostile-only enemyLand/]
]){
 const r=copy(fixture);mutate(r);
 assert.match(check(r).join('; '),pattern);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'scenario-pack-test-'));
try{
 const bot=path.join(temp,'bot.user.js');
 fs.writeFileSync(bot,'// deterministic fake bot; dry-run does not execute it\n');
 const result=main(['--bot',bot,'--engineCommit',engineCommit,
   '--out',path.join(temp,'results')]);
 assert.equal(result.mode,'dry-run');
 assert.equal(result.scenarios.length,10);
 assert(result.scenarios.every(x=>x.status==='not-run'));
 assert(!fs.existsSync(path.join(temp,'results')),
   'dry-run must not create fabricated results');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS ten deterministic scenario definitions, invariant rejection and no-run dry mode');
