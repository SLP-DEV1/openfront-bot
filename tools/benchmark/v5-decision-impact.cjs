#!/usr/bin/env node
'use strict';
// Mandate §6: decision-impact analysis for the four arms on the SAME bot
// code. Each arm differs only by the model(s) injected (rule-basis: none,
// run3-schema4: schema-4, schema-5: schema-5, hybrid: schema-4+schema-5).
//
// Reads a results dir laid out as  <results>/<scenarioId>/<arm>/match.json
// and, from each match's --planningFrames, measures per decision frame:
//   ruleChoice     -> the rule-basis pick (candidates[0] before any model)
//   finalChoiceId  -> the pick actually sent
//   modelChoice    -> schema-5 top pick, modelScores -> per-candidate scores
//   changedIntent  -> whether the (schema-5) control altered the pick
//   failClosed     -> safety-gate fallback reason (blockReason)
// and the match-level outcome (outcome, endLand, termination).
//
// The §6 question is "did the model make DIFFERENT decisions, and were those
// changes SENSIBLE (net-positive land) rather than max changedIntent". So we
// report per arm: changedRate (finalChoiceId != ruleChoice), failClosedRate,
// score statistics, and the match outcome; plus PAIRED per-scenario land
// deltas vs the baselines (same seed -> isolation by model, not seed).
const fs=require('node:fs'),path=require('node:path');

const ARMS=['rule-basis','run3-schema4','schema-5','hybrid'];

function parseArgs(argv){
  const o={out:null,arms:ARMS.join(','),scenarios:null};
  for(let i=0;i<argv.length;i++){
    const key=argv[i].replace(/^--/,'');
    if(!argv[i].startsWith('--')||!Object.hasOwn(o,key))throw Error('Unknown option '+argv[i]);
    if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value for '+argv[i]);
    o[key]=argv[++i];
  }
  o.arms=o.arms.split(',').map(s=>s.trim()).filter(Boolean);
  if(!o.out)throw Error('--out <resultsDir> is required');
  o.out=path.resolve(o.out);
  return o;
}

// Summarize one arm's match.json into the §6 decision-impact row.
function armRow(file){
  let report;
  try{report=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(_){return null;}
  const meta=report.benchmarkMeta||{};
  const run=report.run||{};
  const frames=report.planningFrames||[];
  let changed=0,failClosed=0,withRule=0,withFinal=0,scoreSum=0,scoreN=0;
  const scoreVals=[];
  for(const pf of frames){
    const rule=pf.ruleChoice??null,final=pf.finalChoiceId??null;
    if(rule!=null)withRule++;
    if(final!=null)withFinal++;
    if(rule!=null&&final!=null&&rule!==final)changed++;
    if(pf.failClosed===true)failClosed++;
    // modelScores is either an array of {id,score} (the planningFrame form)
    // or an id->score object; handle both.
    const ms=pf.modelScores;
    if(Array.isArray(ms)){
      for(const e of ms){
        const v=(e&&typeof e==='object')?e.score:e;
        if(Number.isFinite(v)){scoreSum+=v;scoreN++;scoreVals.push(v);}
      }
    }else if(ms&&typeof ms==='object'){
      for(const v of Object.values(ms)){
        if(Number.isFinite(v)){scoreSum+=v;scoreN++;scoreVals.push(v);}
      }
    }
  }
  const framesN=frames.length;
  const endLand=report.finalState?.land??null;
  const outcome=report.gameEnd?.outcome??'incomplete';
  const termination=run.termination??null;
  const confirmed=termination==='game-over'||termination==='eliminated';
  return{outcome,termination,confirmed,
    endLand,endTick:run.tick??null,
    frames:framesN,
    changedFrames:changed,withRule,withFinal,
    changedRate:framesN?changed/framesN:null,
    failClosedFrames:failClosed,failClosedRate:framesN?failClosed/framesN:null,
    meanModelScore:scoreN?scoreSum/scoreN:null,scoreN,
    botSHA256:meta.botSHA256??null,policySHA256:meta.policySHA256??null,
    seed:meta.seed??null,engineCommit:meta.engineCommit??null};
}

// Discover scenarios: each subdirectory of `out` that contains at least one
// arm subdirectory with a match.json.
function discoverScenarios(out,arms){
  const outDirs=[];
  for(const e of fs.readdirSync(out,{withFileTypes:true})){
    if(!e.isDirectory())continue;
    const hasArm=arms.some(a=>
      fs.existsSync(path.join(out,e.name,a,'match.json')));
    if(hasArm)outDirs.push(e.name);
  }
  return outDirs.sort();
}

function main(){
  const o=parseArgs(process.argv.slice(2));
  const scenarioIds=discoverScenarios(o.out,o.arms);
  const scenarios=[];
  for(const sid of scenarioIds){
    const perArm={};
    for(const arm of o.arms){
      const file=path.join(o.out,sid,arm,'match.json');
      if(!fs.existsSync(file))continue;
      const row=armRow(file);
      if(row)perArm[arm]=row;
    }
    // Read the scenario config (map/opponent/mode) from any match meta.
    let map=null,opponent=null,mode=null,seed=null;
    for(const arm of o.arms){
      const row=perArm[arm];
      if(row?.seed)seed=row.seed;
    }
    for(const arm of o.arms){
      try{
        const r=JSON.parse(fs.readFileSync(path.join(o.out,sid,arm,'match.json'),'utf8'));
        const cfg=r.benchmarkMeta?.gameConfig||{};
        if(cfg.gameMap)map=cfg.gameMap;
        if(cfg.opponentProfile)opponent=cfg.opponentProfile;
        if(cfg.gameMode)mode=cfg.gameMode;
        if(!seed)seed=r.benchmarkMeta?.seed??null;
      }catch(_){/* ignore */}
    }
    // Paired land deltas (same seed -> isolation by model).
    const rb=perArm['rule-basis'],r3=perArm['run3-schema4'],
      v5=perArm['schema-5'],hy=perArm['hybrid'];
    const delta=(a,b)=>(Number.isFinite(a?.endLand)&&Number.isFinite(b?.endLand))
      ?a.endLand-b.endLand:null;
    scenarios.push({scenarioId:sid,seed,map,opponent,mode,perArm,
      paired:{
        'schema-5 vs rule-basis':delta(v5,rb),
        'schema-5 vs run3-schema4':delta(v5,r3),
        'hybrid vs rule-basis':delta(hy,rb),
        'hybrid vs run3-schema4':delta(hy,r3),
        'run3-schema4 vs rule-basis':delta(r3,rb)}});
  }

  // Per-arm aggregate across scenarios.
  const perArm={};
  for(const arm of o.arms){
    const rows=scenarios.map(s=>s.perArm[arm]).filter(Boolean);
    if(!rows.length){perArm[arm]={matches:0};continue;}
    const lands=rows.map(r=>r.endLand).filter(Number.isFinite);
    const changedRate=rows.reduce((a,r)=>a+(r.changedRate??0),0)/rows.length;
    const failClosedRate=rows.reduce((a,r)=>a+(r.failClosedRate??0),0)/rows.length;
    const wins=rows.filter(r=>r.confirmed&&r.outcome==='victory').length;
    const losses=rows.filter(r=>r.confirmed&&r.outcome==='defeat').length;
    perArm[arm]={matches:rows.length,
      meanEndLand:lands.length?lands.reduce((a,b)=>a+b,0)/lands.length:null,
      changedRate,failClosedRate,
      meanModelScore:rows.filter(r=>r.meanModelScore!=null)
        .reduce((a,r)=>a+r.meanModelScore,0)/
        Math.max(1,rows.filter(r=>r.meanModelScore!=null).length),
      confirmedWins:wins,confirmedLosses:losses};
  }
  // Paired aggregate across scenarios (only where both land values exist).
  const paired={};
  const pairKeys=['schema-5 vs rule-basis','schema-5 vs run3-schema4',
    'hybrid vs rule-basis','hybrid vs run3-schema4','run3-schema4 vs rule-basis'];
  for(const key of pairKeys){
    const vals=scenarios.map(s=>s.paired[key]).filter(Number.isFinite);
    if(!vals.length){paired[key]={pairs:0};continue;}
    const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
    paired[key]={pairs:vals.length,meanLandDelta:mean,
      positivePairs:vals.filter(v=>v>0).length,
      negativePairs:vals.filter(v=>v<0).length,zeroPairs:vals.filter(v=>v===0).length};
  }
  const report={kind:'v5-decision-impact',
    generated:new Date().toISOString(),arms:o.arms,
    note:'Isolation by model: identical bot source across arms; same engine seed per scenario. changedRate = fraction of decision frames where finalChoiceId != ruleChoice (the model moved the pick away from pure rules). Paired deltas compare endLand on the SAME seed, so a positive delta for a model arm = its changed decisions netted positive land.',
    scenarios,aggregate:{perArm,paired}};
  const dir=process.argv[2]&&o.out;
  fs.writeFileSync(path.join(o.out,'decision-impact.json'),
    JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({scenarios:scenarios.length,
    arms:Object.fromEntries(Object.entries(report.aggregate.perArm)
      .map(([a,v])=>[a,{matches:v.matches,
        changedRate:v.changedRate?+v.changedRate.toFixed(4):v.changedRate,
        meanEndLand:v.meanEndLand?+v.meanEndLand.toFixed(1):null,
        wins:v.confirmedWins,losses:v.confirmedLosses}])),
    paired:report.aggregate.paired},null,2));
}
if(require.main===module)main();
module.exports={armRow,discoverScenarios,parseArgs};
