'use strict';
// Strict import boundary for human/bot replays. A record is trainable only
// when the exact engine and the state visible at decision time are present.
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/i.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function normalizeDecision(row,expectedEngine){
  if(!row||!sha(row.engineCommit)||row.engineCommit.toLowerCase()!==
    String(expectedEngine||'').toLowerCase())return {usable:false,reason:'engine-mismatch'};
  if(!Number.isInteger(row.tick)||row.tick<0||!row.visibleState||
    typeof row.visibleState!=='object'||Array.isArray(row.visibleState))
    return {usable:false,reason:'missing-visible-state'};
  const s=row.visibleState,required=['home','gold','land','incoming','committed'];
  if(required.some(k=>!finite(s[k])||s[k]<0))
    return {usable:false,reason:'incomplete-visible-state'};
  if(!row.action||typeof row.action.type!=='string'||!row.action.type.trim())
    return {usable:false,reason:'missing-action'};
  return {usable:true,record:{engineCommit:row.engineCommit.toLowerCase(),
    matchId:String(row.matchId||''),tick:row.tick,
    visibleState:{home:s.home,gold:s.gold,land:s.land,incoming:s.incoming,
      committed:s.committed,fronts:Array.isArray(s.fronts)?s.fronts:null,
      partnerNeed:finite(s.partnerNeed)?s.partnerNeed:null,
      economyRelative:finite(s.economyRelative)?s.economyRelative:null},
    action:row.action,outcome:row.outcome??null,
    missingOutcome:row.outcome===undefined||row.outcome===null}};
}
// meta: optional {origin, provenance, usageRights}.
//  origin: 'engine-simulation' (default) or 'human-replay'.
//  Real human data is only accepted with provenance AND consent/usage rights;
//  engine-simulation data only needs the exact engine commit (already required).
// Usable records are labeled `kind:'learning-pair'`; rejected rows are kept as
// non-binding `scenarioIdeas` (a scenario idea is NOT a learning pair).
function importReplay(rows,engineCommit,meta){
  if(!Array.isArray(rows)||!sha(engineCommit))throw Error('Rows and exact engine commit required');
  const m=meta&&typeof meta==='object'?meta:{};
  const origin=m.origin||'engine-simulation';
  if(origin!=='engine-simulation'&&origin!=='human-replay')
    throw Error('Unknown replay origin: '+origin);
  if(origin==='human-replay'
    &&(!m.provenance||typeof m.provenance!=='string'||!m.provenance.trim()))
    throw Error('Human replay requires provenance (e.g. gameID/clientID)');
  if(origin==='human-replay'
    &&(!m.usageRights||typeof m.usageRights!=='string'||!m.usageRights.trim()))
    throw Error('Human replay requires consent/usage rights');
  const normalized=rows.map(x=>normalizeDecision(x,engineCommit));
  const usable=normalized.filter(x=>x.usable).map(x=>({...x.record,kind:'learning-pair'}));
  const scenarioIdeas=[];
  for(let i=0;i<rows.length;i++){
    if(!normalized[i].usable){
      const r=rows[i]||{};
      scenarioIdeas.push({reason:normalized[i].reason,
        matchId:typeof r.matchId==='string'?r.matchId:null,
        tick:Number.isSafeInteger(r.tick)?r.tick:null});
    }
  }
  return {schema:'aggrobot-visible-replay-v2',engineCommit:engineCommit.toLowerCase(),
    origin,
    provenance:m.provenance||null,
    usageRights:m.usageRights||null,
    usable,
    rejected:normalized.filter(x=>!x.usable).map(x=>x.reason),
    scenarioIdeas,
    note:'Missing trajectories/outcomes remain null and are never converted to zero. '
      +'Human data is stored only with provenance and consent/usage rights.'};
}
module.exports={normalizeDecision,importReplay};
