'use strict';
// P2 – simple, reproducible event tags over *visible* replay frames only.
//
// Signals come exclusively from `action.type` and GameView-visible state
// (home, gold, land, incoming, committed, partnerNeed). No engine-internal
// truth (winner, end positions, private enemy state) is read. Every tag is
// provenance-tagged with `source`, `tick`, `observation` and `validity`, and
// the detector is deterministic and pure.
//
// Tags: early-rush, alliance-change, counterattack, nuke-timing,
// naval-landing, duo-synchronized, retreat, rebuild, hold, failed-attack.

const TAGS=[
  'early-rush','alliance-change','counterattack','nuke-timing',
  'naval-landing','duo-synchronized','retreat','rebuild','hold','failed-attack'
];
const ATTACK=/attack|strike|invade|assault/i;
const NAVAL=/transport|naval|sea|landing|ship|fleet/i;
const NUKE=/nuke|bomb|hydrogen|missile|warhead/i;
const ALLIANCE=/alliance|ally|diplomacy|peace|truce|break|war/i;
const HOLD=/hold/i;
const AHEAD=6; // frames ahead for state-based (inferred) heuristics

const num=v=>Number.isFinite(v)?v:0;
const atOf=f=>{
  const a=f&&f.action&&typeof f.action==='object'?f.action.type:undefined;
  return typeof a==='string'?a.toLowerCase():'';
};
const sOf=f=>{
  const s=f&&f.visibleState&&typeof f.visibleState==='object'?f.visibleState:{};
  return s;
};

// frames: one match's normalized frames, sorted ascending by tick.
function detectInMatch(frames,matchId){
  const events=[];
  const n=frames.length;
  const add=(tag,source,tick,observation,validity)=>
    events.push({tag,source,tick,observation,validity,matchId});
  if(n===0)return events;
  const first=frames[0].tick;
  const last=frames[n-1].tick;
  const span=Math.max(0,last-first);
  let sawEarly=false;

  for(let i=0;i<n;i++){
    const f=frames[i];
    const t=f.tick;
    const at=atOf(f);
    const s=sOf(f);
    const prev=i>0?frames[i-1]:null;
    const ps=prev?sOf(prev):{};

    if(ATTACK.test(at)){
      if(!sawEarly&&span>0&&(t-first)<=0.15*span){
        sawEarly=true;
        add('early-rush','visible-action',t,{actionType:at},'observed');
      }
      if(prev&&num(ps.incoming)>0)
        add('counterattack','visible-state',t,{actionType:at,incoming:num(ps.incoming)},'inferred');
      if(s.partnerNeed!=null&&num(s.partnerNeed)>0.3)
        add('duo-synchronized','visible-state',t,
          {actionType:at,partnerNeed:num(s.partnerNeed)},'inferred');
      if(num(s.committed)>0&&i+1<n){
        let retreatTarget=null;
        let maxLand=num(s.land);
        const end=Math.min(n-1,i+AHEAD);
        for(let k=i+1;k<=end;k++){
          const ck=sOf(frames[k]);
          maxLand=Math.max(maxLand,num(ck.land));
          if(num(ck.committed)<0.5*num(s.committed)&&retreatTarget==null)retreatTarget=ck;
        }
        if(retreatTarget!=null)
          add('retreat','visible-state',t,
            {committedBefore:num(s.committed),committedAfter:num(retreatTarget.committed)},'inferred');
        if(maxLand<=num(s.land))
          add('failed-attack','visible-state',t,
            {landBefore:num(s.land),landAfterMax:maxLand},'inferred');
      }
    }
    if(NAVAL.test(at))add('naval-landing','visible-action',t,{actionType:at},'observed');
    if(NUKE.test(at))add('nuke-timing','visible-action',t,{actionType:at},'observed');
    if(ALLIANCE.test(at))
      add('alliance-change','visible-action',t,{actionType:at},'observed');
    else if(prev&&ps.partnerNeed!=null&&s.partnerNeed!=null&&num(ps.partnerNeed)!==0
      &&Math.sign(num(s.partnerNeed))!==Math.sign(num(ps.partnerNeed)))
      add('alliance-change','visible-state',t,
        {partnerNeedFrom:num(ps.partnerNeed),partnerNeedTo:num(s.partnerNeed)},'inferred');
  }

  // hold: maximal run of >= 3 consecutive hold actions.
  let i=0;
  while(i<n){
    if(HOLD.test(atOf(frames[i]))){
      let j=i;
      while(j+1<n&&HOLD.test(atOf(frames[j+1])))j++;
      if(j-i+1>=3)add('hold','visible-action',frames[i].tick,{count:j-i+1},'observed');
      i=j+1;
    }else i++;
  }

  // rebuild: land recovers strictly above a previous low.
  for(let j=1;j<n;j++){
    const lj=num(sOf(frames[j]).land);
    let minBefore=Infinity;
    for(let q=0;q<j;q++)minBefore=Math.min(minBefore,num(sOf(frames[q]).land));
    if(lj<minBefore){
      const low=lj;
      for(let k=j+1;k<n;k++){
        const lk=num(sOf(frames[k]).land);
        if(lk>low){
          add('rebuild','visible-state',frames[k].tick,{landLow:low,landRecover:lk},'inferred');
          break;
        }
      }
    }
  }
  return events;
}

function detectEvents(records,opts){
  const o=opts&&typeof opts==='object'?opts:{};
  const keyOf=o.keyOf||(r=>String(r&&r.matchId!=null?r.matchId:'unknown'));
  const byMatch=new Map();
  for(const r of (records||[])){
    const k=keyOf(r);
    if(!byMatch.has(k))byMatch.set(k,[]);
    byMatch.get(k).push(r);
  }
  const events=[];
  for(const [k,frames]of byMatch){
    const sorted=frames.slice()
      .sort((a,b)=>((a&&a.tick!=null?a.tick:-Infinity)-(b&&b.tick!=null?b.tick:Infinity)));
    events.push(...detectInMatch(sorted,k));
  }
  events.sort((a,b)=>
    (a.tick-b.tick)||
    (a.matchId<b.matchId?-1:a.matchId>b.matchId?1:0)||
    a.tag.localeCompare(b.tag));
  return events;
}

module.exports={detectEvents,TAGS};
