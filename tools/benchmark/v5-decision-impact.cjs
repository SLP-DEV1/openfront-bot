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
    candidateControl:meta.candidateControl??null,
    candidateGain:meta.candidateGain??null,
    botSHA256:meta.botSHA256??null,policySHA256:meta.policySHA256??null,
    seed:meta.seed??null,engineCommit:meta.engineCommit??null,
    gameMap:meta.gameMap??meta.gameConfig?.gameMap??null,
    gameMapSize:meta.gameMapSize??meta.gameConfig?.gameMapSize??null,
    gameMode:meta.gameMode??meta.gameConfig?.gameMode??null,
    opponentProfile:meta.opponentProfile??null,
    scriptedHumans:meta.scriptedHumans??null,
    profile:meta.profile??null,
    harness:meta.harness??null,
    trajectorySemantics:meta.trajectorySemantics??null,
    gameConfig:meta.gameConfig??null};
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


function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')
    return Object.fromEntries(Object.keys(value).sort()
      .map(k=>[k,canonical(value[k])]));
  return value;
}
function sameValue(a,b){
  return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
function loadCaptureManifest(out){
  const file=path.join(out,'capture-manifest.json');
  if(!fs.existsSync(file))return null;
  let manifest;
  try{manifest=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(e){throw Error('Invalid capture-manifest.json: '+e.message);}
  return manifest;
}
function validateScenarioProvenance(sid,arms,perArm,manifest=null){
  const missing=arms.filter(a=>!perArm[a]);
  if(missing.length)
    throw Error(`[provenance] ${sid}: missing requested arms: ${missing.join(', ')}`);
  const rows=arms.map(a=>perArm[a]);
  for(const key of ['seed','engineCommit']){
    const values=rows.map(r=>r[key]);
    if(values.some(v=>v==null||v===''))
      throw Error(`[provenance] ${sid}: missing ${key}`);
    if(values.some(v=>v!==values[0]))
      throw Error(`[provenance] ${sid}: mismatched ${key}: ${JSON.stringify(values)}`);
  }
  for(const key of ['gameMap','gameMapSize','gameMode','opponentProfile',
    'scriptedHumans','profile','harness','trajectorySemantics','gameConfig']){
    const first=rows[0][key];
    if(rows.some(r=>!sameValue(r[key],first)))
      throw Error(`[provenance] ${sid}: mismatched ${key}`);
  }
  if(perArm['rule-basis']){
    if(perArm['rule-basis'].policySHA256!=null)
      throw Error(`[provenance] ${sid}: rule-basis must not carry a policy`);
    if(perArm['rule-basis'].candidateControl===true)
      throw Error(`[provenance] ${sid}: rule-basis unexpectedly enables candidate control`);
  }
  if(perArm['run3-schema4']){
    if(!perArm['run3-schema4'].policySHA256)
      throw Error(`[provenance] ${sid}: run3-schema4 is missing its policy identity`);
    if(perArm['run3-schema4'].candidateControl===true)
      throw Error(`[provenance] ${sid}: run3-schema4 unexpectedly enables candidate control`);
  }
  for(const arm of arms){
    if(BASELINES.includes(arm))continue;
    if(!perArm[arm].policySHA256)
      throw Error(`[provenance] ${sid}: ${arm} is missing its policy identity`);
    if(perArm[arm].candidateControl!==true)
      throw Error(`[provenance] ${sid}: ${arm} must enable candidate control`);
  }
  let manifestScenario=null;
  if(manifest){
    if(manifest.engineCommit&&manifest.engineCommit!==rows[0].engineCommit)
      throw Error(`[provenance] ${sid}: engineCommit differs from capture manifest`);
    manifestScenario=(manifest.scenarios||[]).find(x=>x.scenarioId===sid)||null;
    if(!manifestScenario)
      throw Error(`[provenance] ${sid}: scenario missing from capture manifest`);
    if(manifestScenario.matchSeed&&manifestScenario.matchSeed!==rows[0].seed)
      throw Error(`[provenance] ${sid}: seed differs from capture manifest`);
    if(manifestScenario.map&&manifestScenario.map!==rows[0].gameMap)
      throw Error(`[provenance] ${sid}: map differs from capture manifest`);
    if(manifestScenario.opponent&&manifestScenario.opponent!==rows[0].opponentProfile)
      throw Error(`[provenance] ${sid}: opponent differs from capture manifest`);
    for(const arm of arms){
      const expected=(manifest.rows||[])
        .find(x=>x.scenarioId===sid&&x.arm===arm);
      if(!expected)
        throw Error(`[provenance] ${sid}/${arm}: row missing from capture manifest`);
      if(expected.matchSeed&&expected.matchSeed!==perArm[arm].seed)
        throw Error(`[provenance] ${sid}/${arm}: seed differs from capture manifest`);
      if(Object.hasOwn(expected,'botSHA256')&&
        expected.botSHA256!==perArm[arm].botSHA256)
        throw Error(`[provenance] ${sid}/${arm}: botSHA256 differs from capture manifest`);
      if(Object.hasOwn(expected,'policySHA256')&&
        expected.policySHA256!==perArm[arm].policySHA256)
        throw Error(`[provenance] ${sid}/${arm}: policySHA256 differs from capture manifest`);
    }
  }
  return{
    verified:true,
    source:manifest?'capture-manifest+match-meta':'match-meta',
    seed:rows[0].seed,
    engineCommit:rows[0].engineCommit,
    map:rows[0].gameMap,
    opponent:rows[0].opponentProfile,
    mode:manifestScenario?.mode??rows[0].gameMode
  };
}
function validateArmIdentityAcrossScenarios(scenarios,arms){
  for(const arm of arms){
    const rows=scenarios.map(s=>s.perArm[arm]).filter(Boolean);
    if(!rows.length)continue;
    const identityKeys=['botSHA256','policySHA256','candidateControl',
      'candidateGain','controlMode'];
    for(const key of identityKeys){
      const first=rows[0][key];
      if(rows.some(r=>!sameValue(r[key],first)))
        throw Error(`[provenance] ${arm}: ${key} drifted across scenarios`);
    }
  }
  return true;
}

function main(){
  const o=parseArgs(process.argv.slice(2));
  const scenarioIds=discoverScenarios(o.out,o.arms);
  const manifest=loadCaptureManifest(o.out);
  const scenarios=[];
  for(const sid of scenarioIds){
    const perArm={};
    for(const arm of o.arms){
      const file=path.join(o.out,sid,arm,'match.json');
      if(!fs.existsSync(file))continue;
      const row=armRow(file);
      if(row)perArm[arm]=row;
    }
    // Fail closed before any pair is emitted. The capture manifest, when
    // present, is the canonical arm/scenario provenance contract.
    const provenance=validateScenarioProvenance(sid,o.arms,perArm,manifest);
    const delta=(a,b)=>(Number.isFinite(a?.endLand)&&Number.isFinite(b?.endLand))
      ?a.endLand-b.endLand:null;
    const paired={};
    for(const arm of o.arms){
      if(BASELINES.includes(arm))continue;
      for(const base of BASELINES)
        if(o.arms.includes(base))
          paired[`${arm} vs ${base}`]=delta(perArm[arm],perArm[base]);
    }
    scenarios.push({scenarioId:sid,seed:provenance.seed,
      map:provenance.map,opponent:provenance.opponent,mode:provenance.mode,
      provenance,perArm,paired});
  }
  validateArmIdentityAcrossScenarios(scenarios,o.arms);

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
    provenanceVerified:true,
    note:'Isolation by model/mapping is reported only after fail-closed provenance validation. Seed, engine, match configuration, stable arm identity, and (when present) capture-manifest bot/policy identities must match before any paired delta is emitted. changedRate = fraction of decision frames with changedIntent; blockedRate = fraction where model preference did not take effect.',
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
  loadCaptureManifest,validateScenarioProvenance,validateArmIdentityAcrossScenarios,
  ARMS,BASELINES};
