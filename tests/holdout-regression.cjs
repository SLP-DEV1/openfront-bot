'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const common=require('../tools/benchmark/common.cjs');
const {verifyEvidence,reserveOutputDir}=require('../tools/benchmark/holdout-evidence.cjs');
const a='a'.repeat(64),b='b'.repeat(64);
const expected={policySHA256:a,botSHA256:b,engineCommit:'1'.repeat(40),
  seed:'holdout-1',profile:'autonomous',opponentProfile:'balanced',
  scriptedHumans:0,maxTicks:18000,map:'World',size:'Compact',
  difficulty:'Impossible',gameType:'Singleplayer',gameMode:'FFA',nations:1};
const cfg={gameMap:'World',gameMapSize:'Compact',difficulty:'Impossible',
  gameType:'Singleplayer',gameMode:'Free For All',nations:1};
const meta={...expected,gameConfig:cfg,harness:'engine-gameview-v2',
  settings:common.profiles.autonomous};
const report={benchmarkMeta:{...meta},run:{termination:'tick-limit',tick:18000},
  finalState:{land:500},gameEnd:{outcome:'incomplete'}};
const accepts=(m=meta,r=report,e=expected,code=0)=>
  verifyEvidence(m,r,e,code);
assert.equal(accepts().valid,true);
assert.equal(accepts().policySHA256,a);
for(const bad of [null,'', 'f'.repeat(64)]){
  assert.throws(()=>accepts({...meta,policySHA256:bad}),/policySHA256/);
  assert.throws(()=>accepts(meta,{...report,
    benchmarkMeta:{...report.benchmarkMeta,policySHA256:bad}}),/policySHA256/);
}
assert.throws(()=>accepts(meta,report,{...expected,policySHA256:null}),/hashes/);
assert.throws(()=>accepts(meta,report,expected,1),/process failed/);
assert.throws(()=>accepts(meta,report,expected,null),/process failed/);
for(const [key,value] of [['botSHA256','f'.repeat(64)],['engineCommit','2'.repeat(40)],
  ['seed','wrong'],['maxTicks',22000],['profile','balanced'],
  ['scriptedHumans',2],['opponentProfile','rush']]){
  assert.throws(()=>accepts({...meta,[key]:value}),/mismatch/);
  assert.throws(()=>accepts(meta,{...report,benchmarkMeta:{
    ...report.benchmarkMeta,[key]:value}}),/mismatch/);
}
for(const [key,value] of [['gameMap','Europe'],['gameMapSize','Large'],
  ['difficulty','Hard'],['gameType','Public'],['gameMode','Team'],['nations',4]]){
  assert.throws(()=>accepts({...meta,gameConfig:{...cfg,[key]:value}}),/mismatch/);
}
assert.throws(()=>accepts(meta,{...report,run:{termination:'error',tick:18000}}),
  /termination/);
assert.throws(()=>accepts(meta,{...report,run:{termination:'tick-limit',tick:18001}}),
  /final tick/);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aggro-holdout-'));
try{
  const folder=path.join(temp,'runs','eval1');
  assert.equal(reserveOutputDir(folder),folder);
  assert.throws(()=>reserveOutputDir(folder),/EEXIST/);
  fs.writeFileSync(path.join(folder,'match.json'),'old results');
  assert.throws(()=>reserveOutputDir(folder),/EEXIST/);
  assert.equal(fs.readFileSync(path.join(folder,'match.json'),'utf8'),'old results');
}finally{fs.rmSync(temp,{force:true,recursive:true});}
console.log('PASS holdout exact hashes, config, exit status and output isolation');
