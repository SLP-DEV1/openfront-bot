'use strict';
// Executes isolated real-engine baseline matches, then imports complete recordings.
// It does not start multiplayer, self-play, promote policies, or claim causal improvement.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {makeStore}=require('./store.cjs');
const {importRun}=require('./import.cjs');
function parse(argv){
  const opts={engine:null,seeds:'brain-001,brain-002,brain-003',map:'World',
    difficulty:'Medium',ticks:'18000',out:'benchmark-results/brain-training',
    db:path.join(__dirname,'data/experiences.sqlite')};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i],key=flag.slice(2);
    if(!flag.startsWith('--')||!Object.hasOwn(opts,key)||!argv[i+1]||argv[i+1].startsWith('--'))
      throw Error('Unknown/missing option '+flag);
    opts[key]=argv[++i];
  }
  if(!opts.engine)throw Error('Usage: node brain/train.cjs --engine ../OpenFrontIO [--seeds s1,s2] [--map World] [--difficulty Medium] [--ticks 18000] [--out benchmark-results/brain-training] [--db brain/data/experiences.sqlite]');
  if(!/^[A-Za-z0-9_-]{1,64}(,[A-Za-z0-9_-]{1,64})*$/.test(opts.seeds))throw Error('Invalid seeds');
  if(!Number.isInteger(Number(opts.ticks))||+opts.ticks<240||+opts.ticks>72000)throw Error('Invalid ticks');
  opts.seeds=opts.seeds.split(',');
  if(new Set(opts.seeds).size!==opts.seeds.length||opts.seeds.length>40)throw Error('1-40 distinct seeds required');
  if(!/^[a-zA-Z0-9_-]+$/.test(opts.map)||!/^[a-zA-Z0-9_-]+$/.test(opts.difficulty))throw Error('Invalid map/difficulty');
  return opts;
}
function train(opts){
  const base=path.resolve(opts.out),store=makeStore(path.resolve(opts.db));
  const script=path.resolve(__dirname,'../tools/benchmark/engine-match.mjs');
  fs.mkdirSync(base,{recursive:true});
  const summary=[];
  try{
    for(const seed of opts.seeds){
      // Never overwrite a prior training artifact: each run gets an isolated folder.
      const dir=fs.mkdtempSync(path.join(base,seed+'-'));
      const args=[script,'--engine',opts.engine,'--seed',seed,'--map',opts.map,
        '--difficulty',opts.difficulty,'--ticks',opts.ticks,'--profile','autonomous','--out',dir];
      const p=spawnSync(process.execPath,args,{stdio:'inherit',timeout:30*60*1000});
      if(p.error||p.status!==0){
        summary.push({seed,dir,status:'engine-error',error:p.error?.message??String(p.status)});
        continue;
      }
      try{summary.push({seed,dir,status:'imported',...importRun(store,dir)});}
      catch(e){summary.push({seed,dir,status:'import-error',error:e.message});}
    }
    const result={runs:summary,store:store.report(),
      note:'Only real-engine runs. Unknown and tick-limit games are not victories; no online model promotion or self-play.'};
    fs.writeFileSync(path.join(base,'training-summary.json'),JSON.stringify(result,null,2)+'\n');
    return result;
  }finally{store.close();}
}
if(require.main===module){
  const result=train(parse(process.argv.slice(2)));
  console.log(JSON.stringify(result,null,2));
  if(result.runs.some(r=>r.status!=='imported'))process.exitCode=1;
}
module.exports={parse,train};
