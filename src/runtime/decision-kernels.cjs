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
// DECISION-KERNELS-END
module.exports={archetypeRankKernel,economyRecoveryKernel,
  marineObservationGraceKernel,actionEvidenceKernel};
