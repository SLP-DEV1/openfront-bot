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
function importReplay(rows,engineCommit){
  if(!Array.isArray(rows)||!sha(engineCommit))throw Error('Rows and exact engine commit required');
  const normalized=rows.map(x=>normalizeDecision(x,engineCommit));
  return {schema:'aggrobot-visible-replay-v1',engineCommit:engineCommit.toLowerCase(),
    usable:normalized.filter(x=>x.usable).map(x=>x.record),
    rejected:normalized.filter(x=>!x.usable).map(x=>x.reason),
    note:'Missing trajectories/outcomes remain null and are never converted to zero.'};
}
module.exports={normalizeDecision,importReplay};
