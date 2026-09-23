'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SCENARIOS,assertMatch,parse,main}=require('../tools/benchmark/scenario-pack.cjs');
assert.equal(SCENARIOS.length,23);
assert.equal(new Set(SCENARIOS.map(x=>x.id)).size,23);
assert.equal(new Set(SCENARIOS.map(x=>x.seed)).size,23);
assert.equal(SCENARIOS.filter(x=>x.gameMode==='Team').length,7);
assert(SCENARIOS.every(x=>x.scriptedHumans>=2));
// P1: konkrete Szenario-Fälle + Allianz-/Diplomatie-Szenarien mit Semantik.
for(const id of ['cap-stall','destroyed-city','collapsing-income','encirclement',
 'attack-gap-war-lock','boat-disappears','second-enemy-attacks','false-partner',
 'nuke-sam-risk','team-donation-homeland','team-not-duo-relay',
 'alliance-break-fresh-states','diplomat-pressure'])
 assert.ok(SCENARIOS.some(x=>x.id===id&&x.description),
   'missing P1 scenario case or alliance/diplomacy scenario: '+id);
assert.throws(()=>parse(['--execute']),/requires --engine/);
assert.throws(()=>parse(['--ticks','Infinity']),/Invalid scenario tick/);
assert.throws(()=>parse(['--bad']),/Unknown option/);
const engineCommit='b'.repeat(40),botSHA256='f'.repeat(64),ticks=700;
const fixture={
 benchmarkMeta:{engineCommit,botSHA256,seed:SCENARIOS[0].seed,scriptedHumans:2,
   opponentProfile:SCENARIOS[0].opponentProfile,maxTicks:ticks,
   gameConfig:{gameMode:'Free For All',gameMap:'World',gameMapSize:'Compact',difficulty:'Impossible',gameType:'Private'}},
 run:{failure:null,termination:'tick-limit',spawned:true},
 recording:{complete:true},
 trajectory:{samples:[
  {tick:100,land:2,home:90,gold:100,enemyLand:14,enemyTroops:130},
  {tick:300,land:5,home:130,gold:120,enemyLand:11,enemyTroops:100}],
 summary:{sampleCount:2,finalEnemyLand:11,endLand:5}}
};
const check=(r,scenario=SCENARIOS[0])=>assertMatch(r,scenario,{engineCommit,botSHA256,ticks});
const copy=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(check(fixture),[]);
const europe=SCENARIOS.find(x=>x.id==='europe-ffa-rush');
const europeFixture=copy(fixture);
europeFixture.benchmarkMeta.seed=europe.seed;
europeFixture.benchmarkMeta.opponentProfile=europe.opponentProfile;
europeFixture.benchmarkMeta.gameConfig.gameMap='Europe';
assert.deepEqual(check(europeFixture,europe),[]);
for(const [mutate,pattern] of [
 [r=>r.benchmarkMeta.botSHA256='wrong',/bot SHA/],
 [r=>r.benchmarkMeta.gameConfig.gameMode='Team',/game mode/],
 [r=>r.benchmarkMeta.gameConfig.gameMap='Europe',/game map mismatch/],
 [r=>delete r.benchmarkMeta.gameConfig.gameMap,/game map mismatch/],
 [r=>r.benchmarkMeta.gameConfig.gameMapSize='Large',/game map size mismatch/],
 [r=>r.benchmarkMeta.gameConfig.difficulty='Hard',/difficulty mismatch/],
 [r=>r.benchmarkMeta.gameConfig.gameType='Public',/game type mismatch/],
 [r=>r.benchmarkMeta.opponentProfile='defender',/opponent profile mismatch/],
 [r=>r.benchmarkMeta.maxTicks=ticks+1,/tick limit mismatch/],
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
 assert.equal(result.scenarios.length,23);
 assert(result.scenarios.every(x=>x.status==='not-run'));
 assert(!fs.existsSync(path.join(temp,'results')),
   'dry-run must not create fabricated results');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS ten deterministic scenario definitions, fail-closed provenance, invariant rejection and no-run dry mode');
