'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {makeStore}=require('../brain/store.cjs');
const {createServer}=require('../brain/server.cjs');
const {observation,contextOf,progress,advice}=require('../brain/learning.cjs');
const {parseRun,importRun}=require('../brain/import.cjs');
const {parse}=require('../brain/train.cjs');
(async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aggrobot-brain-'));
  const dbPath=path.join(tmp,'memory.sqlite');
  let store=makeStore(dbPath);
  const matchId='testmatch00000001';
  const state=(seq,tick,land,mode='EXPAND')=>({schema:1,matchId,seq,tick,mode,land,home:500,max:1000,incoming:0,strongest:300});
  assert.equal(contextOf(observation(state(1,0,1000))),'EXPAND:SAFE');
  assert(Math.abs(progress({land:1000,home:500,max:1000},{land:1100,home:500})-0.075)<1e-12);
  assert.deepEqual(advice({samples:0,mean:1}),{aggressiveDelta:0,reserveDelta:0});
  assert.throws(()=>observation({...state(1,0,1000),incoming:-1}),TypeError);
  assert.throws(()=>observation({...state(1,0,1000),matchId:'../../etc'}),TypeError);
  const first=store.observe(state(1,0,1000));
  assert.equal(first.reward,null);
  for(let i=1;i<=5;i++)store.observe(state(i+1,i*240,1000+i*100));
  assert.equal(store.report().experiences,5);
  assert(store.report().contexts.some(c=>c.context==='EXPAND:SAFE'&&c.samples===5&&c.mean>0));
  assert.throws(()=>store.observe(state(6,1200,1500)),RangeError,'duplicate sequence');
  assert.throws(()=>store.observe(state(7,1200,1500)),RangeError,'duplicate tick');
  assert.throws(()=>store.observe(state(7,1440,1500,'BAD')),TypeError);
  const fin=store.finish({matchId,outcome:'unknown'});
  assert.equal(fin.recorded,true);
  assert.equal(store.finish({matchId,outcome:'victory'}).recorded,false);
  assert.throws(()=>store.observe(state(7,1440,1600)),RangeError,'closed match');
  store.close();
  store=makeStore(dbPath);
  assert.equal(store.report().experiences,5,'experience persists across process restarts');
  assert.equal(store.report().finished[0].outcome,'unknown');
  const server=createServer({token:'a'.repeat(64),store});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const req=(route,body,token='a'.repeat(64),origin='https://openfront.io')=>fetch(base+route,{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Aggrobot-Token':token},
    body:JSON.stringify(body)});
  try{
    assert.equal((await fetch(base+'/health')).status,200);
    assert.equal((await req('/v1/observe',state(1,0,1000),'wrong')).status,401);
    assert.equal((await req('/v1/observe',state(1,0,1000),'a'.repeat(64),'https://evil.invalid')).status,403);
    const preflight=await fetch(base+'/v1/observe',{method:'OPTIONS',
      headers:{Origin:'https://openfront.io','Access-Control-Request-Private-Network':'true'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-private-network'),'true');
    const ok=await req('/v1/observe',{...state(1,0,1000),matchId:'newmatch00000001'});
    assert.equal(ok.status,200);
    assert.equal((await ok.json()).aggressiveDelta,0);
    const again=await req('/v1/observe',{...state(1,0,1000),matchId:'newmatch00000001'});
    assert.equal(again.status,400);
    assert.equal((await req('/v1/observe',{...state(1,0,1000),matchId:'newmatch00000001',home:-5})).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
  const runDir=path.join(tmp,'run');fs.mkdirSync(runDir);
  fs.writeFileSync(path.join(runDir,'match.json'),JSON.stringify({
    benchmarkMeta:{harness:'engine-gameview-v1',seed:'sample',botSHA256:'abc'},
    recording:{complete:true},gameEnd:{outcome:'incomplete'}}));
  fs.writeFileSync(path.join(runDir,'events.jsonl'),[
    {kind:'brain_sample',seq:1,tick:0,brainMode:'EXPAND',land:1000,home:500,maxTroops:1000,incoming:0,strongest:100},
    {kind:'brain_sample',seq:2,tick:240,brainMode:'EXPAND',land:1100,home:500,maxTroops:1000,incoming:0,strongest:100}
  ].map(v=>JSON.stringify(v)).join('\n')+'\n');
  const parsed=parseRun(runDir);assert.equal(parsed.outcome,'incomplete');
  store=makeStore(path.join(tmp,'import.sqlite'));
  assert.equal(importRun(store,runDir).samples,2);
  assert.equal(importRun(store,runDir).skipped,true);
  assert.equal(store.report().finished[0].outcome,'incomplete');
  assert.equal(store.report().experiences,1);
  store.close();
  assert.deepEqual(parse(['--engine','/tmp/engine','--seeds','a,b']).seeds,['a','b']);
  assert.throws(()=>parse(['--engine','x','--seeds','a,a']));
  fs.rmSync(tmp,{recursive:true,force:true});
  console.log('AggroBot Brain regression: PASS (SQLite, HTTP auth/CORS, replay/import, trainer CLI)');
})().catch(e=>{console.error(e);process.exitCode=1;});
