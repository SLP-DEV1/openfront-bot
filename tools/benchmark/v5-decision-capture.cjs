#!/usr/bin/env node
'use strict';
// Mandate §6: decision-impact CAPTURE. Runs the SAME bot source across FOUR
// arms that differ ONLY by the injected model(s), each with --planningFrames
// so tools/benchmark/v5-decision-impact.cjs can later measure per-arm:
//   rule-basis    -> no model
//   run3-schema4  -> schema-4 Run3 champion (biases planners only)
//   schema-5      -> schema-5 M2 driving the bounded candidate control
//   hybrid        -> schema-4 Run3 + schema-5 M2 together
// Scenarios span 3 engine modes (1v1 / official-2v2 / ffa-duo) x map x opponent,
// one match per cell, using a fresh `v5di-*` seed namespace (disjoint from the
// training + final-holdout namespaces). Isolation is by model, not code/seed.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const common=require('./common.cjs');
const policyV4=require('../../trainer/strategic-policy-v4.cjs');
const candidateV5=require('../../trainer/candidate-policy-v5.cjs');

const MODE_CONFIG={
  '1v1':{gameMode:'FFA',bots:2,nations:2,scriptedHumans:1},
  'official-2v2':{gameMode:'Team',bots:2,nations:2,scriptedHumans:3},
  'ffa-duo':{gameMode:'FFA',bots:40,nations:8,scriptedHumans:3}
};
const ARM_ORDER=['rule-basis','run3-schema4','schema-5','hybrid'];
function parseArgs(argv){
  const o={bot:null,run3Policy:null,candidateModel:null,engine:null,
    engineCommit:common.ENGINE_COMMIT,out:null,smoke:false,
    maps:'World,Europe',opponents:'balanced,rush',
    size:'Compact',difficulty:'Medium',gain:18,ticks:18000};
  for(let i=0;i<argv.length;i++){
    const key=argv[i].replace(/^--/,'');
    if(!argv[i].startsWith('--')||!Object.hasOwn(o,key))throw Error('Unknown option '+argv[i]);
    if(key==='smoke'){o[key]=true;continue;}
    if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value for '+argv[i]);
    o[key]=argv[++i];
  }
  o.maps=o.maps.split(',').map(s=>s.trim()).filter(Boolean);
  o.opponents=o.opponents.split(',').map(s=>s.trim()).filter(Boolean);
  o.gain=Number(o.gain);o.ticks=Number(o.ticks);
  if(!o.bot)throw Error('--bot <userscript> is required');
  if(!o.run3Policy)throw Error('--run3Policy <schema-4 champion.json> is required');
  if(!o.candidateModel)throw Error('--candidateModel <schema-5 model.json> is required');
  if(!/^[a-f0-9]{40}$/.test(o.engineCommit))throw Error('Invalid --engineCommit SHA');
  o.bot=path.resolve(o.bot);o.run3Policy=path.resolve(o.run3Policy);
  o.candidateModel=path.resolve(o.candidateModel);
  if(o.engine)o.engine=path.resolve(o.engine);
  if(o.out)o.out=path.resolve(o.out);
  return o;
}
// Per-arm engine args on the SAME bot. hybrid loads BOTH --policy (schema-4)
// and --candidateControl (schema-5); engine-match composes them.
function armEngineArgs(o,arm){
  switch(arm){
    case 'rule-basis':return ['--profile','autonomous','--planningFrames','true'];
    case 'run3-schema4':
      return ['--profile','autonomous','--planningFrames','true',
        '--policy',o.run3Policy];
    case 'schema-5':
      return ['--profile','autonomous','--planningFrames','true',
        '--candidateControl','true','--candidateModel',o.candidateModel,
        '--candidateGain',String(o.gain)];
    case 'hybrid':
      return ['--profile','autonomous','--planningFrames','true',
        '--policy',o.run3Policy,'--candidateControl','true',
        '--candidateModel',o.candidateModel,'--candidateGain',String(o.gain)];
    default:throw Error('Unknown arm '+arm);
  }
}
function buildScenarios(o){
  const scenarios=[];let n=0;
  for(const mode of Object.keys(MODE_CONFIG))
  for(const map of o.maps)for(const opponent of o.opponents){
    n++;
    const tag=`${mode}-${map}-${opponent}`.toLowerCase();
    scenarios.push({scenarioId:`v5di-${tag}`,
      matchSeed:`v5di-${tag}-${n}`.slice(0,64),mode,map,opponent});
  }
  return scenarios;
}
function runMatch(o,scenario,arm){
  const cfg=MODE_CONFIG[scenario.mode];
  const dir=path.join(o.out,scenario.scenarioId,arm);
  fs.mkdirSync(dir,{recursive:true});
  const args=[path.join(__dirname,'engine-match.mjs'),
    '--bot',o.bot,'--engine',o.engine,'--engineCommit',o.engineCommit,
    '--seed',scenario.matchSeed,'--gameMode',cfg.gameMode,'--map',scenario.map,
    '--size',o.size,'--difficulty',o.difficulty,'--bots',String(cfg.bots),
    '--nations',String(cfg.nations),'--scriptedHumans',String(cfg.scriptedHumans),
    '--opponentProfile',scenario.opponent,'--ticks',String(o.ticks),
    '--out',dir,...armEngineArgs(o,arm)];
  const r=spawnSync(process.execPath,args,{encoding:'utf8'});
  let report=null;
  try{report=JSON.parse(fs.readFileSync(path.join(dir,'match.json'),'utf8'));}
  catch(_){/* no report */}
  const frames=(report&&report.planningFrames)?report.planningFrames.length:0;
  const row={scenarioId:scenario.scenarioId,arm,
    mode:scenario.mode,map:scenario.map,opponent:scenario.opponent,
    matchSeed:scenario.matchSeed,exitCode:r.status,
    termination:report?.run?.termination??null,
    outcome:report?.gameEnd?.outcome??'incomplete',
    endLand:report?.finalState?.land??null,
    frames,botSHA256:report?.benchmarkMeta?.botSHA256??null,
    policySHA256:report?.benchmarkMeta?.policySHA256??null};
  console.log(JSON.stringify(row));
  return row;
}
function main(){
  const o=parseArgs(process.argv.slice(2));
  // Validate the two models up front (fail fast before any match).
  policyV4.validate(JSON.parse(fs.readFileSync(o.run3Policy,'utf8')));
  candidateV5.validate(JSON.parse(fs.readFileSync(o.candidateModel,'utf8')));
  const scenarios=buildScenarios(o);
  if(!o.engine)throw Error('--engine is required');
  if(!o.out)throw Error('--out is required');
  const rows=[];
  for(const scenario of scenarios)
  for(const arm of ARM_ORDER)
    rows.push(runMatch(o,scenario,arm));
  fs.writeFileSync(path.join(o.out,'capture-manifest.json'),JSON.stringify({
    kind:'v5-decision-capture',generated:new Date().toISOString(),
    engineCommit:o.engineCommit,arms:ARM_ORDER,
    scenarios,rows},null,2)+'\n');
  console.log(JSON.stringify({matches:rows.length,
    out:path.join(o.out,'capture-manifest.json')}));
}
if(require.main===module)main();
module.exports={MODE_CONFIG,ARM_ORDER,parseArgs,buildScenarios,armEngineArgs};
