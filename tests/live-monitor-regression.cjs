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
    const dir=output.match(/Diagnoseordner: ([^\r\n]+)/)[1];
    const url='http://127.0.0.1:8766/v1/events';
    const record={seq:1,time:new Date().toISOString(),tick:10,kind:'snapshot',message:'test'};
    const body=JSON.stringify({records:[record]});
    assert.equal((await fetch(url,{method:'POST',body})).status,401);
    const options={method:'POST',headers:{'Content-Type':'application/json',
      'X-Aggrobot-Monitor-Token':token},body};
    let response=await fetch(url,options);
    assert.equal(response.status,200);
    assert.equal((await response.json()).accepted,1);
    response=await fetch(url,options);
    assert.equal((await response.json()).accepted,0);
    const status=JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8'));
    assert.equal(status.count,1);
    assert.equal(status.lastTick,10);
    assert.equal(fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n').length,1);
    console.log('live monitor regression passed');
  }finally{child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
