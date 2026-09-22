#!/usr/bin/env node
// Generate a separate, explicit opt-in shadow-only userscript. Never change
// Solo, Run3, the champion or model promotion state.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import candidate from './candidate-policy-v5.cjs';
const opts={model:null,out:null,source:'OpenFront_AggroBot_Impossible_Run3.user.js'};
for(let i=2;i<process.argv.length;i++){
 const key=process.argv[i].replace(/^--/,'');
 if(!process.argv[i].startsWith('--')||!Object.hasOwn(opts,key))throw Error('Unknown option '+key);
 const v=process.argv[++i];if(!v||v.startsWith('--'))throw Error('Missing '+key);
 opts[key]=v;
}
if(!opts.model||!opts.out)throw Error('Usage: --model CANDIDATE_V5.json --out SHADOW.user.js [--source Run3.user.js]');
const model=candidate.validate(JSON.parse(fs.readFileSync(opts.model,'utf8')));
const source=path.resolve(opts.source),out=path.resolve(opts.out),modelPath=path.resolve(opts.model);
if(out===source||out===modelPath||fs.existsSync(out))throw Error('Refuse overwrite');
const input=fs.readFileSync(source,'utf8'),needle='const SHADOW_V5_BUNDLED_MODEL = null;';
if(input.split(needle).length!==2)throw Error('Shadow marker missing/not unique');
const generated=input.replace(needle,'const SHADOW_V5_BUNDLED_MODEL = '+JSON.stringify(model)+';');
fs.writeFileSync(out,generated,{flag:'wx'});
const check=spawnSync(process.execPath,['--check',out],{encoding:'utf8'});
if(check.status!==0){fs.unlinkSync(out);throw Error('Generated shadow userscript syntax failed: '+check.stderr);}
console.log(JSON.stringify({out,modelSHA256:candidate.sha(model),
  schema:5,shadowOnly:true,modelEnabledByDefault:false,syntax:'PASS'}));
