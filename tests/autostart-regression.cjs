'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const source=fs.readFileSync(path.join(__dirname,'..','OpenFront_Solo_AggroBot.user.js'),'utf8');
const anchor="  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, auto-start after match discovery');";
assert(source.includes(anchor),'userscript injection anchor missing');

function boot() {
  let active=null;
  const keys={};
  const storage=new Map();
  const win={addEventListener:()=>{}};
  const doc={
    body:null,readyState:'loading',
    querySelector:tag=>tag==='spawn-timer'?active:null,
    addEventListener:(name,fn)=>{keys[name]=fn;}
  };
  const context={
    window:win,document:doc,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val)},
    Date,console:{info:()=>{},warn:()=>{},error:()=>{}},
    setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>1,
    performance:{now:()=>0},fetch:async()=>{throw Error('network disabled');}
  };
  const exportApi=[
    'window.__autostartTest={',
    'step,get:()=>({enabled:opts.enabled,autoStart:opts.autoStart,status,game,autoStartGame}),',
    'disableAuto:()=>{opts.autoStart=false;},enableAuto:()=>{opts.autoStart=true;autoStartGame=null;}', 
    '};'
  ].join('\n');
  vm.runInNewContext(source.replace(anchor,exportApi+'\n'+anchor),context,{timeout:2000});
  function match(type='Public',bus=true,replay=false){
    let over=false;
    const g={
      config:()=>({gameConfig:()=>({gameType:type}),isReplay:()=>replay}),
      gameOver:()=>over,inSpawnPhase:()=>false,ticks:()=>-1,
      playerViews:()=>[],terrainByte:()=>0,ref:()=>0,
      myPlayer:()=>null
    };
    active={game:g,eventBus:bus?{listeners:new Map(),emit:()=>{}}:null};
    return {g,setOver:value=>{over=value;},setBus:b=>{active.eventBus=b;}};
  }
  async function tick(){await win.__autostartTest.step();}
  function hotkey(key){keys.keydown({key,altKey:true,shiftKey:true,repeat:false,
    target:{tagName:'BODY'},preventDefault:()=>{}});}
  return {match,tick,hotkey,state:()=>win.__autostartTest.get(),
    disableAuto:win.__autostartTest.disableAuto,
    enableAuto:win.__autostartTest.enableAuto};
}

(async()=>{
  let pass=0;
  async function check(name,fn){await fn();pass++;console.log('PASS '+name);}
  await check('Public, Private and Singleplayer auto-start after discovery',async()=>{
    for(const type of ['Public','Private','Singleplayer']){
      const x=boot();x.match(type);await x.tick();
      assert.equal(x.state().enabled,true,type);
      assert.equal(x.state().autoStart,true,type);
    }
  });
  await check('EventBus unavailable: wait and start only when ready',async()=>{
    const x=boot(),m=x.match('Public',false);
    await x.tick();assert.equal(x.state().enabled,false);
    m.setBus({listeners:new Map(),emit:()=>{}});
    await x.tick();assert.equal(x.state().enabled,true);
  });
  await check('Pause survives polling but a different match auto-starts',async()=>{
    const x=boot(),old=x.match('Public');
    await x.tick();assert.equal(x.state().enabled,true);
    x.hotkey('p');assert.equal(x.state().enabled,false);
    await x.tick();assert.equal(x.state().enabled,false);
    assert.equal(x.state().autoStartGame,old.g);
    x.match('Private');await x.tick();assert.equal(x.state().enabled,true);
  });
  await check('Not-Aus switches auto-start OFF across matches',async()=>{
    const x=boot();x.match();await x.tick();
    x.hotkey('x');assert.equal(x.state().enabled,false);
    assert.equal(x.state().autoStart,false);
    x.match('Private');await x.tick();assert.equal(x.state().enabled,false);
    x.enableAuto();await x.tick();assert.equal(x.state().enabled,true);
  });
  await check('Auto-start disabled by preference',async()=>{
    const x=boot();x.disableAuto();x.match();
    await x.tick();assert.equal(x.state().enabled,false);
  });
  await check('Replay and unknown modes never auto-start',async()=>{
    for(const [type,replay] of [['Public',true],['Unknown',false]]){
      const x=boot();x.match(type,true,replay);await x.tick();
      assert.equal(x.state().enabled,false);
    }
  });
  await check('Game-over stops play; following new match starts',async()=>{
    const x=boot(),m=x.match();await x.tick();
    assert.equal(x.state().enabled,true);
    m.setOver(true);await x.tick();assert.equal(x.state().enabled,false);
    x.match('Private');await x.tick();assert.equal(x.state().enabled,true);
  });
  await check('Advanced sections and auto-start toggle exist in GUI',()=>{
    for(const id of ['features','brain','situation','tuning','diagnostics'])
      assert(source.includes('data-section="'+id+'"'));
    assert(source.includes("b('autoStart',opts.autoStart?"));
    assert(source.includes("for(const detail of panel.querySelectorAll('details[data-section]'))"));
  });
  console.log('PASS total '+pass);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
