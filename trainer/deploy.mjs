// Build a Tampermonkey-ready copy. Never modify the repository source file.
//
// Schemas 1-4 are champion policies and are embedded into the
// NEURAL_BUNDLED_MODEL placeholder. Schema 5 is the evaluation-only candidate
// ranker: it may only be bundled behind an explicit, verified
// Schema-/Runtime-/Feature-/SHA contract and a passed release gate, and it is
// ALWAYS embedded into the SHADOW_V5_BUNDLED_MODEL placeholder (never the
// champion placeholder), so a gated candidate deployment can never replace
// the existing Run3 champion.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import policy from './policy.cjs';
import actionPolicy from './action-policy.cjs';
import strategicPolicy from './strategic-policy.cjs';
import strategicPolicyV4 from './strategic-policy-v4.cjs';
import candidatePolicy from './candidate-policy-v5.cjs';
const args={model:null,out:'OpenFront_Solo_AggroBot_Neural.user.js',
  source:'OpenFront_Solo_AggroBot.user.js',gate:null};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(!key.startsWith('--')||!Object.hasOwn(args,key.slice(2)))throw Error('Unknown option '+key);
  const value=process.argv[++i];if(!value||value.startsWith('--'))throw Error('Missing '+key);
  args[key.slice(2)]=value;
}
if(!args.model)throw Error('Supply a confirmed champion using --model');
const input=JSON.parse(fs.readFileSync(args.model,'utf8'));
const policies=new Map([[1,policy],[2,actionPolicy],[3,strategicPolicy],
  [4,strategicPolicyV4],[5,candidatePolicy]]);
const isCandidate=input?.schema===5;
const chosen=policies.get(input?.schema);
if(!chosen)throw Error('Unsupported model schema: '+String(input?.schema));
// Schema contract: the model must validate for its declared schema/arch.
const model=chosen.validate(input);
let releaseGate=null;
if(isCandidate){
  // Release gate: a candidate may only be deployed behind a passed gate.
  if(!args.gate)
    throw Error('Schema-5 candidate requires a passed --gate <holdout.json>');
  const gate=JSON.parse(fs.readFileSync(path.resolve(args.gate),'utf8'));
  releaseGate=gate;
  const g=gate?.gate??{};
  if(g.valid!==true||g.eligible!==true)
    throw Error('Release gate not passed: '+
      JSON.stringify({valid:g.valid,eligible:g.eligible,reason:g.reason}));
  if(gate?.gatesPass!==true||gate?.eligible!==true)
    throw Error('Release gate negative gates/eligibility not passed: '+
      JSON.stringify({gatesPass:gate?.gatesPass,eligible:gate?.eligible}));
  // SHA contract: the deployed model must be the exact model evaluated in the
  // gate (arms.candidate.policySHA256).
  const declared=gate?.arms?.candidate?.policySHA256;
  if(!/^[a-f0-9]{64}$/i.test(declared??'')||
     declared.toLowerCase()!==chosen.sha(model).toLowerCase())
    throw Error('Candidate SHA does not match release-gate candidate arm');
  // Feature contract: the runtime feature builder emits exactly INPUTS
  // features in [0,1]; an out-of-range or mis-sized vector would be feature
  // drift between test and live.
  const probe=chosen.features({home:1,gold:1,land:1},{kind:'attack',costTroops:0});
  if(!Array.isArray(probe)||probe.length!==chosen.INPUTS||
     probe.some(x=>!Number.isFinite(x)||x<0||x>1))
    throw Error('Feature contract mismatch: expected '+chosen.INPUTS+' features in [0,1]');
}
const source=path.resolve(args.source),out=path.resolve(args.out);
if(source===out||out===path.resolve(args.model))throw Error('Refuse overwrite of source/model');
const script=fs.readFileSync(source,'utf8');
const placeholder=isCandidate?'const SHADOW_V5_BUNDLED_MODEL = null;':
  'const NEURAL_BUNDLED_MODEL = null;';
if(script.split(placeholder).length!==2)
  throw Error('Source missing unique '+(isCandidate?'shadow':'neural')+' placeholder');
if(isCandidate&&(!script.includes('GENERATED-SHADOW-V5-BEGIN')||
   !script.includes('GENERATED-SHADOW-V5-END')))
  throw Error('Source missing generated shadowV5 runtime module (runtime contract)');
const markerName=isCandidate?'SHADOW_V5_BUNDLED_MODEL':'NEURAL_BUNDLED_MODEL';
const next=script.replace(placeholder,'const '+markerName+' = '+
  JSON.stringify(model)+';');
// The P5 holdout already freezes the SHA256 of the fully embedded candidate
// source in arms.candidate.botSHA256. Bind that SAME evaluated artifact to
// deployment: a model-only hash cannot protect against changed runtime code.
if(isCandidate){
  const expected=releaseGate?.arms?.candidate?.botSHA256;
  const actual=crypto.createHash('sha256').update(next).digest('hex');
  if(!/^[a-f0-9]{64}$/i.test(expected??'')||
     expected.toLowerCase()!==actual)
    throw Error('Candidate deployment runtime/source SHA does not match release gate');
}
fs.writeFileSync(out,next,{flag:'wx'});
const test=spawnSync(process.execPath,['--check',out],{encoding:'utf8'});
if(test.status!==0){
  fs.unlinkSync(out);throw Error('Generated userscript syntax failed: '+test.stderr);
}
console.log(JSON.stringify({out,modelSHA256:chosen.sha(model),
  role:isCandidate?'shadow-candidate':'champion',
  modelEnabledByDefault:[3,4].includes(model.schema),
  gate:isCandidate?'passed':null,
  gateReason:isCandidate?JSON.parse(fs.readFileSync(path.resolve(args.gate),'utf8')).gate.reason:null,
  syntax:'PASS'}));
