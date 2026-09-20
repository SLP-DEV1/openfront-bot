'use strict';
// Schema 2: 16 observable candidate features -> 12 tanh units -> 1 bounded
// score adjustment. Zero weights reproduce the existing heuristic ranking.
const crypto=require('node:crypto');
const INPUTS=16,HIDDEN=12,LENGTH=INPUTS*HIDDEN+HIDDEN+HIDDEN+1;
const KINDS=['attack','economy','naval'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
function validate(model){
  if(!model||model.schema!==2||model.arch!=='16x12x1-tanh'||
    !Array.isArray(model.weights)||model.weights.length!==LENGTH||
    model.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>5))
    throw Error('Invalid schema-2 action policy');
  return model;
}
function zero(){return {schema:2,arch:'16x12x1-tanh',weights:Array(LENGTH).fill(0)};}
function features(state,kind,baseScore,candidate={}){
  if(!KINDS.includes(kind))throw Error('Unknown action kind');
  const home=Math.max(1,Number(state.home)||0);
  const max=Math.max(1,Number(state.max)||0);
  return [clamp(home/max,0,1.5)/1.5,
    clamp((Number(state.incoming)||0)/home,0,2)/2,
    clamp((Number(state.strongest)||0)/home,0,3)/3,
    clamp((Number(state.committed)||0)/home,0,2)/2,
    clamp((Number(state.gold)||0)/1000000,0,1),
    clamp((Number(state.land)||0)/20000,0,1),
    state.late?1:0,state.neutral?1:0,
    ...KINDS.map(k=>k===kind?1:0),clamp(Number(baseScore)||0,-150,150)/150,
    clamp(Number(candidate.magnitude)||0,0,1),
    clamp(Number(candidate.opportunity)||0,0,1),
    clamp(Number(candidate.cost)||0,0,1),
    clamp(Number(candidate.risk)||0,0,1)];
}
function predict(model,vector){
  validate(model);
  if(!Array.isArray(vector)||vector.length!==INPUTS||
    vector.some((v,i)=>typeof v!=='number'||!Number.isFinite(v)||
      v<(i===INPUTS-1?-1:0)||v>1))throw Error('Invalid action vector');
  const w=model.weights,h=[];
  for(let j=0;j<HIDDEN;j++){
    let z=w[INPUTS*HIDDEN+j];
    for(let i=0;i<INPUTS;i++)z+=vector[i]*w[i*HIDDEN+j];
    h.push(Math.tanh(z));
  }
  let out=w[INPUTS*HIDDEN+HIDDEN*2];
  for(let j=0;j<HIDDEN;j++)out+=h[j]*w[INPUTS*HIDDEN+HIDDEN+j];
  return Math.tanh(out);
}
function mutate(model,seed,sigma=.3,sign=1){
  validate(model);
  if(!Number.isFinite(sigma)||sigma<0||sigma>1||![1,-1].includes(sign))throw Error('Bad mutation');
  let state=crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0)||1;
  const uniform=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;
    return (state+.5)/4294967296;};
  let spare=null;
  const normal=()=>{
    if(spare!==null){const x=spare;spare=null;return x;}
    const r=Math.sqrt(-2*Math.log(uniform())),theta=2*Math.PI*uniform();
    spare=r*Math.sin(theta);return r*Math.cos(theta);
  };
  return {...model,weights:model.weights.map(w=>clamp(w+sign*normal()*sigma,-5,5))};
}
function sha(model){return crypto.createHash('sha256').update(JSON.stringify(validate(model))).digest('hex');}
module.exports={INPUTS,HIDDEN,LENGTH,KINDS,validate,zero,features,predict,mutate,sha};
