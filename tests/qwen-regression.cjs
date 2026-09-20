'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {makeStore}=require('../brain/store.cjs');
const {makeAdvisor,buildPrompt,candidate,configFromEnv,API_URL,MODEL}=require('../brain/qwen.cjs');
const {createServer}=require('../brain/server.cjs');
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aggrobot-qwen-'));
  const store=makeStore(path.join(dir,'experience.sqlite'));
  try{
    assert.equal(configFromEnv({}).enabled,false,'LLM is opt-in');
    assert.equal(configFromEnv({AGGROBOT_QWEN_ENABLED:'1'}).apiKey,'local');
    assert.equal(API_URL,'http://127.0.0.1:8080/v1/chat/completions');
    assert.equal(MODEL,'qwen38-27b-gsq-mtp');
    assert.throws(()=>candidate('not json'));
    const manual=buildPrompt('manual',{tick:0,mode:'BALANCED',land:1000,
      home:500,max:1000,incoming:0,strongest:200,recent:[]});
    assert.equal(manual.isSyntheticConnectivityTest,true);
    assert.equal(manual.current.ownTerritoryTiles,1000);
    assert.equal(manual.current.ownHomeTroops,500);
    assert.equal(manual.current.strongestVisibleBorderNeighborTroops,200);
    assert.equal(manual.fieldGuide.ownHomeTroops.includes('KEIN Land'),true);
    assert.equal(manual.notProvided.includes('Gegnerische Gebietsgrößen'),true);
    assert.equal(Object.hasOwn(manual.current,'land'),false,'ambiguous field names removed');
    const history=buildPrompt('threat',{tick:500,mode:'DEFEND',land:50,home:80,
      max:1000,incoming:5000,strongest:2000,
      recent:[{tick:250,mode:'DEFEND',land:100,home:200,incoming:1000}]});
    assert.equal(history.recent[0].ownTerritoryTiles,100);
    assert.equal(history.recent[0].ownHomeTroops,200);
    assert.equal(Object.hasOwn(history.recent[0],'home'),false);
    assert.throws(()=>candidate(JSON.stringify({
      strategy:'EXPAND',reasonCode:'EXPANSION',
      explanation:'Frühes Spiel (Tick 0) mit deutlicher Führung: 500 Land gegen 200 des stärksten Gegners.'
    })),/Ungrounded/,'reject the exact hallucination observed in the live manual test');
    assert.throws(()=>candidate(JSON.stringify({
      strategy:'EXPAND',reasonCode:'EXPANSION',
      explanation:'Wir haben einen deutlichen Vorsprung vor den Gegnern.'
    })),/Ungrounded/);
    assert.equal(candidate(JSON.stringify({
      strategy:'HOLD',reasonCode:'OTHER',
      explanation:'Synthetischer Verbindungstest ohne echte Matchdaten.'
    })).strategy,'HOLD');
    assert.equal(candidate('<think>internal trace</think>\n```json\n'+JSON.stringify({
      strategy:'HOLD',reasonCode:'OTHER',explanation:'Gegenwärtige Lage beobachten.'
    })+'\n```').strategy,'HOLD');
    assert.throws(()=>candidate(JSON.stringify({strategy:'EXECUTE_CODE',reasonCode:'OTHER',explanation:'any code'})));
    assert.throws(()=>candidate(JSON.stringify({strategy:'NAVAL',reasonCode:'OTHER',explanation:'x'.repeat(370)})));
    let calls=0,body=null,url=null,headers=null;
    const advisor=makeAdvisor({store,config:configFromEnv({AGGROBOT_QWEN_ENABLED:'1'}),
      fetchImpl:async (u,opts)=>{
        calls++;url=u;body=JSON.parse(opts.body);headers=opts.headers;
        await new Promise(resolve=>setTimeout(resolve,15));
        return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
          strategy:'HOLD',reasonCode:'STAGNATION',explanation:'Landgewinn gering; Frontlage prüfen.'})}}]})};
      }});
    const matchId='shadowmatch123456';
    const o=(seq,tick,land)=>({schema:1,matchId,seq,tick,mode:'ECONOMY',
      land,home:800,max:1000,incoming:0,strongest:200});
    // Three consecutive 240-tick no-progress windows, high troops, single inference.
    for(const input of [o(1,0,1000),o(2,240,1001),o(3,480,1002),o(4,720,1003)]){
      store.observe(input);advisor.onObservation(input);
    }
    assert.equal(calls,1,'inference starts without waiting for game response');
    assert.equal(advisor.status().busy,true);
    assert.equal(url,API_URL);
    assert.equal(headers.Authorization,'Bearer local');
    assert.equal(body.model,MODEL);
    assert.equal(body.stream,false);
    assert.equal(body.max_tokens,768);
    const sent=JSON.parse(body.messages[1].content);
    assert.equal(sent.current.ownTerritoryTiles,1003);
    assert.equal(sent.current.ownHomeTroops,800);
    assert.equal(sent.current.strongestVisibleBorderNeighborTroops,200);
    assert.equal(Object.hasOwn(sent.current,'land'),false);
    assert.equal(sent.notProvided.includes('Gegnerische Gebietsgrößen'),true);
    assert(body.messages[0].content.includes('TROOP COUNTS and NEVER land'));
    assert.equal(body.messages[1].content.includes('shadowmatch123456'),false,
      'model sees aggregate state, not session identifier');
    assert.equal(advisor.status().lastResult,null,'result is not available before model finishes');
    // When the game ends while Qwen is busy, the final summary must be queued.
    advisor.onFinish(matchId,'defeat');
    await advisor.waitForIdle();
    assert.equal(advisor.status().lastError,null);
    assert.equal(advisor.status().lastResult.strategy,'HOLD');
    assert.equal(store.recentQwen().length,2);
    assert.equal(store.recentQwen()[0].kind,'postmatch');
    assert.equal(store.recentQwen()[1].reasonCode,'STAGNATION');
    // Persistent, independent from rewards and never dispatched to the game client.
    assert.equal(store.report().experiences,3);
    const server=createServer({store,token:'z'.repeat(64),advisor});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    try{
      assert.equal((await fetch(base+'/v1/qwen')).status,401);
      const report=await fetch(base+'/v1/qwen',{headers:{'X-Aggrobot-Token':'z'.repeat(64)}});
      assert.equal(report.status,200);
      const output=await report.json();
      assert.equal(output.status.enabled,true);
      assert.equal(output.recent.length,2);
      assert.equal(JSON.stringify(output).includes('Bearer local'),false);
      const obs=await fetch(base+'/v1/observe',{method:'POST',
        headers:{'Content-Type':'application/json','X-Aggrobot-Token':'z'.repeat(64)},
        body:JSON.stringify(o(5,960,1004))});
      assert.equal(obs.status,200,'slow model cannot block /v1/observe');
    }finally{await new Promise(resolve=>server.close(resolve));}
    const before=store.recentQwen().length;
    const noQwen=makeAdvisor({store,config:configFromEnv(),fetchImpl:async()=>{
      throw Error('Disabled must never call the model');
    }});
    noQwen.onObservation(o(6,1200,1005));await noQwen.waitForIdle();
    assert.equal(store.recentQwen().length,before);
    assert.equal(noQwen.status().requests,0);
    console.log('Qwen shadow advisor regression: PASS');
  }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
