// Finite parameter search with separate training and held-out evaluation seeds.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import common from './common.cjs';
import report from '../match-report.cjs';
const args=process.argv.slice(2),take=(key,fallback)=>{
  const index=args.indexOf('--'+key);if(index<0)return fallback;
  if(!args[index+1]||args[index+1].startsWith('--'))throw Error('Missing '+key);
  return args.splice(index,2)[1];
};
const candidates=take('profiles','autonomous,balanced,cautious,expansion').split(',');
const training=take('train-seeds','aggro-train-001,aggro-train-002').split(',');
const validation=take('test-seeds','aggro-holdout-101,aggro-holdout-102').split(',');
for(const group of [candidates,training,validation])if(!group.length||new Set(group).size!==group.length)throw Error('Empty or duplicate profile/seed');
if(!candidates.includes('autonomous'))throw Error('Include autonomous as the baseline');
for(const profile of candidates)if(!common.profiles[profile])throw Error('Unknown profile '+profile);
for(const seed of [...training,...validation])if(!/^[a-zA-Z0-9_-]{1,64}$/.test(seed))throw Error('Invalid seed '+seed);
if(training.some(seed=>validation.includes(seed)))throw Error('Training and validation seeds must be disjoint');
const opts=common.parse(args);
if(candidates.length*training.length+2*validation.length>40)throw Error('Suite exceeds the 40-match limit');
const dir=common.outputDir(opts),runner=fileURLToPath(new URL('./engine-match.mjs',import.meta.url));
const rows=[];let index=0;
common.writeJSON(path.join(dir,'suite-plan.json'),{candidates,training,validation,opts});
function run(profile,seed,split){
  const out=path.join(dir,String(++index).padStart(2,'0')+'-'+split+'-'+profile+'-'+seed);
  const log=path.join(dir,path.basename(out)+'.log');const fd=fs.openSync(log,'wx');
  console.log(`Match ${index}: ${split}, ${profile}, ${seed}`);
  let result;
  try{result=spawnSync(process.execPath,[runner,'--engine',opts.engine,'--engineCommit',opts.engineCommit,'--map',opts.map,'--size',opts.size,
    '--difficulty',opts.difficulty,'--bots',String(opts.bots),'--nations',String(opts.nations),
    '--ticks',String(opts.ticks),'--seed',seed,'--profile',profile,'--bot',opts.bot,'--out',out],
    {stdio:['ignore',fd,fd],timeout:30*60*1000});}finally{fs.closeSync(fd);}
  let row;
  if(fs.existsSync(path.join(out,'match.json')))row=report.summarize(JSON.parse(fs.readFileSync(path.join(out,'match.json'),'utf8')),path.join(out,'match.json'));
  else row={file:out,profile,seed,finished:false,outcome:'unknown',termination:'process-error'};
  row={...row,split,processOK:result.status===0,error:result.error?.message??null};rows.push(row);
  common.writeJSON(path.join(dir,'suite-progress.json'),rows);
  console.log(JSON.stringify({profile,seed,split,outcome:row.outcome,termination:row.termination}));return row;
}
for(const seed of training)for(const profile of candidates)run(profile,seed,'training');
const rankings=candidates.map(profile=>{
  const runs=rows.filter(r=>r.profile===profile&&r.split==='training');
  const eligible=runs.every(r=>r.finished&&r.processOK);
  return {profile,eligible,matches:runs.length,wins:runs.filter(r=>r.outcome==='victory').length,
    meanEndTick:runs.reduce((s,r)=>s+(r.endTick??opts.ticks),0)/runs.length};
}).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.wins-a.wins||
  // Prefer the existing autonomous policy on tied win counts, avoiding needless changes.
  Number(b.profile==='autonomous')-Number(a.profile==='autonomous')||a.meanEndTick-b.meanEndTick);
const selected=rankings.find(r=>r.eligible)?.profile??null;
for(const seed of validation)for(const profile of new Set(['autonomous',...(selected?[selected]:[])]))run(profile,seed,'validation');
const baseline=rows.filter(r=>r.split==='validation'&&r.profile==='autonomous');
const challenger=rows.filter(r=>r.split==='validation'&&r.profile===selected);
const wins=runs=>runs.filter(r=>r.outcome==='victory').length;
const validated=selected&&baseline.length===validation.length&&challenger.length===validation.length&&
  [...baseline,...challenger].every(r=>r.finished&&r.processOK);
const summary={selectedOnTraining:selected,rankings,validation:{complete:!!validated,
  baselineWins:wins(baseline),selectedWins:wins(challenger),matchesPerProfile:validation.length},
  recommendation:selected==='autonomous'?'Keep autonomous':validated&&wins(challenger)>wins(baseline)?
    'Candidate improved on this small held-out set; run a larger suite before adoption':'No demonstrated improvement; keep autonomous',
  settingsChanged:false,matches:rows,note:'Parameter search, not neural-network training. No production settings are changed. Partial/error runs cannot qualify a profile. A small seed set does not establish multiplayer strength.'};
common.writeJSON(path.join(dir,'suite.json'),summary);
console.log(JSON.stringify({output:dir,selected,validation:summary.validation,recommendation:summary.recommendation}));
if(rows.some(r=>!r.processOK))process.exitCode=1;
