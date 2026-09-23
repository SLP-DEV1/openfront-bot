#!/usr/bin/env node
'use strict';
// Reconstruct a selected player's GameView from an original OpenFront GameRecord
// on the exact official engine commit. This is the ONLY raw-replay path allowed
// to emit openfront-visible-gameview-v1 learning input.
//
// Safety/provenance contract:
//  * exact clean engine checkout required;
//  * archived record gitCommit must equal that checkout;
//  * every archived hash anchor must be recomputed and match;
//  * observations are captured from GameView immediately BEFORE the selected
//    player's archived intent turn is executed (decision-time view);
//  * no Engine Game/player object is used to build visibleState;
//  * human output requires explicit usage-rights text.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import common from './common.cjs';

function parseArgs(argv){
  const o={input:null,out:null,engine:null,engineCommit:null,clientID:null,
    usageRights:null,teams:null};
  for(let i=0;i<argv.length;i++){
    const raw=argv[i],key=raw.replace(/^--/,'');
    if(!raw.startsWith('--')||!Object.hasOwn(o,key))throw Error('Unknown option '+raw);
    const value=argv[++i];if(value==null||value.startsWith('--'))throw Error('Missing '+key);
    o[key]=value;
  }
  if(!o.input||!o.out||!o.engine||!o.engineCommit||!o.clientID||!o.usageRights)
    throw Error('Usage: --input RAW.json --out VISIBLE.json --engine /OpenFrontIO --engineCommit FULL_SHA --clientID ID --usageRights TEXT [--teams 0,1,...]');
  if(!/^[a-f0-9]{40}$/i.test(o.engineCommit))throw Error('Exact 40-hex --engineCommit required');
  o.input=path.resolve(o.input);o.out=path.resolve(o.out);o.engine=path.resolve(o.engine);
  if(o.input===o.out||fs.existsSync(o.out))throw Error('Refuse overwrite of replay input/output');
  return o;
}
const num=x=>typeof x==='bigint'?Number(x):Number(x??0);
function visibleFrame(view,turn,engineCommit,matchId,intents){
  const me=view.myPlayer?.();
  if(!me?.hasSpawned?.()||!me?.isAlive?.())return null;
  const incoming=(me.incomingAttacks?.()||[])
    .filter(a=>!a.retreating).reduce((s,a)=>s+Math.max(0,num(a.troops)),0);
  const committed=(me.outgoingAttacks?.()||[])
    .filter(a=>!a.retreating).reduce((s,a)=>s+Math.max(0,num(a.troops)),0);
  const types=intents.map(i=>String(i.type)).sort();
  return {
    source:'GameView',observation:'pre-action-player-view',
    engineCommit,matchId,tick:turn.turnNumber,
    visibleState:{
      home:Math.max(0,num(me.troops?.())),
      gold:Math.max(0,num(me.gold?.())),
      land:Math.max(0,num(me.numTilesOwned?.())),
      incoming,committed
    },
    action:{type:types.length===1?types[0]:'multi-intent',
      intentTypes:types,intentCount:types.length},
    outcome:null
  };
}
async function main(argv=process.argv.slice(2)){
  const o=parseArgs(argv);
  const engineCommit=common.engineInfo(o.engine,o.engineCommit);
  const requireEngine=createRequire(path.join(o.engine,'package.json'));
  requireEngine('tsx/esm/api').register({tsconfig:path.join(o.engine,'tsconfig.json')});
  const mod=p=>import(pathToFileURL(path.join(o.engine,p)).href);
  const [{Config},{Executor},{PlayerInfo,PlayerType},{GameUpdateType},
    {createGame},{createNationsForGame},{loadTerrainMap},{GameRunner},
    {PseudoRandom},{GameRecordSchema},{GameView},{NodeGameMapLoader},util]=await Promise.all([
      mod('src/core/configuration/Config.ts'),
      mod('src/core/execution/ExecutionManager.ts'),
      mod('src/core/game/Game.ts'),
      mod('src/core/game/GameUpdates.ts'),
      mod('src/core/game/GameImpl.ts'),
      mod('src/core/game/NationCreation.ts'),
      mod('src/core/game/TerrainMapLoader.ts'),
      mod('src/core/GameRunner.ts'),
      mod('src/core/PseudoRandom.ts'),
      mod('src/core/Schemas.ts'),
      mod('src/client/view/GameView.ts'),
      mod('tests/perf/fullgame/NodeGameMapLoader.ts'),
      mod('src/core/Util.ts')
    ]);
  const raw=JSON.parse(fs.readFileSync(o.input,'utf8'));
  const parsed=GameRecordSchema.safeParse(raw);
  const archived=parsed.success?parsed.data:raw;
  const record=util.decompressGameRecord(archived);
  if(record?.gitCommit?.toLowerCase()!==engineCommit.toLowerCase())
    throw Error('Raw replay exact engine commit mismatch');
  const info=record.info;
  if(!info||!Array.isArray(info.players)||!Array.isArray(record.turns))
    throw Error('Invalid GameRecord');
  let players=info.players;
  if(o.teams){
    const teams=o.teams.split(',').map(v=>Number.parseInt(v,10));
    if(teams.length!==players.length||teams.some(Number.isNaN))
      throw Error('--teams must provide one integer per player');
    players=players.map((p,i)=>({...p,teamIndex:teams[i]}));
  }
  const selected=players.find(p=>p.clientID===o.clientID);
  if(!selected)throw Error('Selected clientID not present in GameRecord');
  const gameStart=util.toWireGameStartInfo({
    gameID:info.gameID,lobbyCreatedAt:info.lobbyCreatedAt,
    config:info.config,players,tribes:info.tribes
  });
  const config=new Config(info.config,null,false);
  const loader=new NodeGameMapLoader(path.join(o.engine,'resources/maps'));
  const terrain=await loadTerrainMap(info.config.gameMap,info.config.gameMapSize,loader,false);
  const random=new PseudoRandom(util.simpleHash(gameStart.gameID));
  const humans=gameStart.players.map(p=>new PlayerInfo(
    p.username,PlayerType.Human,p.clientID,random.nextID(),
    p.isLobbyCreator??false,p.clanTag,p.friends??[],p.teamIndex??null));
  const nations=createNationsForGame(gameStart,terrain.nations,
    terrain.additionalNations,humans.length,random);
  const game=createGame(humans,nations,terrain.gameMap,terrain.miniGameMap,
    config,terrain.teamGameSpawnAreas);
  let update=null,fatal=null;
  const computedHashes=new Map();
  const runner=new GameRunner(game,new Executor(game,gameStart.gameID,o.clientID,
    gameStart.tribes?.map(t=>t.name)),gu=>{
      if('errMsg' in gu){fatal=String(gu.errMsg);return;}
      update=gu;
      for(const hu of gu.updates?.[GameUpdateType.Hash]??[])
        computedHashes.set(hu.tick,hu.hash);
    });
  runner.init();
  const worker={
    playerInteraction:async(...args)=>structuredClone(runner.playerActions(...args)),
    playerBuildables:async(...args)=>structuredClone(runner.playerBuildables(...args)),
    playerBorderTiles:async(...args)=>structuredClone(runner.playerBorderTiles(...args)),
    attackClusteredPositions:async(...args)=>structuredClone(runner.attackClusteredPositions(...args)),
    bestTransportShipSpawn:async(...args)=>runner.bestTransportShipSpawn(...args)
  };
  // GameView reads graphics preferences even headlessly.
  const storage=new Map();
  globalThis.localStorage={getItem:k=>storage.get(k)??null,
    setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const view=new GameView(worker,config,terrain,o.clientID,selected.username,
    selected.clanTag??null,info.gameID,players);
  const recordedHashes=new Map(record.turns
    .filter(t=>t.hash!==null&&t.hash!==undefined)
    .map(t=>[t.turnNumber,t.hash]));
  if(!recordedHashes.size)throw Error('Raw replay has no independent hash anchors');
  const frames=[];let compared=0,matches=0,firstMismatch=null;
  for(const turn of record.turns){
    const ownIntents=(turn.intents||[]).filter(i=>i.clientID===o.clientID);
    if(ownIntents.length){
      const frame=visibleFrame(view,turn,engineCommit,info.gameID,ownIntents);
      if(frame)frames.push(frame);
    }
    update=null;fatal=null;
    runner.addTurn(turn);
    if(!runner.executeNextTick()||fatal||!update)
      throw Error('Replay engine tick failed at '+turn.turnNumber+': '+(fatal||'no update'));
    view.update(structuredClone(update));
    const recorded=recordedHashes.get(turn.turnNumber);
    if(recorded!==undefined){
      const computed=computedHashes.get(turn.turnNumber);
      if(computed===undefined)throw Error('Missing recomputed hash at '+turn.turnNumber);
      compared++;
      if(computed===recorded)matches++;
      else if(firstMismatch===null)firstMismatch=turn.turnNumber;
    }
  }
  if(compared!==recordedHashes.size||matches!==recordedHashes.size||firstMismatch!==null)
    throw Error('Replay hash verification failed'+
      (firstMismatch===null?'':'; first mismatch '+firstMismatch));
  if(!frames.length)throw Error('Selected player produced no reconstructable decision frames');
  const output={
    format:'openfront-visible-gameview-v1',complete:true,
    visibility:'player-view',engineCommit,matchId:info.gameID,
    origin:'human-replay',
    provenance:'gameID='+info.gameID+';clientID='+o.clientID+
      ';engineHashes='+matches+'/'+recordedHashes.size+
      ';observation=pre-action-GameView',
    usageRights:o.usageRights,
    verification:{engineHashesVerified:true,hashAnchors:recordedHashes.size,
      hashMatches:matches,selectedClientID:o.clientID,
      officialReplayHarnessSemantics:'OpenFront GameRunner + GameView'},
    frames
  };
  fs.writeFileSync(o.out,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({out:o.out,matchId:info.gameID,clientID:o.clientID,
    frames:frames.length,hashAnchors:recordedHashes.size,hashMatches:matches}));
  return output;
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)
  main().catch(e=>{console.error('Replay reconstruction: '+e.message);process.exit(1);});
export {parseArgs,visibleFrame,main};
