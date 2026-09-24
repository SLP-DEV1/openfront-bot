#!/usr/bin/env node
'use strict';
// Step 3: build a REAL schema-5 training dataset from live engine matches.
//
// Runs the real engine (engine-gameview-v2) across a map x difficulty x seed
// matrix with the current bot, capturing planning frames every 100 ticks via
// --planningFrames. Each captured frame already mirrors the exact runtime
// visible state (00-bootstrap.planningFrame) and includes the FULL candidate
// list. The dataset expands each frame to one row per candidate (the model is
// a candidate SCORER), so the action distribution reflects real decisions, not
// a single synthetic template. Labels come from trainer/v5-labels.cjs
// (v5-Outcome-Labels: heldGain/lossRisk over a horizon), exactly as
// trainer/train-v5.cjs consumes them (feature parity by construction).
//
// Usage:
//   node v5-dataset.cjs --run true --engine <dir> --out <dir> \
//        --map World --difficulty Medium --seeds 6 --ticks 6000
//   node v5-dataset.cjs --assemble <resultsDir>   (rebuild dataset from existing)
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const common=require('./common.cjs');
const feat=require('../../trainer/v5-features.cjs');
const candidate=require('../../trainer/candidate-policy-v5.cjs');
const {buildLabels}=require('../../trainer/v5-labels.cjs');
const INPUTS=candidate.INPUTS;

function parseArgs(argv){
  const o={engine:null,engineCommit:common.ENGINE_COMMIT,out:null,run:false,
    assemble:null,map:'World',difficulty:'Medium',seeds:6,ticks:6000,
    seedBase:20260000,scriptedHumans:3,opponentProfile:'mixed',
    horizonTicks:600,landScale:800,expandAll:true};
  for(let i=0;i<argv.length;i++){
    const key=argv[i].replace(/^--/,'');
    if(!argv[i].startsWith('--')||!Object.hasOwn(o,key))throw Error('Unknown option '+argv[i]);
    if(key==='run'){o.run=argv[++i]==='true';continue;}
    if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value for '+argv[i]);
    o[key]=argv[++i];
  }
  o.seeds=Number(o.seeds);o.ticks=Number(o.ticks);
  o.seedBase=Number(o.seedBase);o.scriptedHumans=Number(o.scriptedHumans);
  o.horizonTicks=Number(o.horizonTicks);o.landScale=Number(o.landScale);
  if(o.out)o.out=path.resolve(o.out);
  if(o.assemble)o.assemble=path.resolve(o.assemble);
  return o;
}

// One row per candidate in a planning frame. visibleState = the runtime state
// fields + the candidate's own fields (flattened), action = {type:kind}.
// Only the candidate that was actually chosen AND executed (pf.candidate,
// i.e. planningState.selected) may be attributed observed outcomes: that row
// gets `observed:true`. Unchosen candidates are `observed:false` — their
// outcomes stay unknown (counterfactual) unless demonstrated separately, so
// they never inherit the executed action's success labels.
function frameRows(pf){
  const base={home:pf.home,maxTroops:pf.maxTroops,committed:pf.committed,
    incoming:pf.incoming,reserve:pf.reserve,gold:pf.gold,
    capacityUse:pf.capacityUse,frontCount:pf.frontCount,
    // State extension fields captured by planningFrame from
    // planningState.v5State (featuredSchemaVersion 2). Legacy frames omit
    // them; absent fields must stay absent/0-baseline so training features
    // match what the runtime actually produced for that frame.
    economyRelative:pf.economyRelative??0,frontReach:pf.frontReach??0,
    partnerNeed:pf.partnerNeed??0,enemyBound:pf.enemyBound??0,
    landTrend:pf.landTrend,goldTrend:pf.goldTrend,troopTrend:pf.troopTrend,
    portAccess:pf.portAccess??0,technologyCoverage:pf.technologyCoverage??0};
  const rows=[];
  const cands=pf.candidates&&pf.candidates.length?pf.candidates:[pf.candidate];
  const chosen=pf.candidate;
  const chosenJson=chosen&&chosen.kind?JSON.stringify(chosen):null;
  for(const c of cands){
    if(!c||!c.kind)continue;
    const observed=chosenJson!=null&&(c===chosen||JSON.stringify(c)===chosenJson);
    rows.push({tick:pf.tick,observed,
      visibleState:{...base,land:pf.land,
        costTroops:c.costTroops||0,costGold:c.costGold||0,
        expectedLand:c.expectedLand||0,duration:c.duration||0,
        returnTime:c.returnTime||0,counterRisk:c.counterRisk||0,
        thirdPartyRisk:c.thirdPartyRisk||0,
        infrastructureValue:c.infrastructureValue||0,
        incomeValue:c.incomeValue||0,
        recruitmentValue:c.recruitmentValue||0,
        siteRisk:c.siteRisk||0,
        holdProbability:c.holdProbability ?? 1,
        legalConfidence:c.legalConfidence},
      action:{type:c.kind}});
  }
  return rows;
}

// Recursively collect every match.json under `dir` (matches land at
// <results>/<map>/<difficulty>/<seed>/match.json, but a flat dir must also
// work so a single smoke run can be assembled directly).
function findMatchFiles(dir){
  const out=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory())out.push(...findMatchFiles(p));
    else if(e.name==='match.json')out.push(p);
  }
  return out.sort();
}

// Assemble a train-v5.cjs-shaped dataset from a results directory.
function assemble(results,opts){
  const {horizonTicks,landScale,expandAll}=opts;
  const matchFiles=findMatchFiles(results);
  const matches=[];const stats={matches:0,totalRows:0,usableLabels:0,
    observedRows:0,counterfactualRows:0,
    badFeatures:0,featureRows:0,land:0,heldGain:0,lossRisk:0,
    heldGainMean:null,lossRiskMean:null,outcomes:{},kinds:{}};
  for(const file of matchFiles){
    let report;
    try{report=JSON.parse(fs.readFileSync(file,'utf8'));}
    catch(_){continue;}
    const pfs=report.planningFrames||[];
    const frames=[];
    for(const pf of pfs){
      if(!pf||pf.tick==null)continue;
      const rows=frameRows(pf);
      for(const r of rows)frames.push(r);
    }
    if(!frames.length)continue;
    frames.sort((a,b)=>a.tick-b.tick||0);
    // matchId = relative subpath (map/difficulty/seed) minus the filename.
    const rel=path.relative(results,path.dirname(file)).replace(/\\/g,'/');
    matches.push({matchId:'v5d-'+(rel||'flat'),
      outcome:report.gameEnd?.outcome??'unknown',frames});
  }
  // Labels + feature parity stats (mirrors train-v5.cjs buildSamples exactly).
  for(const m of matches){
    const frames=m.frames.slice().sort((a,b)=>(a.tick??0)-(b.tick??0));
    const labels=buildLabels(frames,{horizonTicks,landScale,
      matchOutcome:m.outcome});
    const out=m.outcome;
    stats.outcomes[out]=(stats.outcomes[out]||0)+1;
    let withLabel=0;
    for(let i=0;i<frames.length;i++){
      stats.totalRows++;
      const vs=frames[i].visibleState||{};
      const st={home:vs.home,maxTroops:vs.maxTroops,committed:vs.committed,
        incoming:vs.incoming,reserve:vs.reserve,gold:vs.gold,land:vs.land,
        capacityUse:vs.capacityUse,frontCount:vs.frontCount,
        economyRelative:vs.economyRelative??0,frontReach:vs.frontReach??0,
        partnerNeed:vs.partnerNeed??0,enemyBound:vs.enemyBound??0,
        landTrend:vs.landTrend,goldTrend:vs.goldTrend,
        troopTrend:vs.troopTrend,portAccess:vs.portAccess??0,
        technologyCoverage:vs.technologyCoverage??0};
      const cand={kind:frames[i].action?.type,
        costTroops:vs.costTroops||0,costGold:vs.costGold||0,
        expectedLand:vs.expectedLand||0,duration:vs.duration||0,
        returnTime:vs.returnTime||0,counterRisk:vs.counterRisk||0,
        thirdPartyRisk:vs.thirdPartyRisk||0,
        infrastructureValue:vs.infrastructureValue||0,
        incomeValue:vs.incomeValue||0,
        recruitmentValue:vs.recruitmentValue||0,siteRisk:vs.siteRisk||0,
        holdProbability:vs.holdProbability ?? 1,
        legalConfidence:vs.legalConfidence};
      const x=feat.buildFeatures(st,cand);
      if(x.length!==INPUTS||x.some(v=>!Number.isFinite(v)||v<0||v>1)){
        stats.badFeatures++;
      }else stats.featureRows++;
      if(frames[i].observed===false)stats.counterfactualRows++;
      else stats.observedRows++;
      const y=labels[i];
      // Count only usable labels, exactly as trainer/train-v5.cjs consumes
      // them (row.usable with non-null heldGain/lossRisk). Unchosen rows are
      // counterfactual and never contribute observed outcome labels.
      if(y&&y.usable&&y.heldGain!=null&&y.lossRisk!=null){
        withLabel++;
        stats.heldGain+=y.heldGain;
        stats.lossRisk+=y.lossRisk;
      }
      stats.kinds[cand.kind]=(stats.kinds[cand.kind]||0)+1;
    }
    stats.usableLabels+=withLabel;
  }
  if(stats.featureRows){
    stats.heldGainMean=stats.heldGain/stats.usableLabels;
    stats.lossRiskMean=stats.lossRisk/stats.usableLabels;
  }
  stats.matches=matches.length;
  const dataset={horizonTicks,landScale,matches};
  return{dataset,stats};
}

// Flatten so trainer/train-v5.cjs (which reads dataset.matches,
// dataset.horizonTicks, dataset.landScale at top level) can consume it
// directly; provenance metadata is carried alongside.
function writeDataset(file,o,dataset,stats){
  fs.writeFileSync(file,JSON.stringify({kind:'v5-real-dataset',
    engineCommit:o.engineCommit,generated:new Date().toISOString(),
    source:'engine-gameview-v2 planningFrames',
    horizonTicks:dataset.horizonTicks,landScale:dataset.landScale,
    matches:dataset.matches,stats}));
}

function runOne(o,map,difficulty,seed){
  const dir=path.join(o.out,map.toLowerCase(),difficulty.toLowerCase(),
    String(seed));
  fs.mkdirSync(dir,{recursive:true});
  const matchId='v5d-'+map+'-'+difficulty+'-'+seed;
  const args=[path.join(__dirname,'engine-match.mjs'),
    '--bot','OpenFront_Solo_AggroBot.user.js','--engine',o.engine,
    '--engineCommit',o.engineCommit,'--seed',String(seed),
    '--map',map,'--difficulty',difficulty,
    '--scriptedHumans',String(o.scriptedHumans),
    '--opponentProfile',o.opponentProfile,'--ticks',String(o.ticks),
    '--planningFrames','true','--out',dir];
  const r=spawnSync(process.execPath,args,{encoding:'utf8'});
  const ok=r.status===0&&fs.existsSync(path.join(dir,'match.json'));
  return{seed,dir,ok,stderr:r.stderr||''};
}

function main(){
  const o=parseArgs(process.argv.slice(2));
  if(o.assemble){
    if(!o.out)throw Error('--out is required for --assemble');
    const {dataset,stats}=assemble(o.assemble,o);
    fs.mkdirSync(o.out,{recursive:true});
    // Top-level matches/horizonTicks/landScale so trainer/train-v5.cjs can
    // consume the file directly (it reads those fields, ignoring the rest).
    writeDataset(path.join(o.out,'dataset.json'),o,dataset,stats);
    fs.writeFileSync(path.join(o.out,'dataset-stats.json'),
      JSON.stringify(stats,null,2));
    console.log(JSON.stringify(stats));
    return;
  }
  if(!o.run)throw Error('Use --run true (with --engine) or --assemble <dir>');
  if(!o.engine)throw Error('--engine is required with --run');
  if(!o.out)throw Error('--out is required');
  const eng=common.engineInfo(o.engine,o.engineCommit);
  if(eng!==o.engineCommit)throw Error('Engine commit mismatch');
  fs.mkdirSync(o.out,{recursive:true});
  const results=[];
  for(let i=0;i<o.seeds;i++){
    const seed=o.seedBase+i;
    const res=runOne(o,o.map,o.difficulty,seed);
    results.push({map:o.map,difficulty:o.difficulty,seed,...res});
    console.error(`[v5-dataset] ${o.map} ${o.difficulty} seed=${seed} -> ${res.ok?'ok':'FAIL'}`);
  }
  const {dataset,stats}=assemble(o.out,o);
  writeDataset(path.join(o.out,'dataset.json'),o,dataset,stats);
  fs.writeFileSync(path.join(o.out,'dataset-stats.json'),JSON.stringify(stats,null,2));
  console.log(JSON.stringify({ran:results.length,ok:results.filter(r=>r.ok).length,
    stats}));
}
if(require.main===module)main();
module.exports={frameRows,assemble,runOne,parseArgs};
