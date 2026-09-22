'use strict';
// Dormant candidate ranker for controlled evaluation. It predicts held gain
// and loss risk; it cannot emit game intents or bypass rule legality.
const crypto=require('node:crypto');
const INPUTS=32,HIDDEN=20,OUTPUTS=2;
const LENGTH=INPUTS*HIDDEN+HIDDEN+HIDDEN*OUTPUTS+OUTPUTS;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const logrel=(n,base)=>clamp(Math.log1p(Math.max(0,Number(n)||0))/
  Math.log1p(Math.max(1,Number(base)||1)),0,2)/2;
function features(state={},candidate={}){
  const home=Math.max(1,Number(state.home)||1),gold=Math.max(1,Number(state.gold)||1);
  const values=[
    logrel(state.home,state.maxTroops),logrel(state.gold,10000000),
    clamp((state.incoming||0)/home,0,2)/2,clamp((state.committed||0)/home,0,2)/2,
    clamp((state.reserve||0)/home,0,1),clamp(state.economyRelative,0,2)/2,
    clamp(state.capacityUse,0,1),clamp(state.frontReach,0,1),
    clamp(state.partnerNeed,0,1),clamp(state.enemyBound,0,1),
    clamp(state.landTrend,-1,1)/2+.5,clamp(state.goldTrend,-1,1)/2+.5,
    clamp(state.troopTrend,-1,1)/2+.5,clamp(state.frontCount/8,0,1),
    clamp(state.portAccess,0,1),clamp(state.technologyCoverage,0,1),
    clamp(candidate.expectedLand/Math.max(1,state.land||1),0,1),
    clamp(candidate.costTroops/home,0,1),clamp(candidate.costGold/gold,0,1),
    clamp(candidate.duration/1200,0,1),clamp(candidate.returnTime/1200,0,1),
    clamp(candidate.counterRisk,0,1),clamp(candidate.thirdPartyRisk,0,1),
    clamp(candidate.infrastructureValue,0,1),clamp(candidate.incomeValue,0,1),
    clamp(candidate.recruitmentValue,0,1),clamp(candidate.siteRisk,0,1),
    clamp(candidate.holdProbability,0,1),clamp(candidate.legalConfidence,0,1),
    candidate.kind==='attack'?1:0,candidate.kind==='investment'?1:0,
    candidate.kind==='naval'?1:0
  ];
  return values.map(v=>clamp(v));
}
function validate(model){
  if(!model||model.schema!==5||model.arch!=='32x20x2-tanh'||
    !Array.isArray(model.outputs)||model.outputs.length!==OUTPUTS||
    model.outputs[0]!=='heldGain'||model.outputs[1]!=='lossRisk'||
    !Array.isArray(model.weights)||model.weights.length!==LENGTH||
    Array.from(model.weights).some(x=>!Number.isFinite(x)||Math.abs(x)>5))
    throw Error('Invalid schema-5 candidate model');
  return model;
}
function zero(){return {schema:5,arch:'32x20x2-tanh',
  outputs:['heldGain','lossRisk'],weights:Array(LENGTH).fill(0)};}
function predict(model,input){
  const w=validate(model).weights;
  if(!Array.isArray(input)||input.length!==INPUTS||input.some(x=>!Number.isFinite(x)||x<0||x>1))
    throw Error('Invalid candidate feature vector');
  const h=[],hiddenBias=INPUTS*HIDDEN,outStart=hiddenBias+HIDDEN,
    outBias=outStart+HIDDEN*OUTPUTS;
  for(let j=0;j<HIDDEN;j++){let z=w[hiddenBias+j];for(let i=0;i<INPUTS;i++)z+=input[i]*w[i*HIDDEN+j];h.push(Math.tanh(z));}
  const out=[];for(let k=0;k<OUTPUTS;k++){let z=w[outBias+k];for(let j=0;j<HIDDEN;j++)z+=h[j]*w[outStart+j*OUTPUTS+k];out.push((Math.tanh(z)+1)/2);}
  return {heldGain:out[0],lossRisk:out[1]};
}
function sha(model){return crypto.createHash('sha256').update(JSON.stringify(validate(model))).digest('hex');}
module.exports={INPUTS,HIDDEN,OUTPUTS,LENGTH,features,validate,zero,predict,sha};
