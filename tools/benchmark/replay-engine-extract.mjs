#!/usr/bin/env node
// Exact OpenFront engine reconstruction of a raw archived GameRecord into one
// selected player's real GameView decision states. Hash drift fails closed.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import common from './common.cjs';
const requireLocal=createRequire(import.meta.url);
const core=requireLocal('./replay-engine-extract-core.cjs');

const argv=process.argv.slice(2),opts={input:null,out:null,engine:null,
  engineCommit:null,clientID:null,origin:'human-replay',provenance:null,
  usageRights:null};
for(let i=0;i<argv.length;i++){
  const k=argv[i];if(!k.startsWith('--')||!Object.hasOwn(opts,k.slice(2)))
    throw Error('Unknown option '+k);
  const v=argv[++i];if(!v||v.startsWith('--'))throw Error('Missing '+k);
  opts[k.slice(2)]=v;
}
for(const k of ['input','out','engine','engineCommit','clientID'])
  if(!opts[k])throw Error('Missing --'+k);
if(opts.origin==='human-replay'&&(!opts.provenance||!opts.usageRights))
  throw Error('Human replay extraction requires --provenance and --usageRights');
const engineCommit=common.engineInfo(opts.engine,opts.engineCommit);
const raw=JSON.parse(fs.readFileSync(path.resolve(opts.input),'utf8'));
if(String(raw.gitCommit||'').toLowerCase()!==engineCommit.toLowerCase())
  throw Error('Raw replay exact engine commit mismatch');

const requireEngine=createRequire(path.join(path.resolve(opts.engine),'package.json'));
requireEngine('tsx/esm/api').register({tsconfig:path.join(path.resolve(opts.engine),'tsconfig.json')});
const mod=p=>import(pathToFileURL(path.join(path.resolve(opts.engine),p)).href);
const [{createGameRunner},{Config},{GameView},{loadTerrainMap},{NodeGameMapLoader},
  schemas,util,updates]=await Promise.all([
  mod('src/core/GameRunner.ts'),mod('src/core/configuration/Config.ts'),
  mod('src/client/view/GameView.ts'),mod('src/core/game/TerrainMapLoader.ts'),
  mod('tests/perf/fullgame/NodeGameMapLoader.ts'),
  mod('src/core/Schemas.ts'),mod('src/core/Util.ts'),mod('src/core/game/GameUpdates.ts')]);
const record=util.decompressGameRecord(schemas.GameRecordSchema.parse(raw));
const info=record.info,player=info.players.find(p=>p.clientID===opts.clientID);
if(!player)throw Error('Selected clientID is not present in replay players');
const start=util.toWireGameStartInfo({gameID:info.gameID,
  lobbyCreatedAt:info.lobbyCreatedAt,config:info.config,players:info.players,
  tribes:info.tribes});
const loader=new NodeGameMapLoader(path.join(path.resolve(opts.engine),'resources/maps'));
let update=null,fatal=null;
const runner=await createGameRunner(start,opts.clientID,loader,gu=>{
  if('errMsg' in gu)fatal=gu.errMsg;else update=gu;
});
const map=await loadTerrainMap(info.config.gameMap,info.config.gameMapSize,loader,false);
const worker={playerInteraction:async(...a)=>structuredClone(runner.playerActions(...a)),
  playerBuildables:async(...a)=>structuredClone(runner.playerBuildables(...a)),
  playerBorderTiles:async(...a)=>structuredClone(runner.playerBorderTiles(...a)),
  attackClusteredPositions:async(...a)=>structuredClone(runner.attackClusteredPositions(...a)),
  bestTransportShipSpawn:async(...a)=>runner.bestTransportShipSpawn(...a)};
const view=new GameView(worker,new Config(info.config,null,false),map,
  opts.clientID,player.username,player.clanTag??null,info.gameID,info.players);
const meta={engineCommit,matchId:info.gameID,clientID:opts.clientID};
const frames=[],hashAudit=[];let initialized=false,skippedBeforeView=0;
for(const turn of record.turns){
  const own=(turn.intents||[]).filter(i=>i.clientID===opts.clientID)
    .map(core.actionFromIntent).filter(Boolean);
  if(own.length){
    if(initialized){
      const f=core.frameFor(view,meta,turn.turnNumber,
        {...turn.intents.find(i=>i.clientID===opts.clientID&&core.actionFromIntent(i)),
          type:own[0].type});
      if(f){f.action={...own[0],allIntents:own};frames.push(f);}
    }else skippedBeforeView+=own.length;
  }
  update=null;fatal=null;runner.addTurn(turn);
  if(!runner.executeNextTick()||fatal||!update)
    throw Error('Replay engine failed at turn '+turn.turnNumber+': '+(fatal||'no update'));
  view.update(structuredClone(update));initialized=true;
  if(turn.hash!=null){
    const rows=update.updates?.[updates.GameUpdateType.Hash]||[];
    const found=rows.find(x=>x.tick===turn.turnNumber)?.hash;
    const ok=found===turn.hash;
    hashAudit.push({turn:turn.turnNumber,recorded:turn.hash,computed:found,ok});
    if(!ok)throw Error('Replay hash mismatch at turn '+turn.turnNumber);
  }
}
if(!hashAudit.length)throw Error('Raw replay has no hash checkpoints');
if(!frames.length)throw Error('No supported selected-player decisions with an initialized GameView');
const output={format:'openfront-visible-gameview-v1',complete:true,
  visibility:'player-view',engineCommit,matchId:info.gameID,
  origin:opts.origin,provenance:opts.provenance,usageRights:opts.usageRights,
  selectedClientID:opts.clientID,engineHashesVerified:true,
  hashCheckpoints:hashAudit.length,skippedBeforeView,frames,
  extraction:'official-engine-replay + selected GameView before archived action turn'};
const dst=path.resolve(opts.out);
if(path.resolve(opts.input)===dst||fs.existsSync(dst))throw Error('Refuse replay overwrite');
fs.writeFileSync(dst,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out:dst,frames:frames.length,
  hashCheckpoints:hashAudit.length,engineHashesVerified:true}));
