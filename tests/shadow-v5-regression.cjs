'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const expected=require('../trainer/candidate-policy-v5.cjs');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'OpenFront_Solo_AggroBot.user.js'),'utf8');
const modelSource=fs.readFileSync(path.join(root,'trainer/candidate-policy-v5.cjs'),'utf8');
const prefix=modelSource.slice(modelSource.indexOf('const INPUTS=32'),modelSource.indexOf('function sha(model)'));
assert(source.includes(prefix),'deployed shadow inference must match exact candidate model functions');
const i=source.indexOf('  const shadowV5=(()=>{');
const j=source.indexOf('  // GENERATED-SHADOW-V5-END',i);
assert(i>0&&j>i);
const evaluator=source.slice(i,j).trim().replace(/^const shadowV5=/,'');
const actual=vm.runInNewContext(evaluator);
const model=expected.zero();
const state={home:500,maxTroops:1000,gold:10000,reserve:230,land:1200,capacityUse:.5};
const option={kind:'attack',costTroops:160,counterRisk:.4,holdProbability:.6};
const refFeatures=expected.features(state,option);
assert.deepEqual(Array.from(actual.features(state,option)),refFeatures);
assert.equal(actual.validate(model).schema,5);
assert.deepEqual(JSON.parse(JSON.stringify(actual.predict(model,refFeatures))),
 expected.predict(model,refFeatures));
// v5Score wiring (trainer variant D calibration): the live per-candidate
// score must be heldGain - lossRisk + training.kindBias[kind]; models
// without training.kindBias keep the exact pre-calibration score (no-op).
const vsI=source.indexOf('const v5Score=cand=>{');
assert(vsI>0,'live v5Score wiring missing');
let depth=0,vsEnd=-1;
for(let k=source.indexOf('{',vsI);k<source.length;k++){
  const ch=source[k];
  if(ch==='{')depth++;
  else if(ch==='}'){depth--;if(depth===0){vsEnd=k+1;break;}}
}
assert(vsEnd>vsI,'unbalanced v5Score block');
const wiring=mdl=>vm.runInNewContext(
  '(function(){'+source.slice(vsI,vsEnd)+';return v5Score;})()',
  {shadowV5:actual,shadowV5Model:mdl,state});
const mkCand=kind=>({id:kind,kind,cost:120,risk:.3});
const liveFeatures=cand=>actual.features(state,{kind:cand.kind,
  costTroops:cand.cost||0,counterRisk:cand.risk||0,
  holdProbability:1-Math.min(1,cand.risk||0)});
for(const kind of ['attack','hold','expand','invest','naval']){
  const cand=mkCand(kind),f=liveFeatures(cand),out=actual.predict(model,f);
  assert.equal(wiring(model)(cand),out.heldGain-out.lossRisk,kind+' no-bias no-op');
}
const biased={...model,training:{kindBias:{attack:0.5,hold:-0.25}}};
for(const [kind,delta] of [['attack',0.5],['hold',-0.25],['expand',0]]){
  const cand=mkCand(kind),f=liveFeatures(cand),out=actual.predict(biased,f);
  assert.equal(wiring(biased)(cand),out.heldGain-out.lossRisk+delta,kind+' bias wiring');
}
// The Run3 sibling bot must carry the same wiring (duplicate source).
const run3Source=fs.readFileSync(
  path.join(root,'OpenFront_AggroBot_Impossible_Run3.user.js'),'utf8');
assert(run3Source.includes(
  'const bias=Number(shadowV5Model.training?.kindBias?.[cand.kind])||0;'),
  'Run3 bot missing kindBias wiring');
assert(source.includes('changedIntent:false'));
assert(source.includes('if(opts.shadowRankEnabled&&shadowV5Model&&limited.length)'));
assert(source.includes('return planningState;'));
assert(source.includes('SHADOW_V5_BUNDLED_MODEL = null;'));
assert(source.includes('shadowRankEnabled:false'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aggrobot-shadow-'));
try{
 const modelFile=path.join(dir,'model.json'),out=path.join(dir,'shadow.user.js');
 fs.writeFileSync(modelFile,JSON.stringify(model));
 let p=spawnSync(process.execPath,['trainer/shadow-deploy.mjs',
 '--model',modelFile,'--out',out],{cwd:root,encoding:'utf8',timeout:30000});
 assert.equal(p.status,0,p.stderr);
 assert(fs.readFileSync(out,'utf8').includes('const SHADOW_V5_BUNDLED_MODEL = {"schema":5'));
 assert.equal(JSON.parse(p.stdout).modelEnabledByDefault,false);
 fs.writeFileSync(modelFile,JSON.stringify({schema:99}));
 const invalid=path.join(dir,'no.user.js');
 p=spawnSync(process.execPath,['trainer/shadow-deploy.mjs',
 '--model',modelFile,'--out',invalid],{cwd:root,encoding:'utf8',timeout:30000});
 assert.notEqual(p.status,0);
 assert.equal(fs.existsSync(invalid),false);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('PASS shadow-v5 source/model parity, opt-in only, separate deploy and invalid rejection');
