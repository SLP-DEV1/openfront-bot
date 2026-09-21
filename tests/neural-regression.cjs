'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const p=require('../trainer/policy.cjs');
const action=require('../trainer/action-policy.cjs');
const strategic=require('../trainer/strategic-policy.cjs');
const strategicV4=require('../trainer/strategic-policy-v4.cjs');
const {parallelMap}=require('../trainer/parallel.cjs');
const {reward}=require('../trainer/reward.cjs');
const defeat=reward({validSample:true,confirmed:true,outcome:'defeat',land:30000,endTick:14000,ticks:18000});
const censored=reward({validSample:true,confirmed:false,outcome:'incomplete',land:97691,endTick:18000,ticks:18000});
const victory=reward({validSample:true,confirmed:true,outcome:'victory',land:0,endTick:100,ticks:18000});
assert(defeat<censored&&censored<victory,'confirmed loss < censored match < confirmed win');
assert(reward({validSample:false,confirmed:false,land:0,endTick:0,ticks:18000})<defeat);
const progress={summary:{peakLand:97691,meanLand:45000,retention:1}};
assert(reward({validSample:true,confirmed:false,land:97691,endTick:18000,ticks:18000,
  trajectory:progress})>censored);
assert(reward({validSample:true,confirmed:true,outcome:'defeat',land:30000,
  endTick:14000,ticks:18000,trajectory:progress})<censored);
assert(reward({validSample:true,confirmed:true,outcome:'defeat',land:0,endTick:1000,ticks:18000})<
  reward({validSample:true,confirmed:true,outcome:'defeat',land:0,endTick:9000,ticks:18000}));

// Resolve the exact evaluation module used by train.mjs. This also catches
// local changes to evaluation-v2 instead of silently testing the old scorer.
const trainerSource=fs.readFileSync(path.join(__dirname,'../trainer/train.mjs'),'utf8');
const evaluationImport=trainerSource.match(/import evaluation from '\.\/(evaluation(?:-v[0-9]+)?\.cjs)'/);
assert(evaluationImport,'Trainer evaluation import not found');
const evaluationFile=path.join(__dirname,'../trainer',evaluationImport[1]);
assert(fs.existsSync(evaluationFile),'Trainer evaluation module missing: '+evaluationFile);
const {compare}=require(evaluationFile);
// Rows mirror train.mjs: verified tick-limit rows are censored outcomes
// with confirmed=false but validSample=true.
const pair=(seed,outcome,confirmed=true,endTick=4000,land=1000)=>
  ({map:'World',nation:1,difficulty:'Impossible',seed,outcome,confirmed,
    validSample:true,exitCode:0,endTick,land});
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','victory'),pair('two','defeat')]).promoted,true);
// One confirmed victory still beats zero, even with a censored pair.
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','incomplete',false),pair('two','victory')]).promoted,true);
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('other','victory'),pair('two','defeat')]).valid,false);
// Added victories must not silently override losses on other paired seeds.
const incumbentMixed=[pair('one','incomplete',false,18000,50000),
  pair('two','incomplete',false,18000,50000),
  pair('three','incomplete',false,18000,50000)];
const candidateMixed=[pair('one','victory'),
  pair('two','defeat'),pair('three','defeat')];
const blockedMixed=compare(incumbentMixed,candidateMixed);
assert.equal(blockedMixed.valid,true);
assert.equal(blockedMixed.regressed,2);
assert.equal(blockedMixed.promoted,false);
assert.equal(blockedMixed.reason,'regressions-block-promotion');
// A single censored survival gain is not yet repeatable progress.
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','incomplete',false,18000,50000),pair('two','defeat')]).promoted,false);
// Repeated censored survival gains qualify even without tick gains.
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','incomplete',false,18000,50000),
   pair('two','incomplete',false,18000,45000)]).reason,
  'consistent-survival-improvement');
// Two fully censored pairs compare territory at the shared cap.
assert.equal(compare([pair('one','incomplete',false,18000,20000),
   pair('two','incomplete',false,18000,30000)],
  [pair('one','incomplete',false,18000,45000),
   pair('two','incomplete',false,18000,35000)]).promoted,true);
assert.equal(compare([pair('one','incomplete',false,18000,45000),
   pair('two','incomplete',false,18000,35000)],
  [pair('one','incomplete',false,18000,20000),
   pair('two','incomplete',false,18000,30000)]).promoted,false);
// Ticking out where the incumbent won is a regression, never a gain.
assert.equal(compare([pair('one','victory'),pair('two','defeat')],
  [pair('one','incomplete',false,18000,40000),pair('two','defeat')]).promoted,false);
assert.equal(compare([pair('one','victory'),pair('two','defeat')],
  [pair('one','victory'),pair('two','defeat')]).promoted,false);
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','victory'),pair('one','victory')]).valid,false);
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [{...pair('one','victory'),difficulty:'Hard'},pair('two','victory')]).valid,false);
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','defeat',true,4400),pair('two','defeat',true,4400)]).reason,
  'consistent-survival-improvement');
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','defeat',true,4400),pair('two','defeat',true,3800)]).promoted,false);
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','defeat',true,4400),
   {...pair('two','defeat',false,4400),validSample:false}]).valid,false);
const root=path.resolve(__dirname,'..');
const exec=(args)=>{
  const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;
};
assert.equal(action.LENGTH,217);
assert.equal(strategic.LENGTH,544);
assert.equal(strategicV4.LENGTH,1000);
const z4=strategicV4.zero(),v4=strategicV4.features({home:9000,max:10000,
  incoming:500,strongest:3000,secondary:2500,land:5000,landLoss:650,
  trainIncome:120000,tradeIncome:800000,uncovered:3,defenses:2,
  navalFailures:4,recentPressure:true});
assert.equal(v4.length,24);
assert(v4.every(x=>x>=0&&x<=1));
assert.deepEqual(Object.values(strategicV4.predict(z4,v4)),Array(16).fill(0));
const trained4=strategicV4.mutate(z4,'strategic-v4',.12);
assert.deepEqual(trained4,strategicV4.mutate(z4,'strategic-v4',.12));
assert(trained4.weights.some(w=>w!==0));
assert.throws(()=>strategicV4.validate({...z4,weights:[]}));
assert.equal(strategic.OUTPUTS.length,16);
const z3=strategic.zero(),v3=strategic.features({home:9000,max:10000,
  incoming:800,committed:600,strongest:3000,gold:420000,land:1100,
  neutral:true,foes:3,activeEnemy:1,available:4400,growthPotential:40,
  cities:2,ports:1,war:true,thirdParty:true});
assert.equal(v3.length,16);
assert(v3.every(x=>x>=0&&x<=1));
assert.deepEqual(Object.values(strategic.predict(z3,v3)),Array(16).fill(0));
const trained3=strategic.mutate(z3,'strategic-v3',.12);
assert.deepEqual(trained3,strategic.mutate(z3,'strategic-v3',.12));
assert(trained3.weights.some((v,i)=>v!==z3.weights[i]));
assert.deepEqual(Object.keys(strategic.predict(trained3,v3)),strategic.OUTPUTS);
assert.throws(()=>strategic.validate({...z3,weights:[]}));
assert.throws(()=>strategic.predict(z3,[9]));
const a0=action.zero(),aState={home:850,max:1000,incoming:0,committed:0,
  strongest:100,gold:600000,land:1600,late:false,neutral:true};
const vectors=action.KINDS.map(kind=>action.features(aState,kind,30));
assert.equal(vectors.length,3);
assert(vectors.every(v=>v.length===16&&v.every(x=>x>=-1&&x<=1)));
assert(vectors.every(v=>action.predict(a0,v)===0));
const aPlus=action.mutate(a0,'action-seed',.3);
assert.deepEqual(aPlus,action.mutate(a0,'action-seed',.3));
assert(aPlus.weights.some(w=>w!==0));
assert(action.predict(aPlus,vectors[0])<=1);
const naval=action.features(aState,'naval',-90,{
  magnitude:1,opportunity:.2,cost:.6,risk:.9});
assert.equal(naval.length,16);
assert.equal(naval[11],-.6);
assert.doesNotThrow(()=>action.predict(aPlus,naval));
assert.throws(()=>action.features(aState,'unknown',0));
assert.throws(()=>action.validate({...a0,weights:[0]}));
assert.throws(()=>action.validate({...a0,weights:[...a0.weights.slice(0,-1),Infinity]}));
assert.throws(()=>action.predict(a0,[3]));
assert(action.predict({...a0,weights:a0.weights.map((w,i)=>i===216?3:w)},vectors[0])>.99);
assert.equal(p.LENGTH,90);
const base=p.zero(),v=p.features({home:700,max:1000,incoming:0,
  strongest:200,committed:0,neutral:true,foes:1,land:1200,late:false});
assert.equal(v.length,8);
assert(v.every(x=>x>=0&&x<=1));
assert.deepEqual(p.predict(base,v),[0,0],'zero model is rule-only');
const plus=p.mutate(base,'seed',.3,1),minus=p.mutate(base,'seed',.3,-1);
assert.deepEqual(plus,p.mutate(base,'seed',.3,1));
assert(plus.weights.some(x=>x!==0));
for(let i=0;i<p.LENGTH;i++)assert(Math.abs(plus.weights[i]+minus.weights[i])<1e-9);
assert(p.predict(plus,v).every(x=>Number.isFinite(x)&&Math.abs(x)<=1));
assert.throws(()=>p.validate({...base,weights:[0]}));
assert.throws(()=>p.validate({...base,weights:[...base.weights.slice(1),NaN]}));
assert.throws(()=>p.predict(base,[1,2]));
const dry=JSON.parse(exec(['trainer/train.mjs','--dryRun','true',
  '--generations','2','--population','2','--trainSeeds','1',
  '--evalSeeds','2','--nations','1','--maps','World']));
assert.equal(dry.matches,2*(1*(1*(2+1)+2*2)));
assert.equal(dry.parallel,2);
assert.equal(dry.policySchema,3);
const dryV4=JSON.parse(exec(['trainer/train.mjs','--dryRun','true','--schema','4',
  '--maps','World','--nations','1']));
assert.equal(dryV4.policySchema,4);
assert.equal(dry.difficulty,'Impossible');
for(const difficulty of ['Medium','Hard','Impossible']){
  const plan=JSON.parse(exec(['trainer/train.mjs','--dryRun','true',
    '--difficulty',difficulty,'--maps','World','--nations','1']));
  assert.equal(plan.difficulty,difficulty);
}
const germanCase=JSON.parse(exec(['trainer/train.mjs','--dryRun','true',
  '--difficulty','hard']));
assert.equal(germanCase.difficulty,'Hard');
const invalidDifficulty=spawnSync(process.execPath,
  ['trainer/train.mjs','--dryRun','true','--difficulty','Easy'],
  {cwd:root,encoding:'utf8'});
assert.notEqual(invalidDifficulty.status,0);
assert.match(invalidDifficulty.stderr,/Invalid --difficulty/);
const batch=fs.readFileSync(path.join(root,'Train_Strategic_Neural.bat'),'utf8');
assert.match(batch,/choice \/C 123/);
assert.match(batch,/--difficulty %DIFFICULTY%/);
const multiBatch=fs.readFileSync(path.join(root,'Train_Multiplayer_Neural.bat'),'utf8');
assert.match(multiBatch,/--gameType Public/);
assert.match(multiBatch,/--scriptedHumans 4/);
assert.match(multiBatch,/--opponentProfile mixed/);
assert.match(multiBatch,/--parallel %PARALLEL%/);
const fast=JSON.parse(exec(['trainer/train.mjs','--dryRun','true','--parallel','4']));
assert.equal(fast.parallel,4);
const wide=JSON.parse(exec(['trainer/train.mjs','--dryRun','true','--parallel','16']));
assert.equal(wide.parallel,16);
const multi=JSON.parse(exec(['trainer/train.mjs','--dryRun','true','--schema','4',
  '--gameType','Public','--gameMode','FFA','--scriptedHumans','4',
  '--opponentProfile','mixed','--nations','0','--maps','World']));
assert.equal(multi.gameType,'Public');
assert.equal(multi.gameMode,'FFA');
assert.equal(multi.scriptedHumans,4);
assert.equal(multi.opponentProfile,'mixed');
assert.deepEqual(multi.nations,[0]);
const invalidHumanMode=spawnSync(process.execPath,
  ['trainer/train.mjs','--dryRun','true','--scriptedHumans','2'],
  {cwd:root,encoding:'utf8'});
assert.notEqual(invalidHumanMode.status,0);
assert.match(invalidHumanMode.stderr,/requires --gameType Public or Private/);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aggrobot-neural-'));
try{
  const model=path.join(temp,'champion.json'),out=path.join(temp,'bot.user.js');
  fs.writeFileSync(model,JSON.stringify(plus));
  const deployed=JSON.parse(exec(['trainer/deploy.mjs','--model',model,'--out',out]));
  assert.equal(deployed.modelSHA256,p.sha(plus));
  assert.equal(deployed.modelEnabledByDefault,false);
  assert(fs.readFileSync(out,'utf8').includes('const NEURAL_BUNDLED_MODEL = {"schema":1'));
  const bad=spawnSync(process.execPath,['trainer/deploy.mjs','--model',model,'--out',out],
    {cwd:root,encoding:'utf8'});
  assert.notEqual(bad.status,0,'do not overwrite existing deployed bot');
  const deployedV2=path.join(temp,'action.user.js');
  fs.writeFileSync(model,JSON.stringify(aPlus));
  const v2=JSON.parse(exec(['trainer/deploy.mjs','--model',model,'--out',deployedV2]));
  assert.equal(v2.modelSHA256,action.sha(aPlus));
  assert(fs.readFileSync(deployedV2,'utf8').includes('const NEURAL_BUNDLED_MODEL = {"schema":2'));
  const deployedV3=path.join(temp,'strategic.user.js');
  fs.writeFileSync(model,JSON.stringify(trained3));
  const v3=JSON.parse(exec(['trainer/deploy.mjs','--model',model,'--out',deployedV3]));
  assert.equal(v3.modelSHA256,strategic.sha(trained3));
  assert.equal(v3.modelEnabledByDefault,true);
  assert(fs.readFileSync(deployedV3,'utf8').includes('const NEURAL_BUNDLED_MODEL = {"schema":3'));
  const deployedV4=path.join(temp,'strategic-v4.user.js');
  fs.writeFileSync(model,JSON.stringify(trained4));
  const deployed4=JSON.parse(exec(['trainer/deploy.mjs','--model',model,'--out',deployedV4]));
  assert.equal(deployed4.modelSHA256,strategicV4.sha(trained4));
  assert.equal(deployed4.modelEnabledByDefault,true);
  assert(fs.readFileSync(deployedV4,'utf8').includes('const NEURAL_BUNDLED_MODEL = {"schema":4'));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
(async()=>{
  let active=0,peak=0;
  const tasks=Array.from({length:11},(_,i)=>i);
  const actual=await parallelMap(tasks,4,async i=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,(i%3+1)*3));
    active--;
    return i*i;
  });
  assert(peak<=4&&peak>1,'match pool must actually run concurrently, but remain bounded');
  assert.deepEqual(actual,tasks.map(i=>i*i),'completion order must not reorder seeds');
  assert.deepEqual(await parallelMap([],4,async()=>0),[]);
  await assert.rejects(parallelMap([1,2],0,async()=>0));
  console.log('Neural policy, concurrent match pool, dry-run and deployment: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
