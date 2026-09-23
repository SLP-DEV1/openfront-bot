'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ab=require('../tools/benchmark/schema4-ablation.cjs');
const p=ab.plan({engine:'../OpenFrontIO',engineCommit:'a'.repeat(40),
 seeds:'s1,s2',ticks:'900',out:'x',bot:'OpenFront_Solo_AggroBot.user.js',
 policy:'champion.json',map:'World',size:'Compact',difficulty:'Impossible',
 gameType:'Private',gameMode:'FFA'});
assert.equal(p.jobs.length,4);
for(const seed of ['s1','s2']){
 const pair=p.jobs.filter(j=>j.seed===seed);
 assert.equal(pair.length,2);
 assert.deepEqual(pair.map(j=>j.arm),['rule','schema4']);
 const rule=pair[0].args,model=pair[1].args;
 assert.equal(rule.includes('--policy'),false);
 assert.equal(model.includes('--policy'),true);
 const strip=a=>a.filter((_,i)=>!['--policy','champion.json'].includes(a[i]) &&
   !['x/'+seed+'/rule','x/'+seed+'/schema4'].includes(a[i]));
 assert.equal(rule[rule.indexOf('--seed')+1],seed);
 assert.equal(model[model.indexOf('--seed')+1],seed);
}
const extractor=fs.readFileSync(path.join(__dirname,'..','tools/benchmark/replay-engine-extract.mjs'),'utf8');
for(const needle of ['Raw replay exact engine commit mismatch',
 'Replay hash mismatch at turn','selected GameView before archived action turn',
 'engineHashesVerified:true','GameRecordSchema.parse'])
 assert(extractor.includes(needle),'missing fail-closed replay contract: '+needle);
console.log('PASS schema4 paired ablation plan + exact-engine replay extractor fail-closed contract');
