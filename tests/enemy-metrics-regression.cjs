'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {hostilePlayers}=require('../tools/benchmark/enemy-metrics.cjs');
const visibleTrajectory=require('../tools/benchmark/trajectory.cjs');

const player=(id,alive=true)=>({clientID:()=>id,isAlive:()=>alive});
const me=player('me');
const ally=player('ally');
const enemy=player('enemy');
const deadEnemy=player('dead',false);
me.isFriendly=p=>p===ally;
assert.deepEqual(hostilePlayers([me,ally,enemy,deadEnemy],me),[enemy],
  'team allies and dead players must not contribute to enemy metrics');

const ffaMe=player('ffa-me');
ffaMe.isFriendly=()=>false;
const ffaEnemy=player('ffa-enemy');
assert.deepEqual(hostilePlayers([ffaMe,ffaEnemy],ffaMe),[ffaEnemy],
  'FFA hostile players remain included');
console.log('PASS hostile player classification for Team and FFA metrics');

// Execute the actual engine-match sampleVisible function with a fixture GameView.
// This catches a future regression where the harness stops using the shared helper.
const engineMatch=fs.readFileSync(path.join(__dirname,'../tools/benchmark/engine-match.mjs'),'utf8');
const start=engineMatch.indexOf('function sampleVisible(turn,me){');
const end=engineMatch.indexOf('\ntry{\n  for(let turn=',start);
assert(start>=0&&end>start,'engine-match sampleVisible code path must be identifiable');
const sampleCode=engineMatch.slice(start,end);
function actualEngineMatchSample(me,players){
  const visibleSamples=[];
  const view={playerViews:()=>players};
  const context={me,view,visibleSamples,visibleTrajectory};
  vm.runInNewContext(sampleCode+'\nsampleVisible(200,me);sampleVisible(200,me);',context);
  assert.equal(visibleSamples.length,1,'duplicate tick should not be sampled twice');
  return visibleSamples[0];
}
function stocked(id,land,troops,alive=true){
  return {...player(id,alive),hasSpawned:()=>true,numTilesOwned:()=>land,
    troops:()=>troops,gold:()=>500};
}
const teamMe=stocked('me',13,130),teamAlly=stocked('ally',1000,10000);
const teamEnemy1=stocked('foe1',7,70),teamEnemy2=stocked('foe2',11,110);
const teamDead=stocked('dead-foe',999,999,false);
teamMe.isFriendly=p=>p===teamAlly;
const teamPlayers=[teamMe,teamAlly,teamEnemy1,teamEnemy2,teamDead];
const teamSample=actualEngineMatchSample(teamMe,teamPlayers);
assert.equal(teamSample.enemyLand,18,'actual Team harness must not count allied land');
assert.equal(teamSample.enemyTroops,180,'actual Team harness must not count allied troops');
assert.equal(teamSample.land,13);
assert.equal(teamSample.home,130);
assert.equal(teamSample.enemyLand,hostilePlayers(teamPlayers,teamMe)
  .reduce((sum,p)=>sum+p.numTilesOwned(),0),
  'single-match and multibot hostile-only metric semantics must agree');
const ffaSelf=stocked('ffa-me',5,50),ffaOther1=stocked('ffa-1',7,70);
const ffaOther2=stocked('ffa-2',11,110);
ffaSelf.isFriendly=()=>false;
const ffaSample=actualEngineMatchSample(ffaSelf,[ffaSelf,ffaOther1,ffaOther2]);
assert.equal(ffaSample.enemyLand,18,'FFA must include all other living players');
assert.equal(ffaSample.enemyTroops,180);
console.log('PASS actual engine-match Team and FFA enemy sampling path');

// Both official-engine harnesses must use the very same sampling implementation.
const multibot=fs.readFileSync(path.join(__dirname,
  '../tools/benchmark/engine-multibot.mjs'),'utf8');
assert(multibot.includes('visibleTrajectory.sampleVisible(visibleSamples,turn,me,view.playerViews?.())'));
assert(engineMatch.includes('visibleTrajectory.sampleVisible(visibleSamples,turn,me,view.playerViews?.())'));
assert.equal(visibleTrajectory.trajectory([teamSample]).summary.finalEnemyLand,18);
assert.equal(visibleTrajectory.SEMANTICS,'gameview-hostile-only-v1');
