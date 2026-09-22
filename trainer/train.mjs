// Real-engine, derivative-free self-training of multi-head strategic policies.
// Train seeds choose a provisional parent; disjoint evaluation seeds alone can
// promote a candidate. Zero weights reproduce the existing rule-only bot.
//
// Durability: an existing --out directory is resumable. plan.json pins the
// exact training identity; history.json plus provisional.json/incumbent.json
// pin the lineage state at the last completed generation; row.json files pin
// every verified completed match. A crashed or budget-stopped run therefore
// resumes at the first incomplete generation and reuses every completed
// match. --wallBudgetSeconds bounds one invocation; a run that hits the
// budget exits 0 with status "budget-exceeded" and can be re-run to continue.
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import policy from './strategic-policy.cjs';
import policyV4 from './strategic-policy-v4.cjs';
import common from '../tools/benchmark/common.cjs';
import evidence from '../tools/benchmark/holdout-evidence.cjs';
import evaluation from './evaluation-v2.cjs';
import scoring from './reward.cjs';
import parallelPool from './parallel.cjs';

const cfg={engine:null,engineCommit:common.IMPOSSIBLE_REFERENCE_COMMIT,
  bot:'OpenFront_Solo_AggroBot.user.js',initialModel:null,maps:'World',size:'Compact',nations:'1,4',difficulty:'Impossible',
  generations:'3',population:'4',trainSeeds:'2',evalSeeds:'4',ticks:'18000',ticksSchedule:'',
  sigma:'0.12',parallel:'2',schema:'3',out:'benchmark-results/neural-training',dryRun:'false',
  gameType:'Singleplayer',gameMode:'FFA',scriptedHumans:'0',opponentProfile:'balanced',
  wallBudgetSeconds:'0'};
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
const modelSchema=integer('schema',3,4),selectedPolicy=modelSchema===4?policyV4:policy;
const generations=integer('generations',1,500),population=integer('population',2,16),
  trainSeeds=integer('trainSeeds',1,12),evalSeeds=integer('evalSeeds',2,20),
  ticks=integer('ticks',100,72000),parallel=integer('parallel',1,16),
  scriptedHumans=integer('scriptedHumans',0,12);
let sigma=Number(cfg.sigma);
if(!Number.isFinite(sigma)||sigma<.02||sigma>.75)throw Error('Invalid sigma');
if(!['true','false'].includes(cfg.dryRun))
  throw Error('Invalid dryRun toggle');
if(!/^[a-f0-9]{40}$/.test(cfg.engineCommit))throw Error('Invalid engine SHA');
// Wall-clock budget for this invocation, in seconds. 0 = unlimited. Checked
// only at generation boundaries, so overrun is at most one generation.
const wallBudgetSeconds=Number(cfg.wallBudgetSeconds);
if(!Number.isFinite(wallBudgetSeconds)||wallBudgetSeconds<0||wallBudgetSeconds>31536000)
  throw Error('Invalid wallBudgetSeconds (finite seconds >= 0; 0 = unlimited)');
// Difficulty is a (possibly multi-valued) equal-weighted control grid:
// every generation runs the full list, so each difficulty gets the same
// number of training and evaluation matches.
const difficulties=String(cfg.difficulty).split(',').map(s=>s.trim()).map(
  d=>({medium:'Medium',hard:'Hard',impossible:'Impossible'})[d.toLowerCase()]);
if(!difficulties.length||difficulties.some(d=>!d)||
  new Set(difficulties).size!==difficulties.length)
  throw Error('Invalid --difficulty: use Medium, Hard or Impossible');
const ticksScheduleList=String(cfg.ticksSchedule).split(',').map(s=>s.trim()).filter(s=>s.length);
let ticksSchedule=null;
if(ticksScheduleList.length){
  ticksSchedule=ticksScheduleList.map(s=>Number(s));
  if(ticksSchedule.length!==generations||
      ticksSchedule.some(n=>!Number.isSafeInteger(n)||n<100||n>72000))
    throw Error('Invalid --ticksSchedule: one tick value (100..72000) per generation');
}
const genTicks=(g)=>ticksSchedule?ticksSchedule[g-1]:ticks;
if(!['Singleplayer','Public','Private'].includes(cfg.gameType))throw Error('Invalid --gameType');
if(!['FFA','Team'].includes(cfg.gameMode))throw Error('Invalid --gameMode');
if(!['rush','balanced','defender','opportunist','mixed'].includes(cfg.opponentProfile))
  throw Error('Invalid --opponentProfile');
if(scriptedHumans>0&&cfg.gameType==='Singleplayer')
  throw Error('scriptedHumans requires --gameType Public or Private so multiplayer logic is exercised');
const list=(name,rx)=>{
  const a=cfg[name].split(',').map(s=>s.trim());
  if(!a.length||a.some(s=>!rx.test(s))||new Set(a).size!==a.length)
    throw Error('Invalid '+name);
  return a;
};
const maps=list('maps',/^[A-Za-z0-9_-]{1,40}$/),nations=list('nations',/^(?:0|[1-9][0-9]?)$/).map(Number);
const runsPerGeneration=difficulties.length*maps.length*nations.length*
  (trainSeeds*(population+1)+evalSeeds*2);
if(runsPerGeneration>200)throw Error('Too many matches per generation (>200)');
const total=runsPerGeneration*generations;
const plan={engineCommit:cfg.engineCommit,difficulties,maps,nations,generations,population,
  trainSeeds,evalSeeds,ticks,ticksSchedule,sigma,parallel,matches:total,policySchema:modelSchema,
  size:cfg.size,
  gameType:cfg.gameType,gameMode:cfg.gameMode,scriptedHumans,opponentProfile:cfg.opponentProfile,
  rewardVersion:scoring.VERSION,promotionGate:'evaluation-v2',
  promotion:'verified paired holdout v2: more wins with bounded regressions, or repeatable survival/territory gains without per-seed regressions; tick-limits are censored'};
// Identity of the start model: only the content SHA matters, so the file may
// move between a crashed run and its resume without changing the plan.
const initialModelFile=cfg.initialModel?path.resolve(cfg.initialModel):null;
let initialModel=null;
if(initialModelFile){
  if(!fs.existsSync(initialModelFile))
    throw Error('Missing initial model: '+initialModelFile);
  initialModel=selectedPolicy.validate(JSON.parse(fs.readFileSync(initialModelFile,'utf8')));
}
plan.initialModel=initialModel?selectedPolicy.sha(initialModel):'zero';
if(cfg.dryRun==='true'){console.log(JSON.stringify(plan,null,2));process.exit(0);}
if(!cfg.engine)throw Error('Provide --engine or --dryRun true');
const engine=path.resolve(cfg.engine),bot=path.resolve(cfg.bot),out=path.resolve(cfg.out);
if(!fs.existsSync(bot))throw Error('Missing bot');
const botSource=fs.readFileSync(bot,'utf8'),botSHA256=common.digest(botSource);
// Set before the resume identity gate: both sides must carry the digest.
plan.botSHA256=botSHA256;
const planFile=path.join(out,'plan.json'),historyFile=path.join(out,'history.json'),
  provisionalFile=path.join(out,'provisional.json'),
  incumbentFile=path.join(out,'incumbent.json'),
  championFile=path.join(out,'champion.json'),
  pinnedBot=path.join(out,'pinned-bot.user.js');
const readJson=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch(_){return null;}};
// Fields that must be identical for an existing directory to be resumable.
// Derived fields (matches) and runtime knobs (parallel) are intentionally
// excluded. Any mismatch is fail-closed: a fresh --out directory is required.
const PLAN_IDENTITY=['engineCommit','size','difficulties','maps','nations','generations',
  'population','trainSeeds','evalSeeds','ticks','ticksSchedule','sigma','policySchema',
  'gameType','gameMode','scriptedHumans','opponentProfile','rewardVersion',
  'promotionGate','promotion','initialModel','botSHA256'];
const runner=fileURLToPath(new URL('../tools/benchmark/engine-match.mjs',import.meta.url));
const save=(p,data)=>common.writeJSON(path.join(out,p),data);
let history=[],startGeneration=1,incumbent,incumbentWins=0;
let parent;
if(fs.existsSync(out)){
  const persisted=readJson(planFile);
  if(!persisted)
    throw Error('Output directory exists without plan.json (incompatible previous run): '+out);
  for(const key of PLAN_IDENTITY)
    if(!isDeepStrictEqual(persisted[key],plan[key]))
      throw Error('Resume plan mismatch on '+key+': use a fresh --out directory');
  if(!fs.existsSync(pinnedBot)||common.digest(fs.readFileSync(pinnedBot,'utf8'))!==plan.botSHA256)
    throw Error('Resume: pinned bot missing or changed: '+out);
  const hist=readJson(historyFile);
  if(hist){
    if(!Array.isArray(hist.history)||hist.history.length===0)
      throw Error('Resume: incompatible history.json');
    for(let i=0;i<hist.history.length;i++)
      if(hist.history[i]?.generation!==i+1)
        throw Error('Resume: history generations are not sequential');
    const last=hist.history[hist.history.length-1];
    const prov=readJson(provisionalFile);
    if(!prov||selectedPolicy.sha(prov)!==last.provisionalModel)
      throw Error('Resume: provisional.json does not match history');
    const inc=readJson(incumbentFile),champ=readJson(championFile);
    const incumbentSha=inc?selectedPolicy.sha(inc):
      champ?selectedPolicy.sha(champ):plan.initialModel;
    if(incumbentSha!==last.championModel)
      throw Error('Resume: incumbent state does not match history');
    if(hist.history.length===generations){
      console.log(JSON.stringify({finished:true,status:'completed',
        completedGenerations:generations,remainingGenerations:0,
        championPublished:fs.existsSync(championFile),out}));
      process.exit(0);
    }
    history=hist.history;
    startGeneration=history.length+1;
    parent=prov;
    incumbent=inc||champ;
    if(!incumbent)incumbent=initialModel?initialModel:selectedPolicy.zero();
    console.log('resuming from generation '+startGeneration+
      ' (completed generations: '+history.length+')');
  } else {
    // A previous attempt crashed before its first generation report: no
    // history to rebuild from, but completed rows on disk stay reusable.
    incumbent=parent=initialModel?initialModel:selectedPolicy.zero();
  }
} else {
  common.engineInfo(engine,cfg.engineCommit);
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(pinnedBot,botSource,{flag:'wx'});
  incumbent=parent=initialModel?initialModel:selectedPolicy.zero();
}
plan.botSHA256=botSHA256;
common.writeJSON(planFile,plan);
async function match(model,phase,g,index,difficulty,map,nation,seed){
  const gt=genTicks(g);
  const id=[phase,g,index,difficulty,map,nation,seed].join('-');
  const folder=path.join(out,'matches',id),modelFile=path.join(out,'models',id+'.json'),
    rowFile=path.join(folder,'row.json');
  // Row-level resume: a previously verified, complete row for the identical
  // job identity (same model SHA, ticks, bot, parameters) is trusted as-is
  // instead of re-spawning the engine.
  const existing=readJson(rowFile);
  if(existing&&existing.phase===phase&&existing.generation===g&&
    existing.index===index&&existing.difficulty===difficulty&&
    existing.map===map&&existing.nation===nation&&existing.seed===seed&&
    existing.ticks===gt&&existing.model===selectedPolicy.sha(model)&&
    existing.botSHA256===botSHA256&&existing.validSample===true)
    return existing;
  let proc=null,row=null;
  for(let attempt=0;attempt<2;attempt++){
    fs.rmSync(folder,{recursive:true,force:true,maxRetries:5});
    fs.mkdirSync(path.dirname(folder),{recursive:true});
    fs.mkdirSync(path.dirname(modelFile),{recursive:true});
    common.writeJSON(modelFile,selectedPolicy.validate(model));
    const log=folder+'.log',fd=fs.openSync(log,'wx');
    try{
      proc=await new Promise(resolve=>{
        let child;
        try{
          child=spawn(process.execPath,[runner,'--engine',engine,
            '--engineCommit',cfg.engineCommit,'--bot',pinnedBot,'--policy',modelFile,
            '--map',map,'--size',cfg.size,'--difficulty',difficulty,
            '--bots','0','--nations',String(nation),'--seed',seed,
            '--gameType',cfg.gameType,'--gameMode',cfg.gameMode,
            '--scriptedHumans',String(scriptedHumans),'--opponentProfile',cfg.opponentProfile,
            '--ticks',String(gt),'--profile','autonomous','--out',folder],
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
    // Import the same strict provenance contract used by standalone holdouts.
    // A changed original script cannot affect children: they read pinnedBot.
    let verified=false,proofError=null;
    try{
      const run=JSON.parse(fs.readFileSync(path.join(folder,'run.json'),'utf8'));
      const expected={policySHA256:common.digest(JSON.stringify(model)),botSHA256,
        engineCommit:cfg.engineCommit,seed,profile:'autonomous',
        opponentProfile:cfg.opponentProfile,scriptedHumans,maxTicks:gt,
        map,size:cfg.size,difficulty,gameType:cfg.gameType,
        gameMode:cfg.gameMode,nations:nation};
      verified=evidence.verifyEvidence(run,state,expected,proc.status).valid;
    }catch(error){proofError=error.message;}
    const confirmed=verified&&['game-over','eliminated'].includes(termination)&&
      ['victory','defeat'].includes(outcome);
    const validSample=confirmed||(verified&&termination==='tick-limit');
    // Training rewards rank proposals, not champions. Only disjoint complete
    // paired evaluation may promote the model.
    const land=Math.max(0,Number(state?.finalState?.land)||0),
      elapsed=Math.max(0,Number(state?.run?.tick)||0);
    const reward=scoring.reward({validSample,confirmed,outcome,land,
      endTick:elapsed,ticks:gt,trajectory:state?.trajectory,report:state});
    row={phase,generation:g,index,map,nation,difficulty,ticks:gt,seed,
      gameType:cfg.gameType,gameMode:cfg.gameMode,scriptedHumans,opponentProfile:cfg.opponentProfile,
      model:selectedPolicy.sha(model),
      dir:path.relative(out,folder),termination,outcome:confirmed?outcome:'incomplete',
      confirmed,validSample,land,endTick:elapsed,trajectory:state?.trajectory?.summary??null,
      reward:Math.round(reward*1e6)/1e6,rewardVersion:scoring.VERSION,
      error:proc.error?.message||proofError||null,exitCode:proc.status,
      botSHA256};
    // One retry on a failed process (spawn error, non-zero exit, or kill).
    // A verified complete row is final either way.
    if(!proc.error&&proc.status===0)break;
  }
  console.log(JSON.stringify(row));
  if(row.validSample)common.writeJSON(rowFile,row);
  return row;
}
function suiteJobs(model,phase,g,index,count){
  const jobs=[];
  for(const difficulty of difficulties)
  for(const map of maps)for(const nation of nations)
    for(let k=0;k<count;k++){
      const seed=(phase==='evaluation'?'eval':'train')+'-'+g+'-'+k+'-'+map+'-'+nation;
      jobs.push({model,phase,g,index,difficulty,map,nation,seed});
    }
  return jobs;
}
const runJobs=jobs=>parallelPool.parallelMap(jobs,parallel,
  j=>match(j.model,j.phase,j.g,j.index,j.difficulty,j.map,j.nation,j.seed));
const score=rows=>rows.every(x=>x.validSample)?
  rows.reduce((sum,x)=>sum+x.reward,0)/rows.length:-Infinity;
const startedAt=Date.now();
const deadline=wallBudgetSeconds>0?startedAt+wallBudgetSeconds*1000:Infinity;
for(let g=startGeneration;g<=generations;g++){
  const candidates=Array.from({length:population},(_,i)=>({
    index:'p'+i,
    model:selectedPolicy.mutate(parent,'neural-'+g+'-'+Math.floor(i/2),sigma,i%2?-1:1)
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
  const report={generation:g,sigma,proposals:proposals.map(p=>({model:selectedPolicy.sha(p.model),score:p.score})),
    parentScore:score(previous),trainScore:top.score,
    evaluation:{incumbent:{wins:wins(incumbentRows),rows:incumbentRows},
      candidate:{wins:wins(candidateRows),rows:candidateRows},comparison},
    promoted,difficulties,ticks:genTicks(g),gameType:cfg.gameType,gameMode:cfg.gameMode,
    scriptedHumans,opponentProfile:cfg.opponentProfile,
    championModel:selectedPolicy.sha(incumbent),provisionalModel:selectedPolicy.sha(parent),
    note:valid?'Completed paired evaluation; '+comparison.reason:'Incomplete or failed evaluation; no promotion'};
  history.push(report);save('generation-'+g+'.json',report);
  // Persist the post-generation incumbent so a resume never has to infer it.
  save('incumbent.json',incumbent);
  if(g<generations&&Date.now()>=deadline){
    save('history.json',{plan,history,published:fs.existsSync(championFile),
      status:'budget-exceeded',completedGenerations:g,
      remainingGenerations:generations-g,budgetSeconds:wallBudgetSeconds,
      elapsedSeconds:Math.round((Date.now()-startedAt)/10)/100});
    const stopLine=JSON.stringify({finished:false,status:'budget-exceeded',
      completedGenerations:g,remainingGenerations:generations-g,
      budgetSeconds:wallBudgetSeconds,out})+'\n';
    // Flush stdout before exit: process.exit() right after console.log can
    // truncate the last line on Windows pipes.
    await new Promise(resolve=>{process.stdout.write(stopLine,resolve);});
    process.exit(0);
  }
  save('history.json',g>=generations?
    {plan,history,published:fs.existsSync(championFile),status:'completed',
      completedGenerations:generations,remainingGenerations:0}:
    {plan,history,published:fs.existsSync(championFile)});
  console.log(JSON.stringify({generation:g,promoted,incumbentWins,
    candidateWins:wins(candidateRows),report:path.join(out,'generation-'+g+'.json')}));
}
console.log(JSON.stringify({finished:true,status:'completed',
  completedGenerations:generations,remainingGenerations:0,
  championPublished:fs.existsSync(championFile),out}));
