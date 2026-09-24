'use strict';
// Pure, directly importable policy kernels. The block between the markers is
// inlined verbatim into the userscript IIFE by tools/build-userscript.cjs.
// Keep browser dependencies OUT of this block.
// DECISION-KERNELS-BEGIN
function archetypeRankKernel(candidates,arch,tick){
  const out=(candidates||[]).map(c=>({...c}));
  for(const c of out){
    if(c.kind==='attack'){
      c.utility+=arch.attackUtility||0;
      if(tick<(arch.firstAttackGate||0))c.utility-=1000;
    }else if(c.kind==='hold'||c.kind==='support')c.utility+=arch.holdUtility||0;
    else if(c.kind==='invest')c.utility+=arch.investUtility||0;
    else if(c.kind==='naval')c.utility+=arch.navalUtility||0;
  }
  out.sort((a,b)=>b.utility-a.utility||String(a.id).localeCompare(String(b.id)));
  return out;
}
function economyRecoveryKernel(input){
  const x=input||{};
  const incomeCollapse=x.observed===true&&x.train===0&&x.trade===0&&
    x.cities>=1&&x.factories>=1&&
    (x.cities<2||x.factories<2||x.failedEconomyProbes>=5);
  const coreRecovery=(x.startup||incomeCollapse)&&x.land>0&&x.incoming===0&&
    !(incomeCollapse&&x.nuclearThreat&&!x.startup);
  return {incomeCollapse,coreRecovery};
}
function marineObservationGraceKernel(arrivalTick,observationLostTick){
  const projected=Number.isFinite(arrivalTick)?
    arrivalTick-observationLostTick+120:120;
  return Math.min(360,Math.max(120,projected));
}
function candidateControlKernel(candidates,scores,gain=18){
  const g=Number.isFinite(+gain)?Math.min(60,Math.max(0,+gain)):18;
  const out=(candidates||[]).map(c=>{
    const score=scores?.get?scores.get(c.id):scores?.[c.id];
    return Number.isFinite(score)?{...c,utility:Math.round(c.utility+g*score)}:{...c};
  });
  out.sort((a,b)=>b.utility-a.utility||String(a.id).localeCompare(String(b.id)));
  return out;
}
// Controller variants (campaign §5). `raw` is identical to candidateControlKernel
// (gain * raw score). All variants re-order only already-legal candidates and
// never change legality (the downstream channel director still authorizes the
// selected candidate). `calibrated` normalizes model scores to a per-frame
// z-score before scaling, so a near-degenerate score vector still expresses its
// full ranking; `adaptive` scales the gain up to capGain with the model's
// top-1/top-2 confidence margin; `rank` maps the model's rank position to a
// scale-free utility bonus (1 = best, 0 = worst); `gated` applies the bonus only
// when the model's top-1 clearly beats the rule top-1 by `margin` AND the
// implied required gain is within capGain, otherwise it keeps the rule order.
function candidateControlVariant(candidates,scores,gain=18,mode='raw',opts={}){
  const g=Number.isFinite(+gain)?Math.min(60,Math.max(0,+gain)):18;
  const cand=Array.isArray(candidates)?candidates:[];
  const rows=cand.map(c=>{
    const sc=scores?.get?scores.get(c.id):scores?.[c.id];
    return {c,score:Number.isFinite(sc)?sc:null};
  });
  const scored=rows.filter(r=>r.score!=null);
  const byScore=[...scored].sort((a,b)=>b.score-a.score||String(a.c.id).localeCompare(String(b.c.id)));
  const top1=byScore[0],top2=byScore[1];
  const confidence=(top1&&top2)?(top1.score-top2.score):0;
  const ruleTop=cand[0];
  const cap=Number.isFinite(+opts.capGain)?Math.min(60,Math.max(0,+opts.capGain)):60;
  const confRef=Number.isFinite(+opts.confidenceRef)&&+opts.confidenceRef>0?+opts.confidenceRef:0.5;
  const margin=Number.isFinite(+opts.margin)?+opts.margin:0.25;
  let utilityOf;
  if(mode==='calibrated'){
    const vals=scored.map(r=>r.score);
    const mean=vals.reduce((a,b)=>a+b,0)/Math.max(1,vals.length);
    const sd=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/Math.max(1,vals.length));
    const inv=sd>1e-9?1/sd:1;
    utilityOf=r=>r.score==null?r.c.utility:Math.round(r.c.utility+g*(r.score-mean)*inv);
  } else if(mode==='adaptive'){
    const gEff=g+(cap-g)*Math.max(0,Math.min(1,confidence/confRef));
    utilityOf=r=>r.score==null?r.c.utility:Math.round(r.c.utility+gEff*r.score);
  } else if(mode==='rank'){
    const n=scored.length;
    const rankOf=new Map();
    byScore.forEach((r,i)=>rankOf.set(r.c.id,n>1?1-i/(n-1):1));
    utilityOf=r=>{const p=rankOf.get(r.c.id);return p==null?r.c.utility:Math.round(r.c.utility+cap*p);};
  } else if(mode==='gated'){
    const modelTop=top1?top1.c.id:null;
    const ruleId=ruleTop?ruleTop.id:null;
    const ruleScore=ruleId!=null?((byScore.find(r=>r.c.id===ruleId)?.score)??0):0;
    const modelScore=top1?top1.score:0;
    const modelUtil=modelTop!=null?((byScore.find(r=>r.c.id===modelTop)?.c.utility)??ruleTop?.utility??0):(ruleTop?.utility??0);
    const ruleUtil=ruleTop?.utility??0;
    const gap=modelScore-ruleScore;
    const required=(modelTop!=null&&modelTop!==ruleId&&gap>1e-9)?(ruleUtil-modelUtil)/gap:0;
    const gate=ruleId!=null&&modelTop!=null&&modelTop!==ruleId&&gap>=margin&&required<=cap;
    const gUse=gate?cap:0;
    utilityOf=r=>r.score==null?r.c.utility:Math.round(r.c.utility+gUse*r.score);
  } else {
    // 'raw' (and default): the original gain * raw score mapping.
    utilityOf=r=>r.score==null?r.c.utility:Math.round(r.c.utility+g*r.score);
  }
  const out=rows.map(r=>({...r.c,utility:utilityOf(r)}));
  out.sort((a,b)=>b.utility-a.utility||String(a.id).localeCompare(String(b.id)));
  return out;
}
function reserveResolutionKernel(home,floors){
  const f=floors||{},entries=Object.entries(f).filter(([,v])=>Number.isFinite(v));
  const reserve=Math.min(Math.max(0,home||0),
    Math.ceil(Math.max(0,...entries.map(([,v])=>v))));
  const reason=entries.filter(([,v])=>v>=reserve-.501)
    .map(([k])=>k).join('+')||'baseline';
  return {reserve,available:Math.max(0,Math.floor((home||0)-reserve)),
    reserveReason:reason};
}
function actionEvidenceKernel(ledger){
  const rows=Array.isArray(ledger)?ledger:[];
  const confirmed=rows.filter(v=>
    String(v?.observed||'').endsWith('_confirmed')||
    v?.observed==='engine-donate-event');
  const unconfirmed=rows.filter(v=>
    String(v?.observed||'').endsWith('_unconfirmed'));
  const effects=rows.filter(v=>v?.effect!=null&&v.effect!=='unknown');
  return {
    intents:rows.length,
    confirmedObservations:confirmed.length,
    unconfirmedObservations:unconfirmed.length,
    stillUnknown:rows.filter(v=>!v?.observed||v.observed==='unknown').length,
    effectsObserved:effects.length,
    ratios:{
      confirmedPerIntent:rows.length?confirmed.length/rows.length:null,
      effectPerIntent:rows.length?effects.length/rows.length:null
    },
    semantics:'intent -> confirmation observation -> effect observation; missing evidence is never failure or success'
  };
}
// Shared SAM/silo policy: observed inbound nukes, not a visible enemy silo,
// override a funded first silo. A missing/stale relay never blocks solo play.
function duoNuclearInvestmentKernel(x){
  const coreReady=x.coreReady===true,peerValid=x.peerValid===true;
  const siloReady=x.siloAllowed===true&&coreReady&&x.late===true&&
    x.land>900&&x.siloSiteBlocked!==true;
  // Old peers have no canonical readiness. Do not interpret missing as false:
  // that makes both browsers elect themselves. Wait for an observed peer silo.
  const peerProtocol=peerValid&&x.peerNuclearProtocol===1;
  const peerReady=peerProtocol&&x.peerSiloReady===true;
  const primary=!peerValid || (peerProtocol&&
    (siloReady!==peerReady?siloReady:String(x.ownId)<String(x.peerId)));
  const peerHasSilo=peerValid&&x.peerSilos>0;
  const firstSiloWindow=siloReady&&(primary||peerHasSilo);
  const incoming=Math.max(0,x.incomingNukes||0);
  const uncovered=Math.max(0,x.uncovered||0);
  const ownSAM=Math.max(0,x.ownSAM||0),silos=Math.max(0,x.silos||0);
  // A visible enemy silo is not an incoming strike. First finish the two
  // City/two Factory economic core; actual inbound nukes still bypass it.
  const firstGuard=x.antiNuke===true&&!x.samSearchBlocked&&
    coreReady&&uncovered>0&&ownSAM===0&&
    ((x.enemySilos||0)>0||x.proactiveSAM===true);
  const siloFundActive=firstSiloWindow&&silos===0&&
    !x.urgentVictory&&!incoming&&!firstGuard;
  let wantedSAM=0;
  if(uncovered>0&&x.antiNuke===true){
    if(incoming)wantedSAM=Math.min(7,Math.max(ownSAM+1,
      Math.ceil(uncovered/3)+Math.min(2,incoming)));
    else if(firstGuard)wantedSAM=1;
    else if(coreReady&&(x.enemySilos||0)>0&&!siloFundActive)
      wantedSAM=Math.min(silos>0&&x.nukeShots>0?3:silos>0?1:2,
        Math.max(ownSAM,Math.ceil(uncovered/3)));
    else if(coreReady&&x.proactiveSAM===true&&ownSAM===0)wantedSAM=1;
  }
  return {primary,peerValid,firstSiloWindow,siloFundActive,firstGuard,
    wantedSAM,samFundingUrgent:incoming>0||firstGuard,
    samUpgradeAllowed:uncovered>0&&
      (incoming>0||silos>0&&x.nukeShots>0&&(x.enemySilos||0)>0)};
}
// DECISION-KERNELS-END
module.exports={archetypeRankKernel,economyRecoveryKernel,
  marineObservationGraceKernel,candidateControlKernel,candidateControlVariant,
  reserveResolutionKernel,actionEvidenceKernel,duoNuclearInvestmentKernel};
