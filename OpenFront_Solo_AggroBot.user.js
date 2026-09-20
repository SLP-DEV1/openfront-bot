// ==UserScript==
// @name         OpenFront Solo AggroBot
// @namespace    https://openfront.io/
// @version      1.15.0
// @description  OpenFront autopilot for Singleplayer, Public and Private games; economy, combat, nukes, defense and diplomacy.
// @match        https://openfront.io/*
// @match        https://*.openfront.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__ofSoloAggroBot1111) return;
  window.__ofSoloAggroBot1111 = true;

  const VERSION = '1.15.0', PREFIX = '[Solo AggroBot]', KEY = 'of-solo-aggrobot-v1111';
  const defaults = {enabled:false, autoStart:true, learningEnabled:true, brainEnabled:false, brainToken:'', fullAuto:true, aggressive:85, reserve:35, actionsPerMinute:72,
    economy:true, boats:true, autoSpawn:true, defense:true, stopOnError:false,
    upgrades:true, plan:'Adaptiv', safeMode:true, maxTargets:16, buildStyle:'Ausgewogen',
    autoStrategy:true, diplomacy:true, offerAlliances:true, nukes:true, antiNuke:true, lateOffense:true,
    impossibleMode:true,qwenPolicy:false,neuralEnabled:false};
  let opts;
  try { opts = {...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; }
  catch (_) {opts = {...defaults};}
  try {if(!localStorage.getItem(KEY)){
    opts={...defaults,...JSON.parse(localStorage.getItem('of-solo-aggrobot-v1110')||localStorage.getItem('of-solo-aggrobot-v11010')||localStorage.getItem('of-solo-aggrobot-v1109')||localStorage.getItem('of-solo-aggrobot-v1108')||localStorage.getItem('of-solo-aggrobot-v1107')||localStorage.getItem('of-solo-aggrobot-v1106')||localStorage.getItem('of-solo-aggrobot-v1105')||localStorage.getItem('of-solo-aggrobot-v1104')||localStorage.getItem('of-solo-aggrobot-v1103')||localStorage.getItem('of-solo-aggrobot-v1102')||localStorage.getItem('of-solo-aggrobot-v1101')||localStorage.getItem('of-solo-aggrobot-v1100')||localStorage.getItem('of-solo-aggrobot-v199')||localStorage.getItem('of-solo-aggrobot-v198')||localStorage.getItem('of-solo-aggrobot-v197')||localStorage.getItem('of-solo-aggrobot-v196')||localStorage.getItem('of-solo-aggrobot-v195')||localStorage.getItem('of-solo-aggrobot-v194')||localStorage.getItem('of-solo-aggrobot-v193')||localStorage.getItem('of-solo-aggrobot-v192')||localStorage.getItem('of-solo-aggrobot-v191')||localStorage.getItem('of-solo-aggrobot-v190')||localStorage.getItem('of-solo-aggrobot-v181')||localStorage.getItem('of-solo-aggrobot-v18')||localStorage.getItem('of-solo-aggrobot-v17')||'{}')};
    // Only import user-adjustable preferences, never a previously enabled bot.
  }}catch(_){}
  opts.enabled = false;                         // Start only after a playable match and EventBus are discovered.
  // One-time v1.10 migration: full autonomy includes marine operation;
  // a later manual choice is saved under the new key as usual.
  if(!localStorage.getItem(KEY) && opts.fullAuto)opts.boats=true;
  if(opts.fullAuto)opts.autoStrategy=true;     // Full autonomy includes strategy selection.
  const persist = () => {try {localStorage.setItem(KEY,JSON.stringify(opts));} catch (_) {}};

  // Deployment replaces only the literal below; benchmark loads a signed-by-hash
  // local model from its isolated loopback storage. No browser network fetches.
  const NEURAL_BUNDLED_MODEL = null;
  const NEURAL_LENGTH=90,NEURAL_STORAGE='of-aggrobot-neural-policy-v1';
  let neuralModel=null;
  function neuralValidate(data){
    const old=data?.schema===1&&data.arch==='8x8x2-tanh'&&
      data.weights?.length===NEURAL_LENGTH;
    const actions=data?.schema===2&&data.arch==='12x12x1-tanh'&&
      data.weights?.length===169;
    if((!old&&!actions)||!Array.isArray(data.weights)||
      data.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>5))
      return null;
    return data;
  }
  try{
    const local=['localhost','127.0.0.1','[::1]'].includes(window.location?.hostname)&&
      window.__OF_BENCHMARK_CONFIG__?.enabled===true;
    neuralModel=neuralValidate(local?
      JSON.parse(localStorage.getItem(NEURAL_STORAGE)||'null'):
      NEURAL_BUNDLED_MODEL);
  }catch(_){neuralModel=null;}
  function neuralAdjust(v,base,me,s,items,emergency){
    if(!opts.neuralEnabled||!opts.fullAuto||neuralModel?.schema!==1||emergency||
      s.incoming>0||recentHostilePressure(number(()=>game.ticks(),0))||
      s.strongest>s.home*1.25)return v;
    const home=Math.max(1,s.home),cap=Math.max(1,s.max);
    const features=[
      clamp(home/cap,0,1.5)/1.5,
      clamp(s.incoming/home,0,2)/2,
      clamp(s.strongest/home,0,3)/3,
      clamp(s.committed/home,0,2)/2,
      items.some(x=>x.id===null&&!x.fallout)?1:0,
      clamp(items.filter(x=>x.id!==null).length/8,0,1),
      clamp(number(()=>me.numTilesOwned(),0)/20000,0,1),
      lateGame(me)?1:0];
    const w=neuralModel.weights,h=[];
    for(let j=0;j<8;j++){
      let z=w[64+j];
      for(let i=0;i<8;i++)z+=features[i]*w[i*8+j];
      h.push(Math.tanh(z));
    }
    const out=[];
    for(let k=0;k<2;k++){
      let z=w[88+k];
      for(let j=0;j<8;j++)z+=h[j]*w[72+j*2+k];
      out.push(Math.tanh(z));
    }
    // Baseline-relative bounds prevent stacked learning/Brain/NN adjustments
    // from bypassing reserves. Military and worker legality still recheck.
    return {...v,
      aggressive:clamp(v.aggressive+Math.round(out[0]*8),base.aggressive-8,base.aggressive+8),
      reserve:clamp(v.reserve+Math.round(out[1]*8),base.reserve-8,base.reserve+8)};
  }
  // Schema 2 re-ranks ONLY candidates already admitted by the original
  // planner; legalTarget(), worker actions, reserve and alliance rechecks
  // retain complete authority. No direct AI-generated game intents.
  function neuralActionDelta(kind,score,me,s=troopSnapshot) {
    if(!opts.neuralEnabled||!opts.fullAuto||neuralModel?.schema!==2||
      s.incoming>0||recentHostilePressure(number(()=>game.ticks(),0))||
      s.strongest>Math.max(1,s.home)*1.25)return 0;
    const kinds=['attack','economy','naval'],index=kinds.indexOf(kind);
    if(index<0)return 0;
    const home=Math.max(1,s.home),max=Math.max(1,s.max);
    const vector=[
      clamp(home/max,0,1.5)/1.5,
      clamp(s.incoming/home,0,2)/2,
      clamp(s.strongest/home,0,3)/3,
      clamp(s.committed/home,0,2)/2,
      clamp(number(()=>Number(me.gold()),0)/1000000,0,1),
      clamp(number(()=>me.numTilesOwned(),0)/20000,0,1),
      lateGame(me)?1:0,
      strategic.groups.some(x=>x.id===null&&!x.fallout)?1:0,
      ...kinds.map((_,i)=>i===index?1:0),
      clamp(score,-150,150)/150
    ];
    const w=neuralModel.weights,h=[];
    for(let j=0;j<12;j++){
      let z=w[144+j];
      for(let i=0;i<12;i++)z+=vector[i]*w[i*12+j];
      h.push(Math.tanh(z));
    }
    let z=w[168];
    for(let j=0;j<12;j++)z+=h[j]*w[156+j];
    return Math.tanh(z)*14;
  }
  // Hybrid learning: bounded contextual adjustments; keep existing combat safety checks.
  const LEARN_KEY='of-aggrobot-learning-v1';
  let learn={schema:1,contexts:{},updates:0,lastResult:null};
  let learnMatch={sample:null,key:null,finished:false};
  try {
    const saved=JSON.parse(localStorage.getItem(LEARN_KEY)||'null');
    if(saved?.schema===1&&saved.contexts&&typeof saved.contexts==='object'){
      for(const [k,x] of Object.entries(saved.contexts).slice(0,48))
        if(/^(BALANCED|EXPAND|ASSAULT|RECOVER|ECONOMY|TECH|LATE):(SAFE|THREAT)$/.test(k)&&
          Number.isInteger(x?.n)&&x.n>=0&&x.n<=100000&&Number.isFinite(x?.mean)&&Math.abs(x.mean)<=1)
          learn.contexts[k]={n:x.n,mean:x.mean};
      learn.updates=Math.max(0,Math.min(1000000,Math.floor(Number(saved.updates)||0)));
      learn.lastResult=['victory','defeat'].includes(saved.lastResult)?saved.lastResult:null;
    }
  }catch(_){}
  function saveLearn(){try{localStorage.setItem(LEARN_KEY,JSON.stringify(learn));}catch(_){}}
  function learnKey(mode,s){
    return /^(BALANCED|EXPAND|ASSAULT|RECOVER|ECONOMY|TECH|LATE)$/.test(mode)?
      mode+':'+(s.incoming>0||s.strongest>Math.max(1,s.home)*1.1?'THREAT':'SAFE'):null;
  }
  function learnObserve(tick,me,s,mode){
    if(!opts.learningEnabled||!opts.fullAuto||!me?.hasSpawned?.()||!me?.isAlive?.())return;
    const key=learnKey(mode,s);if(!key)return;
    const now={tick,land:number(()=>me.numTilesOwned(),0),troops:number(()=>me.troops(),0),max:Math.max(1,s.max)};
    const prev=learnMatch.sample;
    if(prev&&tick-prev.tick>=240){
      // Progress proxy, NOT causal credit for a specific attack.
      const reward=clamp(.75*(now.land-prev.land)/Math.max(100,prev.land)+
        .25*(now.troops-prev.troops)/Math.max(1,prev.max),-1,1);
      if(learnMatch.key){
        const old=learn.contexts[learnMatch.key]||{n:0,mean:0};
        const n=Math.min(100000,old.n+1),mean=clamp(old.mean+(reward-old.mean)/Math.min(n,100),-1,1);
        learn.contexts[learnMatch.key]={n,mean};learn.updates++;
        if(learn.updates%8===0)saveLearn();
        telemetry('learning_update','Strategie-Erfahrung',{context:learnMatch.key,reward,samples:n,mean});
      }
      learnMatch.sample=now;learnMatch.key=key;
    }else if(!prev){learnMatch.sample=now;learnMatch.key=key;}
  }
  function learnAdjust(v,mode,s,emergency){
    if(!opts.learningEnabled||!opts.fullAuto||emergency)return v;
    const memory=learn.contexts[learnKey(mode,s)];
    if(!memory||memory.n<3)return v;
    const signal=clamp(memory.mean*Math.min(1,(memory.n-2)/15),-1,1);
    return {...v,aggressive:clamp(v.aggressive+Math.round(signal*5),40,100),
      reserve:clamp(v.reserve-Math.round(signal*4),18,65)};
  }
  function learnFinish(outcome){
    if(learnMatch.finished)return;
    learnMatch.finished=true;
    if(!opts.learningEnabled||!['victory','defeat'].includes(outcome))return;
    learn.lastResult=outcome;saveLearn();
  }


  // Optional localhost Brain advisory. The page remains the only issuer of game intents.
  // No network traffic unless explicitly enabled; no grants that isolate page GameView.
  const BRAIN_URL='http://127.0.0.1:8765';
  let brainMatchId='match-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*0xffffffff).toString(36).padStart(8,'0');
  let brainSeq=0,brainLastTick=-Infinity,brainLastSampleTick=-Infinity,brainBusy=false,brainBackoff=0;
  let brainState={status:'Aus',advice:null,receivedTick:-Infinity,lastError:null,qwen:null};
  function brainReady(){
    return opts.brainEnabled&&opts.learningEnabled&&opts.fullAuto&&opts.enabled&&
      typeof fetch==='function'&&typeof opts.brainToken==='string'&&opts.brainToken.length>=24;
  }
  function brainAdjust(v,base,mode,s,emergency){
    const advice=brainState.advice,key=learnKey(mode,s);
    if(!brainReady()||emergency||!advice||advice.context!==key||
      brainState.receivedTick<0||number(()=>game.ticks(),Infinity)-brainState.receivedTick>480)return v;
    // Hard bound is relative to the UNLEARNED baseline: local + Brain cannot stack unboundedly.
    return {...v,aggressive:clamp(v.aggressive+advice.aggressiveDelta,base.aggressive-5,base.aggressive+5),
      reserve:clamp(v.reserve+advice.reserveDelta,base.reserve-4,base.reserve+4)};
  }
  function brainSend(tick,me,s){
    // Training samples are emitted in normal benchmark runs WITHOUT localhost access.
    if(opts.fullAuto&&opts.learningEnabled&&tick-brainLastSampleTick>=240){
      brainLastSampleTick=tick;
      telemetry('brain_sample','Aggregierter Strategie-Zustand',
        {brainMode:autoTuning.mode,maxTroops:Math.max(1,s.max),strongest:Math.max(0,s.strongest)});
    }
    if(!opts.brainEnabled)return;
    if(!opts.brainToken||opts.brainToken.length<24){brainState.status='Token fehlt';return;}
    if(typeof fetch!=='function'){brainState.status='fetch nicht verfügbar';return;}
    if(!brainReady()||brainBusy||tick-brainLastTick<240||Date.now()<brainBackoff)return;
    const mode=autoTuning.mode;if(!learnKey(mode,s))return;
    brainLastTick=tick;brainBusy=true;
    const seq=++brainSeq,matchId=brainMatchId;
    const payload={schema:1,matchId,seq,tick,mode,land:number(()=>me.numTilesOwned(),0),
      home:number(()=>me.troops(),0),max:Math.max(1,s.max),incoming:Math.max(0,s.incoming),
      strongest:Math.max(0,s.strongest)};
    brainState.status='Verbinde …';
    const controller=typeof AbortController==='function'?new AbortController():null;
    const timeout=controller?setTimeout(()=>controller.abort(),1600):null;
    fetch(BRAIN_URL+'/v1/observe',{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
      headers:{'Content-Type':'application/json','X-Aggrobot-Token':opts.brainToken},
      body:JSON.stringify(payload),signal:controller?.signal}).then(async response=>{
        if(!response.ok)throw Error('HTTP '+response.status);
        const data=await response.json();
        if(data?.schema!==1||data.matchId!==matchId||data.seq!==seq||
          !/^([A-Z]+):(SAFE|THREAT)$/.test(data.context||'')||
          !Number.isInteger(data.aggressiveDelta)||Math.abs(data.aggressiveDelta)>5||
          !Number.isInteger(data.reserveDelta)||Math.abs(data.reserveDelta)>4||
          !Number.isInteger(data.samples)||data.samples<0)
          throw Error('Ungültige Brain-Antwort');
        if(matchId!==brainMatchId||!opts.brainEnabled)return;
        const q=data.qwen,allowedKinds=['periodic','stagnation','threat'];
        const validatedQwen=q&&q.matchId===brainMatchId &&
          Number.isSafeInteger(q.tick)&&q.tick>=0&&q.tick<=tick &&
          tick-q.tick<=480&&allowedKinds.includes(q.kind) &&
          ['DEFEND','ECONOMY','EXPAND'].includes(q.strategy) &&
          ['THREAT','STAGNATION','RESOURCE','EXPANSION','OTHER'].includes(q.reasonCode)?
          {matchId:q.matchId,tick:q.tick,kind:q.kind,
            strategy:q.strategy,reasonCode:q.reasonCode}:null;
        brainState={status:'Verbunden · '+data.samples+' Erfahrungen',
          advice:{context:data.context,aggressiveDelta:data.aggressiveDelta,
            reserveDelta:data.reserveDelta},receivedTick:tick,lastError:null,
          qwen:validatedQwen};
      }).catch(e=>{
        if(matchId!==brainMatchId)return;
        brainState={status:'Offline · lokaler Bot aktiv',advice:null,
          receivedTick:-Infinity,lastError:String(e?.message||e).slice(0,90)};
        brainBackoff=Date.now()+12000;
      }).finally(()=>{if(timeout!==null)clearTimeout(timeout);brainBusy=false;});
  }
  function brainFinish(outcome){
    if(!opts.brainEnabled||!opts.brainToken||typeof fetch!=='function'||brainSeq===0)return;
    if(!['victory','defeat','unknown','incomplete'].includes(outcome))return;
    fetch(BRAIN_URL+'/v1/finish',{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
      headers:{'Content-Type':'application/json','X-Aggrobot-Token':opts.brainToken},
      body:JSON.stringify({matchId:brainMatchId,outcome}),keepalive:true}).catch(()=>{});
  }

  const escapeHTML = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (n,a,b) => Math.min(b,Math.max(a,Number.isFinite(+n)?+n:a));
  const number = (fn, fallback=0) => {try {const n=Number(fn());return Number.isFinite(n)?n:fallback;}catch(_){return fallback;}};
  const nameOf = p => {try{return p.displayName?.() || p.name?.() || String(p.id());}catch(_){return '?';}};
  const safeID = p => {try{return p.id();}catch(_){return null;}};
  // OpenFront AttackUpdate.targetID/attackerID are numeric smallIDs.
  // The bot keeps warState, pendingAttack and other targets as PlayerID strings.
  function attackTargetPlayer(targetID){
    if(typeof targetID==='number'&&Number.isInteger(targetID)&&targetID>0){
      try{
        const player=game?.playerBySmallID?.(targetID);
        if(player)return player;
      }catch(_){}
      try{return game?.playerViews?.().find(p=>p?.smallID?.()===targetID)||null;}
      catch(_){return null;}
    }
    if(typeof targetID==='string'){
      try{return game?.playerViews?.().find(p=>safeID(p)===targetID)||null;}
      catch(_){return null;}
    }
    return null;
  }
  function attackTargetID(targetID){
    if(targetID===null||targetID===0)return null;
    if(typeof targetID==='string')return targetID; // Older client/test compatibility.
    return safeID(attackTargetPlayer(targetID));
  }
  function attackTargets(targetID,playerOrID){
    if(playerOrID===null)return targetID===null||targetID===0;
    const id=typeof playerOrID==='object'?safeID(playerOrID):playerOrID;
    return id!==null&&attackTargetID(targetID)===id;
  }
  let game=null, bus=null, ctors={}, panel=null, busy=false, generation=0;
  let winnerBus=null,winnerCtor=null,winnerHandler=null,lastWinnerSignal=null;
  const INTENT_KINDS=['spawn','attack','cancel','boat','build','upgrade','alliance','reject'];
  const CORE_INTENTS=['spawn','attack','build'];
  let lastIntentHealth=null,lastIntentProbe=-Infinity,missingIntentLogged=new Set();
  let lastTick=-1, lastSpawn=-Infinity, lastEconomy=-Infinity, lastEconomyProbe=-Infinity;
  let lastBoat=-Infinity, lastBorderTick=-Infinity, borderCache=null, borderPlayer=null;
  let buildCursor=0, spawnCache=null, spawnJob=null, spawnRetryAt=0, spawnAlternatives=[], spawnState={scanned:0,phase:'idle',lastSent:null,attempts:0,blocked:null,deadline:null}, status='Warte auf Spiel';
  let plan=null, rejected=new Map(), lastEmission=0, lastSelection='';
  let totalSent=0, totalFailed=0;
  let borderOffset=0, lastBorderRefresh=0, lastPlanTick=-Infinity;
  let recent=[], actions=[], cooldowns=new Map(), lastPaint=0, errors=0;
  let troopSamples=[], lastRecoveryReason='', lastBattle=null, blockedTargets=new Map();
  let troopSnapshot={home:0,max:0,committed:0,incoming:0,enemy:0,ratio:0,reserve:0,available:0};
  let lastEconomicAction=-Infinity, lastNeutralSend=-Infinity, lastEnemySend=-Infinity,lastHostilePressure=-Infinity;
  let consecutiveIdle=0;
  let economicPending=null, economicBlocked=new Map(), economicNegative=new Map(), economicStatus='Bauplanung bereit', economicLastPlan='—';
  let economyBusy=false, borderInflight=null, legalNegative=new Map();
  let runtime={borderMs:0,combatMs:0,economyMs:0,attackProbes:0,buildProbes:0};
  let strategic={mode:'EXPAND',reason:'Startphase',buildStyle:'Ausgewogen',since:-Infinity,groups:[]};
  let diplomacyHandled=new Map(),lastDiplomacyTick=-Infinity,lastProposalTick=-Infinity;
  let diplomacyStatus='Noch keine Anfrage', diplomacyStats={accepted:0,rejected:0,offered:0};
  let diplomacyPending=new Map(),lastDiplomaticEmit=0,diplomacyMissingLogged=new Set();
  let goldSamples=[],incomeStatus={train:null,trade:null,gold:null,observed:false};
  let winStatus={mode:'FFA',progress:null,threshold:null,remaining:null,urgent:false};
  let fleetStatus='Keine Marineaktivität',lastFleet=-Infinity,lastDonation=-Infinity,navalSweep=0;
  let pendingBoat=null,pendingWarship=null,navalCooldown=new Map(),navalBackoffUntil=-Infinity,portProbeFailures=0,lastPortRetryTick=-Infinity,navalSiteNegative=new Map();
  let marineStats={transportSent:0,transportConfirmed:0,transportArrived:0,
    transportUnconfirmed:0,transportUnresolved:0,warshipSent:0,
    warshipConfirmed:0,warshipUnconfirmed:0};
  let strategicTelemetry={favorableVictims:0,falloutSkipped:0,falloutFallback:0,afkTargets:0,assists:0,neutralLandings:0,forecastCount:0,
    engineForecasts:0,proxyForecasts:0,forecastComparisons:0,forecastUnavailable:0};
  let nukeBusy=false, lastNuke=-Infinity, nukePending=null, nukeStatus='Warte auf Silo', nukeShots=0,nukeAttempts=0,nukeUnconfirmed=0;
  let nuclearCache=null, nuclearCacheTick=-Infinity;
  let warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};
  let diagnostics=[],lastDiagnosticTick=-Infinity,gameEnd=null;
  let pendingAttack=null,attackReceipts={confirmed:0,unconfirmed:0,territoryGained:0};
  let forecastAudits=[],lastForecastAudit=null,incomeAttribution=[];
  let failedEconomyProbes=0,successfulEconomyTick=-Infinity,warWaitSince=-Infinity;
  let investmentStatus='Grundaufbau',lastWarReview=-Infinity;
  let defenseStatus='Keine Bedrohung',lastEmergencyRetreat=-Infinity,lastDefenseLog=-Infinity;
  let targetIntelCache=new Map(),frontMemory=new Map(),lastFrontWarning=-Infinity;
  let retreatRequests=new Map(),defenseStats={retreatsOrdered:0,retreatsObserved:0,unknown:0,unconfirmed:0};
  // Manual slider values remain saved; fullAuto computes independent live values.
  let autoTuning={aggressive:85,reserve:35,actionsPerMinute:72,maxTargets:16,
    mode:'INIT',reason:'Warte auf Spielzustand',tick:-Infinity};
  const hardMode=()=>opts.impossibleMode && game?.config?.().gameConfig?.().difficulty==='Impossible';
  // Keep single-front coordination in Public/Medium as well as Impossible.
  // Difficulty-specific troop ratios remain tied to actual difficulty.
  const coordinatedWar=()=>opts.impossibleMode;
  const isWar=()=>warState.id!==null;
  // Test control exists only on loopback and only after explicit harness opt-in.
  const benchmark = ['localhost','127.0.0.1','[::1]'].includes(window.location?.hostname) &&
    window.__OF_BENCHMARK_CONFIG__?.enabled===true ? window.__OF_BENCHMARK_CONFIG__ : null;
  let recordSequence=0,recordCounts={},recordsDropped=0,streamErrors=0;
  const jsonCopy=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
  function telemetry(kind,message,extra={}) {
    if(!opts.enabled || !permittedMatch(game))return;
    let m=myPlayer(),tick=number(()=>game.ticks(),0);
    // Freeze each historical snapshot; otherwise shared mutable metrics can
    // make every old record appear to contain the latest values.
    let frozen=extra;
    if(kind==='snapshot'){
      try{frozen=JSON.parse(JSON.stringify(extra,(_,v)=>
        typeof v==='bigint'?v.toString():v));}
      catch(_){frozen={snapshotError:'Daten konnten nicht eingefroren werden'};}
    }
    const record={...frozen,detailKind:frozen.kind,seq:++recordSequence,time:new Date().toISOString(),tick,kind,message,mode:strategic.mode,
      warTarget:warState.name,home:number(()=>m?.troops?.()),gold:number(()=>Number(m?.gold?.())),
      land:number(()=>m?.numTilesOwned?.()),committed:troopSnapshot.committed,
      incoming:troopSnapshot.incoming};
    diagnostics.push(record);
    recordCounts[kind]=(recordCounts[kind]||0)+1;
    if(benchmark && typeof benchmark.onRecord==='function'){
      try{benchmark.onRecord(jsonCopy(record));}catch(_){streamErrors++;}
    }
    if(diagnostics.length>1400){
      const dropped=diagnostics.length-1400;recordsDropped+=dropped;
      diagnostics.splice(0,dropped);
    }
  }
  function gameOutcome(g,me){
    const result={outcome:'unknown',source:'gameOver',tick:number(()=>g?.ticks?.(),-1),
      alive:me?.isAlive?.()??null,land:number(()=>me?.numTilesOwned?.(),0),
      progress:winStatus.progress,mode:winStatus.mode};
    // The official GameView.gameOver() only says a WinUpdate was observed;
    // the official winner tuple carries the actual player/team outcome.
    try{
      const updates=g?.updatesSinceLastTick?.();
      const current=Object.values(updates||{}).flat().find(u=>
        u && typeof u==='object' && Object.hasOwn(u,'winner') &&
        Object.hasOwn(u,'allPlayersStats'));
      const win=lastWinnerSignal||current;
      if(win){
        const winner=win.winner;
        result.source='WinUpdate';
        result.winnerType=Array.isArray(winner)?winner[0]:null;
        result.winnerNames=Array.isArray(winner)&&winner[0]==='team'?
          [String(winner[1])]:[];
        if(winner===null||winner===undefined)result.outcome='incomplete';
        else if(Array.isArray(winner)&&['player','team','nation'].includes(winner[0])){
          const ids=winner.slice(winner[0]==='player'?1:2);
          // Winner tuples contain ClientID, not PlayerID or numeric smallID.
          const clientID=me?.clientID?.();
          if(typeof clientID==='string'&&clientID.length)
            result.outcome=winner[0]==='nation'?'defeat':ids.includes(clientID)?'victory':'defeat';
        }
      }
    }catch(_){}
    return result;
  }
  function diagnosticSnapshot() {
    const config=game?.config?.().gameConfig?.()||{};
    const details={bot:VERSION,brain:{enabled:!!opts.brainEnabled,status:brainState.status,advice:brainState.advice,receivedTick:brainState.receivedTick,lastError:brainState.lastError},learning:{enabled:!!opts.learningEnabled,updates:learn.updates,contexts:jsonCopy(learn.contexts),lastResult:learn.lastResult},gameType:config.gameType,
      difficulty:config.difficulty,
      benchmarkMeta:{gameMap:config.gameMap??null,
        gameMapSize:config.gameMapSize??null,gameMode:config.gameMode??null,
        seed:config.seed??null,engineCommit:window.BOOTSTRAP_CONFIG?.gitCommit??null,
        matchEndObserved:gameEnd!==null,resultsVerifiedByBrowser:false},
      options:{...opts,brainToken:opts.brainToken?'[redacted]':'',enabled:false},intents:intentHealth(),tuning:{...autoTuning,enabled:!!opts.fullAuto,
        effective:{aggressive:setting('aggressive'),reserve:setting('reserve'),
          actionsPerMinute:setting('actionsPerMinute'),maxTargets:setting('maxTargets')}},attackReceipts, pendingAttack,
      construction:{pending:economicPending,blocked:[...economicBlocked.entries()],failedProbes:failedEconomyProbes,lastConfirmed:successfulEconomyTick,investment:investmentStatus},
      validation:{forecastAudits,incomeAttribution,
        terrainMethod:'nuke-cubic-bezier-conservative',
        railMethod:'owned-land-corridor-proxy',
        fullBrowserMatchValidated:false,
        note:'Die Datei ist ein Spielmitschnitt; Sieg und echte Mehrkarten-Benchmarks erfordern vollständige Browser-Matches.'},
      war:{...warState},gameEnd,spawn:{...spawnState,best:spawnCache?{...spawnCache}:null},victory:winStatus,income:incomeStatus,fleet:fleetStatus,marine:{stats:marineStats,pendingBoat,pendingWarship,portProbeFailures},strategicTelemetry,military:troopSnapshot,
      defense:{status:defenseStatus,stats:defenseStats,pendingRetreats:[...retreatRequests.values()]},
      rockets:{confirmed:nukeShots,attempts:nukeAttempts,unconfirmed:nukeUnconfirmed,pending:nukePending},
      diplomacy:{status:diplomacyStatus,stats:diplomacyStats,pending:[...diplomacyPending.values()]},records:diagnostics,createdAt:new Date().toISOString()};
    details.recording={total:recordSequence,counts:{...recordCounts},dropped:recordsDropped,
      firstSequence:diagnostics[0]?.seq??null,streamErrors};
    return jsonCopy(details);
  }
  function exportDiagnostics() {
    const details=diagnosticSnapshot();
    const blob=new Blob([JSON.stringify(details,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='OpenFront_AggroBot_'+VERSION+'_Diagnose.json';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }


  const log = message => {recent.unshift(message);recent=recent.slice(0,7);console.info(PREFIX,message);telemetry('decision',message);};
  const gameType = g => {
    try{return g?.config?.().gameConfig?.().gameType ?? null;}catch(_){return null;}
  };
  const multiplayerMatch = g => ['Public','Private'].includes(gameType(g));
  // Allow every known playable OpenFront game type without a second opt-in.
  // Fail closed for unknown modes and recorded replays.
  const permittedMatch = g => {
    try{return !!g && !g.config().isReplay?.() &&
      ['Singleplayer','Public','Private'].includes(gameType(g));}
    catch(_){return false;}
  };
  const conflicts = () => !!(window.__ofSoloAggroBot1110 || window.__ofSoloAggroBot11010 || window.__ofSoloAggroBot1109 || window.__ofSoloAggroBot1108 || window.__ofSoloAggroBot1 || window.__ofSoloAggroBot11 || window.__ofSoloAggroBot12 || window.__ofSoloAggroBot13 || window.__ofSoloAggroBot14 || window.__ofSoloAggroBot15 || window.__ofSoloAggroBot16 || window.__ofSoloAggroBot17 || window.__ofSoloAggroBot18 || window.__ofSoloAggroBot181 || window.__ofSoloAggroBot190 || window.__ofSoloAggroBot191 || window.__ofSoloAggroBot192 || window.__ofSoloAggroBot193 || window.__ofSoloAggroBot194 || window.__ofSoloAggroBot195 || window.__ofSoloAggroBot196 || window.__ofSoloAggroBot197 || window.__ofSoloAggroBot198 || window.__ofSoloAggroBot199 || window.__ofSoloAggroBot1100 || window.__ofSoloAggroBot1101 || window.__ofSoloAggroBot1102 || window.__ofSoloAggroBot1103 || window.__ofSoloAggroBot1104 || window.__ofSoloAggroBot1105 || window.__ofSoloAggroBot1106 || window.__ofSoloAggroBot1107);
  function advisorConflict() {
    if (!window.__openfrontSpawnAdvisorV104) return false;
    try {const s=JSON.parse(localStorage.getItem('openfront-spawn-advisor-10.4')||'{}');
      return s.auto!==false || s.smart===true || s.accept===true;
    } catch (_) {return true;}
  }
  const connected = () => permittedMatch(game) && !game?.gameOver?.() && !conflicts() && !advisorConflict() && bus && typeof bus.emit==='function';
  const myPlayer = () => {try{return game?.myPlayer?.() || null;}catch(_){return null;}};
  const live = serial => serial===generation && opts.enabled && connected();
  function discover() {
    const tags=['spawn-timer','build-menu','control-panel','unit-display','game-left-sidebar','game-right-sidebar'];
    for(const tag of tags) {
      const element=document.querySelector(tag), g=element?.game;
      if(!g || typeof g.playerViews!=='function' || typeof g.terrainByte!=='function' ||
         typeof g.ref!=='function' || typeof g.config!=='function') continue;
      let b=element.eventBus;
      if(!b) for(const otherTag of tags) {
        const other=document.querySelector(otherTag);
        if(other?.game===g && other.eventBus){b=other.eventBus;break;}
      }
      return {g,b:b||null};
    }
    return null;
  }
  // We only inspect event constructors; no test event is emitted into the game.
  function recognize(b) {
    const result={};
    // EventBus may come from another JS realm; instanceof Map is unreliable
    // for Tampermonkey / VM-wrapped constructors. Inspect its interface instead.
    if(!b?.listeners || typeof b.listeners.keys!=='function')return result;
    const names={spawn:'SendSpawnIntentEvent',attack:'SendAttackIntentEvent',cancel:'CancelAttackIntentEvent',
      boat:'SendBoatAttackIntentEvent',build:'BuildUnitIntentEvent',
      upgrade:'SendUpgradeStructureIntentEvent',
      alliance:'SendAllianceRequestIntentEvent',reject:'SendAllianceRejectIntentEvent',
      warship:'MoveWarshipIntentEvent',cancelBoat:'CancelBoatIntentEvent',
      donateTroops:'SendDonateTroopsIntentEvent',donateGold:'SendDonateGoldIntentEvent',
      extend:'SendAllianceExtensionIntentEvent',winnerSignal:'SendWinnerEvent'};
    const possibilities=Object.fromEntries(Object.keys(names).map(k=>[k,[]]));
    for(const C of b.listeners.keys()) {
      if(typeof C!=='function') continue;
      for(const [key,n] of Object.entries(names)) if(C.name===n) result[key]=C;
      try {const o=new C(4812);if(o?.tile===4812 && Object.keys(o).length===1) possibilities.spawn.push(C);}catch(_){}
      try {const o=new C('__BOT_PROBE__',4812);if(o?.targetID==='__BOT_PROBE__' && o?.troops===4812) possibilities.attack.push(C);}catch(_){}
      try {const o=new C('__BOT_CANCEL__');if(o?.attackID==='__BOT_CANCEL__' && Object.keys(o).length===1)possibilities.cancel.push(C);}catch(_){}
      try {const o=new C(4812,1824);if(o?.dst===4812 && o?.troops===1824) possibilities.boat.push(C);}catch(_){}
      try {const o=new C('City',4812);if(o?.unit==='City' && o?.tile===4812) possibilities.build.push(C);}catch(_){}
      try {const o=new C(4812,'City',1);if(o?.unitId===4812 && o?.unitType==='City') possibilities.upgrade.push(C);}catch(_){}
      const probeA={id(){return '__OF_BOT_A__';}},probeB={id(){return '__OF_BOT_B__';}};
      try {const o=new C(probeA,probeB);if(o?.requestor===probeA && o?.recipient===probeB &&
        Object.keys(o).length===2)possibilities.alliance.push(C);}catch(_){}
      try {const o=new C(probeA);if(o?.requestor===probeA && Object.keys(o).length===1)
        possibilities.reject.push(C);}catch(_){}
      try {const o=new C([4812],1824);if(o?.tile===1824&&o?.unitIds?.[0]===4812)
        possibilities.warship.push(C);}catch(_){}
      try {const o=new C(4812);if(o?.unitID===4812&&Object.keys(o).length===1)
        possibilities.cancelBoat.push(C);}catch(_){}
      try {const o=new C(probeA,4812);if(o?.recipient===probeA&&o?.troops===4812)
        possibilities.donateTroops.push(C);}catch(_){}
      try {const o=new C(probeA,4812n);if(o?.recipient===probeA&&o?.gold===4812n)
        possibilities.donateGold.push(C);}catch(_){}
      try {const o=new C(probeB);if(o?.recipient===probeB&&Object.keys(o).length===1)
        possibilities.extend.push(C);}catch(_){}
    }
    for(const k of Object.keys(possibilities)) if(!result[k] && possibilities[k].length===1)
      result[k]=possibilities[k][0];
    return result;
  }
  function bindWinnerCapture(nextBus,nextCtors=ctors){
    if(winnerBus&&winnerCtor&&winnerHandler&&typeof winnerBus.off==='function'){
      try{winnerBus.off(winnerCtor,winnerHandler);}catch(_){}
    }
    winnerBus=null;winnerCtor=null;winnerHandler=null;
    const C=nextCtors?.winnerSignal;
    if(!nextBus||typeof nextBus.on!=='function'||typeof C!=='function')return false;
    winnerHandler=event=>{
      if(!event||!Object.hasOwn(event,'winner'))return;
      lastWinnerSignal={winner:event.winner,allPlayersStats:event.allPlayersStats||{}};
      telemetry('winner_observed','Siegerereignis dauerhaft erfasst',
        {winnerType:Array.isArray(event.winner)?event.winner[0]:null});
    };
    try{nextBus.on(C,winnerHandler);winnerBus=nextBus;winnerCtor=C;return true;}
    catch(_){winnerHandler=null;return false;}
  }
  function intentHealth() {
    const missing=INTENT_KINDS.filter(kind=>typeof ctors[kind]!=='function');
    return {found:INTENT_KINDS.length-missing.length,total:INTENT_KINDS.length,
      missing,critical:missing.filter(kind=>CORE_INTENTS.includes(kind)),
      eventBus:!!bus};
  }
  // Report only when detection changes or the user explicitly starts.
  function reportIntents(force=false) {
    if(!bus)return intentHealth();
    const health=intentHealth(),signature=health.missing.join(',');
    if(force||signature!==lastIntentHealth){
      lastIntentHealth=signature;
      const message=health.found+'/'+health.total+' Intents erkannt'+
        (health.missing.length?' · fehlen: '+health.missing.join(', '):' · vollständig');
      if(health.missing.length)console.warn(PREFIX,'INTENT-WARNUNG: '+message);
      else console.info(PREFIX,message);
      if(opts.enabled){
        telemetry(health.missing.length?'intent_missing':'intent_ready',message,
          {intents:health});
        if(health.critical.length)log('ACHTUNG: Pflicht-Intents fehlen: '+health.critical.join(', '));
      }
    }
    return health;
  }
  let autoStartGame=null;
  function maybeAutoStart() {
    // One attempt per game object: manual pause and Not-Aus must not be undone
    // by the next 400-ms polling cycle. A new match clears this latch.
    if(benchmark || !opts.autoStart || opts.enabled || autoStartGame===game || !connected())return false;
    autoStartGame=game;
    opts.enabled=true;generation++;persist();
    status='Neue '+(multiplayerMatch(game)?'Multiplayer-':'Singleplayer-')+'Partie · Bot automatisch gestartet';
    log('BOT AUTO-START · '+gameType(game));
    reportIntents(true);
    return true;
  }
  function reset(g,b) {
    generation++; game=g;bus=b;ctors=recognize(b);busy=false;lastWinnerSignal=null;
    autoStartGame=null;
    bindWinnerCapture(bus,ctors);
    lastIntentHealth=null;lastIntentProbe=-Infinity;missingIntentLogged.clear();
    lastTick=-1;lastSpawn=-Infinity;lastEconomy=-Infinity;lastEconomyProbe=-Infinity;
    lastBoat=-Infinity;lastBorderTick=-Infinity;borderCache=null;borderPlayer=null;
    buildCursor=0;spawnCache=null;spawnJob=null;spawnRetryAt=0;spawnAlternatives=[];spawnState={scanned:0,phase:'idle',lastSent:null,attempts:0,blocked:null,deadline:null};cooldowns.clear();rejected.clear();
    plan=null;lastSelection='';lastEmission=0;borderOffset=0;lastBorderRefresh=0;
    totalSent=0;totalFailed=0;actions=[];errors=0;troopSamples=[];
    lastRecoveryReason='';lastBattle=null;pendingAttack=null;targetIntelCache.clear();frontMemory.clear();lastFrontWarning=-Infinity;
    attackReceipts={confirmed:0,unconfirmed:0,territoryGained:0};blockedTargets.clear();
    failedEconomyProbes=0;successfulEconomyTick=-Infinity;warWaitSince=-Infinity;
    lastEconomicAction=-Infinity;lastNeutralSend=-Infinity;lastEnemySend=-Infinity;lastHostilePressure=-Infinity;consecutiveIdle=0;
    economicPending=null;economicBlocked.clear();economicNegative.clear();economicStatus='Bauplanung bereit';economicLastPlan='—';
    economyBusy=false;borderInflight=null;legalNegative.clear();runtime={borderMs:0,combatMs:0,economyMs:0,attackProbes:0,buildProbes:0};
    strategic={mode:'EXPAND',reason:'Startphase',buildStyle:'Ausgewogen',since:-Infinity,groups:[]};
    diplomacyHandled.clear();diplomacyPending.clear();diplomacyMissingLogged.clear();lastDiplomaticEmit=0;
    lastDiplomacyTick=-Infinity;lastProposalTick=-Infinity;diplomacyStatus='Noch keine Anfrage';
    diplomacyStats={accepted:0,rejected:0,offered:0};goldSamples=[];incomeStatus={train:null,trade:null,gold:null,observed:false};
    winStatus={mode:'FFA',progress:null,threshold:null,remaining:null,urgent:false};fleetStatus='Keine Marineaktivität';lastFleet=-Infinity;lastDonation=-Infinity;navalSweep=0;
    pendingBoat=null;pendingWarship=null;navalCooldown.clear();navalBackoffUntil=-Infinity;portProbeFailures=0;lastPortRetryTick=-Infinity;navalSiteNegative.clear();
    marineStats={transportSent:0,transportConfirmed:0,transportArrived:0,
      transportUnconfirmed:0,transportUnresolved:0,warshipSent:0,
      warshipConfirmed:0,warshipUnconfirmed:0};
    strategicTelemetry={favorableVictims:0,falloutSkipped:0,falloutFallback:0,afkTargets:0,assists:0,neutralLandings:0,forecastCount:0,engineForecasts:0,proxyForecasts:0,forecastComparisons:0,forecastUnavailable:0};
    nukeBusy=false;lastNuke=-Infinity;nukePending=null;nukeStatus='Warte auf Silo';nukeShots=0;nukeAttempts=0;nukeUnconfirmed=0;nuclearCache=null;nuclearCacheTick=-Infinity;
    learnMatch={sample:null,key:null,finished:false};
    brainMatchId='match-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*0xffffffff).toString(36).padStart(8,'0');
    brainSeq=0;brainLastTick=-Infinity;brainLastSampleTick=-Infinity;brainBusy=false;brainBackoff=0;
    brainState={status:opts.brainEnabled?'Warte auf Match':'Aus',advice:null,receivedTick:-Infinity,lastError:null};
    warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};diagnostics=[];recordSequence=0;recordCounts={};recordsDropped=0;streamErrors=0;lastDiagnosticTick=-Infinity;gameEnd=null;forecastAudits=[];lastForecastAudit=null;incomeAttribution=[];
    investmentStatus='Grundaufbau';lastWarReview=-Infinity;
    defenseStatus='Keine Bedrohung';lastEmergencyRetreat=-Infinity;lastDefenseLog=-Infinity;
    retreatRequests.clear();defenseStats={retreatsOrdered:0,retreatsObserved:0,unknown:0,unconfirmed:0};
    autoTuning={aggressive:85,reserve:35,actionsPerMinute:72,maxTargets:16,
      mode:'INIT',reason:'Warte auf Spielzustand',tick:-Infinity};
    // Start this new match as soon as EventBus becomes ready.
    opts.enabled=false;persist();
    status=gameType(g)==='Singleplayer'?'Singleplayer erkannt · '+(opts.autoStart?'Autostart wartet auf EventBus':'Bot bereit'):
      multiplayerMatch(g)?'Multiplayer erkannt · '+(opts.autoStart?'Autostart wartet auf EventBus':'Bot bereit'):
      'Replay/unbekannter Spieltyp · gesperrt';
    if(g?.config?.().isReplay?.())status='Replay · BOT GESPERRT';
    log(status);
    reportIntents();
  }
  // Never overwrite manually selected slider values. Auto settings are
  // recomputed from current troops, threats, strategy and worker latency.
  function setting(key){return opts.fullAuto?autoTuning[key]:opts[key];}
  // Hysteresis prevents oscillation and keeps worker/transport costs bounded.
  // Critical defense changes are immediate; ordinary strategy changes settle
  // for at least 45 ticks. These values never modify the user's manual sliders.
  function tuneAutonomously(me,items,s,tick,context) {
    if(!opts.fullAuto)return s;
    const late=lateGame(me),home=Math.max(1,s.home);
    const invasion=s.incoming/home,neighbor=s.strongest/home;
    const emergency=invasion>=.18 || (invasion>=.10 && context.rebuilding);
    let mode='BALANCED',reason='Ausgeglichene Spielphase';
    let v={aggressive:82,reserve:35,actionsPerMinute:76,maxTargets:15};
    if(emergency || (context.wanted==='DEFEND'&&s.incoming>0)){
      mode='DEFEND';reason='Eingehender Angriff – Heimtruppen sichern';
      v={aggressive:60,reserve:63,actionsPerMinute:88,maxTargets:9};
    } else if(context.wanted==='RECOVER'||s.ratio<.23){
      mode='RECOVER';reason='Truppen regenerieren und Bauaktionen zulassen';
      v={aggressive:64,reserve:49,actionsPerMinute:65,maxTargets:10};
    } else if(context.wanted==='ASSAULT'&&!s.incoming){
      mode='ASSAULT';reason='Konzentrierte Offensive mit überprüfter Heimreserve';
      v={aggressive:late?98:92,reserve:late?23:29,actionsPerMinute:late?98:87,maxTargets:late?22:19};
    } else if(context.wanted==='TECH'||context.wanted==='ECONOMY'){
      mode=context.wanted;reason='Wirtschaft und strategische Technik finanzieren';
      v={aggressive:73,reserve:40,actionsPerMinute:72,maxTargets:13};
    } else if(context.wanted==='EXPAND'){
      mode='EXPAND';reason='Neutrales Land effizient erobern';
      v={aggressive:late?87:82,reserve:late?29:33,actionsPerMinute:late?88:78,maxTargets:late?18:15};
    } else if(late&&s.ratio>.74&&!s.incoming){
      mode='LATE';reason='Große Truppenreserve – Chancen häufiger prüfen';
      v={aggressive:93,reserve:27,actionsPerMinute:91,maxTargets:20};
    }
    if(!emergency && s.incoming>0){
      v.reserve+=Math.min(13,Math.ceil(invasion*35));
      v.aggressive-=9;
    }
    if(!emergency && neighbor>1 && (mode==='ASSAULT'||mode==='EXPAND')){
      v.reserve+=Math.min(13,Math.ceil((neighbor-1)*14));
    }
    // More worker probes only help when workers respond promptly. Do not
    // compensate for a slow worker by flooding it with even more requests.
    if(runtime.combatMs>1100||runtime.borderMs>850){
      v.maxTargets-=5;v.actionsPerMinute-=12;
      reason+=' · Worker entlasten';
    } else if(runtime.combatMs>650){
      v.maxTargets-=3;v.actionsPerMinute-=6;
    }
    if(runtime.economyMs>1600)v.actionsPerMinute-=6;
    const unlearned={...v};
    v=learnAdjust(v,mode,s,emergency);
    v=brainAdjust(v,unlearned,mode,s,emergency);
    v=neuralAdjust(v,unlearned,me,s,items,emergency);
    v.aggressive=clamp(v.aggressive,40,100);
    v.reserve=clamp(v.reserve,18,65);
    v.actionsPerMinute=clamp(v.actionsPerMinute,45,110);
    v.maxTargets=clamp(v.maxTargets,6,24);
    const changed=mode!==autoTuning.mode || ['aggressive','reserve','actionsPerMinute','maxTargets']
      .some(k=>autoTuning[k]!==v[k]);
    if(!changed)return s;
    if(!emergency && tick-autoTuning.tick<45)return s;
    autoTuning={...v,mode,reason,tick};
    if(mode!=='DEFEND'||tick-lastDefenseLog>=75){
      telemetry('auto_tuning','Autonome Parameter: '+mode,{...v,reason});
      if(mode==='DEFEND')lastDefenseLog=tick;
    }
    return military(me,items);
  }
  function actionBudget(channel='general') {
    const now=Date.now();actions=actions.filter(t=>now-t<60000);
    const cap=clamp(setting('actionsPerMinute'),15,120);
    // Combat may not consume the entire action window: leave room for
    // economic reinvestment, missiles and diplomacy.
    const reserve=channel==='combat'?Math.max(3,Math.ceil(cap*.16)):0;
    return actions.length<cap-reserve;
  }
  function send(kind,args,description,priority=false) {
    if(!opts.enabled || !connected())return false;
    if(!ctors[kind]){
      if(!missingIntentLogged.has(kind)){
        missingIntentLogged.add(kind);
        const message='Intent '+kind+' nicht erkannt – '+(CORE_INTENTS.includes(kind)?'Kernfunktion ausgefallen':'Funktion derzeit nicht verfügbar');
        console.warn(PREFIX,message);
        log('WARNUNG: '+message);
        telemetry('intent_send_blocked',message,{intent:kind,intents:intentHealth()});
      }
      return false;
    }
    if(!priority && !actionBudget(['attack','boat'].includes(kind)?'combat':'general'))return false;
    // The bot can make multiple decisions per cycle. Keep an independent
    // burst limiter so it never floods the game transport even at 60/min.
    if(!priority && Date.now()-lastEmission < 410)return false;
    // A final fail-closed check: do not emit if we switched to MP or replay.
    if(!permittedMatch(game))return false;
    try {
      const event=new ctors[kind](...args);
      bus.emit(event);actions.push(Date.now());lastEmission=Date.now();totalSent++;
      log(description);telemetry('action',description,{intent:kind});return true;
    } catch(e) {totalFailed++;log('Event fehlgeschlagen: '+String(e.message));return false;}
  }
  function valid(x,y) {return x>=0&&y>=0&&x<game.width()&&y<game.height();}
  function friendly(p,me) {
    try {return p?.id?.()===me.id() || p.isFriendly?.(me) || me.isFriendly?.(p);}catch(_){return false;}
  }
  function spawnBlock(reason){
    if(spawnState.blocked===reason)return;
    spawnState.blocked=reason;
    spawnState.phase='Blockiert: '+reason;
    telemetry('spawn_blocked',reason,{spawn:{...spawnState},
      eventBus:!!bus,hasIntent:!!ctors.spawn,enabled:!!opts.enabled,
      autoSpawn:!!opts.autoSpawn});
  }
  function spawnRemaining(g) {
    const fallback=multiplayerMatch(g)?200:100;
    const turns=number(()=>g.config().numSpawnPhaseTurns?.(),fallback);
    return Math.max(0,turns-number(()=>g.ticks(),0));
  }
  function spawnTileValid(g,tile) {
    try{return Number.isInteger(tile)&&
      (typeof g.isValidRef!=='function'||g.isValidRef(tile))&&
      g.isLand(tile)&&!g.isImpassable(tile)&&
      !g.hasOwner(tile)&&!g.isBorder?.(tile);}
    catch(_){return false;}
  }
  function spawnRivals(g,me) {
    const ownTeam=me?.team?.(),mine=safeID(me);
    return (g.playerViews?.()||[]).filter(p=>mine===null||safeID(p)!==mine)
      .map(p=>{
        const tile=p.state?.spawnTile;
        if(!Number.isInteger(tile)||(typeof g.isValidRef==='function'&&!g.isValidRef(tile)))return null;
        return {x:g.x(tile),y:g.y(tile),
          teammate:ownTeam!==null&&ownTeam!==undefined &&
            p.team?.()===ownTeam};
      }).filter(Boolean);
  }
  // Use the actual 4-tile spawn footprint and three additional land rings.
  // Nearby free plains provide opening growth, while the outer rings penalize
  // islands/peninsulas and distant teammates do not count as enemy threats.
  function spawnScore(g,tile,rivals=spawnRivals(g,myPlayer()),urgent=false) {
    if(!spawnTileValid(g,tile))return null;
    const x=g.x(tile),y=g.y(tile),w=g.width(),h=g.height();
    const good=(xx,yy)=>{
      if(xx<0||yy<0||xx>=w||yy>=h)return null;
      const t=g.ref(xx,yy);
      if(!g.isLand(t)||g.isImpassable(t)||g.hasOwner(t))return null;
      const magnitude=number(()=>g.magnitude?.(t),
        number(()=>g.terrainByte?.(t)&31,10));
      return {plain:magnitude<10,high:magnitude<20};
    };
    let core=0,coreTotal=0,plain=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      if(dx*dx+dy*dy>16)continue;
      coreTotal++;
      const v=good(x+dx,y+dy);
      if(v){core++;plain+=v.plain?1:0;}
    }
    if(core<coreTotal*(urgent?.58:.83))return null;
    const minSide=Math.min(w,h),scale=Math.min(70,Math.max(15,minSide/7));
    const rings=[Math.max(8,scale*.27),Math.max(13,scale*.57),scale];
    let accessible=0,weight=0,plains=0,coastal=0;
    const angles=16;
    for(let i=0;i<rings.length;i++){
      const rr=rings[i],importance=i===0?1:i===1?1.25:1.5;
      for(let j=0;j<angles;j++){
        const t=2*Math.PI*j/angles;
        const xx=Math.round(x+rr*Math.cos(t)),yy=Math.round(y+rr*Math.sin(t));
        const v=good(xx,yy);
        weight+=importance;
        if(v){accessible+=importance;plains+=v.plain?importance:v.high?importance*.38:0;}
        try{
          if(xx>=0&&yy>=0&&xx<w&&yy<h&&
            (g.isOceanShore?.(g.ref(xx,yy))||
             (!g.isOceanShore&&g.isShore?.(g.ref(xx,yy)))))
            coastal+=importance;
        }catch(_){}
      }
    }
    const density=accessible/Math.max(1,weight);
    if(density<(urgent?.24:.48))return null;
    const enemy=rivals.filter(p=>!p.teammate)
      .map(p=>Math.abs(p.x-x)+Math.abs(p.y-y));
    const ally=rivals.filter(p=>p.teammate)
      .map(p=>Math.abs(p.x-x)+Math.abs(p.y-y));
    const nearestEnemy=enemy.length?Math.min(...enemy):Infinity;
    const nearestAlly=ally.length?Math.min(...ally):Infinity;
    const minimum=number(()=>g.config().minDistanceBetweenPlayers?.(),30);
    if(nearestEnemy<(urgent?minimum:minimum+4))return null;
    // Too many people in one shared territory prevents both players growing.
    if(nearestAlly<(urgent?16:Math.max(22,minimum*.8)))return null;
    const enemyScore=enemy.length===0?0.75:
      Math.min(1,Math.max(0,(nearestEnemy-minimum)/(minimum*2.5)));
    const teamScore=!ally.length?0:
      Math.min(1,Math.max(0,(nearestAlly-minimum)/(minimum*2.5)))*
        Math.min(1,190/Math.max(60,nearestAlly));
    const openScore=core/coreTotal;
    const edge=Math.min(x,y,w-1-x,h-1-y);
    const edgeScore=Math.min(1,edge/Math.max(22,scale));
    // Coast is helpful for ports, not a reason to prefer a tiny island.
    const coastScore=Math.min(1,coastal/Math.max(1,weight)*3);
    const score=openScore*.19+density*.32+
      (plain/Math.max(1,core)*.45+plains/Math.max(1,weight)*.55)*.18+
      enemyScore*.16+edgeScore*.05+coastScore*.04+
      (ally.length?teamScore*.06:0);
    return {tile,x,y,score,density,core:openScore,
      coast:coastScore,enemy:Number.isFinite(nearestEnemy)?nearestEnemy:null,
      teammate:Number.isFinite(nearestAlly)?nearestAlly:null};
  }
  function startSpawnSearch() {
    if(spawnJob||!game||!opts.enabled||Date.now()<spawnRetryAt||
      !game.inSpawnPhase?.()||game.config().isRandomSpawn?.())return;
    const g=game,serial=generation,me=myPlayer();
    if(me?.hasSpawned?.()||Number.isInteger(me?.state?.spawnTile))return;
    const w=g.width(),h=g.height(),margin=6;
    if(w<=margin*2||h<=margin*2)return;
    const stride=Math.max(11,Math.floor(Math.min(w,h)/19));
    const rivals=spawnRivals(g,me),candidates=new Map();
    const offsets=[0,.5].map(f=>Math.floor(stride*f));
    const jobs=[];
    for(const offset of offsets){
      for(let y=margin+offset;y<h-margin;y+=stride)
        for(let x=margin+offset;x<w-margin;x+=stride)
          jobs.push([x,y]);
    }
    let index=0;
    spawnAlternatives=[];
    spawnJob={serial,started:number(()=>g.ticks(),0),total:jobs.length,candidates};
    spawnState.phase='Suche';spawnState.scanned=0;
    function chunk(){
      if(serial!==generation||g!==game||!opts.enabled||!permittedMatch(g)||
        !g.inSpawnPhase?.()||myPlayer()?.hasSpawned?.()||
        Number.isInteger(myPlayer()?.state?.spawnTile)){
        spawnJob=null;return;
      }
      const start=performance.now();
      try{
        while(index<jobs.length && performance.now()-start<8){
          const [x,y]=jobs[index++],tile=g.ref(x,y);
          const candidate=spawnScore(g,tile,rivals);
          if(!candidate)continue;
          candidates.set(tile,candidate);
          if(candidates.size>18){
            const worst=[...candidates.values()].sort((a,b)=>a.score-b.score)[0];
            candidates.delete(worst.tile);
          }
          if(!spawnCache || candidate.score>spawnCache.score)
            spawnCache=candidate;
        }
        spawnState.scanned=index;
      }catch(e){
        spawnJob=null;spawnState.phase='Fehler';
        status='Spawn-Analyse: '+String(e?.message||e).slice(0,90);
        spawnBlock('Spawn-Suche: '+String(e?.message||e).slice(0,80));
        spawnRetryAt=Date.now()+600;return;
      }
      if(index<jobs.length){
        // Near deadline, send the best VALID candidate found so far while
        // the grid continues. Do not wait out the last spawn-phase tick.
        // Prefer a good spot early over scanning until the live spawn expires.
        const tick=number(()=>g.ticks(),0),remaining=spawnRemaining(g);
        if(spawnCache && (remaining<=110 ||
          (index>=120 && spawnCache.score>=.62)))
          doSpawn(tick);
        setTimeout(chunk,0);return;
      }
      spawnJob=null;if(!spawnState.lastSent)spawnState.phase='Fertig';
      spawnAlternatives=[...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,18);
      if(candidates.size){
        // Refine only the top candidates in a bounded local neighborhood.
        for(const top of [...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,6)){
          for(const [dx,dy] of [[0,0],[stride/3,0],[-stride/3,0],
            [0,stride/3],[0,-stride/3],[stride/3,stride/3],
            [-stride/3,-stride/3]]){
            const x=Math.round(top.x+dx),y=Math.round(top.y+dy);
            if(x<margin||y<margin||x>=w-margin||y>=h-margin)continue;
            const v=spawnScore(g,g.ref(x,y),rivals);
            if(v&&(!spawnCache||v.score>spawnCache.score))spawnCache=v;
          }
        }
      }
      if(!spawnCache){
        status='Spawn: kein sicherer Standort; Suche wiederholen';
        spawnRetryAt=Date.now()+800;return;
      }
      doSpawn(number(()=>g.ticks(),0));
    }
    setTimeout(chunk,0);
  }
  function emergencySpawnSearch(g,me){
    if(!g?.inSpawnPhase?.() || g.config().isRandomSpawn?.())return null;
    const w=g.width(),h=g.height(),step=Math.max(9,Math.floor(Math.min(w,h)/14)),
      rivals=spawnRivals(g,me);
    let best=null;
    for(let y=5;y<h-5;y+=step)for(let x=5;x<w-5;x+=step){
      const current=spawnScore(g,g.ref(x,y),rivals,true);
      if(current&&(!best||current.score>best.score))best=current;
    }
    if(best){
      spawnState.phase='Deadline-Fallback';spawnCache=best;
    }
    return best;
  }
  function doSpawn(tick) {
    if(!opts.autoSpawn){spawnBlock('Auto-Spawn ausgeschaltet');return;}
    if(!game?.inSpawnPhase?.()){spawnBlock('Spawnphase bereits beendet');return;}
    if(game.config().isRandomSpawn?.()){spawnBlock('Zufallsspawn aktiv');return;}
    if(!bus?.emit){spawnBlock('EventBus fehlt');return;}
    if(!ctors.spawn){spawnBlock('Spawn-Intent nicht erkannt');return;}
    if(tick-lastSpawn<22)return;
    const me=myPlayer();
    if(me?.hasSpawned?.()||Number.isInteger(me?.state?.spawnTile))return;
    spawnState.blocked=null;
    if(!spawnCache){
      if(spawnRemaining(game)<=110)spawnCache=emergencySpawnSearch(game,me);
      if(!spawnCache){spawnBlock('Kein gültiges Land im Spawn-Suchraster');startSpawnSearch();return;}
    }
    if(spawnJob && spawnRemaining(game)>110 &&
      (spawnState.scanned<120 || spawnCache.score<.62))return;
    const rivals=spawnRivals(game,me),urgent=spawnRemaining(game)<=55;
    const candidates=[spawnCache,...spawnAlternatives,...(spawnJob?.candidates?.values()||[])];
    let best=null;
    for(const candidate of candidates){
      const current=spawnScore(game,candidate.tile,rivals,urgent);
      if(!current)continue;
      // A selected tile that has not appeared in the game state after a
      // full retry interval should not monopolize the last multiplayer ticks.
      if(spawnState.lastSent?.tile===current.tile &&
        tick-spawnState.lastSent.tick>=30 && candidates.length>1)continue;
      if(!best||current.score>best.score)best=current;
    }
    if(!best && urgent)best=emergencySpawnSearch(game,me);
    if(!best){
      spawnCache=null;spawnBlock('Alle Kandidaten belegt/ungültig; suche neu');
      if(!spawnJob)startSpawnSearch();
      return;
    }
    spawnCache=best;spawnState.blocked=null;
    if(send('spawn',[best.tile],
      'SPAWN → strategischer Standort ('+best.x+','+best.y+
      ') · Land '+Math.round(best.density*100)+'% · Score '+best.score.toFixed(3),
      true)){
      lastSpawn=tick;spawnState.phase='Auswahl gesendet';spawnState.attempts++;
      spawnState.lastSent={tile:best.tile,tick,score:best.score,
        density:best.density,enemy:best.enemy,teammate:best.teammate};
      telemetry('spawn_intent','Strategischer Spawn angefordert',
        {spawn:{...spawnState.lastSent},withoutPlayerView:!me});
    }else spawnBlock('Spawn-Intent nicht gesendet (EventBus/Spielstatus prüfen)');
  }
  async function borders(me,tick) {
    const id=safeID(me);
    if(borderCache && borderPlayer===id && tick-lastBorderTick<22)return borderCache;
    // Combat and economy may request the border at the same moment. One worker
    // query is enough for both; the old code launched several redundant queries.
    if(borderInflight && borderInflight.id===id && borderInflight.generation===generation)
      return borderInflight.promise;
    const serial=generation, t0=performance.now();
    const promise=(async()=>{
      const result=await me.borderTiles();
      const tiles=result?.borderTiles;
      if(!tiles || typeof tiles[Symbol.iterator]!=='function')return [];
      const copied=[...tiles];
      if(serial===generation && game && id===safeID(myPlayer())){
        borderCache=copied;borderPlayer=id;lastBorderTick=number(()=>game.ticks(),tick);
        if(tick-lastBorderRefresh>=15){borderOffset++;lastBorderRefresh=tick;}
        runtime.borderMs=Math.round(performance.now()-t0);
      }
      return copied;
    })();
    borderInflight={id,generation:serial,promise};
    try{return await promise;}
    finally {if(borderInflight?.promise===promise)borderInflight=null;}
  }
  // FFA vs team mode and the real win threshold from Config. Missing client
  // information is represented as null, NEVER filled with a guessed win rule.
  function victoryPlan(me) {
    const cfg=game.config(),gc=cfg.gameConfig(),mode=gc.gameMode==='Team'?'Team':'FFA';
    const team=me.team?.(),ours=number(()=>me.numTilesOwned(),0);
    const land=mode==='Team'&&team!==undefined&&team!==null ?
      (game.playerViews?.()||[]).filter(p=>p.team?.()===team)
        .reduce((n,p)=>n+number(()=>p.numTilesOwned(),0),0):ours;
    const total=number(()=>game.numLandTiles?.(),0),fallout=number(()=>game.numTilesWithFallout?.(),0);
    const elapsed=number(()=>game.elapsedGameSeconds?.(),number(()=>game.ticks(),0)/10);
    const winPct=number(()=>cfg.percentageTilesOwnedToWin?.(elapsed),NaN);
    const remaining=Number.isFinite(gc.maxTimerValue)?
      Math.max(0,gc.maxTimerValue*60-elapsed):null;
    const threshold=total>0&&Number.isFinite(winPct)?winPct:null;
    const progress=total>0?land/Math.max(1,total-fallout):null;
    const urgent=(remaining!==null&&remaining<300)||!!me.inDoomsdayClock?.()||
      (progress!==null&&threshold!==null&&progress*100>=threshold-8);
    winStatus={mode,progress,threshold,remaining,urgent,
      doomsday:!!me.inDoomsdayClock?.(),
      ownTiles:ours,teamTiles:land};
    return winStatus;
  }
  function checkIncomeAttribution(me,tick){
    for(const sample of incomeAttribution){
      if(sample.finished||tick-sample.tick<120)continue;
      const train=number(()=>me.trainGold?.(),NaN),
        trade=number(()=>me.tradeGold?.(),NaN);
      sample.finished=true;sample.afterTick=tick;
      sample.trainDelta=Number.isFinite(train)&&
        Number.isFinite(sample.beforeTrain)?
        Math.max(0,train-sample.beforeTrain):null;
      sample.tradeDelta=Number.isFinite(trade)&&
        Number.isFinite(sample.beforeTrade)?
        Math.max(0,trade-sample.beforeTrade):null;
      sample.method='interval-income-observation-not-causal';
      telemetry('income_after_build',
        'Bahn-/Schiffseinkommen nach Bau gemessen (keine kausale Zuordnung)',
        {incomeSample:sample});
    }
  }
  function sampleIncome(me,tick){
    const cur={tick,gold:number(()=>Number(me.gold()),0),
      train:number(()=>me.trainGold?.(),NaN),trade:number(()=>me.tradeGold?.(),NaN)};
    const previous=goldSamples[goldSamples.length-1];
    if(previous&&tick>previous.tick&&tick-previous.tick>=80){
      const rate=(v)=>Number.isFinite(cur[v])&&Number.isFinite(previous[v])?
        Math.max(0,(cur[v]-previous[v])/(tick-previous.tick)*600):null;
      incomeStatus={train:rate('train'),trade:rate('trade'),
        gold:Math.max(0,(cur.gold-previous.gold)/(tick-previous.tick)*600),
        observed:true};
      goldSamples.shift();
    }
    if(!goldSamples.length)goldSamples.push(cur);
    checkIncomeAttribution(me,tick);
  }
  // Look at *where a real player's army is committed*, not only the
  // player's headline troop count. An adversary fighting a third party has a
  // short-lived opening, but this never overrides our other-border reserve.
  function adversaryWindow(me,enemy) {
    if(!enemy || !me || friendly(enemy,me))return {
      elsewhere:0,incomingOthers:0,ratio:0,exposed:false,human:false};
    const home=Math.max(1,number(()=>enemy.troops?.(),0)),ourSmall=number(()=>me.smallID?.(),-1);
    const outgoing=(()=>{try{return enemy.outgoingAttacks?.()||[];}catch(_){return [];}})();
    const incoming=(()=>{try{return enemy.incomingAttacks?.()||[];}catch(_){return [];}})();
    const elsewhere=outgoing.filter(a=>!a.retreating && !attackTargets(a.targetID,me))
      .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
    const incomingOthers=incoming.filter(a=>!a.retreating && a.attackerID!==ourSmall)
      .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
    const ratio=elsewhere/home,underPressure=incomingOthers/home;
    return {elsewhere,incomingOthers,ratio,home,
      exposed:ratio>=.45 || underPressure>=.40,
      human:enemy.type?.()==='HUMAN'};
  }
  function enemyUnderAttack(enemy){
    const own=number(()=>enemy.troops?.(),0);
    const ourSmall=number(()=>myPlayer()?.smallID?.(),-1);
    // Only a third-party assault is an opportunity. Our own attack against
    // this player cannot justify launching another underpriced offensive.
    const incoming=(enemy.incomingAttacks?.()||[]).filter(a=>
      !a.retreating && a.attackerID!==ourSmall)
      .reduce((n,a)=>n+number(()=>a.troops,0),0);
    return own>0 && incoming>=own*.50;
  }
  // An estimate driven by the official pure attackLogic when exposed
  // through the browser config. Not an exact future-tile path simulation.
  function attackForecast(me,item,troops){
    const enemy=item?.opponent,front=item?.tiles||[];
    if(!enemy||!front.length||troops<1)return null;
    const units=enemy.units?.()||[];
    const posts=units.filter(u=>u.type?.()==='Defense Post'&&!u.isUnderConstruction?.());
    const total=number(()=>game.numLandTiles?.(),0),fallout=number(()=>game.numTilesWithFallout?.(),0);
    let loss=0,time=0,count=0,engine=false;
    for(const tile of front.slice(0,12)){
      try{
        const mag=number(()=>game.terrainType(tile),0);
        const covered=posts.some(u=>{
          const dx=game.x(tile)-game.x(u.tile()),dy=game.y(tile)-game.y(u.tile());
          const radius=number(()=>game.config().defensePostRange?.(),30);
          return dx*dx+dy*dy<=radius*radius;
        });
        const result=game.config().attackLogic?.({
          terrain:mag,attackTroops:troops,
          attacker:{type:me.type?.()||'HUMAN',numTiles:Math.max(1,number(()=>me.numTilesOwned(),1))},
          defender:{type:enemy.type?.()||'NATION',numTiles:Math.max(1,number(()=>enemy.numTilesOwned(),1)),
            troops:number(()=>enemy.troops(),0),isTraitor:!!enemy.isTraitor?.(),
            isDisconnectedTeammate:false},
          defenderHasDefensePost:covered,
          falloutRatio:game.hasFallout?.(tile)&&total>0?fallout/total:null,
          borderSize:Math.max(1,item.front||1)
        });
        const fallback=({0:80,1:100,2:120})[mag]||100;
        const rough=(fallback/5)*(1+number(()=>enemy.troops(),0)/
          Math.max(1,number(()=>enemy.numTilesOwned(),1))*.07)*(covered?1.5:1)*
          Math.min(2,Math.max(.6,number(()=>enemy.troops(),0)/troops));
        const tileLoss=number(()=>result?.attackerTroopLoss,rough);
        loss+=Math.max(0,tileLoss);time+=number(()=>result?.tickFraction,1);
        engine=engine||Number.isFinite(result?.attackerTroopLoss);count++;
      }catch(_){}
    }
    if(!count)return null;
    strategicTelemetry.forecastCount++;
    if(engine)strategicTelemetry.engineForecasts++;
    else{
      strategicTelemetry.proxyForecasts++;
      if(!strategicTelemetry.forecastUnavailable++){
        telemetry('forecast_engine_unavailable',
          'Browser-Config liefert keinen gültigen attackLogic-Verlustwert; Näherung verwendet',
          {exposed:typeof game?.config?.().attackLogic==='function'});
      }
    }
    const sampleTiles=Math.min(80,Math.max(1,number(()=>enemy.numTilesOwned(),1)*.15));
    return {loss:loss/count*sampleTiles,time:time/count*sampleTiles,
      sample:count,engine,method:engine?'config.attackLogic':'rough-proxy'};
  }
  function targetsFromBorder(me,tiles) {
    const groups=new Map(), scratch=[], fallout=[], cap=2000;
    const stride=Math.max(1,Math.ceil(tiles.length/cap));
    const offset=borderOffset%stride;
    const ownID=safeID(me);
    for(let i=offset;i<tiles.length;i+=stride){
      const t=tiles[i];scratch.length=0;
      const count=game.neighbors4(t,scratch);
      for(let j=0;j<count;j++){
        const ref=scratch[j];
        if(!game.isLand(ref)||game.isImpassable(ref))continue;
        const opponent=game.owner(ref),id=safeID(opponent);
        if(id===null && game.hasFallout?.(ref)){
          strategicTelemetry.falloutSkipped++;
          if(!fallout.includes(ref)&&fallout.length<80)fallout.push(ref);
          continue;
        }
        if(id===ownID||(id!==null&&friendly(opponent,me)))continue;
        let g=groups.get(id);
        if(!g){g={id,opponent:id===null?null:opponent,tiles:[],front:0};groups.set(id,g);}
        g.front++;
        // Spread action probes across different local frontiers, not just the
        // first eight cells of a broad border that may all be blocked.
        if(g.tiles.length<20 && !g.tiles.includes(ref))g.tiles.push(ref);
        else if(g.tiles.length===20 && g.front%23===0)g.tiles[(g.front/23|0)%20]=ref;
      }
    }
    // The official AI prefers clean land, then falls back to nuked TN if
    // no clean neutral border remains. Do not make fallout a free land bonus.
    if(!groups.has(null)&&fallout.length){
      groups.set(null,{id:null,opponent:null,tiles:fallout.slice(0,20),
        front:fallout.length,fallout:true});
      strategicTelemetry.falloutFallback++;
    }
    return [...groups.values()];
  }
  // Unlike v1.2, use ALL troop commitments and incoming attacks. Home troops
  // alone are misleading: 5K at home with 20K already attacking is not 5K idle.
  function lateGame(me) {
    if(!opts.lateOffense)return false;
    const tick=number(()=>game?.ticks?.(),0),land=number(()=>me?.numTilesOwned?.(),0);
    return (tick>=1800 && land>=1000) || (tick>=3300 && land>=500);
  }
  // Recruitment slows near troop cap. Spend only a genuinely safe surplus:
  // incoming attacks and significant neighboring armies veto growth spending.
  function growthPressure(s) {
    return s.ratio>.74 && s.incoming===0 && s.activeEnemy===0 &&
      s.strongest<s.home*.70;
  }
  function neutralAttackAmount(s,aggression) {
    const base=Math.max(130,s.home*(hardMode()?(.055+aggression*.035):(.09+aggression*.08)));
    const surplus=growthPressure(s)?Math.max(0,s.home-s.max*.48)*.46:0;
    const fraction=growthPressure(s)?(hardMode()?.49:.55):(hardMode()?.31:.55);
    const exposed=s.strongest>=s.home*.85||s.incoming>=s.home*.10;
    // Cheap expansion may continue near a strong rival, but never consume
    // a third of the army immediately before a probable counterattack.
    const safeBudget=hardMode()&&exposed?
      Math.min(s.available*.14,s.home*.025):s.available*fraction;
    return Math.floor(Math.min(safeBudget,Math.max(base,surplus)));
  }
  // Retain short-lived border pressure across transient missing border scans.
  function observeFronts(me,items,tick){
    if(!hardMode())return;
    for(const item of items){
      if(item.id===null||!item.opponent?.isAlive?.()||friendly(item.opponent,me))continue;
      const troops=Math.max(0,number(()=>item.opponent.troops(),0));
      const old=frontMemory.get(item.id);
      frontMemory.set(item.id,{troops,lastTick:tick,
        peak:old&&tick-old.lastTick<=180?Math.max(troops,old.peak*.94):troops,
        land:number(()=>item.opponent.numTilesOwned(),0)});
    }
    for(const [id,value] of frontMemory)
      if(tick-value.lastTick>360)frontMemory.delete(id);
    if(frontMemory.size>40){
      const ordered=[...frontMemory].sort((a,b)=>a[1].lastTick-b[1].lastTick);
      for(const [id] of ordered.slice(0,frontMemory.size-40))frontMemory.delete(id);
    }
  }
  function military(me,items=[]) {
    const home=number(()=>me.troops());
    // Singleplayer's native infinite-troops option reports an artificial
    // 1-billion troop cap. Using it for the recovery ratio would make the
    // bot wait forever even while it can safely expand.
    const infiniteTroops=game.config().infiniteTroops?.()===true;
    const rawMax=Math.max(1,number(()=>game.config().maxTroops(me),home||1));
    const max=infiniteTroops?Math.max(1,home*1.35):rawMax;
    const out=(me.outgoingAttacks?.()||[]).filter(a=>!a.retreating&&a.troops>0);
    const inc=(me.incomingAttacks?.()||[]).filter(a=>!a.retreating&&a.troops>0);
    const committed=out.reduce((sum,a)=>sum+a.troops,0);
    const incoming=inc.reduce((sum,a)=>sum+a.troops,0);
    const hostile=items.filter(t=>t.id!==null && t.opponent?.isAlive?.());
    const tick=number(()=>game?.ticks?.(),0);
    const historical=[...frontMemory.values()].reduce((v,x)=>
      Math.max(v,tick-x.lastTick<=240?x.peak*.72:0),0);
    const strongest=Math.max(historical,
      hostile.reduce((v,t)=>Math.max(v,number(()=>t.opponent.troops())),0));
    const ratio=home/max;
    const adaptiveOffset=opts.autoStrategy?(strategic.mode==='RECOVER'||strategic.mode==='DEFEND'?8:
      strategic.mode==='EXPAND'&&!incoming&&!strongest?-5:0):0;
    const late=lateGame(me);
    const lateReduction=late && opts.lateOffense && !incoming && strongest<home*.65 ? (hardMode()?16:12) : 0;
    const growthRelease=ratio>.82&&!incoming&&strongest<home*.70&&!out.length?7:0;
    const baseline=home*clamp(setting('reserve')+adaptiveOffset-lateReduction-growthRelease,12,75)/100;
    // Hold meaningful troops while a larger neighbor or incoming offensive exists.
    // On Impossible, preserve a force against the largest OTHER neighbor even
    // while crushing our chosen target. Avoid permanent paralysis from maxTroops.
    const defensiveFloor=Math.max(baseline,
      // Defending against one enemy does not require parking its entire army
      // at home while an attacking stack is already fighting that same enemy.
      strongest>0 ? Math.min(home*.85,strongest*(hardMode()?.59:.53)) : 0,
      incoming>0 ? Math.min(home*.94,incoming*1.3) : 0,
      strongest>0 ? Math.min(home*.78,max*(hardMode()?.12:.14)) : 0);
    const reserve=Math.min(home,Math.ceil(defensiveFloor));
    const available=Math.max(0,Math.floor(home-reserve));
    const total=home+committed;
    const activeEnemy=out.filter(a=>a.targetID!==0 && a.targetID!==null).length;
    const activeNeutral=out.filter(a=>a.targetID===0||a.targetID===null).length;
    return {home,max,committed,incoming,strongest,ratio,reserve,available,total,
      growthPotential:Math.max(0,(10+Math.pow(home,.73)/4)*(1-ratio)),
      out,inc,activeEnemy,activeNeutral};
  }
  // Incoming stacks often disappear briefly between waves. Remember material
  // pressure so the bot cannot declare the coast clear and launch a large
  // offensive a few seconds after surviving an attack.
  function rememberHostilePressure(s,tick){
    const trend=armyTrend(tick);
    const unexpectedLoss=hardMode() && s.strongest>s.home*.70 &&
      trend && trend.ticks>=100 && trend.tiles< -Math.max(140,s.home*.001);
    if(s.incoming>=Math.max(1200,Math.max(1,s.home)*.08)||unexpectedLoss){
      if(unexpectedLoss && tick-lastFrontWarning>150){
        lastFrontWarning=tick;
        telemetry('front_loss_warning','Gebietsverlust neben starkem Nachbarn: Wiederaufbau schützen',
          {lostTiles:trend.tiles,strongest:s.strongest,home:s.home});
      }
      lastHostilePressure=tick;
    }
    return tick-lastHostilePressure<220;
  }
  function recentHostilePressure(tick,window=220){
    return tick-lastHostilePressure<window;
  }
  function sampleTroops(tick,me) {
    if(troopSamples.length && tick<=troopSamples[troopSamples.length-1].tick)return;
    troopSamples.push({tick,home:number(()=>me.troops()),tiles:number(()=>me.numTilesOwned())});
    while(troopSamples.length>2&&tick-troopSamples[0].tick>900)troopSamples.shift();
  }
  function armyTrend(tick) {
    const latest=troopSamples[troopSamples.length-1], earliest=troopSamples[0];
    if(!latest||!earliest||latest.tick-earliest.tick<80)return null;
    return {home:latest.home-earliest.home,tiles:latest.tiles-earliest.tiles,
      ticks:latest.tick-earliest.tick};
  }
  function evaluateLastBattle(tick,me) {
    if(!lastBattle || tick-lastBattle.tick<110)return;
    const record=lastBattle;
    // Only estimate stack attrition from an observed matching outgoing attack.
    // Never turn a disappeared stack into an asserted troop-loss number.
    const stacks=(me.outgoingAttacks?.()||[]).filter(a=>
      attackTargets(a.targetID,record.id)&&!a.retreating);
    if(stacks.length){
      const total=stacks.reduce((n,a)=>n+number(()=>a.troops,0),0);
      record.minimumObservedStack=Math.min(record.minimumObservedStack??Infinity,total);
    }
    const opponent=game.playerViews().find(p=>safeID(p)===record.id);
    if(!opponent || !opponent.isAlive?.()){lastBattle=null;return;}
    const active=(me.outgoingAttacks?.()||[]).some(a=>attackTargets(a.targetID,record.id)&&!a.retreating);
    // Don't attribute other battles, recruitment or construction to this war.
    // Evaluate only after the offensive ends or after a long front stalemate.
    if(active && tick-record.tick<620)return;
    const enemyLand=number(()=>opponent.numTilesOwned());
    const ownLand=number(()=>me.numTilesOwned());
    const captured=enemyLand<record.enemyLand && ownLand>record.ownLand;
    const stalled=!captured && enemyLand>=record.enemyLand*.99 &&
      ownLand<=record.ownLand && tick-record.tick>=260;
    if(captured){
      attackReceipts.territoryGained++;
      telemetry('war_progress','Gebietsgewinn gegen '+record.name,{enemyLandBefore:record.enemyLand,
        enemyLandAfter:enemyLand,ownLandBefore:record.ownLand,ownLandAfter:ownLand});
    } else if(stalled){
      blockedTargets.set(record.id,tick+(hardMode()?330:180));
      if(warState.id===record.id){warState.blockedUntil=tick+330;
        log('FRONT PAUSE: '+record.name+' · kein messbarer Gebietsgewinn');}
      telemetry('war_stall','Offensive ohne messbaren Gebietsgewinn',
        {enemyLandBefore:record.enemyLand,enemyLandAfter:enemyLand,
        ownLandBefore:record.ownLand,ownLandAfter:ownLand});
    } else telemetry('war_review','Ausgang nicht eindeutig: '+record.name,
      {enemyLandBefore:record.enemyLand,enemyLandAfter:enemyLand});
    if(record.forecast){
      const approxLoss=Number.isFinite(record.minimumObservedStack)?
        Math.max(0,record.amount-record.minimumObservedStack):null;
      const audit={tick,target:record.id,engine:record.forecast.engine,
        predictedLoss:record.forecast.loss,observedStackAttrition:approxLoss,
        evidence:approxLoss===null?'no-active-stack-sample':
          'outgoing-stack-net-change-not-causal',landGained:captured,
        observedTicks:tick-record.tick};
      forecastAudits.push(audit);if(forecastAudits.length>75)forecastAudits.shift();
      lastForecastAudit=audit;strategicTelemetry.forecastComparisons++;
      telemetry('forecast_audit','Angriffsprognose gegenüber sichtbarer Stack-Abnahme',
        {audit});
    }
    lastBattle=null;
  }
  function confirmAttack(me,tick){
    if(!pendingAttack)return;
    const p=pendingAttack;
    const out=(me.outgoingAttacks?.()||[]).filter(a=>!a.retreating && attackTargets(a.targetID,p.id));
    const newStack=out.some(a=>!p.beforeIds.includes(a.id)) ||
      out.reduce((sum,a)=>sum+a.troops,0)>p.beforeTroops+p.amount*.18;
    // A gain against neutral land must not falsely confirm an unrelated
    // player attack; require target-specific territory change for war.
    const landChanged=p.id===null ? number(()=>me.numTilesOwned())>p.ownLand :
      (number(()=>me.numTilesOwned())>p.ownLand &&
        game.playerViews().some(e=>safeID(e)===p.id &&
          number(()=>e.numTilesOwned())<p.enemyLand));
    if(newStack||landChanged){
      attackReceipts.confirmed++;
      telemetry('attack_confirmed','Angriff im Spielzustand erkannt: '+p.name,
        {target:p.id,troops:p.amount,via:newStack?'active_stack':'territory'});
      if(p.id!==null){
        lastBattle={id:p.id,name:p.name,tick:p.tick,
          enemyLand:p.enemyLand,ownLand:p.ownLand,
          forecast:p.forecast||null,amount:p.amount,minimumObservedStack:null};
        if(coordinatedWar()&&warState.id===null){
          warState={id:p.id,name:p.name,since:tick,blockedUntil:-Infinity};
          log('HAUPTKRIEGSZIEL BESTÄTIGT → '+p.name);
        }
      }
      pendingAttack=null;return;
    }
    // Terra-nullius expansion may complete between browser ticks; do not
    // declare a failed command without allowing the map to update.
    if(tick-p.tick<85)return;
    attackReceipts.unconfirmed++;
    telemetry('attack_unconfirmed','Kein Angriff/kein Gebiet nach Intent: '+p.name,
      {target:p.id,troops:p.amount});
    log('ANGRIFF NICHT BESTÄTIGT: '+p.name+' · Ziel neu prüfen');
    blockedTargets.set(p.id,tick+90);
    if(warState.id===p.id && !out.length){
      warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};plan=null;
    }
    pendingAttack=null;
  }
  // State selection uses hysteresis: don't alternate between expansion and
  // economy every 400 ms merely because the troop ratio moved by 1%.
  function effectivePlan() {
    if(!opts.autoStrategy)return opts.plan;
    return strategic.mode==='ASSAULT'?'Blitz':strategic.mode==='ECONOMY'||strategic.mode==='RECOVER'?'Ökonomie':'Adaptiv';
  }
  function effectiveBuildStyle() {
    if(!opts.autoStrategy)return opts.buildStyle;
    return strategic.buildStyle;
  }
  // War director. A target lock stops the previous bot opening five fronts
  // in the first two minutes. All own outgoing attacks and incoming threats
  // are examined before committing to a new enemy.
  function manageWar(me,items,s,tick) {
    if(!coordinatedWar())return;
    if(pendingAttack && pendingAttack.id!==null)return;
    const foes=items.filter(x=>x.id!==null && x.opponent?.isAlive?.());
    const active=s.out.filter(a=>a.targetID!==null&&a.targetID!==0 && !a.retreating);
    if(warState.id!==null) {
      const original=game.playerViews().find(p=>safeID(p)===warState.id);
      if(!original?.isAlive?.() || friendly(original,me)) {
        log('KRIEGSZIEL ERLEDIGT: '+warState.name);
        warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};plan=null;
      } else if(tick<warState.blockedUntil) {
        strategic.reason='Front nach Verlusten stabilisieren';
      } else if(!active.some(a=>attackTargets(a.targetID,warState.id)) &&
        ((tick-warState.since>550 && !foes.some(x=>x.id===warState.id)) ||
         (tick-warState.since>850 && tick-lastEnemySend>280 && s.incoming===0))) {
        // A once-successful war lock must not paralyze the bot forever after
        // its target becomes unreachable or too costly; allow a new front review.
        log('KRIEGSZIEL NEU BEWERTEN: '+warState.name);
        blockedTargets.set(warState.id,tick+200);lastWarReview=tick;
        warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};plan=null;
      }
    }
    if(warState.id===null && active.length) {
      const a=active.sort((a,b)=>b.troops-a.troops)[0],p=attackTargetPlayer(a.targetID);
      if(p){warState={id:safeID(p),name:nameOf(p),since:tick,blockedUntil:-Infinity};
        log('KRIEGSZIEL ÜBERNOMMEN: '+warState.name);}
    }
  }
  // Local target intelligence estimates reachable infrastructure and exposed
  // Defense Posts; the actual legality and combat outcome stay engine-owned.
  function targetEconomics(item,tick=number(()=>game.ticks(),0)) {
    const key=String(item.id),cached=targetIntelCache.get(key);
    if(cached && tick-cached.tick<24)return cached.value;
    const enemy=item.opponent,front=item.tiles||[];
    let units=[];
    try{units=enemy?.units?.()||[];}catch(_){}
    let prize=0,posts=0;
    for(const u of units.slice(0,100)){
      try{
        if(u.isActive?.()===false || !front.length)continue;
        const tile=u.tile?.();if(!Number.isInteger(tile))continue;
        const x=game.x(tile),y=game.y(tile);
        const near=front.some(t=>{const dx=x-game.x(t),dy=y-game.y(t);return dx*dx+dy*dy<=100*100;});
        if(!near)continue;
        const type=u.type?.(),level=Math.max(1,number(()=>u.level?.(),1));
        if(type==='City')prize+=5*level;
        else if(type==='Factory')prize+=6*level;
        else if(type==='Port')prize+=3*level;
        else if(type==='Defense Post' &&
          front.some(t=>{const dx=x-game.x(t),dy=y-game.y(t);return dx*dx+dy*dy<=35*35;}))posts++;
      }catch(_){}
    }
    const density=number(()=>enemy?.troops?.(),0)/Math.max(100,number(()=>enemy?.numTilesOwned?.(),0));
    const value={prize,posts,density};
    if(targetIntelCache.size>100)targetIntelCache.clear();
    targetIntelCache.set(key,{tick,value});
    return value;
  }
  // Compare the specific attack target with the OTHER neighboring threats.
  // A larger unrelated neighbor alone must not freeze every weak-front attack;
  // however the home force after the strike still must cover that neighbor.
  // AFK players can reconnect. Adjust only the opportunity ratio; the home
  // floor, other-front reserve and worker legality checks stay mandatory.
  function enemyOpportunityRatio(enemy,late,home,blitz=false){
    const normal=hardMode()?(late?1.34:1.75):
      (late?1.18:blitz?1.30:1.55);
    if(enemyUnderAttack(enemy))return hardMode()?(late?1.12:1.24):1.12;
    // Opportunity in a human FFA: their army is fighting someone else.
    // Never make this a blanket buff for an uncommitted player.
    const opening=adversaryWindow(myPlayer(),enemy);
    if(opening.exposed && opening.ratio>=.45 && opening.human)
      return Math.max(hardMode()?1.23:1.17,normal*.90);
    if(enemy?.isDisconnected?.()===true &&
      number(()=>enemy.troops(),Infinity)<home*1.2)
      return Math.max(1.15,normal*.86);
    return normal;
  }
  // Ally-target marking is a preference, not an attack authorization.
  function allyAssistTarget(me,enemy){
    if(!enemy || friendly(enemy,me))return false;
    const allies=[...(me.allies?.()||[])];
    for(const teammate of game.playerViews?.()||[]){
      if(teammate!==me && me.isOnSameTeam?.(teammate) &&
        !allies.includes(teammate))allies.push(teammate);
    }
    return allies.some(ally=>ally?.isAlive?.() && friendly(ally,me) &&
      (ally.targets?.()||[]).some(target=>safeID(target)===safeID(enemy)));
  }
  // Attack budget against OTHER fronts, independent of the chosen victim.
  // These checks cannot be bypassed by target scores or AI suggestions.
  function frontRiskPlan(items,s,targetID=null) {
    const other=items.filter(x=>x.id!==null&&x.id!==targetID&&
      x.opponent?.isAlive?.()).reduce((v,x)=>Math.max(v,
      number(()=>x.opponent.troops(),0)),0);
    const tick=number(()=>game?.ticks?.(),0);
    const remembered=[...frontMemory].reduce((v,[id,x])=>
      id!==targetID&&tick-x.lastTick<=240?
        Math.max(v,x.peak*.72):v,0);
    const otherThreat=Math.max(other,remembered);
    const danger=otherThreat>s.home*1.15;
    const pressure=s.incoming>Math.max(1200,s.home*.08);
    const floor=Math.max(s.reserve,s.incoming*1.3,
      otherThreat>0?Math.min(s.home,otherThreat*(hardMode()?.63:.55)):0);
    return {other:otherThreat,danger,pressure,floor,
      safeStrike:Math.max(0,Math.floor(s.home-floor)),
      emergency:danger||pressure};
  }
  function targetOpportunity(me,items,s,item) {
    if(!item?.opponent?.isAlive?.()||friendly(item.opponent,me))return false;
    const late=lateGame(me),troops=number(()=>item.opponent.troops(),Infinity);
    if(!(troops>0)||s.incoming>s.home*(late?.15:.04)||s.ratio<(late?.29:.40))return false;
    const minRatio=enemyOpportunityRatio(item.opponent,late,s.home);
    if(s.available<troops*minRatio ||
      s.home<troops*(hardMode()?(late?1.45:1.85):(late?1.24:1.45)))return false;
    const front=frontRiskPlan(items,s,item.id);
    if(front.danger||front.pressure)return false;
    const strike=Math.min(s.available*(hardMode()?.76:.80),
      Math.max(troops*(hardMode()?1.57:1.40),s.available*.48));
    return strike<=front.safeStrike;
  }
  function warReadiness(me,items,s,tick,target=null) {
    if(!hardMode())return {ready:true,reason:'Normal'};
    const units=ownStructures(me),cities=units.filter(x=>x.type?.()==='City').length,
      factories=units.filter(x=>x.type?.()==='Factory').length,
      tiles=number(()=>me.numTilesOwned()),gold=number(()=>Number(me.gold()));
    const neutral=items.some(x=>x.id===null),late=lateGame(me);
    if(s.incoming>s.home*.085)return {ready:false,reason:'Eingehender Angriff'};
    if(s.activeEnemy && !isWar())return {ready:false,reason:'Laufende andere Offensive'};
    if(!late && neutral && !isWar() && (cities<2 || factories<2) && tick<2500 &&
      !game.config().infiniteGold?.()) {
      // Only defer war while basic construction is ACTUALLY advancing.
      // Expensive next-tier buildings, blocked land and insufficient gold
      // previously trapped the bot in this branch for thousands of ticks.
      const recentlyBuilt=tick-successfulEconomyTick<440;
      const underway=!!economicPending && tick-economicPending.tick<ECON_PENDING_TTL;
      const canInvest=gold>=180000 && failedEconomyProbes<5;
      if((underway || recentlyBuilt || canInvest) && tick<1750)
        return {ready:false,reason:'Grundaufbau läuft: Städte/Fabriken'};
      if(warWaitSince===-Infinity)warWaitSince=tick;
      if(tick-warWaitSince<200 && gold>=180000)
        return {ready:false,reason:'Bauplatzprüfung vor Kriegsfreigabe'};
    } else warWaitSince=-Infinity;
    if(s.ratio<(late?.32:.47))return {ready:false,reason:'Truppen auffüllen'};
    if(s.committed>Math.max(s.home*.70,s.max*.20))return {ready:false,reason:'Truppen bereits an Front gebunden'};
    if(s.home<Math.max(5500,s.strongest*(late?1.25:1.48))&&s.strongest>0){
      const candidates=target?[target]:items.filter(x=>x.id!==null);
      if(!candidates.some(x=>targetOpportunity(me,items,s,x)))
        return {ready:false,reason:'Keine sichere Hinterland-Reserve'};
    }
    return {ready:true,reason:'Kriegsfreigabe'};
  }
  // Optional conservative policy hint: never runs game intents, never opens
  // wars and never overrides a threat/recovery or a manual strategy.
  function qwenStrategyHint(me,items,s,tick,wanted){
    if(!opts.qwenPolicy||!brainReady()||!opts.autoStrategy||
      ['RECOVER','DEFEND','TECH','ASSAULT'].includes(wanted)||
      s.incoming>0||recentHostilePressure(tick)||isWar())return wanted;
    const q=brainState.qwen;
    if(!q||q.matchId!==brainMatchId||tick<q.tick||tick-q.tick>480)return wanted;
    const neutral=items.some(x=>x.id===null&&!x.fallout);
    if(q.strategy==='DEFEND'&&
      q.reasonCode==='THREAT'&&s.strongest>=s.home*.78)return 'DEFEND';
    if(q.strategy==='EXPAND'&&neutral&&s.ratio>=.58&&
      s.strongest<s.home*.60)return 'EXPAND';
    if(q.strategy==='ECONOMY'&&s.strongest<s.home*.80)return 'ECONOMY';
    return wanted;
  }
  function strategy(me,items,s) {
    const tick=number(()=>game.ticks());
    const coolingDown=recentHostilePressure(tick);
    const trend=armyTrend(tick), neutral=items.some(x=>x.id===null);
    const enemies=items.filter(x=>x.id!==null&&x.opponent?.isAlive?.());
    const gold=number(()=>Number(me.gold())),tiles=number(()=>me.numTilesOwned());
    const factoryCount=number(()=>me.units().filter(u=>u.isActive?.()&&u.type?.()==='Factory').length);
    const cityCount=number(()=>me.units().filter(u=>u.isActive?.()&&u.type?.()==='City').length);
    const danger=s.incoming>0 || s.strongest>s.home*.95;
    const rich=gold>900000 || game.config().infiniteGold?.()===true;
    const losing=!!(trend&&trend.home<-Math.max(2000,s.home*.21)&&trend.tiles<=0);
    const late=lateGame(me);
    const rebuilding=(s.ratio<(late?.17:.25) && (s.strongest>s.home*.52 || s.incoming>s.home*.12)) ||
      (losing&&(!late||s.incoming>s.home*.10)) || (s.incoming>s.home*.40);
    const readiness=warReadiness(me,items,s,tick);
    const weak=enemies.filter(x=>hardMode()?targetOpportunity(me,items,s,x):
      s.available>number(()=>x.opponent.troops(),Infinity)*(late?1.17:1.5));
    const fullLate=late&&s.ratio>.78&&!s.incoming&&enemies.length>0;
    const nuclearReady=opts.nukes && game.config().isUnitDisabled?.('Missile Silo')!==true &&
      game.config().isUnitDisabled?.('Atom Bomb')!==true;
    const hasSilo=ownStructures(me).some(u=>u.type?.()==='Missile Silo');

    const seriousAttack=s.incoming>s.home*(late?.15:.05);
    let wanted,reason;
    if(rebuilding){wanted='RECOVER';reason='Truppenverlust oder geringe Reserve';}
    else if(coolingDown){wanted='RECOVER';reason='Nach Großangriff Heimatarmee stabilisieren';}
    else if(danger&&seriousAttack){wanted='DEFEND';reason='Erhebliche eingehende Angriffe';}
    else if(danger&&s.strongest>s.home*1.08 && !weak.length &&
      !(fullLate&&nuclearReady)){
      wanted='DEFEND';reason='Überlegener Nachbar: keine neue Kriegsfront';
    }
    else if(late && weak.length && s.ratio>.30 && !seriousAttack && readiness.ready){
      wanted='ASSAULT';reason='Late Game: günstige Offensivchance';
    }
    else if(fullLate && nuclearReady && (!hasSilo || s.strongest>s.available*.95)){
      wanted='TECH';reason='Late Game: Silo/Raketen finanzieren, statt defensiv festzufahren';
    }
    else if(neutral&&(tiles<900||s.ratio<.60||enemies.length===0)){
      wanted='EXPAND';reason='Unbesetzte Gebiete und Platz für Wachstum';
    }
    else if((factoryCount===0||cityCount===0)&&!rich){wanted='ECONOMY';reason='Wirtschaftlicher Engpass';}
    else if(weak.length && s.ratio>.55 && !s.activeEnemy && !seriousAttack && readiness.ready){
      wanted='ASSAULT';reason='Erreichbarer Gegner mit Kräftevorteil';
    }
    else if(danger){wanted='DEFEND';reason='Starker Nachbar an der Grenze';}
    else if(neutral){wanted='EXPAND';reason='Landnahme vor riskanter Offensive';}
    else {wanted='ECONOMY';reason='Aufbauen und auf sichere Angriffsgelegenheit warten';}
    if(opts.fullAuto&&opts.autoStrategy)wanted=qwenStrategyHint(me,items,s,tick,wanted);
    if(!opts.autoStrategy){
      if(rebuilding)wanted='RECOVER';
      else if(seriousAttack)wanted='DEFEND';
      else if(opts.plan==='Ökonomie')wanted='ECONOMY';
      else if(opts.plan==='Blitz'&&weak.length)wanted='ASSAULT';
      reason='Manuelle Strategie: '+opts.plan;
    }
    if(wanted!==strategic.mode){
      const emergency=wanted==='RECOVER'||(wanted==='DEFEND'&&s.incoming>0);
      if(emergency||tick-strategic.since>=65){
        strategic.mode=wanted;strategic.since=tick;strategic.reason=reason;
        log('STRATEGIE → '+wanted+' · '+reason);
      }
    } else strategic.reason=reason;
    strategic.buildStyle=(!opts.autoStrategy)?opts.buildStyle:
      ['RECOVER','ECONOMY','TECH'].includes(strategic.mode)?'Wirtschaft':
      strategic.mode==='DEFEND'?'Defensiv':'Ausgewogen';
    strategic.groups=items;
    lastRecoveryReason=rebuilding?'Truppen/Front stabilisieren':s.incoming?'Eingehende Angriffe abfangen':!readiness.ready?readiness.reason:'';
    return {wanted:strategic.mode,underAttack:s.incoming>0,neutral,foes:enemies.length,rebuilding,
      reason:strategic.reason,defensive:strategic.mode==='DEFEND'||strategic.mode==='RECOVER',readiness};
  }
  function rankedTargets(items,me,tick,s,context) {
    const available=s.available,aggression=clamp(setting('aggressive'),40,100)/100;
    const late=lateGame(me),bigLead=late&&s.strongest<s.home*.55;
    const ownTiles=number(()=>me.numTilesOwned());
    if(available<100)return [];
    return items.flatMap(item=>{
      const enemy=item.opponent,key=item.id===null?'neutral':String(item.id);
      if(enemy && !enemy.isAlive?.())return [];
      if(enemy && coordinatedWar() && (
        (pendingAttack?.id!==null && pendingAttack?.id!==undefined && pendingAttack.id!==item.id) ||
        (isWar() && item.id!==warState.id) || tick<warState.blockedUntil ||
        !context.readiness?.ready || !targetOpportunity(me,items,s,item)))return [];
      if(tick-(cooldowns.get(key)??-Infinity)<(item.id===null?22:80))return [];
      if(tick-(rejected.get(key)??-Infinity)<25 || tick<(blockedTargets.get(item.id)||0))return [];
      const isNeutral=item.id===null;
      // The game sends attacks from home troops; existing outgoing stacks
      // remain in motion. Don't spend the whole army on parallel attacks.
      if(isNeutral && (s.activeNeutral >= (s.ratio>.63 && !context.underAttack ? 2 : 1) || tick-lastNeutralSend<23))return [];
      if(!isNeutral && (s.activeEnemy >= 1 || tick-lastEnemySend<(hardMode()?(late?65:120):(late?35:68)) || context.rebuilding))return [];
      // If pressured, never begin a fresh offensive -- defense is handled separately.
      if(!isNeutral && s.incoming>s.home*(late?.15:.04))return [];
      if(isNeutral && context.underAttack && s.incoming>s.home*.45)return [];
      const enemyTroops=enemy?number(()=>enemy.troops(),Infinity):0;
      // One target cannot be evaluated as isolated when other large enemies
      // still border our home. This was the main multi-front failure in 1.4.
      const front=enemy?frontRiskPlan(items,s,item.id):null;
      const enemyTiles=enemy?number(()=>enemy.numTilesOwned(),0):0;
      if(!isNeutral) {
        const minimumRatio=enemyOpportunityRatio(enemy,late,s.home,effectivePlan()==='Blitz');
        if(s.ratio<(late?.29:.40) || available<enemyTroops*minimumRatio ||
          s.home<enemyTroops*(hardMode()?(late?1.45:1.85):(late?1.24:1.45)) ||
          front.danger||front.pressure||
          Math.min(available*(hardMode()?.76:.80),
            Math.max(enemyTroops*(hardMode()?1.57:1.40),available*.48))>front.safeStrike||
          enemyTroops<=0 && enemyTiles<=0)return [];
      }
      let score=isNeutral?75:52;
      score+=Math.min(20,Math.log2(item.front+1)*4.5);
      if(isNeutral) {
        if(item.fallout && (s.incoming>0 || s.strongest>s.home*.65 ||
          s.ratio<.60 || available<s.home*.30))return [];
        score+=Math.max(0,45-s.ratio*40)+(ownTiles<600?26:0);
        if(item.fallout)score-=36;
        if(context.wanted==='EXPAND')score+=18;
        if(growthPressure(s))score+=Math.min(22,(s.ratio-.70)*90);
        if(late&&context.foes)score-=38;
      } else {
        score+=Math.max(-65,55-50*enemyTroops/Math.max(available,1));
        score+=Math.min(16,enemyTiles/450);
        const local=targetEconomics(item,tick);
        score+=Math.min(29,local.prize*2.7)-
          Math.min(45,local.posts*12+Math.max(0,local.density-32)*.20);
        if(enemyTiles<300 && enemyTroops<available*.55)score+=14;
        const opening=adversaryWindow(me,enemy);
        // Capitalize on opponents fighting a *different* player, never on
        // allied attacks or their outgoing stacks aimed at us.
        if(opening.exposed && opening.human)score+=Math.min(33,
          Math.round(opening.ratio*23+opening.incomingOthers/opening.home*16));
        if(enemyUnderAttack(enemy) && (!isWar()||warState.id===item.id))score+=23;
        // Early human wars are expensive while clean free land remains.
        // A genuinely exposed player is the exception, not the default.
        if(enemy.type?.()==='HUMAN' && context.neutral && ownTiles<1100 &&
          !opening.exposed && !isWar())score-=35;
        if(enemy.isDisconnected?.()===true)score+=18;
        if(allyAssistTarget(me,enemy))score+=22;
        if(winStatus.urgent)score+=18;
        if(me.hasTransitiveTarget?.(enemy.smallID?.()))score+=12;
        if(plan?.id===item.id && tick<plan.until)score+=23;
        if(effectivePlan()==='Blitz')score+=12;
        if(late)score+=33;
      }
      const amount=isNeutral ?
        Math.floor(neutralAttackAmount(s,aggression)*(item.fallout?.48:1)) :
        Math.min(front.safeStrike,available*(hardMode()?.76:.80),
          Math.max(enemyTroops*(hardMode()?1.57:(1.25+aggression*.20)),available*.48));
      const forecast=!isNeutral?attackForecast(me,item,Math.floor(amount)):null;
      if(forecast){
        score-=Math.min(60,forecast.loss/Math.max(1,amount)*78);
        if(forecast.loss>amount*.78)score-=40;
      }
      if(isNeutral && winStatus.urgent)score+=24;
      const baseScore=score,neuralDelta=neuralActionDelta('attack',score,me,s);
      return [{...item,key,score:score+neuralDelta,baseScore,neuralDelta,forecast,
        amount:Math.min(available,Math.floor(amount))}];
    }).sort((a,b)=>b.score-a.score);
  }
  async function legalTarget(me,item,serial) {
    // Four-at-a-time worker checks remove the old serialized waterfall.
    // A short negative cache prevents probing the same blocked frontier 50x/s.
    const now=number(()=>game.ticks(),0), probes=item.tiles.slice(0,Math.min(24,clamp(setting('maxTargets'),4,25)));
    if(legalNegative.size>500)for(const [k,expiry] of legalNegative)if(expiry<=now)legalNegative.delete(k);
    for(let offset=0;offset<probes.length;offset+=4){
      if(!live(serial))return null;
      const batch=probes.slice(offset,offset+4).filter(tile=>
        (legalNegative.get(String(item.id)+':'+tile)||0)<=now);
      if(!batch.length)continue;
      const results=await Promise.all(batch.map(async tile=>{
        runtime.attackProbes++;
        try{return {tile,allowed:!!(await me.actions(tile,null))?.canAttack};}
        catch(_){return {tile,allowed:false};}
      }));
      if(!live(serial))return null;
      for(const v of results){
        if(v.allowed && safeID(game.owner(v.tile))===item.id)return v.tile;
        legalNegative.set(String(item.id)+':'+v.tile,now+35);
      }
    }
    return null;
  }
  // OpenFront counters incoming attacks against the same opponent 1:1;
  // leaving troops at home usually preserves the Defense Post bonus.
  // Retreating a player attack costs 25% and returns after ~20 game ticks.
  function defenseAssessment(me,s,tick) {
    const hostile=s.inc.filter(a=>{
      try {const p=game.playerBySmallID?.(a.attackerID);
        return !p || !friendly(p,me);}catch(_){return true;}
    });
    const incoming=hostile.reduce((sum,a)=>sum+a.troops,0);
    const home=Math.max(1,s.home),ratio=incoming/home;
    const samples=troopSamples.filter(x=>tick-x.tick<=110);
    const prev=samples[0],land=number(()=>me.numTilesOwned(),0);
    const landLoss=prev&&prev.tiles>0?Math.max(0,(prev.tiles-land)/prev.tiles):0;
    return {incoming,ratio,landLoss,hostile,
      severe:ratio>=.43||(ratio>=.23&&landLoss>=.035),
      critical:ratio>=.80||(ratio>=.40&&landLoss>=.075)};
  }
  function refreshRetreats(me,tick) {
    // Use the UNFILTERED game snapshot: military().out excludes retreating
    // stacks, so disappearance there cannot prove that the retreat succeeded.
    const raw=(()=>{try{return me.outgoingAttacks?.()||[];}catch(_){return [];}})();
    const active=new Map(raw.map(a=>[a.id,a]));
    for(const [id,request] of retreatRequests){
      const a=active.get(id);
      if(a?.retreating){
        retreatRequests.delete(id);defenseStats.retreatsObserved++;
        telemetry('defense_retreat_confirmed','Rückzugsflag im Spielzustand gesehen',
          {attackID:id,target:request.target,troops:a.troops});
      } else if(!a){
        retreatRequests.delete(id);defenseStats.unknown++;
        telemetry('defense_retreat_unknown','Angriffsverband verschwunden: Rückzug oder Verlust unbekannt',
          {attackID:id,target:request.target,expected:request.recoverable});
      } else if(tick-request.tick>=65){
        retreatRequests.delete(id);defenseStats.unconfirmed++;
        telemetry('defense_retreat_unconfirmed','Rückzugsflag fehlt nach Timeout',
          {attackID:id,target:request.target});
      }
    }
  }
  function emergencyRetreat(me,tick,s) {
    refreshRetreats(me,tick);
    const threat=defenseAssessment(me,s,tick);
    if(!threat.incoming){defenseStatus='Keine eingehenden Angriffe';return false;}
    defenseStatus='Eingehend '+Math.floor(threat.incoming/10)+' · Heim '+
      Math.floor(s.home/10)+' · '+Math.round(threat.ratio*100)+'%';
    if(!opts.defense||!threat.severe)return false;
    if(!ctors.cancel){
      defenseStatus+=' · Rückzug-Event nicht gefunden';
      if(tick-lastDefenseLog>=100){lastDefenseLog=tick;
        telemetry('defense_unavailable',defenseStatus,{incoming:threat.incoming,committed:s.committed});}
      return false;
    }
    const candidates=s.out.filter(a=>typeof a.id==='string'&&a.troops>0&&
      !a.retreating&&!retreatRequests.has(a.id));
    if(!candidates.length){defenseStatus+=' · Keine rückrufbaren Angriffe';return false;}
    if(tick-lastEmergencyRetreat<6||retreatRequests.size>=5)return false;
    candidates.sort((a,b)=>{
      const rank=x=>x.targetID===null||x.targetID===0?0:
        (isWar()&&attackTargets(x.targetID,warState.id)?2:1);
      return rank(a)-rank(b)||b.troops-a.troops;
    });
    let issued=0;
    for(const a of candidates){
      const recoverable=a.troops*(a.targetID===null||a.targetID===0?1:.75);
      if(recoverable<Math.max(250,s.home*.025))continue;
      if(!send('cancel',[a.id],'NOT-RÜCKZUG → '+String(a.targetID??'neutral')+
          ' ('+Math.floor(recoverable/10)+' Tr. voraussichtlich zurück)',true))continue;
      retreatRequests.set(a.id,{id:a.id,target:a.targetID,tick,troops:a.troops,recoverable});
      defenseStats.retreatsOrdered++;issued++;
      telemetry('defense_retreat_ordered','Angriff wegen akuter Bedrohung zurückgerufen',
        {attackID:a.id,target:a.targetID,troops:a.troops,recoverable,
          incoming:threat.incoming,home:s.home,critical:threat.critical});
      if(issued>=(threat.critical?3:1)||retreatRequests.size>=5)break;
    }
    if(issued){lastEmergencyRetreat=tick;defenseStatus+=' · '+issued+' Rückzug/Rückzüge angefordert';}
    return issued>0;
  }
  async function defense(me,tick,serial,groups,s) {
    if(!opts.defense||!ctors.attack||!s.incoming||pendingAttack)return false;
    const threat=defenseAssessment(me,s,tick);
    if(threat.severe||threat.incoming>s.home*.24)return false;
    // Only counterattack if enough troops remain safely at home.
    if(s.activeEnemy||s.home<threat.incoming*3.2)return false;
    const attacks=threat.hostile.slice().sort((a,b)=>b.troops-a.troops);
    for(const a of attacks.slice(0,3)){
      let attacker;
      try{attacker=game.playerBySmallID?.(a.attackerID);}catch(_){continue;}
      if(!attacker?.isPlayer?.()||friendly(attacker,me))continue;
      const id=safeID(attacker),key=String(id),their=number(()=>attacker.troops(),Infinity);
      if(coordinatedWar()&&isWar()&&id!==warState.id)continue;
      const spare=s.available;
      if(spare<Math.max(500,their*1.25)||
         tick-(cooldowns.get(key)??-Infinity)<160)continue;
      const candidate=groups.find(x=>x.id===id);
      if(!candidate||!await legalTarget(me,candidate,serial))continue;
      if(!live(serial))return false;
      // Alliances and troop numbers can change while me.actions() awaits.
      const current=game.playerViews?.().find(p=>safeID(p)===id);
      if(!current?.isAlive?.()||friendly(current,me)||
        (coordinatedWar()&&isWar()&&warState.id!==id)){
        telemetry('defense_allied_skip','Gegenangriff nach Allianz-/Frontwechsel verhindert',
          {target:id,friendly:!!current&&friendly(current,me)});
        continue;
      }
      const fresh=military(me,strategic.groups);
      if(fresh.incoming>fresh.home*.24||fresh.activeEnemy||
        fresh.available<Math.max(500,number(()=>current.troops(),Infinity)*1.25))continue;
      const amount=Math.floor(Math.min(fresh.available*.42,fresh.home*.16));
      // This is an actual outgoing counterattack, not a retreat. Preserve
      // the dynamic home reserve as well as the incoming-defense floor.
      if(amount<100||fresh.home-amount<
        Math.max(fresh.incoming*2.8,fresh.reserve))continue;
      if(send('attack',[id,amount],'KONTROLLIERTER GEGENANGRIFF → '+nameOf(current))){
        const out=fresh.out.filter(x=>attackTargets(x.targetID,id)&&!x.retreating);
        pendingAttack={id,name:nameOf(current),tick,amount,ownLand:number(()=>me.numTilesOwned()),
          enemyLand:number(()=>current.numTilesOwned()),beforeIds:out.map(x=>x.id),
          beforeTroops:out.reduce((v,x)=>v+x.troops,0)};
        cooldowns.set(key,tick);lastEnemySend=tick;return true;
      }
    }
    return false;
  }
  async function attack(me,tick,serial,ranked,s) {
    if(!ctors.attack||pendingAttack)return false;
    for(const item of ranked.slice(0,clamp(setting('maxTargets'),4,25))){
      if(!live(serial)||!actionBudget('combat'))return false;
      const tile=await legalTarget(me,item,serial);
      if(tile===null){rejected.set(item.key,tick);continue;}
      // Re-read the live relation after the async worker legality probe.
      if(item.id!==null){
        const current=game.playerViews?.().find(p=>safeID(p)===item.id);
        if(!current?.isAlive?.()||friendly(current,me)||
          (coordinatedWar()&&isWar()&&warState.id!==item.id)){
          telemetry('attack_allied_skip','Angriff nach Allianz-/Frontwechsel verhindert',
            {target:item.id,friendly:!!current&&friendly(current,me)});
          continue;
        }
      }
      // The game state may advance during the async worker legality probe.
      const fresh=military(me,strategic.groups); // Never forget stronger OTHER neighbors on recheck.
      const freshFront=item.id!==null?frontRiskPlan(strategic.groups,fresh,item.id):null;
      if(item.id!==null && (freshFront.danger||freshFront.pressure||
        fresh.incoming>fresh.home*(lateGame(me)?.15:.04) ||
        fresh.activeEnemy>=(lateGame(me)&&fresh.strongest<fresh.home*.55?2:1) ||
        fresh.available<Math.max(100,number(()=>item.opponent.troops(),Infinity)*(lateGame(me)?1.15:1.3))))continue;
      if(item.id===null && fresh.activeNeutral>=1)continue;
      if(item.fallout && (fresh.incoming>0 ||
        fresh.strongest>fresh.home*.65 || fresh.ratio<.60 ||
        fresh.available<fresh.home*.30))continue;
      if(item.id!==null && coordinatedWar() && (!warReadiness(me,strategic.groups,fresh,tick,item).ready ||
        !targetOpportunity(me,strategic.groups,fresh,item) ||
        (isWar()&&warState.id!==item.id)))continue;
      const amount=Math.min(item.amount,fresh.available,
        item.id===null ? neutralAttackAmount(fresh,clamp(setting('aggressive'),40,100)/100) :
        Math.min(freshFront.safeStrike,Math.floor(fresh.available*(hardMode()?.76:.8))));
      if(amount<100)continue;
      const label=item.opponent?nameOf(item.opponent):'neutrales Land';
      if(send('attack',[item.id,amount],`ANGRIFF → ${label} (${Math.floor(amount/10)} Tr.)`)){
        cooldowns.set(item.key,tick);
        if(item.id===null)lastNeutralSend=tick;
        else {
          lastEnemySend=tick;
          plan={id:item.id,until:tick+(hardMode()?1000:300),name:label};
        }
        const before=s.out.filter(a=>attackTargets(a.targetID,item.id)&&!a.retreating);
        pendingAttack={id:item.id,name:label,tick,amount,ownLand:number(()=>me.numTilesOwned()),
          enemyLand:item.opponent?number(()=>item.opponent.numTilesOwned()):0,
          beforeIds:before.map(a=>a.id),beforeTroops:before.reduce((v,a)=>v+a.troops,0),
          forecast:item.forecast||null};
        if(item.opponent?.isDisconnected?.()===true)strategicTelemetry.afkTargets++;
        if(item.opponent && adversaryWindow(me,item.opponent).exposed)
          telemetry('opportunity_attack','Angriff im gegnerischen Mehrfront-Konflikt',
            {target:item.id,window:adversaryWindow(me,item.opponent)});
        if(item.opponent&&allyAssistTarget(me,item.opponent))strategicTelemetry.assists++;
        lastSelection=label+' · score '+item.score.toFixed(0)+
          (item.fallout?' · Fallout-Fallback':'');
        telemetry('attack_intent','Angriff angefordert – wartet auf Bestätigung',
          {target:item.id,troops:amount,baseScore:item.baseScore,
            neuralDelta:item.neuralDelta,chosenScore:item.score,
            kind:item.id===null?'neutral':'enemy'});
        return true;
      }
    }
    return false;
  }
  // canBuild predicts the resulting building tile; the intent retains the queried
  // request tile so the engine resolves it once. canUpgrade is a unit ID, not
  // interchangeable. Own tiles INSIDE the country matter more than border-only probes.
  const STRUCTURE_TYPES=['City','Factory','Port','Defense Post','SAM Launcher','Missile Silo'];
  const ECON_PENDING_TTL=100; // 10 game seconds; new builds appear before construction completes.
  function ownStructures(me) {
    try {return me.units().filter(u=>u?.isActive?.()&&STRUCTURE_TYPES.includes(u.type?.()));}
    catch (_) {return [];}
  }
  function economicUnitsByType(units,type) {return units.filter(u=>u.type?.()===type);}
  function ownedTile(ref,me) {
    try {
      if(!Number.isInteger(ref)||(typeof game.isValidRef==='function'&&!game.isValidRef(ref))||!game.isLand(ref)||game.isImpassable(ref))return false;
      if(typeof game.ownerID==='function' && typeof me.smallID==='function')return game.ownerID(ref)===me.smallID();
      return safeID(game.owner(ref))===safeID(me);
    }catch(_){return false;}
  }
  function buildObserved(pending,units) {
    if(pending.kind==='upgrade')return units.some(u=>u.id?.()===pending.unitId &&
      u.type?.()===pending.type && number(()=>u.level(),0)>pending.level);
    return units.some(u=>u.type?.()===pending.type && number(()=>u.tile(),-9999)===pending.tile);
  }
  function pendingEconomy(tick,units) {
    if(!economicPending)return false;
    if(buildObserved(economicPending,units)){
      economicStatus='Bestätigt: '+economicPending.type;
      successfulEconomyTick=tick;failedEconomyProbes=0;
      telemetry('build_confirmed',economicStatus,{type:economicPending.type,kind:economicPending.kind});
      if(economicPending.type==='Port')telemetry('port_confirmed','Hafen im Spielzustand bestätigt',
        {tile:economicPending.tile,buildKind:economicPending.kind});
      if(['City','Factory','Port'].includes(economicPending.type)){
        const me=myPlayer();
        const sample={tick,type:economicPending.type,
          tile:economicPending.tile,buildKind:economicPending.kind,
          beforeTrain:number(()=>me?.trainGold?.(),NaN),
          beforeTrade:number(()=>me?.tradeGold?.(),NaN),finished:false};
        incomeAttribution.push(sample);
        if(incomeAttribution.length>40)incomeAttribution.shift();
      }
      economicPending=null;
      return false;
    }
    if(tick-economicPending.tick<ECON_PENDING_TTL){
      economicStatus='Warte auf '+economicPending.type+'-Bestätigung';
      return true;
    }
    const k=economicPending.kind+':'+economicPending.type+':'+economicPending.tile;
    economicBlocked.set(k,tick+220);
    failedEconomyProbes++;
    log('BAU nicht bestätigt: '+economicPending.type+' · neuen Standort suchen');
    telemetry('build_unconfirmed','Bauauftrag nicht im Spielzustand bestätigt',
      {type:economicPending.type,tile:economicPending.tile});
    economicPending=null;return false;
  }
  // Cheap, cached strategic view of visible missiles, silos, structures and SAM coverage.
  // SAMs automatically intercept in the engine; the bot only builds/positions them.
  function nuclearIntel(me,ourUnits=ownStructures(me)) {
    const tick=number(()=>game?.ticks?.(),0);
    if(nuclearCache && tick-nuclearCacheTick<24)return nuclearCache;
    const units=(()=>{try{return game.units();}catch(_){return [];}})();
    const myID=safeID(me);
    const enemy=[],friendlyUnits=[],enemySilos=[],enemySAM=[],incomingNukes=[];
    for(const u of units){
      const owner=u.owner?.(),id=safeID(owner),type=u.type?.();
      if(!type||!u.isActive?.())continue;
      if(id===myID || (owner?.isPlayer?.()&&friendly(owner,me))){
        if(STRUCTURE_TYPES.includes(type))friendlyUnits.push(u);
        continue;
      }
      if(type==='Missile Silo')enemySilos.push(u);
      if(type==='SAM Launcher')enemySAM.push(u);
      if(STRUCTURE_TYPES.includes(type)&&owner?.isPlayer?.())enemy.push(u);
      if(['Atom Bomb','Hydrogen Bomb','MIRV','MIRV Warhead'].includes(type)){
        const target=u.targetTile?.();
        if(Number.isInteger(target) && (ownedTile(target,me)||ourUnits.some(o=>{
          const t=number(()=>o.tile?.(),-1);return t>=0 && Math.hypot(game.x(t)-game.x(target),game.y(t)-game.y(target))<115;
        })))incomingNukes.push(u);
      }
    }
    // Tests / older view builds may not include game.units(); own units are still valid.
    const protectedUnits=ourUnits.filter(u=>STRUCTURE_TYPES.includes(u.type?.())).concat(
      friendlyUnits.filter(u=>safeID(u.owner?.())!==myID));
    const sams=protectedUnits.filter(u=>u.type?.()==='SAM Launcher');
    const assets=protectedUnits.filter(u=>['City','Factory','Port','Missile Silo'].includes(u.type?.()));
    const range=s=>number(()=>game.config().samRange(s.level?.()||1),70);
    const uncovered=assets.filter(a=>!sams.some(s=>{
      const r=range(s),x=game.x(a.tile())-game.x(s.tile()),y=game.y(a.tile())-game.y(s.tile());
      return x*x+y*y<=r*r;
    }));
    nuclearCache={enemy,enemySilos,enemySAM,incomingNukes,sams,assets,uncovered,protectedUnits};
    nuclearCacheTick=tick;return nuclearCache;
  }
  function assetValue(type) {return {'City':5,'Factory':5,'Missile Silo':8,'Port':3,'SAM Launcher':7,'Defense Post':2}[type]||1;}
  function samCoverageValue(tile,units,intel) {
    const x=game.x(tile),y=game.y(tile),near=(a,r)=>{
      const dx=x-game.x(a.tile()),dy=y-game.y(a.tile());return dx*dx+dy*dy<=r*r;
    };
    let score=0;
    const radius=number(()=>game.config().samRange?.(1),70);
    for(const u of intel.assets){
      if(!near(u,radius))continue;
      const covered=intel.sams.some(s=>nearSAM(s,u));
      score+=assetValue(u.type?.())*(covered?0.22:2.25);
    }
    for(const sam of intel.sams){if(near(sam,45))score-=65;else if(near(sam,75))score-=22;}
    return score;
  }
  function nearSAM(sam,asset) {
    const r=number(()=>game.config().samRange(sam.level?.()||1),70);
    const dx=game.x(asset.tile())-game.x(sam.tile()),dy=game.y(asset.tile())-game.y(sam.tile());
    return dx*dx+dy*dy<=r*r;
  }
  // Dedicated coast discovery, independent from the 190 generic inland
  // anchors. The worker remains the authority for an actual Port build tile.
  function portCoastalAnchors(me,tiles,tick,limit=40){
    if(!game?.isShore || !opts.boats)return [];
    const result=[],seen=new Set(),w=game.width(),h=game.height();
    const add=t=>{
      if(result.length>=limit || seen.has(t))return;
      seen.add(t);
      if(ownedTile(t,me)&&shoreNear(t))result.push(t);
    };
    const addNear=t=>{
      if(!Number.isInteger(t) || result.length>=limit)return;
      add(t);
      const x=game.x(t),y=game.y(t);
      for(const [dx,dy] of [[5,0],[-5,0],[0,5],[0,-5],
        [10,0],[-10,0],[0,10],[0,-10]]){
        if(result.length>=limit)break;
        if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)add(game.ref(x+dx,y+dy));
      }
    };
    const coastTiles=tiles||[];
    const stride=Math.max(1,Math.ceil(coastTiles.length/650));
    const phase=Math.floor(tick/40)%stride;
    for(let i=phase;i<coastTiles.length&&result.length<limit;i+=stride){
      const t=coastTiles[i];
      if(ownedTile(t,me) && shoreNear(t))addNear(t);
    }
    // A long inland/hostile front need not contain a coastline: rotate a
    // second bounded grid through the whole map as a fallback.
    if(result.length<8){
      const spacing=Math.max(9,Math.ceil(Math.sqrt(w*h/420)));
      const phase2=Math.floor(tick/60)%4,dx=phase2%2?Math.floor(spacing/2):0,
        dy=phase2>=2?Math.floor(spacing/2):0;
      for(let y=Math.floor(spacing/2)+dy;y<h&&result.length<limit;y+=spacing)
        for(let x=Math.floor(spacing/2)+dx;x<w&&result.length<limit;x+=spacing){
          const t=game.ref(x,y);
          if(ownedTile(t,me)&&shoreNear(t))addNear(t);
        }
    }
    return result;
  }
  function economicNeeds(me,units,tiles) {
    const mine=number(()=>me.numTilesOwned(),0);
    const gold=number(()=>Number(me.gold()),0);
    const cap=Math.max(1,troopSnapshot.max||number(()=>game.config().maxTroops(me),1));
    const troops=number(()=>me.troops(),0);
    const threatened=troopSnapshot.incoming>0 || troopSnapshot.strongest>troops*.6;
    const hostileFronts=strategic.groups.filter(g=>g.id!==null&&g.opponent?.isAlive?.()).length;
    const count=type=>economicUnitsByType(units,type).length;
    const cities=count('City'),factories=count('Factory'),ports=count('Port');
    const cityEnabled=game.config().isUnitDisabled?.('City')!==true;
    const factoryEnabled=game.config().isUnitDisabled?.('Factory')!==true;
    const portEnabled=game.config().isUnitDisabled?.('Port')!==true;
    const wantedCity=cityEnabled?(hardMode()?Math.min(13,Math.max(2,2+Math.floor(mine/600))):Math.min(9,Math.max(1,1+Math.floor(mine/900)))):0;
    const wantedFactory=factoryEnabled?(hardMode()?Math.min(11,Math.max(2,2+Math.floor(mine/900))):Math.min(8,Math.max(1,1+Math.floor(mine/1350)))):0;
    const wantedPort=!portEnabled?0:opts.boats?Math.min(3,Math.max(1,Math.floor(mine/1800)+1)):
      (factories>=1 && mine>600?Math.min(2,Math.floor(mine/2700)+1):0);
    const startup=(cityEnabled&&cities<1)||(factoryEnabled&&factories<1);
    const nowTick=number(()=>game.ticks(),0);
    // Eight failed coast scans used to disable first-port planning forever.
    // Retry after a bounded pause: territory and legal build sites can change.
    if(portProbeFailures>=8 && Number.isFinite(lastPortRetryTick) &&
      nowTick-lastPortRetryTick>=800){
      portProbeFailures=0;lastPortRetryTick=nowTick;
    }
    const coastSites=ports===0&&opts.boats?
      portCoastalAnchors(me,tiles,number(()=>game.ticks(),0),8):[];
    const portMilestone=!!(opts.boats&&portEnabled&&ports===0&&!startup&&
      coastSites.length&&portProbeFailures<8);
    const basic=(cityEnabled&&cities<2)||(factoryEnabled&&factories<2);
    // Never buy decorative defense posts while the first city/factory are still
    // unaffordable. Only a *real* incoming offensive can override the basics.
    const immediate=troopSnapshot.incoming>troops*.18;
    const emergency=immediate||(troopSnapshot.strongest>troops*1.25&&
      (troopSnapshot.ratio<.75||hostileFronts>=2));
    // The first Public game purchased 24 defense posts with little economy.
    // Cap non-emergency posts separately from urgent defensive construction.
    const wantedDefense=!threatened||(startup&&!immediate)?0:
      immediate?Math.min(10,Math.max(3,Math.ceil((tiles?.length||0)/165),hostileFronts*2)):
      Math.min(7,Math.max(2,Math.ceil((tiles?.length||0)/310),hostileFronts),
        Math.max(2,(cities+factories)*2));
    const intel=nuclearIntel(me,units);
    const enemySilos=intel.enemySilos.length,enemyNukes=intel.incomingNukes.length;
    const late=lateGame(me),siloCount=count('Missile Silo');
    const proactiveSAM=!basic&&late&&hostileFronts>0&&
      intel.assets.length>=3&&intel.uncovered.length>0&&gold>=700000;
    const threat=!!(enemySilos||enemyNukes);
    const wantedSAM=opts.antiNuke&&game.config().isUnitDisabled?.('SAM Launcher')!==true?
      Math.min(7,threat?Math.max(1,Math.ceil(intel.assets.length/3)+
        Math.ceil(intel.uncovered.length/3)+(enemyNukes?2:0)):
        proactiveSAM?Math.min(2,Math.ceil(intel.uncovered.length/3)):0):0;
    const siloAllowed=opts.nukes && game.config().isUnitDisabled?.('Missile Silo')!==true &&
      ['Atom Bomb','Hydrogen Bomb','MIRV'].some(t=>game.config().isUnitDisabled?.(t)!==true);
    // Earlier requiring 1.8m *before* considering a silo caused endless
    // reinvestment in cheap upgrades. OpenFront silo costs start at 1m.
    const wantedSilo=siloAllowed && (!cityEnabled||cities>=2)&&(!factoryEnabled||factories>=2) && late && mine>900 ?
      (siloCount===0?1:nukeShots>0&&gold>2500000?Math.min(3,1+Math.floor(mine/18000)):1):0;
    const pressure=troops/cap;
    const style=effectiveBuildStyle() || 'Ausgewogen';
    const defBoost=style==='Defensiv'?22:0,econBoost=style==='Wirtschaft'?24:0;
    const list=[
      {type:'City',desired:wantedCity,score:92+econBoost/2+Math.max(0,pressure-.35)*75+
          (pressure>.80&&!immediate?30:0)+(cities===0?115:hardMode()&&cities<2?80:0)},
      {type:'Factory',desired:wantedFactory,score:91+econBoost+
          (factories===0?100:hardMode()&&factories<2?85:0)+
          (gold<450000?15:0)+(pressure<.60&&factories>0?10:0)+
          (factories<2&&cities>=2?24:0)-
          (incomeStatus.observed&&incomeStatus.train===0&&factories>=2?26:0)},
      {type:'Port',desired:wantedPort,score:portMilestone?345:
        59+econBoost/2+(ports===0&&wantedPort?12:0)+
        (incomeStatus.observed&&incomeStatus.trade===0&&ports===0?13:0)},
      {type:'Defense Post',desired:wantedDefense,score:immediate?310+defBoost:threatened?(basic?36:77)+defBoost:20},
      {type:'SAM Launcher',desired:wantedSAM,score:enemyNukes?210+defBoost:threat?151+defBoost:proactiveSAM?118:40},
      {type:'Missile Silo',desired:wantedSilo,score:siloCount===0?305:opts.nukes?(late?131:94)+(gold>6000000?13:0):0}
    ];
    const value=list.filter(x=>x.desired>count(x.type)).map(x=>({...x,count:count(x.type),
      urgency:x.score+Math.min(50,35*(x.desired-count(x.type))/x.desired)}));
    // Upgrades become useful when expansion is tight or troop cap is near.
    if(opts.upgrades){
      for(const x of list.filter(x=>['City','Factory','Port','SAM Launcher','Missile Silo'].includes(x.type)&&count(x.type)>0 &&
        (x.type!=='SAM Launcher'||opts.antiNuke&&(threat||proactiveSAM)) && (x.type!=='Missile Silo'||opts.nukes))){
        const upgradeScore=x.score-(count(x.type)<x.desired?17:36)+
          (x.type==='City'&&pressure>.75?27:0)+(x.type==='SAM Launcher'&&threat?32:0)+
          (x.type==='Missile Silo'&&late&&opts.nukes?22:0);
        value.push({...x,count:count(x.type),upgrade:true,urgency:upgradeScore});
      }
    }
    // Deduplicate type list for game actions, but keep separate build/upgrade priorities.
    value.sort((a,b)=>b.urgency-a.urgency);
    const saveForSilo=siloAllowed && late && !basic && siloCount===0 && !winStatus.urgent;
    const saveForNuke=siloAllowed && late && siloCount>0 &&
      intel.enemy.length>0 && nukeShots===0;
    const firstRocketFund=game.config().isUnitDisabled?.('Atom Bomb')===true?
      (game.config().isUnitDisabled?.('Hydrogen Bomb')===true?
        (game.config().isUnitDisabled?.('MIRV')===true?0:26000000):6400000):1100000;
    const savingsTarget=portMilestone?0:saveForSilo?1150000:saveForNuke?firstRocketFund:0;
    investmentStatus=startup?'Erste Stadt/Fabrik':portMilestone?'Hafen vor Silo':basic?'Zwei Städte und zwei Fabriken':
      saveForSilo?'Silo-Fonds 1,15 Mio.':saveForNuke?'Raketen-Fonds '+firstRocketFund.toLocaleString():'Wirtschaft & Offensive';
    return {list:value,threatened,gold,cities,factories,mine,pressure,nuclearThreat:threat,incomingNukes:enemyNukes,intel,
      startup,basic,emergency,immediate,savingsTarget,saveForSilo,saveForNuke,siloCount,
      enemySilos,proactiveSAM,wantedDefense,wantedSAM,portMilestone,coastSites:coastSites.length,portProbeFailures};
  }
  function economicAnchors(me,tiles,units,tick) {
    const w=game.width(),h=game.height(),anchors=[],seen=new Set();
    const add=ref=>{
      if(anchors.length>=190 || !Number.isInteger(ref)||seen.has(ref))return;
      seen.add(ref);
      if(ownedTile(ref,me))anchors.push(ref);
    };
    const addXY=(x,y)=>{if(x>=0&&y>=0&&x<w&&y<h)add(game.ref(x,y));};
    // Reserve early worker probes for SAMs around uncovered structures.
    // This must happen BEFORE interior/front samples fill the anchor cap.
    if(opts.antiNuke){
      const intel=nuclearIntel(me,units);
      for(const u of intel.uncovered.slice(0,8)){
        const t=number(()=>u.tile(),NaN);
        if(!Number.isInteger(t))continue;
        const x=game.x(t),y=game.y(t);
        for(const [dx,dy] of [[0,0],[25,0],[-25,0],[0,25],[0,-25],
          [45,0],[-45,0],[0,45],[0,-45],[25,25],[-25,-25]])
          addXY(x+dx,y+dy);
      }
    }
    // City/factory upgrades are anchored at existing units; relying on border
    // offsets makes these upgrades almost impossible on large maps.
    for(const u of units){const t=number(()=>u.tile(),NaN);if(!Number.isInteger(t))continue;
      add(t);const x=game.x(t),y=game.y(t);
      for(const [dx,dy] of [[18,0],[-18,0],[0,18],[0,-18],[40,0],[-40,0],[0,40],[0,-40]])addXY(x+dx,y+dy);
      if(anchors.length>=120)break;
    }
    const spawn=me.state?.spawnTile;
    if(Number.isInteger(spawn)){
      const sx=game.x(spawn),sy=game.y(spawn);add(spawn);
      for(const [dx,dy] of [[0,0],[20,0],[-20,0],[0,20],[0,-20],[50,0],[-50,0],[0,50],[0,-50],[80,0],[-80,0],[0,80],[0,-80]])addXY(sx+dx,sy+dy);
    }
    // Sample ALL owned regions, including the interior of a giant country.
    const spacing=Math.max(18,Math.ceil(Math.sqrt(w*h/750)));
    const phase=Math.floor(tick/90)%3;
    for(let y=Math.floor(spacing/2)+phase*3;y<h&&anchors.length<145;y+=spacing)
      for(let x=Math.floor(spacing/2)+phase*3;x<w&&anchors.length<145;x+=spacing)addXY(x,y);
    // Frontline anchors for defensive posts/ports; do not let them crowd out core tiles.
    if(tiles?.length){const step=Math.max(1,Math.floor(tiles.length/55));
      const offset=Math.floor(tick/90)%step;
      for(let i=offset;i<tiles.length&&anchors.length<190;i+=step){const t=tiles[i],x=game.x(t),y=game.y(t);
        add(t);for(const [dx,dy] of [[0,0],[15,0],[-15,0],[0,15],[0,-15],[38,0],[-38,0],[0,38],[0,-38]])addXY(x+dx,y+dy);
      }
    }
    return anchors;
  }
  function frontDistance(ref,fronts) {
    if(!fronts.length)return Infinity;
    const x=game.x(ref),y=game.y(ref);let closest=Infinity;
    for(const t of fronts){const dx=x-game.x(t),dy=y-game.y(t);
      const d=dx*dx+dy*dy;if(d<closest)closest=d;
    }
    return Math.sqrt(closest);
  }
  function shoreNear(ref) {
    if(typeof game.isShore!=='function')return false;
    const x=game.x(ref),y=game.y(ref),w=game.width(),h=game.height();
    for(const [dx,dy] of [[0,0],[8,0],[-8,0],[0,8],[0,-8],[15,0],[-15,0],[0,15],[0,-15]]){
      if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;
      try{if(game.isShore(game.ref(x+dx,y+dy)))return true;}catch(_){}
    }
    return false;
  }
  // The browser GameView does not expose the server's RailNetwork.findStationsPath.
  // Probe ownership/terrain along bounded potential corridors instead of
  // assuming that every station within maxRange can actually connect.
  function railCorridor(from,to){
    const ax=game.x(from),ay=game.y(from),bx=game.x(to),by=game.y(to),
      dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
    if(len<1)return 1;
    const steps=Math.min(140,Math.max(4,Math.ceil(len/2)));
    const pass=(x,y)=>{
      const xx=Math.round(x),yy=Math.round(y);
      if(typeof game.isValidCoord==='function'&&!game.isValidCoord(xx,yy))
        return false;
      if(xx<0||yy<0||xx>=game.width()||yy>=game.height())return false;
      const tile=game.ref(xx,yy);
      return ownedTile(tile,myPlayer())&&game.isLand?.(tile)!==false &&
        game.isImpassable?.(tile)!==true;
    };
    let best=0;
    // Try direct path and two mild bends; this is NOT a verified rail route.
    for(const bend of [0,.12,-.12]){
      let passed=0,longest=0,run=0;
      for(let i=0;i<=steps;i++){
        const t=i/steps,offset=bend*Math.sin(Math.PI*t);
        const x=ax+dx*t-dy*offset,y=ay+dy*t+dx*offset;
        if(pass(x,y)){passed++;run++;longest=Math.max(longest,run);}
        else run=0;
      }
      best=Math.max(best,(passed/(steps+1))*.35+
        (longest/(steps+1))*.65);
    }
    return best;
  }
  function railStationScore(ref,units){
    const cfg=game.config(),min=number(()=>cfg.trainStationMinRange?.(),12);
    const max=number(()=>cfg.trainStationMaxRange?.(),110);
    const x=game.x(ref),y=game.y(ref);
    const stations=units.filter(u=>['City','Factory','Port'].includes(u.type?.()) &&
      !u.isUnderConstruction?.() && u.hasTrainStation?.()!==false);
    let reachable=0,tooClose=0,blocked=0;
    for(const u of stations){
      const tile=number(()=>u.tile(),-1);
      if(tile<0)continue;
      const d=Math.hypot(x-game.x(tile),y-game.y(tile));
      if(d>=min&&d<=max){
        const likelihood=railCorridor(ref,tile);
        if(likelihood>=.83)reachable++;
        else blocked++;
      }
      if(d<min)tooClose++;
    }
    return {reachable,blocked,method:'owned-corridor-proxy',
      score:Math.min(40,reachable*15)-tooClose*30-blocked*7-
        (stations.length>1&&reachable===0?25:0)};
  }
  function siteScore(type,ref,fronts,units,priority,alreadyCoastal,precomputedDist) {
    const distance=precomputedDist===undefined?frontDistance(ref,fronts):precomputedDist;
    const coast=alreadyCoastal ?? shoreNear(ref);
    if(type==='Port'&&!coast)return -Infinity;
    let value=priority;
    if(type==='Defense Post'){
      const range=number(()=>game.config().defensePostRange?.(),30);
      // A post protects WITHIN its range; 32 cells was outside the 30-cell circle.
      if(!fronts.length)value-=75;
      else if(distance>range-3)value-=95+(distance-range)*3;
      else {
        let covered=0,uncovered=0;
        const x=game.x(ref),y=game.y(ref);
        const posts=units.filter(u=>u.type?.()==='Defense Post'&&!u.isUnderConstruction?.());
        for(const ft of fronts){const fx=game.x(ft),fy=game.y(ft);
          if((fx-x)**2+(fy-y)**2>(range-2)**2)continue;
          if(posts.some(p=>{const px=game.x(p.tile()),py=game.y(p.tile());
            return (fx-px)**2+(fy-py)**2<=range**2;}))covered++;
          else uncovered++;
        }
        value+=Math.min(95,uncovered*8)+Math.min(12,covered)-Math.abs(distance-range*.55)*.55;
        if(uncovered===0)value-=75;
      }
    }
    else if(type==='SAM Launcher'){
      // Overlapping bubbles waste gold; protect multiple high-value assets with one SAM.
      const intel=nuclearIntel(myPlayer(),units);
      value+=samCoverageValue(ref,units,intel)+Math.min(10,distance*.05);
    }
    else {
      value+=Number.isFinite(distance)?Math.min(38,distance*.18)-Math.max(0,60-distance)*1.05:25;
      if(['City','Factory','Port'].includes(type))value+=railStationScore(ref,units).score;
      if(type==='Factory'){
        // Favor nearby City/Port infrastructure without assuming rail connectivity.
        const hubs=units.filter(u=>['City','Port'].includes(u.type?.()) &&
          u.isUnderConstruction?.()!==true);
        if(hubs.length){
          const x=game.x(ref),y=game.y(ref);
          const nearest=Math.min(...hubs.map(u=>Math.hypot(x-game.x(u.tile()),y-game.y(u.tile()))));
          value+=nearest>=18&&nearest<=105?22:nearest>160?-20:0;
        }
      }
    }
    const same=units.filter(u=>u.type?.()===type).map(u=>number(()=>u.tile(),-1)).filter(t=>t>=0);
    if(same.length){const x=game.x(ref),y=game.y(ref);
      let nearest=Infinity;
      for(const t of same){const d=Math.hypot(x-game.x(t),y-game.y(t));if(d<nearest)nearest=d;}
      if(nearest<30)value-=33;
      else value+=Math.min(16,nearest*.08);
    }
    return value;
  }
  async function economy(me,tick,serial,tiles) {
    if(!opts.economy || (!ctors.build&&!ctors.upgrade))return false;
    const units=ownStructures(me);
    if(pendingEconomy(tick,units))return false;
    if(tick-lastEconomy<35 || tick-lastEconomyProbe<18)return false;
    lastEconomyProbe=tick;
    for(const [k,expiry] of economicBlocked)if(tick>=expiry)economicBlocked.delete(k);
    for(const [k,expiry] of economicNegative)if(tick>=expiry)economicNegative.delete(k);
    const requirements=economicNeeds(me,units,tiles);
    const entries=requirements.list;
    // Do not waste worker queries or count failed builds while deliberately
    // accumulating funds for the first silo / first atomic strike.
    if(requirements.savingsTarget>0 && !requirements.immediate && requirements.incomingNukes===0 &&
      !game.config().infiniteGold?.() && requirements.gold<requirements.savingsTarget){
      economicStatus='Spare: '+investmentStatus+' ('+Math.floor(requirements.gold).toLocaleString()+
        '/'+requirements.savingsTarget.toLocaleString()+' Gold)';
      return false;
    }
    if(!entries.length){economicStatus='Gebäudeziele erreicht · '+investmentStatus;return false;}
    const types=[...new Set(entries.slice(0,8).map(x=>x.type))];
    const anchors=economicAnchors(me,tiles,units,tick);
    const coastal=opts.boats&&entries.some(e=>e.type==='Port'&&!e.upgrade)?
      portCoastalAnchors(me,tiles,tick,72):[];
    if(!anchors.length && !coastal.length){
      economicStatus='Kein eigenes Bauland gefunden';return false;
    }
    const meID=safeID(me),all=game.playerViews?.()||[];
    const fronts=[];
    const borderStride=Math.max(1,Math.floor((tiles?.length||0)/220));
    for(let i=0;i<(tiles?.length||0);i+=borderStride){
      const tile=tiles[i];if(fronts.length>=160)break;
      const scratch=[];const count=game.neighbors4(tile,scratch);
      for(let n=0;n<count;n++){const owner=game.owner(scratch[n]);
        if(safeID(owner)!==null&&safeID(owner)!==meID&&!friendly(owner,me)){
          fronts.push(tile);break;
        }
      }
    }
    // Incoming attacks can originate from a front not visible in the current
    // sampled border batch; treat the border as provisional defense frontier.
    if(!fronts.length&&requirements.threatened&&tiles?.length){
      const stride=Math.max(1,Math.floor(tiles.length/60));
      for(let i=0;i<tiles.length&&fronts.length<60;i+=stride)fronts.push(tiles[i]);
    }
    const rankedAnchors=anchors.map(ref=>({ref,coast:shoreNear(ref),dist:frontDistance(ref,fronts)}));
    const rankedCoast=coastal.map(ref=>({
      ref,coast:true,dist:frontDistance(ref,fronts)}));
    const siteCache=new Map();
    const score=(entry,site)=>{
      const key=entry.type+':'+site.ref;
      if(!siteCache.has(key))siteCache.set(key,siteScore(entry.type,site.ref,fronts,units,0,site.coast,site.dist));
      return entry.urgency+siteCache.get(key);
    };
    const recovery=failedEconomyProbes>=5;
    const slots=[];
    for(const entry of entries.slice(0,8)){
      if(entry.upgrade && !ctors.upgrade)continue;
      if(!entry.upgrade && !ctors.build)continue;
      // Upgrades must probe existing structures, whereas new buildings probe free land.
      const valid=entry.upgrade?rankedAnchors.filter(a=>units.some(u=>u.type?.()===entry.type && number(()=>u.tile(),-1)===a.ref)):
        entry.type==='Port'?rankedCoast:rankedAnchors;
      valid.sort((a,b)=>score(entry,b)-score(entry,a));
      let ordered=valid;
      if(entry.type==='Port'&&!entry.upgrade&&valid.length>1){
        const offset=buildCursor%valid.length;
        ordered=valid.slice(offset).concat(valid.slice(0,offset));
        buildCursor=(buildCursor+(recovery?5:3))%valid.length;
      }
      for(const site of ordered.slice(0,entry.upgrade?4:recovery?12:6))slots.push({entry,site});
    }
    // Probe best geographic options across building types; never sequentially
    // spend the entire time budget on the first City anchor.
    slots.sort((a,b)=>score(b.entry,b.site)-score(a.entry,a.site));
    const seen=new Set(), proposals=[],perKind=new Map();
    const probe={queries:0,errors:0,legal:0,unaffordable:0,invalidSite:0,lowestCost:Infinity,portQueries:0,portLegal:0};
    const work=[];
    // A dozen City anchors must not evict every Factory / SAM / silo query.
    for(const slot of slots){
      if(work.length>=(recovery?24:15))break;
      const kind=slot.entry.type+':'+!!slot.entry.upgrade;
      if((perKind.get(kind)||0)>=(recovery?5:3))continue;
      const key=kind+':'+slot.site.ref;
      if(seen.has(key)||(economicNegative.get(key)??0)>tick)continue;
      seen.add(key);work.push(slot);
      perKind.set(kind,(perKind.get(kind)||0)+1);
    }
    // A first-port milestone gets a dedicated legal search even if cheaper
    // City/Factory sites happen to rank above the few usable coastal anchors.
    if(requirements.portMilestone && coastal.length &&
      !work.some(x=>x.entry.type==='Port'&&!x.entry.upgrade)){
      const portEntry=entries.find(x=>x.type==='Port'&&!x.upgrade);
      const portSite=portEntry&&coastal.find(x=>
        (economicNegative.get('Port:false:'+x)??0)<=tick);
      if(Number.isInteger(portSite))work.unshift({entry:portEntry,site:{ref:portSite,coast:true,dist:Infinity}});
    }
    // Worker probes stay bounded; record individual negative site/type checks.
    for(let offset=0;offset<work.length;offset+=3){
      if(!live(serial))return false;
      const batch=work.slice(offset,offset+3);
      const answers=await Promise.all(batch.map(async slot=>{
        runtime.buildProbes++;probe.queries++;
        if(slot.entry.type==='Port')probe.portQueries++;
        try{return {slot,legal:await me.actions(slot.site.ref,types)};}
        catch(_){probe.errors++;return {slot,legal:null};}
      }));
      if(!live(serial))return false;
      for(const {slot,legal} of answers){
        if(!legal)continue;
        const {entry,site}=slot;
        if(entry.type!=='Port' && !legal.buildableUnits?.some(u=>u.type===entry.type &&
          (entry.upgrade?u.canUpgrade!==false&&u.canUpgrade!==undefined:
            Number.isInteger(u.canBuild)))){
          const key=entry.type+':'+!!entry.upgrade+':'+site.ref;
          if(economicNegative.size>500)economicNegative.clear();
          economicNegative.set(key,tick+100);
        }
        for(const item of entries.slice(0,8)){
          // The answer belongs to THIS build/upgrade candidate only; otherwise
          // low-priority buildings steal time and sites from high-priority ones.
          if(item!==slot.entry)continue;
          const b=legal?.buildableUnits?.find(u=>u.type===item.type);
          if(!b)continue;
          const isUpgrade=!!item.upgrade;
          if(isUpgrade&&!ctors.upgrade || !isUpgrade&&!ctors.build)continue;
          if(isUpgrade ? (b.canUpgrade===false || b.canUpgrade===undefined) : (b.canBuild===false || (b.canUpgrade!==false && b.canUpgrade!==undefined)))continue;
          probe.legal++;
          if(item.type==='Port')probe.portLegal++;
          const tile=isUpgrade?site.ref:b.canBuild;
          if(!Number.isInteger(tile) || !ownedTile(tile,me)){probe.invalidSite++;continue;}
          const key=(isUpgrade?'upgrade':'build')+':'+item.type+':'+tile;
          if((economicBlocked.get(key)??0)>tick)continue;
          const cost=Number(isUpgrade?(b.upgradeCosts?.[0]??b.cost):b.cost);
          const gold=number(()=>Number(me.gold()),0);
          const infinite=game.config().infiniteGold?.()===true;
          if(Number.isFinite(cost))probe.lowestCost=Math.min(probe.lowestCost,cost);
          if(!infinite && (!Number.isFinite(cost)||cost>gold)){probe.unaffordable++;continue;}
          const essential=(item.type==='City'&&requirements.cities===0)||
            (item.type==='Factory'&&requirements.factories===0)||
            (item.type==='Defense Post'&&requirements.immediate)||
            (item.type==='SAM Launcher'&&requirements.incomingNukes>0)||
            (item.type==='Missile Silo'&&opts.nukes&&lateGame(me));
          const economicCore=item.type==='City'||item.type==='Factory';
          // Fund the first economic structures before buying defensive posts,
          // ports or upgrades. Emergency SAM / defense remain possible.
          if(requirements.startup && (!economicCore || isUpgrade) && !essential)continue;
          if(requirements.portMilestone&&!requirements.immediate&&
            item.type!=='Port' &&
            !(item.type==='SAM Launcher'&&requirements.incomingNukes>0))
            continue;
          if(item.type==='Defense Post' && !requirements.immediate &&
            !requirements.incomingNukes && requirements.basic)continue;
          // While saving for a silo / first atomic strike, do not repeatedly
          // spend the whole treasury on expandable city/factory goals.
          if(!infinite && requirements.savingsTarget>0 && !requirements.immediate &&
            !(item.type==='SAM Launcher'&&requirements.incomingNukes>0) &&
            !(item.type==='Defense Post'&&requirements.immediate) &&
            !(item.type==='Missile Silo'&&requirements.saveForSilo) &&
            gold-cost<requirements.savingsTarget)continue;
          const reserve=gold>650000?Math.min(220000,gold*.12):0;
          if(!infinite&&!essential&&gold-cost<reserve)continue;
          let siteValue=siteScore(item.type,tile,fronts,units,item.urgency);
          if(!Number.isFinite(siteValue))continue;
          if(!infinite && gold>0)siteValue-=Math.min(36,(cost/gold)*26);
          if(isUpgrade)siteValue-=Math.max(0,number(()=>units.find(u=>u.id?.()===b.canUpgrade)?.level(),1)-2)*6;
          if(!isUpgrade && item.count>=item.desired)continue;
          const old=units.find(u=>u.id?.()===b.canUpgrade);
          proposals.push({kind:isUpgrade?'upgrade':'build',type:item.type,tile,requestTile:site.ref,
            unitId:b.canUpgrade,level:number(()=>old?.level(),0),cost,siteValue});
        }
      }
      if(proposals.length)break;
    }
    if(!proposals.length){failedEconomyProbes++;
      if(requirements.portMilestone && probe.portQueries>0 &&
        probe.portLegal===0){
        portProbeFailures++;
        if(portProbeFailures===8)lastPortRetryTick=tick;
      }
      if(requirements.portMilestone && probe.portQueries>0 &&
        (portProbeFailures===1||portProbeFailures===4||portProbeFailures===8))
        telemetry('port_probe','Hafen-Bauplätze im Worker geprüft',
          {coastCandidates:coastal.length,queries:probe.portQueries,
            legal:probe.portLegal,unaffordable:probe.unaffordable,
            failures:portProbeFailures});
      const reason=probe.unaffordable>0&&probe.legal===probe.unaffordable?
        'Gold für gültige Bauoption fehlt':probe.invalidSite>0?
        'Bauplatz-Eigentum/Referenz ungültig':probe.legal===0?
        'Keine legalen Bauoptionen im geprüften Gebiet':'Baukandidaten durch Priorität oder Reserve gesperrt';
      economicStatus=reason;
      if(failedEconomyProbes===5 || failedEconomyProbes%10===0)
        telemetry('build_stalled',reason,{attempts:failedEconomyProbes,
          gold:requirements.gold,investment:investmentStatus,priorities:entries.slice(0,4).map(e=>e.type),
          nuclear:{enemySilos:requirements.enemySilos,incomingNukes:requirements.incomingNukes,
            uncovered:requirements.intel.uncovered.length,wantedSAM:requirements.wantedSAM,
            proactiveSAM:requirements.proactiveSAM},
          queries:probe.queries,workerErrors:probe.errors,legal:probe.legal,
          port:{coastCandidates:coastal.length,queries:probe.portQueries,
            legal:probe.portLegal,failures:portProbeFailures},
          unaffordable:probe.unaffordable,invalidSite:probe.invalidSite,
          lowestCost:Number.isFinite(probe.lowestCost)?probe.lowestCost:null});
      economicLastPlan=entries.slice(0,3).map(x=>x.type).join(' › ');return false;}
    for(const item of proposals){
      item.baseScore=item.siteValue;
      item.neuralDelta=neuralActionDelta('economy',item.siteValue,me, troopSnapshot);
      item.siteValue+=item.neuralDelta;
    }
    proposals.sort((a,b)=>b.siteValue-a.siteValue);
    const chosen=proposals[0];
    if(!live(serial))return false;
    const args=chosen.kind==='upgrade'?[chosen.unitId,chosen.type,1]:[chosen.type,chosen.requestTile];
    if(send(chosen.kind,args,`${chosen.kind==='upgrade'?'UPGRADE':'BAU'} ${chosen.type} · ${chosen.cost.toLocaleString()} Gold`)){
      economicPending={...chosen,tick};failedEconomyProbes=0;lastEconomy=tick;lastEconomicAction=tick;
      if(chosen.type==='Port'){
        portProbeFailures=0;
        telemetry('port_intent','Hafenbau angefordert',
          {tile:chosen.tile,gold:requirements.gold,cost:chosen.cost,
            coastCandidates:coastal.length});
      }
      telemetry('neural_economy_choice','Gepruefte Bauoption gewaehlt',
        {kind:chosen.kind,type:chosen.type,baseScore:chosen.baseScore,
          neuralDelta:chosen.neuralDelta,chosenScore:chosen.siteValue});
      economicStatus='Anfrage: '+chosen.type+(chosen.kind==='upgrade'?' (Upgrade)':'');
      economicLastPlan=entries.slice(0,3).map(x=>x.type).join(' › ');
      return true;
    }
    return false;
  }
  // Launcher uses the SAME BuildUnitIntentEvent the game's build menu uses.
  // For nukes, tile is the ENEMY TARGET, not the launching silo location.
  function nukeTargets(me,intel,kind) {
    const radius=number(()=>game.config().nukeMagnitudes?.(kind).outer,
      kind==='Hydrogen Bomb'||kind==='MIRV'?100:30);
    const players=game.playerViews?.().filter(p=>p?.isAlive?.() && safeID(p)!==safeID(me) && !friendly(p,me))||[];
    const targets=new Set();
    for(const u of intel.enemy){const t=number(()=>u.tile?.(),NaN);if(Number.isInteger(t))targets.add(t);}
    for(const p of players){
      const spawn=p.state?.spawnTile;
      if(Number.isInteger(spawn))targets.add(spawn);
      if(targets.size>95)break;
    }
    const ownAssets=intel.protectedUnits;
    const already=(()=>{try{return game.units().filter(u=>safeID(u.owner?.())===safeID(me) &&
      ['Atom Bomb','Hydrogen Bomb','MIRV'].includes(u.type?.()));}catch(_){return [];}})();
    const proposed=[];
    for(const tile of targets){
      if(!game.isValidRef?.(tile) || game.isImpassable?.(tile))continue;
      const owner=game.owner?.(tile);
      if(!owner?.isPlayer?.() || friendly(owner,me))continue;
      const tx=game.x(tile),ty=game.y(tile);
      const distance=u=>Math.hypot(tx-game.x(u.tile()),ty-game.y(u.tile()));
      // Protect own/allied structures and conservatively sample friendly
      // territory within the blast, not only tiles carrying structures.
      if(ownAssets.some(u=>distance(u)<radius+5))continue;
      let collateral=false;
      if(typeof game.isValidCoord==='function'){
        for(const rr of [radius*.5,radius*.88]){
          for(let angle=0;angle<8;angle++){
            const x=Math.round(tx+Math.cos(angle*Math.PI/4)*rr),
              y=Math.round(ty+Math.sin(angle*Math.PI/4)*rr);
            if(!game.isValidCoord(x,y))continue;
            const p=game.owner(game.ref(x,y));
            if(p?.isPlayer?.()&&friendly(p,me)){collateral=true;break;}
          }
          if(collateral)break;
        }
      }
      if(collateral)continue;
      if(already.some(u=>Number.isInteger(u.targetTile?.()) &&
        Math.hypot(tx-game.x(u.targetTile()),ty-game.y(u.targetTile()))<radius*.9))continue;
      if(nukePending && Math.hypot(tx-game.x(nukePending.tile),ty-game.y(nukePending.tile))<radius)continue;
      let value=0,hit=0;
      for(const u of intel.enemy){
        const d=distance(u);
        if(d<radius){value+=assetValue(u.type?.())*(d<radius*.55?1:.55);hit++;}
      }
      const troops=number(()=>owner.troops?.(),0),tiles=Math.max(1,number(()=>owner.numTilesOwned?.(),1));
      value+=Math.min(8,troops/tiles/1000);
      if(plan?.id===safeID(owner))value+=7;
      if(isWar())value+=safeID(owner)===warState.id?18:-9;
      if(kind==='MIRV' && number(()=>owner.numTilesOwned(),0)>
        Math.max(900,number(()=>game.numLandTiles?.(),0)*.30))value+=25;
      if(hit===0)value-=18;
      const sams=intel.enemySAM.filter(s=>distance(s)<number(()=>game.config().samRange(s.level?.()||1),70));
      // Launching blindly into a SAM bubble wastes expensive rockets.
      value-=sams.reduce((sum,u)=>sum+9+number(()=>u.level?.(),1)*2,0);
      if(sams.length && kind==='Hydrogen Bomb')value-=9;
      if(value>=(kind==='Hydrogen Bomb'||kind==='MIRV'?(lateGame(me)?11:13):(lateGame(me)?5:8)))
        proposed.push({tile,value,hit,sams:sams.length,owner});
    }
    return proposed.sort((a,b)=>b.value-a.value).slice(0,10);
  }
  // Mirror OpenFront PathFinder.Parabola.getParabolaControlPoints:
  // p1/p2 lie at 1/4,3/4 of x and rise max(distance/3,50) in y,
  // clamped to map bounds. The server may choose either rocketDirectionUp,
  // so cover both curves; a trajectory risk is not a certain interception.
  function nukeBezierPoints(spawn,target,up=true){
    const ax=game.x(spawn),ay=game.y(spawn),bx=game.x(target),by=game.y(target),
      dx=bx-ax,dy=by-ay,height=Math.max(Math.hypot(dx,dy)/3,50),
      bound=number(()=>game.height(),Math.max(ay,by)+height+1)-1,
      clampY=y=>Math.min(bound,Math.max(0,y)),sign=up?-1:1;
    return [{x:ax,y:ay},
      {x:ax+dx/4,y:clampY(ay+dy/4+sign*height)},
      {x:ax+dx*3/4,y:clampY(ay+dy*3/4+sign*height)},
      {x:bx,y:by}];
  }
  function nukeBezierPoint(points,t){
    const q=1-t;
    return {x:q*q*q*points[0].x+3*q*q*t*points[1].x+
      3*q*t*t*points[2].x+t*t*t*points[3].x,
      y:q*q*q*points[0].y+3*q*q*t*points[1].y+
      3*q*t*t*points[2].y+t*t*t*points[3].y};
  }
  function nukeTrajectoryRisk(spawn,target,sams){
    if(!Number.isInteger(spawn)||!Number.isInteger(target))return 0;
    const points=[nukeBezierPoints(spawn,target,true),
      nukeBezierPoints(spawn,target,false)];
    const dist=Math.hypot(game.x(target)-game.x(spawn),
      game.y(target)-game.y(spawn));
    const samples=Math.min(160,Math.max(32,Math.ceil(dist/7)));
    return sams.filter(s=>{
      if(s.isActive?.()===false || s.isUnderConstruction?.())return false;
      const x=game.x(s.tile()),y=game.y(s.tile());
      // Tile rounding and the actual engine speed are not a proof of safety:
      // add a small margin, and sample both allowed orientations.
      const rad=number(()=>game.config().samRange(s.level?.()||1),70)+4;
      for(const path of points){
        for(let i=0;i<=samples;i++){
          const p=nukeBezierPoint(path,i/samples);
          if((p.x-x)**2+(p.y-y)**2<=rad*rad)return true;
        }
      }
      return false;
    }).length;
  }
  function rocketReadiness(silos,me){
    const observed=number(()=>me.readyMissileCount?.(),NaN);
    if(Number.isFinite(observed))return Math.max(0,Math.floor(observed));
    return silos.reduce((n,u)=>n+Math.max(0,number(()=>u.level?.(),1)-
      number(()=>u.missileTimerQueue?.().length,0)),0);
  }
  function nukeSalvoPlan(kind,candidate,silos,me,cost,gold,infinite){
    const ready=rocketReadiness(silos,me);
    if(ready<1)return {amount:0,ready};
    if(kind!=='Atom Bomb'||candidate.sams===0||
      candidate.hit<2||candidate.value<20)
      return {amount:1,ready};
    if(ready<2)return {amount:0,ready};
    const x=game.x(candidate.tile),y=game.y(candidate.tile);
    const covering=nuclearIntel(me).enemySAM.filter(u=>{
      const dx=x-game.x(u.tile()),dy=y-game.y(u.tile());
      const r=number(()=>game.config().samRange(u.level?.()||1),70);
      return dx*dx+dy*dy<=r*r;
    });
    const amount=Math.min(6,covering.reduce((n,u)=>
      n+Math.max(1,number(()=>u.level?.(),1)),0)+1);
    const affordable=infinite||gold-cost*amount>=250000;
    return {amount:ready>=amount&&affordable?amount:0,ready};
  }
  function ownMissiles(me) {
    try{return game.units().filter(u=>safeID(u.owner?.())===safeID(me) &&
      ['Atom Bomb','Hydrogen Bomb','MIRV'].includes(u.type?.()));}
    catch(_){return [];}
  }
  function inspectNukeLaunch(me,tick) {
    if(!nukePending)return false;
    const p=nukePending;
    const matches=ownMissiles(me).filter(u=>u.type?.()===p.type && Number.isInteger(u.targetTile?.()) &&
      Math.hypot(game.x(u.targetTile())-game.x(p.tile),game.y(u.targetTile())-game.y(p.tile))<15);
    // An existing missile at the same destination must NOT confirm a second
    // launch. Prefer stable unit IDs, falling back to target-matched counts.
    const unseen=matches.filter(u=>{
      const id=u.id?.();
      return id!==undefined && id!==null && !p.beforeIds.includes(String(id));
    }).length;
    const confirmed=Math.min(p.amount||1,Math.max(unseen,
      matches.length-(p.beforeMatches||0)));
    const added=confirmed-(p.confirmed||0);
    if(added>0){
      nukeShots+=added;p.confirmed=confirmed;
      nukeStatus='Raketenstart bestätigt: '+p.type+' '+confirmed+'/'+(p.amount||1);
      telemetry('nuke_confirmed',nukeStatus,{tile:p.tile,attempt:p.attempt,
        confirmed:nukeShots,partial:confirmed<(p.amount||1)});
      if(confirmed>=(p.amount||1)){nukePending=null;return false;}
      return true;
    }
    if(tick-p.tick>=55){
      nukeUnconfirmed++;
      nukeStatus='Raketenstart NICHT bestätigt – weiter sparen';
      telemetry('nuke_unconfirmed',nukeStatus,{tile:p.tile,type:p.type,attempt:p.attempt});
      nukePending=null;return false;
    }
    return true;
  }
  async function nukeStep() {
    if(nukeBusy||!opts.enabled||!opts.nukes||!connected()||!ctors.build)return;
    const me=myPlayer(),tick=number(()=>game.ticks(),-1);
    if(!me?.isAlive?.()||!me.hasSpawned?.()||game.inSpawnPhase?.()||tick<0)return;
    if(inspectNukeLaunch(me,tick))return;
    if(tick-lastNuke<65 || !actionBudget())return;
    const intel=nuclearIntel(me),silos=ownStructures(me).filter(u=>u.type?.()==='Missile Silo' &&
      !u.isUnderConstruction?.() && !u.isInCooldown?.());
    if(!silos.length){nukeStatus='Kein geladener Silo';return;}
    const gold=number(()=>Number(me.gold()),0),infinite=game.config().infiniteGold?.()===true;
    // Hold funds for defensive anti-nuke infrastructure unless already rich.
    const choices=['MIRV','Hydrogen Bomb','Atom Bomb'].filter(t=>!game.config().isUnitDisabled?.(t) &&
      (infinite||gold>=(t==='MIRV'?26000000:t==='Hydrogen Bomb'?6400000:1100000)));
    if(!choices.length){nukeStatus='Gold für Raketen sparen';return;}
    nukeBusy=true;const serial=generation;
    try {
      for(const kind of choices){
        const candidates=nukeTargets(me,intel,kind);
        for(const candidate of candidates.slice(0,6)){
          if(!live(serial))return;
          let legal;
          try{legal=await me.actions(candidate.tile,[kind]);}catch(_){continue;}
          if(!live(serial))return;
          const built=legal?.buildableUnits?.find(b=>b.type===kind);
          if(!built||built.canBuild===false||!Number.isInteger(built.canBuild))continue;
          const cost=Number(built.cost);
          if(!infinite&&(!Number.isFinite(cost)||gold-cost<
            (kind==='Hydrogen Bomb'||kind==='MIRV'?800000:250000)))continue;
          const routeRisk=nukeTrajectoryRisk(built.canBuild,candidate.tile,intel.enemySAM);
          if(routeRisk>0 && candidate.sams===0 && kind!=='MIRV')continue;
          const salvo=nukeSalvoPlan(kind,candidate,silos,me,cost,gold,infinite);
          if(salvo.amount<1)continue;
          if(!infinite&&gold-cost*salvo.amount<250000)continue;
          // Target may have changed owner while worker checked its legality.
          const o=game.owner(candidate.tile);
          if(!o?.isPlayer?.() || friendly(o,me))continue;
          const prior=ownMissiles(me).filter(u=>u.type?.()===kind &&
            Number.isInteger(u.targetTile?.()) &&
            Math.hypot(game.x(u.targetTile())-game.x(candidate.tile),
              game.y(u.targetTile())-game.y(candidate.tile))<15);
          const beforeIds=prior.map(u=>u.id?.()).filter(id=>id!==undefined&&id!==null).map(String);
          const args=salvo.amount>1?[kind,candidate.tile,undefined,salvo.amount]:[kind,candidate.tile];
          if(send('build',args,`NUKE ${kind} x${salvo.amount} → ${nameOf(o)} (${candidate.hit} Gebäude · ${candidate.value.toFixed(0)} Punkte)`)){
            lastNuke=tick;nukeAttempts++;
            nukePending={tile:candidate.tile,type:kind,tick,beforeIds,amount:salvo.amount,
              beforeMatches:prior.length,attempt:nukeAttempts};
            telemetry('nuke_attempt','Raketen-Befehl abgesendet, noch nicht bestätigt',
              {tile:candidate.tile,type:kind,attempt:nukeAttempts});
            nukeStatus='Start angefordert: '+kind+' · wartet auf Bestätigung';return;
          }
        }
      }
      nukeStatus='Keine rentable, legale Raketenposition';
    }catch(e){nukeStatus='Raketenplanung: '+String(e.message).slice(0,70);}
    finally{nukeBusy=false;paint();}
  }
  // The live game already holds ACCEPT and DECLINE callbacks on the incoming
  // alliance-request card. Prefer these: they close over the *real* game event
  // constructors, even if production minification hides/merges class names.
  // Never invoke a generic card just because it has buttons: verify requester
  // small ID, the three-button request layout, game ownership and expiry.
  function incomingAllianceCards(tick) {
    const cards=new Map();
    const widget=document.querySelector('actionable-events');
    if(!widget || widget.game!==game || !Array.isArray(widget.events)) return cards;
    for(const e of widget.events) {
      if(!Number.isInteger(e.requestorID) || e.focusID!==e.requestorID ||
        !Array.isArray(e.buttons) || e.buttons.length!==3 ||
        typeof e.buttons[1]?.action!=='function' || typeof e.buttons[2]?.action!=='function' ||
        (Number.isFinite(e.createdAt) && Number.isFinite(e.duration) &&
        tick-e.createdAt>=e.duration))continue;
      const p=game.playerBySmallID?.(e.requestorID);
      if(p?.isAlive?.())cards.set(safeID(p),{player:p,card:e});
    }
    return cards;
  }
  function diplomacyScore(me,p,s,offered=false) {
    if(!p?.isAlive?.() || safeID(p)===safeID(me) || friendly(p,me))
      return {score:-999,reason:'Ungültiger / verbündeter Spieler'};
    if(p.isTraitor?.())return {score:-999,reason:'Verräter'};
    const their=Math.max(0,number(()=>p.troops()));
    const own=Math.max(1,number(()=>me.troops()));
    const territory=Math.max(0,number(()=>p.numTilesOwned()));
    const mine=Math.max(1,number(()=>me.numTilesOwned()));
    const hostileIncoming=s.inc?.some(a=>a.attackerID===p.smallID?.());
    const hostileOutgoing=s.out?.some(a=>attackTargets(a.targetID,p));
    if(hostileIncoming||hostileOutgoing)return {score:-999,reason:'Aktiver Konflikt'};
    if(opts.autoStrategy && strategic.mode==='ASSAULT'&&plan?.id===safeID(p))
      return {score:-100,reason:'Aktuelles Angriffsziel'};
    let score=38;
    score+=Math.min(27,Math.log2(1+their/own)*18);
    score+=Math.min(15,Math.log2(1+territory/mine)*10);
    if(s.incoming>own*.12)score+=23;
    if(s.strongest>own*.8)score+=13;
    if(their<own*.22 && s.incoming===0)score-=26;
    if(territory<mine*.15 && s.incoming===0)score-=12;
    if(safeID(p)===plan?.id)score-=70;
    const alliances=number(()=>me.alliances?.().length);
    if(alliances>=3)score-=36;
    if(offered && strategic.mode==='ASSAULT' && their<own*.75)score-=18;
    // Strategic offers can secure a major border before/while fighting a
    // different nation. Never reward alliance with our active war target.
    if(offered && their>=own*.85 && !hostileIncoming && !hostileOutgoing &&
      warState.id!==safeID(p))score+=22;
    return {score,reason:score>=58?'Schutz/Kooperation nützlich':'Strategischer Nutzen gering'};
  }
  // Diplomacy is a priority channel. The normal minute and attack-burst limits
  // must not prevent a timely reply; a separate 700-ms limiter prevents spam.
  function answerAlliance(me,p,accept,card,tick,reason,tryCount) {
    if(!opts.enabled || !opts.diplomacy || !connected() || !permittedMatch(game) ||
      Date.now()-lastDiplomaticEmit<700)return false;
    const label=nameOf(p),key=accept?'alliance':'reject';
    let path='';
    if(card?.buttons?.[accept?1:2]?.action) {
      try {
        card.buttons[accept?1:2].action();
        actions.push(Date.now());lastEmission=Date.now();totalSent++;
        path='Spiel-UI';
        log('ALLIANZ '+(accept?'ANNAHME':'ABLEHNUNG')+' GESENDET: '+label+' · '+reason+' (Spiel-UI)');
      } catch(e){totalFailed++;log('Allianz-UI antwortet nicht: '+String(e.message));}
    }
    if(!path) {
      if(!ctors[key]) {
        diplomacyStatus='Anfrage von '+label+': keine Antwortaktion gefunden';
        const marker=String(safeID(p));
        if(!diplomacyMissingLogged.has(marker)) {
          diplomacyMissingLogged.add(marker);
          telemetry('alliance_missing_action',diplomacyStatus,
            {availableIntents:Object.keys(ctors),hasUI:!!card});
          console.warn(PREFIX,diplomacyStatus,'(bei fehlendem Konstruktor: actionable-events prüfen)');
        }
        return false;
      }
      if(!send(key,accept?[me,p]:[p],
        'ALLIANZ '+(accept?'ANNAHME':'ABLEHNUNG')+' GESENDET: '+label+' · '+reason+' (Intent)',true))return false;
      path='Intent';
    }
    lastDiplomaticEmit=Date.now();
    diplomacyPending.set(safeID(p),{accept,sentTick:tick,tries:tryCount,
      name:label,reason,path});
    diplomacyStatus=(accept?'Annahme':'Ablehnung')+' gesendet: '+label+' · Bestätigung ausstehend';
    telemetry('alliance_reply_sent',diplomacyStatus,
      {requestor:safeID(p),accept,method:path,tries:tryCount});
    return true;
  }
  function diplomacyTick() {
    try {diplomacyTickSafe();}
    catch(e){diplomacyStatus='Diplomatie-Fehler: '+String(e?.message||e).slice(0,95);
      console.warn(PREFIX,'Diplomatie:',e);
      telemetry('alliance_error',diplomacyStatus);paint();}
  }
  function diplomacyTickSafe() {
    if(!opts.enabled)return;
    if(!opts.diplomacy){diplomacyStatus='Diplomatie im Menü AUS';return;}
    if(!connected()){diplomacyStatus='Diplomatie wartet auf aktive Partie';return;}
    if(game.config().disableAlliances?.()===true){diplomacyStatus='Allianzen in Spieleinstellungen deaktiviert';return;}
    if(game.inSpawnPhase?.())return;
    const me=myPlayer(),tick=number(()=>game.ticks(),-1);
    if(!me?.hasSpawned?.()||!me?.isAlive?.()||tick<0||tick-lastDiplomacyTick<8)return;
    lastDiplomacyTick=tick;
    for(const [id,until] of diplomacyHandled)if(tick>=until)diplomacyHandled.delete(id);
    const cards=incomingAllianceCards(tick);
    const players=game.playerViews().filter(p=>safeID(p)!==safeID(me)&&p.isAlive?.());
    // Pending replies are checked against *observable game state*, not counted
    // as successful merely because EventBus.emit/callback returned normally.
    for(const [id,pending] of diplomacyPending) {
      const p=players.find(x=>safeID(x)===id);
      if(!p){diplomacyPending.delete(id);continue;}
      const allied=friendly(p,me),requesting=!!p.isRequestingAllianceWith?.(me);
      const visible=cards.has(id);
      if(allied || (!requesting && !visible)) {
        const confirmed=pending.accept?allied:!allied;
        const result=confirmed?'Bestätigt':'Nicht bestätigt';
        diplomacyStatus=(pending.accept?'Annahme':'Ablehnung')+' '+result+': '+pending.name;
        if(confirmed)diplomacyStats[pending.accept?'accepted':'rejected']++;
        telemetry('alliance_reply_result',diplomacyStatus,
          {requestor:id,confirmed,accept:pending.accept,tries:pending.tries});
        log('ALLIANZ '+diplomacyStatus);
        diplomacyPending.delete(id);
        diplomacyHandled.set(id,tick+220);
        if(allied && warState.id===id){warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};plan=null;}
        continue;
      }
      if(tick-pending.sentTick<45)continue;
      if(pending.tries>=3) {
        diplomacyPending.delete(id);diplomacyHandled.set(id,tick+140);
        diplomacyStatus='Allianzantwort nicht bestätigt: '+pending.name;
        telemetry('alliance_reply_timeout',diplomacyStatus,
          {requestor:id,accept:pending.accept,tries:pending.tries});
        continue;
      }
      // Retain the attempt counter; the incoming pass below retries after the wait.
    }
    const incoming=players.filter(p=>!friendly(p,me)&&
      (p.isRequestingAllianceWith?.(me)||cards.has(safeID(p))));
    if(incoming.length) {
      const s=military(me,strategic.groups);
      for(const p of incoming) {
        const id=safeID(p);
        const previous=diplomacyPending.get(id);
        if(diplomacyHandled.has(id)|| (previous && tick-previous.sentTick<45))continue;
        const judgement=diplomacyScore(me,p,s),accept=judgement.score>=58;
        const oldTry=previous?.tries||0;
        diplomacyPending.delete(id);
        telemetry('alliance_detected','Anfrage von '+nameOf(p),
          {requestor:id,score:judgement.score,accept,reason:judgement.reason,
            viaCard:cards.has(id),acceptCtor:!!ctors.alliance,rejectCtor:!!ctors.reject});
        answerAlliance(me,p,accept,cards.get(id)?.card,tick,judgement.reason,oldTry+1);
        paint();return; // Incoming diplomacy has priority over outgoing offers.
      }
      return;
    }
    if(renewAlliances(me,tick))return;
    if(!opts.offerAlliances || !ctors.alliance || !actionBudget() ||
      tick-lastProposalTick<850)return;
    const s=military(me,strategic.groups);
    const candidates=strategic.groups.filter(g=>g.id!==null&&g.opponent &&
      !diplomacyHandled.has(g.id)&&!diplomacyPending.has(g.id)&&
      (warState.id===null||g.id!==warState.id)&&
      (!['ASSAULT','EXPAND'].includes(strategic.mode) ||
        number(()=>g.opponent.troops(),0)>=number(()=>me.troops(),1)*.85)&&
      !me.isRequestingAllianceWith?.(g.opponent))
      .map(g=>({g,...diplomacyScore(me,g.opponent,s,true)}))
      .filter(x=>x.score>=80).sort((a,b)=>b.score-a.score);
    if(!candidates.length)return;
    const chosen=candidates[0];
    const target=chosen.g.opponent,serial=generation,anchor=chosen.g.tiles?.[0];
    if(!Number.isInteger(anchor))return;
    lastProposalTick=tick;
    Promise.resolve(me.actions(anchor,null)).then(a=>{
      if(!live(serial)||game.inSpawnPhase?.()||!opts.diplomacy||!opts.offerAlliances)return;
      if(!a?.interaction?.canSendAllianceRequest||safeID(game.owner(anchor))!==safeID(target) ||
        me.isRequestingAllianceWith?.(target)||friendly(target,me))return;
      if(send('alliance',[me,target],
        'ALLIANZ ANGEBOTEN: '+nameOf(target)+' · Wert '+Math.round(chosen.score))) {
        diplomacyHandled.set(safeID(target),tick+1050);diplomacyStats.offered++;
        diplomacyStatus='Bündnis angeboten: '+nameOf(target);
        telemetry('alliance_offer_sent',diplomacyStatus,{requestor:safeID(target)});
      }
    }).catch(e=>{diplomacyStatus='Allianzangebot fehlgeschlagen: '+String(e.message);});
  }
  function inspectMarine(me,tick){
    const units=(()=>{try{return game.units?.()||[];}catch(_){return [];}})();
    const mine=safeID(me),own=type=>units.filter(u=>
      u.type?.()===type&&safeID(u.owner?.())===mine&&u.isActive?.());
    if(pendingBoat){
      const boat=pendingBoat,ships=own('Transport');
      const isNew=u=>{
        const id=u.id?.();
        return id!==undefined&&!boat.beforeIds.includes(id);
      };
      // Player targets may be inland. OpenFront resolves the intent to the
      // nearest reachable shore, so accept the new own transport even when
      // its real target differs from the originally queried tile.
      const observed=ships.find(u=>isNew(u)&&u.targetTile?.()===boat.dest)||
        ships.find(isNew);
      if(observed){
        const id=observed.id?.();
        const resolved=observed.targetTile?.();
        if(Number.isInteger(resolved))boat.resolvedDest=resolved;
        if(!boat.shipIds.includes(id))boat.shipIds.push(id);
        if(!boat.seen){
          boat.seen=true;marineStats.transportConfirmed++;
          fleetStatus='Transport im Spiel sichtbar';
          telemetry('boat_confirmed','Transport im Spielzustand beobachtet',
            {dest:boat.dest,resolvedDest:boat.resolvedDest??null,
              target:boat.target,ship:id,troops:boat.troops});
          if(boat.playerID&&coordinatedWar()&&warState.id===null){
            const target=game.playerViews?.().find(p=>safeID(p)===boat.playerID);
            if(target?.isAlive?.()&&!friendly(target,me)){
              warState={id:boat.playerID,name:nameOf(target),since:tick,blockedUntil:-Infinity};
              telemetry('naval_war_lock','Bestätigte Landung als Hauptkriegsziel gebunden',
                {target:boat.playerID,resolvedDest:boat.resolvedDest??null});
            }
          }
        }
      }
      const landingTile=Number.isInteger(boat.resolvedDest)?boat.resolvedDest:boat.dest;
      if(boat.seen && ownedTile(landingTile,me)){
        marineStats.transportArrived++;
        fleetStatus='Landung / Gebiet am Ziel bestätigt';
        telemetry('boat_arrived','Transportziel nach bestätigtem Schiff übernommen',
          {dest:boat.dest,resolvedDest:landingTile,target:boat.target,shipIds:boat.shipIds});
        navalCooldown.set(boat.key,tick+140);
        pendingBoat=null;
      }else if(boat.seen && tick-boat.tick>40 &&
        !ships.some(u=>boat.shipIds.includes(u.id?.()))){
        marineStats.transportUnresolved++;
        fleetStatus='Transport verschwunden – Landung nicht bestätigt';
        telemetry('boat_unresolved','Transport nicht mehr sichtbar; kein eigener Zielbesitz',
          {dest:boat.dest,resolvedDest:landingTile,target:boat.target,shipIds:boat.shipIds});
        navalCooldown.set(boat.key,tick+320);navalBackoffUntil=tick+180;pendingBoat=null;
      }else if(tick-boat.tick>(boat.seen?650:90)){
        if(boat.seen)marineStats.transportUnresolved++;
        else marineStats.transportUnconfirmed++;
        fleetStatus=boat.seen?'Transport ohne Landungsbestätigung':
          'Transport nach Intent nicht im Spiel beobachtet';
        telemetry(boat.seen?'boat_unresolved':'boat_unconfirmed',fleetStatus,
          {dest:boat.dest,target:boat.target,troops:boat.troops});
        navalCooldown.set(boat.key,tick+400);navalBackoffUntil=tick+240;pendingBoat=null;
      }
    }
    if(pendingWarship){
      const pending=pendingWarship,ships=own('Warship');
      const observed=ships.find(u=>!pending.beforeIds.includes(u.id?.()));
      if(observed){
        marineStats.warshipConfirmed++;
        fleetStatus='Kriegsschiff im Spiel bestätigt';
        telemetry('warship_confirmed','Kriegsschiff im Spielzustand sichtbar',
          {tile:observed.tile?.(),unitId:observed.id?.(),cost:pending.cost});
        pendingWarship=null;
      }else if(tick-pending.tick>110){
        marineStats.warshipUnconfirmed++;
        fleetStatus='Kriegsschiff-Befehl nicht bestätigt';
        telemetry('warship_unconfirmed',fleetStatus,
          {tile:pending.tile,cost:pending.cost});
        pendingWarship=null;
      }
    }
  }
  function sendMarineTransport(me,dest,troops,tick,label,targetKey){
    if(pendingBoat || (navalCooldown.get(targetKey)||0)>tick)return false;
    if(!Number.isInteger(dest)||!(troops>=1000))return false;
    const beforeIds=(()=>{try{return (game.units?.()||[]).filter(u=>
      u.type?.()==='Transport'&&safeID(u.owner?.())===safeID(me))
      .map(u=>u.id?.());}catch(_){return [];}})();
    if(!send('boat',[dest,troops],label))return false;
    pendingBoat={dest,tick,troops,key:targetKey,target:label,
      playerID:targetKey.startsWith('player:')?targetKey.slice(7):null,
      resolvedDest:null,beforeIds,shipIds:[],seen:false};
    marineStats.transportSent++;
    navalCooldown.set(targetKey,tick+160);
    fleetStatus='Transport angefordert · Bestätigung ausstehend';
    telemetry('boat_intent','Transport angefordert; wartet auf Spielzustand',
      {dest,troops,target:targetKey});
    return true;
  }
  // Protect real owned shores from visible incoming transports. BuildUnitIntentEvent
  // for Warship uses an actual WATER tile checked through the worker.
  async function fleetDefense(me,tick,serial){
    if(!opts.boats||tick-lastFleet<120||!game.units)return false;
    const all=game.units()||[],ourID=safeID(me);
    const ownWarships=all.filter(u=>u.type?.()==='Warship'&&
      safeID(u.owner?.())===ourID&&u.isActive?.());
    if(ctors.cancelBoat){
      const unsafe=all.find(u=>u.type?.()==='Transport'&&u.isActive?.() &&
        safeID(u.owner?.())===ourID&&Number.isInteger(u.targetTile?.())&&
        game.owner(u.targetTile())?.isPlayer?.() &&
        friendly(game.owner(u.targetTile()),me) &&
        !u.transportShipState?.().isRetreating);
      if(unsafe&&Number.isInteger(unsafe.id?.())&&send('cancelBoat',[unsafe.id()],
        'LANDUNG ABBRECHEN: Ziel jetzt verbündet',true)){
        lastFleet=tick;fleetStatus='Landung abgebrochen';return true;
      }
    }
    const targets=all.filter(u=>u.type?.()==='Transport'&&u.isActive?.() &&
      safeID(u.owner?.())!==ourID&&!friendly(u.owner?.(),me)&&
      Number.isInteger(u.targetTile?.())&&ownedTile(u.targetTile(),me));
    const active=targets.find(u=>!u.transportShipState?.().isRetreating);
    const water=active?.tile?.();
    if(active&&ctors.warship&&Number.isInteger(water)&&game.isWater?.(water)){
      const ship=ownWarships.find(u=>Number.isInteger(u.id?.()) &&
        game.euclideanDistSquared?.(u.tile(),water)<300*300);
      if(ship&&send('warship',[[ship.id()],water],
        'KRIEGSSCHIFF → feindlichen Transporter abfangen')){
        lastFleet=tick;fleetStatus='Transporter abfangen';return true;
      }
    }
    if(pendingWarship||!ctors.build ||
      game.config().isUnitDisabled?.('Warship')===true)return false;
    const ports=ownStructures(me).filter(u=>u.type?.()==='Port'&&
      !u.isUnderConstruction?.());
    if(!ports.length){
      if(active)fleetStatus='Küstenschutz: Hafen fehlt';
      return false;
    }
    // Build one escort before the silo fund, a second only after the first
    // has appeared in the game. More hulls require a real incoming landing.
    const desired=active?Math.min(3,ports.length+1):
      number(()=>me.numTilesOwned(),0)>=15000?2:1;
    if(ownWarships.length>=desired)return false;
    const gold=number(()=>Number(me.gold()),0);
    if(!active && gold<450000 && !game.config().infiniteGold?.())return false;
    let probes=0,legalFound=0;
    for(const port of ports.slice(0,3)){
      const x=game.x(port.tile()),y=game.y(port.tile());
      for(const radius of [3,6,10,15,20]){
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],
          [1,1],[-1,1],[1,-1],[-1,-1]]){
          const xx=x+dx*radius,yy=y+dy*radius;
          if(!valid(xx,yy))continue;
          const tile=game.ref(xx,yy);
          if(!game.isWater?.(tile))continue;
          let response;
          try{response=await me.actions(tile,['Warship']);probes++;}
          catch(_){continue;}
          if(!live(serial))return false;
          const ship=response?.buildableUnits?.find(u=>u.type==='Warship'&&
            Number.isInteger(u.canBuild));
          if(!ship)continue;
          legalFound++;
          const cost=Number(ship.cost);
          if(!game.config().infiniteGold?.() &&
            (!Number.isFinite(cost)||gold<cost))continue;
          // canBuild is the launch PORT; the intent expects the queried WATER patrol tile.
          if(send('build',['Warship',tile],
            (active?'KÜSTENSCHUTZ':'FLOTTENAUFBAU')+' → Kriegsschiff')){
            pendingWarship={tick,tile,spawnTile:ship.canBuild,cost,
              beforeIds:ownWarships.map(u=>u.id?.())};
            marineStats.warshipSent++;lastFleet=tick;
            fleetStatus='Kriegsschiff angefordert · Bestätigung ausstehend';
            telemetry('warship_intent','Kriegsschiff-Bau angefordert',
              {tile,spawnTile:ship.canBuild,cost,ports:ports.length,
                priorWarships:ownWarships.length,emergency:!!active});
            return true;
          }
        }
      }
    }
    if(probes){
      lastFleet=tick;
      fleetStatus=legalFound?'Kriegsschiff: Gold/Budget fehlt':
        'Kriegsschiff: kein legaler Wasser-Bauplatz';
      telemetry('warship_probe',fleetStatus,{probes,legalFound,
        ports:ports.length,gold,warships:ownWarships.length});
    }
    return false;
  }
  // Team aid is guarded by same-team identity, real incoming threats,
  // available HOME troops, and the silo fund. No speculative allied donations.
  function teamSupport(me,tick,s){
    if(winStatus.mode!=='Team'||tick-lastDonation<300 || !actionBudget())return false;
    const team=me.team?.();if(team===null||team===undefined)return false;
    const partners=(game.playerViews?.()||[]).filter(p=>
      p!==me&&p.isAlive?.()&&p.team?.()===team&&me.isOnSameTeam?.(p));
    if(!partners.length)return false;
    const needy=partners.map(p=>({p,incoming:(p.incomingAttacks?.()||[])
      .filter(a=>!a.retreating).reduce((n,a)=>n+number(()=>a.troops,0),0)}))
      .sort((a,b)=>b.incoming-a.incoming)[0];
    if(!needy || needy.incoming<number(()=>needy.p.troops(),1)*.35 ||
      s.incoming>0 || s.strongest>=s.home*.85)return false;
    const amount=Math.floor(Math.min(s.available*.18,s.home*.08));
    if(ctors.donateTroops && amount>=1000 &&
      s.home-amount>Math.max(s.home*.35,s.strongest*.6) &&
      send('donateTroops',[needy.p,amount],'TEAMHILFE → '+nameOf(needy.p))){
      lastDonation=tick;return true;
    }
    const gold=number(()=>Number(me.gold()),0);
    const reserve=economicNeeds(me,ownStructures(me),[]).savingsTarget;
    const amountGold=Math.floor(Math.min(gold*.06,250000));
    if(ctors.donateGold && gold>1200000 && amountGold>=50000 &&
      gold-amountGold>=Math.max(reserve,750000) &&
      send('donateGold',[needy.p,BigInt(amountGold)],'TEAMGOLD → '+nameOf(needy.p))){
      lastDonation=tick;return true;
    }
    return false;
  }
  function renewAlliances(me,tick){
    if(!opts.diplomacy||!ctors.extend)return false;
    for(const a of me.alliances?.()||[]){
      if(!a.hasExtensionRequest||a.expiresAt-tick>250||a.expiresAt<=tick ||
        (diplomacyHandled.get('extend:'+a.id)||0)>tick)continue;
      const partner=game.playerViews().find(p=>safeID(p)===a.other);
      if(partner&&friendly(partner,me)&&send('extend',[partner],
        'ALLIANZ VERLÄNGERN → '+nameOf(partner),true)){
        diplomacyHandled.set('extend:'+a.id,tick+125);return true;
      }
    }
    return false;
  }
  // Bounded rotating grid: seek actual unowned LAND shore tiles on islands.
  // The worker validates water access and the real Transport deployment.
  // A sample may miss a tiny island this pass; successive calls rotate phase.
  // Bounded island-size estimate from the client-visible terrain. Never infer
  // a large beachhead merely from one reachable coastal tile.
  function neutralIslandEstimate(tile,limit=1800){
    if(typeof game?.neighbors4!=='function')return null;
    const pending=[tile],seen=new Set([tile]);let counted=0,hadNeighbors=false;
    while(pending.length&&counted<limit){
      const cur=pending.pop();
      if(!game.isLand(cur)||game.isImpassable?.(cur)||
        game.hasFallout?.(cur)||safeID(game.owner(cur))!==null)continue;
      counted++;
      const adjacent=[];
      const n=game.neighbors4(cur,adjacent)||0;
      if(n>0)hadNeighbors=true;
      for(let i=0;i<n;i++){
        const next=adjacent[i];
        if(!Number.isInteger(next)||seen.has(next))continue;
        seen.add(next);
        if(game.isLand(next)&&!game.isImpassable?.(next)&&
          !game.hasFallout?.(next)&&safeID(game.owner(next))===null)
          pending.push(next);
      }
    }
    return hadNeighbors?counted:null;
  }
  function neutralNavalCandidates(me,limit=12){
    if(!game.isShore||!game.width||!game.height)return [];
    const w=game.width(),h=game.height();
    if(!(w>0&&h>0))return [];
    const dx=Math.max(1,Math.ceil(w/40)),dy=Math.max(1,Math.ceil(h/40));
    const phase=navalSweep++%16;
    const ox=Math.floor((phase%4)*dx/4),oy=Math.floor(Math.floor(phase/4)*dy/4);
    const own=number(()=>me.state?.spawnTile,NaN);
    const result=[];
    for(let y=Math.floor(dy/2)+oy;y<h;y+=dy){
      for(let x=Math.floor(dx/2)+ox;x<w;x+=dx){
        try{
          const tile=game.ref(x,y);
          if(!game.isLand(tile)||game.isImpassable?.(tile)||
            !game.isShore(tile)||game.hasFallout?.(tile))continue;
          const owner=game.owner(tile);
          if(owner?.isPlayer?.()||safeID(owner)!==null)continue;
          const distance=Number.isInteger(own)?
            Math.hypot(x-game.x(own),y-game.y(own)):0;
          const neighbors=[];
          let nearbyNeutral=0,nearbyHostile=0;
          try{
            const n=game.neighbors4?.(tile,neighbors)||0;
            for(let i=0;i<n;i++){
              const other=game.owner(neighbors[i]);
              if(safeID(other)===null&&game.isLand(neighbors[i]))nearbyNeutral++;
              else if(other?.isPlayer?.()&&!friendly(other,me))nearbyHostile++;
            }
          }catch(_){}
          const score=nearbyNeutral*22-nearbyHostile*34-distance*.008;
          result.push({tile,distance,score});
        }catch(_){}
      }
    }
    for(const site of result){
      site.baseScore=site.score;
      site.neuralDelta=neuralActionDelta('naval',site.score,me,troopSnapshot);
      site.score+=site.neuralDelta;
    }
    result.sort((a,b)=>b.score-a.score||a.distance-b.distance);
    return result.slice(0,limit).map(x=>x.tile);
  }
  async function naval(me,tick,serial) {
    if(!opts.boats||!ctors.boat||tick-lastBoat<100||tick<navalBackoffUntil||pendingAttack||pendingBoat)return false;
    lastBoat=tick;
    // Use the SAME complete threat snapshot as ground combat. Using military(me)
    // without front groups underestimates the reserve near stronger neighbors.
    for(const [tile,until] of navalSiteNegative)if(tick>=until)navalSiteNegative.delete(tile);
    const navyState=military(me,strategic.groups),spare=navyState.available;
    if(spare<1300 || navyState.incoming>0 || navyState.activeEnemy>0 ||
      recentHostilePressure(tick,260))return false;
    const foes=game.playerViews().filter(p=>safeID(p)!==safeID(me)&&p.isAlive?.()&&
      !friendly(p,me)&&Number.isInteger(p.state?.spawnTile)&&
      // The naval planner must obey the single-front war director as well.
      (!coordinatedWar() || !isWar() || safeID(p)===warState.id));
    foes.sort((a,b)=>{
      const baseA=-Math.min(150,number(()=>a.troops())/Math.max(1,navyState.home)*40);
      const baseB=-Math.min(150,number(()=>b.troops())/Math.max(1,navyState.home)*40);
      return (baseB+neuralActionDelta('naval',baseB,me,navyState))-
        (baseA+neuralActionDelta('naval',baseA,me,navyState));
    });
    for(const foe of foes.slice(0,6)){
      if(navyState.strongest>=navyState.home*.85)break;
      if((navalCooldown.get('player:'+safeID(foe))||0)>tick)continue;
      if(spare<number(()=>foe.troops(),Infinity)*1.9 ||
        number(()=>me.troops())<number(()=>game.config().maxTroops(me),1)*.47)continue;
      let points=[];
      // Prefer the opponent's actual coastal border. An inland spawn is legal
      // as a query, but the engine silently redirects it to another shore and
      // makes both confirmation and strategic targeting unnecessarily vague.
      try{
        const border=await foe.borderTiles?.();
        if(!live(serial))return false;
        const coast=[...(border?.borderTiles||[])].filter(t=>
          game.isLand(t)&&game.isShore?.(t)&&safeID(game.owner(t))===safeID(foe));
        const stride=Math.max(1,Math.floor(coast.length/8));
        for(let i=navalSweep%stride;i<coast.length&&points.length<8;i+=stride)
          points.push(coast[i]);
      }catch(_){}
      if(!points.length)points=[foe.state.spawnTile];
      // Units remain a fallback for clients without borderTiles support.
      for(const u of foe.units?.()||[]){
        const t=u.tile?.();
        if(Number.isInteger(t)&&!points.includes(t)&&points.length<7)points.push(t);
      }
      for(const dest of points){
        if(!game.isLand(dest)||safeID(game.owner(dest))!==safeID(foe))continue;
        let legal;
        try {legal=await me.actions(dest,['Transport']);}catch(_){continue;}
        if(!live(serial))return false;
        // Alliance, ownership and available troops can all change while the
        // worker is checking a destination. Revalidate the *current* foe.
        const current=game.playerViews?.().find(p=>safeID(p)===safeID(foe));
        if(!current?.isAlive?.() || friendly(current,me) ||
          safeID(game.owner(dest))!==safeID(current) ||
          (coordinatedWar() && isWar() && safeID(current)!==warState.id)){
          telemetry('naval_allied_skip','Landung nach Allianz-/Front-/Eigentümerwechsel verhindert',
            {target:safeID(foe),dest});
          continue;
        }
        const fresh=military(me,strategic.groups);
        if(fresh.incoming>0 || fresh.activeEnemy>0 ||
          fresh.available<number(()=>current.troops(),Infinity)*1.9 ||
          fresh.ratio<.47)continue;
        const ship=legal?.buildableUnits?.find(x=>x.type==='Transport'&&Number.isInteger(x.canBuild));
        if(!ship || (Number(me.gold())<Number(ship.cost)&&!game.config().infiniteGold?.()))continue;
        const committedWar=isWar()&&warState.id===safeID(current);
        const amount=Math.floor(Math.min(fresh.available*(committedWar ? .60 : .36),
          fresh.home*(committedWar ? .58 : .30)));
        // Having a large spare army is not sufficient: the ACTUAL landing
        // contingent must plausibly beat the enemy's fresh home force.
        if(amount<1000||amount<number(()=>current.troops(),Infinity)*
          (hardMode()?1.05:.85) || fresh.home-amount<fresh.reserve)continue;
        if(sendMarineTransport(me,dest,amount,
          tick,'LANDUNG → '+nameOf(current),'player:'+safeID(current)))return true;
      }
    }
    // No separate war: transport a safe neutral-expansion force to verified
    // unowned coasts only after easy land borders are exhausted. Never use
    // this branch to bypass the single-front director or homeland reserve.
    if(!isWar() && !strategic.groups.some(g=>g.id===null&&!g.fallout) &&
      navyState.activeNeutral===0 && navyState.ratio>=.52 &&
      navyState.strongest<navyState.home*1.20 &&
      spare>=Math.max(1400,navyState.home*.06)){
      for(const dest of neutralNavalCandidates(me)){
        if(!live(serial))return false;
        if((navalSiteNegative.get(dest)||0)>tick)continue;
        let legal;
        try{legal=await me.actions(dest,['Transport']);}catch(_){continue;}
        if(!live(serial))return false;
        const ship=legal?.buildableUnits?.find(x=>
          x.type==='Transport'&&Number.isInteger(x.canBuild));
        if(!ship||!game.isLand(dest)||game.hasFallout?.(dest)||
          game.owner(dest)?.isPlayer?.()||
          safeID(game.owner(dest))!==null){
          if(navalSiteNegative.size>300)navalSiteNegative.clear();
          navalSiteNegative.set(dest,tick+240);
          continue;
        }
        if(!game.config().infiniteGold?.() &&
          Number(me.gold())<Number(ship.cost))continue;
        const area=neutralIslandEstimate(dest);
        if(area!==null&&area<24){
          navalSiteNegative.set(dest,tick+480);
          continue;
        }
        // Small islands need scouting-size contingents, not six-figure stacks.
        const areaBudget=area===null?navyState.home*.10:
          Math.max(1300,area*35);
        const amount=Math.floor(Math.min(spare*.22,navyState.home*.075,areaBudget));
        // A new neutral beachhead may be worth taking beside a near-peer,
        // but the actual landing must leave a viable army at the home border.
        if(amount<1000 || navyState.home-amount<
          Math.max(navyState.reserve,navyState.strongest*.78))continue;
        if(sendMarineTransport(me,dest,amount,tick,
          'INSEL-EXPANSION → neutrales Küstenland','neutral:'+dest)){
          strategicTelemetry.neutralLandings++;
          fleetStatus='Neutrale Insellandung angefordert · Bestätigung ausstehend';
          return true;
        }
      }
    }
    return false;
  }
  async function step() {
    const found=discover();
    if(!found){if(game){generation++;game=null;bus=null;opts.enabled=false;persist();status='Warte auf Spiel';}paint();return;}
    if(found.g!==game)reset(found.g,found.b);
    else if(found.b && found.b!==bus){
      // Rebinding listeners on the SAME match is not a new match.
      // reset() deliberately disables the bot, so never call it here.
      bus=found.b;ctors=recognize(bus);lastIntentProbe=-Infinity;
      bindWinnerCapture(bus,ctors);
      reportIntents();
      if(opts.enabled && game.inSpawnPhase?.())
        telemetry('spawn_bus_rebind','Spawnphase: EventBus gewechselt, Bot bleibt aktiv',
          {intents:intentHealth()});
    }
    if(!permittedMatch(game)){
      if(opts.enabled){opts.enabled=false;generation++;persist();}
      status=game?.config?.().isReplay?.()?'Replay: BOT GESPERRT':
        'Unbekannter Spieltyp: BOT GESPERRT';
      paint();return;
    }
    if(game?.gameOver?.()){
      if(opts.enabled){
        gameEnd=gameOutcome(game,myPlayer());
        learnFinish(gameEnd.outcome);
        brainFinish(gameEnd.outcome);
        telemetry('game_over','Partie beendet · Bot automatisch gestoppt',{gameEnd});
        opts.enabled=false;generation++;persist();
      }
      status='Partie beendet · Bot AUS';paint();return;
    }
    if(!bus&&found.b){bus=found.b;ctors=recognize(bus);bindWinnerCapture(bus,ctors);reportIntents();}
    // EventBus listeners may register after initial discovery. Retry at a
    // bounded interval while a core intent is missing; never emit probe events.
    if(bus && (intentHealth().critical.length ||
      (opts.enabled&&opts.autoSpawn&&game.inSpawnPhase?.()&&!ctors.spawn))){
      const probeTick=number(()=>game.ticks(),-1);
      const interval=game.inSpawnPhase?.()?6:120;
      if(probeTick>=0 && probeTick-lastIntentProbe>=interval){
        lastIntentProbe=probeTick;ctors=recognize(bus);bindWinnerCapture(bus,ctors);reportIntents();
      }
    }
    if(conflicts()){opts.enabled=false;status='Andere AggroBot-Version aktiv – alte Skripte deaktivieren';paint();return;}
    if(advisorConflict()){opts.enabled=false;status='Spawn Advisor: Auto-Spawn/Smart Attack/Auto-Accept ausschalten';paint();return;}
    maybeAutoStart();
    if(opts.enabled&&game.inSpawnPhase?.()&&opts.autoSpawn){
      if(!bus?.emit)spawnBlock('EventBus noch nicht verfügbar');
      else if(!ctors.spawn)spawnBlock('Spawn-Intent nicht erkannt');
    }
    if(!opts.enabled||busy||!connected()){paint();return;}
    // Keep observing confirmations and refreshing strategy even when the
    // combat-specific action budget is exhausted. send() enforces the cap.
    const tick=number(()=>game.ticks(),-1);
    if(tick<0||tick===lastTick){paint();return;}
    lastTick=tick;busy=true;const serial=generation,t0=performance.now();
    try {
      const spawnMe=myPlayer();
      if(spawnState.lastSent && spawnMe?.hasSpawned?.() &&
        spawnState.phase!=='Bestätigt'){
        spawnState.phase='Bestätigt';
        const actual=spawnMe.state?.spawnTile;
        telemetry('spawn_confirmed','Spawn im Spielzustand bestätigt',
          {spawn:{...spawnState.lastSent,actualTile:Number.isInteger(actual)?actual:null,
            moved:Number.isInteger(actual)&&actual!==spawnState.lastSent.tile}});
      }
      if(game.inSpawnPhase?.()){
        status=game.config().isRandomSpawn?.()?'Zufallsspawn durch Spielserver':
          'Auto-Spawn · '+spawnState.phase;
        doSpawn(tick);return;
      }
      const me=myPlayer();
      if(!me?.isAlive?.()||!me.hasSpawned?.()){status='Warte auf Spawn';return;}
      learnObserve(tick,me,troopSnapshot,autoTuning.mode);
      sampleTroops(tick,me);sampleIncome(me,tick);inspectMarine(me,tick);victoryPlan(me);confirmAttack(me,tick);evaluateLastBattle(tick,me);
      let immediateState=military(me,strategic.groups);
      rememberHostilePressure(immediateState,tick);
      // Tune immediately even if emergencyRetreat returns before the normal
      // strategy pass: a dangerous invasion must override ASSAULT right now.
      if(opts.fullAuto && immediateState.incoming>Math.max(1,immediateState.home)*.18)
        immediateState=tuneAutonomously(me,strategic.groups,immediateState,tick,
          {wanted:'DEFEND',rebuilding:true});
      // Save committed troops BEFORE any asynchronous worker border request.
      if(emergencyRetreat(me,tick,immediateState))return;
      const tiles=await borders(me,tick);
      if(!live(serial))return;
      const groups=targetsFromBorder(me,tiles);
      observeFronts(me,groups,tick);
      let s=military(me,groups);rememberHostilePressure(s,tick);troopSnapshot=s;
      manageWar(me,groups,s,tick);
      const context=strategy(me,groups,s);
      s=tuneAutonomously(me,groups,s,tick,context);
      troopSnapshot=s;
      brainSend(tick,me,s);
      if(tick-lastDiagnosticTick>=80){lastDiagnosticTick=tick;
        telemetry('snapshot','Spielzustand',{difficulty:game.config().gameConfig().difficulty,
          gameType:game.config().gameConfig().gameType,investment:investmentStatus,
          cities:ownStructures(me).filter(u=>u.type?.()==='City').length,
          factories:ownStructures(me).filter(u=>u.type?.()==='Factory').length,
          borders:tiles.length,tuning:{...autoTuning,enabled:!!opts.fullAuto},defense:{status:defenseStatus,incoming:s.incoming,
            committed:s.committed,pendingRetreats:retreatRequests.size},enemies:groups.filter(g=>g.id!==null).map(g=>({name:nameOf(g.opponent),troops:number(()=>g.opponent.troops()),land:number(()=>g.opponent.numTilesOwned())})),
          readiness:context.readiness?.reason,ratio:s.ratio,maxTroops:s.max,growthPotential:s.growthPotential,
          victory:winStatus,income:incomeStatus,strategicTelemetry,
          forecastAudit:lastForecastAudit,
          recentIncomeSamples:incomeAttribution.slice(-4).map(v=>({...v})),
          fleet:fleetStatus,
          marine:{stats:{...marineStats},pendingBoat:pendingBoat?{...pendingBoat}:null,
            pendingWarship:pendingWarship?{...pendingWarship}:null,
            ports:ownStructures(me).filter(u=>u.type?.()==='Port').length,
            warships:(game.units?.()||[]).filter(u=>u.type?.()==='Warship'&&
              safeID(u.owner?.())===safeID(me)&&u.isActive?.()).length,
            portProbeFailures},
          nuclear:{enemySilos:nuclearIntel(me).enemySilos.length,
            incomingNukes:nuclearIntel(me).incomingNukes.length,
            uncovered:nuclearIntel(me).uncovered.length,
            ownSAM:nuclearIntel(me).sams.filter(u=>safeID(u.owner?.())===safeID(me)).length}});}

      if(plan&&tick>=plan.until)plan=null;
      status='Strategie: '+context.wanted+' · Heim '+Math.round(s.home/10)+
        ' · Reserve '+Math.round(s.reserve/10)+' · Front '+Math.round(s.committed/10);
      const ranked=rankedTargets(groups,me,tick,s,context);
      // Do not open a new front while the homeland is under heavy assault.
      const dangerNow=defenseAssessment(me,s,tick);
      if(dangerNow.severe){await fleetDefense(me,tick,serial);
        status='NOTVERTEIDIGUNG · Heimtruppen halten / Angriffe zurückrufen';return;}
      if(await defense(me,tick,serial,groups,s))return;
      if(await fleetDefense(me,tick,serial))return;
      if(teamSupport(me,tick,s))return;
      // Economy has its own scheduler and cannot block the combat planner.
      if(context.wanted==='RECOVER') {
        status='AUFBAU · Truppen regenerieren / Verteidigung halten';
        return;
      }
      if(await attack(me,tick,serial,ranked,s)) {consecutiveIdle=0;return;}
      consecutiveIdle++;
      if(!context.underAttack && await naval(me,tick,serial))return;
      if(consecutiveIdle>4)status='WARTEN · keine sichere Aktion (Truppen sparen)';
    } catch(e){errors++;status='Fehler: '+String(e?.message||e).slice(0,105);
      console.warn(PREFIX,e);
      if((opts.stopOnError||opts.safeMode)&&errors>=5){
        opts.enabled=false;generation++;persist();status='Not-Aus: 5 Laufzeitfehler';
      }} finally {runtime.combatMs=Math.round(performance.now()-t0);busy=false;paint();}
  }
  async function economyStep() {
    if(economyBusy || !opts.enabled || !opts.economy || !connected())return;
    const me=myPlayer(),tick=number(()=>game.ticks(),-1);
    if(!me?.isAlive?.() || !me.hasSpawned?.() || game.inSpawnPhase?.() || tick<0)return;
    // Always poll pending construction on the fast path: the game exposes a
    // newly built unit immediately, long before its build animation completes.
    if(economicPending && pendingEconomy(tick,ownStructures(me)))return;
    if(!actionBudget() || tick-lastEconomy<35 || tick-lastEconomyProbe<18)return;
    economyBusy=true;const serial=generation,t0=performance.now();
    try {
      const tiles=await borders(me,tick);
      if(!live(serial))return;
      await economy(me,tick,serial,tiles);
    }catch(e){console.warn(PREFIX,'Economy',e);economicStatus='Fehler: '+String(e?.message||e).slice(0,55);}
    finally {runtime.economyMs=Math.round(performance.now()-t0);economyBusy=false;paint();}
  }
  function mount() {
    if(panel||!document.body)return;
    panel=document.createElement('section');panel.id='of-solo-aggrobot';
    panel.style.cssText='position:fixed;left:12px;bottom:12px;width:302px;max-width:calc(100vw - 24px);max-height:55vh;overflow:auto;z-index:2147483644;padding:10px;background:rgba(9,18,32,.96);border:1px solid #42a5d9;border-radius:10px;color:#f0f4fa;font:12px/1.4 system-ui,Arial,sans-serif;box-shadow:0 5px 25px #000a';
    panel.addEventListener('click',e=>{
      const key=e.target.closest('button[data-key]')?.dataset.key;if(!key)return;
      if(key==='export'){exportDiagnostics();return;}
      if(key==='enabled'){
        if(!connected())status=conflicts()?'Alte Bot-Version deaktivieren':
          advisorConflict()?'Spawn Advisor Auto/Smart/Auto-Accept ausschalten':
          'Nur in laufender Singleplayer-, Public- oder Private-Partie mit EventBus';
        else {opts.enabled=!opts.enabled;autoStartGame=game;generation++;log(opts.enabled?'BOT START':'BOT PAUSE');
          if(opts.enabled)reportIntents(true);}
      }else if(key==='autoStart'){
        opts.autoStart=!opts.autoStart;
        if(opts.autoStart&&!opts.enabled)autoStartGame=null;
      }else if(key==='fullAuto'){
        opts.fullAuto=!opts.fullAuto;
        if(opts.fullAuto){opts.autoStrategy=true;autoTuning.tick=-Infinity;}
      }else if(key==='autoStrategy'&&opts.fullAuto){opts.fullAuto=false;opts.autoStrategy=false;}
      else if(['economy','boats','autoSpawn','defense','stopOnError','upgrades','safeMode','autoStrategy','diplomacy','offerAlliances','nukes','antiNuke','lateOffense','impossibleMode','learningEnabled','brainEnabled','qwenPolicy','neuralEnabled'].includes(key))opts[key]=!opts[key];
      else if(key==='plan'){opts.fullAuto=false;opts.autoStrategy=false;opts.plan=opts.plan==='Blitz'?'Adaptiv':opts.plan==='Adaptiv'?'Ökonomie':'Blitz';}
      else if(key==='buildStyle'){opts.fullAuto=false;opts.autoStrategy=false;opts.buildStyle=opts.buildStyle==='Ausgewogen'?'Wirtschaft':opts.buildStyle==='Wirtschaft'?'Defensiv':'Ausgewogen';}
      persist();lastPaint=0;paint();
    });
    panel.addEventListener('change',e=>{
      const key=e.target.dataset?.option;
      if(key==='aggressive')opts.aggressive=clamp(e.target.value,40,100);
      if(key==='reserve')opts.reserve=clamp(e.target.value,5,65);
      if(key==='actionsPerMinute')opts.actionsPerMinute=clamp(e.target.value,15,120);
      if(key==='maxTargets')opts.maxTargets=clamp(e.target.value,4,25);
      if(key==='brainToken'){
        const token=String(e.target.value||'').trim();
        if(token.length>=24&&token.length<=256){opts.brainToken=token;brainState.status='Token gespeichert';}
        else brainState.status='Token ungültig (mind. 24 Zeichen)';
      }
      persist();lastPaint=0;paint();
    });
    document.body.appendChild(panel);
  }
  function paint() {
    if(!document.body)return;if(!panel)mount();
    if(!panel||Date.now()-lastPaint<900)return;
    // Keep the user's slider interaction from being interrupted by a redraw.
    if(panel.contains(document.activeElement)&&document.activeElement?.matches('input'))return;
    lastPaint=Date.now();actionBudget();
    // Rebuilding innerHTML must not collapse sections the player opened.
    const expanded={};
    for(const detail of panel.querySelectorAll('details[data-section]'))expanded[detail.dataset.section]=detail.open;
    const openFor=key=>expanded[key]?' open':'';
    const sectionStyle='border:1px solid #354d66;border-radius:6px;margin-top:6px;padding:5px 7px';
    const b=(key,label)=>`<button data-key="${key}" style="border:1px solid #779;border-radius:5px;color:#fff;background:${opts[key]?'#167247':'#344157'};padding:5px 7px;margin:2px;cursor:pointer">${label}</button>`;
    panel.innerHTML=`<b style="font-size:14px;color:#83dcff">AggroBot ${VERSION}</b> ${permittedMatch(game)?'🟢':'🔒'}
      <div style="color:#bed5e8;margin:6px 0">${escapeHTML(status)}</div>
      ${game?.inSpawnPhase?.()?'<div style="color:#9bd0e4">Strategischer Spawn: '+
        escapeHTML(spawnState.phase)+' · geprüft '+spawnState.scanned+
        ' · Versuche '+spawnState.attempts+' · Rest '+
        spawnRemaining(game)+' Ticks</div>':''}
      <div>${b('enabled',opts.enabled?'⏸ PAUSE':'▶ STARTEN')} ${b('autoStart',opts.autoStart?'⚡ Auto-Start AN':'⚡ Auto-Start AUS')}</div>
      <div style="color:#a9efc9">${escapeHTML(strategic.mode)} · ${escapeHTML(strategic.reason)} · ${escapeHTML(economicStatus)}</div>
      <details data-section="features"${openFor('features')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Module &amp; Optionen</summary>
      <div>${b('autoSpawn','Spawn')} ${b('defense','Gegenangriff')} ${b('economy','Wirtschaft')} ${b('boats','Marine')}</div>
      <div>${b('upgrades','Upgrades')} ${b('safeMode','Not-Aus')} ${b('autoStrategy','Auto-Strategie '+(opts.autoStrategy?'AN':'AUS'))} ${b('fullAuto','Vollautonom '+(opts.fullAuto?'AN':'AUS'))}</div>
      <div>${b('diplomacy','Diplomatie')} ${b('offerAlliances','Bündnisse anbieten')}</div>
      <div>${b('nukes','Auto-Nukes')} ${b('antiNuke','Intelligente SAMs')} ${b('lateOffense','Late-Game-Offensive')}</div>
      <div>${b('learningEnabled','Lernen')} ${b('brainEnabled','🧠 Lokaler Brain')} ${b('qwenPolicy','Qwen-Hinweise (Test)')} ${b('neuralEnabled','Neurales Netz')} ${b('impossibleMode','Unmöglich-Taktik')}</div>
      </details>
      <details data-section="brain"${openFor('brain')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Lokaler Brain &amp; Token</summary>
      <div style="color:#9bd0e4">Neurales Modell: ${neuralModel?.schema===2?'Aktionsranking (max. ±14 Punkte)':neuralModel?.schema===1?'Slider (max. ±8 Punkte)':'nicht geladen'} · nur bei freigegebener Partie</div>
      <div style="color:#9bd0e4">Brain: ${escapeHTML(brainState.status)}${brainState.lastError?' · '+escapeHTML(brainState.lastError):''} · ${escapeHTML(BRAIN_URL)}</div>
      <label>Brain-Token: <input type="password" data-option="brainToken" placeholder="${opts.brainToken?'Gespeichert – neu einfügen zum Ändern':'Aus Terminal einfügen'}" autocomplete="off" style="width:100%;box-sizing:border-box"></label>
      </details>
      <details data-section="situation"${openFor('situation')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Lage &amp; Diplomatie</summary>
      <div style="color:#a9efc9">Hauptfront: ${escapeHTML(warState.name)} · Krieg ${isWar()?'aktiv':'frei'} · ${escapeHTML(lastRecoveryReason||'bereit')}</div>
      <div>${b('plan','Manuell: '+opts.plan)}<br>${b('buildStyle','Manueller Baufokus: '+opts.buildStyle)}</div>
      <div style="color:#a9efc9">KI-Strategie: ${escapeHTML(strategic.mode)} · ${escapeHTML(strategic.reason)} · Bau: ${escapeHTML(effectiveBuildStyle())}</div>
      <div style="color:#9bd0e4">Verteidigung: ${escapeHTML(defenseStatus)} · Rückzüge ${defenseStats.retreatsOrdered}/${defenseStats.retreatsObserved} beobachtet · unklar ${defenseStats.unknown} · unbestätigt ${defenseStats.unconfirmed}</div>
      <div style="color:#9bd0e4">Spielmodus: ${escapeHTML(winStatus.mode)} · Siegfortschritt: ${winStatus.progress===null?'unbekannt':(winStatus.progress*100).toFixed(1)+'%'} · Siegschwelle: ${winStatus.threshold===null?'unbekannt':winStatus.threshold+'%'} · Zeit: ${winStatus.remaining===null?'ohne Timer':Math.round(winStatus.remaining)+'s'} · Doomsday: ${winStatus.doomsday?'JA':'NEIN'}</div>
      <div style="color:#9bd0e4">Handel / 60s: Bahn ${incomeStatus.train===null?'unbekannt':Math.round(incomeStatus.train)} · Schiff ${incomeStatus.trade===null?'unbekannt':Math.round(incomeStatus.trade)} · Marine: ${escapeHTML(fleetStatus)}</div>
      <div style="color:#9bd0e4">Nukes: ${escapeHTML(nukeStatus)} · bestätigt ${nukeShots} / Versuche ${nukeAttempts} / unbestätigt ${nukeUnconfirmed} · SAM-Schutz ${nuclearCache?.assets?.length - nuclearCache?.uncovered?.length||0}/${nuclearCache?.assets?.length||0}</div>
      <div style="color:#9bd0e4">Allianzen: ${escapeHTML(diplomacyStatus)} · Bestätigt: ${diplomacyStats.accepted} angenommen, ${diplomacyStats.rejected} abgelehnt · ${diplomacyPending.size} ausstehend · ${diplomacyStats.offered} angeboten</div>
      </details>
      <details data-section="tuning"${openFor('tuning')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Feintuning</summary>
      <div style="color:#a9efc9">Parameter: ${opts.fullAuto?'AUTONOM '+escapeHTML(autoTuning.mode)+' · '+escapeHTML(autoTuning.reason):'MANUELL'}</div>
      <label>Aggressivität: ${setting('aggressive')}%${opts.fullAuto?' (Auto)':''}<input type="range" data-option="aggressive" min="40" max="100" value="${setting('aggressive')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Reserve: ${setting('reserve')}%${opts.fullAuto?' (Auto)':''}<input type="range" data-option="reserve" min="5" max="65" value="${setting('reserve')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Aktionen/Min.: ${setting('actionsPerMinute')}${opts.fullAuto?' (Auto)':''}<input type="range" data-option="actionsPerMinute" min="15" max="120" value="${setting('actionsPerMinute')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Zielprüfungen: ${setting('maxTargets')}${opts.fullAuto?' (Auto)':''}<input type="range" data-option="maxTargets" min="4" max="25" value="${setting('maxTargets')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      </details>
      <details data-section="diagnostics"${openFor('diagnostics')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Diagnose &amp; Protokoll</summary>
      <div style="color:#9bd0e4">Bau: ${escapeHTML(economicStatus)} · Sparziel: ${escapeHTML(investmentStatus)} · Prioritäten: ${escapeHTML(economicLastPlan)}</div>
      <div style="color:#9bd0e4">Tempo: Front ${runtime.borderMs}ms · Kampf ${runtime.combatMs}ms · Bau ${runtime.economyMs}ms · Worker-Checks ${runtime.attackProbes}/${runtime.buildProbes}</div>
      <div style="color:${intentHealth().critical.length?'#ff8181':intentHealth().missing.length?'#ffd480':'#a9efc9'}">Intents: ${intentHealth().eventBus?intentHealth().found+'/'+intentHealth().total:'EventBus ausstehend'} · ${intentHealth().missing.length?'Fehlen: '+escapeHTML(intentHealth().missing.join(', ')):'alle erkannt'}${intentHealth().critical.length?' · KERNFUNKTION EINGESCHRÄNKT':''}</div>
      <div style="color:#9bd0e4">Aktionsbudget: ${actions.length}/${setting('actionsPerMinute')} · Gesendet: ${totalSent} · Fehlgeschlagen: ${totalFailed} · Fehler: ${errors}</div>
      <div style="color:#9bd0e4">Heim: ${Math.floor(troopSnapshot.home/10)} · Reserve: ${Math.floor(troopSnapshot.reserve/10)} · Laufende Angriffe: ${Math.floor(troopSnapshot.committed/10)} · Einkommen/Reserve: ${(troopSnapshot.ratio*100).toFixed(0)}% Kapazität</div>
      <div style="color:#9bd0e4">Eingehend: ${Math.floor(troopSnapshot.incoming/10)} · Stärkster Grenznachbar: ${Math.floor(troopSnapshot.strongest/10)} · Ziel: ${escapeHTML(lastSelection||plan?.name||'Suche')} · ${borderCache?.length||0} Grenzfelder</div>
      <div style="border-top:1px solid #527;margin-top:7px;padding-top:5px"><b>Letzte Entscheidungen</b>${recent.map(s=>`<div>• ${escapeHTML(s)}</div>`).join('')}</div>
      <button data-key="export" style="border:1px solid #73acdd;border-radius:5px;background:#235078;color:white;padding:5px 7px;cursor:pointer">📄 Diagnose JSON</button>
      </details>
      <div style="color:#97a8be;font-size:10px;margin-top:8px">Singleplayer, Public und Private freigegeben · Replays gesperrt · Autostart pro Partie · Pause bis zum Spielwechsel · Alt+Shift+P Start/Pause · Alt+Shift+X NOT-AUS (Autostart AUS).<br>Bei parallelem Spawn Advisor: Auto-Spawn, Smart Attack und Auto-Accept Alliances dort ausschalten.</div>`;
  }
  document.addEventListener('keydown',e=>{
    if(!e.altKey||!e.shiftKey||!['p','x'].includes(e.key.toLowerCase())||e.repeat||e.target?.isContentEditable||
      /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||''))return;
    e.preventDefault();
    if(e.key.toLowerCase()==='x'){
      opts.enabled=false;opts.autoStart=false;autoStartGame=game;generation++;log('NOT-AUS über Hotkey · Autostart AUS');
    }else if(connected()){
      opts.enabled=!opts.enabled;autoStartGame=game;generation++;log(opts.enabled?'BOT START':'BOT PAUSE');
      if(opts.enabled)reportIntents(true);
    } else status='Bot nur in laufender Singleplayer-, Public- oder Private-Partie verfügbar';
    persist();lastPaint=0;paint();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint,{once:true});
  const interval=setInterval(step,400);
  const economyInterval=setInterval(economyStep,750);
  const diplomacyInterval=setInterval(diplomacyTick,950);
  const nukeInterval=setInterval(nukeStep,1100);
  window.addEventListener('beforeunload',()=>{clearInterval(interval);clearInterval(economyInterval);clearInterval(diplomacyInterval);clearInterval(nukeInterval);});
  if(benchmark){
    window.__OF_BENCHMARK__=Object.freeze({
      snapshot:diagnosticSnapshot,
      status:()=>({version:VERSION,connected:!!connected(),enabled:opts.enabled,
        gameType:gameType(game),tick:number(()=>game.ticks(),-1),
        spawned:!!myPlayer()?.hasSpawned?.(),alive:myPlayer()?.isAlive?.()??null,
        gameOver:!!game?.gameOver?.(),status}),
      start:(settings={})=>{
        if(!connected()||gameType(game)!=='Singleplayer')throw new Error('Benchmark requires a local Singleplayer match');
        const allowed={aggressive:[40,100],reserve:[5,65],actionsPerMinute:[15,120],maxTargets:[4,25]};
        for(const [key,value] of Object.entries(settings)){
          if(key==='fullAuto'&&typeof value==='boolean')continue;
          if(!allowed[key]||typeof value!=='number'||!Number.isFinite(value)||value<allowed[key][0]||value>allowed[key][1])
            throw new Error('Invalid benchmark setting: '+key);
        }
        Object.assign(opts,settings);if(opts.fullAuto)opts.autoStrategy=true;
        autoTuning.tick=-Infinity;opts.enabled=true;autoStartGame=game;generation++;
        telemetry('benchmark_start','Lokaler Testlauf gestartet',{settings});
        reportIntents(true);
      },
      stop:()=>{telemetry('benchmark_stop','Lokaler Testlauf gestoppt');opts.enabled=false;autoStartGame=game;generation++;},
      // Engine harness awaits every cycle; ordinary browser timers stay unchanged.
      pump:async()=>{await step();await economyStep();await diplomacyTick();await nukeStep();}
    });
  }
  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, auto-start after match discovery');
})();
