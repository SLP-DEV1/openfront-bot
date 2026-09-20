// Real-engine, derivative-free reinforcement learning for a tiny neural policy.
// Train seeds choose a provisional parent; disjoint evaluation seeds alone can
// promote a candidate. Zero weights reproduce the existing rule-only bot.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import policy from './action-policy.cjs';
import common from '../tools/benchmark/common.cjs';
import {reviewGeneration} from './qwen-review.mjs';
import evaluation from './evaluation.cjs';
import scoring from './reward.cjs';
import parallelPool from './parallel.cjs';

const cfg={engine:null,engineCommit:common.IMPOSSIBLE_REFERENCE_COMMIT,
  bot:'OpenFront_Solo_AggroBot.user.js',initialModel:null,maps:'World',size:'Compact',nations:'1,4',
  generations:'3',population:'4',trainSeeds:'2',evalSeeds:'4',ticks:'18000',
  sigma:'0.3',parallel:'2',out:'benchmark-results/neural-training',qwen:'false',dryRun:'false'};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(!key.startsWith('--')||!Object.hasOwn(cfg,key.slice(2)))throw Error('Unknown option '+key);
  const value=process.argv[++i];
  if(!value||value.startsWith('--'))throw Error('Missing value for '+key);
  cfg[key.slice(2)]=value;
}
const integer=(key,min,max)=>{
  const n=Number(cfg[key]);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Invalid '+key);
  return n;
};
const generations=integer('generations',1,500),population=integer('population',2,16),
  trainSeeds=integer('trainSeeds',1,12),evalSeeds=integer('evalSeeds',2,20),
  ticks=integer('ticks',100,72000),parallel=integer('parallel',1,8);
let sigma=Number(cfg.sigma);
if(!Number.isFinite(sigma)||sigma<.02||sigma>.75)throw Error('Invalid sigma');
if(!['true','false'].includes(cfg.qwen)||!['true','false'].includes(cfg.dryRun))
  throw Error('Invalid qwen/dryRun toggle');
if(!/^[a-f0-9]{40}$/.test(cfg.engineCommit))throw Error('Invalid engine SHA');
const list=(name,rx)=>{
  const a=cfg[name].split(',').map(s=>s.trim());
  if(!a.length||a.some(s=>!rx.test(s))||new Set(a).size!==a.length)
    throw Error('Invalid '+name);
  return a;
};
const maps=list('maps',/^[A-Za-z0-9_-]{1,40}$/),nations=list('nations',/^[1-9][0-9]?$/).map(Number);
const runsPerGeneration=maps.length*nations.length*(trainSeeds*(population+1)+evalSeeds*2);
if(runsPerGeneration>200)throw Error('Too many matches per generation (>200)');
const total=runsPerGeneration*generations;
const plan={engineCommit:cfg.engineCommit,maps,nations,generations,population,
  trainSeeds,evalSeeds,ticks,sigma,parallel,matches:total,policySchema:2,
  promotion:'strictly more observed holdout victories, no incompletes or process failures'};
if(cfg.dryRun==='true'){console.log(JSON.stringify(plan,null,2));process.exit(0);}
if(!cfg.engine)throw Error('Provide --engine or --dryRun true');
const engine=path.resolve(cfg.engine),bot=path.resolve(cfg.bot),out=path.resolve(cfg.out);
if(!fs.existsSync(bot))throw Error('Missing bot');
common.engineInfo(engine,cfg.engineCommit);
if(fs.existsSync(out))throw Error('Output directory already exists: '+out);
fs.mkdirSync(out,{recursive:true});
common.writeJSON(path.join(out,'plan.json'),plan);
const runner=fileURLToPath(new URL('../tools/benchmark/engine-match.mjs',import.meta.url));
const save=(p,data)=>common.writeJSON(path.join(out,p),data);
let incumbent=cfg.initialModel?policy.validate(JSON.parse(fs.readFileSync(path.resolve(cfg.initialModel),'utf8'))):policy.zero(),parent=incumbent,incumbentWins=0;
const history=[];
async function match(model,phase,g,index,map,nation,seed){
  const id=[phase,g,index,map,nation,seed].join('-');
  const folder=path.join(out,'matches',id),modelFile=path.join(out,'models',id+'.json');
  fs.mkdirSync(path.dirname(folder),{recursive:true});
  fs.mkdirSync(path.dirname(modelFile),{recursive:true});
  common.writeJSON(modelFile,policy.validate(model));
  const log=folder+'.log',fd=fs.openSync(log,'wx');
  let proc;
  try{
    proc=await new Promise(resolve=>{
      let child;
      try{
        child=spawn(process.execPath,[runner,'--engine',engine,
          '--engineCommit',cfg.engineCommit,'--bot',bot,'--policy',modelFile,
          '--map',map,'--size',cfg.size,'--difficulty','Impossible',
          '--bots','0','--nations',String(nation),'--seed',seed,
          '--ticks',String(ticks),'--profile','autonomous','--out',folder],
        {stdio:['ignore',fd,fd]});
      }catch(error){resolve({status:null,error});return;}
      let error=null,timedOut=false;
      const timer=setTimeout(()=>{
        timedOut=true;child.kill();
      },25*60*1000);
      child.once('error',e=>{error=e;});
      child.once('close',(status,signal)=>{
        clearTimeout(timer);
        resolve({status,signal,error:timedOut?new Error('Match timed out'):error});
      });
    });
  }finally{fs.closeSync(fd);}
  let state=null;
  try{state=JSON.parse(fs.readFileSync(path.join(folder,'match.json'),'utf8'));}catch(_){}
  const termination=state?.run?.termination||'no-report',outcome=state?.gameEnd?.outcome;
  const verified=proc.status===0&&!proc.error&&
    state?.benchmarkMeta?.policySHA256===common.digest(JSON.stringify(model)) &&
    state?.benchmarkMeta?.engineCommit===cfg.engineCommit;
  const confirmed=verified&&['game-over','eliminated'].includes(termination)&&
    ['victory','defeat'].includes(outcome);
  const validSample=confirmed||(verified&&termination==='tick-limit');
  // Confirmed defeat and right-censored tick-limit have separate search
  // rewards. Only evaluation.compare may promote a model, never this reward.
  const land=Math.max(0,Number(state?.finalState?.land)||0),
    elapsed=Math.max(0,Number(state?.run?.tick)||0);
  const reward=scoring.reward({validSample,confirmed,outcome,land,
    endTick:elapsed,ticks,trajectory:state?.trajectory});
  const row={phase,generation:g,index,map,nation,seed,model:policy.sha(model),
    dir:path.relative(out,folder),termination,outcome:confirmed?outcome:'incomplete',
    confirmed,validSample,land,endTick:elapsed,trajectory:state?.trajectory?.summary??null,
    reward:Math.round(reward*1e6)/1e6,
    error:proc.error?.message||null,exitCode:proc.status};
  console.log(JSON.stringify(row));
  return row;
}
function suiteJobs(model,phase,g,index,count){
  const jobs=[];
  for(const map of maps)for(const nation of nations)
    for(let k=0;k<count;k++){
      const seed=(phase==='evaluation'?'eval':'train')+'-'+g+'-'+k+'-'+map+'-'+nation;
      jobs.push({model,phase,g,index,map,nation,seed});
    }
  return jobs;
}
const runJobs=jobs=>parallelPool.parallelMap(jobs,parallel,
  j=>match(j.model,j.phase,j.g,j.index,j.map,j.nation,j.seed));
const score=rows=>rows.every(x=>x.validSample)?
  rows.reduce((sum,x)=>sum+x.reward,0)/rows.length:-Infinity;
for(let g=1;g<=generations;g++){
  const candidates=Array.from({length:population},(_,i)=>({
    index:'p'+i,
    model:policy.mutate(parent,'neural-'+g+'-'+Math.floor(i/2),sigma,i%2?-1:1)
  }));
  // Independent official-engine processes run together; every candidate and
  // parent sees the same seed suite. The pool bounds CPU/RAM consumption.
  const trainingRows=await runJobs([
    ...suiteJobs(parent,'training',g,'parent',trainSeeds),
    ...candidates.flatMap(c=>suiteJobs(c.model,'training',g,c.index,trainSeeds))
  ]);
  const previous=trainingRows.filter(x=>x.index==='parent');
  const proposals=candidates.map(c=>{
    const rows=trainingRows.filter(x=>x.index===c.index);
    return {model:c.model,score:score(rows),rows};
  });
  proposals.sort((a,b)=>b.score-a.score);
  const top=proposals[0],provisional=top.score>score(previous)?top.model:parent;
  const evaluationRows=await runJobs([
    ...suiteJobs(incumbent,'evaluation',g,'champion',evalSeeds),
    ...suiteJobs(provisional,'evaluation',g,'candidate',evalSeeds)
  ]);
  const incumbentRows=evaluationRows.filter(x=>x.index==='champion');
  const candidateRows=evaluationRows.filter(x=>x.index==='candidate');
  const wins=rows=>rows.filter(r=>r.confirmed&&r.outcome==='victory').length;
  const comparison=evaluation.compare(incumbentRows,candidateRows);
  const valid=comparison.valid,promoted=comparison.promoted;
  if(promoted){
    incumbent=provisional;incumbentWins=wins(candidateRows);
    save('champion.json',incumbent);
  }
  parent=provisional;
  save('provisional.json',parent);
  const report={generation:g,sigma,proposals:proposals.map(p=>({model:policy.sha(p.model),score:p.score})),
    parentScore:score(previous),trainScore:top.score,
    evaluation:{incumbent:{wins:wins(incumbentRows),rows:incumbentRows},
      candidate:{wins:wins(candidateRows),rows:candidateRows}},
    promoted,championModel:policy.sha(incumbent),provisionalModel:policy.sha(parent),
    note:valid?'Completed paired evaluation':'Incomplete or failed evaluation; no promotion'};
  history.push(report);save('generation-'+g+'.json',report);
  save('history.json',{plan,history,published:fs.existsSync(path.join(out,'champion.json'))});
  console.log(JSON.stringify({generation:g,promoted,incumbentWins,
    candidateWins:wins(candidateRows),report:path.join(out,'generation-'+g+'.json')}));
  if(cfg.qwen==='true'){
    const suggestion=reviewGeneration(report,out);
    if(suggestion?.sigma!==undefined&&Number.isFinite(suggestion.sigma)&&
      suggestion.sigma>=.02&&suggestion.sigma<=.75)sigma=suggestion.sigma;
  }
}
console.log(JSON.stringify({finished:true,championPublished:
  fs.existsSync(path.join(out,'champion.json')),out}));
