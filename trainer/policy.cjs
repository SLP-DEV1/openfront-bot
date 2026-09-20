'use strict';
// Tiny, bounded, CPU-friendly neural policy. Same row-major layout as the
// Tampermonkey inference path; zero weights reproduce the rule-only baseline.
const crypto=require('node:crypto');
const INPUTS=8,HIDDEN=8,OUTPUTS=2,LENGTH=INPUTS*HIDDEN+HIDDEN+HIDDEN*OUTPUTS+OUTPUTS;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:a));
function validate(policy){
  if(!policy||policy.schema!==1||policy.arch!=='8x8x2-tanh'||
    !Array.isArray(policy.weights)||policy.weights.length!==LENGTH||
    policy.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>5))
    throw Error('Invalid neural policy (schema, shape or finite bounded weights)');
  return policy;
}
function zero(){return {schema:1,arch:'8x8x2-tanh',weights:Array(LENGTH).fill(0)};}
function features(state){
  const home=Math.max(1,Number(state.home)||0),max=Math.max(1,Number(state.max)||0);
  return [clamp(home/max,0,1.5)/1.5,
    clamp((Number(state.incoming)||0)/home,0,2)/2,
    clamp((Number(state.strongest)||0)/home,0,3)/3,
    clamp((Number(state.committed)||0)/home,0,2)/2,
    state.neutral?1:0,clamp((Number(state.foes)||0)/8,0,1),
    clamp((Number(state.land)||0)/20000,0,1),state.late?1:0];
}
function predict(policy,vector){
  validate(policy);
  if(!Array.isArray(vector)||vector.length!==INPUTS||vector.some(v=>!Number.isFinite(v)||v<0||v>1))
    throw Error('Invalid bounded input vector');
  const w=policy.weights,h=[];
  for(let j=0;j<HIDDEN;j++){
    let value=w[INPUTS*HIDDEN+j];
    for(let i=0;i<INPUTS;i++)value+=vector[i]*w[i*HIDDEN+j];
    h.push(Math.tanh(value));
  }
  const result=[];
  for(let k=0;k<OUTPUTS;k++){
    let value=w[INPUTS*HIDDEN+HIDDEN+HIDDEN*OUTPUTS+k];
    for(let j=0;j<HIDDEN;j++)value+=h[j]*w[INPUTS*HIDDEN+HIDDEN+j*OUTPUTS+k];
    result.push(Math.tanh(value));
  }
  return result;
}
function mutate(policy,seed,sigma=.3,sign=1){
  validate(policy);
  if(!Number.isFinite(sigma)||sigma<0||sigma>1)throw Error('Invalid sigma');
  const random=require('node:crypto').createHash('sha256').update(String(seed)).digest();
  let state=random.readUInt32LE(0)||1;
  const uniform=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;
    return (state+.5)/4294967296;};
  let spare=null;
  const normal=()=>{
    if(spare!==null){const v=spare;spare=null;return v;}
    const mag=Math.sqrt(-2*Math.log(uniform())),angle=2*Math.PI*uniform();
    spare=mag*Math.sin(angle);return mag*Math.cos(angle);
  };
  return {...policy,weights:policy.weights.map(w=>clamp(w+sign*normal()*sigma,-5,5))};
}
function sha(policy){return crypto.createHash('sha256').update(JSON.stringify(validate(policy))).digest('hex');}
module.exports={INPUTS,HIDDEN,OUTPUTS,LENGTH,zero,validate,features,predict,mutate,sha};
