// 2-8 full userscript clients: independent GameViews/VMs, one official GameRunner.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import common from './common.cjs';
const localRequire=createRequire(import.meta.url);
const relay=localRequire('../duo-relay.cjs');
const {aggregateRecordings}=localRequire('./multibot-recording.cjs');
const visibleTrajectory=localRequire('./trajectory.cjs');
const {winnerOutcome}=localRequire('./winner-outcome.cjs');
import policyModel from '../../trainer/policy.cjs';
import actionModel from '../../trainer/action-policy.cjs';
import strategicModel from '../../trainer/strategic-policy.cjs';
import strategicModelV4 from '../../trainer/strategic-policy-v4.cjs';

const argv=process.argv.slice(2),i=argv.indexOf('--lineup');
if(i<0||!argv[i+1])throw Error('--lineup JSON required');
const lineup=JSON.parse(fs.readFileSync(path.resolve(argv[i+1]),'utf8'));
if(!Array.isArray(lineup)||lineup.length<2||lineup.length>8||lineup.some(x=>
 !x||typeof x.bot!=='string'||!common.profiles[x.profile]||
 ![0,1].includes(x.teamIndex??0)))throw Error('Invalid full-bot lineup (2-8 members)');
const opts=common.parse(argv.filter((_,j)=>j!==i&&j!==i+1));
if(opts.gameType==='Singleplayer')throw Error('Multiple human clients require --gameType Private');
if(opts.gameMode==='Team'&&new Set(lineup.map(x=>x.teamIndex)).size!==2)
 throw Error('Team match requires both teams');
const members=lineup.map((x,j)=>({...x,clientID:'aggrobot'+(j+1),
 source:fs.readFileSync(path.resolve(x.bot),'utf8')}));
const engineCommit=common.engineInfo(opts.engine,opts.engineCommit);
const requireEngine=createRequire(path.join(opts.engine,'package.json'));
requireEngine('tsx/esm/api').register({tsconfig:path.join(opts.engine,'tsconfig.json')});
const mod=p=>import(pathToFileURL(path.join(opts.engine,p)).href);
// Upstream GameView reads preferences. No auth, account or real browser storage.
const storage=new Map();
let policyHash=null;
if(opts.policy){
  const policySource=fs.readFileSync(path.resolve(opts.policy),'utf8');
  const decoded=JSON.parse(policySource);
  const policy=decoded?.schema===4?strategicModelV4.validate(decoded):
    decoded?.schema===3?strategicModel.validate(decoded):
    decoded?.schema===2?actionModel.validate(decoded):policyModel.validate(decoded);
  policyHash=common.digest(JSON.stringify(policy));
  storage.set('of-aggrobot-neural-policy-v1',JSON.stringify(policy));
  storage.set('of-solo-aggrobot-v1111',JSON.stringify({neuralEnabled:true,fullAuto:true}));
}
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const [{createGameRunner},{Config},{GameMapType,GameMapSize,Difficulty,GameType,GameMode},
 {GameView},{loadTerrainMap},{NodeGameMapLoader},{EventBus},{GameConfigSchema,StampedIntentSchema}]=await Promise.all([
  mod('src/core/GameRunner.ts'),mod('src/core/configuration/Config.ts'),mod('src/core/game/Game.ts'),
  mod('src/client/view/GameView.ts'),mod('src/core/game/TerrainMapLoader.ts'),
  mod('tests/perf/fullgame/NodeGameMapLoader.ts'),mod('src/core/EventBus.ts'),mod('src/core/Schemas.ts')]);
const resolve=(values,input)=>{const key=Object.keys(values).find(k=>k.toLowerCase()===input.toLowerCase());if(!key)throw Error('Unknown enum '+input);return values[key];};
const gameType=resolve(GameType,opts.gameType),gameMode=resolve(GameMode,opts.gameMode);
const scriptedProfiles=['rush','balanced','defender','opportunist'];
const profileFor=i=>opts.opponentProfile==='mixed'?
  scriptedProfiles[i%scriptedProfiles.length]:opts.opponentProfile;
const config=GameConfigSchema.parse({gameMap:resolve(GameMapType,opts.map),gameMapSize:resolve(GameMapSize,opts.size),
  gameMode,gameType,difficulty:resolve(Difficulty,opts.difficulty),
  nations:opts.nations===0?'disabled':opts.nations,bots:opts.bots,
  donateGold:gameMode===GameMode.Team,donateTroops:gameMode===GameMode.Team,
  infiniteGold:false,infiniteTroops:false,instantBuild:false,
  randomSpawn:opts.scriptedHumans>0,
  ...(gameMode===GameMode.Team?{playerTeams:2}:{})});
const dir=common.outputDir(opts),source=members[0].source;
const clientID=members[0].clientID;
const players=[...members.map(m=>({clientID:m.clientID,
 username:'AggroBot '+m.clientID,clanTag:null,
 ...(gameMode===GameMode.Team?{teamIndex:m.teamIndex??0}:{})})),
  ...Array.from({length:opts.scriptedHumans},(_,i)=>({
    clientID:'scripted'+String(i+1).padStart(2,'0'),username:'Scripted '+profileFor(i)+' '+(i+1),clanTag:null,
    ...(gameMode===GameMode.Team?{teamIndex:i%3===0?0:1}:{})
  }))];
const start={gameID:opts.seed,lobbyCreatedAt:0,players,config};
const loader=new NodeGameMapLoader(path.join(opts.engine,'resources/maps'));
let update=null,fatal=null,now=0,observedWinner=null;
const recordsFile=fs.openSync(path.join(dir,'events.jsonl'),'wx');
const intentsFile=fs.openSync(path.join(dir,'turns.jsonl'),'wx');
let recordsCount=0,emitted=0;
const meta={trajectorySemantics:visibleTrajectory.SEMANTICS,harness:'engine-gameview-multibot-v1',engineCommit,
 botSHA256:common.digest(source),fullBots:members.map(m=>({clientID:m.clientID,
 profile:m.profile,teamIndex:m.teamIndex??0,botSHA256:common.digest(m.source)})),
 policySHA256:policyHash,seed:opts.seed,
  seedSource:'GameStartInfo.gameID',profile:opts.profile,settings:common.profiles[opts.profile],
  opponentProfile:opts.opponentProfile,scriptedHumans:opts.scriptedHumans,
  gameConfig:config,maxTicks:opts.ticks,clock:'100ms simulation clock; serial awaited bot cycles',
  worker:'real GameRunner queries via async in-process adapter',browser:false,
  scriptedOpponents:opts.scriptedHumans>0?
    'deterministic human-client intents; heuristic profiles, not real human behavior':null};
common.writeJSON(path.join(dir,'run.json'),meta);
const runner=await createGameRunner(start,clientID,loader,gu=>{'errMsg' in gu?fatal=gu.errMsg:update=gu;});
// Mirrors WorkerClient queries; the full GameView remains the bot's only view of state.
const worker={
  playerInteraction:async(...args)=>structuredClone(runner.playerActions(...args)),
  playerBuildables:async(...args)=>structuredClone(runner.playerBuildables(...args)),
  playerBorderTiles:async(...args)=>structuredClone(runner.playerBorderTiles(...args)),
  attackClusteredPositions:async(...args)=>structuredClone(runner.attackClusteredPositions(...args)),
  bestTransportShipSpawn:async(...args)=>runner.bestTransportShipSpawn(...args)
};
const instances=await Promise.all(members.map(async m=>{
 const store=new Map(storage),localStorage={getItem:k=>store.get(k)??null,
   setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 globalThis.localStorage=localStorage;
 const isolatedMap=await loadTerrainMap(config.gameMap,config.gameMapSize,loader,false);
 const view=new GameView(worker,new Config(config,null,false),isolatedMap,
  m.clientID,players.find(p=>p.clientID===m.clientID).username,null,opts.seed,players);
 return {...m,view,bus:new EventBus(),localStorage,queue:[],timers:[],
   timerID:0,recordsCount:0,emitted:0,started:false,spawned:false};
}));
const view=instances[0].view;
// Compile only the official, data-only event constructors, avoiding the browser Transport runtime.
const adapters={
  SendSpawnIntentEvent:e=>({type:'spawn',tile:e.tile}),
  SendAttackIntentEvent:e=>({type:'attack',targetID:e.targetID,troops:e.troops}),
  CancelAttackIntentEvent:e=>({type:'cancel_attack',attackID:e.attackID}),
  SendBoatAttackIntentEvent:e=>({type:'boat',dst:e.dst,troops:e.troops}),
  BuildUnitIntentEvent:e=>({type:'build_unit',unit:e.unit,tile:e.tile,rocketDirectionUp:e.rocketDirectionUp,amount:e.amount}),
  SendUpgradeStructureIntentEvent:e=>({type:'upgrade_structure',unit:e.unitType,unitId:e.unitId,amount:e.amount}),
  SendAllianceRequestIntentEvent:e=>({type:'allianceRequest',recipient:e.recipient.id()}),
  SendAllianceRejectIntentEvent:e=>({type:'allianceReject',requestor:e.requestor.id()}),
  SendAllianceExtensionIntentEvent:e=>({type:'allianceExtension',recipient:e.recipient.id()}),
  CancelBoatIntentEvent:e=>({type:'cancel_boat',unitID:e.unitID}),
  MoveWarshipIntentEvent:e=>({type:'move_warship',unitIds:e.unitIds,tile:e.tile}),
  SendDonateTroopsIntentEvent:e=>({type:'donate_troops',recipient:e.recipient.id(),troops:e.troops}),
  SendDonateGoldIntentEvent:e=>({type:'donate_gold',recipient:e.recipient.id(),gold:e.gold})
};
const ts=requireEngine('typescript');
const transport=fs.readFileSync(path.join(opts.engine,'src/client/Transport.ts'),'utf8');
const ast=ts.createSourceFile('Transport.ts',transport,ts.ScriptTarget.Latest,true);
const classes=ast.statements.filter(s=>ts.isClassDeclaration(s)&&s.name&&adapters[s.name.text]).map(s=>s.getText(ast)).join('\n');
const eventExports={};vm.runInNewContext(ts.transpileModule(classes,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:eventExports});
for(const [name,convert] of Object.entries(adapters)){
  if(!eventExports[name])throw Error('Official event missing: '+name);
  for(const m of instances)m.bus.on(eventExports[name],e=>{
   m.queue.push(StampedIntentSchema.parse({...convert(e),clientID:m.clientID}));
   m.emitted++;emitted++;
  });
}
const scriptedStats={intents:0,attacks:0,neutral:0,skipped:0,profiles:{}};
for(let i=0;i<opts.scriptedHumans;i++)scriptedStats.profiles[profileFor(i)]=(scriptedStats.profiles[profileFor(i)]||0)+1;
function scriptedHumanIntents(turn){
  if(opts.scriptedHumans<=0)return [];
  const out=[];
  for(let i=0;i<opts.scriptedHumans;i++){
    const cid='scripted'+String(i+1).padStart(2,'0'),p=runner.game.playerByClientID(cid),profile=profileFor(i);
    if(!p?.isAlive?.()||!p.hasSpawned?.()){scriptedStats.skipped++;continue;}
    const active=(p.outgoingAttacks?.()||[]).filter(a=>!a.retreating&&a.troops>0);
    const settings=profile==='rush'?{period:38,fraction:.42,max:2,start:110}:
      profile==='defender'?{period:92,fraction:.19,max:1,start:420}:
      profile==='opportunist'?{period:55,fraction:.34,max:1,start:240}:
      {period:68,fraction:.27,max:2,start:220};
    if(turn<settings.start||active.length>=settings.max||
      (turn+i*13)%settings.period!==0)continue;
    const nearby=(p.nearby?.()||[]);
    const hostile=nearby.filter(x=>x?.isPlayer?.()&&x.isAlive?.()&&!p.isFriendly?.(x));
    const bot=runner.game.playerByClientID(clientID);
    let target=null;
    if(profile==='rush'&&bot&&hostile.includes(bot))target=bot;
    else if(profile==='opportunist'&&hostile.length)
      target=hostile.slice().sort((a,b)=>a.troops()-b.troops())[0];
    else if(profile!=='defender'&&hostile.length)
      target=hostile.slice().sort((a,b)=>b.numTilesOwned()-a.numTilesOwned())[0];
    const home=Math.max(0,p.troops?.()||0);
    const troops=Math.floor(home*settings.fraction);
    if(troops<120)continue;
    if(target&&p.canAttackPlayer?.(target)){
      out.push(StampedIntentSchema.parse({type:'attack',targetID:target.id(),troops,clientID:cid}));
      scriptedStats.attacks++;
    } else if(nearby.some(x=>x&&!x.isPlayer?.())){
      out.push(StampedIntentSchema.parse({type:'attack',targetID:null,
        troops:Math.max(120,Math.floor(troops*(profile==='defender'?.72:1))),clientID:cid}));
      scriptedStats.neutral++;
    } else {scriptedStats.skipped++;continue;}
    scriptedStats.intents++;
  }
  return out;
}
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
for(const m of instances){
 const win={location:{hostname:'localhost'},addEventListener(){},
 __OF_BENCHMARK_CONFIG__:{enabled:true,onRecord(record){
  fs.writeSync(recordsFile,JSON.stringify({clientID:m.clientID,...record})+'\n');
  m.recordsCount++;recordsCount++;
 }}};
 const math=Object.create(Math);
 m.rng=parseInt(common.digest(opts.seed+':'+m.clientID).slice(0,8),16);
 math.random=()=>{m.rng=(Math.imul(m.rng,1664525)+1013904223)>>>0;
   return m.rng/4294967296;};
 const context={window:win,localStorage:m.localStorage,Math:math,Date:Clock,
  AbortController:class {signal={aborted:false};abort(){this.signal.aborted=true;}},
  fetch:async(url,options={})=>{
    if(url!=='http://127.0.0.1:8767/duo'||options.method!=='POST')
      throw Error('External requests forbidden in engine-multibot');
    const request=JSON.parse(options.body||'null');
    const response=relay.validate(request)?relay.exchange(request,now):
      {status:400,body:{error:'invalid-duo-payload'}};
    return {ok:response.status===200,status:response.status,
      json:async()=>response.body};
  },
  document:{readyState:'loading',body:null,addEventListener(){},
   querySelector:tag=>tag==='control-panel'?{game:m.view,eventBus:m.bus}:null},
  performance:{now:()=>now},console:{info(){},warn:(...args)=>fs.appendFileSync(
    path.join(dir,'warnings.log'),m.clientID+': '+args.join(' ')+'\n')},
  setInterval:()=>0,clearInterval(){},
  setTimeout:(fn,ms=0)=>{m.timers.push({id:++m.timerID,due:now+ms,fn});
    return m.timerID;},
  clearTimeout:id=>{m.timers=m.timers.filter(t=>t.id!==id);}};
 vm.runInNewContext(m.source,context,{timeout:5000});
 m.bot=win.__OF_BENCHMARK__;
 if(!m.bot)throw Error(m.clientID+' has no userscript benchmark bridge');
}
const bot=instances[0].bot;
let termination='tick-limit',failure=null,finalTick=0;
const visibleSamples=[];
function sampleVisible(turn,me){
  visibleTrajectory.sampleVisible(visibleSamples,turn,me,view.playerViews?.());
}
try{
  for(let turn=0;turn<opts.ticks;turn++){
    now=turn*100;
    // A bounded timer batch prevents a runaway timer from hanging a test.
    for(const m of instances){const due=m.timers.filter(t=>t.due<=now);
      m.timers=m.timers.filter(t=>t.due>now);
      if(due.length>1000)throw Error(m.clientID+' timer overflow');
      for(const task of due)await task.fn();}
    const intents=instances.flatMap(m=>m.queue.splice(0))
      .concat(scriptedHumanIntents(turn));
    fs.writeSync(intentsFile,JSON.stringify({turnNumber:turn,intents},(_,v)=>typeof v==='bigint'?v.toString():v)+'\n');
    update=null;runner.addTurn({turnNumber:turn,intents});
    if(!runner.executeNextTick()||fatal||!update)throw Error(fatal||'Engine tick produced no update');
    for(const m of instances){globalThis.localStorage=m.localStorage;
      m.view.update(structuredClone(update));}
    finalTick=view.ticks();
    const winUpdate=Object.values(update.updates).flat().find(u=>u&&Object.hasOwn(u,'winner')&&Object.hasOwn(u,'allPlayersStats'));
    if(winUpdate)observedWinner=winUpdate;
    if(turn%4===0||winUpdate)for(const m of instances){
      globalThis.localStorage=m.localStorage;
      await m.bot.pump();if(!m.started&&m.bot.status().connected){
        m.bot.start({...common.profiles[m.profile],
          ...(gameMode===GameMode.Team?{duoEnabled:true,
            duoRoom:'BENCH_DUO_TEAM'+(m.teamIndex??0)}:{})});
        m.started=true;}}
    const me=view.myPlayer();
    for(const m of instances)m.spawned ||= !!m.view.myPlayer()?.hasSpawned();
    if(turn%200===0||winUpdate||!me?.isAlive?.())sampleVisible(turn,me);
    if(winUpdate){termination='game-over';break;}
    if(instances.every(m=>m.spawned&&!m.view.myPlayer()?.isAlive())){
      termination='all-bots-eliminated';break;}
    if(turn===1000&&instances.some(m=>!m.spawned)){
      termination='spawn-timeout';break;}
    if(turn%1000===0)process.stdout.write(JSON.stringify({tick:finalTick,land:me?.numTilesOwned()??0,home:me?.troops()??0,emitted})+'\n');
  }
}catch(error){failure=error.stack;termination='error';process.exitCode=1;}
finally{
  const reports=instances.map(m=>m.bot.snapshot());
  const report=reports[0],me=view.myPlayer();
  report.fullBots=instances.map((m,i)=>{
    const me=m.view.myPlayer(),data=reports[i];
    const outcome=observedWinner?winnerOutcome(observedWinner.winner,me):
      m.spawned&&me?.isAlive?.()===false?'defeat':'unknown';
    return {clientID:m.clientID,profile:m.profile,teamIndex:m.teamIndex??0,
      botSHA256:common.digest(m.source),outcome,
      started:m.started,spawned:m.spawned,emitted:m.emitted,
      land:me?.numTilesOwned?.()??null,alive:me?.isAlive?.()??null,
      // Snapshot a plain copy BEFORE assigning report.fullBots: the first
      // client's diagnostics otherwise points back to report and forms a cycle.
      diagnostics:{...data}};
  });
  report.benchmarkMeta={...report.benchmarkMeta,...meta,gameMap:config.gameMap,gameMapSize:config.gameMapSize,gameMode:config.gameMode};
  report.run={termination,tick:finalTick,spawned:instances[0].spawned,emitted,failure,recordCount:recordsCount,
    scriptedStats};
  report.recording={...report.recording,
    ...aggregateRecordings(reports,recordsCount),streamFile:'events.jsonl'};
  if(me?.isAlive?.()===false&&instances[0].spawned)
    report.gameEnd={outcome:'defeat',source:'engine-elimination',
      tick:finalTick,land:me?.numTilesOwned()??0};
  if(observedWinner){
    report.botReportedGameEnd=report.gameEnd;
    report.gameEnd={outcome:winnerOutcome(observedWinner.winner,me),source:'engine-WinUpdate',tick:finalTick,land:me?.numTilesOwned()??0};
  }
  report.engineWinner=observedWinner?.winner??null;
  if(visibleSamples.length)report.trajectory=visibleTrajectory.trajectory(visibleSamples);
  report.finalState={tick:finalTick,land:me?.numTilesOwned()??0,alive:me?.isAlive()??null,gold:String(me?.gold()??0),
    units:me?.units().map(u=>({type:u.type(),id:u.id()}))??[]};
  common.writeJSON(path.join(dir,'match.json'),report);
  fs.closeSync(recordsFile);fs.closeSync(intentsFile);
  console.log(JSON.stringify({output:dir,termination,
    participants:report.fullBots.map(m=>({id:m.clientID,outcome:m.outcome,land:m.land})),failure}));
}
