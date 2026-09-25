'use strict';
// Schema-6 candidate policy: a NEW model contract, not a Schema-5 fine-tune.
//
// Fixes the two measured structural blockers of the Schema-5 campaigns:
//   * Blocker A (feature gap): the 32-dim v5 vector carried kind one-hots for
//     attack/'investment'(bug)/naval only, so hold/expand/support were all
//     indistinguishable from each other. v6 carries an explicit one-hot for
//     EVERY action kind the planner can emit (hold/invest/attack/expand/naval/
//     support) at idx 29-34, so the ranker can score each channel separately.
//   * Blocker (control ceiling): the v5 ranker scored candidates WITHOUT the
//     rule utility context, so it could not learn "the rules already prefer
//     X; override only when the evidence disagrees". v6 adds three bounded
//     rule-utility context features (idx 35-37): the candidate's own rule
//     utility and its gap to the rule top-1/top-2, which are computable at
//     inference (the candidate set is rule-sorted before scoring) and in the
//     training binding, so train/runtime parity holds by construction.
//
// Contract:
//   schema 6, INPUTS 38, OUTPUTS 2 (heldGain, lossRisk), archs 38x24x2-tanh
//   (986 weights) and 38x40x2-tanh (1642 weights). Two archs are trained so
//   the comparison is not a single capacity point (mission 12).
//
// The slice from `const INPUTS=38` to `function sha(model)` is the runtime
// feature/validator/predictor contract; it is inlined verbatim into the
// userscript (see src/userscript/00-bootstrap.js GENERATED-SHADOW-V6) and the
// build asserts byte-parity, so training and inference use one source of
// truth.
const crypto=require('node:crypto');
const INPUTS=38,OUTPUTS=2;
const KINDS=['hold','invest','attack','expand','naval','support'];
const HIDDEN_BY_ARCH={'38x24x2-tanh':24,'38x40x2-tanh':40};
const ARCHES=Object.keys(HIDDEN_BY_ARCH);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const logrel=(n,base)=>clamp(Math.log1p(Math.max(0,Number(n)||0))/
  Math.log1p(Math.max(1,Number(base)||1)),0,2)/2;
// Bounded rule-utility normalization. Rule utilities are order-of-magnitude
// bounded in [~-1000 (gated early attack), ~+150 (strong candidate)]; the
// absolute feature is an offset/scale map, the gaps are signed-bounded so a
// candidate far below the rule leader saturates at 1 without the -1000 gated
// early-attack floor collapsing the whole frame.
const RU_ABS_OFFSET=100,RU_ABS_SCALE=200,RU_GAP_SCALE=100;
function lengthFor(arch){const h=HIDDEN_BY_ARCH[arch];
  if(h===undefined)throw Error('Invalid schema-6 arch '+arch);
  return INPUTS*h+h+h*OUTPUTS+OUTPUTS;}
// 38-dim candidate feature vector.
//   idx 0-28  state + candidate contract (identical to schema-5, verified)
//   idx 29-34 kind one-hot: hold, invest, attack, expand, naval, support
//   idx 35    candidateRuleUtility (own rule utility, bounded)
//   idx 36    utilityGapToRuleTop1 (top-1 utility - own, bounded)
//   idx 37    utilityGapToRuleTop2 (top-2 utility - own, bounded)
// ctx is the per-frame rule-utility context: {ownRu, ruTop1, ruTop2}.
function features(state={},candidate={},ctx={}){
  const home=Math.max(1,Number(state.home)||1),gold=Math.max(1,Number(state.gold)||1);
  const kind=String(candidate.kind||'');
  const ownRu=Number(ctx.ownRu),top1=Number(ctx.ruTop1),top2=Number(ctx.ruTop2);
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
    // idx 29-34: explicit one-hot for every action kind (no all-zero fallback).
    ...(KINDS.map(k=>k===kind?1:0)),
    // idx 35: candidateRuleUtility.
    Number.isFinite(ownRu)?clamp((ownRu+RU_ABS_OFFSET)/RU_ABS_SCALE,0,1):0,
    // idx 36: utilityGapToRuleTop1 (0 for the rule leader, grows below it).
    (Number.isFinite(ownRu)&&Number.isFinite(top1))
      ?clamp((top1-ownRu)/RU_GAP_SCALE,0,1):0.5,
    // idx 37: utilityGapToRuleTop2.
    (Number.isFinite(ownRu)&&Number.isFinite(top2))
      ?clamp((top2-ownRu)/RU_GAP_SCALE,0,1):0.5
  ];
  return values.map(v=>clamp(v));
}
function validate(model){
  if(!model||model.schema!==6)throw Error('Invalid schema-6 candidate model');
  const h=HIDDEN_BY_ARCH[model.arch];
  if(h===undefined)throw Error('Invalid schema-6 candidate model');
  const L=lengthFor(model.arch);
  if(!Array.isArray(model.outputs)||model.outputs.length!==OUTPUTS||
    model.outputs[0]!=='heldGain'||model.outputs[1]!=='lossRisk'||
    !Array.isArray(model.weights)||model.weights.length!==L||
    Array.from(model.weights).some(x=>!Number.isFinite(x)||Math.abs(x)>5))
    throw Error('Invalid schema-6 candidate model');
  return model;
}
function zero(arch){arch=arch||ARCHES[0];
  if(!HIDDEN_BY_ARCH[arch])throw Error('Invalid arch '+arch);
  return {schema:6,arch,outputs:['heldGain','lossRisk'],
    weights:Array(lengthFor(arch)).fill(0)};}
function predict(model,input){
  const m=validate(model);const h=HIDDEN_BY_ARCH[m.arch];
  if(!Array.isArray(input)||input.length!==INPUTS||
    input.some(x=>!Number.isFinite(x)||x<0||x>1))
    throw Error('Invalid candidate feature vector');
  const w=m.weights;const hb=INPUTS*h,outStart=hb+h,outBias=outStart+h*OUTPUTS;
  const hid=[];
  for(let j=0;j<h;j++){let z=w[hb+j];
    for(let i=0;i<INPUTS;i++)z+=input[i]*w[i*h+j];hid.push(Math.tanh(z));}
  const out=[];
  for(let k=0;k<OUTPUTS;k++){let z=w[outBias+k];
    for(let j=0;j<h;j++)z+=hid[j]*w[outStart+j*OUTPUTS+k];
    out.push((Math.tanh(z)+1)/2);}
  return {heldGain:out[0],lossRisk:out[1]};
}
function sha(model){return crypto.createHash('sha256').update(JSON.stringify(validate(model))).digest('hex');}
module.exports={INPUTS,OUTPUTS,KINDS,ARCHES,HIDDEN_BY_ARCH,RU_ABS_OFFSET,
  RU_ABS_SCALE,RU_GAP_SCALE,lengthFor,features,validate,zero,predict,sha};
