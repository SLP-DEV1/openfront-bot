#!/usr/bin/env node
'use strict';
// Raw public GameRecord preflight. A turn archive is NOT a player GameView and
// must never be presented as visible-state learning evidence.
const fs=require('node:fs');
const HEX=/^[a-f0-9]{40}$/i;
function audit(record,expectedEngine){
  if(!HEX.test(expectedEngine??'')||!HEX.test(record?.gitCommit??'')||
     record.gitCommit.toLowerCase()!==expectedEngine.toLowerCase())
    throw Error('Raw replay exact engine commit mismatch');
  if(record.version!=='v0.0.2'||!record.info||
     typeof record.info.gameID!=='string'||!record.info.gameID.trim()||
     !record.info.config||!Array.isArray(record.info.players)||
     !Number.isSafeInteger(record.info.num_turns)||
     record.info.num_turns<1||!Array.isArray(record.turns)||
     !record.turns.length)
    throw Error('Invalid/incomplete raw GameRecord schema');
  let previous=-1,hashAnchors=0,totalIntents=0,missingTurns=0;
  const unlistedActors=new Set();
  const clientIDs=new Set(record.info.players.map(p=>p.clientID));
  if(clientIDs.has(undefined)||clientIDs.size!==record.info.players.length)
    throw Error('Invalid/duplicate GameRecord clientID');
  for(const [i,turn] of record.turns.entries()){
    if(!Number.isSafeInteger(turn?.turnNumber)||
       turn.turnNumber<=previous||turn.turnNumber>=record.info.num_turns||
       !Array.isArray(turn.intents))
      throw Error('Raw replay turns out of order or invalid at index '+i);
    missingTurns+=turn.turnNumber-previous-1;
    previous=turn.turnNumber;
    if(turn.hash!=null){
      if(!Number.isSafeInteger(turn.hash)||turn.hash<0)
        throw Error('Raw replay invalid recorded hash at '+turn.turnNumber);
      hashAnchors++;
    }
    for(const intent of turn.intents){
      if(!intent||typeof intent.type!=='string'||!intent.type||
         typeof intent.clientID!=='string'||!intent.clientID.trim())
        throw Error('Raw replay intent identity invalid at '+turn.turnNumber);
      if(!clientIDs.has(intent.clientID))unlistedActors.add(intent.clientID);
      totalIntents++;
    }
  }
  missingTurns+=record.info.num_turns-1-previous;
  if(hashAnchors===0)throw Error('Raw replay has no independent hash anchors');
  return {schema:'raw-game-record-preflight-v1',matchId:record.info.gameID,
    engineCommit:expectedEngine.toLowerCase(),
    archiveVersion:record.version,declaredTicks:record.info.num_turns,
    recordedTurns:record.turns.length,omittedTurns:missingTurns,
    hashAnchors,totalIntents,participantCount:clientIDs.size,
    unlistedActorCount:unlistedActors.size,
    visibility:'omniscient-raw-turns-not-player-GameView',
    engineHashesVerified:false,visibleLearningPairs:0,
    status:'structurally-validated-only',
    identityWarning:unlistedActors.size?'Some archived intents use client IDs absent from info.players; player-level reconstruction requires independent verification':null,
    next:'Re-run exact official engine, verify per-turn hashes, reconstruct the selected player GameView and audit actions before allowing training'};
}
function main(argv=process.argv.slice(2)){
  const arg=(flag)=>{const i=argv.indexOf(flag);return i>=0?argv[i+1]:null;};
  const file=arg('--input'),engine=arg('--engineCommit');
  if(!file||!engine||argv.length!==4)
    throw Error('Usage: --input RAW.json --engineCommit EXACT_40_HEX_SHA');
  const report=audit(JSON.parse(fs.readFileSync(file,'utf8')),engine);
  console.log(JSON.stringify(report,null,2));
}
if(require.main===module){
  try{main();}catch(e){console.error('Replay preflight: '+e.message);process.exitCode=1;}
}
module.exports={audit,main};
