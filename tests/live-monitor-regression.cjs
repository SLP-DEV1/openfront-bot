'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');

async function main(){
  const child=spawn(process.execPath,[path.resolve(__dirname,'../tools/live-monitor.cjs')],
    {stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='',errors='';
  child.stdout.on('data',chunk=>{output+=chunk;});
  child.stderr.on('data',chunk=>{errors+=chunk;});
  try{
    const started=Date.now();
    while(!output.includes('Tampermonkey-Token: ')){
      if(child.exitCode!==null)throw Error('monitor exited: '+errors);
      if(Date.now()-started>5000)throw Error('monitor startup timed out: '+errors);
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    const token=output.match(/Tampermonkey-Token: ([a-f0-9]{64})/)[1];
    const url='http://127.0.0.1:8766/v1/events';
    // Session IDs persist on disk (the monitor treats disk as authoritative),
    // so every run needs fresh IDs to stay idempotent on a local checkout.
    const nonce='run'+Date.now().toString(36);
    const sessionA=nonce+'-match-first-abc123',sessionB=nonce+'-match-second-def456';
    const record=(session,seq,tick=10)=>({
      session,seq,time:new Date().toISOString(),tick,kind:'snapshot',message:'test'});
    const post=async records=>fetch(url,{method:'POST',
      headers:{'Content-Type':'application/json',
        'X-Aggrobot-Monitor-Token':token},
      body:JSON.stringify({records})});
    const body=JSON.stringify({records:[record(sessionA,1)]});
    assert.equal((await fetch(url,{method:'POST',body})).status,401);
    let response=await post([record(sessionA,1)]);
    assert.equal(response.status,200);
    const first=await response.json();
    assert.equal(first.accepted,1);
    response=await post([record(sessionA,1)]);
    assert.equal((await response.json()).accepted,0);
    response=await post([record(sessionB,1)]);
    assert.equal(response.status,200);
    const second=await response.json();
    assert.equal(second.accepted,1,'sequence reset starts a new match');
    assert.notEqual(second.runDir,first.runDir,'matches must never share files');
    response=await post([record(sessionA,2,20)]);
    assert.equal((await response.json()).accepted,1,'older tab stays valid');
    response=await post([record(sessionA,3),record(sessionB,2)]);
    assert.equal(response.status,400,'mixed-session batch rejected');
    for(const [dir,n,last] of [[first.runDir,2,20],[second.runDir,1,10]]){
      const status=JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8'));
      assert.equal(status.count,n);assert.equal(status.lastTick,last);
      assert.equal(fs.readFileSync(path.join(dir,'events.jsonl'),'utf8')
        .trim().split('\n').length,n);
    }
    // Keep an older, active tab while >48 finished matches rotate out of
    // memory. All files and per-session sequence numbers must remain intact.
    const finished=[];
    for(let i=0;i<51;i++){
      const id=nonce+'-finished-match-'+String(i).padStart(4,'0');
      const result=await post([{...record(id,1,i),kind:'game_over'}]);
      assert.equal(result.status,200,'finished session '+i+' accepted');
      finished.push({id,...await result.json()});
    }
    response=await post([record(sessionA,3,30)]);
    assert.equal(response.status,200,'active older tab survives rotation');
    assert.equal((await response.json()).accepted,1);
    const old=finished[0];
    response=await post([record(old.id,1,0)]);
    assert.equal(response.status,200);
    const replay=await response.json();
    assert.equal(replay.accepted,0,'retired session restores deduplication');
    assert.equal(replay.runDir,old.runDir,'retired session reuses original directory');
    response=await post([record(old.id,2,40)]);
    assert.equal(response.status,200);
    assert.equal((await response.json()).accepted,1);
    const persisted=JSON.parse(fs.readFileSync(
      path.join(old.runDir,'status.json'),'utf8'));
    assert.equal(persisted.lastSeq,2);
    assert.equal(persisted.completed,true);
    assert.equal(fs.readFileSync(path.join(old.runDir,'events.jsonl'),'utf8')
      .trim().split('\n').length,2);
    const active=JSON.parse(fs.readFileSync(
      path.join(first.runDir,'status.json'),'utf8'));
    assert.equal(active.lastSeq,3);
    assert.equal(active.completed,false);
    console.log('live monitor regression passed');
  }finally{child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
