// Build a Tampermonkey-ready copy. Never modify the repository source file.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import policy from './policy.cjs';
import actionPolicy from './action-policy.cjs';
const args={model:null,out:'OpenFront_Solo_AggroBot_Neural.user.js',
  source:'OpenFront_Solo_AggroBot.user.js'};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(!key.startsWith('--')||!Object.hasOwn(args,key.slice(2)))throw Error('Unknown option '+key);
  const value=process.argv[++i];if(!value||value.startsWith('--'))throw Error('Missing '+key);
  args[key.slice(2)]=value;
}
if(!args.model)throw Error('Supply a confirmed champion using --model');
const input=JSON.parse(fs.readFileSync(args.model,'utf8'));
const chosen=input?.schema===2?actionPolicy:policy;
const model=chosen.validate(input);
const source=path.resolve(args.source),out=path.resolve(args.out);
if(source===out||out===path.resolve(args.model))throw Error('Refuse overwrite of source/model');
const script=fs.readFileSync(source,'utf8'),needle='const NEURAL_BUNDLED_MODEL = null;';
if(script.split(needle).length!==2)throw Error('Source missing unique neural placeholder');
const next=script.replace(needle,
  'const NEURAL_BUNDLED_MODEL = '+JSON.stringify(model)+';');
fs.writeFileSync(out,next,{flag:'wx'});
const test=spawnSync(process.execPath,['--check',out],{encoding:'utf8'});
if(test.status!==0){
  fs.unlinkSync(out);throw Error('Generated userscript syntax failed: '+test.stderr);
}
console.log(JSON.stringify({out,modelSHA256:chosen.sha(model),
  modelEnabledByDefault:false,syntax:'PASS'}));
