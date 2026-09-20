'use strict';
const assert=require('node:assert/strict');
const {makeStore}=require('../brain/store.cjs');
const {makeAdvisor,configFromEnv}=require('../brain/qwen.cjs');
const {createServer}=require('../brain/server.cjs');
(async()=>{
  const store=makeStore();
  const bodyKinds=[];
  const mocked=async(_url,request)=>{
    const messages=JSON.parse(request.body).messages;
    bodyKinds.push(JSON.parse(messages[1].content).kind);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
      strategy:'HOLD',reasonCode:'THREAT',explanation:'Eingehende Truppen prüfen, Reserven sichern.'})}}]})};
  };
  const enabled=configFromEnv({AGGROBOT_QWEN_ENABLED:'1'});
  const make=(extra={})=>makeAdvisor({store,config:enabled,fetchImpl:mocked,...extra});
  const o=(matchId,seq,tick,incoming=0)=>({schema:1,matchId,seq,tick,
    mode:'DEFEND',land:500,home:1000,max:2000,incoming,strongest:0});
  try{
    const threat=make();
    const m='threat-match-01';
    threat.onObservation(o(m,1,100,2000));
    assert.equal(threat.status().requests,1,'acute danger triggers at first observation');
    assert.equal(threat.status().lastTrigger.kind,'threat');
    await threat.waitForIdle();
    assert.equal(store.recentQwen()[0].kind,'threat');
    threat.onObservation(o(m,2,340,2000));
    assert.equal(threat.status().requests,1,'no spam on the next observation');
    threat.onObservation(o(m,3,2500,2000));
    assert.equal(threat.status().requests,2,'persistent threat may be revisited after cooldown');
    await threat.waitForIdle();
    assert.equal(store.recentQwen()[0].kind,'threat');

    const periodic=make(),p='periodic-match-01';
    periodic.onObservation(o(p,1,0));
    periodic.onObservation(o(p,2,480));
    periodic.onObservation(o(p,3,2400));
    assert.equal(periodic.status().requests,1,'periodic review independent of 40% troops');
    assert.equal(periodic.status().lastTrigger.kind,'periodic');
    await periodic.waitForIdle();
    assert.equal(store.recentQwen()[0].kind,'periodic');
    periodic.onObservation(o(p,4,2600));
    assert.equal(periodic.status().requests,1,'periodic cooldown');

    let clock=1700000000000;
    const manual=make({now:()=>clock});
    const server=createServer({store,token:'v'.repeat(64),advisor:manual});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/v1/qwen/test';
    try{
      assert.equal((await fetch(url,{method:'POST'})).status,401);
      assert.equal((await fetch(url,{method:'GET',headers:{'X-Aggrobot-Token':'v'.repeat(64)}})).status,405);
      const probe=await fetch(url,{method:'POST',headers:{'X-Aggrobot-Token':'v'.repeat(64)}});
      assert.equal(probe.status,202);
      assert.equal((await probe.json()).accepted,true);
      await manual.waitForIdle();
      assert.equal(manual.status().requests,1);
      assert.equal(manual.status().lastTrigger.kind,'manual');
      assert.equal(store.recentQwen()[0].kind,'manual');
      assert.equal((await fetch(url,{method:'POST',headers:{'X-Aggrobot-Token':'v'.repeat(64)}})).status,409,
        'manual cooldown prevents rapid repeated generation');
      clock+=60000;
      assert.equal((await fetch(url,{method:'POST',headers:{'X-Aggrobot-Token':'v'.repeat(64)}})).status,202);
      await manual.waitForIdle();
    }finally{await new Promise(resolve=>server.close(resolve));}
    const disabled=makeAdvisor({store,config:configFromEnv(),fetchImpl:mocked});
    assert.equal(disabled.manualTest().accepted,false);
    assert.equal(disabled.status().requests,0);
    assert(bodyKinds.includes('threat')&&bodyKinds.includes('periodic')&&bodyKinds.includes('manual'));
    console.log('Qwen trigger regression: PASS (threat, periodic, manual auth/cooldown, shadow storage)');
  }finally{store.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
