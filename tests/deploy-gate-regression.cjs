'use strict';
// P6: the schema-5 candidate ranker may only be bundled by deploy.mjs behind
// an explicit Schema/Runtime/Feature/SHA contract and a passed release gate,
// and it is always embedded into the SHADOW_V5_BUNDLED_MODEL placeholder so
// the champion (NEURAL_BUNDLED_MODEL) is never replaced by a candidate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const candidate=require(path.join(root,'trainer','candidate-policy-v5.cjs'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aggrobot-deploy-'));
try{
 const modelFile=path.join(dir,'candidate.json');
 const gateFile=path.join(dir,'gate.json');
 const out=path.join(dir,'out.user.js');
 const source=path.join(root,'OpenFront_Solo_AggroBot.user.js');
 const championFile=path.join(root,'docs','training-analysis-20260921',
   'schema4-impossible-world-europe-20260920-run3','champion.json');
 const model=candidate.zero();
 const sha=candidate.sha(model);
 fs.writeFileSync(modelFile,JSON.stringify(model));
 const writeGate=(arms,over={})=>fs.writeFileSync(gateFile,JSON.stringify(Object.assign(
   {protocol:{},rows:[],gate:{valid:true,eligible:true,reason:'ok'},
    gatesPass:true,eligible:true},over,{arms})));
 const run=(...extra)=>spawnSync(process.execPath,
   ['trainer/deploy.mjs','--model',modelFile,'--source',source,'--out',out,
    ...extra],{cwd:root,encoding:'utf8',timeout:30000});

 // 1. schema-5 without a gate is refused.
 let p=run();
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/gate/i);
 assert.equal(fs.existsSync(out),false);

 // 2. schema-5 behind a non-passing gate is refused.
 writeGate({candidate:{botSHA256:'a'.repeat(64),policySHA256:sha}},
   {gate:{valid:true,eligible:false,reason:'no-verified-improvement'}});
 p=run('--gate',gateFile);
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/Release gate not passed/i);
 assert.equal(fs.existsSync(out),false);

 // 3. schema-5 behind a passing gate but negative eligibility is refused.
 writeGate({candidate:{botSHA256:'a'.repeat(64),policySHA256:sha}},
   {gate:{valid:true,eligible:true,reason:'ok'},gatesPass:false,eligible:false});
 p=run('--gate',gateFile);
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/eligibility not passed/i);
 assert.equal(fs.existsSync(out),false);

 // 4. schema-5 whose SHA does not match the gate arm is refused.
 writeGate({candidate:{botSHA256:'a'.repeat(64),policySHA256:'b'.repeat(64)}});
 p=run('--gate',gateFile);
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/SHA does not match/i);
 assert.equal(fs.existsSync(out),false);

 // 5. schema-5 behind a passing gate embeds into SHADOW_V5_BUNDLED_MODEL and
 //    leaves the champion placeholder untouched.
 writeGate({candidate:{botSHA256:'a'.repeat(64),policySHA256:sha}});
 p=run('--gate',gateFile);
 assert.equal(p.status,0,p.stderr);
 const info=JSON.parse(p.stdout);
 assert.equal(info.role,'shadow-candidate');
 assert.equal(info.modelSHA256,sha);
 assert.equal(info.gate,'passed');
 assert.equal(info.modelEnabledByDefault,false);
 const generated=fs.readFileSync(out,'utf8');
 assert.equal(generated.split('const SHADOW_V5_BUNDLED_MODEL = {').length-1,1);
 assert.equal(generated.split('const SHADOW_V5_BUNDLED_MODEL = null;').length-1,0);
 assert.equal(generated.split('const NEURAL_BUNDLED_MODEL = null;').length-1,1);

 // 6. schema-5 into a source missing the generated shadowV5 module is refused
 //    (runtime contract).
 const badSource=path.join(dir,'bad-source.user.js');
 fs.writeFileSync(badSource,fs.readFileSync(source,'utf8')
   .replace('  // GENERATED-SHADOW-V5-BEGIN','  // SHADOW-V5-START')
   .replace('  // GENERATED-SHADOW-V5-END','  // SHADOW-V5-STOP'));
 const badOut=path.join(dir,'bad-out.user.js');
 p=spawnSync(process.execPath,['trainer/deploy.mjs','--model',modelFile,
   '--source',badSource,'--out',badOut,'--gate',gateFile],
   {cwd:root,encoding:'utf8',timeout:30000});
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/runtime contract/i);

 // 7. schema-4 champion still embeds into NEURAL_BUNDLED_MODEL (champion path
 //    unchanged) and does not require a gate.
 const champOut=path.join(dir,'champ.user.js');
 p=spawnSync(process.execPath,['trainer/deploy.mjs','--model',championFile,
   '--source',source,'--out',champOut],{cwd:root,encoding:'utf8',timeout:30000});
 assert.equal(p.status,0,p.stderr);
 const champInfo=JSON.parse(p.stdout);
 assert.equal(champInfo.role,'champion');
 assert.equal(champInfo.modelEnabledByDefault,true);
 const champ=fs.readFileSync(champOut,'utf8');
 assert.equal(champ.split('const NEURAL_BUNDLED_MODEL = {').length-1,1);
 assert.equal(champ.split('const SHADOW_V5_BUNDLED_MODEL = null;').length-1,1);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('PASS deploy.mjs gated schema-5 contract + shadow embedding + champion path');
