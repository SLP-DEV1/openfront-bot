#!/usr/bin/env node
'use strict';
// Mandate §6: decision-impact analysis across controller arms on the SAME bot
// code. Each arm differs only by the injected model(s) and the candidate
// control score->utility mapping:
//   rule-basis    -> no model
//   run3-schema4  -> schema-4 Run3 champion (biases planners only)
//   A/B/C/D/F/G   -> schema-5 candidate control in variant modes
//   E             -> hybrid (schema-4 Run3 planner + schema-5 control)
//
// Reads a results dir laid out as  <results>/<scenarioId>/<arm>/match.json
// and, from each match's --planningFrames, measures per decision frame:
//   ruleChoice         -> the pre-control rule pick (candidates[0])
//   finalChoice        -> the pick actually sent (selected)
//   changedIntent      -> the control flipped the pick away from the rule
//   safetyBlockReason  -> 'model-preference-blocked' when the model's top
//                         differs from the rule pick but the final pick
//                         stayed with the rule at the configured gain
//   modelScores        -> per-candidate schema-5 scores (array of {id,score})
// and the match-level outcome (outcome, endLand, termination).
//
// The §6 question is "did the model make DIFFERENT decisions, and were those
// changes SENSIBLE (net-positive land) rather than max changedIntent". So we
// report per arm: changedRate (changedIntent), blockedRate (model wanted to
// change but did not take effect at this gain), score statistics, and the
// match outcome; plus PAIRED per-scenario land deltas vs the baselines (same
// seed -> isolation by model/mapping, not seed).
const fs=require('node:fs'),path=require('node:path');

const ARMS=['rule-basis','run3-schema4','A','B','C','D','E','F','G'];
const BASELINES=['rule-basis','run3-schema4'];

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

// Fail-closed contract: planningFrames carry either the legacy boolean or a
// string reason. Normalize both to a reason key (null = not fail-closed).
function failClosedReason(value){
  if(value===true)return 'legacy-boolean';
  if(typeof value==='string'&&value.trim())return value.trim();
  return null;
}

// Summarize one arm's match.json into the §6 decision-impact row.
function armRow(file){
  let report;
  try{report=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(_){return null;}
  const meta=report.benchmarkMeta||{};
  const run=report.run||{};
  const frames=report.planningFrames||[];
  let changed=0,blocked=0,failClosed=0,withRule=0,withFinal=0,scoreSum=0,scoreN=0;
  const failClosedReasons={};
  for(const pf of frames){
    const rule=pf.ruleChoice??null;
    const final=pf.finalChoice??pf.finalChoiceId??null;
    if(rule!=null)withRule++;
    if(final!=null)withFinal++;
    // changedIntent: prefer the explicit field; fall back to final!=rule.
    const ci=pf.changedIntent===true
      ||(pf.changedIntent===undefined&&rule!=null&&final!=null&&rule!==final);
    if(ci)changed++;
    const fcReason=failClosedReason(pf.failClosed);
    if(fcReason){
      failClosed++;
      failClosedReasons[fcReason]=(failClosedReasons[fcReason]||0)+1;
    }
    // blocked: the model's top differs from the rule pick but the final pick
    // stayed with the rule at the configured gain (the switch did not apply).
    if(pf.safetyBlockReason==='model-preference-blocked'||fcReason!==null)blocked++;
    // modelScores is an array of {id,score} (planningFrame form) or an
    // id->score object; handle both. Frames that only expose the binding
    // evidence carry the per-candidate modelScore in binding[].
    const ms=pf.modelScores??
      (Array.isArray(pf.binding)?
        pf.binding.filter(b=>b.modelScore!=null):null);
    if(Array.isArray(ms)){
      for(const e of ms){
        const v=(e&&typeof e==='object')?
          (e.score??e.modelScore):e;
        if(Number.isFinite(v)){scoreSum+=v;scoreN++;}
      }
    }else if(ms&&typeof ms==='object'){
      for(const v of Object.values(ms)){
        if(Number.isFinite(v)){scoreSum+=v;scoreN++;}
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
    failClosedReasons,
    blockedFrames:blocked,blockedRate:framesN?blocked/framesN:null,
    meanModelScore:scoreN?scoreSum/scoreN:null,scoreN,
    controlMode:meta.candidateControlMode??null,
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
    // Read the scenario config (map/opponent/mode) + seed from any match meta.
    let map=null,opponent=null,mode=null,seed=null;
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
    // Paired land deltas (same seed -> isolation by model/mapping).
    const delta=(a,b)=>(Number.isFinite(a?.endLand)&&Number.isFinite(b?.endLand))
      ?a.endLand-b.endLand:null;
    const paired={};
    for(const arm of o.arms){
      if(BASELINES.includes(arm))continue;
      for(const base of BASELINES)
        paired[`${arm} vs ${base}`]=delta(perArm[arm],perArm[base]);
    }
    scenarios.push({scenarioId:sid,seed,map,opponent,mode,perArm,paired});
  }

  // Per-arm aggregate across scenarios.
  const perArm={};
  for(const arm of o.arms){
    const rows=scenarios.map(s=>s.perArm[arm]).filter(Boolean);
    if(!rows.length){perArm[arm]={matches:0};continue;}
    const lands=rows.map(r=>r.endLand).filter(Number.isFinite);
    const changedRate=rows.reduce((a,r)=>a+(r.changedRate??0),0)/rows.length;
    const blockedRate=rows.reduce((a,r)=>a+(r.blockedRate??0),0)/rows.length;
    const wins=rows.filter(r=>r.confirmed&&r.outcome==='victory').length;
    const losses=rows.filter(r=>r.confirmed&&r.outcome==='defeat').length;
    perArm[arm]={matches:rows.length,
      meanEndLand:lands.length?lands.reduce((a,b)=>a+b,0)/lands.length:null,
      changedRate,blockedRate,
      meanModelScore:rows.filter(r=>r.meanModelScore!=null)
        .reduce((a,r)=>a+r.meanModelScore,0)/
        Math.max(1,rows.filter(r=>r.meanModelScore!=null).length),
      confirmedWins:wins,confirmedLosses:losses};
  }
  // Paired aggregate across scenarios (only where both land values exist).
  const pairKeys=[];
  for(const arm of o.arms){
    if(BASELINES.includes(arm))continue;
    for(const base of BASELINES)pairKeys.push(`${arm} vs ${base}`);
  }
  const paired={};
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
    note:'Isolation by model/mapping: identical bot source across arms; same engine seed per scenario. changedRate = fraction of decision frames with changedIntent (the candidate control moved the pick away from the rule). blockedRate = fraction where the model top differed from the rule pick but the final pick stayed with the rule at the configured gain. Paired deltas compare endLand on the SAME seed, so a positive delta for an arm = its changed decisions netted positive land.',
    scenarios,aggregate:{perArm,paired}};
  fs.writeFileSync(path.join(o.out,'decision-impact.json'),
    JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({scenarios:scenarios.length,
    arms:Object.fromEntries(Object.entries(report.aggregate.perArm)
      .map(([a,v])=>[a,{matches:v.matches,
        changedRate:v.changedRate?+v.changedRate.toFixed(4):v.changedRate,
        blockedRate:v.blockedRate?+v.blockedRate.toFixed(4):v.blockedRate,
        meanEndLand:v.meanEndLand?+v.meanEndLand.toFixed(1):null,
        wins:v.confirmedWins,losses:v.confirmedLosses}])),
    paired:report.aggregate.paired},null,2));
}
if(require.main===module)main();
module.exports={armRow,discoverScenarios,parseArgs,failClosedReason,
  ARMS,BASELINES};
