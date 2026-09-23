#!/usr/bin/env node
'use strict';
// P5: independent, paired, pre-registered holdout for the schema-5 candidate
// control arm against BOTH baselines on the SAME bot code:
//   rule-basis    -> the shared bot code with no model (pure rules)
//   run3-schema4  -> the shared bot code + the schema-4 Run3 champion
//   candidate     -> the shared bot code + the schema-5 model driving control
//
// The three arms differ only by the model/config injected into identical
// source, so every comparison isolates the model, not the code. The
// pre-registered protocol (mode/map/opponent/seed/role-rotation + immutable
// bot/model hashes) is fixed before any match is run. This module reuses
// trainer/promotion-gate-v5.cjs as the minimum advisory basis and adds:
//   * matched-pair confidence intervals on the MATCH level per baseline,
//   * negative gates (unconfirmed win, non-reproducible provenance, missing
//     run data, untenable per-scenario regression),
//   * the 0/0 / not-distinguishable -> no-promotion rule.
//
// No benchmark is executed unless --execute is passed. Dry-run only writes
// the pre-registered protocol and plan. Eligibility is advisory only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const common=require('./common.cjs');
const policyV4=require('../../trainer/strategic-policy-v4.cjs');
const candidateV5=require('../../trainer/candidate-policy-v5.cjs');
const {evaluate:gateEvaluate}=require('../../trainer/promotion-gate-v5.cjs');

const MODES=['1v1','official-2v2','ffa-duo'];
const ARM_ORDER=['candidate','rule-basis','run3-schema4'];
// mode -> engine-match config. 1v1 is a fast, decisive fixture used for the
// CI smoke; the full holdout may add the heavier core formats.
const MODE_CONFIG={
  '1v1':{gameMode:'FFA',bots:2,nations:2,scriptedHumans:1},
  'ffa-duo':{gameMode:'FFA',bots:40,nations:8,scriptedHumans:3},
  'official-2v2':{gameMode:'Team',bots:2,nations:2,scriptedHumans:3}
};
const HEX64=/^[a-f0-9]{64}$/i;
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');

function parseArgs(argv){
  const o={bot:null,run3Policy:null,candidateModel:null,engine:null,
    engineCommit:common.ENGINE_COMMIT,out:null,execute:false,smoke:false,
    mode:'1v1',maps:'World,Europe',opponents:'balanced,rush',runs:2,
    size:'Compact',difficulty:'Medium',gain:18,ticks:18000};
  for(let i=0;i<argv.length;i++){
    const key=argv[i].replace(/^--/,'');
    if(!argv[i].startsWith('--')||!Object.hasOwn(o,key))throw Error('Unknown option '+argv[i]);
    if(key==='execute'||key==='smoke'){o[key]=true;continue;}
    if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value for '+argv[i]);
    o[key]=argv[++i];
  }
  o.maps=o.maps.split(',').map(s=>s.trim()).filter(Boolean);
  o.opponents=o.opponents.split(',').map(s=>s.trim()).filter(Boolean);
  o.runs=Number(o.runs);o.gain=Number(o.gain);o.ticks=Number(o.ticks);
  if(!MODES.includes(o.mode))throw Error('Invalid --mode (use 1v1|official-2v2|ffa-duo)');
  if(o.maps.length<2)throw Error('--maps needs >=2 distinct maps');
  if(new Set(o.maps).size!==o.maps.length)throw Error('--maps must be unique');
  if(o.opponents.length<2)throw Error('--opponents needs >=2 distinct opponents');
  if(new Set(o.opponents).size!==o.opponents.length)throw Error('--opponents must be unique');
  if(!o.opponents.every(x=>['rush','balanced','defender','opportunist'].includes(x)))
    throw Error('Invalid --opponents (rush|balanced|defender|opportunist)');
  if(!Number.isSafeInteger(o.runs)||o.runs<2)throw Error('--runs needs >=2 pairs per cell');
  if(!o.bot)throw Error('--bot <userscript> is required');
  if(!o.run3Policy)throw Error('--run3Policy <schema-4 champion.json> is required');
  if(!o.candidateModel)throw Error('--candidateModel <schema-5 model.json> is required');
  if(!/^[a-f0-9]{40}$/.test(o.engineCommit))throw Error('Invalid --engineCommit SHA');
  o.bot=path.resolve(o.bot);o.run3Policy=path.resolve(o.run3Policy);
  o.candidateModel=path.resolve(o.candidateModel);
  if(o.out)o.out=path.resolve(o.out);
  return o;
}

// Pre-registered protocol: a scenario per (map x opponent x pair) for the
// single mode, with globally unique ids and a unique real engine seed per
// scenario. Role rotation = the opponent profile + seed vary per scenario.
function buildProtocol(o,arms){
  const scenarios=[];let n=0;
  for(const map of o.maps)for(const opponent of o.opponents)
  for(let pair=1;pair<=o.runs;pair++){
    n++;
    const tag=`${o.mode}-${map}-${opponent}-p${pair}`;
    scenarios.push({scenarioId:`holdout-${tag}`,
      matchSeed:`holdout-${tag}-${n}`.slice(0,64),
      mode:o.mode,map,opponent});
  }
  return{engineCommit:o.engineCommit,modes:[o.mode],maps:o.maps,
    opponents:o.opponents,scenarios,minPairsPerCell:o.runs,arms,
    roleRotation:'opponent profile + unique engine seed per scenario'};
}

// Resolve the three arms on the SAME bot code. The candidate arm's bot SHA
// reflects the model embedded exactly as engine-match embeds it.
function resolveArms(o){
  const baseBot=fs.readFileSync(o.bot,'utf8');
  const needle='const SHADOW_V5_BUNDLED_MODEL = null;';
  if(baseBot.split(needle).length!==2)
    throw Error('Bot source has no unique candidate-v5 shadow marker');
  const schema4=policyV4.validate(JSON.parse(fs.readFileSync(o.run3Policy,'utf8')));
  const v5=candidateV5.validate(JSON.parse(fs.readFileSync(o.candidateModel,'utf8')));
  if(schema4.schema!==4)throw Error('--run3Policy must be a schema-4 model');
  const candidateSource=baseBot.replace(
    needle,'const SHADOW_V5_BUNDLED_MODEL = '+JSON.stringify(v5)+';');
  const botSha=digest(baseBot);
  return{
    'rule-basis':{botSHA256:botSha,
      policySHA256:digest(JSON.stringify({schema:0,arm:'rule-basis'})),
      expectedPolicySHA256:null,
      engineArgs:['--profile','autonomous']},
    'run3-schema4':{botSHA256:botSha,
      policySHA256:digest(JSON.stringify(schema4)),
      expectedPolicySHA256:digest(JSON.stringify(schema4)),
      engineArgs:['--profile','autonomous','--policy',o.run3Policy]},
    'candidate':{botSHA256:digest(candidateSource),
      policySHA256:digest(JSON.stringify(v5)),
      expectedPolicySHA256:digest(JSON.stringify(v5)),
      engineArgs:['--profile','autonomous','--candidateControl','true',
        '--candidateModel',o.candidateModel,'--candidateGain',String(o.gain)]}
  };
}

function buildPlan(o,protocol){
  const plan=[];
  for(const scenario of protocol.scenarios)
  for(const arm of ARM_ORDER){
    const cfg=MODE_CONFIG[scenario.mode];
    plan.push({arm,scenarioId:scenario.scenarioId,
      seed:scenario.matchSeed,mode:scenario.mode,map:scenario.map,
      opponent:scenario.opponent,gameMode:cfg.gameMode,bots:cfg.bots,
      nations:cfg.nations,scriptedHumans:cfg.scriptedHumans});
  }
  return plan;
}

// Pure: build the holdout row from an engine-match report. Kept separate from
// the process spawn so the report->row mapping (provenance, outcome, land) can
// be regression-tested offline against the real engine report shape.
function rowFromReport(report,arm,armDef,scenario,cfg,o,exitCode,stderr){
  const meta=report?.benchmarkMeta||{};
  // The engine normalizes the CLI gameMode into its runtime label; match it.
  const resolvedMode=cfg.gameMode==='FFA'?'Free For All':'Team';
  const termination=report?.run?.termination??null;
  const outcome=report?.gameEnd?.outcome??'incomplete';
  const endLand=report?.finalState?.land??null;
  const endTick=report?.run?.tick??null;
  const confirmed=termination==='game-over'||termination==='eliminated';
  const verified=meta.botSHA256===armDef.botSHA256&&
    meta.policySHA256===armDef.expectedPolicySHA256&&
    meta.engineCommit===o.engineCommit&&
    meta.seed===scenario.matchSeed&&
    meta.opponentProfile===scenario.opponent&&
    meta.gameConfig?.gameMode===resolvedMode&&
    meta.gameConfig?.gameMap===scenario.map&&
    meta.harness==='engine-gameview-v2';
  const rec=report?.recording||{};
  return{arm,scenarioId:scenario.scenarioId,mode:scenario.mode,
    map:scenario.map,opponent:scenario.opponent,matchSeed:scenario.matchSeed,
    matchId:`${scenario.scenarioId}:${arm}`,engineCommit:o.engineCommit,
    botSHA256:armDef.botSHA256,policySHA256:armDef.policySHA256,
    exitCode,verified,confirmed,
    recording:{complete:rec.complete===true,dropped:rec.dropped??null,
      streamErrors:rec.streamErrors??null},
    outcome,termination,endLand,endTick,
    failure:report?.run?.failure??(exitCode===0?null:String(stderr).slice(-400))};
}

function runMatch(o,scenario,arm,armDef){
  const cfg=MODE_CONFIG[scenario.mode];
  const dir=path.join(o.out,scenario.scenarioId,arm);
  fs.mkdirSync(path.dirname(dir),{recursive:true});
  const args=[path.join(__dirname,'engine-match.mjs'),
    '--bot',o.bot,'--engine',o.engine,'--engineCommit',o.engineCommit,
    '--seed',scenario.matchSeed,'--gameMode',cfg.gameMode,'--map',scenario.map,
    '--size',o.size,'--difficulty',o.difficulty,'--bots',String(cfg.bots),
    '--nations',String(cfg.nations),'--scriptedHumans',String(cfg.scriptedHumans),
    '--opponentProfile',scenario.opponent,'--ticks',String(o.ticks),
    '--out',dir,...armDef.engineArgs];
  const r=spawnSync(process.execPath,args,{encoding:'utf8'});
  let report=null;
  try{report=JSON.parse(fs.readFileSync(path.join(dir,'match.json'),'utf8'));}
  catch(_){/* no report */}
  return rowFromReport(report,arm,armDef,scenario,cfg,o,r.status,r.stderr||'');
}

// Matched-pair 95% CI (t~1.96) on the per-scenario paired difference.
function pairedCi(pairs){
  const n=pairs.length;
  if(n===0)return{n:0,mean:0,se:0,ciLow:0,ciHigh:0};
  const mean=pairs.reduce((s,d)=>s+d,0)/n;
  const variance=n>1?pairs.reduce((s,d)=>s+(d-mean)**2,0)/(n-1):0;
  const se=Math.sqrt(variance/n);
  return{n,mean,se,ciLow:mean-1.96*se,ciHigh:mean+1.96*se};
}

function byScenario(rows){
  const m=new Map();
  for(const r of rows){
    if(!m.has(r.scenarioId))m.set(r.scenarioId,{});
    m.get(r.scenarioId)[r.arm]=r;
  }
  return m;
}

function computePaired(protocol,rows){
  const groups=byScenario(rows);
  const out={};
  for(const baseline of ['rule-basis','run3-schema4']){
    const winPairs=[],landPairs=[];
    for(const scenario of protocol.scenarios){
      const g=groups.get(scenario.scenarioId);
      if(!g?.candidate||!g[baseline])continue;
      winPairs.push(Number(g.candidate.outcome==='victory')-
        Number(g[baseline].outcome==='victory'));
      landPairs.push(g.candidate.endLand-g[baseline].endLand);
    }
    out[baseline]={win:pairedCi(winPairs),land:pairedCi(landPairs)};
  }
  return out;
}

function computeNegativeGates(rows,groups,protocol){
  const gates=[];
  const unconfirmed=rows.filter(r=>r.arm==='candidate'&&
    r.outcome==='victory'&&r.termination!=='game-over');
  gates.push({gate:'unconfirmed-win',
    triggered:unconfirmed.length>0,
    detail:`${unconfirmed.length} candidate win(s) without engine game-over`});
  const nonrepro=rows.filter(r=>!r.verified);
  gates.push({gate:'non-reproducible-engine-policy',
    triggered:nonrepro.length>0,
    detail:`${nonrepro.length} row(s) with provenance mismatch`});
  const missing=rows.filter(r=>r.exitCode!==0||r.endLand==null||
    r.endTick==null||r.termination==null);
  gates.push({gate:'missing-run-or-visible-state-data',
    triggered:missing.length>0,
    detail:`${missing.length} row(s) with missing run/result data`});
  const untenable=[];
  for(const scenario of protocol.scenarios){
    const g=groups.get(scenario.scenarioId);
    if(!g?.candidate)continue;
    const candWin=g.candidate.outcome==='victory';
    const bothBaseWin=['rule-basis','run3-schema4'].every(b=>
      g[b]?.outcome==='victory');
    if(!candWin&&bothBaseWin)
      untenable.push(`${scenario.scenarioId}: candidate lost while both baselines won`);
  }
  gates.push({gate:'untenable-regression-fixed-scenario',
    triggered:untenable.length>0,detail:untenable.join('; ')});
  return gates;
}

function writeOut(dir,report){
  fs.mkdirSync(dir,{recursive:true});
  common.writeJSON(path.join(dir,'holdout.json'),report);
  return path.join(dir,'holdout.json');
}

function main(){
  const o=parseArgs(process.argv.slice(2));
  const arms=resolveArms(o);
  const protocol=buildProtocol(o,arms);
  const plan=buildPlan(o,protocol);
  const base={kind:'paired-holdout',smoke:o.smoke||null,mode:o.mode,
    maps:o.maps,opponents:o.opponents,minPairsPerCell:o.runs,
    engineCommit:o.engineCommit,arms,protocol,plan};

  if(!o.execute){
    const out=o.out||path.join('benchmark-results','paired-holdout');
    const report={...base,status:'not-run',matches:plan.length,
      note:'Dry-run: pre-registered protocol and plan only; no match executed.',
      generated:writeOut(out,{...base,status:'not-run',matches:plan.length,
        note:'Dry-run: pre-registered protocol and plan only; no match executed.'})};
    console.log(JSON.stringify({status:'not-run',mode:report.mode,
      maps:report.maps,opponents:report.opponents,minPairsPerCell:report.minPairsPerCell,
      scenarios:report.protocol.scenarios.length,matches:report.matches,
      arms:ARM_ORDER.map(a=>arms[a].policySHA256.slice(0,12)),
      out:report.generated}));
    return;
  }

  if(!o.engine)throw Error('--engine is required with --execute');
  const engineCommit=common.engineInfo(o.engine,o.engineCommit);
  if(engineCommit!==o.engineCommit)throw Error('Engine commit mismatch');
  if(!o.out)throw Error('--out is required with --execute');
  if(fs.existsSync(o.out)&&fs.readdirSync(o.out).length>0)
    throw Error('Output directory is not empty: '+o.out);
  fs.mkdirSync(o.out,{recursive:true});

  const rows=[];
  for(const scenario of protocol.scenarios)
  for(const arm of ARM_ORDER)
    rows.push(runMatch(o,scenario,arm,arms[arm]));

  const gate=gateEvaluate({protocol,rows});
  const pairedRaw=computePaired(protocol,rows);
  const gateComp=gate.valid?gate.comparisons:{};
  const paired={};
  for(const baseline of ['rule-basis','run3-schema4']){
    const g=gateComp[baseline];
    const ci=pairedRaw[baseline];
    const passes=!!g?.passes;
    // Proven improvement: the gate's cell+win+land criteria pass AND the
    // paired win advantage is distinguishable from zero at the 95% CI.
    const distinguishable=passes&&ci.win.ciLow>0;
    paired[baseline]={n:ci.win.n,
      candidateWins:g?.candidateWins??null,
      baselineWins:g?.baselineWins??null,
      candidateMeanLand:g?.candidateMeanLand??null,
      baselineMeanLand:g?.baselineMeanLand??null,
      gatePasses:passes,win:ci.win,land:ci.land,distinguishable};
  }
  const groups=byScenario(rows);
  const negativeGates=computeNegativeGates(rows,groups,protocol);
  const gatesPass=negativeGates.every(g=>!g.triggered);
  const eligible=!!gate.eligible&&gatesPass&&
    Object.values(paired).every(p=>p.distinguishable);
  const report={...base,status:eligible?'eligible':'not-eligible',
    executed:true,matches:rows.length,
    rows,gate,paired,negativeGates,gatesPass,eligible,
    observationUnit:'match',
    reason:eligible?'paired-holdout-proven-improvement':
      gate.valid?(gate.eligible?'not-distinguishable-or-gate':'gate-failed')
        :gate.reason,
    note:'Eligibility is advisory (suitable for manual review); verify raw game artifacts and approve deployment separately. 0/0 or not-distinguishable results never promote.'};
  writeOut(o.out,report);
  console.log(JSON.stringify({status:report.status,eligible,
    matches:rows.length,gateEligible:gate.eligible,gatesPass,
    paired:Object.fromEntries(Object.entries(paired).map(([b,p])=>
      [b,{gatePasses:p.gatePasses,distinguishable:p.distinguishable,
        winCi:[+p.win.ciLow.toFixed(4),+p.win.ciHigh.toFixed(4)],
        candWins:p.candidateWins,baseWins:p.baselineWins}])),
    out:path.join(o.out,'holdout.json')}));
  process.exitCode=eligible?0:1;
}
if(require.main===module)main();
module.exports={MODES,ARM_ORDER,MODE_CONFIG,digest,parseArgs,buildProtocol,
  resolveArms,buildPlan,rowFromReport,runMatch,pairedCi,byScenario,
  computePaired,computeNegativeGates,writeOut};
