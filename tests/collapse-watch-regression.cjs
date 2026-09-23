'use strict';
// P4 Regression: Collapse-Wächter erkennt jede der 8 degenerierten
// Kategorien deterministisch, meldet sie auf einem gesunden Bot nicht, und
// trennt das entscheidende Promotions-Signal (bestätigter Outcome) von den
// nur auxiliary Suchsignalen (Land/Öko/Verluste/Überleben) — Tick-Limit zensiert.
const assert=require('node:assert/strict');
const {watch,watchBot,assessPromotion,detect,CATEGORIES}=
  require('../trainer/collapse-watch.cjs');

// Realistische Match-Struktur (Spiegel von match.json). Default = gesund:
// baut weiter, attack-dominant, moderates Gold, keine Kernstadt-Fehlstelle,
// FFA, kein Krieg, keine Marine, ausreichendes Land.
function makeBot(overrides={}){
  const d=overrides.diagnostics||{};
  return {
    clientID:'aggrobot1',profile:'autonomous',archetype:overrides.archetype||'legacy',
    teamIndex:overrides.teamIndex??0,botSHA256:'a'.repeat(64),
    outcome:overrides.outcome??'unknown',started:true,spawned:true,emitted:120,
    land:overrides.land??500,alive:overrides.alive??true,
    diagnostics:{
      income:overrides.diagnostics?.income||{train:0,trade:0,gold:30000,
        netGold:30000,otherNetAfterTradeTrain:30000,observed:true},
      construction:overrides.diagnostics?.construction||{
        pending:{unit:'City',tile:'12-3'},
        coreFunding:{missing:[],gold:30000,needed:0,shortfall:0,
          status:'funded'},
        investment:'Ausweitung'},
      war:overrides.diagnostics?.war||{id:null,name:'—',since:null,
        blockedUntil:null},
      marine:overrides.diagnostics?.marine||{
        stats:{transportSent:0,transportConfirmed:0,transportArrived:0,
          bridgeheadHeld:0,bridgeheadHeld120:0,bridgeheadHeld600:0,
          bridgeheadLost:0,transportUnconfirmed:0,transportUnresolved:0,
          warshipSent:0,warshipConfirmed:0,warshipUnconfirmed:0},
        pendingBoat:null,pendingWarship:null,landingAudits:[],
        portProbeFailures:0},
      planning:overrides.diagnostics?.planning||{tick:600,
        candidates:[
          {id:'attack',channel:'attack',kind:'attack',target:'t1',
            utility:200,cost:100,risk:0.2,waitCost:50,reason:'Druck'},
          {id:'hold',channel:'hold',kind:'hold',target:null,
            utility:80,cost:0,risk:0.5,waitCost:900,reason:'sichtbarer Druck'}]},
      localDuo:overrides.diagnostics?.localDuo||{status:'AUS',peer:null,
        partnerID:'',resolvedPartnerID:null,ownID:'0fha9950',connected:false,
        match:null,failures:0,relayDrops:0,relayTimeouts:0,ackTimeouts:0,
        phase:{phase:'off',reason:'Duo deaktiviert'}},
      defense:overrides.diagnostics?.defense||{
        status:'Keine eingehenden Angriffe',
        stats:{retreatsOrdered:0,retreatsObserved:0,unknown:0,
          unconfirmed:0},pendingRetreats:[]},
      military:overrides.diagnostics?.military||{
        home:100000,max:200000,committed:500,incoming:0,strongest:150000,
        ratio:0.75,reserve:49500,available:99500,total:149500},
      landingFailures:overrides.diagnostics?.landingFailures||[],
      ...(overrides.extra||{})
    }};
}
function makeMatch(bot,run={},gameEnd=null,meta={}){
  return {
    benchmarkMeta:meta,gameEnd,
    run:Object.assign({termination:'tick-limit',tick:6000,spawned:true,
      emitted:120,failure:null,recordCount:100,scriptedStats:{}},run),
    fullBots:[bot]};
}
function flagged(match,b,i=0){return watchBot(match,b,i).flaggedCategories;}

// 0) Gesunder Bot → keine Flag.
{
  const match=makeMatch(makeBot());
  const res=watch(match);
  assert.deepEqual(res.flaggedCategories,[],'healthy bot should have no flags');
  assert.equal(res.summary.totalFlagged,0);
  assert.equal(res.censored,true,'tick-limit run is censored');
}

// 1) passive_hold_spam: hold bester Plan, Gold da, kein Bau, kaum Land.
{
  const bot=makeBot({land:2,diagnostics:{
    planning:{tick:600,candidates:[
      {id:'hold',kind:'hold',utility:120,cost:0,reason:'Druck'},
      {id:'attack',kind:'attack',utility:40,cost:50,reason:'—'}]},
    construction:{pending:null,coreFunding:{missing:[],gold:60000,
      needed:0,shortfall:0,status:'funded'},investment:'—'},
    income:{train:0,trade:0,gold:60000,netGold:60000,observed:true}}});
  const match=makeMatch(bot);
  assert.ok(flagged(match,bot).includes('passive_hold_spam'),'hold spam');
}

// 2) blind_rush: früher Krieg, noch keine Stadt, kaum Land.
{
  const bot=makeBot({land:1,diagnostics:{
    war:{id:'war-1',name:'Krieg',since:120,blockedUntil:null},
    construction:{pending:null,
      coreFunding:{missing:['City','Factory'],gold:2000,
        needed:125000,shortfall:123000,status:'saving'},investment:'—'},
    income:{train:0,trade:0,gold:2000,netGold:2000,observed:true}}});
  const match=makeMatch(bot);
  assert.ok(flagged(match,bot).includes('blind_rush'),'blind rush');
}

// 3) gold_hoarding: viel Gold, kein Bau, kaum Land.
{
  const bot=makeBot({land:2,diagnostics:{
    construction:{pending:null,
      coreFunding:{missing:[],gold:90000,needed:0,shortfall:0,
        status:'funded'},investment:'—'},
    income:{train:0,trade:0,gold:90000,netGold:90000,observed:true},
    planning:{tick:600,candidates:[{id:'attack',kind:'attack',
      utility:150,cost:50,reason:'Druck'}]}}});
  const match=makeMatch(bot);
  assert.ok(flagged(match,bot).includes('gold_hoarding'),'gold hoarding');
}

// 4) missing_city_building: Kernstadt fehlt, kein Bau.
{
  const bot=makeBot({diagnostics:{
    construction:{pending:null,
      coreFunding:{missing:['City'],gold:50000,needed:125000,
        shortfall:75000,status:'saving'},investment:'Erste Stadt/Fabrik'},
    income:{train:0,trade:0,gold:50000,netGold:50000,observed:true}}});
  const match=makeMatch(bot);
  assert.ok(flagged(match,bot).includes('missing_city_building'),
    'missing city building');
}

// 5) alliance_errors: 2v2-Team, aber Duo nicht verbunden.
{
  const bot=makeBot({teamIndex:0,diagnostics:{
    localDuo:{status:'AUS',peer:null,partnerID:'',resolvedPartnerID:null,
      ownID:'0fha9950',connected:false,match:null,failures:0,relayDrops:0,
      relayTimeouts:0,ackTimeouts:0,phase:{phase:'off',
        reason:'Duo deaktiviert'}}}});
  const match=makeMatch(bot,{},null,
    {gameConfig:{gameMode:'Team'}});
  assert.ok(flagged(match,bot).includes('alliance_errors'),'alliance errors');
}

// 6) endless_war_lock: Dauerkrieg seit Anfang, zensiert, immer noch alive.
{
  const bot=makeBot({alive:true,land:1,diagnostics:{
    war:{id:'war-9',name:'Krieg',since:60,blockedUntil:null},
    construction:{pending:{u:1},
      coreFunding:{missing:[],gold:5000,needed:0,shortfall:0,
        status:'funded'},investment:'—'},
    income:{train:0,trade:0,gold:5000,netGold:5000,observed:true}}});
  const match=makeMatch(bot,{termination:'tick-limit'});
  assert.ok(flagged(match,bot).includes('endless_war_lock'),'war lock');
}

// 7) pure_survival: kein Krieg, hold-dominant, kaum Land.
{
  const bot=makeBot({land:2,diagnostics:{
    war:{id:null,name:'—',since:null,blockedUntil:null},
    planning:{tick:600,candidates:[
      {id:'hold',kind:'hold',utility:110,cost:0,reason:'Druck'},
      {id:'attack',kind:'attack',utility:20,cost:50,reason:'—'}]},
    construction:{pending:{u:1},
      coreFunding:{missing:[],gold:10000,needed:0,shortfall:0,
        status:'funded'},investment:'—'},
    income:{train:0,trade:0,gold:10000,netGold:10000,observed:true}}});
  const match=makeMatch(bot);
  assert.ok(flagged(match,bot).includes('pure_survival'),'pure survival');
}

// 8) faulty_marine_eta: Transports versendet, keine Brückenköpfe.
{
  const bot=makeBot({land:500,diagnostics:{
    marine:{stats:{transportSent:3,transportConfirmed:0,
      transportArrived:0,bridgeheadHeld:0,bridgeheadHeld120:0,
      bridgeheadHeld600:0,bridgeheadLost:1,transportUnconfirmed:2,
      transportUnresolved:0,warshipSent:0,warshipConfirmed:0,
      warshipUnconfirmed:0},pendingBoat:null,pendingWarship:null,
      landingAudits:[{ok:false}],portProbeFailures:0},
    landingFailures:[{tick:100},{tick:120}]}});
  const match=makeMatch(bot);
  assert.ok(flagged(match,bot).includes('faulty_marine_eta'),'marine ETA');
}

// Alle acht Kategorien sind bekannt und deterministisch benannt.
assert.equal(CATEGORIES.length,8);
for(const c of CATEGORIES){
  const r=detect(c,{fullBots:[makeBot()]},makeBot());
  assert.ok(r.flagged===false||r.flagged===true);
  assert.ok(typeof r.reason==='string'&&r.reason.length>0);
  assert.ok('evidence' in r);
}

// P4.5 Promotions-Trennung:
//  a) Tick-Limit → zensiert, NICHT entscheidend.
{
  const bot=makeBot();
  const match=makeMatch(bot,{termination:'tick-limit'},null);
  const p=assessPromotion(match,bot,0);
  assert.equal(p.censored,true);
  assert.equal(p.decisive,false);
  assert.equal(p.promotionSignal,'censored-tick-limit');
  assert.ok('auxiliary' in p&&'heldLand' in p.auxiliary&&
    'economicEffect' in p.auxiliary&&'survival' in p.auxiliary,
    'auxiliary search signals present');
}
//  b) Bestätigter Outcome → entscheidend.
{
  const bot=makeBot({land:600});
  const match=makeMatch(bot,{termination:'game-over',tick:4000},
    {outcome:'victory',source:'engine-WinUpdate',tick:4000,land:600});
  const p=assessPromotion(match,bot,0);
  assert.equal(p.censored,false);
  assert.equal(p.decisive,true);
  assert.equal(p.promotionSignal,'confirmed-victory');
  assert.equal(typeof p.auxiliary.heldLand,'number');
}
//  c) Defeat → bestätigt, ebenfalls entscheidend (Negativ-Promotion).
{
  const bot=makeBot({land:3});
  const match=makeMatch(bot,{termination:'game-over',tick:3000},
    {outcome:'defeat',source:'engine-elimination',tick:3000,land:3});
  const p=assessPromotion(match,bot,0);
  assert.equal(p.decisive,true);
  assert.equal(p.promotionSignal,'confirmed-defeat');
}

console.log('PASS P4 collapse-watcher regression (8 categories + promotion split)');
