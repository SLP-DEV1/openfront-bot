#!/usr/bin/env node
'use strict';
// Deterministic, visible-state-only scenario pack. No win-rate conclusions.
// The engine is only run with --execute; the default produces a dry-run plan.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const common=require('./common.cjs');

const SCENARIOS=Object.freeze([
  {id:'world-ffa-rush',seed:'scenario-world-rush-01',map:'World',gameMode:'FFA',opponentProfile:'rush'},
  {id:'world-ffa-balanced',seed:'scenario-world-balanced-02',map:'World',gameMode:'FFA',opponentProfile:'balanced'},
  {id:'world-ffa-defender',seed:'scenario-world-defender-03',map:'World',gameMode:'FFA',opponentProfile:'defender'},
  {id:'world-ffa-opportunist',seed:'scenario-world-opportunist-04',map:'World',gameMode:'FFA',opponentProfile:'opportunist'},
  {id:'world-ffa-mixed',seed:'scenario-world-mixed-05',map:'World',gameMode:'FFA',opponentProfile:'mixed'},
  {id:'europe-ffa-rush',seed:'scenario-europe-rush-06',map:'Europe',gameMode:'FFA',opponentProfile:'rush'},
  {id:'europe-ffa-mixed',seed:'scenario-europe-mixed-07',map:'Europe',gameMode:'FFA',opponentProfile:'mixed'},
  {id:'world-team-rush',seed:'scenario-world-team-08',map:'World',gameMode:'Team',opponentProfile:'rush'},
  {id:'world-team-balanced',seed:'scenario-world-team-09',map:'World',gameMode:'Team',opponentProfile:'balanced'},
  {id:'europe-team-mixed',seed:'scenario-europe-team-10',map:'Europe',gameMode:'Team',opponentProfile:'mixed'}
].map(x=>Object.freeze({...x,scriptedHumans:x.gameMode==='Team'?2:2})));

function assertMatch(report,scenario,expected){
  const problems=[],meta=report?.benchmarkMeta,run=report?.run;
  const fail=(ok,name)=>{if(!ok)problems.push(name);};
  fail(meta?.engineCommit===expected.engineCommit,'engine commit mismatch');
  fail(meta?.botSHA256===expected.botSHA256,'bot SHA-256 mismatch');
  fail(meta?.seed===scenario.seed,'seed mismatch');
  fail(meta?.scriptedHumans===scenario.scriptedHumans,'scripted humans mismatch');
  fail(meta?.gameConfig?.gameMode===(scenario.gameMode==='Team'?'Team':'Free For All')||
    meta?.gameConfig?.gameMode===scenario.gameMode,'game mode mismatch');
  fail(run?.failure==null&&run?.termination!=='error','engine failure');
  fail(run?.spawned===true,'bot not spawned (no visible-state sample)');
  fail(report?.recording?.complete===true,'recording incomplete');
  const xs=report?.trajectory?.samples;
  fail(Array.isArray(xs)&&xs.length>0,'no visible samples');
  if(Array.isArray(xs)&&xs.length){
    let prev=-1;
    for(const x of xs){
      fail(Number.isInteger(x.tick)&&x.tick>prev,'non-increasing sample tick');
      prev=x.tick;
      for(const field of ['land','home','gold','enemyLand','enemyTroops'])
        fail(typeof x[field]==='number'&&Number.isFinite(x[field])&&x[field]>=0,
          'invalid '+field+' at tick '+x.tick);
    }
    fail(report.trajectory?.summary?.sampleCount===xs.length,'sample count mismatch');
    fail(report.trajectory?.summary?.finalEnemyLand===xs.at(-1).enemyLand,
      'final hostile-only enemyLand mismatch');
    fail(report.trajectory?.summary?.endLand===xs.at(-1).land,
      'endLand/sample mismatch');
  }
  return [...new Set(problems)];
}
function parse(argv){
  const opts={execute:false,smoke:false,engine:null,
    engineCommit:common.IMPOSSIBLE_REFERENCE_COMMIT,
    bot:'OpenFront_Solo_AggroBot.user.js',out:'benchmark-results/scenario-pack',ticks:700};
  for(let i=0;i<argv.length;i++){
    const key=argv[i].replace(/^--/,'');
    if(!argv[i].startsWith('--')||!Object.hasOwn(opts,key))throw Error('Unknown option '+argv[i]);
    if(key==='execute'||key==='smoke'){opts[key]=true;continue;}
    const v=argv[++i];if(!v||v.startsWith('--'))throw Error('Missing '+key);
    opts[key]=key==='ticks'?Number(v):v;
  }
  if(!Number.isInteger(opts.ticks)||opts.ticks<300||opts.ticks>3000)
    throw Error('Invalid scenario tick limit (300–3000)');
  if(!/^[a-f0-9]{40}$/.test(opts.engineCommit))throw Error('Invalid engine SHA');
  if(opts.execute&&!opts.engine)throw Error('--execute requires --engine');
  return opts;
}
function main(argv=process.argv.slice(2)){
  const opts=parse(argv),bot=path.resolve(opts.bot);
  const botSHA256=common.digest(fs.readFileSync(bot));
  const cases=opts.smoke?SCENARIOS.filter(x=>['world-ffa-rush','world-ffa-balanced','world-team-rush'].includes(x.id)):SCENARIOS;
  const plan={schema:1,kind:'deterministic-scenario-pack',
    mode:opts.execute?'executed':'dry-run',engineCommit:opts.engineCommit,
    botSHA256,ticks:opts.ticks,
    evidence:'GameView-visible samples; no win-rate or human-opponent claim',
    scenarios:cases.map(x=>({...x,status:'not-run'}))};
  if(!opts.execute){console.log(JSON.stringify(plan,null,2));return plan;}
  common.engineInfo(path.resolve(opts.engine),opts.engineCommit);
  const output=path.resolve(opts.out);
  if(fs.existsSync(output))throw Error('Scenario output already exists: '+output);
  fs.mkdirSync(output,{recursive:true});
  const write=()=>common.writeJSON(path.join(output,'scenario-pack.json'),plan);
  write();
  const runner=path.join(__dirname,'engine-match.mjs');
  for(const item of plan.scenarios){
    const dir=path.join(output,item.id);
    const args=[runner,'--engine',opts.engine,'--engineCommit',opts.engineCommit,
      '--bot',bot,'--seed',item.seed,'--map',item.map,'--size','Compact',
      '--difficulty','Impossible','--gameType','Private','--gameMode',item.gameMode,
      '--scriptedHumans',String(item.scriptedHumans),
      '--opponentProfile',item.opponentProfile,
      '--bots','0','--nations','0','--ticks',String(opts.ticks),
      '--profile','autonomous','--out',dir];
    const run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:180000});
    item.status='fail';item.errors=[];
    if(run.error)item.errors.push(String(run.error.message));
    if(run.status!==0)item.errors.push('engine exit '+run.status);
    if(fs.existsSync(path.join(dir,'match.json'))){
      try{
        const report=JSON.parse(fs.readFileSync(path.join(dir,'match.json'),'utf8'));
        item.errors.push(...assertMatch(report,item,{engineCommit:opts.engineCommit,botSHA256}));
        item.termination=report.run?.termination??'unknown';
        item.samples=report.trajectory?.samples?.length??0;
      }catch(e){item.errors.push('invalid match report: '+e.message);}
    }else item.errors.push('missing match.json');
    item.status=item.errors.length?'fail':'pass';
    if(!item.errors.length)delete item.errors;
    write();
    console.log(JSON.stringify({scenario:item.id,status:item.status,
      errors:item.errors??[],samples:item.samples??0}));
  }
  plan.ok=plan.scenarios.every(x=>x.status==='pass');
  write();
  if(!plan.ok)process.exitCode=1;
  return plan;
}
if(require.main===module){
  try{main();}catch(e){console.error(e.stack||String(e));process.exitCode=1;}
}
module.exports={SCENARIOS,assertMatch,parse,main};
