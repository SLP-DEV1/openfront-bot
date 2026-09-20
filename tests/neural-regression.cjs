'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const p=require('../trainer/policy.cjs');
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
console.log('Neural policy, dry-run, deployment regression: PASS');
