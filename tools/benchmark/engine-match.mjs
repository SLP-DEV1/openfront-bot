// Real OpenFront engine + GameView benchmark. No network opponents or mocked battles.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const localRequire=createRequire(import.meta.url);
const visibleTrajectory=localRequire('./trajectory.cjs');
import {pathToFileURL} from 'node:url';
import common from './common.cjs';
import policyModel from '../../trainer/policy.cjs';
import actionModel from '../../trainer/action-policy.cjs';
import strategicModel from '../../trainer/strategic-policy.cjs';
import strategicModelV4 from '../../trainer/strategic-policy-v4.cjs';
import candidatePolicyV5 from '../../trainer/candidate-policy-v5.cjs';

const opts=common.parse(process.argv.slice(2));
const engineCommit=common.engineInfo(opts.engine,opts.engineCommit);
const requireEngine=createRequire(path.join(opts.engine,'package.json'));
requireEngine('tsx/esm/api').register({tsconfig:path.join(opts.engine,'tsconfig.json')});
const mod=p=>import(pathToFileURL(path.join(opts.engine,p)).href);
// Upstream GameView reads preferences. No auth, account or real browser storage.
const storage=new Map();
let policyHash=null;
const policyParts=[];
if(opts.policy){
  const policySource=fs.readFileSync(path.resolve(opts.policy),'utf8');
  const decoded=JSON.parse(policySource);
  const policy=decoded?.schema===4?strategicModelV4.validate(decoded):
    decoded?.schema===3?strategicModel.validate(decoded):
    decoded?.schema===2?actionModel.validate(decoded):policyModel.validate(decoded);
  storage.set('of-aggrobot-neural-policy-v1',JSON.stringify(policy));
  storage.set('of-solo-aggrobot-v1111',JSON.stringify({neuralEnabled:true,fullAuto:true}));
  policyParts.push({schema:policy.schema??4,
    sha256:common.digest(JSON.stringify(policy))});
}
// P5: bounded candidate-v5 control arm. Embeds the schema-5 model into the
// generated bot and enables shadow ranking + control so the model can drive
// the channel director (legality remains authoritative downstream).
let candidateModel=null;
if(opts.candidateControl){
  const model=candidatePolicyV5.validate(JSON.parse(
    fs.readFileSync(path.resolve(opts.candidateModel),'utf8')));
  candidateModel=model;
  storage.set('of-solo-aggrobot-v1111',JSON.stringify({neuralEnabled:true,fullAuto:true,
    shadowRankEnabled:true,candidateControlEnabled:true,
    candidateControlGain:opts.candidateGain?Number(opts.candidateGain):18}));
  policyParts.push({schema:5,sha256:common.digest(JSON.stringify(model))});
}
// policyHash: single model -> its sha; BOTH --policy and --candidateControl
// (the hybrid 4+5 arm) -> sha of the ordered part list, so the report pins
// exactly which two models are loaded together.
policyHash=policyParts.length===1?policyParts[0].sha256:
  policyParts.length>1?common.digest(JSON.stringify(policyParts)):null;
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
const dir=common.outputDir(opts);
let source=fs.readFileSync(opts.bot,'utf8');
// Embed the candidate-v5 model (marker parity with trainer/shadow-deploy.mjs).
if(candidateModel){
  const needle='const SHADOW_V5_BUNDLED_MODEL = null;';
  if(source.split(needle).length!==2)
    throw Error('Candidate-v5 marker missing/not unique in bot source');
  source=source.replace(needle,
    'const SHADOW_V5_BUNDLED_MODEL = '+JSON.stringify(candidateModel)+';');
}
const clientID='aggrobot';
const players=[{clientID,username:'AggroBot Benchmark',clanTag:null,
  ...(gameMode===GameMode.Team?{teamIndex:0}:{})},
  ...Array.from({length:opts.scriptedHumans},(_,i)=>({
    clientID:'scripted'+String(i+1).padStart(2,'0'),username:'Scripted '+profileFor(i)+' '+(i+1),clanTag:null,
    ...(gameMode===GameMode.Team?{teamIndex:i%3===0?0:1}:{})
  }))];
const start={gameID:opts.seed,lobbyCreatedAt:0,players,config};
const loader=new NodeGameMapLoader(path.join(opts.engine,'resources/maps'));
let update=null,fatal=null,now=0,queue=[],observedWinner=null;
const recordsFile=fs.openSync(path.join(dir,'events.jsonl'),'wx');
const intentsFile=fs.openSync(path.join(dir,'turns.jsonl'),'wx');
let recordsCount=0,emitted=0;
const meta={trajectorySemantics:visibleTrajectory.SEMANTICS,harness:'engine-gameview-v2',engineCommit,botSHA256:common.digest(source),policySHA256:policyHash,
  candidateControl:opts.candidateControl?true:null,
  candidateGain:candidateModel?(opts.candidateGain?Number(opts.candidateGain):18):null,
  seed:opts.seed,
  seedSource:'GameStartInfo.gameID',profile:opts.profile,settings:common.profiles[opts.profile],
  opponentProfile:opts.opponentProfile,scriptedHumans:opts.scriptedHumans,
  gameConfig:config,maxTicks:opts.ticks,clock:'100ms simulation clock; serial awaited bot cycles',
  worker:'real GameRunner queries via async in-process adapter',browser:false,
  scriptedOpponents:opts.scriptedHumans>0?
    'deterministic human-client intents; heuristic profiles, not real human behavior':null};
common.writeJSON(path.join(dir,'run.json'),meta);
const runner=await createGameRunner(start,clientID,loader,gu=>{'errMsg' in gu?fatal=gu.errMsg:update=gu;});
const clientMap=await loadTerrainMap(config.gameMap,config.gameMapSize,loader,false);
// Mirrors WorkerClient queries; the full GameView remains the bot's only view of state.
const worker={
  playerInteraction:async(...args)=>structuredClone(runner.playerActions(...args)),
  playerBuildables:async(...args)=>structuredClone(runner.playerBuildables(...args)),
  playerBorderTiles:async(...args)=>structuredClone(runner.playerBorderTiles(...args)),
  attackClusteredPositions:async(...args)=>structuredClone(runner.attackClusteredPositions(...args)),
  bestTransportShipSpawn:async(...args)=>runner.bestTransportShipSpawn(...args)
};
const view=new GameView(worker,new Config(config,null,false),clientMap,clientID,players[0].username,null,opts.seed,players);
const bus=new EventBus();
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
  bus.on(eventExports[name],e=>{queue.push(StampedIntentSchema.parse({...convert(e),clientID}));emitted++;});
}
let timers=[],timerID=0,rng=parseInt(common.digest(opts.seed).slice(0,8),16);
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
const math=Object.create(Math);math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const win={location:{hostname:'localhost'},addEventListener(){},__OF_BENCHMARK_CONFIG__:{enabled:true,onRecord(record){
  fs.writeSync(recordsFile,JSON.stringify(record)+'\n');recordsCount++;
}}};
const context={window:win,localStorage:globalThis.localStorage,Math:math,Date:Clock,
  document:{readyState:'loading',body:null,addEventListener(){},querySelector:tag=>tag==='control-panel'?{game:view,eventBus:bus}:null},
  performance:{now:()=>now},console:{info(){},warn:(...args)=>fs.appendFileSync(path.join(dir,'warnings.log'),args.join(' ')+'\n')},
  setInterval:()=>0,clearInterval(){},setTimeout:(fn,ms=0)=>{timers.push({id:++timerID,due:now+ms,fn});return timerID;},
  clearTimeout:id=>{timers=timers.filter(t=>t.id!==id);}};
vm.runInNewContext(source,context,{timeout:5000});
const bot=win.__OF_BENCHMARK__;if(!bot)throw Error('Userscript has no loopback benchmark bridge (requires v1.10.9+)');
let started=false,spawned=false,termination='tick-limit',failure=null,finalTick=0;
const visibleSamples=[];
// Step 3: optional per-decision frame capture for real training datasets.
const planningFrames=[];
function capturePlanning(turn,me){
  if(!opts.planningFrames)return;
  if(turn%100!==0)return;
  try{
    const pf=bot?.planningFrame?.();
    if(pf)planningFrames.push(pf);
  }catch(_){/* diagnostics only; never fail the match on capture */}
}
function sampleVisible(turn,me){
  visibleTrajectory.sampleVisible(visibleSamples,turn,me,view.playerViews?.());
}
try{
  for(let turn=0;turn<opts.ticks;turn++){
    now=turn*100;
    // A bounded timer batch prevents a runaway timer from hanging a test.
    const due=timers.filter(t=>t.due<=now);timers=timers.filter(t=>t.due>now);
    if(due.length>1000)throw Error('Timer overflow');for(const task of due)await task.fn();
    const intents=queue.concat(scriptedHumanIntents(turn));queue=[];
    fs.writeSync(intentsFile,JSON.stringify({turnNumber:turn,intents},(_,v)=>typeof v==='bigint'?v.toString():v)+'\n');
    update=null;runner.addTurn({turnNumber:turn,intents});
    if(!runner.executeNextTick()||fatal||!update)throw Error(fatal||'Engine tick produced no update');
    view.update(structuredClone(update));finalTick=view.ticks();
    const winUpdate=Object.values(update.updates).flat().find(u=>u&&Object.hasOwn(u,'winner')&&Object.hasOwn(u,'allPlayersStats'));
    if(winUpdate)observedWinner=winUpdate;
    if(turn%4===0||winUpdate){await bot.pump();if(!started&&bot.status().connected){bot.start(common.profiles[opts.profile]);started=true;}}
    const me=view.myPlayer();spawned ||= !!me?.hasSpawned();
    capturePlanning(turn,me);
    if(turn%200===0||winUpdate||!me?.isAlive?.())sampleVisible(turn,me);
    if(winUpdate){termination='game-over';break;}
    if(spawned&&me&&!me.isAlive()){termination='eliminated';break;}
    if(started&&!bot.status().enabled){termination='bot-stopped';break;}
    if(turn===1000&&!spawned){termination='spawn-timeout';break;}
    if(turn%1000===0)process.stdout.write(JSON.stringify({tick:finalTick,land:me?.numTilesOwned()??0,home:me?.troops()??0,emitted})+'\n');
  }
}catch(error){failure=error.stack;termination='error';process.exitCode=1;}
finally{
  const report=bot.snapshot(),me=view.myPlayer();
  report.benchmarkMeta={...report.benchmarkMeta,...meta,gameMap:config.gameMap,gameMapSize:config.gameMapSize,gameMode:config.gameMode};
  report.run={termination,tick:finalTick,spawned,emitted,failure,recordCount:recordsCount,
    scriptedStats};
  report.recording={...report.recording,streamFile:'events.jsonl',streamCount:recordsCount,complete:recordsCount===report.recording.total&&report.recording.streamErrors===0};
  if(termination==='eliminated')report.gameEnd={outcome:'defeat',source:'engine-elimination',tick:finalTick,land:me?.numTilesOwned()??0,reason:'Player eliminated after confirmed spawn'};
  if(observedWinner){
    const winner=observedWinner.winner;
    const ids=Array.isArray(winner)?winner.slice(winner[0]==='player'?1:2):[];
    report.botReportedGameEnd=report.gameEnd;
    report.gameEnd={outcome:winner==null?'incomplete':ids.includes(me?.clientID())?'victory':'defeat',source:'engine-WinUpdate',tick:finalTick,land:me?.numTilesOwned()??0};
  }
  report.engineWinner=observedWinner?.winner??null;
  if(planningFrames.length)report.planningFrames=planningFrames;
  if(visibleSamples.length)report.trajectory=visibleTrajectory.trajectory(visibleSamples);
  report.finalState={tick:finalTick,land:me?.numTilesOwned()??0,alive:me?.isAlive()??null,gold:String(me?.gold()??0),
    units:me?.units().map(u=>({type:u.type(),id:u.id()}))??[]};
  common.writeJSON(path.join(dir,'match.json'),report);
  fs.closeSync(recordsFile);fs.closeSync(intentsFile);
  console.log(JSON.stringify({output:dir,termination,outcome:report.gameEnd?.outcome??'unknown',land:report.finalState.land,failure}));
}
