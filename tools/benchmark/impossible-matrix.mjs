// Paired real-engine Impossible evaluation. No mocked battles or public matches.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import common from './common.cjs';

const values={engine:null,candidate:'OpenFront_Solo_AggroBot.user.js',baseline:null,
  maps:'World',size:'Compact',nations:'1,4,8',bots:'0',
  seeds:'impossible-101,impossible-102,impossible-103',ticks:'18000',
  out:'benchmark-results/impossible-matrix',dryRun:'false'};
for(let i=2;i<process.argv.length;i++){
  const arg=process.argv[i],name=arg.slice(2);
  if(!arg.startsWith('--')||!Object.hasOwn(values,name))throw Error('Unknown option '+arg);
  const next=process.argv[++i];
  if(!next||next.startsWith('--'))throw Error('Missing option value '+arg);
  values[name]=next;
}
const names=key=>{
  const a=values[key].split(',').map(v=>v.trim());
  if(!a.length||a.some(v=>!v)||new Set(a).size!==a.length)throw Error('Invalid '+key);
  return a;
};
const maps=names('maps'),seeds=names('seeds'),nationCounts=names('nations').map(Number);
for(const map of maps)if(!/^[A-Za-z0-9_-]{1,40}$/.test(map))throw Error('Bad map');
for(const seed of seeds)if(!/^[A-Za-z0-9_-]{1,64}$/.test(seed))throw Error('Bad seed');
for(const n of nationCounts)if(!Number.isInteger(n)||n<1||n>100)throw Error('Bad nations');
const bots=Number(values.bots),ticks=Number(values.ticks);
if(!Number.isInteger(bots)||bots<0||bots>400||!Number.isInteger(ticks)||ticks<1||ticks>72000)
  throw Error('Invalid bots/ticks');
if(!/^[A-Za-z0-9_-]{1,40}$/.test(values.size))throw Error('Bad size');
const variants=[...(values.baseline?[['baseline',values.baseline]]:[]),
  ['candidate',values.candidate]].map(([name,file])=>({name,file:path.resolve(file)}));
const plan=[];
for(const map of maps)for(const nations of nationCounts)for(const seed of seeds)
  for(const variant of variants)
    plan.push({map,size:values.size,nations,bots,seed,ticks,
      variant:variant.name,bot:variant.file});
if(plan.length>80)throw Error('Matrix exceeds 80 runs; narrow maps/nations/seeds');
const summary={description:'Official engine Impossible; paired by map, size, seed, nation/bot count',
  engineCommit:common.ENGINE_COMMIT,plan,runs:[],note:
  'Only observed victory/defeat counts as completed. Tick-limit and errors remain incomplete.'};
if(values.dryRun==='true'){
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');process.exit(0);
}
if(values.dryRun!=='false'||!values.engine)throw Error('Set --engine or --dryRun true');
common.engineInfo(path.resolve(values.engine));
for(const v of variants)if(!fs.existsSync(v.file))throw Error('Missing bot '+v.file);
const dir=path.resolve(values.out);
if(fs.existsSync(path.join(dir,'matrix.json')))throw Error('Output exists: '+dir);
fs.mkdirSync(dir,{recursive:true});
common.writeJSON(path.join(dir,'plan.json'),summary);
const engine=path.resolve(values.engine);
const script=fileURLToPath(new URL('./engine-match.mjs',import.meta.url));
let i=0;
for(const test of plan){
  const runDir=path.join(dir,String(++i).padStart(3,'0')+'-'+test.variant+'-'+
    test.map+'-'+test.nations+'-'+test.seed);
  const logfile=runDir+'.log',fd=fs.openSync(logfile,'wx');
  let result;
  try{
    result=spawnSync(process.execPath,[script,'--engine',engine,
      '--map',test.map,'--size',test.size,'--difficulty','Impossible',
      '--bots',String(test.bots),'--nations',String(test.nations),
      '--seed',test.seed,'--ticks',String(test.ticks),'--profile','autonomous',
      '--bot',test.bot,'--out',runDir],
    {stdio:['ignore',fd,fd],timeout:30*60*1000});
  }finally{fs.closeSync(fd);}
  let match=null;
  try{match=JSON.parse(fs.readFileSync(path.join(runDir,'match.json'),'utf8'));}
  catch(_){}
  const outcome=match?.gameEnd?.outcome;
  const confirmed=(outcome==='victory'||outcome==='defeat')&&
    ['game-over','eliminated'].includes(match?.run?.termination);
  const row={...test,dir:runDir,processOK:result.status===0,
    termination:match?.run?.termination||'no-report',
    outcome:confirmed?outcome:'incomplete',observed:confirmed,
    endTick:match?.run?.tick??null,error:result.error?.message??null,
    land:match?.finalState?.land??null};
  summary.runs.push(row);
  common.writeJSON(path.join(dir,'matrix.json'),summary);
  process.stdout.write(JSON.stringify(row)+'\n');
}
const totals={};
for(const variant of variants){
  const a=summary.runs.filter(r=>r.variant===variant.name);
  totals[variant.name]={planned:a.length,completed:a.filter(x=>x.observed).length,
    victories:a.filter(x=>x.observed&&x.outcome==='victory').length,
    defeats:a.filter(x=>x.observed&&x.outcome==='defeat').length,
    incomplete:a.filter(x=>!x.observed).length};
}
summary.totals=totals;
summary.paired=variants.length===2?maps.flatMap(map=>nationCounts.flatMap(nations=>
  seeds.map(seed=>{
    const a=summary.runs.filter(r=>r.map===map&&r.nations===nations&&r.seed===seed);
    return {map,nations,seed,complete:a.length===2&&a.every(r=>r.observed&&r.processOK),
      baseline:a.find(r=>r.variant==='baseline')?.outcome||'missing',
      candidate:a.find(r=>r.variant==='candidate')?.outcome||'missing'};
  }))):[];
common.writeJSON(path.join(dir,'matrix.json'),summary);
process.stdout.write(JSON.stringify({totals,pairedComplete:summary.paired.filter(p=>p.complete).length})+'\n');
if(summary.runs.some(r=>!r.processOK))process.exitCode=1;
