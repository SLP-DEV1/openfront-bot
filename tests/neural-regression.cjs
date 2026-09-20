'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const p=require('../trainer/policy.cjs');
const {parallelMap}=require('../trainer/parallel.cjs');
const {reward}=require('../trainer/reward.cjs');
const defeat=reward({validSample:true,confirmed:true,outcome:'defeat',land:30000,endTick:14000,ticks:18000});
const censored=reward({validSample:true,confirmed:false,outcome:'incomplete',land:97691,endTick:18000,ticks:18000});
const victory=reward({validSample:true,confirmed:true,outcome:'victory',land:0,endTick:100,ticks:18000});
assert(defeat<censored&&censored<victory,'confirmed loss < censored match < confirmed win');
assert(reward({validSample:false,confirmed:false,land:0,endTick:0,ticks:18000})<defeat);
assert(reward({validSample:true,confirmed:true,outcome:'defeat',land:0,endTick:1000,ticks:18000})<
  reward({validSample:true,confirmed:true,outcome:'defeat',land:0,endTick:9000,ticks:18000}));

const {compare}=require('../trainer/evaluation.cjs');
const pair=(seed,outcome,confirmed=true)=>({map:'World',nation:1,seed,outcome,confirmed});
assert.equal(compare([pair('one','defeat')],[pair('one','victory')]).promoted,true);
assert.equal(compare([pair('one','defeat')],[pair('one','incomplete',false)]).promoted,false);
assert.equal(compare([pair('one','defeat')],[pair('other','victory')]).valid,false);
assert.equal(compare([pair('one','victory')],[pair('one','victory')]).promoted,false);
assert.equal(compare([pair('one','defeat'),pair('two','defeat')],
  [pair('one','victory'),pair('one','victory')]).valid,false);
const root=path.resolve(__dirname,'..');
const exec=(args)=>{
  const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;
};
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
const fast=JSON.parse(exec(['trainer/train.mjs','--dryRun','true','--parallel','4']));
assert.equal(fast.parallel,4);
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
