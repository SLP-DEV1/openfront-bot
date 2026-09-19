// ==UserScript==
// @name         OpenFront Solo AggroBot
// @namespace    https://openfront.io/
// @version      1.9.6
// @description  Singleplayer autopilot: Impossible-focused singleplayer AI: one-front warfare, economy, nukes, SAM coverage, verified autonomous diplomacy.
// @match        https://openfront.io/*
// @match        https://*.openfront.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__ofSoloAggroBot196) return;
  window.__ofSoloAggroBot196 = true;

  const VERSION = '1.9.6', PREFIX = '[Solo AggroBot]', KEY = 'of-solo-aggrobot-v196';
  const defaults = {enabled:false, fullAuto:true, aggressive:85, reserve:35, actionsPerMinute:72,
    economy:true, boats:false, autoSpawn:true, defense:true, stopOnError:false,
    upgrades:true, plan:'Adaptiv', safeMode:true, maxTargets:16, buildStyle:'Ausgewogen',
    autoStrategy:true, diplomacy:true, offerAlliances:true, nukes:true, antiNuke:true, lateOffense:true,
    impossibleMode:true};
  let opts;
  try { opts = {...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; }
  catch (_) {opts = {...defaults};}
  try {if(!localStorage.getItem(KEY)){
    opts={...defaults,...JSON.parse(localStorage.getItem('of-solo-aggrobot-v195')||localStorage.getItem('of-solo-aggrobot-v194')||localStorage.getItem('of-solo-aggrobot-v193')||localStorage.getItem('of-solo-aggrobot-v192')||localStorage.getItem('of-solo-aggrobot-v191')||localStorage.getItem('of-solo-aggrobot-v190')||localStorage.getItem('of-solo-aggrobot-v181')||localStorage.getItem('of-solo-aggrobot-v18')||localStorage.getItem('of-solo-aggrobot-v17')||'{}')};
    // Only import user-adjustable preferences, never a previously enabled bot.
  }}catch(_){}
  opts.enabled = false;                         // Never auto-start after reload.
  if(opts.fullAuto)opts.autoStrategy=true;     // Full autonomy includes strategy selection.
  const persist = () => {try {localStorage.setItem(KEY,JSON.stringify(opts));} catch (_) {}};
  const escapeHTML = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (n,a,b) => Math.min(b,Math.max(a,Number.isFinite(+n)?+n:a));
  const number = (fn, fallback=0) => {try {const n=Number(fn());return Number.isFinite(n)?n:fallback;}catch(_){return fallback;}};
  const nameOf = p => {try{return p.displayName?.() || p.name?.() || String(p.id());}catch(_){return '?';}};
  const safeID = p => {try{return p.id();}catch(_){return null;}};
  let game=null, bus=null, ctors={}, panel=null, busy=false, generation=0;
  let lastTick=-1, lastSpawn=-Infinity, lastEconomy=-Infinity, lastEconomyProbe=-Infinity;
  let lastBoat=-Infinity, lastBorderTick=-Infinity, borderCache=null, borderPlayer=null;
  let buildCursor=0, spawnCache=null, spawnJob=null, spawnRetryAt=0, status='Warte auf Singleplayer';
  let plan=null, rejected=new Map(), lastEmission=0, lastSelection='';
  let totalSent=0, totalFailed=0;
  let borderOffset=0, lastBorderRefresh=0, lastPlanTick=-Infinity;
  let recent=[], actions=[], cooldowns=new Map(), lastPaint=0, errors=0;
  let troopSamples=[], lastRecoveryReason='', lastBattle=null, blockedTargets=new Map();
  let troopSnapshot={home:0,max:0,committed:0,incoming:0,enemy:0,ratio:0,reserve:0,available:0};
  let lastEconomicAction=-Infinity, lastNeutralSend=-Infinity, lastEnemySend=-Infinity;
  let consecutiveIdle=0;
  let economicPending=null, economicBlocked=new Map(), economicStatus='Bauplanung bereit', economicLastPlan='—';
  let economyBusy=false, borderInflight=null, legalNegative=new Map();
  let runtime={borderMs:0,combatMs:0,economyMs:0,attackProbes:0,buildProbes:0};
  let strategic={mode:'EXPAND',reason:'Startphase',buildStyle:'Ausgewogen',since:-Infinity,groups:[]};
  let diplomacyHandled=new Map(),lastDiplomacyTick=-Infinity,lastProposalTick=-Infinity;
  let diplomacyStatus='Noch keine Anfrage', diplomacyStats={accepted:0,rejected:0,offered:0};
  let diplomacyPending=new Map(),lastDiplomaticEmit=0,diplomacyMissingLogged=new Set();
  let goldSamples=[];
  let nukeBusy=false, lastNuke=-Infinity, nukePending=null, nukeStatus='Warte auf Silo', nukeShots=0,nukeAttempts=0,nukeUnconfirmed=0;
  let nuclearCache=null, nuclearCacheTick=-Infinity;
  let warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};
  let diagnostics=[],lastDiagnosticTick=-Infinity,combatAwaiting=null;
  let pendingAttack=null,attackReceipts={confirmed:0,unconfirmed:0,territoryGained:0};
  let failedEconomyProbes=0,successfulEconomyTick=-Infinity,warWaitSince=-Infinity;
  let investmentStatus='Grundaufbau',lastWarReview=-Infinity;
  let defenseStatus='Keine Bedrohung',lastEmergencyRetreat=-Infinity,lastDefenseLog=-Infinity;
  let targetIntelCache=new Map();
  let retreatRequests=new Map(),defenseStats={retreatsOrdered:0,retreatsObserved:0,unknown:0,unconfirmed:0};
  // Manual slider values remain saved; fullAuto computes independent live values.
  let autoTuning={aggressive:85,reserve:35,actionsPerMinute:72,maxTargets:16,
    mode:'INIT',reason:'Warte auf Spielzustand',tick:-Infinity};
  const hardMode=()=>opts.impossibleMode && game?.config?.().gameConfig?.().difficulty==='Impossible';
  const isWar=()=>warState.id!==null;
  function telemetry(kind,message,extra={}) {
    if(!opts.enabled || !single(game))return;
    let m=myPlayer(),tick=number(()=>game.ticks(),0);
    diagnostics.push({time:new Date().toISOString(),tick,kind,message,mode:strategic.mode,
      warTarget:warState.name,home:number(()=>m?.troops?.()),gold:number(()=>Number(m?.gold?.())),
      land:number(()=>m?.numTilesOwned?.()),committed:troopSnapshot.committed,
      incoming:troopSnapshot.incoming,...extra});
    if(diagnostics.length>1400)diagnostics.splice(0,diagnostics.length-1400);
  }
  function exportDiagnostics() {
    const details={bot:VERSION,gameType:game?.config?.().gameConfig?.().gameType,
      difficulty:game?.config?.().gameConfig?.().difficulty,
      options:{...opts,enabled:false},tuning:{...autoTuning,enabled:!!opts.fullAuto,
        effective:{aggressive:setting('aggressive'),reserve:setting('reserve'),
          actionsPerMinute:setting('actionsPerMinute'),maxTargets:setting('maxTargets')}},attackReceipts, pendingAttack,
      construction:{pending:economicPending,blocked:[...economicBlocked.entries()],failedProbes:failedEconomyProbes,lastConfirmed:successfulEconomyTick,investment:investmentStatus},
      war:{...warState},military:troopSnapshot,
      defense:{status:defenseStatus,stats:defenseStats,pendingRetreats:[...retreatRequests.values()]},
      rockets:{confirmed:nukeShots,attempts:nukeAttempts,unconfirmed:nukeUnconfirmed,pending:nukePending},
      diplomacy:{status:diplomacyStatus,stats:diplomacyStats,pending:[...diplomacyPending.values()]},records:diagnostics,createdAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(details,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='OpenFront_AggroBot_1.9.6_Diagnose.json';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }


  const log = message => {recent.unshift(message);recent=recent.slice(0,7);console.info(PREFIX,message);telemetry('decision',message);};
  const single = g => {
    try {return g?.config?.().gameConfig?.().gameType === 'Singleplayer' &&
      !g.config().isReplay?.();} catch (_) {return false;}
  };
  const conflicts = () => !!(window.__ofSoloAggroBot1 || window.__ofSoloAggroBot11 || window.__ofSoloAggroBot12 || window.__ofSoloAggroBot13 || window.__ofSoloAggroBot14 || window.__ofSoloAggroBot15 || window.__ofSoloAggroBot16 || window.__ofSoloAggroBot17 || window.__ofSoloAggroBot18 || window.__ofSoloAggroBot181 || window.__ofSoloAggroBot190 || window.__ofSoloAggroBot191 || window.__ofSoloAggroBot192 || window.__ofSoloAggroBot193 || window.__ofSoloAggroBot194 || window.__ofSoloAggroBot195);
  function advisorConflict() {
    if (!window.__openfrontSpawnAdvisorV104) return false;
    try {const s=JSON.parse(localStorage.getItem('openfront-spawn-advisor-10.4')||'{}');
      return s.auto!==false || s.smart===true || s.accept===true;
    } catch (_) {return true;}
  }
  const connected = () => single(game) && !game?.gameOver?.() && !conflicts() && !advisorConflict() && bus && typeof bus.emit==='function';
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
      alliance:'SendAllianceRequestIntentEvent',reject:'SendAllianceRejectIntentEvent'};
    const possibilities={spawn:[],attack:[],cancel:[],boat:[],build:[],upgrade:[],alliance:[],reject:[]};
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
    }
    for(const k of Object.keys(possibilities)) if(!result[k] && possibilities[k].length===1)
      result[k]=possibilities[k][0];
    return result;
  }
  function reset(g,b) {
    generation++; game=g;bus=b;ctors=recognize(b);busy=false;
    lastTick=-1;lastSpawn=-Infinity;lastEconomy=-Infinity;lastEconomyProbe=-Infinity;
    lastBoat=-Infinity;lastBorderTick=-Infinity;borderCache=null;borderPlayer=null;
    buildCursor=0;spawnCache=null;spawnJob=null;spawnRetryAt=0;cooldowns.clear();rejected.clear();
    plan=null;lastSelection='';lastEmission=0;borderOffset=0;lastBorderRefresh=0;
    totalSent=0;totalFailed=0;actions=[];errors=0;troopSamples=[];
    lastRecoveryReason='';lastBattle=null;pendingAttack=null;targetIntelCache.clear();
    attackReceipts={confirmed:0,unconfirmed:0,territoryGained:0};blockedTargets.clear();
    failedEconomyProbes=0;successfulEconomyTick=-Infinity;warWaitSince=-Infinity;
    lastEconomicAction=-Infinity;lastNeutralSend=-Infinity;lastEnemySend=-Infinity;consecutiveIdle=0;
    economicPending=null;economicBlocked.clear();economicStatus='Bauplanung bereit';economicLastPlan='—';
    economyBusy=false;borderInflight=null;legalNegative.clear();runtime={borderMs:0,combatMs:0,economyMs:0,attackProbes:0,buildProbes:0};
    strategic={mode:'EXPAND',reason:'Startphase',buildStyle:'Ausgewogen',since:-Infinity,groups:[]};
    diplomacyHandled.clear();diplomacyPending.clear();diplomacyMissingLogged.clear();lastDiplomaticEmit=0;
    lastDiplomacyTick=-Infinity;lastProposalTick=-Infinity;diplomacyStatus='Noch keine Anfrage';
    diplomacyStats={accepted:0,rejected:0,offered:0};goldSamples=[];
    nukeBusy=false;lastNuke=-Infinity;nukePending=null;nukeStatus='Warte auf Silo';nukeShots=0;nukeAttempts=0;nukeUnconfirmed=0;nuclearCache=null;nuclearCacheTick=-Infinity;
    warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};diagnostics=[];lastDiagnosticTick=-Infinity;combatAwaiting=null;
    investmentStatus='Grundaufbau';lastWarReview=-Infinity;
    defenseStatus='Keine Bedrohung';lastEmergencyRetreat=-Infinity;lastDefenseLog=-Infinity;
    retreatRequests.clear();defenseStats={retreatsOrdered:0,retreatsObserved:0,unknown:0,unconfirmed:0};
    autoTuning={aggressive:85,reserve:35,actionsPerMinute:72,maxTargets:16,
      mode:'INIT',reason:'Warte auf Spielzustand',tick:-Infinity};
    opts.enabled=false;persist();
    status=single(g)?'Singleplayer erkannt · Bot starten':'Multiplayer/Replay · gesperrt';
    log(status);
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
    if(!opts.enabled || !connected() || !ctors[kind] || (!priority && !actionBudget(['attack','boat'].includes(kind)?'combat':'general'))) return false;
    // The bot can make multiple decisions per cycle. Keep an independent
    // burst limiter so it never floods the game transport even at 60/min.
    if(!priority && Date.now()-lastEmission < 410)return false;
    // A final fail-closed check: do not emit if we switched to MP or replay.
    if(!single(game))return false;
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
  function startSpawnSearch() {
    if(spawnJob || spawnCache || !game || Date.now()<spawnRetryAt)return;
    const g=game, serial=generation;
    const w=g.width(),h=g.height(),r=Math.max(6,Math.min(27,Math.floor(Math.min(w,h)/20)));
    const stride=Math.max(17,Math.floor(Math.min(w,h)/15));
    const rivals=[];
    try {for(const p of g.playerViews()) {
      if(p.id?.()===myPlayer()?.id?.()) continue;
      const t=p.state?.spawnTile;
      if(Number.isInteger(t)&&t>=0) rivals.push([g.x(t),g.y(t)]);
    }}catch(_){}
    const samples=[];
    for(let dy=-r;dy<=r;dy+=Math.max(3,Math.floor(r/4)))
      for(let dx=-r;dx<=r;dx+=Math.max(3,Math.floor(r/4)))
        if(dx*dx+dy*dy<=r*r)samples.push([dx,dy]);
    let x=r,y=r,best=null;
    spawnJob={serial};
    function chunk() {
      if(serial!==generation || game!==g || !opts.enabled || !single(g) || !g.inSpawnPhase?.()){
        spawnJob=null;return;
      }
      const start=performance.now();
      try {
        while(y<h-r && performance.now()-start<8) {
          if(x>=w-r){x=r;y+=stride;continue;}
          const cx=x,cy=y;x+=stride;
          const t=g.ref(cx,cy);
          if(!g.isLand(t)||g.isImpassable(t)||g.hasOwner(t))continue;
          let land=0,plain=0;
          for(const [dx,dy] of samples){const byte=g.terrainByte(g.ref(cx+dx,cy+dy));
            if(byte&128){land++;if((byte&31)<10)plain++;}}
          const density=land/samples.length;if(density<.62)continue;
          const distance=rivals.length?Math.min(...rivals.map(([px,py])=>Math.hypot(cx-px,cy-py))):r*7;
          const edge=Math.min(cx,cy,w-1-cx,h-1-cy);
          // A useful port coastline is a bonus, never a reason to spawn on
          // a cramped island; the land-density gate remains mandatory.
          const coast=typeof g.isShore==='function' && [[0,0],[r,0],[-r,0],[0,r],[0,-r]]
            .some(([dx,dy])=>{try{return g.isShore(g.ref(cx+dx,cy+dy));}catch(_){return false;}});
          const score=density*.44 + plain/Math.max(1,land)*.20 +
            Math.min(1,distance/(r*5))*.23 + Math.min(1,edge/(r*3))*.09 +
            (coast?.04:0);
          if(!best||score>best.score)best={tile:t,x:cx,y:cy,score};
        }
      }catch(e){spawnJob=null;status='Spawn-Analyse: '+e.message;spawnRetryAt=Date.now()+15000;return;}
      if(y<h-r){setTimeout(chunk,0);return;}
      spawnJob=null;spawnCache=best;
      if(!best){status='Keine geeignete Startposition';spawnRetryAt=Date.now()+12000;return;}
      doSpawn(number(()=>g.ticks(),0));
    }
    setTimeout(chunk,0);
  }
  function doSpawn(tick) {
    if(!opts.autoSpawn||!ctors.spawn||tick-lastSpawn<30 || game.config().isRandomSpawn?.())return;
    const me=myPlayer();if(me?.hasSpawned?.()||me?.state?.spawnTile!==undefined)return;
    if(!spawnCache){startSpawnSearch();return;}
    const p=spawnCache;
    if(send('spawn',[p.tile],`SPAWN (${p.x},${p.y})`))lastSpawn=tick;
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
  function targetsFromBorder(me,tiles) {
    const groups=new Map(), scratch=[], cap=2000;
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
    return Math.floor(Math.min(s.available*fraction,Math.max(base,surplus)));
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
    const strongest=hostile.reduce((s,t)=>Math.max(s,number(()=>t.opponent.troops())),0);
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
    const opponent=game.playerViews().find(p=>safeID(p)===record.id);
    if(!opponent || !opponent.isAlive?.()){lastBattle=null;return;}
    const active=(me.outgoingAttacks?.()||[]).some(a=>a.targetID===record.id&&!a.retreating);
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
    lastBattle=null;
  }
  function confirmAttack(me,tick){
    if(!pendingAttack)return;
    const p=pendingAttack;
    const out=(me.outgoingAttacks?.()||[]).filter(a=>!a.retreating && a.targetID===p.id);
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
          enemyLand:p.enemyLand,ownLand:p.ownLand};
        if(hardMode()&&warState.id===null){
          warState={id:p.id,name:p.name,since:tick,blockedUntil:-Infinity};
          log('HAUPTKRIEGSZIEL BESTÄTIGT → '+p.name);
        }
      }
      pendingAttack=null;combatAwaiting=null;return;
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
    pendingAttack=null;combatAwaiting=null;
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
    if(!opts.impossibleMode)return;
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
      } else if(!active.some(a=>a.targetID===warState.id) &&
        ((tick-warState.since>550 && !foes.some(x=>x.id===warState.id)) ||
         (tick-warState.since>850 && tick-lastEnemySend>280 && s.incoming===0))) {
        // A once-successful war lock must not paralyze the bot forever after
        // its target becomes unreachable or too costly; allow a new front review.
        log('KRIEGSZIEL NEU BEWERTEN: '+warState.name);
        blockedTargets.set(warState.id,tick+200);lastWarReview=tick;
        warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};plan=null;
      }
    }
    if(combatAwaiting && (active.some(a=>a.targetID===combatAwaiting.id) ||
      tick-combatAwaiting.tick>250)) {
      if(!active.some(a=>a.targetID===combatAwaiting.id))
        log('ANGRIFF nicht bestätigt · '+combatAwaiting.name+' später neu prüfen');
      combatAwaiting=null;
    }
    if(warState.id===null && active.length) {
      const a=active.sort((a,b)=>b.troops-a.troops)[0],p=game.playerViews().find(x=>safeID(x)===a.targetID);
      if(p){warState={id:a.targetID,name:nameOf(p),since:tick,blockedUntil:-Infinity};
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
  function targetOpportunity(me,items,s,item) {
    if(!item?.opponent?.isAlive?.()||friendly(item.opponent,me))return false;
    const late=lateGame(me),troops=number(()=>item.opponent.troops(),Infinity);
    if(!(troops>0)||s.incoming>s.home*(late?.15:.04)||s.ratio<(late?.29:.40))return false;
    const minRatio=hardMode()?(late?1.34:1.75):(late?1.18:1.55);
    if(s.available<troops*minRatio ||
      s.home<troops*(hardMode()?(late?1.45:1.85):(late?1.24:1.45)))return false;
    const otherThreat=items.filter(x=>x.id!==null&&x.id!==item.id&&x.opponent?.isAlive?.())
      .reduce((v,x)=>Math.max(v,number(()=>x.opponent.troops(),0)),0);
    const strike=Math.min(s.available*(hardMode()?.76:.80),
      Math.max(troops*(hardMode()?1.57:1.40),s.available*.48));
    // Do not cap the other neighbor's reserve to a percentage of our own
    // army: that would incorrectly approve suicidal attacks against giants.
    return s.home-strike>=Math.max(s.home*.22,otherThreat*(hardMode()?.58:.50));
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
  function strategy(me,items,s) {
    const tick=number(()=>game.ticks());
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
    else if(danger&&seriousAttack){wanted='DEFEND';reason='Erhebliche eingehende Angriffe';}
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
      if(enemy && hardMode() && (
        (pendingAttack?.id!==null && pendingAttack?.id!==undefined && pendingAttack.id!==item.id) ||
        (isWar() && item.id!==warState.id) || tick<warState.blockedUntil ||
        !context.readiness?.ready || !targetOpportunity(me,items,s,item) ||
        (combatAwaiting && combatAwaiting.id===item.id && tick-combatAwaiting.tick<250)))return [];
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
      const otherThreat=enemy?items.filter(x=>x.id!==null && x.id!==item.id)
        .reduce((v,x)=>Math.max(v,number(()=>x.opponent?.troops(),0)),0):0;
      const enemyTiles=enemy?number(()=>enemy.numTilesOwned(),0):0;
      if(!isNeutral) {
        const minimumRatio=hardMode()?(late?1.34:1.75):(late?1.18:effectivePlan()==='Blitz'?1.30:1.55);
        if(s.ratio<(late?.29:.40) || available<enemyTroops*minimumRatio ||
          s.home<enemyTroops*(hardMode()?(late?1.45:1.85):(late?1.24:1.45)) ||
          (hardMode() && s.home-Math.min(available*.76,
            Math.max(enemyTroops*1.57,available*.48))<otherThreat*.58) ||
          enemyTroops<=0 && enemyTiles<=0)return [];
      }
      let score=isNeutral?75:52;
      score+=Math.min(20,Math.log2(item.front+1)*4.5);
      if(isNeutral) {
        score+=Math.max(0,45-s.ratio*40)+(ownTiles<600?26:0);
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
        if(plan?.id===item.id && tick<plan.until)score+=23;
        if(effectivePlan()==='Blitz')score+=12;
        if(late)score+=33;
      }
      const amount=isNeutral ?
        neutralAttackAmount(s,aggression) :
        Math.min(available*(hardMode()?.76:.80),Math.max(enemyTroops*(hardMode()?1.57:(1.25+aggression*.20)),available*.48));
      return [{...item,key,score,amount:Math.min(available,Math.floor(amount))}];
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
        (isWar()&&x.targetID===warState.id?2:1);
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
      if(hardMode()&&isWar()&&id!==warState.id)continue;
      const spare=s.available;
      if(spare<Math.max(500,their*1.25)||
         tick-(cooldowns.get(key)??-Infinity)<160)continue;
      const candidate=groups.find(x=>x.id===id);
      if(!candidate||!await legalTarget(me,candidate,serial))continue;
      if(!live(serial))return false;
      const amount=Math.floor(Math.min(spare*.42,s.home*.16));
      if(amount<100||s.home-amount<threat.incoming*2.8)continue;
      if(send('attack',[id,amount],'KONTROLLIERTER GEGENANGRIFF → '+nameOf(attacker))){
        const out=s.out.filter(x=>x.targetID===id&&!x.retreating);
        pendingAttack={id,name:nameOf(attacker),tick,amount,ownLand:number(()=>me.numTilesOwned()),
          enemyLand:number(()=>attacker.numTilesOwned()),beforeIds:out.map(x=>x.id),
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
      // The game state may advance during the async worker legality probe.
      const fresh=military(me,strategic.groups); // Never forget stronger OTHER neighbors on recheck.
      if(item.id!==null && (fresh.incoming>fresh.home*(lateGame(me)?.15:.04) ||
        fresh.activeEnemy>=(lateGame(me)&&fresh.strongest<fresh.home*.55?2:1) ||
        fresh.available<Math.max(100,number(()=>item.opponent.troops(),Infinity)*(lateGame(me)?1.15:1.3))))continue;
      if(item.id===null && fresh.activeNeutral>=1)continue;
      if(item.id!==null && hardMode() && (!warReadiness(me,strategic.groups,fresh,tick,item).ready ||
        !targetOpportunity(me,strategic.groups,fresh,item) ||
        (isWar()&&warState.id!==item.id)))continue;
      const amount=Math.min(item.amount,fresh.available,
        item.id===null ? neutralAttackAmount(fresh,clamp(setting('aggressive'),40,100)/100) : Math.floor(fresh.available*(hardMode()?.76:.8)));
      if(amount<100)continue;
      const label=item.opponent?nameOf(item.opponent):'neutrales Land';
      if(send('attack',[item.id,amount],`ANGRIFF → ${label} (${Math.floor(amount/10)} Tr.)`)){
        cooldowns.set(item.key,tick);
        if(item.id===null)lastNeutralSend=tick;
        else {
          lastEnemySend=tick;
          plan={id:item.id,until:tick+(hardMode()?1000:300),name:label};
        }
        const before=s.out.filter(a=>a.targetID===item.id&&!a.retreating);
        pendingAttack={id:item.id,name:label,tick,amount,ownLand:number(()=>me.numTilesOwned()),
          enemyLand:item.opponent?number(()=>item.opponent.numTilesOwned()):0,
          beforeIds:before.map(a=>a.id),beforeTroops:before.reduce((v,a)=>v+a.troops,0)};
        lastSelection=label+' · score '+item.score.toFixed(0);
        telemetry('attack_intent','Angriff angefordert – wartet auf Bestätigung',
          {target:item.id,troops:amount});
        return true;
      }
    }
    return false;
  }
  // v1.9: The game returns the ACTUAL building tile via canBuild, and
  // the actual upgradable unit id via canUpgrade. These are alternatives, not
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
    for(const u of intel.assets){
      if(!near(u,80))continue;
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
  function economicNeeds(me,units,tiles) {
    const mine=number(()=>me.numTilesOwned(),0);
    const gold=number(()=>Number(me.gold()),0);
    const cap=Math.max(1,troopSnapshot.max||number(()=>game.config().maxTroops(me),1));
    const troops=number(()=>me.troops(),0);
    const threatened=troopSnapshot.incoming>0 || troopSnapshot.strongest>troops*.6;
    const hostileFronts=strategic.groups.filter(g=>g.id!==null&&g.opponent?.isAlive?.()).length;
    const count=type=>economicUnitsByType(units,type).length;
    const cities=count('City'),factories=count('Factory'),ports=count('Port');
    const wantedCity=hardMode()?Math.min(13,Math.max(2,2+Math.floor(mine/600))):Math.min(9,Math.max(1,1+Math.floor(mine/900)));
    const wantedFactory=hardMode()?Math.min(11,Math.max(2,2+Math.floor(mine/900))):Math.min(8,Math.max(1,1+Math.floor(mine/1350)));
    const wantedPort=opts.boats?Math.min(3,Math.max(1,Math.floor(mine/1800)+1)):
      (factories>=1 && mine>600?Math.min(2,Math.floor(mine/2700)+1):0);
    const startup=cities<1||factories<1;
    const basic=cities<2||factories<2;
    // Never buy decorative defense posts while the first city/factory are still
    // unaffordable. Only a *real* incoming offensive can override the basics.
    const immediate=troopSnapshot.incoming>troops*.18;
    const emergency=immediate||(troopSnapshot.strongest>troops*1.25&&
      (troopSnapshot.ratio<.75||hostileFronts>=2));
    const wantedDefense=threatened&&(!startup||immediate)?Math.min(16,
      Math.max(2,Math.ceil((tiles?.length||0)/165),hostileFronts*2)):0;
    const intel=nuclearIntel(me,units);
    const enemySilos=intel.enemySilos.length,enemyNukes=intel.incomingNukes.length;
    const threat=!!(enemySilos||enemyNukes);
    const wantedSAM=opts.antiNuke&&threat?Math.min(10,Math.max(1,
      Math.ceil(intel.assets.length/3)+Math.ceil(intel.uncovered.length/3)+(enemyNukes?2:0))):0;
    const late=lateGame(me),siloCount=count('Missile Silo');
    const siloAllowed=opts.nukes && game.config().isUnitDisabled?.('Missile Silo')!==true &&
      game.config().isUnitDisabled?.('Atom Bomb')!==true;
    // Earlier requiring 1.8m *before* considering a silo caused endless
    // reinvestment in cheap upgrades. OpenFront silo costs start at 1m.
    const wantedSilo=siloAllowed && cities>=2&&factories>=2 && late && mine>900 ?
      (siloCount===0?1:nukeShots>0&&gold>2500000?Math.min(3,1+Math.floor(mine/18000)):1):0;
    const pressure=troops/cap;
    const style=effectiveBuildStyle() || 'Ausgewogen';
    const defBoost=style==='Defensiv'?22:0,econBoost=style==='Wirtschaft'?24:0;
    const list=[
      {type:'City',desired:wantedCity,score:92+econBoost/2+Math.max(0,pressure-.35)*75+
          (pressure>.80&&!immediate?30:0)+(cities===0?115:hardMode()&&cities<2?80:0)},
      {type:'Factory',desired:wantedFactory,score:91+econBoost+
          (factories===0?100:hardMode()&&factories<2?85:0)+
          (gold<450000?15:0)+(pressure<.60&&factories>0?10:0)},
      {type:'Port',desired:wantedPort,score:59+econBoost/2+(ports===0&&wantedPort?12:0)},
      {type:'Defense Post',desired:wantedDefense,score:immediate?310+defBoost:threatened?(basic?70:119)+defBoost:20},
      {type:'SAM Launcher',desired:wantedSAM,score:enemyNukes?165+defBoost:threat?116+defBoost:40},
      {type:'Missile Silo',desired:wantedSilo,score:siloCount===0?305:opts.nukes?(late?131:94)+(gold>6000000?13:0):0}
    ];
    const value=list.filter(x=>x.desired>count(x.type)).map(x=>({...x,count:count(x.type),
      urgency:x.score+Math.min(50,35*(x.desired-count(x.type))/x.desired)}));
    // Upgrades become useful when expansion is tight or troop cap is near.
    if(opts.upgrades){
      for(const x of list.filter(x=>['City','Factory','Port','SAM Launcher','Missile Silo'].includes(x.type)&&count(x.type)>0 &&
        (x.type!=='SAM Launcher'||opts.antiNuke&&threat) && (x.type!=='Missile Silo'||opts.nukes))){
        const upgradeScore=x.score-(count(x.type)<x.desired?17:36)+
          (x.type==='City'&&pressure>.75?27:0)+(x.type==='SAM Launcher'&&threat?32:0)+
          (x.type==='Missile Silo'&&late&&opts.nukes?22:0);
        value.push({...x,count:count(x.type),upgrade:true,urgency:upgradeScore});
      }
    }
    // Deduplicate type list for game actions, but keep separate build/upgrade priorities.
    value.sort((a,b)=>b.urgency-a.urgency);
    const saveForSilo=siloAllowed && late && !basic && siloCount===0;
    const saveForNuke=siloAllowed && late && siloCount>0 &&
      intel.enemy.length>0 && nukeShots===0;
    const savingsTarget=saveForSilo?1150000:saveForNuke?1100000:0;
    investmentStatus=startup?'Erste Stadt/Fabrik':basic?'Zwei Städte und zwei Fabriken':
      saveForSilo?'Silo-Fonds 1,15 Mio.':saveForNuke?'Atom-Fonds 1,1 Mio.':'Wirtschaft & Offensive';
    return {list:value,threatened,gold,cities,factories,mine,pressure,nuclearThreat:threat,incomingNukes:enemyNukes,intel,
      startup,basic,emergency,immediate,savingsTarget,saveForSilo,saveForNuke,siloCount};
  }
  function economicAnchors(me,tiles,units,tick) {
    const w=game.width(),h=game.height(),anchors=[],seen=new Set();
    const add=ref=>{
      if(anchors.length>=190 || !Number.isInteger(ref)||seen.has(ref))return;
      seen.add(ref);
      if(ownedTile(ref,me))anchors.push(ref);
    };
    const addXY=(x,y)=>{if(x>=0&&y>=0&&x<w&&y<h)add(game.ref(x,y));};
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
      if(type==='Factory'){
        // Favor nearby City/Port infrastructure. This improves placement;
        // it does NOT claim a connected rail route or guaranteed income.
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
    if(!anchors.length){economicStatus='Kein eigenes Bauland gefunden';return false;}
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
    const siteCache=new Map();
    const score=(entry,site)=>{
      const key=entry.type+':'+site.ref;
      if(!siteCache.has(key))siteCache.set(key,siteScore(entry.type,site.ref,fronts,units,0,site.coast,site.dist));
      return entry.urgency+siteCache.get(key);
    };
    const slots=[];
    for(const entry of entries.slice(0,8)){
      if(entry.upgrade && !ctors.upgrade)continue;
      if(!entry.upgrade && !ctors.build)continue;
      // Upgrades must probe existing structures, whereas new buildings probe free land.
      const valid=entry.upgrade?rankedAnchors.filter(a=>units.some(u=>u.type?.()===entry.type && number(()=>u.tile(),-1)===a.ref)):
        rankedAnchors.filter(a=>entry.type!=='Port'||a.coast);
      valid.sort((a,b)=>score(entry,b)-score(entry,a));
      for(const site of valid.slice(0,entry.upgrade?4:6))slots.push({entry,site});
    }
    // Probe best geographic options across building types; never sequentially
    // spend the entire time budget on the first City anchor.
    slots.sort((a,b)=>score(b.entry,b.site)-score(a.entry,a.site));
    const seen=new Set(), proposals=[],perKind=new Map();
    const probe={queries:0,errors:0,legal:0,unaffordable:0,invalidSite:0,lowestCost:Infinity};
    const work=[];
    // A dozen City anchors must not evict every Factory / SAM / silo query.
    for(const slot of slots){
      if(work.length>=15)break;
      const kind=slot.entry.type+':'+!!slot.entry.upgrade;
      if((perKind.get(kind)||0)>=3)continue;
      const key=kind+':'+slot.site.ref;
      if(seen.has(key))continue;
      seen.add(key);work.push(slot);
      perKind.set(kind,(perKind.get(kind)||0)+1);
    }
    // At most twelve worker requests, three simultaneously. Stop after the
    // first successful batch instead of waiting for every possible building.
    for(let offset=0;offset<work.length;offset+=3){
      if(!live(serial))return false;
      const batch=work.slice(offset,offset+3);
      const answers=await Promise.all(batch.map(async slot=>{
        runtime.buildProbes++;probe.queries++;
        try{return {slot,legal:await me.actions(slot.site.ref,types)};}
        catch(_){probe.errors++;return {slot,legal:null};}
      }));
      if(!live(serial))return false;
      for(const {slot,legal} of answers){
        if(!legal)continue;
        const {entry,site}=slot;
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
          proposals.push({kind:isUpgrade?'upgrade':'build',type:item.type,tile,
            unitId:b.canUpgrade,level:number(()=>old?.level(),0),cost,siteValue});
        }
      }
      if(proposals.length)break;
    }
    if(!proposals.length){failedEconomyProbes++;
      const reason=probe.unaffordable>0&&probe.legal===probe.unaffordable?
        'Gold für gültige Bauoption fehlt':probe.invalidSite>0?
        'Bauplatz-Eigentum/Referenz ungültig':probe.legal===0?
        'Keine legalen Bauoptionen im geprüften Gebiet':'Baukandidaten durch Priorität oder Reserve gesperrt';
      economicStatus=reason;
      if(failedEconomyProbes===5 || failedEconomyProbes%10===0)
        telemetry('build_stalled',reason,{attempts:failedEconomyProbes,
          gold:requirements.gold,investment:investmentStatus,priorities:entries.slice(0,4).map(e=>e.type),
          queries:probe.queries,workerErrors:probe.errors,legal:probe.legal,
          unaffordable:probe.unaffordable,invalidSite:probe.invalidSite,
          lowestCost:Number.isFinite(probe.lowestCost)?probe.lowestCost:null});
      economicLastPlan=entries.slice(0,3).map(x=>x.type).join(' › ');return false;}
    proposals.sort((a,b)=>b.siteValue-a.siteValue);
    const chosen=proposals[0];
    if(!live(serial))return false;
    const args=chosen.kind==='upgrade'?[chosen.unitId,chosen.type,1]:[chosen.type,chosen.tile];
    if(send(chosen.kind,args,`${chosen.kind==='upgrade'?'UPGRADE':'BAU'} ${chosen.type} · ${chosen.cost.toLocaleString()} Gold`)){
      economicPending={...chosen,tick};failedEconomyProbes=0;lastEconomy=tick;lastEconomicAction=tick;
      economicStatus='Anfrage: '+chosen.type+(chosen.kind==='upgrade'?' (Upgrade)':'');
      economicLastPlan=entries.slice(0,3).map(x=>x.type).join(' › ');
      return true;
    }
    return false;
  }
  // Launcher uses the SAME BuildUnitIntentEvent the game's build menu uses.
  // For nukes, tile is the ENEMY TARGET, not the launching silo location.
  function nukeTargets(me,intel,kind) {
    const radius=kind==='Hydrogen Bomb'?100:30;
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
      // Never splash our own or an ally's structures.
      if(ownAssets.some(u=>distance(u)<radius+5))continue;
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
      if(hit===0)value-=18;
      const sams=intel.enemySAM.filter(s=>distance(s)<number(()=>game.config().samRange(s.level?.()||1),70));
      // Launching blindly into a SAM bubble wastes expensive rockets.
      value-=sams.reduce((sum,u)=>sum+9+number(()=>u.level?.(),1)*2,0);
      if(sams.length && kind==='Hydrogen Bomb')value-=9;
      if(value>=(kind==='Hydrogen Bomb'?(lateGame(me)?11:13):(lateGame(me)?5:8)))
        proposed.push({tile,value,hit,sams:sams.length,owner});
    }
    return proposed.sort((a,b)=>b.value-a.value).slice(0,10);
  }
  function ownMissiles(me) {
    try{return game.units().filter(u=>safeID(u.owner?.())===safeID(me) &&
      ['Atom Bomb','Hydrogen Bomb'].includes(u.type?.()));}
    catch(_){return [];}
  }
  function inspectNukeLaunch(me,tick) {
    if(!nukePending)return false;
    const p=nukePending;
    const matches=ownMissiles(me).filter(u=>u.type?.()===p.type && Number.isInteger(u.targetTile?.()) &&
      Math.hypot(game.x(u.targetTile())-game.x(p.tile),game.y(u.targetTile())-game.y(p.tile))<15);
    // An existing missile at the same destination must NOT confirm a second
    // launch. Prefer stable unit IDs, falling back to target-matched counts.
    const observed=matches.some(u=>{
      const id=u.id?.();
      return id!==undefined && id!==null && !p.beforeIds.includes(String(id));
    }) || matches.length>p.beforeMatches;
    if(observed){
      nukeShots++;
      nukeStatus='Raketenstart bestätigt: '+p.type;
      telemetry('nuke_confirmed',nukeStatus,{tile:p.tile,attempt:p.attempt,confirmed:nukeShots});
      nukePending=null;return false;
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
    const choices=['Hydrogen Bomb','Atom Bomb'].filter(t=>!game.config().isUnitDisabled?.(t) &&
      (infinite||gold>=(t==='Hydrogen Bomb'?6400000:1100000)));
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
          if(!infinite&&(!Number.isFinite(cost)||gold-cost<(kind==='Hydrogen Bomb'?800000:250000)))continue;
          // Target may have changed owner while worker checked its legality.
          const o=game.owner(candidate.tile);
          if(!o?.isPlayer?.() || friendly(o,me))continue;
          const prior=ownMissiles(me).filter(u=>u.type?.()===kind &&
            Number.isInteger(u.targetTile?.()) &&
            Math.hypot(game.x(u.targetTile())-game.x(candidate.tile),
              game.y(u.targetTile())-game.y(candidate.tile))<15);
          const beforeIds=prior.map(u=>u.id?.()).filter(id=>id!==undefined&&id!==null).map(String);
          if(send('build',[kind,candidate.tile],`NUKE ${kind} → ${nameOf(o)} (${candidate.hit} Gebäude · ${candidate.value.toFixed(0)} Punkte)`)){
            lastNuke=tick;nukeAttempts++;
            nukePending={tile:candidate.tile,type:kind,tick,beforeIds,
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
    const hostileOutgoing=s.out?.some(a=>a.targetID===safeID(p));
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
    if(!opts.enabled || !opts.diplomacy || !connected() || !single(game) ||
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
    if(!connected()){diplomacyStatus='Diplomatie wartet auf aktiven Singleplayer';return;}
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
  async function naval(me,tick,serial) {
    if(!opts.boats||!ctors.boat||tick-lastBoat<100||pendingAttack)return false;
    lastBoat=tick;
    // Use the SAME complete threat snapshot as ground combat. Using military(me)
    // without front groups underestimates the reserve near stronger neighbors.
    const navyState=military(me,strategic.groups),spare=navyState.available;
    if(spare<1300 || navyState.incoming>0 || navyState.activeEnemy>0)return false;
    const foes=game.playerViews().filter(p=>safeID(p)!==safeID(me)&&p.isAlive?.()&&
      !friendly(p,me)&&Number.isInteger(p.state?.spawnTile)&&
      // The naval planner must obey the single-front war director as well.
      (!hardMode() || !isWar() || safeID(p)===warState.id));
    foes.sort((a,b)=>number(()=>a.troops())-number(()=>b.troops()));
    for(const foe of foes.slice(0,6)){
      const dest=foe.state.spawnTile;
      if(!game.isLand(dest)||safeID(game.owner(dest))!==safeID(foe))continue;
      let legal;
      try {legal=await me.actions(dest,['Transport']);}catch(_){continue;}
      if(!live(serial))return false;
      const ship=legal?.buildableUnits?.find(x=>x.type==='Transport'&&x.canBuild!==false);
      if(!ship || (Number(me.gold())<Number(ship.cost)&&!game.config().infiniteGold?.()))continue;
      if(game.euclideanDistSquared && game.euclideanDistSquared(dest,ship.canBuild)>10000)continue;
      const amount=Math.min(spare,Math.floor(number(()=>me.troops())*.58));
      if(spare<number(()=>foe.troops(),Infinity)*1.9 || number(()=>me.troops())<number(()=>game.config().maxTroops(me),1)*.47)continue;
      if(send('boat',[dest,Math.min(amount,Math.floor(spare*.60))],`LANDUNG → ${nameOf(foe)}`))return true;
    }
    return false;
  }
  async function step() {
    const found=discover();
    if(!found){if(game){generation++;game=null;bus=null;opts.enabled=false;persist();status='Warte auf Spiel';}paint();return;}
    if(found.g!==game||(found.b&&found.b!==bus))reset(found.g,found.b);
    if(!single(game)){
      if(opts.enabled){opts.enabled=false;generation++;persist();}
      status='Multiplayer/Replay: BOT GESPERRT';paint();return;
    }
    if(game?.gameOver?.()){
      if(opts.enabled){telemetry('game_over','Partie beendet · Bot automatisch gestoppt');
        opts.enabled=false;generation++;persist();}
      status='Partie beendet · Bot AUS';paint();return;
    }
    if(!bus&&found.b){bus=found.b;ctors=recognize(bus);}
    if(conflicts()){opts.enabled=false;status='Andere AggroBot-Version aktiv – alte Skripte deaktivieren';paint();return;}
    if(advisorConflict()){opts.enabled=false;status='Spawn Advisor: Auto-Spawn/Smart Attack/Auto-Accept ausschalten';paint();return;}
    if(!opts.enabled||busy||!connected()){paint();return;}
    // Keep observing confirmations and refreshing strategy even when the
    // combat-specific action budget is exhausted. send() enforces the cap.
    const tick=number(()=>game.ticks(),-1);
    if(tick<0||tick===lastTick){paint();return;}
    lastTick=tick;busy=true;const serial=generation,t0=performance.now();
    try {
      if(game.inSpawnPhase?.()){status='Auto-Spawn';doSpawn(tick);return;}
      const me=myPlayer();
      if(!me?.isAlive?.()||!me.hasSpawned?.()){status='Warte auf Spawn';return;}
      sampleTroops(tick,me);confirmAttack(me,tick);evaluateLastBattle(tick,me);
      let immediateState=military(me,strategic.groups);
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
      let s=military(me,groups);troopSnapshot=s;
      manageWar(me,groups,s,tick);
      const context=strategy(me,groups,s);
      s=tuneAutonomously(me,groups,s,tick,context);
      troopSnapshot=s;
      if(tick-lastDiagnosticTick>=80){lastDiagnosticTick=tick;
        telemetry('snapshot','Spielzustand',{difficulty:game.config().gameConfig().difficulty,
          gameType:game.config().gameConfig().gameType,investment:investmentStatus,
          cities:ownStructures(me).filter(u=>u.type?.()==='City').length,
          factories:ownStructures(me).filter(u=>u.type?.()==='Factory').length,
          borders:tiles.length,tuning:{...autoTuning,enabled:!!opts.fullAuto},defense:{status:defenseStatus,incoming:s.incoming,
            committed:s.committed,pendingRetreats:retreatRequests.size},enemies:groups.filter(g=>g.id!==null).map(g=>({name:nameOf(g.opponent),troops:number(()=>g.opponent.troops()),land:number(()=>g.opponent.numTilesOwned())})),
          readiness:context.readiness?.reason,ratio:s.ratio,maxTroops:s.max,growthPotential:s.growthPotential});}

      if(plan&&tick>=plan.until)plan=null;
      status='Strategie: '+context.wanted+' · Heim '+Math.round(s.home/10)+
        ' · Reserve '+Math.round(s.reserve/10)+' · Front '+Math.round(s.committed/10);
      const ranked=rankedTargets(groups,me,tick,s,context);
      // Do not open a new front while the homeland is under heavy assault.
      const dangerNow=defenseAssessment(me,s,tick);
      if(dangerNow.severe){status='NOTVERTEIDIGUNG · Heimtruppen halten / Angriffe zurückrufen';return;}
      if(await defense(me,tick,serial,groups,s))return;
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
    panel.style.cssText='position:fixed;left:12px;bottom:12px;width:335px;max-width:calc(100vw - 24px);max-height:68vh;overflow:auto;z-index:2147483644;padding:12px;background:rgba(9,18,32,.96);border:1px solid #42a5d9;border-radius:10px;color:#f0f4fa;font:12px/1.4 system-ui,Arial,sans-serif;box-shadow:0 5px 25px #000a';
    panel.addEventListener('click',e=>{
      const key=e.target.closest('button[data-key]')?.dataset.key;if(!key)return;
      if(key==='export'){exportDiagnostics();return;}
      if(key==='enabled'){
        if(!connected())status=conflicts()?'Alte Bot-Version deaktivieren':advisorConflict()?'Spawn Advisor Auto/Smart/Auto-Accept ausschalten':'Nur in laufender Singleplayer-Partie mit EventBus';
        else {opts.enabled=!opts.enabled;generation++;log(opts.enabled?'BOT START':'BOT PAUSE');}
      }else if(key==='fullAuto'){
        opts.fullAuto=!opts.fullAuto;
        if(opts.fullAuto){opts.autoStrategy=true;autoTuning.tick=-Infinity;}
      }else if(key==='autoStrategy'&&opts.fullAuto){opts.fullAuto=false;opts.autoStrategy=false;}
      else if(['economy','boats','autoSpawn','defense','stopOnError','upgrades','safeMode','autoStrategy','diplomacy','offerAlliances','nukes','antiNuke','lateOffense','impossibleMode'].includes(key))opts[key]=!opts[key];
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
    const b=(key,label)=>`<button data-key="${key}" style="border:1px solid #779;border-radius:5px;color:#fff;background:${opts[key]?'#167247':'#344157'};padding:5px 7px;margin:2px;cursor:pointer">${label}</button>`;
    panel.innerHTML=`<b style="font-size:15px;color:#83dcff">Solo AggroBot ${VERSION}</b> ${single(game)?'🟢':'🔒'}
      <div style="color:#bed5e8;margin:6px 0">${escapeHTML(status)}</div>
      <div>${b('enabled',opts.enabled?'⏸ PAUSE':'▶ BOT STARTEN')}</div>
      <div>${b('autoSpawn','Spawn')} ${b('defense','Gegenangriff')} ${b('economy','Wirtschaft')} ${b('boats','Marine')}</div>
      <div>${b('upgrades','Upgrades')} ${b('safeMode','Not-Aus')} ${b('autoStrategy','Auto-Strategie '+(opts.autoStrategy?'AN':'AUS'))} ${b('fullAuto','Vollautonom '+(opts.fullAuto?'AN':'AUS'))}</div>
      <div>${b('diplomacy','Diplomatie')} ${b('offerAlliances','Bündnisse anbieten')}</div>
      <div>${b('nukes','Auto-Nukes')} ${b('antiNuke','Intelligente SAMs')} ${b('lateOffense','Late-Game-Offensive')}</div>
      <div>${b('impossibleMode','Unmöglich-Taktik')} <button data-key="export" style="border:1px solid #73acdd;border-radius:5px;background:#235078;color:white;padding:5px 7px;cursor:pointer">📄 Diagnose JSON</button></div>
      <div style="color:#a9efc9">Hauptfront: ${escapeHTML(warState.name)} · Krieg ${isWar()?'aktiv':'frei'} · ${escapeHTML(lastRecoveryReason||'bereit')}</div>
      <div>${b('plan','Manuell: '+opts.plan)}<br>${b('buildStyle','Manueller Baufokus: '+opts.buildStyle)}</div>
      <div style="color:#a9efc9">KI-Strategie: ${escapeHTML(strategic.mode)} · ${escapeHTML(strategic.reason)} · Bau: ${escapeHTML(effectiveBuildStyle())}</div>
      <div style="color:#9bd0e4">Verteidigung: ${escapeHTML(defenseStatus)} · Rückzüge ${defenseStats.retreatsOrdered}/${defenseStats.retreatsObserved} beobachtet · unklar ${defenseStats.unknown} · unbestätigt ${defenseStats.unconfirmed}</div>
      <div style="color:#9bd0e4">Nukes: ${escapeHTML(nukeStatus)} · bestätigt ${nukeShots} / Versuche ${nukeAttempts} / unbestätigt ${nukeUnconfirmed} · SAM-Schutz ${nuclearCache?.assets?.length - nuclearCache?.uncovered?.length||0}/${nuclearCache?.assets?.length||0}</div>
      <div style="color:#9bd0e4">Allianzen: ${escapeHTML(diplomacyStatus)} · Bestätigt: ${diplomacyStats.accepted} angenommen, ${diplomacyStats.rejected} abgelehnt · ${diplomacyPending.size} ausstehend · ${diplomacyStats.offered} angeboten</div>
      <div style="color:#a9efc9">Parameter: ${opts.fullAuto?'AUTONOM '+escapeHTML(autoTuning.mode)+' · '+escapeHTML(autoTuning.reason):'MANUELL'}</div>
      <label>Aggressivität: ${setting('aggressive')}%${opts.fullAuto?' (Auto)':''}<input type="range" data-option="aggressive" min="40" max="100" value="${setting('aggressive')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Reserve: ${setting('reserve')}%${opts.fullAuto?' (Auto)':''}<input type="range" data-option="reserve" min="5" max="65" value="${setting('reserve')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Aktionen/Min.: ${setting('actionsPerMinute')}${opts.fullAuto?' (Auto)':''}<input type="range" data-option="actionsPerMinute" min="15" max="120" value="${setting('actionsPerMinute')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Zielprüfungen: ${setting('maxTargets')}${opts.fullAuto?' (Auto)':''}<input type="range" data-option="maxTargets" min="4" max="25" value="${setting('maxTargets')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <div style="color:#9bd0e4">Bau: ${escapeHTML(economicStatus)} · Sparziel: ${escapeHTML(investmentStatus)} · Prioritäten: ${escapeHTML(economicLastPlan)}</div>
      <div style="color:#9bd0e4">Tempo: Front ${runtime.borderMs}ms · Kampf ${runtime.combatMs}ms · Bau ${runtime.economyMs}ms · Worker-Checks ${runtime.attackProbes}/${runtime.buildProbes}</div>
      <div style="color:#9bd0e4">Events: ${escapeHTML(Object.keys(ctors).filter(k=>ctors[k]).join(', ')||'keine')}</div>
      <div style="color:#9bd0e4">Aktionsbudget: ${actions.length}/${setting('actionsPerMinute')} · Gesendet: ${totalSent} · Fehlgeschlagen: ${totalFailed} · Fehler: ${errors}</div>
      <div style="color:#9bd0e4">Heim: ${Math.floor(troopSnapshot.home/10)} · Reserve: ${Math.floor(troopSnapshot.reserve/10)} · Laufende Angriffe: ${Math.floor(troopSnapshot.committed/10)} · Einkommen/Reserve: ${(troopSnapshot.ratio*100).toFixed(0)}% Kapazität</div>
      <div style="color:#9bd0e4">Eingehend: ${Math.floor(troopSnapshot.incoming/10)} · Stärkster Grenznachbar: ${Math.floor(troopSnapshot.strongest/10)} · Ziel: ${escapeHTML(lastSelection||plan?.name||'Suche')} · ${borderCache?.length||0} Grenzfelder</div>
      <div style="border-top:1px solid #527;margin-top:7px;padding-top:5px"><b>Letzte Entscheidungen</b>${recent.map(s=>`<div>• ${escapeHTML(s)}</div>`).join('')}</div>
      <div style="color:#97a8be;font-size:10px;margin-top:8px">Nur Singleplayer · Start nach Seitenwechsel AUS · Alt+Shift+P Pause/Start · Alt+Shift+X NOT-AUS.<br>Bei parallelem Spawn Advisor: Auto-Spawn, Smart Attack und Auto-Accept Alliances dort ausschalten.</div>`;
  }
  document.addEventListener('keydown',e=>{
    if(!e.altKey||!e.shiftKey||!['p','x'].includes(e.key.toLowerCase())||e.repeat||e.target?.isContentEditable||
      /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||''))return;
    e.preventDefault();
    if(e.key.toLowerCase()==='x'){
      opts.enabled=false;generation++;log('NOT-AUS über Hotkey');
    }else if(connected()){
      opts.enabled=!opts.enabled;generation++;log(opts.enabled?'BOT START':'BOT PAUSE');
    } else status='Bot nur in Singleplayer verfügbar';
    persist();lastPaint=0;paint();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint,{once:true});
  const interval=setInterval(step,400);
  const economyInterval=setInterval(economyStep,750);
  const diplomacyInterval=setInterval(diplomacyTick,950);
  const nukeInterval=setInterval(nukeStep,1100);
  window.addEventListener('beforeunload',()=>{clearInterval(interval);clearInterval(economyInterval);clearInterval(diplomacyInterval);clearInterval(nukeInterval);});
  console.info(PREFIX,'v'+VERSION,'ready; singleplayer only, OFF by default');
})();
