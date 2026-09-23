#!/usr/bin/env node
'use strict';
// Same-code, same-seed schema-4 ablation: rule basis vs reviewed champion.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
function parse(argv){
 const o={engine:null,engineCommit:null,seeds:'schema4-ab-1,schema4-ab-2',
   ticks:'2400',out:'benchmark-results/schema4-ablation',execute:false,
   bot:'OpenFront_Solo_AggroBot.user.js',
   policy:'docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json',
   map:'World',size:'Compact',difficulty:'Impossible',gameType:'Private',gameMode:'FFA'};
 for(let i=0;i<argv.length;i++){const k=argv[i];
   if(k==='--execute'){o.execute=true;continue;}
   if(!k.startsWith('--')||!Object.hasOwn(o,k.slice(2)))throw Error('Unknown '+k);
   const v=argv[++i];if(!v||v.startsWith('--'))throw Error('Missing '+k);o[k.slice(2)]=v;}
 if(!o.engine||!o.engineCommit)throw Error('--engine and --engineCommit required');
 return o;
}
function plan(o){
 const seeds=o.seeds.split(',').map(x=>x.trim()).filter(Boolean);
 if(!seeds.length)throw Error('No seeds');
 const arms=['rule','schema4'],jobs=[];
 for(const seed of seeds)for(const arm of arms){
   const out=path.join(o.out,seed,arm);
   const args=['tools/benchmark/engine-match.mjs','--engine',o.engine,
     '--engineCommit',o.engineCommit,'--bot',o.bot,'--seed',seed,
     '--ticks',String(o.ticks),'--map',o.map,'--size',o.size,
     '--difficulty',o.difficulty,'--gameType',o.gameType,'--gameMode',o.gameMode,
     '--bots','0','--nations','1','--out',out];
   if(arm==='schema4')args.push('--policy',o.policy);
   jobs.push({seed,arm,out,args});
 }
 return {schema:'schema4-ablation-v1',sameCode:true,sameSeedPairs:true,
   bot:o.bot,policy:o.policy,engineCommit:o.engineCommit,jobs};
}
function summarizeJob(job){
 const m=JSON.parse(fs.readFileSync(path.join(job.out,'match.json'),'utf8'));
 const frames=m.decisionFrames||[],changed=frames.filter(f=>
   f.neuralDecisionEvidence?.changedIntent===true||f.modelChoice&&f.selected?.id&&
   f.modelChoice!==f.selected.id).length;
 return {seed:job.seed,arm:job.arm,termination:m.run?.termination??null,
   outcome:m.gameEnd?.outcome??'unknown',land:m.finalState?.land??null,
   emitted:m.run?.emitted??null,decisionFrames:frames.length,
   modelChangedChoices:changed,botSHA256:m.benchmarkMeta?.botSHA256??null,
   policySHA256:m.benchmarkMeta?.policySHA256??null};
}
function main(argv=process.argv.slice(2)){
 const o=parse(argv),p=plan(o);fs.mkdirSync(o.out,{recursive:true});
 fs.writeFileSync(path.join(o.out,'plan.json'),JSON.stringify(p,null,2));
 if(!o.execute){console.log(JSON.stringify(p,null,2));return p;}
 const rows=[];
 for(const job of p.jobs){
   const r=spawnSync(process.execPath,job.args,{cwd:ROOT,encoding:'utf8'});
   if(r.status!==0)throw Error('Ablation arm failed '+job.seed+'/'+job.arm+'\n'+r.stderr);
   rows.push(summarizeJob(job));
 }
 const report={...p,rows,semantics:
   'paired same-seed observational comparison; no causal or win-rate claim'};
 fs.writeFileSync(path.join(o.out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({out:o.out,pairs:p.jobs.length/2,rows:rows.length}));
 return report;
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={parse,plan,summarizeJob,main};
