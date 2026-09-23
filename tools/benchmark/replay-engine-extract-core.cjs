'use strict';
// Pure helpers for exact-engine raw replay -> selected GameView extraction.
const SUPPORTED=new Set(['attack','boat','build_unit','upgrade_structure',
  'cancel_attack','cancel_boat','move_warship','donate_troops','donate_gold',
  'allianceRequest','allianceReject','allianceExtension']);
function actionFromIntent(intent){
  if(!intent||!SUPPORTED.has(intent.type))return null;
  const out={type:intent.type};
  for(const k of ['targetID','troops','dst','unit','tile','unitId','unitID',
    'recipient','gold','attackID'])if(intent[k]!=null)out[k]=
      typeof intent[k]==='bigint'?intent[k].toString():intent[k];
  return out;
}
function visibleState(view){
  const me=view?.myPlayer?.();
  if(!me?.hasSpawned?.())return null;
  const incoming=(me.incomingAttacks?.()||[]).reduce((s,a)=>s+Number(a.troops??0),0);
  const outgoing=(me.outgoingAttacks?.()||[]).reduce((s,a)=>s+Number(a.troops??0),0);
  const home=Number(me.troops?.()??0),max=Number(view.config?.().maxTroops?.(me)??0);
  return {home,gold:Number(me.gold?.()??0),land:Number(me.numTilesOwned?.()??0),
    incoming,committed:outgoing,maxTroops:max,
    capacityUse:max>0?home/max:null};
}
function frameFor(view,meta,turn,intent){
  const state=visibleState(view),action=actionFromIntent(intent);
  if(!state||!action)return null;
  return {source:'GameView',engineCommit:meta.engineCommit,matchId:meta.matchId,
    playerClientID:meta.clientID,tick:turn,visibleState:state,action,outcome:null};
}
module.exports={SUPPORTED,actionFromIntent,visibleState,frameFor};
