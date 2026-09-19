'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'OpenFront_Solo_AggroBot.user.js'), 'utf8');
const anchor = "  console.info(PREFIX,'v'+VERSION,'ready; singleplayer only, OFF by default');";
assert(source.includes(anchor), 'bot test injection anchor missing');
let pass = 0, fail = 0;
async function check(name, test) {
  try { await test(); ++pass; console.log('PASS', name); }
  catch (error) { ++fail; console.error('FAIL', name, error.stack); }
}
function boot() {
  let tick = 300, land = 1200, gold = 1000000, home = 90000, enemyLand = 900, gameOver = false;
  const out = [], incoming = [], sent = [];
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
    Date: fixedDate, console: {info: () => {}, warn: () => {}, error: () => {}},
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1,
    performance: {now: () => 0},
    URL: {createObjectURL: () => '', revokeObjectURL: () => {}},
    Blob: class {}
  };
  const expose = [
    'window.__test={',
    'setup:(g,b,c)=>{game=g;bus=b;ctors=c;opts.enabled=true;},',
    'military,warReadiness,targetOpportunity,rankedTargets,confirmAttack,economy,economicNeeds,strategy,manageWar,actionBudget,connected,naval,',
    'setBudget:n=>actions=Array(n).fill(Date.now()),',
    'setWarWait:n=>warWaitSince=n,setEconFails:n=>failedEconomyProbes=n,',
    'setPending:p=>pendingAttack=p,',
    'setWar:(id,name)=>warState={id,name,since:game.ticks(),blockedUntil:-Infinity},',
    'setGroups:groups=>strategic.groups=groups,',
    'setBoats:yes=>opts.boats=yes,setBoatCtor:C=>ctors.boat=C,',
    'state:()=>({pendingAttack,attackReceipts,warState,economicStatus,failedEconomyProbes,investmentStatus,strategic}),opts};'
  ].join('\n');
  vm.runInNewContext(source.replace(anchor, expose + '\n' + anchor), context, {timeout:2000});
  win.__test.setup(game, {emit:event=>sent.push(event)}, {attack:Attack, build:Build});
  return {b:win.__test,game,me,weak,strong,out,sent,
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
    x.out.push({id:'new',targetID:'weak',troops:500,retreating:false});
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
    x.me.actions=async()=>({buildableUnits:[{type:'Transport Ship',canBuild:1,cost:0n}]});
    class Boat{constructor(dst,troops){this.dst=dst;this.troops=troops;}}
    x.b.setBoatCtor(Boat);
    assert.equal(await x.b.naval(x.me,300,0),true);
    assert.equal(x.sent[0].dst,6);
  });
  await check('navy keeps reserves against all border enemies', async () => {
    const x=boot();x.b.setBoats(true);x.b.setWar('weak','weak');
    x.b.setGroups([{id:'weak',opponent:x.weak},{id:'strong',opponent:x.strong}]);
    x.me.actions=async()=>({buildableUnits:[{type:'Transport Ship',canBuild:1,cost:0n}]});
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
  await check('diagnosed Impossible opening can attack weaker border neighbor', () => {
    const x=boot();
    x.setTick(184);x.setLand(440);x.setHome(93198);x.setGold(16300);
    x.weak.troops=()=>17594;x.strong.troops=()=>102839;
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]},
      {id:'strong',opponent:x.strong,front:10,tiles:[6]}];
    const s=x.b.military(x.me,groups);
    assert(s.home<x.strong.troops()*1.48);
    assert.equal(x.b.warReadiness(x.me,groups,s,184).ready,true);
    const context=x.b.strategy(x.me,groups,s);
    const ranked=x.b.rankedTargets(groups,x.me,184,s,context);
    assert(ranked.some(t=>t.id==='weak'),JSON.stringify(ranked));
    assert(!ranked.some(t=>t.id==='strong'));
  });
  await check('significant incoming attacks suppress new weak-neighbor offensives', () => {
    const x=boot();
    x.setTick(184);x.setLand(440);x.setHome(93198);
    x.weak.troops=()=>17594;x.strong.troops=()=>102839;
    const groups=[{id:'weak',opponent:x.weak,front:10,tiles:[5]},
      {id:'strong',opponent:x.strong,front:10,tiles:[6]}];
    x.me.incomingAttacks().push({id:'in',attackerID:3,targetID:1,troops:20000,retreating:false});
    const s=x.b.military(x.me,groups);
    assert.equal(x.b.targetOpportunity(x.me,groups,s,groups[0]),false);
    assert.equal(x.b.warReadiness(x.me,groups,s,184).ready,false);
  });
  await check('construction diagnosis separates affordable-site failure from missing gold', async () => {
    const x=boot();x.setGold(55000);
    x.me.actions=async(tile,types)=>({buildableUnits:(types||[]).map(type=>({
      type,canBuild:tile,canUpgrade:false,cost:125000n}))});
    assert.equal(await x.b.economy(x.me,300,0,[]),false);
    assert.match(x.b.state().economicStatus,/Gold für gültige Bauoption fehlt/);
  });
  await check('Public game remains blocked regardless of bot options', () => {
    const x=boot();x.game.config().gameConfig=()=>({gameType:'Public',difficulty:'Medium'});
    assert.equal(x.b.connected(),false);
  });
  console.log('TOTAL',pass,'passed,',fail,'failed');
  if(fail)process.exitCode=1;
})();
