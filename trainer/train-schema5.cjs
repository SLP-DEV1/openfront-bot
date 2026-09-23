#!/usr/bin/env node
// Box 241: deterministic offline visible-state curriculum for the schema-5
// dormant candidate (32x20x2-tanh). This is NOT the real-engine evolution
// loop (train.mjs, schema 3/4). It produces real, reproducible training,
// validation and holdout results for the schema-5 model so it has measurable
// train/val/holdout numbers instead of only 702 weights.
//
// Honesty labels (kept on every artifact):
//   - "offline visible-state curriculum" (no engine, no win-rate)
//   - "shadow candidate; not promoted" (the model stays opt-in)
//   - deterministic (fixed seed, fixed full-batch gradient descent)
//
// The targets are smooth functions of a FEW visible features (expectedLand,
// counterRisk, thirdPartyRisk, costTroops/home, holdProbability), so the
// network has a real, learnable mapping. We also train a constant (zero)
// baseline and report both on all three splits, so "real results" means the
// candidate demonstrably beats the constant baseline on held-out data.

'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const policy=require('./candidate-policy-v5.cjs');

const {INPUTS,HIDDEN,OUTPUTS,LENGTH}=policy;
const hiddenBias=INPUTS*HIDDEN;
const outStart=hiddenBias+HIDDEN;
const outBias=outStart+HIDDEN*OUTPUTS;

// Feature indices used for the visible-only targets (see candidate-policy-v5
// "features" values array).
const F_EXPECTED_LAND=16; // expectedLand/land
const F_COST_TROOPS=18;  // costTroops/home
const F_COUNTER=21;      // counterRisk
const F_THIRD=22;        // thirdPartyRisk

function clamp01(x){return Math.min(1,Math.max(0,x));}

// Deterministic PRNG (mulberry32) so the curriculum is reproducible.
function rng(seed){
  let a=seed>>>0;
  return function(){
    a|=0;a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function featureIndex(state,cand){
  // The visible feature vector, computed exactly as the deployed model sees it.
  const v=policy.features(state,cand);
  return v;
}

function targets(x){
  // Smooth visible-only mapping; learnable but not the identity.
  const heldGain=clamp01(0.5+0.5*x[F_EXPECTED_LAND]-0.3*x[F_COUNTER]);
  const lossRisk=clamp01(0.45*x[F_COUNTER]+0.25*x[F_THIRD]+0.30*x[F_COST_TROOPS]);
  return [heldGain,lossRisk];
}

// Build one deterministic match: a sequence of visible states + candidates,
// each yielding a 32-dim feature row and a 2-dim target. Returns rows tagged
// with matchId so splits can be disjoint by match.
function generate({matches=60,frames=80,seed=20260714}={}){
  const rand=rng(seed);
  const rows=[];
  const matchIds=[];
  for(let m=0;m<matches;m++){
    const matchId='s5-curriculum-'+String(m).padStart(3,'0');
    matchIds.push(matchId);
    // Stable per-match visible context so a match has coherent trajectories.
    const base={
      partnerNeed:Math.floor(rand()*2),
      enemyBound:Math.floor(rand()*2),
      portAccess:Math.floor(rand()*2),
      technologyCoverage:Math.floor(rand()*3),
      economyRelative:rand(),
      landTrend:rand()*2-1,
      goldTrend:rand()*2-1,
      troopTrend:rand()*2-1
    };
    for(let f=0;f<frames;f++){
      const state={
        home:Math.floor(2+rand()*30),
        maxTroops:Math.floor(8+rand()*120),
        committed:Math.floor(rand()*40),
        incoming:Math.floor(rand()*40),
        reserve:Math.floor(rand()*40),
        gold:Math.floor(50+rand()*400),
        land:Math.floor(1+rand()*12),
        capacityUse:rand(),
        frontCount:Math.floor(rand()*4),
        ...base
      };
      const candidate={
        kind:rand()<0.5?'attack':'investment',
        expectedLand:rand(),
        costTroops:Math.floor(rand()*40),
        costGold:Math.floor(rand()*200),
        duration:Math.floor(rand()*80),
        returnTime:Math.floor(rand()*200),
        counterRisk:rand(),
        thirdPartyRisk:rand(),
        infrastructureValue:rand(),
        incomeValue:rand(),
        recruitmentValue:rand(),
        siteRisk:rand(),
        holdProbability:rand(),
        legalConfidence:0.99999,
        id:'cand-'+f
      };
      const x=featureIndex(state,candidate);
      rows.push({matchId,x,y:targets(x)});
    }
  }
  return {rows,matchIds,meta:{matches,frames,seed}};
}

// Split by MATCH (never a frame): ~70/15/15, disjoint, reproducible order.
function split(dataset,ratio={train:0.7,val:0.15,holdout:0.15}){
  const byMatch=new Map();
  for(const r of dataset.rows){
    if(!byMatch.has(r.matchId))byMatch.set(r.matchId,[]);
    byMatch.get(r.matchId).push(r);
  }
  const ids=[...byMatch.keys()].sort(); // deterministic order
  const n=ids.length;
  const cutT=Math.floor(n*ratio.train);
  const cutV=cutT+Math.floor(n*ratio.val);
  const groups={train:[],val:[],holdout:[]};
  ids.forEach((id,i)=>{
    const g=i<cutT?'train':(i<cutV?'val':'holdout');
    groups[g].push(byMatch.get(id));
  });
  const out={};
  for(const g of['train','val','holdout'])out[g]=groups[g].flat();
  return out;
}

function forward(x,w){
  const h=new Array(HIDDEN);
  for(let j=0;j<HIDDEN;j++){
    let z=w[hiddenBias+j];
    for(let i=0;i<INPUTS;i++)z+=x[i]*w[i*HIDDEN+j];
    h[j]=Math.tanh(z);
  }
  const out=new Array(OUTPUTS);
  for(let k=0;k<OUTPUTS;k++){
    let z=w[outBias+k];
    for(let j=0;j<HIDDEN;j++)z+=h[j]*w[outStart+j*OUTPUTS+k];
    out[k]=(Math.tanh(z)+1)/2;
  }
  return {h,out};
}

function mse(w,rows){
  if(!rows.length)return 0;
  let sum=0;
  for(const r of rows){
    const {out}=forward(r.x,w);
    for(let k=0;k<OUTPUTS;k++){
      const d=out[k]-r.y[k];
      sum+=d*d;
    }
  }
  return sum/(rows.length*OUTPUTS);
}

// Deterministic full-batch gradient descent. Returns final weights + history.
function train(splits,opts={}){
  const lr=opts.learningRate??0.05;
  const epochs=opts.epochs??200;
  const w=policy.zero().weights.slice();
  const N=splits.train.length;
  const history=[];
  for(let e=0;e<epochs;e++){
    const grad=new Array(LENGTH).fill(0);
    for(const r of splits.train){
      const x=r.x,T=r.y;
      // forward
      const h=new Array(HIDDEN);
      const Z1=new Array(HIDDEN);
      const Z2=new Array(OUTPUTS);
      const out=new Array(OUTPUTS);
      for(let j=0;j<HIDDEN;j++){
        let z=w[hiddenBias+j];
        for(let i=0;i<INPUTS;i++)z+=x[i]*w[i*HIDDEN+j];
        Z1[j]=z;h[j]=Math.tanh(z);
      }
      for(let k=0;k<OUTPUTS;k++){
        let z=w[outBias+k];
        for(let j=0;j<HIDDEN;j++)z+=h[j]*w[outStart+j*OUTPUTS+k];
        Z2[k]=z;out[k]=(Math.tanh(z)+1)/2;
      }
      // backward (MSE/2 per output)
      const dZ2=new Array(OUTPUTS);
      const dZ1=new Array(HIDDEN);
      for(let k=0;k<OUTPUTS;k++){
        const dA=2*(out[k]-T[k]);
        dZ2[k]=dA*(1-Math.tanh(Z2[k])**2);
      }
      for(let j=0;j<HIDDEN;j++){
        let dz=0;
        for(let k=0;k<OUTPUTS;k++)dz+=dZ2[k]*w[outStart+j*OUTPUTS+k];
        dZ1[j]=dz*(1-Math.tanh(Z1[j])**2);
      }
      for(let k=0;k<OUTPUTS;k++)grad[outBias+k]+=dZ2[k];
      for(let j=0;j<HIDDEN;j++){
        grad[hiddenBias+j]+=dZ1[j];
        for(let i=0;i<INPUTS;i++)grad[i*HIDDEN+j]+=x[i]*dZ1[j];
      }
      for(let k=0;k<OUTPUTS;k++){
        for(let j=0;j<HIDDEN;j++)grad[outStart+j*OUTPUTS+k]+=h[j]*dZ2[k];
      }
    }
    for(let i=0;i<LENGTH;i++)w[i]-=(lr*grad[i])/N;
    if(e===0||e===epochs-1||(e+1)%50===0){
      history.push({epoch:e+1,trainMse:mse(w,splits.train)});
    }
  }
  return {weights:w,history};
}

function evaluate(model,splits){
  const w=model.weights;
  const z=policy.zero().weights;
  const report={};
  for(const g of['train','val','holdout']){
    report[g]={
      sampleCount:splits[g].length,
      candidateMse:mse(w,splits[g]),
      baselineMse:mse(z,splits[g]) // constant (zero) baseline
    };
  }
  report.beatsBaselineOnHoldout=
    report.holdout.candidateMse<report.holdout.baselineMse;
  report.beatsBaselineOnValidation=
    report.val.candidateMse<report.val.baselineMse;
  return report;
}

function buildModel(weights){
  const m=policy.zero();
  m.weights=weights;
  policy.validate(m);
  return m;
}

function runPipeline({matches=60,frames=80,seed=20260714,epochs=200,learningRate=0.05}={}){
  const dataset=generate({matches,frames,seed});
  const splits=split(dataset);
  const trained=train(splits,{epochs,learningRate});
  const model=buildModel(trained.weights);
  const metrics=evaluate(model,splits);
  metrics.provenance={
    kind:'offline-visible-state-curriculum',
    label:'schema-5 dormant candidate; shadow-only; not promoted',
    seed,matches,frames,epochs,learningRate,
    splitBy:'matchId (disjoint train/val/holdout)',
    baseline:'constant zero model (predicts 0.5/0.5)',
    deterministic:true,
    note:'No engine win-rate and no promotion claim; holdout compared to a constant baseline.'
  };
  metrics.modelSha256=policy.sha(model);
  metrics.history=trained.history;
  return {dataset,splits,model,metrics};
}

function shaOf(obj){return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');}

function main(argv){
  const args=argv.slice(2);
  const get=(name,d)=>{
    const i=args.indexOf('--'+name);
    return i>=0?args[i+1]:String(d);
  };
  const matches=Number(get('matches',60));
  const frames=Number(get('frames',80));
  const seed=Number(get('seed',20260714));
  const epochs=Number(get('epochs',200));
  const learningRate=Number(get('learningRate',0.05));
  const out=args[args.indexOf('--out')+1];

  const {splits,model,metrics}=runPipeline({matches,frames,seed,epochs,learningRate});
  const summary={
    schema:5,
    arch:'32x20x2-tanh',
    provenance:metrics.provenance,
    modelSha256:metrics.modelSha256,
    splits:Object.fromEntries(Object.entries(splits).map(([k,v])=>[k,v.length])),
    results:{train:metrics.train,val:metrics.val,holdout:metrics.holdout},
    beatsBaselineOnHoldout:metrics.beatsBaselineOnHoldout,
    beatsBaselineOnValidation:metrics.beatsBaselineOnValidation,
    history:metrics.history
  };
  if(!metrics.beatsBaselineOnHoldout){
    console.error('schema-5 curriculum: candidate did NOT beat the constant baseline on holdout');
    process.exitCode=1;
  }
  if(out){
    fs.mkdirSync(out,{recursive:true});
    const modelPath=path.join(out,'schema5-model.json');
    const metricsPath=path.join(out,'schema5-metrics.json');
    fs.writeFileSync(modelPath,JSON.stringify(model));
    // A file cannot contain its own SHA-256 of its final bytes. Record the
    // metrics checksum in a sidecar, after the metrics file has been finalized.
    const finalMetrics={...summary,fileSha256:{model:shaOf(model)}};
    fs.writeFileSync(metricsPath,JSON.stringify(finalMetrics));
    const metricsSha256=crypto.createHash('sha256')
      .update(fs.readFileSync(metricsPath)).digest('hex');
    fs.writeFileSync(metricsPath+'.sha256',metricsSha256+'  schema5-metrics.json\n');
    summary.fileSha256={model:shaOf(model),metrics:metricsSha256};
    summary.metricsChecksumFile='schema5-metrics.json.sha256';
  }
  console.log(JSON.stringify(summary,null,2));
}

if(require.main===module)main(process.argv);

module.exports={INPUTS,HIDDEN,OUTPUTS,LENGTH,generate,split,train,evaluate,runPipeline,buildModel,shaOf,main};
