'use strict';
const assert=require('node:assert/strict');
const {hostilePlayers}=require('../tools/benchmark/enemy-metrics.cjs');

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
