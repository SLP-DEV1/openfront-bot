'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
  const {compactSnapshot,parseQwenReview,qwenCommand,makeLiveCoach}=
    await import('../tools/benchmark/live-qwen.mjs');
  const sample={liveState:{tick:1200,spawned:true,alive:true,status:'expanding',
    secret:'should not reach Qwen'},
    recording:{total:20,counts:{attack_intent:5,attack_confirmed:3,
      port_confirmed:1}},gameEnd:{outcome:'unknown'}};
  const compact=compactSnapshot(sample);
  assert.equal(compact.tick,1200);
  assert.equal(compact.counts.attack_intent,5);
  assert.equal(compact.counts.attack_confirmed,3);
  assert(!JSON.stringify(compact).includes('secret'));
  assert.equal(compact.counts.warship_confirmed,null);
  const final=JSON.stringify({severity:'warning',summary:'Attack intents exceed confirmations',
    evidence:['5 intents, 3 confirmed'],recommendation:'Check attack confirmation'});
  assert.equal(parseQwenReview(JSON.stringify([
    {type:'assistant',message:{content:[{type:'text',text:final}]}},
    {type:'result',result:''}])).severity,'warning');
  assert.throws(()=>parseQwenReview(JSON.stringify([{type:'result',result:'not json'}])),
    /No valid/);
  assert.equal(qwenCommand('win32',{ComSpec:'C:\\Windows\\System32\\cmd.exe'}).command,
    'C:\\Windows\\System32\\cmd.exe');
  assert(qwenCommand('linux',{}).args.includes('plan'));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aggro-live-qwen-'));
  try{
    const fake=String.raw`let s='';process.stdin.on('data',x=>s+=x);
process.stdin.on('end',()=>setTimeout(()=>process.stdout.write(JSON.stringify([
{type:'result',result:JSON.stringify({severity:'info',summary:s.includes('Spielende: true')?'final':'live',
 evidence:['recorded snapshot'],recommendation:'Test with same seed'})}])),70));`;
    const coach=makeLiveCoach({enabled:true,dir,launch:{command:process.execPath,args:['-e',fake]}});
    coach.records([{kind:'attack_intent',tick:200},{kind:'attack_confirmed',tick:300}]);
    coach.checkpoint(sample);
    coach.finish({...sample,gameEnd:{outcome:'defeat'},run:{termination:'eliminated'}});
    for(let i=0;i<100;i++){
      if(coach.status().reviews.length===2)break;
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    assert.equal(coach.status().reviews.length,2,JSON.stringify(coach.status()));
    assert.equal(coach.status().reviews.at(-1).final,true);
    assert(fs.readFileSync(path.join(dir,'qwen-live-report.md'),'utf8').includes('Spielende'));
    const inactive=makeLiveCoach({enabled:false,dir});
    inactive.checkpoint(sample);
    assert.equal(inactive.status().reviews.length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  console.log('PASS Qwen live coach: bounded telemetry, CLI parsing, async final review, disabled mode');
})().catch(e=>{console.error(e);process.exitCode=1;});
