#!/usr/bin/env node
'use strict';
// Reproducible league of 2 (FFA) or 4 (2v2) complete bot GameViews.
// --scripted explicitly opts back into the historical single-bot benchmark.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const common=require('./common.cjs');
const values={engine:null,engineCommit:common.ENGINE_COMMIT,
  bot:'OpenFront_Solo_AggroBot.user.js',
  opponentBot:'OpenFront_Solo_AggroBot.user.js',
  gameMode:'FFA',participants:'2',fullBots:true,
  out:'benchmark-results/league',
  seeds:'league-001,league-002,league-003',
  profiles:'autonomous,balanced,cautious,expansion',
  opponents:'balanced,cautious,expansion,autonomous',ticks:'18000',
  map:'World',size:'Compact',difficulty:'Impossible',execute:false,smoke:false};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  const key=args[i].replace(/^--/,'');
  if(!args[i].startsWith('--')||(!Object.hasOwn(values,key)&&key!=='scripted'))
    throw Error('Unknown league option: '+args[i]);
  if(key==='execute'){values.execute=true;continue;}
  if(key==='smoke'){values.smoke=true;continue;}
  if(key==='scripted'){values.fullBots=false;continue;}
  if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+key);
  values[key]=args[++i];
}
if(values.smoke){
  if(args.some(x=>['--seeds','--profiles','--opponents','--ticks','--gameMode','--participants','--map','--size','--difficulty','--scripted'].includes(x)))
    throw Error('--smoke has fixed FFA/full-bot match conditions; remove conflicting options');
  values.seeds='league-smoke-001,league-smoke-002';
  values.profiles='autonomous';values.opponents='balanced';values.ticks='700';
  values.gameMode='FFA';values.participants='2';values.fullBots=true;
}
const list=(str,label,allowed=null)=>str.split(',').map(s=>s.trim())
  .filter(Boolean).map(s=>{
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(s)||allowed&&!allowed.includes(s))
      throw Error('Invalid '+label+': '+s);
    return s;
  });
const seeds=list(values.seeds,'seed'),
 profiles=list(values.profiles,'profile',Object.keys(common.profiles)),
 opponents=list(values.opponents,'opponent',values.fullBots?
  Object.keys(common.profiles):['rush','balanced','defender','opportunist']);
if(!seeds.length||!profiles.length||!opponents.length||
 new Set(seeds).size!==seeds.length||
 new Set(profiles).size!==profiles.length||
 new Set(opponents).size!==opponents.length)throw Error('Empty or duplicate match keys');
const ticks=Number(values.ticks);
if(!Number.isInteger(ticks)||ticks<1||ticks>72000)throw Error('Invalid ticks');
if(!values.engine)throw Error('--engine /path/to/official/OpenFrontIO required');
if(!['FFA','Team'].includes(values.gameMode))throw Error('Invalid gameMode');
const participants=Number(values.participants);
if(![2,4].includes(participants)||
  (values.gameMode==='Team'&&participants!==4))
 throw Error('Use --participants 2 for FFA or --participants 4 --gameMode Team for 2v2');
const bot=path.resolve(values.bot),opponentBot=path.resolve(values.opponentBot),
 engine=path.resolve(values.engine),out=path.resolve(values.out),
 botHash=crypto.createHash('sha256').update(fs.readFileSync(bot)).digest('hex'),
 opponentHash=crypto.createHash('sha256').update(fs.readFileSync(opponentBot)).digest('hex');
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
const report={schema:2,smoke:values.smoke,kind:values.fullBots?
  'full-bot-same-engine-league':'legacy-scripted-opponent-league',
 limitations:'No games have been run unless explicitly --execute; live browsers and localhost Duo relay not simulated',
 engineCommit:engineHash,botSHA256:botHash,opponentBotSHA256:opponentHash,
 participants,gameMode:values.gameMode,
 ticks,map:values.map,size:values.size,
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
 let command,argv;
 if(values.fullBots){
   fs.mkdirSync(dir,{recursive:true});
   const lineup=participants===4?[
     {bot,profile:match.profile,teamIndex:0},
     {bot,profile:match.profile,teamIndex:0},
     {bot:opponentBot,profile:match.opponent,teamIndex:1},
     {bot:opponentBot,profile:match.opponent,teamIndex:1}]:[
     {bot,profile:match.profile,teamIndex:0},
     {bot:opponentBot,profile:match.opponent,teamIndex:1}];
   const lineupFile=path.join(dir,'lineup.json');
   fs.writeFileSync(lineupFile,JSON.stringify(lineup,null,2)+'\n');
   command=path.join(__dirname,'engine-multibot.mjs');
   argv=['--lineup',lineupFile,'--gameType','Private',
     '--gameMode',values.gameMode,'--bots','0','--nations','0',
     '--scriptedHumans','0'];
 }else{
   command=path.join(__dirname,'engine-match.mjs');
   argv=['--bot',bot,'--profile',match.profile,
     '--opponentProfile',match.opponent,'--scriptedHumans','4'];
 }
 argv=[command,'--engine',engine,'--engineCommit',engineHash,
   '--out',dir,'--seed',match.seed,...argv,
   '--ticks',String(ticks),'--map',values.map,
   '--size',values.size,'--difficulty',values.difficulty];
 const result=spawnSync(process.execPath,argv,{encoding:'utf8',timeout:values.smoke?180000:7200000,
   maxBuffer:4*1024*1024});
 const file=path.join(dir,'match.json');
 const game=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const expectedFull=values.fullBots?participants:0;
 const hashesValid=!values.fullBots||game?.fullBots?.length===expectedFull&&
   game.fullBots.every((p,i)=>p.botSHA256===(i<participants/2?botHash:opponentHash));
 const meta=game?.benchmarkMeta,cfg=meta?.gameConfig;
 const allowedMode=values.gameMode==='FFA'?['FFA','Free For All']:['Team'];
 const originValid=meta?.engineCommit===engineHash&&
   meta?.seed===match.seed&&meta?.maxTicks===ticks&&
   meta?.gameMap===values.map&&meta?.gameMapSize===values.size&&
   cfg?.gameType==='Private'&&cfg?.difficulty===values.difficulty&&
   allowedMode.includes(cfg?.gameMode)&&
   meta?.scriptedHumans===(values.fullBots?0:4);
 match.status=result.status===0&&!result.error&&game&&hashesValid&&originValid&&
   game.recording?.complete===true&&game.run?.failure==null&&
   game.run?.spawned===true?'recorded':'failed';
 match.outcome=game?.gameEnd?.outcome??'unknown';
 match.fullBots=game?.fullBots?.map(m=>({clientID:m.clientID,
   botSHA256:m.botSHA256,profile:m.profile,teamIndex:m.teamIndex,
   outcome:m.outcome,land:m.land,alive:m.alive}))??null;
 match.termination=game?.run?.termination??'unknown';
 match.tick=game?.run?.tick??null;
 match.error=!originValid&&game?'game provenance mismatch':
   !hashesValid&&game?'participant bundle hash mismatch':
   game?.recording?.complete!==true?'recording incomplete':
   game?.run?.failure?'engine execution failure':
   game?.run?.spawned!==true?'bot not spawned':
   result.error?.message??(result.status===0?null:
   (result.stderr||'Benchmark subprocess failed').slice(-2000));
 save();
 if(match.status==='failed'){
   console.error('LEAGUE_MATCH_FAILED '+JSON.stringify({id:match.id,error:match.error,
     exitStatus:result.status,termination:match.termination,
     stdout:String(result.stdout||'').slice(-1800),
     stderr:String(result.stderr||'').slice(-3500)}));
   process.exitCode=1;break;
 }
}
report.completedAt=new Date().toISOString();save();
console.log(JSON.stringify({report:outputFile,recorded:matches.filter(
 m=>m.status==='recorded').length,total:matches.length,
 notice:'Full-bot result only if --execute completed; missing results remain unknown'}));
