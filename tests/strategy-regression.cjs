'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'OpenFront_Solo_AggroBot.user.js'), 'utf8');
const anchor = "  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, OFF by default');";
assert(source.includes(anchor), 'bot test injection anchor missing');
let pass = 0, fail = 0;
async function check(name, test) {
  try { await test(); ++pass; console.log('PASS', name); }
  catch (error) { ++fail; console.error('FAIL', name, error.stack); }
}
function boot() {
  let tick = 300, land = 1200, gold = 1000000, home = 90000, enemyLand = 900, gameOver = false;
  const out = [], incoming = [], sent = [], warnings = [], infos = [], timers = [];
  const me = {
    id: () => 'me', smallID: () => 1, troops: () => home, numTilesOwned: () => land,
    gold: () => BigInt(gold), isAlive: () => true, hasSpawned: () => true,
    isPlayer: () => true, units: () => [], outgoingAttacks: () => out,
    incomingAttacks: () => incoming, isFriendly: () => false,
    state: {spawnTile: 505}, displayName: () => 'Me',
    actions: async (tile, types) => ({
      canAttack: true,
      buildableUnits: (types || []).map(type => ({
        type, canBuild: type === 'Factory' ? tile : false,
        canUpgrade: false, cost: 125000n
      }))
    })
  };
  const enemy = (id, troops, num) => ({
    id: () => id, smallID: () => num, troops: () => troops,
    numTilesOwned: () => id === 'weak' ? enemyLand : 1200,
    isAlive: () => true, isPlayer: () => true, isFriendly: () => false,
    units: () => [], displayName: () => id
  });
  const weak = enemy('weak', 20000, 2), strong = enemy('strong', 85000, 3);
  weak.state = {spawnTile: 5}; strong.state = {spawnTile: 6};
  const config = {
    gameConfig: () => ({gameType: 'Singleplayer', difficulty: 'Impossible'}),
    isReplay: () => false, maxTroops: () => 100000,
    infiniteTroops: () => false, infiniteGold: () => false,
    isUnitDisabled: () => false, samRange: () => 70
  };
  const game = {
    config: () => config, myPlayer: () => me, ticks: () => tick,
    gameOver: () => gameOver, playerViews: () => [me, weak, strong],
    units: () => [], inSpawnPhase: () => false,
    x: t => t % 100, y: t => Math.floor(t / 100), width: () => 100,
    height: () => 100, ref: (x,y) => y * 100 + x,
    isValidRef: t => Number.isInteger(t) && t >= 0 && t < 10000,
    isLand: () => true, isImpassable: () => false, isShore: () => false,
    ownerID: () => 1, owner: t => t === 5 ? weak : t === 6 ? strong : me,
    neighbors4: () => 0
  };
  const fixedDate = class extends Date { static now() { return 1789848000000; } };
  class Attack { constructor(targetID,troops) { this.targetID=targetID; this.troops=troops; } }
  class Build { constructor(unit,tile) { this.unit=unit; this.tile=tile; } }
  const win = {addEventListener: () => {}};
  const context = {
    window: win, document: {readyState: 'loading', body: null,
      addEventListener: () => {}, querySelector: () => null},
    localStorage: {getItem: () => null, setItem: () => {}},
    Date: fixedDate, console: {info: (...parts) => infos.push(parts.join(' ')),
      warn: (...parts) => warnings.push(parts.join(' ')), error: () => {}},
    setInterval: () => 1, clearInterval: () => {}, setTimeout: fn => {timers.push(fn);return 1;},
    performance: {now: () => 0},
    URL: {createObjectURL: () => '', revokeObjectURL: () => {}},
    Blob: class {}
  };
  const expose = [
    'window.__test={',
    'setup:(g,b,c)=>{game=g;bus=b;ctors=c;opts.enabled=true;},',
    'military,warReadiness,targetOpportunity,targetEconomics,enemyOpportunityRatio,allyAssistTarget,growthPressure,neutralAttackAmount,rankedTargets,confirmAttack,evaluateLastBattle,attackTargetPlayer,attackTargetID,attackTargets,economy,economicNeeds,economicAnchors,portCoastalAnchors,nuclearIntel,strategy,manageWar,gameOutcome,telemetry,coordinatedWar,attack,actionBudget,connected,permittedMatch,multiplayerMatch,send,reset,naval,neutralNavalCandidates,inspectMarine,sendMarineTransport,defense,fleetDefense,teamSupport,renewAlliances,defenseAssessment,emergencyRetreat,siteScore,railStationScore,recognize,tuneAutonomously,setting,inspectNukeLaunch,nukeStep,nukeTargets,nukeTrajectoryRisk,rocketReadiness,nukeSalvoPlan,diplomacyScore,diplomacyTickSafe,victoryPlan,sampleIncome,enemyUnderAttack,attackForecast,targetsFromBorder,intentHealth,reportIntents,spawnRemaining,spawnTileValid,spawnRivals,spawnScore,emergencySpawnSearch,startSpawnSearch,doSpawn,spawnBlock,step,',
    'setBudget:n=>actions=Array(n).fill(Date.now()),',
    'setWarWait:n=>warWaitSince=n,setEconFails:n=>failedEconomyProbes=n,',
    'setPending:p=>pendingAttack=p,setLastBattle:p=>lastBattle=p,',
    'setWar:(id,name)=>warState={id,name,since:game.ticks(),blockedUntil:-Infinity},',
    'setGroups:groups=>strategic.groups=groups,',
    'setBoats:yes=>opts.boats=yes,setBoatCtor:C=>ctors.boat=C,',
    'setCancelCtor:C=>ctors.cancel=C,setTroopSnapshot:t=>troopSnapshot=t,setCtor:(key,C)=>ctors[key]=C,',
    'setMode:m=>strategic.mode=m,setAllianceCtor:C=>ctors.alliance=C,',
    'setNukePending:p=>nukePending=p,',
    'setPerf:(combat,border,economy)=>runtime={...runtime,combatMs:combat,borderMs:border,economyMs:economy},',
    'state:()=>({pendingAttack,attackReceipts,warState,lastBattle,gameEnd,diagnostics,spawnState,spawnCache,spawnJob,economicStatus,failedEconomyProbes,investmentStatus,pendingBoat,pendingWarship,marineStats,portProbeFailures,strategic,winStatus,incomeStatus,fleetStatus,strategicTelemetry,defenseStatus,defenseStats,autoTuning,nukeShots,nukeAttempts,nukeUnconfirmed,nukePending,lastProposalTick,diplomacyStatus,diplomacyPending:[...diplomacyPending.values()],retreatRequests:[...retreatRequests.values()]}),opts};'
  ].join('\n');
  vm.runInNewContext(source.replace(anchor, expose + '\n' + anchor), context, {timeout:2000});
  win.__test.setup(game, {emit:event=>sent.push(event)}, {attack:Attack, build:Build});
  return {b:win.__test,game,me,weak,strong,out,sent,warnings,infos,doc:context.document,
    flushTimers:(limit=40)=>{for(let i=0;i<limit&&timers.length;i++)timers.shift()();return timers.length;},
    setTick:v=>tick=v,setLand:v=>land=v,setEnemyLand:v=>enemyLand=v,
    setOver:v=>gameOver=v,setGold:v=>gold=v,setHome:v=>home=v};
}
(async () => {
  await check('reserve includes stronger second neighbor', () => {
    const x=boot(),s=x.b.military(x.me,[{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}]);
    assert.equal(s.strongest,85000);
    assert(s.available>35000&&s.available<42000,s.available);
  });
  await check('unbuildable structures do not block war forever', () => {
    const x=boot(); x.setTick(1150); x.b.setEconFails(6); x.b.setWarWait(800);
    assert.equal(x.b.warReadiness(x.me,[{id:null}],x.b.military(x.me,[]),1150).ready,true);
  });
  await check('unrelated land does not falsely confirm attack', () => {
    const x=boot();
    x.b.setPending({id:'weak',name:'weak',tick:200,amount:500,
      ownLand:1200,enemyLand:900,beforeIds:[],beforeTroops:0});
    x.setLand(1201); x.b.confirmAttack(x.me,290);
    assert.equal(x.b.state().attackReceipts.confirmed,0);
    assert.equal(x.b.state().attackReceipts.unconfirmed,1);
  });
  await check('new outgoing stack confirms intended target', () => {
    const x=boot();
    x.b.setPending({id:'weak',name:'weak',tick:200,amount:500,
      ownLand:1200,enemyLand:900,beforeIds:[],beforeTroops:0});
    x.out.push({id:'new',targetID:2,troops:500,retreating:false});
    x.b.confirmAttack(x.me,210);
    assert.equal(x.b.state().warState.id,'weak');
  });
  await check('combat keeps economy action reserve', () => {
    const x=boot(); x.b.setBudget(63);
    assert.equal(x.b.actionBudget('combat'),false);
    assert.equal(x.b.actionBudget('general'),true);
  });
  await check('factory can build if city placement fails', async () => {
    const x=boot();
    assert.equal(await x.b.economy(x.me,300,0,[]),true);
    assert.equal(x.sent[0].unit,'Factory');
  });
  await check('navy keeps the locked war target', async () => {
    const x=boot();x.b.setBoats(true);x.b.setWar('strong','strong');
    x.strong.troops=()=>5000;
    x.b.setGroups([{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}]);
    x.me.actions=async()=>({buildableUnits:[{type:'Transport',canBuild:1,cost:0n}]});
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    x.b.setBoatCtor(Boat);
    assert.equal(await x.b.naval(x.me,300,0),true);
    assert.equal(x.sent[0].dst,6);
  });
  await check('navy keeps reserves against all border enemies', async () => {
    const x=boot();x.b.setBoats(true);x.b.setWar('weak','weak');
    x.b.setGroups([{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}]);
    x.me.actions=async()=>({buildableUnits:[{type:'Transport',canBuild:1,cost:0n}]});
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    x.b.setBoatCtor(Boat);
    assert.equal(await x.b.naval(x.me,300,0),true);
    assert.equal(x.sent[0].dst,5);
    assert(x.sent[0].troops<26000,x.sent[0].troops);
  });
  await check('no orders after match ended', () => {
    const x=boot();x.setOver(true);assert.equal(x.b.connected(),false);
  });

  await check('startup saves for first city/factory instead of defense post', async () => {
    const x=boot(); x.setGold(55000);
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:BigInt(type==='Defense Post'?50000:125000)}))});
    assert.equal(await x.b.economy(x.me,300,0,[]),false);
    assert.equal(x.sent.length,0);
  });
  await check('startup spends first 125k on City or Factory', async () => {
    const x=boot();x.setGold(125000);
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:BigInt(type==='Defense Post'?50000:125000)}))});
    assert.equal(await x.b.economy(x.me,300,0,[]),true);
    assert(['City','Factory'].includes(x.sent[0].unit),x.sent[0].unit);
  });
  await check('late game accumulates funds without treating saving as failed construction', async () => {
    const x=boot();x.setTick(2400);x.setLand(51613);x.setGold(900000);
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>100+i*20,id:()=>i+1,level:()=>1}));
    x.me.units=()=>units;
    const needs=x.b.economicNeeds(x.me,units,[]);
    assert.equal(needs.saveForSilo,true);assert.equal(needs.savingsTarget,1150000);
    assert.equal(await x.b.economy(x.me,2400,0,[]),false);
    assert.equal(x.sent.length,0);
    assert.equal(x.b.state().failedEconomyProbes,0);
  });
  await check('first silo is funded and built at threshold', async () => {
    const x=boot();x.setTick(2400);x.setLand(51613);x.setGold(1200000);
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>100+i*20,id:()=>i+1,level:()=>1}));
    x.me.units=()=>units;
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:BigInt(type==='Missile Silo'?1000000:250000)}))});
    assert.equal(await x.b.economy(x.me,2400,0,[]),true);
    assert.equal(x.sent[0].unit,'Missile Silo');
  });
  await check('full late army selects technology, not permanent defense', () => {
    const x=boot();x.setTick(2400);x.setLand(51613);x.strong.troops=()=>200000;
    const groups=[{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}];
    assert.equal(x.b.strategy(x.me,groups,x.b.military(x.me,groups)).wanted,'TECH');
  });
  await check('stale war target can be reassessed', () => {
    const x=boot();x.setTick(1400);x.b.setWar('strong','strong');x.setTick(2400);
    const groups=[{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}];
    x.b.manageWar(x.me,groups,x.b.military(x.me,groups),2400);
    assert.equal(x.b.state().warState.id,null);
  });
  await check('Public mode is playable without an extra test-mode opt-in', () => {
    const x=boot();x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Medium'});
    assert.equal(x.b.connected(),true);
  });

  await check('emergency recalls committed neutral attack before worker scan', () => {
    const x=boot();class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);
    x.out.push({id:'neutral-1',targetID:null,troops:24000,retreating:false});
    x.me.incomingAttacks=()=>[{id:'enemy-1',attackerID:2,troops:44000,retreating:false}];
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),true);
    assert.equal(x.sent.length,1);
    assert.equal(x.sent[0].attackID,'neutral-1');
    assert.equal(x.b.state().defenseStats.retreatsOrdered,1);
  });
  await check('emergency retreat is not spammed on the same stack', () => {
    const x=boot();class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);
    x.out.push({id:'neutral-2',targetID:null,troops:24000,retreating:false});
    x.me.incomingAttacks=()=>[{id:'enemy-1',attackerID:2,troops:44000,retreating:false}];
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),true);
    assert.equal(x.b.emergencyRetreat(x.me,301,x.b.military(x.me,[])),false);
    assert.equal(x.sent.length,1);
    x.out[0].retreating=true;
    x.b.emergencyRetreat(x.me,307,x.b.military(x.me,[]));
    assert.equal(x.b.state().defenseStats.retreatsObserved,1);
  });
  await check('minor incoming attack does not trigger 25 percent retreat loss', () => {
    const x=boot();class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);
    x.out.push({id:'valuable-war',targetID:2,troops:40000,retreating:false});
    x.me.incomingAttacks=()=>[{id:'enemy-1',attackerID:2,troops:12000,retreating:false}];
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),false);
    assert.equal(x.sent.length,0);
  });
  await check('emergency recalls attacks despite a full action budget', () => {
    const x=boot();class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);x.b.setBudget(72);
    x.out.push({id:'front-1',targetID:2,troops:33000,retreating:false});
    x.me.incomingAttacks=()=>[{id:'enemy-1',attackerID:2,troops:77000,retreating:false}];
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),true);
    assert.equal(x.sent[0].attackID,'front-1');
  });
  await check('defense post inside thirty-tile range beats one outside', () => {
    const x=boot(),inside=230,outside=283,fronts=[250];
    const a=x.b.siteScore('Defense Post',inside,fronts,[],0,false);
    const b=x.b.siteScore('Defense Post',outside,fronts,[],0,false);
    assert(a>b+50,{inside:a,outside:b});
  });
  await check('large hostile frontier requests more than four defense posts', () => {
    const x=boot();x.setLand(20000);
    const groups=[{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong},
      {id:'e3',opponent:x.weak},{id:'e4',opponent:x.strong},{id:'e5',opponent:x.weak}];
    x.b.setGroups(groups);
    x.b.setTroopSnapshot({home:90000,max:150000,ratio:.60,incoming:50000,
      strongest:180000,committed:0,reserve:0,available:0});
    const needs=x.b.economicNeeds(x.me,[],Array(1200).fill(230));
    const dp=needs.list.find(x=>x.type==='Defense Post');
    assert(dp&&dp.desired>=10,dp?.desired);
    assert.equal(needs.immediate,true);
  });
  await check('Public mode supports emergency retreat when enabled', () => {
    const x=boot();class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);
    x.out.push({id:'front',targetID:null,troops:50000,retreating:false});
    x.me.incomingAttacks=()=>[{id:'enemy',attackerID:2,troops:90000,retreating:false}];
    x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Medium'});
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),true);
    assert.equal(x.sent.length,1);
    assert.equal(x.sent[0].attackID,'front');
  });
  await check('cancel intent constructor recognized without reliable class name', () => {
    const x=boot();const C=class Minified{constructor(attackID){this.attackID=attackID;}};
    const constructors=x.b.recognize({listeners:new Map([[C,[()=>{}]]])});
    assert.equal(constructors.cancel,C);
  });

  await check('full autonomy chooses coordinated offensive parameters in late game', () => {
    const x=boot();x.setTick(2400);x.setLand(51613);
    const groups=[{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}];
    x.b.tuneAutonomously(x.me,groups,x.b.military(x.me,groups),2400,{wanted:'ASSAULT',rebuilding:false});
    assert.equal(x.b.state().autoTuning.mode,'ASSAULT');
    assert.equal(x.b.setting('aggressive'),98);
    assert.equal(x.b.setting('actionsPerMinute'),98);
    assert.equal(x.b.setting('maxTargets'),22);
    assert.equal(x.b.setting('reserve'),23);
  });
  await check('incoming offensive forces immediate defensive tuning', () => {
    const x=boot();x.setTick(2400);x.setLand(51613);
    const groups=[{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}];
    x.b.tuneAutonomously(x.me,groups,x.b.military(x.me,groups),2400,{wanted:'ASSAULT',rebuilding:false});
    x.me.incomingAttacks=()=>[{id:'incoming',attackerID:3,troops:49000,retreating:false}];
    const result=x.b.tuneAutonomously(x.me,groups,x.b.military(x.me,groups),2401,{wanted:'DEFEND',rebuilding:true});
    assert.equal(x.b.state().autoTuning.mode,'DEFEND');
    assert.equal(x.b.setting('reserve'),63);
    assert.equal(x.b.setting('aggressive'),60);
    assert(result.reserve>=Math.floor(result.home*.63));
  });
  await check('autonomous parameters settle and recover without oscillating every tick', () => {
    const x=boot();x.setTick(2400);x.setLand(51613);
    const groups=[{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}];
    const s=x.b.military(x.me,groups);
    x.b.tuneAutonomously(x.me,groups,s,2400,{wanted:'ASSAULT'});
    x.b.tuneAutonomously(x.me,groups,s,2401,{wanted:'ECONOMY'});
    assert.equal(x.b.state().autoTuning.mode,'ASSAULT');
    x.b.tuneAutonomously(x.me,groups,s,2446,{wanted:'ECONOMY'});
    assert.equal(x.b.state().autoTuning.mode,'ECONOMY');
  });
  await check('slow game worker reduces auto target checks and action throughput', () => {
    const x=boot();x.setTick(2400);x.setLand(51613);x.b.setPerf(1500,950,1800);
    x.b.tuneAutonomously(x.me,[],x.b.military(x.me,[]),2400,{wanted:'ASSAULT'});
    assert.equal(x.b.setting('maxTargets'),17);
    assert.equal(x.b.setting('actionsPerMinute'),80);
  });
  await check('manual slider preferences remain untouched by full autonomy', () => {
    const x=boot();x.setTick(2400);x.setLand(51613);
    x.b.opts.aggressive=52;x.b.opts.reserve=47;x.b.opts.actionsPerMinute=57;x.b.opts.maxTargets=8;
    x.b.tuneAutonomously(x.me,[],x.b.military(x.me,[]),2400,{wanted:'ASSAULT'});
    assert.equal(x.b.opts.aggressive,52);
    assert.equal(x.b.opts.reserve,47);
    assert.equal(x.b.opts.actionsPerMinute,57);
    assert.equal(x.b.opts.maxTargets,8);
    x.b.opts.fullAuto=false;
    assert.equal(x.b.setting('aggressive'),52);
    assert.equal(x.b.setting('reserve'),47);
    assert.equal(x.b.setting('actionsPerMinute'),57);
    assert.equal(x.b.setting('maxTargets'),8);
  });
  await check('autonomous action cap honors reserved economic capacity', () => {
    const x=boot();x.setTick(2400);x.setLand(51613);
    x.b.tuneAutonomously(x.me,[],x.b.military(x.me,[]),2400,{wanted:'ASSAULT'});
    x.b.setBudget(75);
    assert.equal(x.b.actionBudget('combat'),true);
    x.b.opts.fullAuto=false;x.b.opts.actionsPerMinute=72;
    assert.equal(x.b.actionBudget('combat'),false);
  });
  await check('full autonomy can run in a manually started Public game', () => {
    const x=boot();x.b.opts.fullAuto=true;
    x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Impossible'});
    assert.equal(x.b.connected(),true);
  });

  await check('PR #1 weak border target remains viable beside larger neighbor', () => {
    const x=boot();x.setTick(184);x.setLand(440);x.setHome(93198);x.setGold(16300);
    x.weak.troops=()=>17594;x.strong.troops=()=>102839;
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]},
      {id:'strong',opponent:x.strong,front:10,tiles:[6]}];
    const st=x.b.military(x.me,groups);
    assert.equal(x.b.warReadiness(x.me,groups,st,184).ready,true);
    assert.equal(x.b.targetOpportunity(x.me,groups,st,groups[0]),true);
    const ranked=x.b.rankedTargets(groups,x.me,184,st,x.b.strategy(x.me,groups,st));
    assert(ranked.some(t=>t.id==='weak'),JSON.stringify(ranked));
    assert(!ranked.some(t=>t.id==='strong'));
  });
  await check('PR #1 extremely strong other neighbor must still veto attack', () => {
    const x=boot();x.setTick(184);x.setHome(120000);
    x.weak.troops=()=>1000;x.strong.troops=()=>450000;
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]},
      {id:'strong',opponent:x.strong,front:10,tiles:[6]}];
    const st=x.b.military(x.me,groups);
    assert.equal(x.b.targetOpportunity(x.me,groups,st,groups[0]),false);
    assert.equal(x.b.warReadiness(x.me,groups,st,184).ready,false);
  });
  await check('PR #1 incoming attack vetoes weak-neighbor war', () => {
    const x=boot();x.setTick(184);x.setHome(93198);
    x.weak.troops=()=>17594;x.strong.troops=()=>102839;
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]},
      {id:'strong',opponent:x.strong,front:10,tiles:[6]}];
    x.me.incomingAttacks().push({id:'in',attackerID:3,targetID:1,troops:20000,retreating:false});
    const st=x.b.military(x.me,groups);
    assert.equal(x.b.targetOpportunity(x.me,groups,st,groups[0]),false);
    assert.equal(x.b.warReadiness(x.me,groups,st,184).ready,false);
  });
  await check('PR #1 economy failure explains missing gold', async () => {
    const x=boot();x.setGold(55000);
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:125000n}))});
    assert.equal(await x.b.economy(x.me,300,0,[]),false);
    assert.match(x.b.state().economicStatus,/Gold für gültige Bauoption fehlt/);
  });
  await check('issue #5 potential neighbor does not cancel Silo fund', async () => {
    const x=boot();x.setTick(2400);x.setLand(51613);x.setGold(900000);
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>5500+i*20,id:()=>i+1,level:()=>1}));
    x.me.units=()=>units;x.strong.troops=()=>200000;
    x.b.setGroups([{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}]);
    x.b.setTroopSnapshot({home:90000,max:100000,ratio:.60,incoming:0,
      strongest:200000,committed:0,reserve:0,available:0});
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:250000n}))});
    const needs=x.b.economicNeeds(x.me,units,[]);
    assert.equal(needs.emergency,true);assert.equal(needs.immediate,false);
    assert.equal(needs.saveForSilo,true);
    assert.equal(await x.b.economy(x.me,2400,0,[]),false);
    assert.equal(x.sent.length,0);
    assert.equal(x.b.state().failedEconomyProbes,0);
  });
  await check('issue #5 real invasion can fund emergency Defense Post', async () => {
    const x=boot();x.setTick(2400);x.setLand(51613);x.setGold(900000);
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>5500+i*20,id:()=>i+1,level:()=>1}));
    x.me.units=()=>units;
    x.b.setGroups([{id:'strong',opponent:x.strong}]);
    x.b.setTroopSnapshot({home:90000,max:100000,ratio:.90,incoming:50000,
      strongest:85000,committed:0,reserve:0,available:0});
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:BigInt(type==='Defense Post'?50000:type==='Missile Silo'?1000000:250000)}))});
    const needs=x.b.economicNeeds(x.me,units,[5500]);
    assert.equal(needs.immediate,true);
    assert.equal(await x.b.economy(x.me,2400,0,[5500]),true);
    assert.equal(x.sent[0].unit,'Defense Post');
  });
  await check('issue #4 Transport is legal, Transport Ship is not', async () => {
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    const good=boot();good.b.setBoats(true);good.b.setBoatCtor(Boat);
    good.me.actions=async()=>({buildableUnits:[{type:'Transport',canBuild:1,cost:0n}]});
    assert.equal(await good.b.naval(good.me,300,0),true);
    assert(good.sent[0] instanceof Boat);
    const bad=boot();bad.b.setBoats(true);bad.b.setBoatCtor(Boat);
    bad.me.actions=async()=>({buildableUnits:[{type:'Transport Ship',canBuild:1,cost:0n}]});
    assert.equal(await bad.b.naval(bad.me,300,0),false);
    assert.equal(bad.sent.length,0);
  });

  await check('issue #3 explicit retreat flag confirms, no inferred success', () => {
    const x=boot();class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);
    x.out.push({id:'front-3',targetID:null,troops:30000,retreating:false});
    x.me.incomingAttacks().push({id:'in',attackerID:2,troops:55000,retreating:false});
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),true);
    x.out[0].retreating=true;
    x.b.emergencyRetreat(x.me,307,x.b.military(x.me,[]));
    assert.equal(x.b.state().defenseStats.retreatsObserved,1);
    assert.equal(x.b.state().defenseStats.unknown,0);
  });
  await check('issue #3 destroyed stack reports unknown rather than retreat', () => {
    const x=boot();class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);
    x.out.push({id:'front-4',targetID:null,troops:30000,retreating:false});
    x.me.incomingAttacks().push({id:'in',attackerID:2,troops:55000,retreating:false});
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),true);
    x.out.splice(0,1);
    x.b.emergencyRetreat(x.me,307,x.b.military(x.me,[]));
    assert.equal(x.b.state().defenseStats.retreatsObserved,0);
    assert.equal(x.b.state().defenseStats.unknown,1);
  });
  await check('issue #3 ongoing attack without retreat flag times out', () => {
    const x=boot();class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);
    x.out.push({id:'front-5',targetID:null,troops:30000,retreating:false});
    x.me.incomingAttacks().push({id:'in',attackerID:2,troops:55000,retreating:false});
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),true);
    x.b.emergencyRetreat(x.me,366,x.b.military(x.me,[]));
    assert.equal(x.b.state().defenseStats.retreatsObserved,0);
    assert.equal(x.b.state().defenseStats.unconfirmed,1);
  });
  await check('issue #2 sent nuclear intent alone is not a confirmed launch', async () => {
    const x=boot();x.setTick(2400);x.setLand(51613);x.setGold(1200000);
    const silo={type:()=> 'Missile Silo',isActive:()=>true,
      isUnderConstruction:()=>false,isInCooldown:()=>false,tile:()=>5500,id:()=>99};
    const own=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>5501+i*21,id:()=>i+1,level:()=>1}));
    x.me.units=()=>[...own,silo];
    const enemyCity={type:()=> 'City',isActive:()=>true,owner:()=>x.weak,tile:()=>5};
    x.game.units=()=>[enemyCity];
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:750000n}))});
    await x.b.nukeStep();
    assert.equal(x.sent.length,1,'one nuclear launch intent');
    assert.equal(x.sent[0].unit,'Atom Bomb');
    assert.equal(x.b.state().nukeAttempts,1);
    assert.equal(x.b.state().nukeShots,0);
    assert(x.b.state().nukePending);
    assert.equal(x.b.inspectNukeLaunch(x.me,2456),false);
    assert.equal(x.b.state().nukeShots,0);
    assert.equal(x.b.state().nukeUnconfirmed,1);
    assert.equal(x.b.economicNeeds(x.me,x.me.units(),[]).saveForNuke,true);
  });
  await check('issue #2 a newly observed missile is confirmed exactly once', () => {
    const x=boot();x.setTick(2400);
    const old={type:()=> 'Atom Bomb',isActive:()=>true,owner:()=>x.me,
      targetTile:()=>5,id:()=>10};
    x.game.units=()=>[old];
    x.b.setNukePending({tile:5,type:'Atom Bomb',tick:2400,
      beforeIds:['10'],beforeMatches:1,attempt:1});
    assert.equal(x.b.inspectNukeLaunch(x.me,2410),true);
    assert.equal(x.b.state().nukeShots,0);
    x.game.units=()=>[old,{type:()=> 'Atom Bomb',isActive:()=>true,owner:()=>x.me,
      targetTile:()=>5,id:()=>11}];
    assert.equal(x.b.inspectNukeLaunch(x.me,2411),false);
    assert.equal(x.b.state().nukeShots,1);
    assert.equal(x.b.inspectNukeLaunch(x.me,2412),false);
    assert.equal(x.b.state().nukeShots,1);
  });
  await check('v1.9.6 near-cap expansion spends surplus without hostile border', () => {
    const x=boot();x.setHome(90000);
    const s=x.b.military(x.me,[]);
    assert.equal(x.b.growthPressure(s),true);
    assert(x.b.neutralAttackAmount(s,.85)>14000, x.b.neutralAttackAmount(s,.85));
    assert(s.growthPotential>0);
  });
  await check('v1.9.6 strong neighbor disables extra growth spending', () => {
    const x=boot(),groups=[{id:'strong',opponent:x.strong,front:9,tiles:[6]}];
    const s=x.b.military(x.me,groups);
    assert.equal(x.b.growthPressure(s),false);
    assert(x.b.neutralAttackAmount(s,.85)<10000,x.b.neutralAttackAmount(s,.85));
    x.me.incomingAttacks().push({id:'in',troops:33000,retreating:false,attackerID:3});
    assert.equal(x.b.growthPressure(x.b.military(x.me,[])),false);
  });
  await check('v1.9.6 accessible city favors a weak target', () => {
    const groups=x=>[{id:'weak',opponent:x.weak,front:10,tiles:[5]},
      {id:'strong',opponent:x.strong,front:10,tiles:[6]}];
    const a=boot(),aGroups=groups(a),aState=a.b.military(a.me,aGroups);
    const aRank=a.b.rankedTargets(aGroups,a.me,300,aState,a.b.strategy(a.me,aGroups,aState));
    const ordinary=aRank.find(x=>x.id==='weak')?.score;
    const b=boot(),bGroups=groups(b);
    b.weak.units=()=>[{type:()=> 'City',tile:()=>5,level:()=>2,isActive:()=>true}];
    const bState=b.b.military(b.me,bGroups);
    const bRank=b.b.rankedTargets(bGroups,b.me,300,bState,b.b.strategy(b.me,bGroups,bState));
    assert(Number.isFinite(ordinary),ordinary);
    assert(bRank.find(x=>x.id==='weak')?.score>ordinary+20,
      'reachable infrastructure should improve the expected prize');
  });
  await check('v1.9.6 defended frontier scores below undefended frontier', () => {
    const x=boot();
    const item={id:'weak',opponent:x.weak,front:10,tiles:[5]};
    x.weak.units=()=>[{type:()=> 'Defense Post',tile:()=>5,isActive:()=>true}];
    assert.equal(x.b.targetEconomics(item).posts,1);
    assert.equal(x.b.targetEconomics(item).prize,0);
  });
  await check('v1.9.6 city priority increases near troop cap', () => {
    const x=boot();x.setLand(2800);
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,id:()=>i,tile:()=>220+i*40,level:()=>1}));
    x.me.units=()=>units;
    x.b.setTroopSnapshot({home:90000,max:100000,ratio:.90,incoming:0,strongest:0});
    const high=x.b.economicNeeds(x.me,units,[]).list.find(x=>x.type==='City'&&!x.upgrade).score;
    x.setHome(50000);
    x.b.setTroopSnapshot({home:50000,max:100000,ratio:.50,incoming:0,strongest:0});
    const low=x.b.economicNeeds(x.me,units,[]).list.find(x=>x.type==='City'&&!x.upgrade).score;
    assert(high>low+50,{high,low});
  });
  await check('v1.9.6 factory site favors city/port proximity', () => {
    const x=boot();x.game.x=t=>t;x.game.y=()=>0;
    const city={type:()=> 'City',tile:()=>30,isUnderConstruction:()=>false};
    const near=x.b.siteScore('Factory',75,[],[city],0,false);
    const far=x.b.siteScore('Factory',300,[],[city],0,false);
    assert(near>far+30,{near,far});
  });
  await check('v1.9.6 proactive diplomacy scores strong non-war border', () => {
    const x=boot();x.b.setMode('EXPAND');
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]},
      {id:'strong',opponent:x.strong,front:10,tiles:[6]}];
    const s=x.b.military(x.me,groups);
    assert(x.b.diplomacyScore(x.me,x.strong,s,true).score>=80);
    assert(x.b.diplomacyScore(x.me,x.weak,s,true).score<80);
    x.b.setWar('strong','strong');
    assert(x.b.diplomacyScore(x.me,x.strong,s,true).score<80);
  });
  await check('v1.9.6 proactive diplomacy sends offer while expanding', async () => {
    const x=boot();x.b.setMode('EXPAND');
    class Alliance{constructor(requestor,recipient){this.requestor=requestor;this.recipient=recipient;}}
    x.b.setAllianceCtor(Alliance);
    x.b.setGroups([{id:'strong',opponent:x.strong,front:10,tiles:[6]}]);
    x.me.actions=async()=>({interaction:{canSendAllianceRequest:true}});
    x.b.diplomacyTickSafe();
    // The userscript VM owns a separate Promise job queue; flush an event loop turn.
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(x.sent.length,1,JSON.stringify({state:x.b.state(),score:x.b.diplomacyScore(x.me,x.strong,x.b.military(x.me,x.b.state().strategic.groups),true),connected:x.b.connected()}));
    assert.equal(x.sent[0].recipient,x.strong);
  });
  await check('v1.9.6 war-focused nuclear planner favors locked enemy', () => {
    const x=boot();x.b.setWar('strong','strong');
    const city=(owner,tile)=>({type:()=> 'City',tile:()=>tile,owner:()=>owner});
    const intel={enemy:[city(x.weak,5),city(x.strong,6)],enemySAM:[],
      protectedUnits:[]};
    const result=x.b.nukeTargets(x.me,intel,'Atom Bomb');
    assert(result.length>0,JSON.stringify(result));
    assert.equal(result[0].owner,x.strong);
  });
  await check('v1.9.8 Public allows regular attack without an extra switch', () => {
    const x=boot();
    x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Impossible'});
    assert.equal(Object.hasOwn(x.b.opts,'multiplayerTest'),false);
    assert.equal(x.b.permittedMatch(x.game),true);
    assert.equal(x.b.connected(),true);
    assert.equal(x.b.send('attack',['weak',500]),true);
    assert.equal(x.sent[0].targetID,'weak');
    assert.equal(x.sent[0].troops,500);
  });
  await check('v1.9.8 Private game is available immediately after manual start', () => {
    const x=boot();
    x.game.config().gameConfig=()=>({gameType:'Private',difficulty:'Medium'});
    assert.equal(x.b.multiplayerMatch(x.game),true);
    assert.equal(x.b.connected(),true);
    assert.equal(x.b.send('attack',['weak',500]),true);
    assert.equal(x.sent.length,1);
  });
  await check('v1.9.8 Public replay remains blocked for every action channel', () => {
    const x=boot();x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Impossible'});
    x.game.config().isReplay=()=>true;
    assert.equal(x.b.connected(),false);
    assert.equal(x.b.send('attack',['weak',500],undefined,true),false);
    assert.equal(x.sent.length,0);
  });
  await check('v1.9.8 Singleplayer replay also remains blocked', () => {
    const x=boot();x.game.config().isReplay=()=>true;
    assert.equal(x.b.permittedMatch(x.game),false);
    assert.equal(x.b.connected(),false);
  });
  await check('v1.9.8 unknown game mode remains blocked', () => {
    const x=boot();x.game.config().gameConfig=()=>({gameType:'Tournament',difficulty:'Impossible'});
    assert.equal(x.b.connected(),false);
    assert.equal(x.b.multiplayerMatch(x.game),false);
    assert.equal(x.b.send('attack',['weak',500]),false);
  });
  await check('v1.9.8 manual pause stops subsequent multiplayer actions', () => {
    const x=boot();x.game.config().gameConfig=()=>({gameType:'Private',difficulty:'Medium'});
    assert.equal(x.b.connected(),true);
    x.b.opts.enabled=false;
    assert.equal(x.b.send('attack',['weak',500],undefined,true),false);
    assert.equal(x.sent.length,0);
  });
  await check('v1.9.8 new multiplayer match stops bot but does not require consent', () => {
    const x=boot();x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Impossible'});
    assert.equal(x.b.connected(),true);
    x.b.reset(x.game,{emit:()=>{}});
    assert.equal(x.b.opts.enabled,false);
    assert.equal(x.b.connected(),true);
    assert.equal(x.b.send('attack',['weak',500]),false);
  });
  await check('v1.9.8 consent button is completely removed from script', () => {
    assert.equal(source.includes('multiplayerTest'),false);
    assert.equal(source.includes('MP-TEST'),false);
  });
  await check('v1.10.0 team victory uses combined allied land and real threshold', () => {
    const x=boot();x.me.team=()=>1;x.weak.team=()=>1;x.strong.team=()=>2;
    x.game.config().gameConfig=()=>({gameType:'Public',gameMode:'Team',
      difficulty:'Impossible',maxTimerValue:4});
    x.game.numLandTiles=()=>4000;x.game.numTilesWithFallout=()=>500;
    x.game.config().percentageTilesOwnedToWin=()=>50;
    x.game.elapsedGameSeconds=()=>100;
    const p=x.b.victoryPlan(x.me);
    assert.equal(p.mode,'Team');assert.equal(p.teamTiles,2100);
    assert.equal(p.threshold,50);assert(p.progress>.59&&p.urgent);
    assert.equal(p.remaining,140);
  });
  await check('v1.10.0 unknown win threshold stays unknown', () => {
    const x=boot();const p=x.b.victoryPlan(x.me);
    assert.equal(p.threshold,null);assert.equal(p.progress,null);
    assert.equal(p.urgent,false);
  });
  await check('v1.10.0 doomsday forces endgame urgency', () => {
    const x=boot();x.me.inDoomsdayClock=()=>true;
    const p=x.b.victoryPlan(x.me);
    assert.equal(p.doomsday,true);assert.equal(p.urgent,true);
  });
  await check('v1.10.0 uses official attackLogic on defended mountain tile', () => {
    const x=boot();let used=null;
    x.game.terrainType=()=>2;
    x.game.config().defensePostRange=()=>30;
    x.game.config().attackLogic=(data)=>{used=data;
      return {attackerTroopLoss:100,tickFraction:.4};};
    x.weak.units=()=>[{type:()=> 'Defense Post',tile:()=>5,
      isUnderConstruction:()=>false}];
    const f=x.b.attackForecast(x.me,{opponent:x.weak,front:10,tiles:[5]},40000);
    assert.equal(used.terrain,2);
    assert.equal(used.defenderHasDefensePost,true);
    assert.equal(used.borderSize,10);
    assert.equal(f.engine,true);
    assert(f.loss>7000,f.loss);
  });
  await check('v1.10.0 heavily attacked enemy identified by incoming stacks', () => {
    const x=boot();x.weak.incomingAttacks=()=>[{troops:12000,retreating:false}];
    assert.equal(x.b.enemyUnderAttack(x.weak),true);
    x.weak.incomingAttacks=()=>[{troops:2000,retreating:false}];
    assert.equal(x.b.enemyUnderAttack(x.weak),false);
  });
  await check('v1.10.0 neutral fallout tiles are skipped in border discovery', () => {
    const x=boot(),neutral={id:()=>null,isPlayer:()=>false};
    x.game.neighbors4=(_,scratch)=>{scratch.push(50,51);return 2;};
    x.game.owner=t=>t===50||t===51?neutral:x.me;
    x.game.hasFallout=t=>t===50;
    const groups=x.b.targetsFromBorder(x.me,[10]);
    assert.equal(groups.length,1);
    assert.deepEqual(Array.from(groups[0].tiles),[51]);
    assert.equal(x.b.state().strategicTelemetry.falloutSkipped,1);
  });
  await check('v1.10.0 samples actual train/ship revenue rather than inventory', () => {
    const x=boot();let train=0,trade=0;x.me.trainGold=()=>train;
    x.me.tradeGold=()=>trade;
    x.b.sampleIncome(x.me,300);
    x.setTick(400);train=500;trade=200;x.setGold(1001000);
    x.b.sampleIncome(x.me,400);
    assert.equal(x.b.state().incomeStatus.train,3000);
    assert.equal(x.b.state().incomeStatus.trade,1200);
    assert.equal(x.b.state().incomeStatus.observed,true);
  });
  await check('v1.10.0 factory site favors reachable active train stations', () => {
    const x=boot();x.game.x=t=>t;x.game.y=()=>0;
    x.game.config().trainStationMinRange=()=>15;
    x.game.config().trainStationMaxRange=()=>100;
    const units=[30,220].map(tile=>({type:()=> 'City',tile:()=>tile,
      hasTrainStation:()=>true,isUnderConstruction:()=>false}));
    const near=x.b.railStationScore(80,units);
    const far=x.b.railStationScore(350,units);
    assert.equal(near.reachable,1);assert(near.score>far.score+30);
  });
  await check('v1.10.0 disabled City is omitted from structure plan', () => {
    const x=boot();x.game.config().isUnitDisabled=t=>t==='City';
    const p=x.b.economicNeeds(x.me,[],[]);
    assert.equal(p.list.some(e=>e.type==='City'),false);
  });
  await check('v1.10.0 MIRV-only game saves a MIRV-sized fund', () => {
    const x=boot();x.setTick(2400);x.setLand(5000);
    x.game.config().isUnitDisabled=t=>t==='Atom Bomb'||t==='Hydrogen Bomb';
    const units=['City','City','Factory','Factory','Missile Silo'].map((type,i)=>({
      type:()=>type,isActive:()=>true,level:()=>1,tile:()=>200+i*50}));
    x.me.units=()=>units;
    x.game.units=()=>[{type:()=> 'City',isActive:()=>true,owner:()=>x.weak,tile:()=>5}];
    const p=x.b.economicNeeds(x.me,units,[]);
    assert.equal(p.savingsTarget,26000000);
  });
  await check('v1.10.0 warship intercepts visible enemy boat at our shore', async () => {
    const x=boot();
    class Move{constructor(unitIds,tile){this.unitIds=unitIds;this.tile=tile;}}
    x.b.setCtor('warship',Move);
    x.game.isWater=()=>true;x.game.euclideanDistSquared=()=>1;
    const own={type:()=> 'Warship',owner:()=>x.me,isActive:()=>true,
      tile:()=>2,id:()=>88};
    const enemy={type:()=> 'Transport',owner:()=>x.weak,isActive:()=>true,
      targetTile:()=>505,tile:()=>1,transportShipState:()=>({isRetreating:false})};
    x.game.units=()=>[own,enemy];
    assert.equal(await x.b.fleetDefense(x.me,300,0),true);
    assert.deepEqual(Array.from(x.sent[0].unitIds),[88]);
    assert.equal(x.sent[0].tile,1);
  });
  await check('v1.10.0 fleet builds warship only after legal water probe', async () => {
    const x=boot();x.game.isWater=()=>true;
    x.me.units=()=>[{type:()=> 'Port',tile:()=>5500,
      isActive:()=>true,isUnderConstruction:()=>false}];
    x.game.units=()=>[{type:()=> 'Transport',owner:()=>x.weak,
      isActive:()=>true,targetTile:()=>505,tile:()=>1}];
    x.me.actions=async tile=>({buildableUnits:[{type:'Warship',
      canBuild:tile,cost:250000n}]});
    assert.equal(await x.b.fleetDefense(x.me,300,0),true);
    assert.equal(x.sent[0].unit,'Warship');
  });
  await check('v1.10.0 cancels landing if target becomes friendly', async () => {
    const x=boot();class Cancel{constructor(unitID){this.unitID=unitID;}}
    x.b.setCtor('cancelBoat',Cancel);x.me.isFriendly=p=>p===x.weak;
    x.game.units=()=>[{type:()=> 'Transport',owner:()=>x.me,
      isActive:()=>true,targetTile:()=>5,id:()=>92}];
    assert.equal(await x.b.fleetDefense(x.me,300,0),true);
    assert.equal(x.sent[0].unitID,92);
  });
  await check('v1.10.0 helps endangered teammate while retaining homeland', () => {
    const x=boot();class Donate{constructor(recipient,troops){
      this.recipient=recipient;this.troops=troops;}}
    x.b.setCtor('donateTroops',Donate);
    x.game.config().gameConfig=()=>({gameType:'Public',gameMode:'Team',difficulty:'Impossible'});
    x.me.team=()=>1;x.weak.team=()=>1;x.strong.team=()=>2;
    x.me.isOnSameTeam=p=>p===x.weak;
    x.weak.incomingAttacks=()=>[{troops:16000,retreating:false}];
    x.b.victoryPlan(x.me);
    const s=x.b.military(x.me,[]);
    assert.equal(x.b.teamSupport(x.me,300,s),true);
    assert.equal(x.sent[0].recipient,x.weak);
    assert(x.sent[0].troops>=1000&&x.sent[0].troops<10000);
  });
  await check('v1.10.0 renews expiring alliance once per cooldown', () => {
    const x=boot();class Extend{constructor(recipient){this.recipient=recipient;}}
    x.b.setCtor('extend',Extend);
    x.me.alliances=()=>[{id:13,other:'weak',expiresAt:320,hasExtensionRequest:true}];
    x.me.isFriendly=p=>p===x.weak;
    assert.equal(x.b.renewAlliances(x.me,300),true);
    assert.equal(x.sent[0].recipient,x.weak);
    assert.equal(x.b.renewAlliances(x.me,310),false);
  });
  await check('v1.10.0 SAM chord risk detects a SAM along the flight proxy', () => {
    const x=boot();x.game.x=t=>t;x.game.y=()=>0;
    x.game.config().samRange=()=>10;
    const sam={tile:()=>50,isActive:()=>true};
    assert.equal(x.b.nukeTrajectoryRisk(0,100,[sam]),1);
    assert.equal(x.b.nukeTrajectoryRisk(0,100,[{...sam,tile:()=>200}]),0);
  });
  await check('v1.10.0 SAM saturation requires enough ready silo tubes', () => {
    const x=boot();x.game.units=()=>[{type:()=> 'SAM Launcher',
      isActive:()=>true,owner:()=>x.weak,tile:()=>5,level:()=>1}];
    x.me.readyMissileCount=()=>4;
    const c={tile:5,sams:1,hit:2,value:30};
    assert.equal(x.b.nukeSalvoPlan('Atom Bomb',c,[],x.me,750000,5000000,false).amount,2);
    x.me.readyMissileCount=()=>1;
    assert.equal(x.b.nukeSalvoPlan('Atom Bomb',c,[],x.me,750000,5000000,false).amount,0);
  });
  await check('v1.10.0 partially observed salvo stays pending and counts each missile once', () => {
    const x=boot();x.setTick(2400);
    const a={type:()=> 'Atom Bomb',isActive:()=>true,owner:()=>x.me,
      targetTile:()=>5,id:()=>10};
    const b={...a,id:()=>11};
    x.b.setNukePending({tile:5,type:'Atom Bomb',tick:2400,
      beforeIds:[],beforeMatches:0,attempt:1,amount:2});
    x.game.units=()=>[a];
    assert.equal(x.b.inspectNukeLaunch(x.me,2410),true);
    assert.equal(x.b.state().nukeShots,1);
    x.game.units=()=>[a,b];
    assert.equal(x.b.inspectNukeLaunch(x.me,2411),false);
    assert.equal(x.b.state().nukeShots,2);
    assert.equal(x.b.inspectNukeLaunch(x.me,2412),false);
    assert.equal(x.b.state().nukeShots,2);
  });
  await check('v1.10.0 naval transport can cross more than 100 tiles', async () => {
    const x=boot();x.b.setWar('strong','strong');x.strong.troops=()=>5000;
    x.b.setGroups([{id:'strong',opponent:x.strong}]);
    x.game.euclideanDistSquared=()=>1e8;
    x.me.actions=async()=>({buildableUnits:[{type:'Transport',canBuild:9000,cost:0n}]});
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    x.b.setBoatCtor(Boat);
    assert.equal(await x.b.naval(x.me,300,0),true);
    assert.equal(x.sent[0].dst,6);
  });
  await check('issue #9 empty EventBus reports 0/8 and all critical intents', () => {
    const x=boot(),b={listeners:new Map(),emit:()=>{}};
    x.b.reset(x.game,b);
    const health=x.b.intentHealth();
    assert.equal(health.found,0);assert.equal(health.total,8);
    assert.deepEqual([...health.critical],['spawn','attack','build']);
    assert(x.warnings.some(w=>w.includes('0/8 Intents erkannt')));
    assert(x.warnings.some(w=>w.includes('spawn, attack, cancel, boat, build, upgrade, alliance, reject')));
    assert.equal(x.b.opts.enabled,false,'reset must never start the bot');
  });
  await check('issue #9 partial EventBus lists exact missing intents only once', () => {
    const x=boot();
    class SendSpawnIntentEvent{constructor(tile){this.tile=tile;}}
    class SendAttackIntentEvent{constructor(targetID,troops){this.targetID=targetID;this.troops=troops;}}
    class BuildUnitIntentEvent{constructor(unit,tile){this.unit=unit;this.tile=tile;}}
    const b={listeners:new Map([[SendSpawnIntentEvent,[]],[SendAttackIntentEvent,[]],[BuildUnitIntentEvent,[]]]),
      emit:()=>{}};
    x.b.reset(x.game,b);
    const health=x.b.intentHealth();
    assert.equal(health.found,3);
    assert.equal(health.critical.length,0);
    assert.deepEqual([...health.missing],['cancel','boat','upgrade','alliance','reject']);
    assert(x.warnings.some(w=>w.includes('3/8 Intents erkannt')));
    const warnings=x.warnings.length;
    x.b.reportIntents();x.b.reportIntents();
    assert.equal(x.warnings.length,warnings,'unchanged detection must not spam warnings');
  });
  await check('issue #9 all eight intents report 8/8 without warning', () => {
    const x=boot();
    const cls=[
      class SendSpawnIntentEvent{},class SendAttackIntentEvent{},
      class CancelAttackIntentEvent{},class SendBoatAttackIntentEvent{},
      class BuildUnitIntentEvent{},class SendUpgradeStructureIntentEvent{},
      class SendAllianceRequestIntentEvent{},class SendAllianceRejectIntentEvent{}
    ];
    x.b.reset(x.game,{listeners:new Map(cls.map(C=>[C,[]])),emit:()=>{}});
    const health=x.b.intentHealth();
    assert.equal(health.found,8);
    assert.deepEqual([...health.missing],[]);
    assert.equal(x.warnings.length,0);
    assert(x.infos.some(i=>i.includes('8/8 Intents erkannt')));
  });
  await check('issue #9 missing Build intent blocks action with one visible warning', () => {
    const x=boot();
    class SendAttackIntentEvent{constructor(targetID,troops){this.targetID=targetID;this.troops=troops;}}
    const b={listeners:new Map([[SendAttackIntentEvent,[]]]),emit:event=>x.sent.push(event)};
    x.b.reset(x.game,b);x.b.opts.enabled=true;
    assert.equal(x.b.send('build',['City',500],'BAU City'),false);
    assert.equal(x.b.send('build',['City',500],'BAU City'),false);
    assert.equal(x.sent.length,0);
    assert.equal(x.warnings.filter(w=>w.includes('Intent build nicht erkannt')).length,1);
    assert(x.b.state().strategic,'other game state preserved');
  });
  await check('issue #9 README does not claim deleted v1.9.0 exists', () => {
    const readme=fs.readFileSync(path.join(__dirname,'..','README.md'),'utf8');
    assert.match(readme,/1\.9\.9/);
    assert.match(readme,/1\.9\.0\.js.{0,100}entfernt/);
    assert.doesNotMatch(readme,/1\.9\.0\.js.{0,90}bleibt als/);
  });
  await check('issue #10 AFK target reduces only ratio, not safe home/front floor', () => {
    const x=boot(),weak={id:'weak',opponent:x.weak,front:9,tiles:[5]};
    const baseline=x.b.enemyOpportunityRatio(x.weak,false,90000);
    x.weak.isDisconnected=()=>true;
    assert(x.b.enemyOpportunityRatio(x.weak,false,90000)<baseline);
    x.strong.isDisconnected=()=>true;
    const giant={id:'strong',opponent:x.strong,front:9,tiles:[6]};
    const s=x.b.military(x.me,[giant]);
    assert.equal(x.b.targetOpportunity(x.me,[giant],s,giant),false,
      'a disconnected but stronger opponent must not bypass home reserve');
    assert.equal(x.b.allyAssistTarget(x.me,x.weak),false);
  });
  await check('issue #10 AFK gets score bonus but locked war remains locked', () => {
    const x=boot(),g={id:'weak',opponent:x.weak,front:10,tiles:[5]},groups=[g];
    const s=x.b.military(x.me,groups),ctx={wanted:'ASSAULT',foes:1,
      readiness:{ready:true},underAttack:false,rebuilding:false};
    const baseline=x.b.rankedTargets(groups,x.me,300,s,ctx)[0]?.score;
    assert(Number.isFinite(baseline),'ordinary weak border must be targetable');
    x.weak.isDisconnected=()=>true;
    const ranked=x.b.rankedTargets(groups,x.me,300,s,ctx);
    assert(ranked[0].score>baseline+17);
    x.b.setWar('strong','strong');
    assert.equal(x.b.rankedTargets(groups,x.me,300,s,ctx).length,0);
  });
  await check('issue #10 ally assist prioritizes actual marked enemy only', () => {
    const x=boot(),g={id:'weak',opponent:x.weak,front:10,tiles:[5]},groups=[g];
    const s=x.b.military(x.me,groups),ctx={wanted:'ASSAULT',foes:1,
      readiness:{ready:true},underAttack:false,rebuilding:false};
    const baseline=x.b.rankedTargets(groups,x.me,300,s,ctx)[0]?.score;
    x.me.allies=()=>[x.strong];x.me.isFriendly=p=>p===x.strong;
    x.strong.targets=()=>[x.weak];
    assert.equal(x.b.allyAssistTarget(x.me,x.weak),true);
    const assisted=x.b.rankedTargets(groups,x.me,300,s,ctx)[0]?.score;
    assert(assisted>baseline+21.9,JSON.stringify({baseline,assisted}));
    x.strong.targets=()=>[x.me];
    assert.equal(x.b.allyAssistTarget(x.me,x.weak),false);
    assert.equal(x.b.rankedTargets(groups,x.me,300,s,ctx)[0]?.score,baseline);
  });
  await check('issue #10 ordinary neutral land has priority over fallout', () => {
    const x=boot(),terra={id:()=>null,isPlayer:()=>false};
    x.game.neighbors4=(_,scratch)=>{scratch.push(50,51);return 2;};
    x.game.owner=t=>t===50||t===51?terra:x.me;
    x.game.hasFallout=t=>t===50;
    const groups=x.b.targetsFromBorder(x.me,[10]);
    const neutral=groups.find(g=>g.id===null);
    assert.deepEqual(Array.from(neutral.tiles),[51]);
    assert.equal(neutral.fallout,undefined);
    assert.equal(x.b.state().strategicTelemetry.falloutFallback,0);
  });
  await check('issue #10 fallout can become fallback when only nuked neutral remains', () => {
    const x=boot(),terra={id:()=>null,isPlayer:()=>false};
    x.game.neighbors4=(_,scratch)=>{scratch.push(50);return 1;};
    x.game.owner=t=>t===50?terra:x.me;x.game.hasFallout=t=>t===50;
    const groups=x.b.targetsFromBorder(x.me,[10]);
    assert.equal(groups.length,1);assert.equal(groups[0].fallout,true);
    assert.deepEqual(Array.from(groups[0].tiles),[50]);
    assert.equal(x.b.state().strategicTelemetry.falloutFallback,1);
  });
  await check('issue #10 nuked fallback needs real surplus before attack', () => {
    const x=boot(),g={id:null,opponent:null,front:1,tiles:[50],fallout:true};
    const ctx={wanted:'EXPAND',foes:0,readiness:{ready:true},
      rebuilding:false,underAttack:false};
    const safe=x.b.military(x.me,[]);
    const normal=x.b.rankedTargets([{...g,fallout:false}],x.me,300,safe,ctx)[0];
    const fallback=x.b.rankedTargets([g],x.me,300,safe,ctx)[0];
    assert(fallback,'safe fallout border can be attempted');
    assert(fallback.amount<normal.amount*.55,'fallout attack needs reduced troop spend');
    assert(fallback.score<normal.score,'fallout must not beat safe clean land');
    const threatened={...safe,strongest:safe.home*.9};
    assert.equal(x.b.rankedTargets([g],x.me,300,threatened,ctx).length,0);
  });
  await check('issue #10 counterattack emits real attack and protects reserve', async () => {
    const x=boot();x.game.playerBySmallID=id=>id===2?x.weak:x.strong;
    x.me.incomingAttacks=()=>[{id:'hostile',attackerID:2,troops:5000,retreating:false}];
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]}];
    const s=x.b.military(x.me,groups);
    assert.equal(await x.b.defense(x.me,300,0,groups,s),true);
    assert.equal(x.sent.length,1);assert.equal(x.sent[0].targetID,'weak');
    assert(x.me.troops()-x.sent[0].troops>=s.reserve);
    const y=boot();y.setHome(24000);
    y.game.playerBySmallID=id=>id===2?y.weak:y.strong;
    y.me.incomingAttacks=()=>[{id:'hostile',attackerID:2,troops:5000,retreating:false}];
    const g2=[{id:'weak',opponent:y.weak,front:10,tiles:[5]}];
    assert.equal(await y.b.defense(y.me,300,0,g2,y.b.military(y.me,g2)),false);
    assert.equal(y.sent.length,0);
  });
  await check('issue #10 shore scan finds unowned non-fallout island', () => {
    const x=boot();x.game.isShore=t=>t===176;
    x.game.owner=t=>t===176?null:t===5?x.weak:t===6?x.strong:x.me;
    x.game.hasFallout=()=>false;
    assert.deepEqual(Array.from(x.b.neutralNavalCandidates(x.me)),[176]);
    x.game.hasFallout=t=>t===176;
    assert.equal(x.b.neutralNavalCandidates(x.me).length,0);
  });
  await check('issue #10 autonomous neutral island landing uses worker and spare', async () => {
    const x=boot();x.b.setBoats(true);x.game.isShore=t=>t===176;
    x.game.owner=t=>t===176?null:t===5?x.weak:t===6?x.strong:x.me;
    x.game.hasFallout=()=>false;
    x.me.actions=async tile=>({buildableUnits:tile===176?
      [{type:'Transport',canBuild:9999,cost:0n}]:[]});
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    x.b.setBoatCtor(Boat);
    assert.equal(await x.b.naval(x.me,300,0),true);
    assert.equal(x.sent[0].dst,176);
    assert(x.sent[0].troops>=1000);
    assert.equal(x.b.state().strategicTelemetry.neutralLandings,1);
  });
  await check('issue #10 island fallback respects locked war and worker refusal', async () => {
    const x=boot();x.b.setBoats(true);x.game.isShore=t=>t===176;
    x.game.owner=t=>t===176?null:t===5?x.weak:t===6?x.strong:x.me;
    x.me.actions=async()=>({buildableUnits:[]});
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    x.b.setBoatCtor(Boat);
    assert.equal(await x.b.naval(x.me,300,0),false);
    assert.equal(x.sent.length,0);
    x.b.setWar('weak','weak');x.setTick(500);
    x.me.actions=async tile=>({buildableUnits:tile===176?
      [{type:'Transport',canBuild:9999,cost:0n}]:[]});
    assert.equal(await x.b.naval(x.me,500,0),false);
    assert.equal(x.sent.length,0,'neutral island must not open a second front');
  });
  await check('v1.10.2 Public Medium locks confirmed war target', () => {
    const x=boot();x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Medium'});
    x.b.setPending({id:'weak',name:'weak',tick:250,amount:12000,
      ownLand:1200,enemyLand:900,beforeIds:[],beforeTroops:0});
    x.out.push({id:'front',targetID:2,troops:12000,retreating:false});
    x.b.confirmAttack(x.me,301);
    assert.equal(x.b.coordinatedWar(),true);
    assert.equal(x.b.state().warState.id,'weak');
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]},
      {id:'strong',opponent:x.strong,front:10,tiles:[6]}];
    const s=x.b.military(x.me,groups);
    const ranked=x.b.rankedTargets(groups,x.me,303,s,{wanted:'ASSAULT',
      readiness:{ready:true},rebuilding:false,underAttack:false});
    assert(!ranked.some(t=>t.id==='strong'));
  });
  await check('v1.10.2 Public Medium war director adopts existing attack', () => {
    const x=boot();x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Medium'});
    x.out.push({id:'attack-1',targetID:2,troops:20000,retreating:false});
    x.b.manageWar(x.me,[{id:'weak',opponent:x.weak}],
      x.b.military(x.me,[]),300);
    assert.equal(x.b.state().warState.id,'weak');
  });
  await check('v1.10.2 allied counterattack canceled after worker wait', async () => {
    const x=boot();x.game.playerBySmallID=id=>id===2?x.weak:x.strong;
    x.me.incomingAttacks=()=>[{id:'threat',attackerID:2,troops:5000,retreating:false}];
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]}];
    let resolve;
    x.me.actions=()=>new Promise(r=>{resolve=r});
    const action=x.b.defense(x.me,300,0,groups,x.b.military(x.me,groups));
    await Promise.resolve();
    x.me.isFriendly=p=>p===x.weak;
    resolve({canAttack:true,buildableUnits:[]});
    assert.equal(await action,false);
    assert.equal(x.sent.length,0);
    assert(x.b.state().diagnostics.some(v=>v.kind==='defense_allied_skip'));
  });
  await check('v1.10.2 ordinary assault cancels on newly allied target', async () => {
    const x=boot();let resolve;
    x.me.actions=()=>new Promise(r=>{resolve=r});
    const item={id:'weak',key:'weak',opponent:x.weak,
      front:10,tiles:[5],amount:10000,score:90};
    const groups=[item];x.b.setGroups(groups);
    const action=x.b.attack(x.me,300,0,[item],x.b.military(x.me,groups));
    await Promise.resolve();
    x.me.isFriendly=p=>p===x.weak;
    resolve({canAttack:true,buildableUnits:[]});
    assert.equal(await action,false);
    assert.equal(x.sent.length,0);
    assert(x.b.state().diagnostics.some(v=>v.kind==='attack_allied_skip'));
  });
  await check('v1.10.2 calm defense posts capped separately from emergencies', () => {
    const x=boot();x.setGold(2000000);x.setTick(2400);x.setLand(50000);
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>5000+i*30}));
    x.me.units=()=>units;
    x.b.setGroups([{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}]);
    x.b.setTroopSnapshot({home:90000,max:100000,ratio:.9,incoming:0,
      strongest:85000,committed:0,reserve:10000,available:80000});
    const plan=x.b.economicNeeds(x.me,units,Array(3000).fill(5500));
    assert(plan.wantedDefense<=7);
    assert.equal(plan.immediate,false);
    x.b.setTroopSnapshot({home:90000,max:100000,ratio:.9,incoming:50000,
      strongest:85000,committed:0,reserve:10000,available:80000});
    const urgent=x.b.economicNeeds(x.me,units,Array(3000).fill(5500));
    assert(urgent.wantedDefense>plan.wantedDefense);
  });
  await check('v1.10.2 proactive SAM protects uncovered high-value buildings', () => {
    const x=boot();x.setGold(2000000);x.setTick(2400);x.setLand(50000);
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>5500+i*60}));
    x.me.units=()=>units;
    x.b.setGroups([{id:'weak',opponent:x.weak}]);
    const plan=x.b.economicNeeds(x.me,units,[]);
    assert.equal(plan.proactiveSAM,true);
    assert(plan.wantedSAM>=1);
    assert(plan.list.some(v=>v.type==='SAM Launcher'));
    const points=x.b.economicAnchors(x.me,[],units,2400);
    assert(points.includes(5525),'SAM sampling must include offset near City');
  });
  await check('v1.10.2 snapshots keep historic tuning and metric values', () => {
    const x=boot(),metrics={counter:0,nested:{n:1}};
    x.b.telemetry('snapshot','first',{metrics});
    metrics.counter=4;metrics.nested.n=11;
    x.b.telemetry('snapshot','second',{metrics});
    const snaps=x.b.state().diagnostics.filter(v=>v.kind==='snapshot');
    assert.equal(snaps.length,2);
    assert.equal(snaps[0].metrics.counter,0);
    assert.equal(snaps[0].metrics.nested.n,1);
    assert.equal(snaps[1].metrics.nested.n,11);
  });
  await check('v1.10.2 game winner from official WinUpdate tuple', () => {
    const x=boot();
    x.game.updatesSinceLastTick=()=>({Win:[{winner:['player','me'],
      allPlayersStats:{}}]});
    assert.equal(x.b.gameOutcome(x.game,x.me).outcome,'victory');
    x.game.updatesSinceLastTick=()=>({Win:[{winner:['team','blue','weak','me'],
      allPlayersStats:{}}]});
    assert.equal(x.b.gameOutcome(x.game,x.me).outcome,'victory');
    x.game.updatesSinceLastTick=()=>({Win:[{winner:['player','weak'],
      allPlayersStats:{}}]});
    assert.equal(x.b.gameOutcome(x.game,x.me).outcome,'defeat');
    x.game.updatesSinceLastTick=()=>({Win:[{winner:null,
      allPlayersStats:{}}]});
    assert.equal(x.b.gameOutcome(x.game,x.me).outcome,'incomplete');
    x.game.updatesSinceLastTick=()=>null;
    assert.equal(x.b.gameOutcome(x.game,x.me).outcome,'unknown');
  });
  function spawnFixture(x,tick=20){
    x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Medium',gameMode:'FFA'});
    x.game.config().numSpawnPhaseTurns=()=>200;
    x.game.config().minDistanceBetweenPlayers=()=>30;
    x.game.config().isRandomSpawn=()=>false;
    x.game.inSpawnPhase=()=>true;x.game.hasOwner=()=>false;
    x.game.isBorder=()=>false;x.game.magnitude=()=>0;
    x.game.terrainByte=()=>128;
    x.game.isOceanShore=()=>false;
    x.me.hasSpawned=()=>false;
    x.me.state.spawnTile=undefined;
    x.setTick(tick);
    class Spawn{constructor(tile){this.tile=tile;}}
    x.b.setCtor('spawn',Spawn);
  }
  await check('v1.10.3 spawn requires unowned traversable footprint', () => {
    const x=boot();spawnFixture(x);const t=x.game.ref(50,50);
    assert(x.b.spawnScore(x.game,t),'legal center should be ranked');
    x.game.hasOwner=tile=>tile===t;
    assert.equal(x.b.spawnScore(x.game,t),null);
    x.game.hasOwner=()=>false;
    x.game.isImpassable=tile=>tile===t;
    assert.equal(x.b.spawnScore(x.game,t),null);
    x.game.isImpassable=()=>false;
    x.game.isLand=tile=>tile!==t;
    assert.equal(x.b.spawnScore(x.game,t),null);
  });
  await check('v1.10.3 large open land beats cramped island', () => {
    const x=boot();spawnFixture(x);
    const full=x.b.spawnScore(x.game,x.game.ref(70,70));
    x.game.isLand=t=>{
      const a=x.game.x(t),b=x.game.y(t);
      return (a>=22&&a<=38&&b>=22&&b<=38) ||
        (a>=52&&a<=98&&b>=52&&b<=98);
    };
    assert.equal(x.b.spawnScore(x.game,x.game.ref(30,30)),null,
      'a tiny island should fail outer-land screening');
    const open=x.b.spawnScore(x.game,x.game.ref(70,70));
    assert(open && open.density>.7);
    assert(open.score<=full.score+0.01);
  });
  await check('v1.10.3 avoids enemy crowding without rejecting teammates as foes', () => {
    const x=boot();spawnFixture(x);
    const center=x.game.ref(50,50);
    const rivals=[{x:53,y:50,teammate:false}];
    assert.equal(x.b.spawnScore(x.game,center,rivals),null);
    assert.equal(x.b.spawnScore(x.game,center,[{x:54,y:50,teammate:true}]),null,
      'do not overlap friendly territory either');
    assert(x.b.spawnScore(x.game,center,[{x:110,y:50,teammate:true}]));
    x.me.team=()=> 'blue';x.weak.team=()=> 'blue';
    x.weak.state.spawnTile=x.game.ref(50,60);
    assert.equal(x.b.spawnRivals(x.game,x.me).find(v=>v.x===50&&v.y===60).teammate,true);
  });
  await check('v1.10.3 finished multiplayer scan sends highest scored legal spawn', () => {
    const x=boot();spawnFixture(x,20);
    x.b.startSpawnSearch();assert(x.b.state().spawnJob,'scan should begin');
    assert.equal(x.sent.length,0);
    assert.equal(x.flushTimers(),0);
    assert.equal(x.sent.length,1);
    const picked=x.sent[0].tile;
    assert.equal(x.b.spawnTileValid(x.game,picked),true);
    assert.equal(x.b.state().spawnState.phase,'Auswahl gesendet');
    assert(x.b.state().spawnState.scanned>0);
    assert(x.b.state().diagnostics.some(v=>v.kind==='spawn_intent'));
  });
  await check('v1.10.3 deadline picks emergency candidate while grid scan is pending', () => {
    const x=boot();spawnFixture(x,185);
    x.b.doSpawn(185);
    assert.equal(x.sent.length,1);
    assert.equal(x.b.state().spawnState.attempts,1);
    assert.equal(x.b.state().spawnState.phase,'Auswahl gesendet');
    assert.equal(x.b.state().spawnJob,null);
  });
  await check('v1.10.3 worker-selected tile lost to rival is not submitted', () => {
    const x=boot();spawnFixture(x,20);
    x.b.startSpawnSearch();x.flushTimers();
    const first=x.sent[0].tile;
    x.game.hasOwner=t=>t===first;
    x.setTick(60);x.b.doSpawn(60);
    assert(!x.sent.some((event,i)=>i>0&&event.tile===first));
  });
  await check('v1.10.3 random spawn, replay and ended phases emit no choice', () => {
    const x=boot();spawnFixture(x,185);
    x.game.config().isRandomSpawn=()=>true;
    x.b.doSpawn(185);x.b.startSpawnSearch();
    assert.equal(x.sent.length,0);
    x.game.config().isRandomSpawn=()=>false;
    x.game.config().isReplay=()=>true;
    x.b.doSpawn(185);assert.equal(x.sent.length,0);
    x.game.config().isReplay=()=>false;
    x.game.inSpawnPhase=()=>false;
    x.b.doSpawn(185);assert.equal(x.sent.length,0);
  });
  await check('v1.10.3 stopped bot cancels deferred spawn search', () => {
    const x=boot();spawnFixture(x,20);
    x.b.startSpawnSearch();x.b.opts.enabled=false;
    x.flushTimers();
    assert.equal(x.sent.length,0);
    assert.equal(x.b.state().spawnJob,null);
  });
  await check('v1.10.4 missing myPlayer during spawn still sends a legal tile', () => {
    const x=boot();spawnFixture(x,20);
    x.game.myPlayer=()=>null;
    x.b.startSpawnSearch();x.flushTimers();
    assert.equal(x.sent.length,1,'PlayerView is not required to request a spawn');
    assert(x.b.spawnTileValid(x.game,x.sent[0].tile));
    assert(x.b.state().diagnostics.some(v=>v.kind==='spawn_intent' &&
      v.withoutPlayerView===true));
  });
  await check('v1.10.4 same-match EventBus rebind does not disable bot', async () => {
    const x=boot();spawnFixture(x,20);
    class SendSpawnIntentEvent{constructor(tile){this.tile=tile;}}
    const newBus={listeners:{keys:()=>[SendSpawnIntentEvent]},
      emit:event=>x.sent.push(event)};
    x.doc.querySelector=()=>({game:x.game,eventBus:newBus});
    assert.equal(x.b.opts.enabled,true);
    await x.b.step();
    assert.equal(x.b.opts.enabled,true,
      'replacing EventBus for the same GameView must not reset');
    assert(x.b.state().diagnostics.some(v=>v.kind==='spawn_bus_rebind'));
    x.flushTimers();
    assert.equal(x.sent.length,1);
  });
  await check('v1.10.4 missing spawn constructor exposes exact blocker', () => {
    const x=boot();spawnFixture(x,20);
    x.b.setCtor('spawn',null);x.b.doSpawn(20);
    assert.equal(x.sent.length,0);
    assert.equal(x.b.state().spawnState.blocked,'Spawn-Intent nicht erkannt');
    assert(x.b.state().diagnostics.some(v=>v.kind==='spawn_blocked'));
  });
  await check('v1.10.4 late spawn bypasses normal combat burst budget', () => {
    const x=boot();spawnFixture(x,190);x.b.setBudget(120);
    x.b.doSpawn(190);
    assert.equal(x.sent.length,1);
    assert.equal(x.b.state().spawnState.attempts,1);
  });
  await check('v1.10.5 first Port beats upgrades after basic City/Factory', async () => {
    const x=boot();x.setTick(2400);x.setGold(500000);
    x.game.isShore=t=>t===5500;
    const units=['City','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>5000+i*20,
      id:()=>i+1,level:()=>1}));
    x.me.units=()=>units;
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:250000n}))});
    const needs=x.b.economicNeeds(x.me,units,[5500]);
    assert.equal(needs.portMilestone,true);
    assert(x.b.portCoastalAnchors(x.me,[5500],2400).length>0);
    assert.equal(await x.b.economy(x.me,2400,0,[5500]),true);
    assert.equal(x.sent[0].unit,'Port');
    assert(x.b.state().diagnostics.some(e=>e.kind==='port_intent'));
  });
  await check('v1.10.5 first Port not indefinitely blocked by silo savings', async () => {
    const x=boot();x.setTick(2400);x.setGold(900000);x.setLand(52000);
    x.game.isShore=t=>t===5500;
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>5000+i*20,
      id:()=>i+1,level:()=>1}));
    x.me.units=()=>units;
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:type==='Missile Silo'?1000000n:250000n}))});
    const plan=x.b.economicNeeds(x.me,units,[5500]);
    assert.equal(plan.saveForSilo,true);
    assert.equal(plan.portMilestone,true);
    assert.equal(plan.savingsTarget,0);
    assert.equal(await x.b.economy(x.me,2400,0,[5500]),true);
    assert.equal(x.sent[0].unit,'Port');
  });
  await check('v1.10.5 missing Port worker site does not block silo forever', async () => {
    const x=boot();x.setTick(2400);x.setLand(52000);x.setGold(900000);
    x.game.isShore=t=>t===5500;
    const units=['City','City','Factory','Factory'].map((type,i)=>({
      type:()=>type,isActive:()=>true,tile:()=>5000+i*20,
      id:()=>i+1,level:()=>1}));
    x.me.units=()=>units;
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[])
      .filter(type=>type!=='Port').map(type=>({
        type,canBuild:tile,canUpgrade:false,cost:250000n}))});
    for(let k=0;k<8;k++){
      x.setTick(2400+k*22);
      assert.equal(await x.b.economy(x.me,2400+k*22,0,[5500]),false);
    }
    assert.equal(x.b.state().portProbeFailures,8);
    assert.equal(x.b.economicNeeds(x.me,units,[5500]).portMilestone,false);
    assert.equal(x.b.economicNeeds(x.me,units,[5500]).savingsTarget,1150000);
  });
  await check('v1.10.5 own Port is confirmed from actual unit view', async () => {
    const x=boot();x.setTick(300);x.setGold(500000);x.game.isShore=t=>t===5500;
    const city={type:()=> 'City',isActive:()=>true,tile:()=>5000};
    const factory={type:()=> 'Factory',isActive:()=>true,tile:()=>5020};
    let units=[city,factory];
    x.me.units=()=>units;
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:125000n}))});
    assert.equal(await x.b.economy(x.me,300,0,[5500]),true);
    assert.equal(x.sent[0].unit,'Port','the receipt test must first request a Port');
    const location=x.sent[0].tile;
    units=[...units,{type:()=> 'Port',isActive:()=>true,tile:()=>location}];
    x.setTick(341);
    await x.b.economy(x.me,341,0,[5500]);
    assert(x.b.state().diagnostics.some(e=>e.kind==='port_confirmed'),
      JSON.stringify(x.b.state().diagnostics.slice(-6).map(e=>({kind:e.kind,
        message:e.message,type:e.type,tile:e.tile}))));
  });
  await check('v1.10.5 proactive Warship requires completed Port and water', async () => {
    const x=boot();x.setGold(600000);x.setLand(16000);
    assert.equal(await x.b.fleetDefense(x.me,300,0),false);
    x.me.units=()=>[{type:()=> 'Port',tile:()=>5500,
      isActive:()=>true,isUnderConstruction:()=>false}];
    x.game.isWater=()=>true;
    x.me.actions=async tile=>({buildableUnits:[{type:'Warship',
      canBuild:tile,cost:250000n}]});
    assert.equal(await x.b.fleetDefense(x.me,300,0),true);
    assert.equal(x.sent[0].unit,'Warship');
    assert.equal(x.b.state().marineStats.warshipSent,1);
    assert.equal(await x.b.fleetDefense(x.me,460,0),false,
      'do not construct another hull before the first receipt');
    x.game.units=()=>[{id:()=>88,type:()=> 'Warship',
      owner:()=>x.me,tile:()=>x.sent[0].tile,isActive:()=>true}];
    x.b.inspectMarine(x.me,463);
    assert.equal(x.b.state().marineStats.warshipConfirmed,1);
    assert(x.b.state().diagnostics.some(e=>e.kind==='warship_confirmed'));
  });
  await check('v1.10.5 Transport intent requires visible ship and owned destination', async () => {
    const x=boot();x.setTick(300);x.strong.troops=()=>5000;
    x.b.setWar('strong','strong');
    x.b.setGroups([{id:'strong',opponent:x.strong}]);
    x.me.actions=async()=>({buildableUnits:[{type:'Transport',canBuild:1,cost:0n}]});
    x.game.ownerID=t=>t===6?3:1;
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    x.b.setBoatCtor(Boat);
    assert.equal(await x.b.naval(x.me,300,0),true);
    assert.equal(x.b.state().marineStats.transportSent,1);
    assert.equal(await x.b.naval(x.me,450,0),false,
      'no second landing while the previous transport is pending');
    x.game.units=()=>[{id:()=>71,type:()=> 'Transport',owner:()=>x.me,
      targetTile:()=>6,isActive:()=>true}];
    x.b.inspectMarine(x.me,310);
    assert.equal(x.b.state().marineStats.transportConfirmed,1);
    x.game.ownerID=()=>1;
    x.b.inspectMarine(x.me,320);
    assert.equal(x.b.state().marineStats.transportArrived,1);
    assert.equal(x.b.state().pendingBoat,null);
  });
  await check('v1.10.5 unobserved Transport is not counted as landing', async () => {
    const x=boot();x.strong.troops=()=>5000;x.b.setWar('strong','strong');
    x.b.setGroups([{id:'strong',opponent:x.strong}]);
    x.me.actions=async()=>({buildableUnits:[{type:'Transport',canBuild:1,cost:0n}]});
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    x.b.setBoatCtor(Boat);
    assert.equal(await x.b.naval(x.me,300,0),true);
    x.b.inspectMarine(x.me,401);
    assert.equal(x.b.state().marineStats.transportUnconfirmed,1);
    assert.equal(x.b.state().marineStats.transportArrived,0);
    assert.equal(await x.b.naval(x.me,500,0),false,
      'target cooldown prevents blind 100-tick retry');
  });
  await check('issue #16: numeric smallIDs resolve to PlayerID strings; neutral stays neutral', () => {
    const x=boot();
    assert.equal(x.b.attackTargetID(2),'weak');
    assert.equal(x.b.attackTargetID(3),'strong');
    assert.equal(x.b.attackTargetID(0),null);
    assert.equal(x.b.attackTargetID(null),null);
    assert.equal(x.b.attackTargetID(999),null);
    assert.equal(x.b.attackTargets(2,'weak'),true);
    assert.equal(x.b.attackTargets(2,x.weak),true);
    assert.equal(x.b.attackTargets(2,'strong'),false);
    assert.equal(x.b.attackTargets(3,'weak'),false);
    assert.equal(x.b.attackTargets(0,null),true);
    assert.equal(x.b.attackTargets(null,null),true);
    assert.equal(x.b.attackTargets(999,'weak'),false);
    x.game.playerBySmallID=id=>id===2?x.weak:id===3?x.strong:null;
    assert.equal(x.b.attackTargetID(2),'weak');
    assert.equal(x.b.attackTargetPlayer(3),x.strong);
  });
  await check('issue #16: real numeric outgoing confirms attack via active_stack', () => {
    const x=boot();
    x.b.setPending({id:'weak',name:'weak',tick:300,amount:600,
      ownLand:1200,enemyLand:900,beforeIds:[],beforeTroops:0});
    x.out.push({id:'stack-1',attackerID:1,targetID:2,
      troops:600,retreating:false});
    x.b.confirmAttack(x.me,305);
    assert.equal(x.b.state().pendingAttack,null);
    assert.equal(x.b.state().attackReceipts.confirmed,1);
    assert.equal(x.b.state().warState.id,'weak');
    assert(x.b.state().diagnostics.some(v=>v.kind==='attack_confirmed'&&
      v.via==='active_stack'));
  });
  await check('issue #16: existing stack is not false-unconfirmed after 85 ticks', () => {
    const x=boot();
    x.b.setPending({id:'weak',name:'weak',tick:200,amount:600,
      ownLand:1200,enemyLand:900,beforeIds:[],beforeTroops:0});
    x.out.push({id:'stack-1',attackerID:1,targetID:2,
      troops:600,retreating:false});
    x.b.confirmAttack(x.me,290);
    assert.equal(x.b.state().attackReceipts.unconfirmed,0);
    assert.equal(x.b.state().warState.id,'weak');
  });
  await check('issue #16: adopted numeric target locks war as string PlayerID', () => {
    const x=boot();
    x.out.push({id:'war-stack',attackerID:1,targetID:2,
      troops:15000,retreating:false});
    x.b.manageWar(x.me,[{id:'weak',opponent:x.weak}],
      x.b.military(x.me,[]),300);
    assert.equal(x.b.state().warState.id,'weak');
    assert.equal(typeof x.b.state().warState.id,'string');
    x.b.manageWar(x.me,[],x.b.military(x.me,[]),1200);
    assert.equal(x.b.state().warState.id,'weak',
      'do not release active war solely due to elapsed time');
    x.out.length=0;
    x.b.manageWar(x.me,[],x.b.military(x.me,[]),1201);
    assert.equal(x.b.state().warState.id,null,
      'inactive and stale war may be reassessed');
  });
  await check('issue #16: battle review waits for numeric active opponent stack', () => {
    const x=boot();x.setTick(300);
    x.b.setLastBattle({id:'weak',name:'weak',tick:300,
      enemyLand:900,ownLand:1200});
    x.out.push({id:'war-stack',attackerID:1,targetID:2,
      troops:11000,retreating:false});
    x.b.evaluateLastBattle(620,x.me);
    assert.equal(x.b.state().lastBattle.id,'weak');
    assert(!x.b.state().diagnostics.some(v=>v.kind==='war_stall'));
    x.out.length=0;
    x.b.evaluateLastBattle(625,x.me);
    assert.equal(x.b.state().lastBattle,null);
    assert(x.b.state().diagnostics.some(v=>v.kind==='war_stall'));
  });
  await check('issue #16: emergency retreat preserves numeric-ID primary war front', () => {
    const x=boot();x.b.setWar('weak','weak');
    class Cancel{constructor(attackID){this.attackID=attackID;}}
    x.b.setCancelCtor(Cancel);
    x.out.push({id:'war-stack',attackerID:1,targetID:2,
      troops:20000,retreating:false});
    x.out.push({id:'other-stack',attackerID:1,targetID:3,
      troops:20000,retreating:false});
    x.me.incomingAttacks=()=>[{id:'incoming',attackerID:3,targetID:1,
      troops:80000,retreating:false}];
    assert.equal(x.b.emergencyRetreat(x.me,300,x.b.military(x.me,[])),true);
    assert.equal(x.sent[0].attackID,'other-stack');
  });
  await check('issue #16: diplomacy rejects numeric-ID outgoing conflict', () => {
    const x=boot();
    const state=x.b.military(x.me,[]);
    state.out=[{id:'out',attackerID:1,targetID:2,troops:10000,
      retreating:false}];
    assert.equal(x.b.diplomacyScore(x.me,x.weak,state).reason,
      'Aktiver Konflikt');
    assert.notEqual(x.b.diplomacyScore(x.me,x.strong,state).reason,
      'Aktiver Konflikt', 'unrelated player is not the active target');
  });
  console.log('TOTAL',pass,'passed,',fail,'failed');
  if(fail)process.exitCode=1;
})();
