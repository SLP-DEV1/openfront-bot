#!/usr/bin/env node
'use strict';
// Reproducible GameView league orchestration. Existing harness controls one
// complete AggroBot; opponent profiles are scripted and NOT complete bots.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const common=require('./common.cjs');
const values={engine:null,engineCommit:common.ENGINE_COMMIT,
  bot:'OpenFront_Solo_AggroBot.user.js',out:'benchmark-results/league',
  seeds:'league-001,league-002,league-003',
  profiles:'autonomous,balanced,cautious,expansion',
  opponents:'rush,balanced,defender,opportunist',ticks:'18000',
  map:'World',size:'Compact',difficulty:'Impossible',execute:false};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  const key=args[i].replace(/^--/,'');
  if(!args[i].startsWith('--')||!Object.hasOwn(values,key))
    throw Error('Unknown league option: '+args[i]);
  if(key==='execute'){values.execute=true;continue;}
  if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+key);
  values[key]=args[++i];
}
const list=(str,label,allowed=null)=>str.split(',').map(s=>s.trim())
  .filter(Boolean).map(s=>{
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(s)||allowed&&!allowed.includes(s))
      throw Error('Invalid '+label+': '+s);
    return s;
  });
const seeds=list(values.seeds,'seed'),
 profiles=list(values.profiles,'profile',Object.keys(common.profiles)),
 opponents=list(values.opponents,'opponent',['rush','balanced','defender','opportunist']);
if(!seeds.length||!profiles.length||!opponents.length||
 new Set(seeds).size!==seeds.length||
 new Set(profiles).size!==profiles.length||
 new Set(opponents).size!==opponents.length)throw Error('Empty or duplicate match keys');
const ticks=Number(values.ticks);
if(!Number.isInteger(ticks)||ticks<1||ticks>72000)throw Error('Invalid ticks');
if(!values.engine)throw Error('--engine /path/to/official/OpenFrontIO required');
const bot=path.resolve(values.bot),engine=path.resolve(values.engine),
 out=path.resolve(values.out),botHash=crypto.createHash('sha256')
   .update(fs.readFileSync(bot)).digest('hex');
const engineHash=common.engineInfo(engine,values.engineCommit);
const matches=[];
for(const seed of seeds)for(const profile of profiles)for(const opponent of opponents){
 const id=[seed,profile,opponent].join('__');
 matches.push({id,seed,profile,opponent,relativeOutput:id,
   status:'not-run',outcome:'unknown'});
}
fs.mkdirSync(out,{recursive:true});
const outputFile=path.join(out,'league.json');
if(fs.existsSync(outputFile))throw Error('League report already exists: '+outputFile);
const report={schema:1,kind:'single-complete-bot-vs-scripted-profiles',
 limitations:'Scripted clients are not full autonomous bot opponents; no multi-client/Duo proof',
 engineCommit:engineHash,botSHA256:botHash,ticks,map:values.map,size:values.size,
 difficulty:values.difficulty,startedAt:new Date().toISOString(),matches};
const save=()=>common.writeJSON(outputFile,report);
save();
if(!values.execute){
 console.log(JSON.stringify({plan:outputFile,matches:matches.length,
   execute:'pass --execute to run; no games were played'}));
 process.exit(0);
}
for(const match of matches){
 const dir=path.join(out,match.relativeOutput);
 const argv=[path.join(__dirname,'engine-match.mjs'),'--engine',engine,
 '--engineCommit',engineHash,'--bot',bot,'--out',dir,'--seed',match.seed,
 '--profile',match.profile,'--opponentProfile',match.opponent,
 '--scriptedHumans','4','--ticks',String(ticks),'--map',values.map,
 '--size',values.size,'--difficulty',values.difficulty];
 const result=spawnSync(process.execPath,argv,{encoding:'utf8',timeout:7200000,
   maxBuffer:4*1024*1024});
 const file=path.join(dir,'match.json');
 const game=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 match.status=result.status===0&&!result.error&&game?'recorded':'failed';
 match.outcome=game?.gameEnd?.outcome??'unknown';
 match.termination=game?.run?.termination??'unknown';
 match.tick=game?.run?.tick??null;
 match.error=result.error?.message??(result.status===0?null:
   (result.stderr||'Benchmark subprocess failed').slice(-2000));
 save();
 if(match.status==='failed'){process.exitCode=1;break;}
}
report.completedAt=new Date().toISOString();save();
console.log(JSON.stringify({report:outputFile,recorded:matches.filter(
 m=>m.status==='recorded').length,total:matches.length,
 notice:'Not a league of full bot opponents; missing results remain unknown'}));
