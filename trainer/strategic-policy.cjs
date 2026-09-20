'use strict';
// Schema 3: one shared policy for strategy, combat, economy, navy, defense,
// nuclear planning, diplomacy and fleet. Observations are public GameView data.
// Zero weights leave the rule planner completely unchanged.
const crypto=require('node:crypto');
const INPUTS=16,HIDDEN=16;
const OUTPUTS=Object.freeze(['reserve','aggression','neutralCommit','enemyCommit',
  'warThreshold','navalThreshold','landPriority','navalPriority',
  'holdPriority','cityPriority','factoryPriority','portPriority',
  'defensePriority','nuclearPriority','diplomacyPriority','fleetPriority']);
const LENGTH=INPUTS*HIDDEN+HIDDEN+HIDDEN*OUTPUTS.length+OUTPUTS.length;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
function validate(model){
  if(!model||model.schema!==3||model.arch!=='16x16x16-tanh'||
    !Array.isArray(model.weights)||model.weights.length!==LENGTH||
    model.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>5))
    throw Error('Invalid schema-3 strategic policy');
  return model;
}
function zero(){return {schema:3,arch:'16x16x16-tanh',weights:Array(LENGTH).fill(0)};}
function features(s){
  const home=Math.max(1,Number(s.home)||0),max=Math.max(1,Number(s.max)||0);
  return [
    clamp(home/max,0,1.5)/1.5,
    clamp((Number(s.incoming)||0)/home,0,2)/2,
    clamp((Number(s.strongest)||0)/home,0,3)/3,
    clamp((Number(s.committed)||0)/home,0,2)/2,
    clamp((Number(s.gold)||0)/1000000,0,1),
    clamp((Number(s.land)||0)/20000,0,1),
    s.late?1:0,s.neutral?1:0,
    clamp((Number(s.foes)||0)/8,0,1),
    clamp((Number(s.activeEnemy)||0)/4,0,1),
    clamp((Number(s.available)||0)/home,0,1),
    clamp((Number(s.growthPotential)||0)/Math.max(1,max*.01),0,1),
    clamp((Number(s.cities)||0)/8,0,1),
    clamp((Number(s.ports)||0)/4,0,1),
    s.war?1:0,
    s.thirdParty?1:0
  ];
}
function predict(model,vector){
  validate(model);
  if(!Array.isArray(vector)||vector.length!==INPUTS||
    vector.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
    throw Error('Invalid strategic vector');
  const w=model.weights,h=[];
  for(let j=0;j<HIDDEN;j++){
    let z=w[INPUTS*HIDDEN+j];
    for(let i=0;i<INPUTS;i++)z+=vector[i]*w[i*HIDDEN+j];
    h.push(Math.tanh(z));
  }
  const result={};
  for(let k=0;k<OUTPUTS.length;k++){
    let z=w[INPUTS*HIDDEN+HIDDEN+HIDDEN*OUTPUTS.length+k];
    for(let j=0;j<HIDDEN;j++)
      z+=h[j]*w[INPUTS*HIDDEN+HIDDEN+j*OUTPUTS.length+k];
    result[OUTPUTS[k]]=Math.tanh(z);
  }
  return result;
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
