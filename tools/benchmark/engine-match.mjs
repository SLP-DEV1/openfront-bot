// Real OpenFront engine + GameView benchmark. No network opponents or mocked battles.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import common from './common.cjs';

const opts=common.parse(process.argv.slice(2));
const engineCommit=common.engineInfo(opts.engine,opts.engineCommit);
const requireEngine=createRequire(path.join(opts.engine,'package.json'));
requireEngine('tsx/esm/api').register({tsconfig:path.join(opts.engine,'tsconfig.json')});
const mod=p=>import(pathToFileURL(path.join(opts.engine,p)).href);
// Upstream GameView reads preferences. No auth, account or real browser storage.
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const [{createGameRunner},{Config},{GameMapType,GameMapSize,Difficulty,GameType,GameMode},
 {GameView},{loadTerrainMap},{NodeGameMapLoader},{EventBus},{GameConfigSchema,StampedIntentSchema}]=await Promise.all([
  mod('src/core/GameRunner.ts'),mod('src/core/configuration/Config.ts'),mod('src/core/game/Game.ts'),
  mod('src/client/view/GameView.ts'),mod('src/core/game/TerrainMapLoader.ts'),
  mod('tests/perf/fullgame/NodeGameMapLoader.ts'),mod('src/core/EventBus.ts'),mod('src/core/Schemas.ts')]);
const resolve=(values,input)=>{const key=Object.keys(values).find(k=>k.toLowerCase()===input.toLowerCase());if(!key)throw Error('Unknown enum '+input);return values[key];};
const config=GameConfigSchema.parse({gameMap:resolve(GameMapType,opts.map),gameMapSize:resolve(GameMapSize,opts.size),
  gameMode:GameMode.FFA,gameType:GameType.Singleplayer,difficulty:resolve(Difficulty,opts.difficulty),
  nations:opts.nations===0?'disabled':opts.nations,bots:opts.bots,donateGold:false,donateTroops:false,
  infiniteGold:false,infiniteTroops:false,instantBuild:false,randomSpawn:false});
const dir=common.outputDir(opts),source=fs.readFileSync(opts.bot,'utf8');
const clientID='aggrobot',players=[{clientID,username:'AggroBot Benchmark',clanTag:null}];
const start={gameID:opts.seed,lobbyCreatedAt:0,players,config};
const loader=new NodeGameMapLoader(path.join(opts.engine,'resources/maps'));
let update=null,fatal=null,now=0,queue=[],observedWinner=null;
const recordsFile=fs.openSync(path.join(dir,'events.jsonl'),'wx');
const intentsFile=fs.openSync(path.join(dir,'turns.jsonl'),'wx');
let recordsCount=0,emitted=0;
const meta={harness:'engine-gameview-v1',engineCommit,botSHA256:common.digest(source),seed:opts.seed,
  seedSource:'GameStartInfo.gameID',profile:opts.profile,settings:common.profiles[opts.profile],
  gameConfig:config,maxTicks:opts.ticks,clock:'100ms simulation clock; serial awaited bot cycles',
  worker:'real GameRunner queries via async in-process adapter',browser:false};
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
try{
  for(let turn=0;turn<opts.ticks;turn++){
    now=turn*100;
    // A bounded timer batch prevents a runaway timer from hanging a test.
    const due=timers.filter(t=>t.due<=now);timers=timers.filter(t=>t.due>now);
    if(due.length>1000)throw Error('Timer overflow');for(const task of due)await task.fn();
    const intents=queue;queue=[];
    fs.writeSync(intentsFile,JSON.stringify({turnNumber:turn,intents},(_,v)=>typeof v==='bigint'?v.toString():v)+'\n');
    update=null;runner.addTurn({turnNumber:turn,intents});
    if(!runner.executeNextTick()||fatal||!update)throw Error(fatal||'Engine tick produced no update');
    view.update(structuredClone(update));finalTick=view.ticks();
    const winUpdate=Object.values(update.updates).flat().find(u=>u&&Object.hasOwn(u,'winner')&&Object.hasOwn(u,'allPlayersStats'));
    if(winUpdate)observedWinner=winUpdate;
    if(turn%4===0||winUpdate){await bot.pump();if(!started&&bot.status().connected){bot.start(common.profiles[opts.profile]);started=true;}}
    const me=view.myPlayer();spawned ||= !!me?.hasSpawned();
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
  report.run={termination,tick:finalTick,spawned,emitted,failure,recordCount:recordsCount};
  report.recording={...report.recording,streamFile:'events.jsonl',streamCount:recordsCount,complete:recordsCount===report.recording.total&&report.recording.streamErrors===0};
  if(termination==='eliminated')report.gameEnd={outcome:'defeat',source:'engine-elimination',tick:finalTick,land:me?.numTilesOwned()??0,reason:'Player eliminated after confirmed spawn'};
  if(observedWinner){
    const winner=observedWinner.winner;
    const ids=Array.isArray(winner)?winner.slice(winner[0]==='player'?1:2):[];
    report.botReportedGameEnd=report.gameEnd;
    report.gameEnd={outcome:winner==null?'incomplete':ids.includes(me?.clientID())?'victory':'defeat',source:'engine-WinUpdate',tick:finalTick,land:me?.numTilesOwned()??0};
  }
  report.engineWinner=observedWinner?.winner??null;
  report.finalState={tick:finalTick,land:me?.numTilesOwned()??0,alive:me?.isAlive()??null,gold:String(me?.gold()??0),
    units:me?.units().map(u=>({type:u.type(),id:u.id()}))??[]};
  common.writeJSON(path.join(dir,'match.json'),report);
  fs.closeSync(recordsFile);fs.closeSync(intentsFile);
  console.log(JSON.stringify({output:dir,termination,outcome:report.gameEnd?.outcome??'unknown',land:report.finalState.land,failure}));
}
