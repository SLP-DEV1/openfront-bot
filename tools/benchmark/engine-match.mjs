// Real OpenFront engine + GameView benchmark. No network opponents or mocked battles.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import common from './common.cjs';
import policyModel from '../../trainer/policy.cjs';
import actionModel from '../../trainer/action-policy.cjs';
import strategicModel from '../../trainer/strategic-policy.cjs';
import strategicModelV4 from '../../trainer/strategic-policy-v4.cjs';

const opts=common.parse(process.argv.slice(2));
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
const config=GameConfigSchema.parse({gameMap:resolve(GameMapType,opts.map),gameMapSize:resolve(GameMapSize,opts.size),
  gameMode:GameMode.FFA,gameType:GameType.Singleplayer,difficulty:resolve(Difficulty,opts.difficulty),
  nations:opts.nations===0?'disabled':opts.nations,bots:opts.bots,donateGold:false,donateTroops:false,
  infiniteGold:false,infiniteTroops:false,instantBuild:false,randomSpawn:false});
const dir=common.outputDir(opts),source=fs.readFileSync(opts.bot,'utf8');
const rivalStyles=opts.rivals==='none'?[]:opts.rivals.split(',');
const clientID='aggrobot',players=[{clientID,username:'AggroBot Benchmark',clanTag:null},
  ...rivalStyles.map((style,i)=>({clientID:'local-rival-'+i,
    username:'Scripted '+style+' '+(i+1),clanTag:null}))];
const start={gameID:opts.seed,lobbyCreatedAt:0,players,config};
const loader=new NodeGameMapLoader(path.join(opts.engine,'resources/maps'));
let update=null,fatal=null,now=0,queue=[],observedWinner=null;
const recordsFile=fs.openSync(path.join(dir,'events.jsonl'),'wx');
const intentsFile=fs.openSync(path.join(dir,'turns.jsonl'),'wx');
let recordsCount=0,emitted=0;
const meta={harness:'engine-gameview-v1',engineCommit,botSHA256:common.digest(source),policySHA256:policyHash,seed:opts.seed,
  seedSource:'GameStartInfo.gameID',profile:opts.profile,settings:common.profiles[opts.profile],
  gameConfig:config,scriptedRivals:rivalStyles,
  opponentKind:rivalStyles.length?'scripted local GameView clients (not human players)':'native game opponents',
  maxTicks:opts.ticks,clock:'100ms simulation clock; serial awaited bot cycles',
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
const rivals=rivalStyles.map((style,i)=>({style,clientID:players[i+1].clientID,
  view:new GameView(worker,new Config(config,null,false),clientMap,
    players[i+1].clientID,players[i+1].username,null,opts.seed,players),
  lastAction:-Infinity}));
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
let scriptedSpawnQueued=false,scriptedIntents=0;
const scriptedSpawnTiles=[];
const pushScripted=(clientID,intent)=>{
  queue.push(StampedIntentSchema.parse({...intent,clientID}));scriptedIntents++;
};
// Spawn every scripted client in the SAME official turn as the bot's first
// spawn. Singleplayer ends its spawn phase after the first human spawn.
function queueRivalSpawns(){
  if(scriptedSpawnQueued||!rivals.length)return;
  const own=queue.find(intent=>intent.clientID===clientID&&intent.type==='spawn');
  if(!own)return;
  const taken=[own.tile],w=view.width(),h=view.height();
  const margin=Math.min(24,Math.floor(Math.min(w,h)/8));
  const stride=Math.max(6,Math.floor(Math.min(w,h)/52));
  const distance=(a,b)=>Math.hypot(view.x(a)-view.x(b),view.y(a)-view.y(b));
  for(const rival of rivals){
    let best=null,score=-Infinity;
    for(let y=margin;y<h-margin;y+=stride)for(let x=margin;x<w-margin;x+=stride){
      const tile=view.ref(x,y);
      if(!view.isLand(tile)||view.isImpassable?.(tile)||view.owner(tile)?.isPlayer?.())continue;
      const minDist=Math.min(...taken.map(ref=>distance(tile,ref)));
      if(minDist>score){score=minDist;best=tile;}
    }
    if(best===null)throw Error('No legal-looking scripted spawn candidate');
    pushScripted(rival.clientID,{type:'spawn',tile:best});
    taken.push(best);scriptedSpawnTiles.push({style:rival.style,tile:best});
  }
  scriptedSpawnQueued=true;
}
const num=(fn,fallback=0)=>{try{const n=Number(fn());return Number.isFinite(n)?n:fallback;}catch(_){return fallback;}};
async function scriptedStep(turn){
  // Only GameView + official Worker queries are used for rival choices;
  // all intents pass the same stamped engine validation as the main bot.
  for(let i=0;i<rivals.length;i++){
    const rival=rivals[i],v=rival.view,me=v.myPlayer();
    if(!me?.hasSpawned?.()||!me.isAlive?.()||turn-rival.lastAction<22)continue;
    const home=num(()=>me.troops()),gold=num(()=>me.gold());
    if(home<1000)continue;
    const incoming=(me.incomingAttacks?.()||[]).filter(a=>!a.retreating)
      .reduce((n,a)=>n+num(()=>a.troops),0);
    const own=(me.units?.()||[]).filter(u=>u.isActive?.());
    const type=rival.style==='economy'?'Factory':rival.style==='defense'?'Defense Post':null;
    if(type && gold>=150000 && turn%120<22 &&
      own.filter(u=>u.type?.()===type).length<(rival.style==='economy'?5:4)){
      const origin=me.state?.spawnTile;
      if(Number.isInteger(origin)){
        const x=v.x(origin),y=v.y(origin);
        for(const radius of [18,30,45,60]){
          let built=false;
          for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
            const xx=x+dx*radius,yy=y+dy*radius;
            if(xx<0||yy<0||xx>=v.width()||yy>=v.height())continue;
            const tile=v.ref(xx,yy);
            if(v.owner(tile)?.id?.()!==me.id())continue;
            const legal=await me.actions(tile,[type]);
            const option=legal?.buildableUnits?.find(u=>u.type===type&&
              Number.isInteger(u.canBuild)&&Number(u.cost)<=gold);
            if(!option)continue;
            pushScripted(rival.clientID,{type:'build_unit',unit:type,tile});
            rival.lastAction=turn;built=true;break;
          }
          if(built)return;
        }
      }
    }
    const outgoing=(me.outgoingAttacks?.()||[]).filter(a=>!a.retreating);
    if(outgoing.length>=2 || incoming>home*.45)continue;
    const border=await me.borderTiles?.();
    const tiles=border?.borderTiles||[];
    const candidates=[];
    for(const tile of tiles.slice(0,160)){
      const nearby=[];
      const count=v.neighbors4(tile,nearby);
      for(let k=0;k<count;k++){
        const ref=nearby[k];
        if(!v.isLand(ref)||v.isImpassable?.(ref)||v.hasFallout?.(ref))continue;
        const owner=v.owner(ref);
        if(owner?.id?.()===me.id()||owner&&!owner.isPlayer?.())continue;
        const id=owner?.id?.()??null;
        if(id!==null && (me.isFriendly?.(owner)||
          (me.outgoingAttacks?.()||[]).some(a=>a.targetID===id&&!a.retreating)))continue;
        candidates.push({tile:ref,owner,id});
        if(candidates.length>=16)break;
      }
      if(candidates.length>=16)break;
    }
    const desire=rival.style==='rush'?.40:rival.style==='economy'?.16:
      rival.style==='defense'?.13:.26;
    for(const target of candidates){
      if(target.id!==null){
        const their=num(()=>target.owner.troops(),Infinity);
        const ratio=rival.style==='rush'?1.35:rival.style==='opportunist'?1.15:2.1;
        if(home<their*ratio||incoming>0)continue;
      }
      const legal=await me.actions(target.tile,[]);
      if(!legal?.canAttack)continue;
      const amount=Math.floor(Math.min(home*desire,
        home*(target.id===null?.25:.45),
        Math.max(0,home-Math.max(1500,incoming*1.6))));
      if(amount<100)continue;
      pushScripted(rival.clientID,{type:'attack',targetID:target.id,troops:amount});
      rival.lastAction=turn;break;
    }
  }
}
const visibleSamples=[];
function sampleVisible(turn,me){
  if(!me?.hasSpawned?.())return;
  const num=fn=>{try{const v=Number(fn());return Number.isFinite(v)?v:0;}catch(_){return 0;}};
  const enemies=(view.playerViews?.()||[]).filter(p=>p?.clientID?.()!==me?.clientID?.()&&p?.isAlive?.());
  const snapshot={tick:turn,land:num(()=>me.numTilesOwned()),home:num(()=>me.troops()),
    gold:num(()=>me.gold()),enemyLand:enemies.reduce((v,p)=>v+num(()=>p.numTilesOwned()),0),
    enemyTroops:enemies.reduce((v,p)=>v+num(()=>p.troops()),0)};
  if(visibleSamples.at(-1)?.tick!==turn)visibleSamples.push(snapshot);
}
try{
  for(let turn=0;turn<opts.ticks;turn++){
    now=turn*100;
    // A bounded timer batch prevents a runaway timer from hanging a test.
    const due=timers.filter(t=>t.due<=now);timers=timers.filter(t=>t.due>now);
    if(due.length>1000)throw Error('Timer overflow');for(const task of due)await task.fn();
    queueRivalSpawns();
    const intents=queue;queue=[];
    fs.writeSync(intentsFile,JSON.stringify({turnNumber:turn,intents},(_,v)=>typeof v==='bigint'?v.toString():v)+'\n');
    update=null;runner.addTurn({turnNumber:turn,intents});
    if(!runner.executeNextTick()||fatal||!update)throw Error(fatal||'Engine tick produced no update');
    view.update(structuredClone(update));
    for(const rival of rivals)rival.view.update(structuredClone(update));
    finalTick=view.ticks();
    const winUpdate=Object.values(update.updates).flat().find(u=>u&&Object.hasOwn(u,'winner')&&Object.hasOwn(u,'allPlayersStats'));
    if(winUpdate)observedWinner=winUpdate;
    if(turn%4===0||winUpdate){await bot.pump();if(!started&&bot.status().connected){bot.start(common.profiles[opts.profile]);started=true;}}
    if(started&&turn%12===0&&rivals.length)await scriptedStep(turn);
    const me=view.myPlayer();spawned ||= !!me?.hasSpawned();
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
    scriptedIntents,scriptedSpawnQueued,scriptedSpawnTiles,
    scriptedAlive:rivals.map(r=>({style:r.style,spawned:!!r.view.myPlayer()?.hasSpawned?.(),
      alive:r.view.myPlayer()?.isAlive?.()??null}))};
  report.recording={...report.recording,streamFile:'events.jsonl',streamCount:recordsCount,complete:recordsCount===report.recording.total&&report.recording.streamErrors===0};
  if(termination==='eliminated')report.gameEnd={outcome:'defeat',source:'engine-elimination',tick:finalTick,land:me?.numTilesOwned()??0,reason:'Player eliminated after confirmed spawn'};
  if(observedWinner){
    const winner=observedWinner.winner;
    const ids=Array.isArray(winner)?winner.slice(winner[0]==='player'?1:2):[];
    report.botReportedGameEnd=report.gameEnd;
    report.gameEnd={outcome:winner==null?'incomplete':ids.includes(me?.clientID())?'victory':'defeat',source:'engine-WinUpdate',tick:finalTick,land:me?.numTilesOwned()??0};
  }
  report.engineWinner=observedWinner?.winner??null;
  if(visibleSamples.length){
    const xs=visibleSamples,peakLand=Math.max(...xs.map(x=>x.land));
    const mean=key=>xs.reduce((v,x)=>v+x[key],0)/xs.length;
    const end=xs.at(-1),start=xs[0];
    report.trajectory={source:'bot GameView visible samples, every 200 engine ticks',
      samples:xs,summary:{peakLand,meanLand:mean('land'),
        endLand:end.land,firstLand:start.land,landChange:end.land-start.land,
        retention:peakLand>0?end.land/peakLand:0,
        peakHome:Math.max(...xs.map(x=>x.home)),
        meanHome:mean('home'),meanEnemyLand:mean('enemyLand'),
        finalEnemyLand:end.enemyLand,sampleCount:xs.length}};
  }
  report.finalState={tick:finalTick,land:me?.numTilesOwned()??0,alive:me?.isAlive()??null,gold:String(me?.gold()??0),
    units:me?.units().map(u=>({type:u.type(),id:u.id()}))??[]};
  common.writeJSON(path.join(dir,'match.json'),report);
  fs.closeSync(recordsFile);fs.closeSync(intentsFile);
  console.log(JSON.stringify({output:dir,termination,outcome:report.gameEnd?.outcome??'unknown',land:report.finalState.land,failure}));
}
