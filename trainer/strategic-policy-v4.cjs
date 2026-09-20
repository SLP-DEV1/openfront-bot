'use strict';
// Optional schema 4; schema 3 stays compatible. All signals are GameView-visible.
// The model only biases existing rule planners and cannot emit an intent.
const crypto=require('node:crypto');
const base=require('./strategic-policy.cjs');
const INPUTS=24,HIDDEN=24,OUTPUTS=base.OUTPUTS;
const LENGTH=INPUTS*HIDDEN+HIDDEN+HIDDEN*OUTPUTS.length+OUTPUTS.length;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
function validate(model){
  if(!model||model.schema!==4||model.arch!=='24x24x16-tanh'||
    !Array.isArray(model.weights)||model.weights.length!==LENGTH||
    model.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>5))
    throw Error('Invalid schema-4 strategic policy');
  return model;
}
function zero(){return {schema:4,arch:'24x24x16-tanh',weights:Array(LENGTH).fill(0)};}
function features(s){
  const home=Math.max(1,Number(s.home)||0),land=Math.max(1,Number(s.land)||0);
  return [...base.features(s),
    clamp((Number(s.secondary)||0)/home,0,3)/3,
    clamp((Number(s.landLoss)||0)/land,0,1),
    clamp((Number(s.trainIncome)||0)/1000000,0,1),
    clamp((Number(s.tradeIncome)||0)/1000000,0,1),
    clamp((Number(s.uncovered)||0)/8,0,1),
    s.recentPressure?1:0,
    clamp((Number(s.defenses)||0)/12,0,1),
    clamp((Number(s.navalFailures)||0)/12,0,1)];
}
function predict(model,vector){
  validate(model);
  if(!Array.isArray(vector)||vector.length!==INPUTS||
    vector.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
    throw Error('Invalid schema-4 vector');
  const w=model.weights,h=[],output={};
  const hiddenStart=INPUTS*HIDDEN,outputStart=hiddenStart+HIDDEN;
  const biasStart=outputStart+HIDDEN*OUTPUTS.length;
  for(let j=0;j<HIDDEN;j++){
    let z=w[hiddenStart+j];
    for(let i=0;i<INPUTS;i++)z+=vector[i]*w[i*HIDDEN+j];
    h.push(Math.tanh(z));
  }
  for(let k=0;k<OUTPUTS.length;k++){
    let z=w[biasStart+k];
    for(let j=0;j<HIDDEN;j++)z+=h[j]*w[outputStart+j*OUTPUTS.length+k];
    output[OUTPUTS[k]]=Math.tanh(z);
  }
  return output;
}
function mutate(model,seed,sigma=.3,sign=1){
  validate(model);
  if(!Number.isFinite(sigma)||sigma<0||sigma>1||![1,-1].includes(sign))
    throw Error('Bad mutation');
  let state=crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0)||1;
  const uniform=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;
    return (state+.5)/4294967296;};
  let spare=null;
  const normal=()=>{
    if(spare!==null){const v=spare;spare=null;return v;}
    const r=Math.sqrt(-2*Math.log(uniform())),theta=2*Math.PI*uniform();
    spare=r*Math.sin(theta);return r*Math.cos(theta);
  };
  return {...model,weights:model.weights.map(w=>clamp(w+sign*normal()*sigma,-5,5))};
}
function sha(model){return crypto.createHash('sha256').update(JSON.stringify(validate(model))).digest('hex');}
module.exports={INPUTS,HIDDEN,OUTPUTS,LENGTH,validate,zero,features,predict,mutate,sha};
