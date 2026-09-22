'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {convert,run}=require('../tools/benchmark/replay-cli.cjs');
const engine='a'.repeat(40),matchId='public-match-01';
const frame=tick=>({source:'GameView',engineCommit:engine,matchId,tick,
 visibleState:{home:100,gold:300,land:20,incoming:0,committed:10},
 action:{type:'attack'}});
const input={format:'openfront-visible-gameview-v1',complete:true,
 visibility:'player-view',engineCommit:engine,matchId,frames:[frame(10),frame(20)]};
const copy=x=>JSON.parse(JSON.stringify(x));
const accepted=convert(input,engine);
assert.equal(accepted.usable.length,2);
assert.equal(accepted.usable[0].outcome,null,'unobserved outcome remains unknown');
for(const mutate of [
 x=>x.complete=false,x=>x.visibility='omniscient',x=>x.engineCommit='b'.repeat(40),
 x=>x.frames=[],x=>x.matchId='',x=>x.format='raw-openfront',
 x=>x.frames[0].source='unknown',x=>x.frames[0].visibleState.home=-1,
 x=>x.frames[0].matchId='different',x=>x.frames[1].tick=10,
 x=>delete x.frames[1].action
]){
 const broken=copy(input);mutate(broken);
 assert.throws(()=>convert(broken,engine));
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'replay-visible-cli-'));
try{
 const src=path.join(dir,'public.json'),dst=path.join(dir,'frames.json');
 fs.writeFileSync(src,JSON.stringify(input));
 run(['--input',src,'--out',dst,'--engineCommit',engine]);
 assert.equal(JSON.parse(fs.readFileSync(dst,'utf8')).usable.length,2);
 assert.throws(()=>run(['--input',src,'--out',dst,'--engineCommit',engine]),/overwrite/);
 const invalid=path.join(dir,'bad.json'),absent=path.join(dir,'absent.json');
 fs.writeFileSync(invalid,JSON.stringify({...input,complete:false}));
 assert.throws(()=>run(['--input',invalid,'--out',absent,'--engineCommit',engine]));
 assert.equal(fs.existsSync(absent),false);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('PASS visible replay CLI: strict pin, completeness, order, no overwrite');
