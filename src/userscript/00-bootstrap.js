// ==UserScript==
// @name         OpenFront Solo AggroBot
// @namespace    https://openfront.io/
// @version      1.21.5
// @description  OpenFront autopilot for Singleplayer, Public and Private games; economy, combat, nukes, defense and diplomacy.
// @match        https://openfront.io/*
// @match        https://*.openfront.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__ofSoloAggroBot1111) return;
  window.__ofSoloAggroBot1111 = true;

  const VERSION = '1.21.5', PREFIX = '[Solo AggroBot]', KEY = 'of-solo-aggrobot-v1111';
  const defaults = {enabled:false, autoStart:true, learningEnabled:true, fullAuto:true, aggressive:85, reserve:35, actionsPerMinute:72,
    economy:true, boats:true, autoSpawn:true, defense:true, stopOnError:false,
    upgrades:true, plan:'Adaptiv', safeMode:true, maxTargets:16, buildStyle:'Ausgewogen',
    autoStrategy:true, diplomacy:true, offerAlliances:true, nukes:true, antiNuke:true, lateOffense:true,
    impossibleMode:true,impossibleExperiment:false,neuralEnabled:false,evidenceMode:false,shadowRankEnabled:false,
    // P5: bounded candidate-v5 control. Off by default (shadow-only). When on,
    // the schema-5 ranker shifts the bounded candidate ranking so it can drive
    // the channel director; legality downstream remains authoritative.
    // candidateControlMode selects the score->utility mapping (campaign §5):
    // 'raw' (default, backward-compatible), 'calibrated', 'adaptive', 'rank',
    // 'gated'. capGain/confidenceRef/margin bound the variant-specific mapping.
    candidateControlEnabled:false,candidateControlGain:18,
    candidateControlMode:'raw',candidateControlCapGain:60,
    candidateControlConfidenceRef:0.5,candidateControlMargin:0.25,
    // P7: schema-7 branch controller (after hard safety, before send).
    // actionRankEnabled: score every legal, safety-approved, executable
    // branch with the bundled schema-7 model (shadow observation).
    // actionControlEnabled: the argmax branch drives the emitted intent.
    actionRankEnabled:false,actionControlEnabled:false,
    duoEnabled:false,duoPartnerID:'',duoPartnerName:'',duoRoom:'',archetype:'legacy'};
  let opts;
  try { opts = {...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; }
  catch (_) {opts = {...defaults};}
  try {if(!localStorage.getItem(KEY)){
    opts={...defaults,...JSON.parse(localStorage.getItem('of-solo-aggrobot-v1110')||localStorage.getItem('of-solo-aggrobot-v11010')||localStorage.getItem('of-solo-aggrobot-v1109')||localStorage.getItem('of-solo-aggrobot-v1108')||localStorage.getItem('of-solo-aggrobot-v1107')||localStorage.getItem('of-solo-aggrobot-v1106')||localStorage.getItem('of-solo-aggrobot-v1105')||localStorage.getItem('of-solo-aggrobot-v1104')||localStorage.getItem('of-solo-aggrobot-v1103')||localStorage.getItem('of-solo-aggrobot-v1102')||localStorage.getItem('of-solo-aggrobot-v1101')||localStorage.getItem('of-solo-aggrobot-v1100')||localStorage.getItem('of-solo-aggrobot-v199')||localStorage.getItem('of-solo-aggrobot-v198')||localStorage.getItem('of-solo-aggrobot-v197')||localStorage.getItem('of-solo-aggrobot-v196')||localStorage.getItem('of-solo-aggrobot-v195')||localStorage.getItem('of-solo-aggrobot-v194')||localStorage.getItem('of-solo-aggrobot-v193')||localStorage.getItem('of-solo-aggrobot-v192')||localStorage.getItem('of-solo-aggrobot-v191')||localStorage.getItem('of-solo-aggrobot-v190')||localStorage.getItem('of-solo-aggrobot-v181')||localStorage.getItem('of-solo-aggrobot-v18')||localStorage.getItem('of-solo-aggrobot-v17')||'{}')};
    // Only import user-adjustable preferences, never a previously enabled bot.
  }}catch(_){}
  // Drop retired localhost Brain/Qwen preferences without keeping the old token
  // in the active options key; browser-only learning and neural settings survive.
  const retiredBrainSettings=['brainEnabled','brainToken','qwenPolicy']
    .some(key=>Object.prototype.hasOwnProperty.call(opts,key));
  delete opts.brainEnabled;delete opts.brainToken;delete opts.qwenPolicy;
  opts.enabled = false;                         // Start only after a playable match and EventBus are discovered.
  // One-time v1.10 migration: full autonomy includes marine operation;
  // a later manual choice is saved under the new key as usual.
  if(!localStorage.getItem(KEY) && opts.fullAuto)opts.boats=true;
  if(opts.fullAuto)opts.autoStrategy=true;     // Full autonomy includes strategy selection.
  // User preferences are distinct from temporary archetype overrides.
  const ARCHETYPE_SETTING_KEYS=['boats','diplomacy','offerAlliances','nukes'];
  let archetypeBaseOptions=Object.fromEntries(
    ARCHETYPE_SETTING_KEYS.map(k=>[k,opts[k]]));
  let archetypeEffectiveOptions=null;
  function captureBaseOptions(){
    for(const k of ARCHETYPE_SETTING_KEYS){
      if(!archetypeEffectiveOptions||
         opts[k]!==archetypeEffectiveOptions[k])
        archetypeBaseOptions[k]=opts[k];
    }
  }
  const persist = () => {try {
    captureBaseOptions();
    localStorage.setItem(KEY,JSON.stringify({...opts,...archetypeBaseOptions}));
  } catch (_) {}};
  if(retiredBrainSettings)persist();
  /* __DECISION_KERNELS__ */

  // P1: versionierte, überprüfbare Gegner-Archetypen. Ein Archetyp ist eine
  // GEFRORENE Strategiepolitik, die die Kandidaten-Rangfolge des Planers – und
  // damit die tatsächlich gesendete Aktion – ändert. Die Unterscheidbarkeit
  // liegt in Timing, Zielauswahl und aktivierten Subsystemen, NICHT nur in
  // Slider-Werten. Die Version wird in jeder Liga festgehalten; ein unbekanntes
  // oder fehlendes Feld ist 'legacy' (der exakte Basiswert ohne Zusatzpolitik).
  const ARCHETYPE_VERSION='archetype-v1';
  const ARCHETYPES=Object.freeze({
    legacy:{version:ARCHETYPE_VERSION,kind:'baseline',
      note:'aktueller deterministischer Regel-Basiswert ohne Zusatzpolitik'},
    rush:{version:ARCHETYPE_VERSION,kind:'offensive-early',
      note:'frühe Angriffe und frühe Front; geringe Wartezeit'},
    turtle:{version:ARCHETYPE_VERSION,kind:'defensive-late',
      note:'hohe Reserve, späte Angriffe, defensive Festigung'},
    economy:{version:ARCHETYPE_VERSION,kind:'economic-growth',
      note:'Einkommensbau und Goldsparen vor Angriffen'},
    naval:{version:ARCHETYPE_VERSION,kind:'naval-operations',
      note:'Marine-/Flotten-Operationen priorisieren'},
    opportunist:{version:ARCHETYPE_VERSION,kind:'weakest-target',
      note:'schwächsten Feind bevorzugen'},
    diplomat:{version:ARCHETYPE_VERSION,kind:'alliance-builder',
      note:'proaktive Bündnisangebote'},
    nuke:{version:ARCHETYPE_VERSION,kind:'nuclear-strike',
      note:'Nuke-Kapazitäten priorisieren'},
    duo:{version:ARCHETYPE_VERSION,kind:'coordinated-team',
      note:'bestätigte Duo-/Team-Koordination über Relay'},
    champion:{version:ARCHETYPE_VERSION,kind:'frozen-champion',
      note:'eingefrorener Run3 Schema-4-Champion (Policy)'}
  });
  // Reine Abfrage der gefrorenen Politik für das aktuelle opts.archetype.
  function archetypePolicy(){
    const id=ARCHETYPES[opts.archetype]?opts.archetype:'legacy';
    const base={id,version:ARCHETYPES[id].version,kind:ARCHETYPES[id].kind,
      firstAttackGate:0,attackUtility:0,holdUtility:0,investUtility:0,
      navalUtility:0,targetWeakest:false,
      boats:null,diplomacy:null,offerAlliances:null,nukes:null};
    if(id==='rush')return {...base,firstAttackGate:1,attackUtility:24,
      investUtility:-20,boats:false,offerAlliances:false};
    if(id==='turtle')return {...base,firstAttackGate:640,attackUtility:-28,
      holdUtility:16,investUtility:8,boats:false};
    if(id==='economy')return {...base,firstAttackGate:420,attackUtility:-22,
      investUtility:28,holdUtility:8,nukes:false};
    if(id==='naval')return {...base,firstAttackGate:180,navalUtility:36,
      investUtility:8,attackUtility:-6,boats:true};
    if(id==='opportunist')return {...base,firstAttackGate:120,targetWeakest:true,
      attackUtility:10};
    if(id==='diplomat')return {...base,firstAttackGate:300,attackUtility:-12,
      holdUtility:8,diplomacy:true,offerAlliances:true};
    if(id==='nuke')return {...base,firstAttackGate:240,attackUtility:4,nukes:true};
    return base;
  }
  // Überprüfbares Verhaltensprofil: wird pro Planungstick befüllt und in der
  // Diagnose exponiert. Beweist, dass Archetypen tatsächlich verschiedene
  // Strategien fahren (Timing, Zielauswahl, Subsysteme), nicht nur Namen.
  const archetypeStats={version:ARCHETYPE_VERSION,id:null,
    firstAttackTick:null,plannedTicks:0,
    selectedByKind:{attack:0,hold:0,invest:0,naval:0,expand:0,support:0},
    attackTargetTotal:0,attackWeakestTarget:0};
  function archetypeRecord(selected,groups,me,tick){
    archetypeStats.plannedTicks++;
    archetypeStats.id=archetypePolicy().id;
    const kind=selected?.kind;
    if(kind&&archetypeStats.selectedByKind[kind]!==undefined)
      archetypeStats.selectedByKind[kind]++;
    if(kind==='attack'){
      archetypeStats.attackTargetTotal++;
      if(archetypeStats.firstAttackTick===null)archetypeStats.firstAttackTick=tick;
      const hostiles=(groups||[]).filter(g=>g.id!==null&&!friendly(g.opponent,me));
      const weakest=hostiles.slice().sort((a,b)=>
        number(()=>a.opponent?.troops?.(),0)-number(()=>b.opponent?.troops?.(),0))[0];
      if(weakest&&selected.target===weakest.id)archetypeStats.attackWeakestTarget++;
    }
  }
  function archetypeSignature(){
    const s=archetypeStats;
    return {version:s.version,archetype:s.id,firstAttackTick:s.firstAttackTick,
      plannedTicks:s.plannedTicks,selectedByKind:{...s.selectedByKind},
      attackTargetTotal:s.attackTargetTotal,
      weakestTargetFraction:s.attackTargetTotal>0?
        s.attackWeakestTarget/s.attackTargetTotal:null,
      semantics:'observed-planner-choice; sent-is-not-confirmed-effect'};
  }
  // Erzwinge die vom Archetypen geforderten Subsysteme (Marine, Diplomatie,
  // Nukes), damit die gefrorene Strategie auch tatsächlich ausgeführt wird.
  // 'legacy' erzwingt nichts (alle Felder null) und bleibt der Basiswert.
  function applyArchetypeOptions(){
    // Capture deliberate preference edits, not the previous archetype's
    // effective overrides. Restore the base BEFORE applying any new policy.
    captureBaseOptions();
    for(const k of ARCHETYPE_SETTING_KEYS)opts[k]=archetypeBaseOptions[k];
    const p=archetypePolicy();
    for(const k of ARCHETYPE_SETTING_KEYS)
      if(p[k]!==null)opts[k]=p[k];
    archetypeEffectiveOptions=Object.fromEntries(
      ARCHETYPE_SETTING_KEYS.map(k=>[k,opts[k]]));
    // Never persist effective archetype overrides as user preferences.
  }

  // Deployment replaces only the literal below; benchmark loads a signed-by-hash
  // local model from its isolated loopback storage. No browser network fetches.
  const NEURAL_BUNDLED_MODEL = null;
  const SHADOW_V5_BUNDLED_MODEL = null;
  // GENERATED-SHADOW-V5-BEGIN: keep equal to trainer/candidate-policy-v5.cjs
  const shadowV5=(()=>{
const INPUTS=32,HIDDEN=20,OUTPUTS=2;
const LENGTH=INPUTS*HIDDEN+HIDDEN+HIDDEN*OUTPUTS+OUTPUTS;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const logrel=(n,base)=>clamp(Math.log1p(Math.max(0,Number(n)||0))/
  Math.log1p(Math.max(1,Number(base)||1)),0,2)/2;
function features(state={},candidate={}){
  const home=Math.max(1,Number(state.home)||1),gold=Math.max(1,Number(state.gold)||1);
  const values=[
    logrel(state.home,state.maxTroops),logrel(state.gold,10000000),
    clamp((state.incoming||0)/home,0,2)/2,clamp((state.committed||0)/home,0,2)/2,
    clamp((state.reserve||0)/home,0,1),clamp(state.economyRelative,0,2)/2,
    clamp(state.capacityUse,0,1),clamp(state.frontReach,0,1),
    clamp(state.partnerNeed,0,1),clamp(state.enemyBound,0,1),
    clamp(state.landTrend,-1,1)/2+.5,clamp(state.goldTrend,-1,1)/2+.5,
    clamp(state.troopTrend,-1,1)/2+.5,clamp(state.frontCount/8,0,1),
    clamp(state.portAccess,0,1),clamp(state.technologyCoverage,0,1),
    clamp(candidate.expectedLand/Math.max(1,state.land||1),0,1),
    clamp(candidate.costTroops/home,0,1),clamp(candidate.costGold/gold,0,1),
    clamp(candidate.duration/1200,0,1),clamp(candidate.returnTime/1200,0,1),
    clamp(candidate.counterRisk,0,1),clamp(candidate.thirdPartyRisk,0,1),
    clamp(candidate.infrastructureValue,0,1),clamp(candidate.incomeValue,0,1),
    clamp(candidate.recruitmentValue,0,1),clamp(candidate.siteRisk,0,1),
    clamp(candidate.holdProbability,0,1),clamp(candidate.legalConfidence,0,1),
    candidate.kind==='attack'?1:0,candidate.kind==='investment'?1:0,
    candidate.kind==='naval'?1:0
  ];
  return values.map(v=>clamp(v));
}
function validate(model){
  if(!model||model.schema!==5||model.arch!=='32x20x2-tanh'||
    !Array.isArray(model.outputs)||model.outputs.length!==OUTPUTS||
    model.outputs[0]!=='heldGain'||model.outputs[1]!=='lossRisk'||
    !Array.isArray(model.weights)||model.weights.length!==LENGTH||
    Array.from(model.weights).some(x=>!Number.isFinite(x)||Math.abs(x)>5))
    throw Error('Invalid schema-5 candidate model');
  return model;
}
function zero(){return {schema:5,arch:'32x20x2-tanh',
  outputs:['heldGain','lossRisk'],weights:Array(LENGTH).fill(0)};}
function predict(model,input){
  const w=validate(model).weights;
  if(!Array.isArray(input)||input.length!==INPUTS||input.some(x=>!Number.isFinite(x)||x<0||x>1))
    throw Error('Invalid candidate feature vector');
  const h=[],hiddenBias=INPUTS*HIDDEN,outStart=hiddenBias+HIDDEN,
    outBias=outStart+HIDDEN*OUTPUTS;
  for(let j=0;j<HIDDEN;j++){let z=w[hiddenBias+j];for(let i=0;i<INPUTS;i++)z+=input[i]*w[i*HIDDEN+j];h.push(Math.tanh(z));}
  const out=[];for(let k=0;k<OUTPUTS;k++){let z=w[outBias+k];for(let j=0;j<HIDDEN;j++)z+=h[j]*w[outStart+j*OUTPUTS+k];out.push((Math.tanh(z)+1)/2);}
  return {heldGain:out[0],lossRisk:out[1]};
}
    return {features,validate,predict};
  })();
  // GENERATED-SHADOW-V5-END
  let shadowV5Model=null;
  try{shadowV5Model=shadowV5.validate(SHADOW_V5_BUNDLED_MODEL);}catch(_){shadowV5Model=null;}
  const SHADOW_V6_BUNDLED_MODEL = null;
  // GENERATED-SHADOW-V6-BEGIN: keep equal to trainer/candidate-policy-v6.cjs
  const shadowV6=(()=>{
const INPUTS=38,OUTPUTS=2;
const KINDS=['hold','invest','attack','expand','naval','support'];
const HIDDEN_BY_ARCH={'38x24x2-tanh':24,'38x40x2-tanh':40};
const ARCHES=Object.keys(HIDDEN_BY_ARCH);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const logrel=(n,base)=>clamp(Math.log1p(Math.max(0,Number(n)||0))/
  Math.log1p(Math.max(1,Number(base)||1)),0,2)/2;
// Bounded rule-utility normalization. Rule utilities are order-of-magnitude
// bounded in [~-1000 (gated early attack), ~+150 (strong candidate)]; the
// absolute feature is an offset/scale map, the gaps are signed-bounded so a
// candidate far below the rule leader saturates at 1 without the -1000 gated
// early-attack floor collapsing the whole frame.
const RU_ABS_OFFSET=100,RU_ABS_SCALE=200,RU_GAP_SCALE=100;
function lengthFor(arch){const h=HIDDEN_BY_ARCH[arch];
  if(h===undefined)throw Error('Invalid schema-6 arch '+arch);
  return INPUTS*h+h+h*OUTPUTS+OUTPUTS;}
// 38-dim candidate feature vector.
//   idx 0-28  state + candidate contract (identical to schema-5, verified)
//   idx 29-34 kind one-hot: hold, invest, attack, expand, naval, support
//   idx 35    candidateRuleUtility (own rule utility, bounded)
//   idx 36    utilityGapToRuleTop1 (top-1 utility - own, bounded)
//   idx 37    utilityGapToRuleTop2 (top-2 utility - own, bounded)
// ctx is the per-frame rule-utility context: {ownRu, ruTop1, ruTop2}.
function features(state={},candidate={},ctx={}){
  const home=Math.max(1,Number(state.home)||1),gold=Math.max(1,Number(state.gold)||1);
  const kind=String(candidate.kind||'');
  const ownRu=Number(ctx.ownRu),top1=Number(ctx.ruTop1),top2=Number(ctx.ruTop2);
  const values=[
    logrel(state.home,state.maxTroops),logrel(state.gold,10000000),
    clamp((state.incoming||0)/home,0,2)/2,clamp((state.committed||0)/home,0,2)/2,
    clamp((state.reserve||0)/home,0,1),clamp(state.economyRelative,0,2)/2,
    clamp(state.capacityUse,0,1),clamp(state.frontReach,0,1),
    clamp(state.partnerNeed,0,1),clamp(state.enemyBound,0,1),
    clamp(state.landTrend,-1,1)/2+.5,clamp(state.goldTrend,-1,1)/2+.5,
    clamp(state.troopTrend,-1,1)/2+.5,clamp(state.frontCount/8,0,1),
    clamp(state.portAccess,0,1),clamp(state.technologyCoverage,0,1),
    clamp(candidate.expectedLand/Math.max(1,state.land||1),0,1),
    clamp(candidate.costTroops/home,0,1),clamp(candidate.costGold/gold,0,1),
    clamp(candidate.duration/1200,0,1),clamp(candidate.returnTime/1200,0,1),
    clamp(candidate.counterRisk,0,1),clamp(candidate.thirdPartyRisk,0,1),
    clamp(candidate.infrastructureValue,0,1),clamp(candidate.incomeValue,0,1),
    clamp(candidate.recruitmentValue,0,1),clamp(candidate.siteRisk,0,1),
    clamp(candidate.holdProbability,0,1),clamp(candidate.legalConfidence,0,1),
    // idx 29-34: explicit one-hot for every action kind (no all-zero fallback).
    ...(KINDS.map(k=>k===kind?1:0)),
    // idx 35: candidateRuleUtility.
    Number.isFinite(ownRu)?clamp((ownRu+RU_ABS_OFFSET)/RU_ABS_SCALE,0,1):0,
    // idx 36: utilityGapToRuleTop1 (0 for the rule leader, grows below it).
    (Number.isFinite(ownRu)&&Number.isFinite(top1))
      ?clamp((top1-ownRu)/RU_GAP_SCALE,0,1):0.5,
    // idx 37: utilityGapToRuleTop2.
    (Number.isFinite(ownRu)&&Number.isFinite(top2))
      ?clamp((top2-ownRu)/RU_GAP_SCALE,0,1):0.5
  ];
  return values.map(v=>clamp(v));
}
function validate(model){
  if(!model||model.schema!==6)throw Error('Invalid schema-6 candidate model');
  const h=HIDDEN_BY_ARCH[model.arch];
  if(h===undefined)throw Error('Invalid schema-6 candidate model');
  const L=lengthFor(model.arch);
  if(!Array.isArray(model.outputs)||model.outputs.length!==OUTPUTS||
    model.outputs[0]!=='heldGain'||model.outputs[1]!=='lossRisk'||
    !Array.isArray(model.weights)||model.weights.length!==L||
    Array.from(model.weights).some(x=>!Number.isFinite(x)||Math.abs(x)>5))
    throw Error('Invalid schema-6 candidate model');
  return model;
}
function zero(arch){arch=arch||ARCHES[0];
  if(!HIDDEN_BY_ARCH[arch])throw Error('Invalid arch '+arch);
  return {schema:6,arch,outputs:['heldGain','lossRisk'],
    weights:Array(lengthFor(arch)).fill(0)};}
function predict(model,input){
  const m=validate(model);const h=HIDDEN_BY_ARCH[m.arch];
  if(!Array.isArray(input)||input.length!==INPUTS||
    input.some(x=>!Number.isFinite(x)||x<0||x>1))
    throw Error('Invalid candidate feature vector');
  const w=m.weights;const hb=INPUTS*h,outStart=hb+h,outBias=outStart+h*OUTPUTS;
  const hid=[];
  for(let j=0;j<h;j++){let z=w[hb+j];
    for(let i=0;i<INPUTS;i++)z+=input[i]*w[i*h+j];hid.push(Math.tanh(z));}
  const out=[];
  for(let k=0;k<OUTPUTS;k++){let z=w[outBias+k];
    for(let j=0;j<h;j++)z+=hid[j]*w[outStart+j*OUTPUTS+k];
    out.push((Math.tanh(z)+1)/2);}
  return {heldGain:out[0],lossRisk:out[1]};
}
    return {features,validate,predict};
  })();
  // GENERATED-SHADOW-V6-END
  let shadowV6Model=null;
  try{shadowV6Model=shadowV6.validate(SHADOW_V6_BUNDLED_MODEL);}catch(_){shadowV6Model=null;}
  const SHADOW_V7_BUNDLED_MODEL = null;
  // GENERATED-SHADOW-V7-BEGIN: keep equal to trainer/action-policy-v7.cjs
  const shadowV7=(()=>{
const INPUTS=38,OUTPUTS=1;
// The 9 emission-relevant branch families (kind one-hot). Finer distinctions
// (front vs finisher vs neutral target, which build type, which send kind)
// are carried by the subtype/flag features and targetId, not by exploding the
// one-hot, so the ranker generalizes across the 16 contract subclasses.
const KINDS=['wait','expand','attack','boat','warship','build_warship',
  'nuclear','build_economy','donate'];
const HIDDEN_BY_ARCH={'38x24x2-tanh':24,'38x40x2-tanh':40};
const ARCHES=Object.keys(HIDDEN_BY_ARCH);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const logrel=(n,base)=>clamp(Math.log1p(Math.max(0,Number(n)||0))/
  Math.log1p(Math.max(1,Number(base)||1)),0,2)/2;
// Bounded rule-utility normalization (same convention as schema-6): rule
// utilities are order-of-magnitude bounded in [~-1000 (gated early attack),
// ~+150 (strong candidate)]; the absolute feature is an offset/scale map, the
// gap is signed-bounded so a branch far below the rule leader saturates at 1
// without a gated early-attack floor collapsing the whole frame.
const RU_ABS_OFFSET=100,RU_ABS_SCALE=200,RU_GAP_SCALE=100;
function lengthFor(arch){const h=HIDDEN_BY_ARCH[arch];
  if(h===undefined)throw Error('Invalid schema-7 arch '+arch);
  return INPUTS*h+h+h*OUTPUTS+OUTPUTS;}
// 38-dim action-branch feature vector.
//   idx 0-13  state: gamePhase, landRatio, troopRatio, reserveRatio,
//                  goldRatio, income, enemyPressure, activeWars, frontCount,
//                  allyPressure, homeThreat, nukeThreat, recentLandTrend,
//                  recentTroopTrend
//   idx 14    ruleUtility (own, bounded)
//   idx 15    utilityGapToTop (rule top-1 - own, bounded; 0.5 if unknown)
//   idx 16    costRatio
//   idx 17    troopCommitmentRatio
//   idx 18    reserveAfterRatio
//   idx 19    targetStrengthRatio
//   idx 20    targetLandRatio
//   idx 21    expectedBuildValue
//   idx 22    expectedDefenseValue
//   idx 23    cooldownReady
//   idx 24    alreadyActiveOperation
//   idx 25    targetReachable
//   idx 26    isEmergency
//   idx 27    isFinisher
//   idx 28    isExpansion
//   idx 29-37 kind one-hot: wait, expand, attack, boat, warship, build_warship,
//                  nuclear, build_economy, donate
// state/branch are the runtime-reliable fields documented in v7-features.cjs;
// ctx is the per-frame rule-utility context {ownRu, ruleTop1}.
function features(state={},branch={},ctx={}){
  const home=Math.max(1,Number(state.home)||1);
  const land=Number(state.land)||0;
  const troops=Number(state.troops)||Number(state.home)||0;
  const kind=String(branch.kind||'');
  const ownRu=Number(ctx.ownRu!==undefined?ctx.ownRu:branch.ruleUtility);
  const top1=Number(ctx.ruleTop1);
  const values=[
    // state idx 0-13
    clamp((state.gamePhase||0)/20,0,1),
    land?clamp(land/Math.max(1,Number(state.maxLand)||land),0,1):0,
    clamp(troops/home,0,1),
    clamp((state.reserve||0)/home,0,1),
    logrel(state.gold,10000000),
    clamp(state.income,0,2)/2,
    clamp(state.enemyPressure,0,1),
    clamp((state.activeWars||0)/8,0,1),
    clamp((state.frontCount||0)/8,0,1),
    clamp(state.allyPressure,0,1),
    clamp(state.homeThreat,0,1),
    clamp(state.nukeThreat,0,1),
    clamp(state.recentLandTrend,-1,1)/2+.5,
    clamp(state.recentTroopTrend,-1,1)/2+.5,
    // branch idx 14-22
    Number.isFinite(ownRu)?clamp((ownRu+RU_ABS_OFFSET)/RU_ABS_SCALE,0,1):0,
    (Number.isFinite(ownRu)&&Number.isFinite(top1))
      ?clamp((top1-ownRu)/RU_GAP_SCALE,0,1):0.5,
    clamp((branch.cost||0)/Math.max(1,home),0,1),
    clamp((branch.troopCommitment||0)/home,0,1),
    clamp((branch.reserveAfter||0)/home,0,1),
    clamp(branch.targetStrength,0,1),
    clamp(branch.targetLand,0,1),
    clamp(branch.expectedBuildValue,0,1),
    clamp(branch.expectedDefenseValue,0,1),
    // branch idx 23-28
    branch.cooldownReady?1:0,
    branch.alreadyActiveOperation?1:0,
    branch.targetReachable?1:0,
    branch.isEmergency?1:0,
    branch.isFinisher?1:0,
    branch.isExpansion?1:0,
    // kind one-hot idx 29-37
    ...(KINDS.map(k=>k===kind?1:0))
  ];
  return values.map(v=>clamp(v));
}
function validate(model){
  if(!model||model.schema!==7)throw Error('Invalid schema-7 action model');
  const h=HIDDEN_BY_ARCH[model.arch];
  if(h===undefined)throw Error('Invalid schema-7 action model');
  const L=lengthFor(model.arch);
  if(!Array.isArray(model.outputs)||model.outputs.length!==OUTPUTS||
    model.outputs[0]!=='branchScore'||
    !Array.isArray(model.weights)||model.weights.length!==L||
    Array.from(model.weights).some(x=>!Number.isFinite(x)||Math.abs(x)>5))
    throw Error('Invalid schema-7 action model');
  return model;
}
function zero(arch){arch=arch||ARCHES[0];
  if(!HIDDEN_BY_ARCH[arch])throw Error('Invalid arch '+arch);
  return {schema:7,arch,outputs:['branchScore'],
    weights:Array(lengthFor(arch)).fill(0)};}
function predict(model,input){
  const m=validate(model);const h=HIDDEN_BY_ARCH[m.arch];
  if(!Array.isArray(input)||input.length!==INPUTS||
    input.some(x=>!Number.isFinite(x)||x<0||x>1))
    throw Error('Invalid action-branch feature vector');
  const w=m.weights;const hb=INPUTS*h,outStart=hb+h,outBias=outStart+h*OUTPUTS;
  const hid=[];
  for(let j=0;j<h;j++){let z=w[hb+j];
    for(let i=0;i<INPUTS;i++)z+=input[i]*w[i*h+j];hid.push(Math.tanh(z));}
  const out=[];
  for(let k=0;k<OUTPUTS;k++){let z=w[outBias+k];
    for(let j=0;j<h;j++)z+=hid[j]*w[outStart+j*OUTPUTS+k];
    out.push((Math.tanh(z)+1)/2);}
  return {branchScore:out[0]};
}
    return {features,validate,predict};
  })();
  // GENERATED-SHADOW-V7-END
  let shadowV7Model=null;
  try{shadowV7Model=shadowV7.validate(SHADOW_V7_BUNDLED_MODEL);}catch(_){shadowV7Model=null;}
  // §28 branch funnel: one record per combat decision, accumulated in
  // 40-economy-runner.js (the dispatch loop after strategicDirector). The
  // counts feed the pre-gate (§26) and the dev/holdout comparison (§35/38).
  // With no bundled model (shadowV7Model===null) the funnel stays at
  // noModelFrames and the emitted action is identical to the rule basis.
  const branchFunnel={planningFrames:0,actionableFrames:0,
    multiChoiceFrames:0,modelDifferentFrames:0,differentEmittedActions:0,
    engineConfirmedDifferences:0,positiveOutcomeDifferences:0,
    negativeOutcomeDifferences:0,rankErrors:0,noModelFrames:0,
    controlEmits:0,ruleEmits:0,waitEmits:0,lastDecision:null};
  // Record one branch decision. `decision` is the object built by
  // 40-economy-runner.chooseActionBranch; `emittedChannel` is the channel that
  // actually sent an intent this turn (null when the model waited / no
  // channel emitted). Keeping the aggregation here (not in the runner) keeps
  // the funnel a single source of truth exposed by the snapshot + bridge.
  // differentEmittedActions / engineConfirmedDifferences only count a
  // model-caused emission: the channel the model steered to is the one that
  // emitted. The exact intent-level diff is reconciled offline (§27
  // turn-divergence.json from intents.jsonl); this is the live proxy.
  function recordBranchDecision(decision,emittedChannel){
    const f=branchFunnel;
    if(decision.basis==='no-model'){f.noModelFrames++;f.ruleEmits++;return;}
    f.planningFrames++;
    if(decision.actionableCount>=1)f.actionableFrames++;
    if(decision.actionableCount>=2)f.multiChoiceFrames++;
    const differs=!!(decision.modelTop&&decision.ruleTop&&
      decision.modelTop.id!==decision.ruleTop.id);
    if(differs)f.modelDifferentFrames++;
    const modelEmitted=emittedChannel!==null&&
      decision.modelTop&&emittedChannel===decision.modelTop.channel;
    if(decision.controlActive&&differs){
      if(decision.modelTop.kind==='wait')f.waitEmits++;
      else f.controlEmits++;
      if(modelEmitted){
        f.differentEmittedActions++;
        f.engineConfirmedDifferences++;
      }
    }
    f.lastDecision={tick:decision.tick,ruleTop:decision.ruleTop?.id??null,
      modelTop:decision.modelTop?.id??null,
      modelTopChannel:decision.modelTop?.channel??null,
      modelScores:decision.scores??null,
      controlActive:!!decision.controlActive,
      emittedKind:emittedChannel??null,
      actionableCount:decision.actionableCount,
      state:decision.state?{...decision.state}:null,
      ruleTop1:decision.state?
        (decision.branches?.[0]?.ruleUtility??0):null,
      branches:decision.branches?
        decision.branches.map(b=>({id:b.id,kind:b.kind,channel:b.channel,
          ruleUtility:b.ruleUtility,cost:b.cost,troopCommitment:b.troopCommitment,
          reserveAfter:b.reserveAfter,targetStrength:b.targetStrength,
          targetLand:b.targetLand,expectedBuildValue:b.expectedBuildValue,
          expectedDefenseValue:b.expectedDefenseValue,
          cooldownReady:b.cooldownReady,
          alreadyActiveOperation:b.alreadyActiveOperation,
          targetReachable:b.targetReachable,isEmergency:b.isEmergency,
          isFinisher:b.isFinisher,isExpansion:b.isExpansion})):null};
  }
  const NEURAL_LENGTH=90,NEURAL_STORAGE='of-aggrobot-neural-policy-v1';
  let neuralModel=null;
  function neuralValidate(data){
    const old=data?.schema===1&&data.arch==='8x8x2-tanh'&&
      data.weights?.length===NEURAL_LENGTH;
    const actions=data?.schema===2&&data.arch==='16x12x1-tanh'&&
      data.weights?.length===217;
    const strategic=data?.schema===3&&data.arch==='16x16x16-tanh'&&
      data.weights?.length===544;
    const strategic4=data?.schema===4&&data.arch==='24x24x16-tanh'&&
      data.weights?.length===1000;
    if((!old&&!actions&&!strategic&&!strategic4)||!Array.isArray(data.weights)||
      data.weights.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>5))
      return null;
    return data;
  }
  try{
    const local=['localhost','127.0.0.1','[::1]'].includes(window.location?.hostname)&&
      window.__OF_BENCHMARK_CONFIG__?.enabled===true;
    neuralModel=neuralValidate(local?
      JSON.parse(localStorage.getItem(NEURAL_STORAGE)||'null'):
      NEURAL_BUNDLED_MODEL);
  }catch(_){neuralModel=null;}
  // Deployed v3 is active on a fresh install; an explicit saved off-switch wins.
  if([3,4].includes(neuralModel?.schema) && !localStorage.getItem(KEY))opts.neuralEnabled=true;
  const NEURAL_CHANNELS=['reserve','aggression','neutralCommit','enemyCommit',
    'warThreshold','navalThreshold','landPriority','navalPriority',
    'holdPriority','cityPriority','factoryPriority','portPriority',
    'defensePriority','nuclearPriority','diplomacyPriority','fleetPriority'];
  let neuralPolicyCache={key:null,output:null};
  function neuralStrategicSignals(me,s,tick=number(()=>game?.ticks?.(),0)){
    if(!opts.neuralEnabled||!opts.fullAuto||![3,4].includes(neuralModel?.schema)||
      !me||!s||s.home<=0)return null;
    const home=Math.max(1,s.home),max=Math.max(1,s.max||home);
    const gold=goldAmount(me),
      land=number(()=>me.numTilesOwned?.(),0);
    const units=ownStructures(me),groups=strategic.groups||[];
    const cities=units.filter(u=>u.type?.()==='City').length,
      ports=units.filter(u=>u.type?.()==='Port').length;
    const foes=groups.filter(g=>g.id!==null&&g.opponent?.isAlive?.()&&!friendly(g.opponent,me));
    const thirdParty=foes.some(g=>adversaryWindow(me,g.opponent).exposed);
    const vector=[
      clamp(home/max,0,1.5)/1.5,clamp((s.incoming||0)/home,0,2)/2,
      clamp((s.strongest||0)/home,0,3)/3,clamp((s.committed||0)/home,0,2)/2,
      clamp(gold/1000000,0,1),clamp(land/20000,0,1),
      lateGame(me)?1:0,groups.some(g=>g.id===null&&!g.fallout)?1:0,
      clamp(foes.length/8,0,1),clamp((s.activeEnemy||0)/4,0,1),
      clamp((s.available||0)/home,0,1),
      clamp((s.growthPotential||0)/Math.max(1,max*.01),0,1),
      clamp(cities/8,0,1),clamp(ports/4,0,1),isWar()?1:0,thirdParty?1:0
    ];
    if(neuralModel.schema===4){
      const pressure=frontPressureForecast(me,groups,tick);
      const losses=Math.max(0,-(armyTrend(tick)?.tiles||0));
      const uncovered=nuclearIntel(me,units).uncovered.length;
      vector.push(clamp(pressure.secondary/home,0,3)/3,
        clamp(losses/Math.max(1,land),0,1),
        clamp((incomeStatus.train||0)/1000000,0,1),
        clamp((incomeStatus.trade||0)/1000000,0,1),
        clamp(uncovered/8,0,1),recentHostilePressure(tick)?1:0,
        clamp(units.filter(u=>u.type?.()==='Defense Post').length/12,0,1),
        clamp((marineStats.transportUnconfirmed+marineStats.transportUnresolved)/12,0,1));
    }
    const key=tick+':'+vector.join(',');
    if(neuralPolicyCache.key===key)return neuralPolicyCache.output;
    const w=neuralModel.weights,h=[],output={};
    const size=neuralModel.schema===4?24:16;
    const start=size*size,outputs=start+size,bias=outputs+size*16;
    for(let j=0;j<size;j++){
      let z=w[start+j];
      for(let i=0;i<size;i++)z+=vector[i]*w[i*size+j];
      h.push(Math.tanh(z));
    }
    for(let k=0;k<16;k++){
      let z=w[bias+k];
      for(let j=0;j<size;j++)z+=h[j]*w[outputs+j*16+k];
      output[NEURAL_CHANNELS[k]]=Math.tanh(z);
    }
    neuralPolicyCache={key,output};
    neuralEvidence.calls++;
    if(Object.values(output).some(v=>Math.abs(v)>1e-8))neuralEvidence.nonzero++;
    neuralEvidence.last={tick,schema:neuralModel.schema,
      channels:Object.fromEntries(Object.entries(output).map(([k,v])=>[k,Number(v.toFixed(5))]))};
    if(neuralEvidence.calls%20===1)telemetry('neural_inference',
      'Neurale Strategie-Ausgabe beobachtet',{model:neuralModelInfo(),
        inference:neuralEvidence.last});
    return output;
  }
  function neuralModelInfo(){
    const model=neuralModel;
    if(!model)return {loaded:false,enabled:!!opts.neuralEnabled,reason:'no-valid-model'};
    // This fingerprint is for tracking the deployed weights across diagnostic
    // exports, not a cryptographic or trainer policy SHA256.
    const raw=JSON.stringify(model.weights),bytes=raw.length;
    let hash=2166136261;
    for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return {loaded:true,enabled:!!opts.neuralEnabled,schema:model.schema,
      weights:model.weights.length,nonzeroWeights:model.weights.filter(v=>v!==0).length,
      fingerprint:'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0')+'-'+bytes};
  }
  function shadowModelInfo(){
    const model=shadowV6Model||shadowV5Model;
    if(!model)return {loaded:false,enabled:!!opts.shadowRankEnabled,
      reason:'no-valid-candidate'};
    // FNV-1a tracking fingerprint (not a trainer policy SHA256), mirroring
    // neuralModelInfo for the schema-5 shadow candidate.
    const raw=JSON.stringify(model.weights),bytes=raw.length;
    let hash=2166136261;
    for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return {loaded:true,enabled:!!opts.shadowRankEnabled,schema:model.schema,
      weights:model.weights.length,
      controlEnabled:opts.candidateControlEnabled===true,
      controlGain:opts.candidateControlGain,
      fingerprint:'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0')+'-'+bytes};
  }
  // Schema-7 branch controller: it sits AFTER hard legality/safety, BEFORE
  // send(kind,args). Off by default (no model bundled). When a v7 model is
  // bundled and actionRankEnabled is set it scores every currently-legal,
  // safety-approved, executable branch; when actionControlEnabled the argmax
  // drives the emitted intent (hard safety stays outside the learning).
  function shadowV7ModelInfo(){
    const model=shadowV7Model;
    if(!model)return {loaded:false,enabled:!!opts.actionRankEnabled,
      reason:'no-valid-action-model'};
    const raw=JSON.stringify(model.weights),bytes=raw.length;
    let hash=2166136261;
    for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return {loaded:true,enabled:!!opts.actionRankEnabled,schema:model.schema,
      arch:model.arch,weights:model.weights.length,
      controlEnabled:opts.actionControlEnabled===true,
      fingerprint:'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0')+'-'+bytes};
  }
  // Deployment identity for the panel and diagnostic export: model/script/
  // engine hashes plus the rollback reference. The model hashes are FNV-1a
  // tracking fingerprints; the champion model-file SHA256 is recorded by the
  // deploy/build tooling, not recomputed here.
  function deploymentInfo(){
    return {
      model:{champion:neuralModelInfo(),candidate:shadowModelInfo(),
        action:shadowV7ModelInfo()},
      script:{version:VERSION},
      engine:{commit:window.BOOTSTRAP_CONFIG?.gitCommit??null},
      rollback:'candidate is shadow-only (opt-in control); the NEURAL_BUNDLED_MODEL champion placeholder is never replaced by a schema-5 deploy'};
  }
  function neuralChannel(name,me,s=troopSnapshot,tick=number(()=>game?.ticks?.(),0)){
    return neuralStrategicSignals(me,s,tick)?.[name]||0;
  }
  function neuralAdjust(v,base,me,s,items,emergency){
    if(!opts.neuralEnabled||!opts.fullAuto||neuralModel?.schema!==1||emergency||
      s.incoming>0||recentHostilePressure(number(()=>game.ticks(),0))||
      s.strongest>s.home*1.25)return v;
    const home=Math.max(1,s.home),cap=Math.max(1,s.max);
    const features=[
      clamp(home/cap,0,1.5)/1.5,
      clamp(s.incoming/home,0,2)/2,
      clamp(s.strongest/home,0,3)/3,
      clamp(s.committed/home,0,2)/2,
      items.some(x=>x.id===null&&!x.fallout)?1:0,
      clamp(items.filter(x=>x.id!==null).length/8,0,1),
      clamp(number(()=>me.numTilesOwned(),0)/20000,0,1),
      lateGame(me)?1:0];
    const w=neuralModel.weights,h=[];
    for(let j=0;j<8;j++){
      let z=w[64+j];
      for(let i=0;i<8;i++)z+=features[i]*w[i*8+j];
      h.push(Math.tanh(z));
    }
    const out=[];
    for(let k=0;k<2;k++){
      let z=w[88+k];
      for(let j=0;j<8;j++)z+=h[j]*w[72+j*2+k];
      out.push(Math.tanh(z));
    }
    // Baseline-relative bounds prevent stacked browser-learning/NN adjustments
    // from bypassing reserves. Military and worker legality still recheck.
    return {...v,
      aggressive:clamp(v.aggressive+Math.round(out[0]*8),base.aggressive-8,base.aggressive+8),
      reserve:clamp(v.reserve+Math.round(out[1]*8),base.reserve-8,base.reserve+8)};
  }
  // Schema 2 re-ranks ONLY candidates already admitted by the original
  // planner; legalTarget(), worker actions, reserve and alliance rechecks
  // retain complete authority. No direct AI-generated game intents.
  function neuralActionDelta(kind,score,me,s=troopSnapshot,candidate={}) {
    if(!opts.neuralEnabled||!opts.fullAuto||![2,3,4].includes(neuralModel?.schema)||
      s.incoming>0||recentHostilePressure(number(()=>game.ticks(),0))||
      s.strongest>Math.max(1,s.home)*1.25)return 0;
    const kinds=['attack','economy','naval'],index=kinds.indexOf(kind);
    if(index<0)return 0;
    if(neuralModel.schema>=3){
      // Modern strategic heads also rank legal, already-filtered actions;
      // they never grant construction, combat or naval authorization.
      const signals=neuralStrategicSignals(me,s);
      const head=kind==='attack'?signals?.landPriority:kind==='naval'?
        signals?.navalPriority:({City:signals?.cityPriority,
          Factory:signals?.factoryPriority,Port:signals?.portPriority,
          'Defense Post':signals?.defensePriority,
          'SAM Launcher':signals?.defensePriority,
          'Missile Silo':signals?.nuclearPriority})[candidate.type];
      const delta=Number.isFinite(head)?clamp(head*(10+4*clamp(candidate.opportunity??0,0,1)-
        3*clamp(candidate.cost??0,0,1)-3*clamp(candidate.risk??0,0,1)),-14,14):0;
      neuralEvidence.actionCalls++;
      if(Math.abs(delta)>1e-8)neuralEvidence.actionNonzero++;
      if(neuralEvidence.actionCalls%30===1)telemetry('neural_action_inference',
        'Neurales Aktionsranking beobachtet',{model:neuralModelInfo(),kind,
          type:candidate.type??null,delta,baseline:score});
      return delta;
    }
    const home=Math.max(1,s.home),max=Math.max(1,s.max);
    const vector=[
      clamp(home/max,0,1.5)/1.5,
      clamp(s.incoming/home,0,2)/2,
      clamp(s.strongest/home,0,3)/3,
      clamp(s.committed/home,0,2)/2,
      clamp(goldAmount(me)/1000000,0,1),
      clamp(number(()=>me.numTilesOwned(),0)/20000,0,1),
      lateGame(me)?1:0,
      strategic.groups.some(x=>x.id===null&&!x.fallout)?1:0,
      ...kinds.map((_,i)=>i===index?1:0),
      clamp(score,-150,150)/150,
      clamp(candidate.magnitude??0,0,1),
      clamp(candidate.opportunity??0,0,1),
      clamp(candidate.cost??0,0,1),
      clamp(candidate.risk??0,0,1)
    ];
    const w=neuralModel.weights,h=[];
    for(let j=0;j<12;j++){
      let z=w[192+j];
      for(let i=0;i<16;i++)z+=vector[i]*w[i*12+j];
      h.push(Math.tanh(z));
    }
    let z=w[216];
    for(let j=0;j<12;j++)z+=h[j]*w[204+j];
    const delta=Math.tanh(z)*14;
    neuralEvidence.actionCalls++;
    if(Math.abs(delta)>1e-8)neuralEvidence.actionNonzero++;
    if(neuralEvidence.actionCalls%30===1)telemetry('neural_action_inference',
      'Neurales Aktionsranking beobachtet',{model:neuralModelInfo(),
        kind,delta,baseline:score});
    return delta;
  }
  // Hybrid learning: bounded contextual adjustments; keep existing combat safety checks.
  const LEARN_KEY='of-aggrobot-learning-v1';
  let learn={schema:1,contexts:{},updates:0,lastResult:null};
  let learnMatch={sample:null,key:null,finished:false};
  try {
    const saved=JSON.parse(localStorage.getItem(LEARN_KEY)||'null');
    if(saved?.schema===1&&saved.contexts&&typeof saved.contexts==='object'){
      for(const [k,x] of Object.entries(saved.contexts).slice(0,48))
        if(/^(BALANCED|EXPAND|ASSAULT|RECOVER|ECONOMY|TECH|LATE):(SAFE|THREAT)$/.test(k)&&
          Number.isInteger(x?.n)&&x.n>=0&&x.n<=100000&&Number.isFinite(x?.mean)&&Math.abs(x.mean)<=1)
          learn.contexts[k]={n:x.n,mean:x.mean};
      learn.updates=Math.max(0,Math.min(1000000,Math.floor(Number(saved.updates)||0)));
      learn.lastResult=['victory','defeat'].includes(saved.lastResult)?saved.lastResult:null;
    }
  }catch(_){}
  function saveLearn(){try{localStorage.setItem(LEARN_KEY,JSON.stringify(learn));}catch(_){}}
  function learnKey(mode,s){
    return /^(BALANCED|EXPAND|ASSAULT|RECOVER|ECONOMY|TECH|LATE)$/.test(mode)?
      mode+':'+(s.incoming>0||s.strongest>Math.max(1,s.home)*1.1?'THREAT':'SAFE'):null;
  }
  function learnObserve(tick,me,s,mode){
    if(!opts.learningEnabled||!opts.fullAuto||!me?.hasSpawned?.()||!me?.isAlive?.())return;
    const key=learnKey(mode,s);if(!key)return;
    const now={tick,land:number(()=>me.numTilesOwned(),0),troops:number(()=>me.troops(),0),max:Math.max(1,s.max)};
    const prev=learnMatch.sample;
    if(prev&&tick-prev.tick>=240){
      // Progress proxy, NOT causal credit for a specific attack.
      const reward=clamp(.75*(now.land-prev.land)/Math.max(100,prev.land)+
        .25*(now.troops-prev.troops)/Math.max(1,prev.max),-1,1);
      if(learnMatch.key){
        const old=learn.contexts[learnMatch.key]||{n:0,mean:0};
        const n=Math.min(100000,old.n+1),mean=clamp(old.mean+(reward-old.mean)/Math.min(n,100),-1,1);
        learn.contexts[learnMatch.key]={n,mean};learn.updates++;
        if(learn.updates%8===0)saveLearn();
        telemetry('learning_update','Strategie-Erfahrung',{context:learnMatch.key,reward,samples:n,mean});
      }
      learnMatch.sample=now;learnMatch.key=key;
    }else if(!prev){learnMatch.sample=now;learnMatch.key=key;}
  }
  function learnAdjust(v,mode,s,emergency){
    if(!opts.learningEnabled||!opts.fullAuto||emergency)return v;
    const memory=learn.contexts[learnKey(mode,s)];
    if(!memory||memory.n<3)return v;
    const signal=clamp(memory.mean*Math.min(1,(memory.n-2)/15),-1,1);
    return {...v,aggressive:clamp(v.aggressive+Math.round(signal*5),40,100),
      reserve:clamp(v.reserve-Math.round(signal*4),18,65)};
  }
  function learnFinish(outcome){
    if(learnMatch.finished)return;
    learnMatch.finished=true;
    if(!opts.learningEnabled||!['victory','defeat'].includes(outcome))return;
    learn.lastResult=outcome;saveLearn();
  }


  const escapeHTML = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (n,a,b) => Math.min(b,Math.max(a,Number.isFinite(+n)?+n:a));
  const number = (fn, fallback=0) => {try {const n=Number(fn());return Number.isFinite(n)?n:fallback;}catch(_){return fallback;}};
  // BigInt gold can exceed Number's precise integer range in long games.
  // Cap to a conservative representable balance rather than rounding upward.
  function goldAmount(p,fallback=0){
    try{
      const raw=p.gold(),limit=Number.MAX_SAFE_INTEGER;
      if(typeof raw==='bigint'){
        if(raw>BigInt(limit))return limit;
        if(raw<-BigInt(limit))return -limit;
      }
      const value=Number(raw);
      return Number.isFinite(value)?Math.max(-limit,Math.min(limit,value)):fallback;
    }catch(_){return fallback;}
  }
  const nameOf = p => {try{return p.displayName?.() || p.name?.() || String(p.id());}catch(_){return '?';}};
  const safeID = p => {try{return p.id();}catch(_){return null;}};
  // OpenFront AttackUpdate.targetID/attackerID are numeric smallIDs.
  // The bot keeps warState, pendingAttack and other targets as PlayerID strings.
  function attackTargetPlayer(targetID){
    if(typeof targetID==='number'&&Number.isInteger(targetID)&&targetID>0){
      try{
        const player=game?.playerBySmallID?.(targetID);
        if(player)return player;
      }catch(_){}
      try{return game?.playerViews?.().find(p=>p?.smallID?.()===targetID)||null;}
      catch(_){return null;}
    }
    if(typeof targetID==='string'){
      try{return game?.playerViews?.().find(p=>safeID(p)===targetID)||null;}
      catch(_){return null;}
    }
    return null;
  }
  function attackTargetID(targetID){
    if(targetID===null||targetID===0)return null;
    if(typeof targetID==='string')return targetID; // Older client/test compatibility.
    return safeID(attackTargetPlayer(targetID));
  }
  function attackTargets(targetID,playerOrID){
    if(playerOrID===null)return targetID===null||targetID===0;
    const id=typeof playerOrID==='object'?safeID(playerOrID):playerOrID;
    return id!==null&&attackTargetID(targetID)===id;
  }
  let game=null, bus=null, ctors={}, panel=null, busy=false, generation=0;
  let winnerBus=null,winnerCtor=null,winnerHandler=null,lastWinnerSignal=null;
  const INTENT_KINDS=['spawn','attack','cancel','boat','build','upgrade','alliance','reject'];
  const CORE_INTENTS=['spawn','attack','build'];
  let lastIntentHealth=null,lastIntentProbe=-Infinity,missingIntentLogged=new Set();
  let lastTick=-1, lastSpawn=-Infinity, lastEconomy=-Infinity, lastEconomyProbe=-Infinity;
  let lastBoat=-Infinity, lastBorderTick=-Infinity, borderCache=null, borderPlayer=null;
  let buildCursor=0, spawnCache=null, spawnJob=null, spawnRetryAt=0, spawnAlternatives=[], spawnState={scanned:0,phase:'idle',lastSent:null,attempts:0,blocked:null,deadline:null}, status='Warte auf Spiel';
  let plan=null, rejected=new Map(), lastEmission=0, lastSelection='';
  let totalSent=0, totalFailed=0;
  let borderOffset=0, lastBorderRefresh=0, lastPlanTick=-Infinity;
  let recent=[], actions=[], cooldowns=new Map(), lastPaint=0, errors=0;
  let troopSamples=[], lastRecoveryReason='', lastBattle=null, blockedTargets=new Map();
  let troopSnapshot={home:0,max:0,committed:0,incoming:0,enemy:0,ratio:0,reserve:0,available:0};
  let lastDecisionFrame=null;
  let lastEconomicAction=-Infinity, lastNeutralSend=-Infinity, lastEnemySend=-Infinity,lastHostilePressure=-Infinity;
  let consecutiveIdle=0;
  let economicPending=null, economicBlocked=new Map(), economicNegative=new Map(), economicStatus='Bauplanung bereit', economicLastPlan='—';
  let samQuotedCost=0,portQuotedCost=0,samQuotedTick=-Infinity,portQuotedTick=-Infinity;
  let samAffordableFailureSince=null;
  let economyBusy=false, borderInflight=null, legalNegative=new Map();
  let runtime={borderMs:0,combatMs:0,economyMs:0,attackProbes:0,buildProbes:0};
  let strategic={mode:'EXPAND',reason:'Startphase',buildStyle:'Ausgewogen',since:-Infinity,groups:[]};
  let diplomacyHandled=new Map(),lastDiplomacyTick=-Infinity,lastProposalTick=-Infinity;
  let diplomacyStatus='Noch keine Anfrage', diplomacyStats={accepted:0,rejected:0,offered:0};
  let diplomacyPending=new Map(),lastDiplomaticEmit=0,diplomacyMissingLogged=new Set();
  let goldSamples=[],incomeStatus={train:null,trade:null,gold:null,observed:false};
  let winStatus={mode:'FFA',progress:null,threshold:null,remaining:null,urgent:false};
  let fleetStatus='Keine Marineaktivität',lastFleet=-Infinity,lastDonation=-Infinity,navalSweep=0;
  let tradeStatus='Handel automatisch offen',lastTradeTick=-Infinity,
    tradeBusy=false,tradeStats={opened:0,embargoed:0,skipped:0},
    botEmbargoes=new Set(),tradeAssessments=[];
  let pendingBoat=null,pendingWarship=null,navalCooldown=new Map(),navalBackoffUntil=-Infinity,portProbeFailures=0,lastPortRetryTick=-Infinity,navalSiteNegative=new Map();
  let landingAudits=[],marineUnresolvedWatches=[];
  let marineStats={transportSent:0,transportConfirmed:0,transportArrived:0,bridgeheadHeld:0,
    bridgeheadHeld120:0,bridgeheadHeld600:0,bridgeheadLost:0,
    transportUnconfirmed:0,transportUnresolved:0,warshipSent:0,
    warshipConfirmed:0,warshipUnconfirmed:0};
  let strategicTelemetry={favorableVictims:0,falloutSkipped:0,falloutFallback:0,afkTargets:0,assists:0,neutralLandings:0,forecastCount:0,
    engineForecasts:0,proxyForecasts:0,forecastComparisons:0,forecastUnavailable:0};
  let nukeBusy=false, lastNuke=-Infinity, nukePending=null, nukeStatus='Warte auf Silo', nukeShots=0,nukeAttempts=0,nukeUnconfirmed=0;
  let nuclearCache=null, nuclearCacheTick=-Infinity;
  let warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};
  let diagnostics=[],lastDiagnosticTick=-Infinity,gameEnd=null;
  let pendingAttack=null,attackReceipts={confirmed:0,unconfirmed:0,territoryGained:0};
  let attackCommands=[],attackCommandSequence=0,observedAttacks=new Map();
  let forecastAudits=[],lastForecastAudit=null,incomeAttribution=[];
  let failedEconomyProbes=0,successfulEconomyTick=-Infinity,warWaitSince=-Infinity;
  let coreQuotes=new Map(),lastCoreFundingReport=-Infinity,coreFunding=null;
  let lastEconomyProbeReport=null,neuralDecisionEvidence=null,economyBudgetEvidence=null,shadowDecisionEvidence=null;
  // Yield silo lead only after an observed funded, illegal-site worker scan.
  let duoSiloBlockedUntil=-Infinity;
  let investmentStatus='Grundaufbau',lastWarReview=-Infinity;
  let defenseStatus='Keine Bedrohung',lastEmergencyRetreat=-Infinity,lastDefenseLog=-Infinity;
  let targetIntelCache=new Map(),frontMemory=new Map(),lastFrontWarning=-Infinity;
  let opponentHistory=new Map(),opponentProfiles=new Map(),lastEconomyPosture='—',lastDirectorDecision=null;
  let planningState={tick:-Infinity,candidates:[],selected:null,rejected:null,
    durationMs:0,budgetMs:50,truncated:false};
  // P0: one canonical decision frame per planning tick (bounded), resolved
  // against confirmations/observations at fixed horizons before export.
  let decisionFrames=[];
  // Step 3: benchmark-only per-decision frame for real training capture.
  // Mirrors the P5 runtime state EXACTLY: planningState.v5State carries the
  // very state object strategicCandidatePlan scored (17 fields, including
  // v5StateExtension), and each candidate's `v5` contract is the exact
  // candidate object shadowV5.features received. Diagnostics only: it
  // reads state, never authorizes or blocks actions.
  function planningFrame(){
    const me=myPlayer();
    if(!me?.hasSpawned?.())return null;
    const sel=planningState?.selected;
    if(!sel||!sel.kind)return null;
    const s=troopSnapshot,groups=strategic?.groups||[];
    const project=c=>({kind:c.kind,costTroops:c.cost||0,
      counterRisk:c.risk||0,
      holdProbability:1-Math.min(1,c.risk||0),
      ...(c.v5||{})});
    return {tick:number(()=>game?.ticks?.(),null),
      land:number(()=>me.numTilesOwned(),0),
      home:s.home,maxTroops:s.max,committed:s.committed,
      incoming:s.incoming,reserve:s.reserve,gold:goldAmount(me),
      capacityUse:s.ratio,frontCount:groups?.length||0,
      ...(planningState?.v5State||{}),
      // §4 binding evidence: per-candidate rule utility, model score,
      // effective gain and combined utility, plus the frame-level gain and
      // the 1st-vs-2nd rule gap. Lets the binding analysis compute the gain
      // required to flip the pick from actual scores and utility gaps, not
      // an average. modelSHA is the candidate-model fingerprint; the
      // authoritative candidate SHA256 is pinned in benchmarkMeta.
      binding:planningState?.binding??null,
      controlGain:planningState?.controlGain??0,
      controlMode:planningState?.controlMode??null,
      controlCapGain:planningState?.controlCapGain??null,
      controlConfidenceRef:planningState?.controlConfidenceRef??null,
      controlMargin:planningState?.controlMargin??null,
      ruleTop2Gap:planningState?.ruleTop2Gap??null,
      modelSHA:planningState?.provenance?.modelHashes?.candidate??null,
      ruleChoice:planningState?.ruleChoice??null,
      modelChoice:planningState?.modelChoice??null,
      finalChoice:planningState?.finalChoice??null,
      changedIntent:planningState?.changedIntent??false,
      safetyBlockReason:planningState?.safetyBlockReason??null,
      // §19 on-policy branch capture: the schema-7 decision for this frame
      // (rule top, model top, per-branch scores, emitted kind). Null when no
      // schema-7 model is bundled, in which case the training frame is the
      // pure rule basis.
      branch:branchFunnel.lastDecision?{...branchFunnel.lastDecision}:null,
      candidate:project(sel),
      candidates:(planningState?.candidates||[]).map(project)};
  }
  let investmentAssessments=[];
  let operation=null,operationCooldown=new Map(),duoPlan=null,victoryThreat=null,decisionTimeline=[],decisionKeys=new Map();
  // sessionStorage is tab-scoped: survives reloads but never assigns the
  // same ID to two ordinary tabs sharing one browser profile.
  function duoInstanceID(){
    const key='aggrobot-duo-tab-instance-v1';
    try{
      const old=sessionStorage.getItem(key);
      if(old&&/^[a-zA-Z0-9_.:@-]{1,128}$/.test(old))return old;
      const id='tab-'+(typeof crypto!=='undefined'&&crypto.randomUUID?
        crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36));
      sessionStorage.setItem(key,id);return id;
    }catch(_){return 'tab-'+Math.random().toString(36).slice(2)+Date.now().toString(36);}
  }
  let duoLocal={instance:duoInstanceID(),
    peer:null,status:'AUS',lastAt:0,lastPublished:0,match:null,
    partnerID:null,ownID:null,failures:0,lastPromise:null,
     relayDrops:0,relayTimeouts:0,ackTimeouts:0,seenPeer:false,lastExpiredPlan:null};
  let retreatRequests=new Map(),defenseStats={retreatsOrdered:0,retreatsObserved:0,unknown:0,unconfirmed:0};
  // Manual slider values remain saved; fullAuto computes independent live values.
  let autoTuning={aggressive:85,reserve:35,actionsPerMinute:72,maxTargets:16,
    mode:'INIT',reason:'Warte auf Spielzustand',tick:-Infinity};
  const hardMode=()=>opts.impossibleMode && game?.config?.().gameConfig?.().difficulty==='Impossible';
  // The large World map is out-expanded by Impossible AI: the bot ends as the
  // defender and its territory plateaus early. Detect it to extend the
  // aggressive opening so the bot establishes territory before it is attacked.
  const largeMap=()=>{try{const cfg=game?.config?.().gameConfig?.()||{};
    const name=String(cfg.gameMap||'');if(name)return /world/i.test(name);}catch(_){}return false;};
  // Keep single-front coordination in Public/Medium as well as Impossible.
  // Difficulty-specific troop ratios remain tied to actual difficulty.
  const coordinatedWar=()=>opts.impossibleMode;
  const isWar=()=>warState.id!==null;
  // Test control exists only on loopback and only after explicit harness opt-in.
  const benchmark = ['localhost','127.0.0.1','[::1]'].includes(window.location?.hostname) &&
    window.__OF_BENCHMARK_CONFIG__?.enabled===true ? window.__OF_BENCHMARK_CONFIG__ : null;
  // recordsDropped counts true journal loss (a record the persistent stream
  // never received); recordsEvicted only counts in-memory ring rotations of
  // records the stream already received. The two must not be conflated.
  let recordSequence=0,recordCounts={},recordsDropped=0,recordsEvicted=0,streamErrors=0;
  // Stable per-match IDs identify individual emitted actions. An emitted
  // intent is NOT proof the worker accepted it or that it achieved a result.
  let actionSequence=0,lastActionId=null;
  let monitorSession='';
  let actionLedger=[];
  let diagnosticLastPeerTick=-Infinity;
  let diagnosticHelpSequence=0,diagnosticHelpId=null,diagnosticHelpSince=null;
  let diagnosticLastReceivedHelp=null,diagnosticLastHelpAck=null;
  let diagnosticHelpDeadline=null,diagnosticHelpExpired=false;
  let diagnosticAid=null,diagnosticLastCommitmentSeen=null;
  let diagnosticHelpClosing=null;
  let diagnosticDonationSeen=new Map();
  let donationCapture={polls:0,readable:0,candidates:0,matched:0,
    lastProbeTick:-Infinity,lastReceiptTick:null,lastProblem:null};
  let diagnosticDecisionSequence=0;
  // Diagnostic v2: preserve critical events independently of the 1400-record UI ring.
  // Session storage is tab-scoped and never shares another bot's player identity.
  const diagnosticV2={schemaVersion:2,critical:[],dropped:0,lastDuoStatus:null,
    lastDuoPeer:null,lastDuoAt:null,lastVerifiedPartnerId:null};
  const DIAGNOSTIC_CRITICAL_LIMIT=1200;
  function diagnosticCritical(record){
    const frozen=jsonCopy(record);
    diagnosticV2.critical.push(frozen);
    if(diagnosticV2.critical.length>DIAGNOSTIC_CRITICAL_LIMIT){
      diagnosticV2.critical.shift();diagnosticV2.dropped++;
    }
    // Full history is journaled to IndexedDB; no megabyte sessionStorage writes.
    // The compact tab-scoped checkpoint permits same-player reload recovery.
  }
  function diagnosticDuoTransition(status,peer,reason){
    const id=peer?.id??null;
    if(diagnosticV2.lastDuoStatus===status&&diagnosticV2.lastDuoPeer===id)return;
    diagnosticV2.lastDuoStatus=status;diagnosticV2.lastDuoPeer=id;
    diagnosticV2.lastDuoAt=new Date().toISOString();
    telemetry('duo_transition','Duo-Statuswechsel',{
      duoStatus:status,peerId:id,reason:reason??null,
      ownId:safeID(myPlayer()),matchId:String(game?.gameID?.()??'unknown'),
      duoRoom:opts.duoRoom||null});
  }
  // IndexedDB journals every telemetry record, not just the last UI-ring entries.
  // On unavailable/quota-blocked storage the export reports the missing range.
  const diagnosticStore={queue:[],opening:null,flushing:null,timer:null,
    persisted:0,lost:0,error:null};
  function diagnosticOpen(){
    if(diagnosticStore.opening)return diagnosticStore.opening;
    diagnosticStore.opening=new Promise(resolve=>{
      if(!window.indexedDB){diagnosticStore.error='indexeddb-unavailable';resolve(null);return;}
      try{
        const request=window.indexedDB.open('aggrobot-diagnostic-v2',1);
        request.onupgradeneeded=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains('events'))
            db.createObjectStore('events',{keyPath:['session','seq']});
        };
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>{diagnosticStore.error='open-failed';resolve(null);};
        request.onblocked=()=>{diagnosticStore.error='open-blocked';resolve(null);};
      }catch(_){diagnosticStore.error='open-exception';resolve(null);}
    });
    return diagnosticStore.opening;
  }
  function diagnosticEnqueue(record){
    diagnosticStore.queue.push(jsonCopy(record));
    if(diagnosticStore.queue.length>10000){
      const excess=diagnosticStore.queue.length-10000;
      diagnosticStore.queue.splice(0,excess);diagnosticStore.lost+=excess;
    }
    try{sessionStorage.setItem('aggrobot-diagnostic-v2-meta',JSON.stringify({
      session:monitorSession,matchId:String(game?.gameID?.()??'unknown'),
      playerId:safeID(myPlayer()),seq:recordSequence}));}catch(_){}
    if(!diagnosticStore.timer)
      diagnosticStore.timer=setTimeout(()=>{diagnosticStore.timer=null;
        void diagnosticFlush();},500);
  }
  async function diagnosticFlush(){
    if(diagnosticStore.flushing)return diagnosticStore.flushing;
    diagnosticStore.flushing=(async()=>{
      const db=await diagnosticOpen();
      if(!db){diagnosticStore.lost+=diagnosticStore.queue.length;
        diagnosticStore.queue=[];return;}
      while(diagnosticStore.queue.length){
        const batch=diagnosticStore.queue.splice(0,200);
        const ok=await new Promise(resolve=>{
          try{
            const tx=db.transaction('events','readwrite');
            const store=tx.objectStore('events');
            for(const entry of batch)store.put(entry);
            tx.oncomplete=()=>resolve(true);
            tx.onerror=()=>resolve(false);
            tx.onabort=()=>resolve(false);
          }catch(_){resolve(false);}
        });
        if(ok)diagnosticStore.persisted+=batch.length;
        else{diagnosticStore.lost+=batch.length;
          diagnosticStore.error='transaction-failed';}
      }
    })();
    try{await diagnosticStore.flushing;}finally{diagnosticStore.flushing=null;}
  }
  async function diagnosticReadAll(session=monitorSession){
    if(diagnosticStore.timer){if(typeof clearTimeout==='function')clearTimeout(diagnosticStore.timer);
      diagnosticStore.timer=null;}
    await diagnosticFlush();
    const db=await diagnosticOpen();
    if(!db)return diagnostics.map(jsonCopy);
    return new Promise(resolve=>{
      const entries=[];
      try{
        const tx=db.transaction('events','readonly');
        const range=IDBKeyRange.bound([session,0],
          [session,Number.MAX_SAFE_INTEGER]);
        const request=tx.objectStore('events').openCursor(range);
        request.onsuccess=()=>{
          const cursor=request.result;
          if(cursor){entries.push(cursor.value);cursor.continue();}
          else resolve(entries);
        };
        request.onerror=()=>{diagnosticStore.error='read-failed';
          resolve(diagnostics.map(jsonCopy));};
      }catch(_){diagnosticStore.error='read-exception';
        resolve(diagnostics.map(jsonCopy));}
    });
  }
  let budgetCommitments=[];
  let attackBlockReport=null,lastAttackBlockReport=-Infinity,
    lastOffenseDroughtReport=-Infinity;
  let crisisTrend=null,lastCrisisReport=-Infinity;
  let landingFailures=new Map();
  let neuralEvidence={calls:0,nonzero:0,actionCalls:0,actionNonzero:0,last:null};
  const jsonCopy=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
  function telemetry(kind,message,extra={}) {
    if((!opts.enabled&&kind!=='game_over') || !permittedMatch(game))return;
    let m=myPlayer(),tick=number(()=>game.ticks(),0);
    // Freeze each historical snapshot; otherwise shared mutable metrics can
    // make every old record appear to contain the latest values.
    let frozen=extra;
    if(kind==='snapshot'){
      try{frozen=JSON.parse(JSON.stringify(extra,(_,v)=>
        typeof v==='bigint'?v.toString():v));}
      catch(_){frozen={snapshotError:'Daten konnten nicht eingefroren werden'};}
    }
    // Generic troopSnapshot values are fallbacks; decision-local measurements
    // supplied by a caller after an async worker check must take precedence.
    const record={detailKind:frozen.kind,session:monitorSession,
      snapshotTick:lastTick,seq:++recordSequence,time:new Date().toISOString(),
      tick,kind,message,mode:strategic.mode,warTarget:warState.name,
      home:number(()=>m?.troops?.()),gold:number(()=>Number(m?.gold?.())),
      land:number(()=>m?.numTilesOwned?.()),committed:troopSnapshot.committed,
      incoming:troopSnapshot.incoming,...frozen};
    // Protect recording identity and metadata from an accidental extra field.
    record.session=monitorSession;record.seq=recordSequence;
    record.time=new Date().toISOString();record.tick=tick;
    record.kind=kind;record.message=message;
    record.schemaVersion=2;
    record.playerId=safeID(m);
    record.matchId=String(game?.gameID?.()??'unknown');
    record.frameId=monitorSession+':t'+tick;
    record.decisionId=record.decisionId??null;
    record.actionId=record.actionId??null;
    diagnostics.push(record);
    diagnosticEnqueue(record);
    if(/^(game_over|duo_|attack_confirmed|attack_unconfirmed|build_confirmed|build_unconfirmed|boat_|transport_|action)$/.test(kind))
      diagnosticCritical(record);
    if(kind==='action'&&record.actionId){
      actionLedger.push({actionId:record.actionId,decisionId:record.decisionId,
        tick:record.tick,intent:record.intent,description:message,
        requestedTroops:record.requestedTroops??null,
        quotedCost:record.quotedCost??null,emission:'event-bus',
        homeBefore:record.home,goldBefore:record.gold,
        actualTroopOutflow:'unknown',actualGoldCost:'unknown',
        observed:'unknown',effect:'unknown'});
      if(actionLedger.length>300)actionLedger.shift();
    }else if(record.actionId&&/^(attack|build|boat|transport)_(confirmed|unconfirmed|arrived|unresolved)$/.test(kind)){
      const action=actionLedger.find(x=>x.actionId===record.actionId);
      if(action){action.observed=kind;action.observedTick=record.tick;
        action.homeAfterObserved=record.home;
        action.goldAfterObserved=record.gold;
        action.effect='unknown';}
    }else if(record.actionId&&kind==='attack_outcome_observed'){
      const action=actionLedger.find(x=>x.actionId===record.actionId);
      if(action)action.outcomeObservation={
        ownLandBefore:record.ownLandBefore,ownLandAfter:record.ownLandAfter,
        defenderLandBefore:record.defenderLandBefore,
        defenderLandAfter:record.defenderLandAfter,
        observedOutcome:record.observedOutcome,attribution:record.attribution,
        effect:'unknown'};
    }
    recordCounts[kind]=(recordCounts[kind]||0)+1;
    if(benchmark && typeof benchmark.onRecord==='function'){
      try{benchmark.onRecord(jsonCopy(record));}
      // A record the journal callback failed to receive is a true loss.
      catch(_){streamErrors++;recordsDropped++;}
    }
    if(diagnostics.length>1400){
      // Ring eviction is a display cap, not a recording loss: the persistent
      // journal/stream received every record before it was evicted.
      const evicted=diagnostics.length-1400;recordsEvicted+=evicted;
      diagnostics.splice(0,evicted);
    }
  }
  // P0: link decision frames to emitted intents and confirmations.
  // A frame stays "pending" until the fixed observation horizon passes; if
  // the match ends before confirmation it is "censored", never "unknown=0".
  const DECISION_EFFECT_HORIZON=120,DECISION_RESOLVE_HORIZON=600;
  const DECISION_RESOLVED_HISTORY=16,DECISION_MAX_PENDING=1024;
  function compactDecisionFrames(tick){
    // Retain ALL pending frames through their 600-tick observation horizon.
    // Only already-resolved display history is a small bounded ring.
    let pending=0;
    for(const frame of decisionFrames)if(!frame.resolved)pending++;
    if(pending>DECISION_MAX_PENDING){
      let overflow=pending-DECISION_MAX_PENDING;
      for(const frame of decisionFrames){
        if(!overflow||frame.resolved)continue;
        frame.resolved=true;frame.outcomeStatus='unknown';
        frame.resolution={atTick:tick,censored:true,reason:'pending-capacity',
          effectHorizon:DECISION_EFFECT_HORIZON,
          resolveHorizon:DECISION_RESOLVE_HORIZON};
        overflow--;
      }
    }
    let resolved=0;
    for(let i=decisionFrames.length-1;i>=0;i--){
      if(!decisionFrames[i].resolved)continue;
      if(++resolved>DECISION_RESOLVED_HISTORY)decisionFrames.splice(i,1);
    }
  }
  function censorPendingDecisionFrames(tick,reason='match-end'){
    for(const frame of decisionFrames){
      if(frame.resolved)continue;
      frame.resolved=true;frame.outcomeStatus='unknown';
      frame.resolution={atTick:tick,censored:true,reason,
        effectHorizon:DECISION_EFFECT_HORIZON,
        resolveHorizon:DECISION_RESOLVE_HORIZON};
    }
    compactDecisionFrames(tick);
  }
  function resolveDecisionFrames(tick){
    if(tick===null||!Number.isFinite(tick)||tick<0)return;
    for(const frame of decisionFrames){
      if(frame.resolved)continue;
      const linked=actionLedger.filter(e=>e.decisionId===frame.decisionId);
      const seen=new Map();
      for(const e of linked)seen.set(e.actionId,e);
      const intents=[...seen.values()].map(e=>({actionId:e.actionId,
        intent:e.intent,tick:e.tick,emission:e.emission,
        observed:e.observed,observedTick:e.observedTick??null}));
      frame.actualIntents=intents;
      frame.actionReceipt=[...seen.values()].map(e=>({actionId:e.actionId,
        observed:e.observed,observedTick:e.observedTick??null,
        effect:e.effect,outcomeObservation:e.outcomeObservation??null,
        homeAfter:e.homeAfterObserved??null,
        goldAfter:e.goldAfterObserved??null}));
      frame.observedEffects=[...seen.values()].map(e=>({actionId:e.actionId,
        effect:e.effect,
        observedOutcome:e.outcomeObservation?.observedOutcome??null}));
      const confirmed=seen.size>0&&[...seen.values()].some(e=>
        String(e.observed).endsWith('confirmed'));
      const unconfirmed=seen.size>0&&[...seen.values()].some(e=>
        e.observed==='attack_unconfirmed'||e.observed==='build_unconfirmed');
      const horizonReached=tick>=frame.tick+DECISION_EFFECT_HORIZON;
      if(horizonReached&&
        (confirmed||unconfirmed||tick>=frame.tick+DECISION_RESOLVE_HORIZON)){
        frame.outcomeStatus=confirmed?'confirmed':
          unconfirmed?'unconfirmed':'unknown';
        frame.resolution={atTick:tick,
          censored:!confirmed&&!unconfirmed,
          effectHorizon:DECISION_EFFECT_HORIZON,
          resolveHorizon:DECISION_RESOLVE_HORIZON};
        frame.resolved=true;
      }
    }
    compactDecisionFrames(tick);
  }
  function gameOutcome(g,me){
    const result={outcome:'unknown',source:'gameOver',tick:number(()=>g?.ticks?.(),-1),
      alive:me?.isAlive?.()??null,land:number(()=>me?.numTilesOwned?.(),0),
      progress:winStatus.progress,mode:winStatus.mode};
    // The official GameView.gameOver() only says a WinUpdate was observed;
    // the official winner tuple carries the actual player/team outcome.
    try{
      const updates=g?.updatesSinceLastTick?.();
      const current=Object.values(updates||{}).flat().find(u=>
        u && typeof u==='object' && Object.hasOwn(u,'winner') &&
        Object.hasOwn(u,'allPlayersStats'));
      const win=lastWinnerSignal||current;
      if(win){
        const winner=win.winner;
        result.source='WinUpdate';
        result.winnerType=Array.isArray(winner)?winner[0]:null;
        result.winnerNames=Array.isArray(winner)&&winner[0]==='team'?
          [String(winner[1])]:[];
        if(winner===null||winner===undefined)result.outcome='incomplete';
        else if(Array.isArray(winner)&&['player','team','nation'].includes(winner[0])){
          const ids=winner.slice(winner[0]==='player'?1:2);
          // Winner tuples contain ClientID, not PlayerID or numeric smallID.
          const clientID=me?.clientID?.();
          if(winner[0]==='team'&&me?.team?.()!==null&&
            me?.team?.()!==undefined&&String(winner[1])===String(me.team()))
            result.outcome='victory';
          else if(typeof clientID==='string'&&clientID.length)
            result.outcome=winner[0]==='nation'?'defeat':ids.includes(clientID)?'victory':'defeat';
        }
      }
    }catch(_){}
    return result;
  }
  function diagnosticSnapshot() {
    const config=game?.config?.().gameConfig?.()||{};
    const details={bot:VERSION,learning:{enabled:!!opts.learningEnabled,updates:learn.updates,contexts:jsonCopy(learn.contexts),lastResult:learn.lastResult,lastResultScope:'persistent-learning-history',currentMatchResult:gameEnd?.outcome??null},gameType:config.gameType,
      difficulty:config.difficulty,
      benchmarkMeta:{gameMap:config.gameMap??null,
        gameMapSize:config.gameMapSize??null,gameMode:config.gameMode??null,
        seed:config.seed??null,engineCommit:window.BOOTSTRAP_CONFIG?.gitCommit??null,
        matchEndObserved:gameEnd!==null,resultsVerifiedByBrowser:false},
      matchContext:matchContext(),
      options:{...opts,enabled:false},archetype:archetypePolicy(),archetypeSignature:archetypeSignature(),
      intents:intentHealth(),tuning:{...autoTuning,enabled:!!opts.fullAuto,
        effective:{aggressive:setting('aggressive'),reserve:setting('reserve'),
          actionsPerMinute:setting('actionsPerMinute'),maxTargets:setting('maxTargets')}},attackReceipts, pendingAttack, attackCommands, attackOrigins:[...observedAttacks.values()],
      construction:{pending:economicPending,blocked:[...economicBlocked.entries()],failedProbes:failedEconomyProbes,lastConfirmed:successfulEconomyTick,investment:investmentStatus,
        coreFunding,lastProbe:lastEconomyProbeReport},
      neuralDecisionEvidence,
      attackBlockReport,crisisTrend,landingFailures:[...landingFailures],
      neuralEvidence:{...neuralEvidence,model:neuralModelInfo()},
      deployment:deploymentInfo(),
      // §28 schema-7 branch funnel: aggregate counts + the last decision so
      // the pre-gate (differentExecutedTurns>0) and the dev/holdout
      // comparison can be reconciled offline from the match report.
      branchFunnel:{...branchFunnel,lastDecision:{...branchFunnel.lastDecision}},
      validation:{forecastAudits,incomeAttribution,
        terrainMethod:'nuke-cubic-bezier-conservative',
        railMethod:'owned-land-corridor-proxy',
        fullBrowserMatchValidated:false,
        note:'Die Datei ist ein Spielmitschnitt; Sieg und echte Mehrkarten-Benchmarks erfordern vollständige Browser-Matches.'},
      opponents:[...opponentProfiles.values()].map(v=>({...v})),
      decisionFrame:lastDecisionFrame,planning:planningState,
      decisionFrames:decisionFrames.map(v=>({...v})),
      economyBudgetEvidence,shadowDecisionEvidence,
      investmentAssessments,operation,duoPlan,victoryThreat,
      localDuo:{status:duoLocal.status,peer:duoLocal.peer,
        partnerID:opts.duoPartnerID,resolvedPartnerID:
          duoTrustedPeer()?.id??diagnosticV2.lastVerifiedPartnerId??null,
        ownID:safeID(myPlayer()),connected:!!duoTrustedPeer(),match:duoLocal.match,
        failures:duoLocal.failures,relayDrops:duoLocal.relayDrops,
        relayTimeouts:duoLocal.relayTimeouts,ackTimeouts:duoLocal.ackTimeouts,
        phase:duoStatusView(opts.duoEnabled,duoTrustedPeer(),duoPlan,
          number(()=>game?.ticks?.(),-1),duoLocal)},
      decisionTimeline:decisionTimeline.map(v=>({...v})),
      war:{...warState},gameEnd,spawn:{...spawnState,best:spawnCache?{...spawnCache}:null},victory:winStatus,income:incomeStatus,fleet:fleetStatus,marine:{stats:marineStats,pendingBoat,pendingWarship,landingAudits:landingAudits.map(a=>({...a})),
        marineUnresolvedWatches:marineUnresolvedWatches.map(a=>({...a})),portProbeFailures},strategicTelemetry,military:troopSnapshot,
      defense:{status:defenseStatus,stats:defenseStats,pendingRetreats:[...retreatRequests.values()]},
      rockets:{confirmed:nukeShots,attempts:nukeAttempts,unconfirmed:nukeUnconfirmed,pending:nukePending},
      diplomacy:{status:diplomacyStatus,stats:diplomacyStats,pending:[...diplomacyPending.values()]},records:diagnostics,createdAt:new Date().toISOString()};
    details.actionTrace={nextSequence:actionSequence+1,lastActionId,
      ledger:actionLedger.map(v=>({...v})),
      semantics:'sent-is-not-confirmed; confirmations are observations; effect unknown'};
    details.actionEvidence=actionEvidenceKernel(actionLedger);
    details.diagnosticV2={schemaVersion:2,matchId:String(game?.gameID?.()??'unknown'),
      playerId:safeID(myPlayer()),playerName:nameOf(myPlayer()),
      partnerId:opts.duoEnabled?
        duoTrustedPeer()?.id??diagnosticV2.lastVerifiedPartnerId??null:null,
      partnerIdEvidence:!opts.duoEnabled?'local-duo-off':
        duoTrustedPeer()?'verified-current-peer':
        diagnosticV2.lastVerifiedPartnerId?'last-verified-this-match':'unknown',
      duoRoom:opts.duoEnabled?opts.duoRoom||null:null,
      personalEliminationTick:gameEnd?.personalEliminated?gameEnd.tick:null,
      matchEndTick:game?.gameOver?.()?number(()=>game.ticks(),null):null,
      donationCapture:{...donationCapture},
      critical:diagnosticV2.critical,dropped:diagnosticV2.dropped,
      journal:{persisted:diagnosticStore.persisted,queued:diagnosticStore.queue.length,
        lost:diagnosticStore.lost,error:diagnosticStore.error},
      lastDuoTransitionAt:diagnosticV2.lastDuoAt,
      helpRequestId:diagnosticHelpId,helpSinceTick:diagnosticHelpSince,
      helpDeadlineTick:diagnosticHelpDeadline,
      helpAckObserved:diagnosticLastHelpAck===diagnosticHelpId&&
        diagnosticHelpId!==null,
      evidence:'event-bus emission is not confirmed effect'};
    details.recording={total:recordSequence,counts:{...recordCounts},dropped:recordsDropped,
      evicted:recordsEvicted,
      firstSequence:diagnostics[0]?.seq??null,streamErrors};
    return jsonCopy(details);
  }

  // Stored ZIP: a single download avoids multi-download browser blocking.
  function diagnosticZip(files){
    const encoder=new TextEncoder(),locals=[],central=[];
    const table=new Uint32Array(256);
    for(let n=0;n<256;n++){let c=n;for(let j=0;j<8;j++)
      c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
    const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)
      c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
    const put16=(view,at,n)=>view.setUint16(at,n,true);
    const put32=(view,at,n)=>view.setUint32(at,n,true);
    let offset=0,centralSize=0;
    if(files.length>65535)throw Error('ZIP entry limit');
    for(const [name,body] of files){
      const filename=encoder.encode(name),bytes=encoder.encode(body);
      if(bytes.length>0xffffffff||offset+bytes.length>0xffffffff)
        throw Error('Diagnostic ZIP too large');
      const crc=crc32(bytes),local=new Uint8Array(30),lv=new DataView(local.buffer);
      put32(lv,0,0x04034b50);put16(lv,4,20);put16(lv,6,0x0800);
      put16(lv,8,0);put32(lv,14,crc);put32(lv,18,bytes.length);
      put32(lv,22,bytes.length);put16(lv,26,filename.length);
      locals.push(local,filename,bytes);
      const header=new Uint8Array(46),cv=new DataView(header.buffer);
      put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);
      put16(cv,8,0x0800);put32(cv,16,crc);put32(cv,20,bytes.length);
      put32(cv,24,bytes.length);put16(cv,28,filename.length);
      put32(cv,42,offset);
      central.push(header,filename);
      offset+=local.length+filename.length+bytes.length;
      centralSize+=header.length+filename.length;
    }
    const ending=new Uint8Array(22),ev=new DataView(ending.buffer);
    put32(ev,0,0x06054b50);put16(ev,8,files.length);
    put16(ev,10,files.length);put32(ev,12,centralSize);
    put32(ev,16,offset);
    return new Blob([...locals,...central,ending],{type:'application/zip'});
  }
  function diagnosticDownload(blob,filename){
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  let diagnosticAutoExported=false;
  async function exportDiagnosticPackage(automatic=false){
    if(automatic){
      if(diagnosticAutoExported)return;
      diagnosticAutoExported=true;
    }
    if(automatic)censorPendingDecisionFrames(
      number(()=>game?.ticks?.(),-1),'match-end-or-elimination');
    const session=monitorSession,summary=diagnosticSnapshot();
    const rows=await diagnosticReadAll(session);
    const complete=rows.length===summary.recording.total&&
      rows.every((row,i)=>row.session===session&&row.seq===i+1)&&
      diagnosticStore.lost===0&&!diagnosticStore.error;
    summary.diagnosticV2.journal={
      ...summary.diagnosticV2.journal,storedRows:rows.length,
      expectedRows:summary.recording.total,complete,
      note:complete?'IndexedDB timeline complete':
        'Timeline incomplete or storage unavailable; do not use as complete evidence'};
    const sorted=rows.sort((a,b)=>a.seq-b.seq);
    const jsonl=items=>items.map(x=>JSON.stringify(x)).join('\n')+
      (items.length?'\n':'');
    const duo=sorted.filter(x=>/^duo_/.test(x.kind)||
      x.kind==='action'&&/^DUO/.test(x.message||''));
    const snapshot=sorted.filter(x=>x.kind==='snapshot');
    // Official Engine Team and localhost Duo are independent. Only actual
    // engine DonateEvent receipts count as delivered support; an emitted
    // TEAMHILFE intent is NOT evidence that a donation arrived.
    const officialTeam=summary.benchmarkMeta?.gameMode==='Team';
    const team=officialTeam?sorted.filter(x=>
      x.kind==='donation_observed'||/^team_/.test(x.kind)||
      x.kind==='game_over'||
      x.kind==='action'&&/TEAMHILFE|TEAMGOLD/.test(x.message||'')):[];
    summary.diagnosticV2.team={
      officialTeam,localDuoEnabled:opts.duoEnabled===true,
      observedDonationEvents:team.filter(x=>x.kind==='donation_observed').length,
      personalEliminationTick:summary.diagnosticV2.personalEliminationTick,
      teamOutcome:gameEnd?.teamOutcomePending?'unknown':gameEnd?.outcome??'unknown',
      outcomeSemantics:'personal elimination is not proof of team defeat'};
    // Compact overview includes the old diagnostic for existing consumers.
    // No statement of action success is inferred from gold/land deltas.
    const files=[
      ['summary.json',JSON.stringify(summary,null,2)],
      ['events.jsonl',jsonl(sorted)],
      ['snapshots.jsonl',jsonl(snapshot)],
      ['duo.jsonl',jsonl(duo)],
      ['team.jsonl',jsonl(team)],
      ['README.txt','OpenFront diagnostic v2 | session='+session+
        '\ncomplete='+complete+' | event bus emission is not effect proof.'+
        '\nZIP uses stored entries. Merge browsers by matchId, then playerId and session.\n']
    ];
    if(session!==monitorSession)return; // Never label a new match as old.
    try{diagnosticDownload(diagnosticZip(files),
      'OpenFront_'+VERSION+'_'+String(summary.diagnosticV2.playerId||'unknown')+
      '_DiagnoseV2.zip');}
    catch(e){console.warn(PREFIX,'Diagnosepaket konnte nicht exportiert werden',e);}
  }
  function exportDiagnostics(){void exportDiagnosticPackage();}


  const log = message => {recent.unshift(message);recent=recent.slice(0,7);console.info(PREFIX,message);telemetry('decision',message);};
  const gameType = g => {
    try{return g?.config?.().gameConfig?.().gameType ?? null;}catch(_){return null;}
  };
  const multiplayerMatch = g => ['Public','Private'].includes(gameType(g));
  // Ranked 2v2 is an explicit OpenFront gameConfig marker. A normal Duos
  // lobby must keep its old economy and combat tuning.
  function rankedDuo(me=myPlayer()) {
    const gc=game?.config?.().gameConfig?.()||{};
    if(!me||gc.rankedType!=='2v2'||gc.gameMode!=='Team')return null;
    const team=me.team?.();
    if(team===null||team===undefined)return null;
    const views=game?.playerViews?.()||[];
    const partners=views.filter(p=>p&&safeID(p)!==safeID(me)&&
      p.isAlive?.()&&p.team?.()===team&&me.isOnSameTeam?.(p));
    if(partners.length!==1)return null;
    const enemies=views.filter(p=>p?.isAlive?.()&&p.isPlayer?.()&&
      safeID(p)!==safeID(me)&&!friendly(p,me));
    return {partner:partners[0],enemies,team,
      ownID:safeID(me),partnerID:safeID(partners[0])};
  }
  function duoFocus(me,enemy){
    // Only game-observed attacks by a genuinely allied reciprocal peer
    // earn combat credit. Relay intentions are never counted as troops.
    const peer=duoTrustedPeer();
    const local=peer&&actualFriendly(peer.player,me)?
      {partner:peer.player,partnerID:peer.id}:null;
    const duo=rankedDuo(me)||local;
    if(!duo||!enemy||safeID(enemy)===duo.partnerID||
      friendly(enemy,me))return null;
    const outgoing=(duo.partner.outgoingAttacks?.()||[])
      .filter(a=>!a.retreating&&a.troops>0);
    const on=outgoing.filter(a=>attackTargets(a.targetID,enemy))
      .reduce((sum,a)=>sum+number(()=>a.troops,0),0);
    const elsewhere=outgoing.filter(a=>a.targetID!==null&&a.targetID!==0&&
      !attackTargets(a.targetID,enemy))
      .reduce((sum,a)=>sum+number(()=>a.troops,0),0);
    return {on,elsewhere,partner:duo.partnerID};
  }
  // Credit only an actually observed, non-retreating partner stack. Never
  // count an announced attack, an allied intention or the partner's whole
  // home army. All independent home/front/worker gates remain authoritative.
  function duoBattleCredit(me,enemy) {
    const on=duoFocus(me,enemy)?.on||0;
    const troops=Math.max(0,number(()=>enemy?.troops?.(),0));
    return Math.min(on*.55,troops*.75);
  }
  function matchContext(me=myPlayer()) {
    const cfg=game?.config?.().gameConfig?.()||{};
    const players=(game?.playerViews?.()||[]).filter(p=>p?.isPlayer?.()&&p?.isAlive?.());
    const selfID=safeID(me);
    let humans=0,nations=0,hostileHumans=0,hostileNations=0;
    for(const p of players){
      if(safeID(p)===selfID)continue;
      const human=typeof p.clientID?.()==='string'&&p.clientID?.().length>0;
      if(human)humans++;else nations++;
      if(!friendly(p,me)){if(human)hostileHumans++;else hostileNations++;}
    }
    return {gameType:cfg.gameType??null,gameMode:cfg.gameMode??null,
      difficulty:cfg.difficulty??null,multiplayer:multiplayerMatch(game),
      rankedType:cfg.rankedType??null,ranked2v2:cfg.rankedType==='2v2'&&
        cfg.gameMode==='Team',humans,nations,hostileHumans,hostileNations,
      team:winStatus.mode==='Team'};
  }
  // Allow every known playable OpenFront game type without a second opt-in.
  // Fail closed for unknown modes and recorded replays.
  const permittedMatch = g => {
    try{return !!g && !g.config().isReplay?.() &&
      ['Singleplayer','Public','Private'].includes(gameType(g));}
    catch(_){return false;}
  };
  const conflicts = () => !!(window.__ofSoloAggroBot1110 || window.__ofSoloAggroBot11010 || window.__ofSoloAggroBot1109 || window.__ofSoloAggroBot1108 || window.__ofSoloAggroBot1 || window.__ofSoloAggroBot11 || window.__ofSoloAggroBot12 || window.__ofSoloAggroBot13 || window.__ofSoloAggroBot14 || window.__ofSoloAggroBot15 || window.__ofSoloAggroBot16 || window.__ofSoloAggroBot17 || window.__ofSoloAggroBot18 || window.__ofSoloAggroBot181 || window.__ofSoloAggroBot190 || window.__ofSoloAggroBot191 || window.__ofSoloAggroBot192 || window.__ofSoloAggroBot193 || window.__ofSoloAggroBot194 || window.__ofSoloAggroBot195 || window.__ofSoloAggroBot196 || window.__ofSoloAggroBot197 || window.__ofSoloAggroBot198 || window.__ofSoloAggroBot199 || window.__ofSoloAggroBot1100 || window.__ofSoloAggroBot1101 || window.__ofSoloAggroBot1102 || window.__ofSoloAggroBot1103 || window.__ofSoloAggroBot1104 || window.__ofSoloAggroBot1105 || window.__ofSoloAggroBot1106 || window.__ofSoloAggroBot1107);
  function advisorConflict() {
    if (!window.__openfrontSpawnAdvisorV104) return false;
    try {const s=JSON.parse(localStorage.getItem('openfront-spawn-advisor-10.4')||'{}');
      return s.auto!==false || s.smart===true || s.accept===true;
    } catch (_) {return true;}
  }
  const connected = () => permittedMatch(game) && !game?.gameOver?.() && !conflicts() && !advisorConflict() && bus && typeof bus.emit==='function';
  const myPlayer = () => {try{return game?.myPlayer?.() || null;}catch(_){return null;}};
  const live = serial => serial===generation && opts.enabled && connected();
  function discover() {
    const tags=['spawn-timer','build-menu','control-panel','unit-display','game-left-sidebar','game-right-sidebar'];
    for(const tag of tags) {
      const element=document.querySelector(tag), g=element?.game;
      if(!g || typeof g.playerViews!=='function' || typeof g.terrainByte!=='function' ||
         typeof g.ref!=='function' || typeof g.config!=='function') continue;
      let b=element.eventBus;
      if(!b) for(const otherTag of tags) {
        const other=document.querySelector(otherTag);
        if(other?.game===g && other.eventBus){b=other.eventBus;break;}
      }
      return {g,b:b||null};
    }
    return null;
  }
  // We only inspect event constructors; no test event is emitted into the game.
  function recognize(b) {
    const result={};
    // EventBus may come from another JS realm; instanceof Map is unreliable
    // for Tampermonkey / VM-wrapped constructors. Inspect its interface instead.
    if(!b?.listeners || typeof b.listeners.keys!=='function')return result;
    const names={spawn:'SendSpawnIntentEvent',attack:'SendAttackIntentEvent',cancel:'CancelAttackIntentEvent',
      boat:'SendBoatAttackIntentEvent',build:'BuildUnitIntentEvent',
      upgrade:'SendUpgradeStructureIntentEvent',
      alliance:'SendAllianceRequestIntentEvent',reject:'SendAllianceRejectIntentEvent',
      embargo:'SendEmbargoIntentEvent',embargoAll:'SendEmbargoAllIntentEvent',
      warship:'MoveWarshipIntentEvent',cancelBoat:'CancelBoatIntentEvent',
      donateTroops:'SendDonateTroopsIntentEvent',donateGold:'SendDonateGoldIntentEvent',
      extend:'SendAllianceExtensionIntentEvent',winnerSignal:'SendWinnerEvent'};
    const possibilities=Object.fromEntries(Object.keys(names).map(k=>[k,[]]));
    for(const C of b.listeners.keys()) {
      if(typeof C!=='function') continue;
      for(const [key,n] of Object.entries(names)) if(C.name===n) result[key]=C;
      try {const o=new C(4812);if(o?.tile===4812 && Object.keys(o).length===1) possibilities.spawn.push(C);}catch(_){}
      try {const o=new C('__BOT_PROBE__',4812);if(o?.targetID==='__BOT_PROBE__' && o?.troops===4812) possibilities.attack.push(C);}catch(_){}
      try {const o=new C('__BOT_CANCEL__');if(o?.attackID==='__BOT_CANCEL__' && Object.keys(o).length===1)possibilities.cancel.push(C);}catch(_){}
      try {const o=new C(4812,1824);if(o?.dst===4812 && o?.troops===1824) possibilities.boat.push(C);}catch(_){}
      try {const o=new C('City',4812);if(o?.unit==='City' && o?.tile===4812) possibilities.build.push(C);}catch(_){}
      try {const o=new C(4812,'City',1);if(o?.unitId===4812 && o?.unitType==='City') possibilities.upgrade.push(C);}catch(_){}
      const probeA={id(){return '__OF_BOT_A__';}},probeB={id(){return '__OF_BOT_B__';}};
      try {const o=new C(probeA,probeB);if(o?.requestor===probeA && o?.recipient===probeB &&
        Object.keys(o).length===2)possibilities.alliance.push(C);}catch(_){}
      try {const o=new C(probeA);if(o?.requestor===probeA && Object.keys(o).length===1)
        possibilities.reject.push(C);}catch(_){}
      try {const o=new C(probeB,'start');if(o?.target===probeB&&
        o?.action==='start')possibilities.embargo.push(C);}catch(_){}
      try {const o=new C('start');if(o?.action==='start'&&
        Object.keys(o).length===1)possibilities.embargoAll.push(C);}catch(_){}
      try {const o=new C([4812],1824);if(o?.tile===1824&&o?.unitIds?.[0]===4812)
        possibilities.warship.push(C);}catch(_){}
      try {const o=new C(4812);if(o?.unitID===4812&&Object.keys(o).length===1)
        possibilities.cancelBoat.push(C);}catch(_){}
      try {const o=new C(probeA,4812);if(o?.recipient===probeA&&o?.troops===4812)
        possibilities.donateTroops.push(C);}catch(_){}
      try {const o=new C(probeA,4812n);if(o?.recipient===probeA&&o?.gold===4812n)
        possibilities.donateGold.push(C);}catch(_){}
      try {const o=new C(probeB);if(o?.recipient===probeB&&Object.keys(o).length===1)
        possibilities.extend.push(C);}catch(_){}
    }
    for(const k of Object.keys(possibilities)) if(!result[k] && possibilities[k].length===1)
      result[k]=possibilities[k][0];
    return result;
  }
  function bindWinnerCapture(nextBus,nextCtors=ctors){
    if(winnerBus&&winnerCtor&&winnerHandler&&typeof winnerBus.off==='function'){
      try{winnerBus.off(winnerCtor,winnerHandler);}catch(_){}
    }
    winnerBus=null;winnerCtor=null;winnerHandler=null;
    const C=nextCtors?.winnerSignal;
    if(!nextBus||typeof nextBus.on!=='function'||typeof C!=='function')return false;
    winnerHandler=event=>{
      if(!event||!Object.hasOwn(event,'winner'))return;
      lastWinnerSignal={winner:event.winner,allPlayersStats:event.allPlayersStats||{}};
      telemetry('winner_observed','Siegerereignis dauerhaft erfasst',
        {winnerType:Array.isArray(event.winner)?event.winner[0]:null});
    };
    try{nextBus.on(C,winnerHandler);winnerBus=nextBus;winnerCtor=C;return true;}
    catch(_){winnerHandler=null;return false;}
  }
  function allianceOfferPath(){
    if(typeof ctors.alliance==='function')return 'intent';
    // Official OpenFront PlayerPanel.handleAllianceClick emits the real
    // SendAllianceRequestIntentEvent through its own Transport EventBus.
    // Never synthesize an unknown/minified intent constructor.
    const panel=document.querySelector('player-panel');
    if(!panel)return null;
    return panel.g===game&&panel.eventBus===bus&&
      typeof panel.handleAllianceClick==='function'?
      'player-panel':null;
  }
  function intentHealth() {
    const alliancePath=allianceOfferPath();
    const missing=INTENT_KINDS.filter(kind=>
      typeof ctors[kind]!=='function'&&
      !(kind==='alliance'&&alliancePath==='player-panel'));
    return {found:INTENT_KINDS.length-missing.length,total:INTENT_KINDS.length,
      missing,critical:missing.filter(kind=>CORE_INTENTS.includes(kind)),
      eventBus:!!bus,alliancePath:alliancePath||'unavailable'};
  }
  // Report only when detection changes or the user explicitly starts.
  function reportIntents(force=false) {
    if(!bus)return intentHealth();
    const health=intentHealth(),signature=health.missing.join(',');
    if(force||signature!==lastIntentHealth){
      lastIntentHealth=signature;
      const message=health.found+'/'+health.total+' Intents erkannt'+
        (health.missing.length?' · fehlen: '+health.missing.join(', '):' · vollständig');
      if(health.missing.length)console.warn(PREFIX,'INTENT-WARNUNG: '+message);
      else console.info(PREFIX,message);
      if(opts.enabled){
        telemetry(health.missing.length?'intent_missing':'intent_ready',message,
          {intents:health});
        if(health.critical.length)log('ACHTUNG: Pflicht-Intents fehlen: '+health.critical.join(', '));
      }
    }
    return health;
  }
  let autoStartGame=null;
  function maybeAutoStart() {
    // One attempt per game object: manual pause and Not-Aus must not be undone
    // by the next 400-ms polling cycle. A new match clears this latch.
    if(benchmark || !opts.autoStart || opts.enabled || autoStartGame===game || !connected())return false;
    autoStartGame=game;
    opts.enabled=true;generation++;persist();
    status='Neue '+(multiplayerMatch(game)?'Multiplayer-':'Singleplayer-')+'Partie · Bot automatisch gestartet';
    log('BOT AUTO-START · '+gameType(game));
    reportIntents(true);
    return true;
  }
  function reset(g,b) {
    generation++; game=g;bus=b;ctors=recognize(b);busy=false;lastWinnerSignal=null;
    const matchId=String(g?.gameID?.()??'unknown'),playerId=safeID(myPlayer());
    let prior=null;try{prior=JSON.parse(
      sessionStorage.getItem('aggrobot-diagnostic-v2-meta')||'null');}catch(_){}
    const resumed=matchId!=='unknown'&&prior?.matchId===matchId&&
      (!prior.playerId||!playerId||prior.playerId===playerId)&&
      /^match-[a-z0-9-]+$/.test(prior.session||'');
    monitorSession=resumed?prior.session:'match-'+Date.now().toString(36)+'-'+
      Math.floor(Math.random()*0xffffffff).toString(36).padStart(8,'0');
    budgetCommitments=[];attackBlockReport=null;lastAttackBlockReport=-Infinity;
    lastOffenseDroughtReport=-Infinity;
    crisisTrend=null;lastCrisisReport=-Infinity;landingFailures.clear();
    neuralEvidence={calls:0,nonzero:0,actionCalls:0,actionNonzero:0,last:null};
    autoStartGame=null;
    bindWinnerCapture(bus,ctors);
    lastIntentHealth=null;lastIntentProbe=-Infinity;missingIntentLogged.clear();
    lastTick=-1;lastSpawn=-Infinity;lastEconomy=-Infinity;lastEconomyProbe=-Infinity;
    lastBoat=-Infinity;lastBorderTick=-Infinity;borderCache=null;borderPlayer=null;
    buildCursor=0;spawnCache=null;spawnJob=null;spawnRetryAt=0;spawnAlternatives=[];spawnState={scanned:0,phase:'idle',lastSent:null,attempts:0,blocked:null,deadline:null};cooldowns.clear();rejected.clear();
    plan=null;lastSelection='';lastEmission=0;borderOffset=0;lastBorderRefresh=0;
    totalSent=0;totalFailed=0;actions=[];errors=0;troopSamples=[];
    lastDecisionFrame=null;lastRecoveryReason='';lastBattle=null;pendingAttack=null;targetIntelCache.clear();frontMemory.clear();opponentHistory.clear();lastEconomyPosture='—';lastDirectorDecision=null;planningState={tick:-Infinity,candidates:[],selected:null,rejected:null,rejectedCandidates:[],durationMs:0,budgetMs:50,truncated:false,decisionId:null,matchId:'unknown',clientId:null,dataAge:{requestedTick:null,borderAgeTicks:null},missingMask:{borderStale:true,opponentTroopsUnknown:0,modelEnabled:false},provenance:{bot:VERSION,engineCommit:null,gameMode:'unknown'},modelChoice:null,modelScores:null,actualIntents:null,blockReasons:null,actionReceipt:null,observedEffects:null,outcomeStatus:'pending',resolved:false};investmentAssessments=[];neuralPolicyCache={key:null,output:null};lastFrontWarning=-Infinity;
    attackReceipts={confirmed:0,unconfirmed:0,territoryGained:0};blockedTargets.clear();
    attackCommands=[];attackCommandSequence=0;observedAttacks.clear();
    actionSequence=0;lastActionId=null;actionLedger=[];decisionFrames=[];
    diagnosticAutoExported=false;diagnosticLastPeerTick=-Infinity;
    diagnosticHelpSequence=0;diagnosticHelpId=null;diagnosticHelpSince=null;
    diagnosticLastReceivedHelp=null;diagnosticLastHelpAck=null;
    diagnosticHelpDeadline=null;diagnosticHelpExpired=false;
    diagnosticAid=null;diagnosticLastCommitmentSeen=null;
    diagnosticHelpClosing=null;diagnosticDecisionSequence=0;
    diagnosticDonationSeen.clear();
    donationCapture={polls:0,readable:0,candidates:0,matched:0,
      lastProbeTick:-Infinity,lastReceiptTick:null,lastProblem:null};
    diagnosticV2.critical=[];diagnosticV2.dropped=0;
    diagnosticV2.lastDuoStatus=null;diagnosticV2.lastDuoPeer=null;
    diagnosticV2.lastVerifiedPartnerId=null;
    diagnosticV2.lastDuoAt=null;
    failedEconomyProbes=0;successfulEconomyTick=-Infinity;warWaitSince=-Infinity;
    coreQuotes.clear();coreFunding=null;lastCoreFundingReport=-Infinity;
    lastEconomyProbeReport=null;neuralDecisionEvidence=null;economyBudgetEvidence=null;shadowDecisionEvidence=null;
    duoSiloBlockedUntil=-Infinity;
    lastEconomicAction=-Infinity;lastNeutralSend=-Infinity;lastEnemySend=-Infinity;lastHostilePressure=-Infinity;consecutiveIdle=0;
    economicPending=null;economicBlocked.clear();economicNegative.clear();economicStatus='Bauplanung bereit';economicLastPlan='—';
    samQuotedCost=0;portQuotedCost=0;samQuotedTick=-Infinity;portQuotedTick=-Infinity;
    samAffordableFailureSince=null;landingAudits=[];marineUnresolvedWatches=[];
    economyBusy=false;borderInflight=null;legalNegative.clear();runtime={borderMs:0,combatMs:0,economyMs:0,attackProbes:0,buildProbes:0};
    strategic={mode:'EXPAND',reason:'Startphase',buildStyle:'Ausgewogen',since:-Infinity,groups:[]};
    diplomacyHandled.clear();diplomacyPending.clear();diplomacyMissingLogged.clear();lastDiplomaticEmit=0;
    lastDiplomacyTick=-Infinity;lastProposalTick=-Infinity;diplomacyStatus='Noch keine Anfrage';
    diplomacyStats={accepted:0,rejected:0,offered:0};goldSamples=[];incomeStatus={train:null,trade:null,gold:null,observed:false};
    winStatus={mode:'FFA',progress:null,threshold:null,remaining:null,urgent:false};fleetStatus='Keine Marineaktivität';lastFleet=-Infinity;lastDonation=-Infinity;navalSweep=0;
    tradeStatus='Handel automatisch offen';lastTradeTick=-Infinity;tradeBusy=false;
    tradeStats={opened:0,embargoed:0,skipped:0};botEmbargoes.clear();tradeAssessments=[];
    pendingBoat=null;pendingWarship=null;navalCooldown.clear();navalBackoffUntil=-Infinity;portProbeFailures=0;lastPortRetryTick=-Infinity;navalSiteNegative.clear();
    marineStats={transportSent:0,transportConfirmed:0,transportArrived:0,bridgeheadHeld:0,
      bridgeheadHeld120:0,bridgeheadHeld600:0,bridgeheadLost:0,
      transportUnconfirmed:0,transportUnresolved:0,warshipSent:0,
      warshipConfirmed:0,warshipUnconfirmed:0};
    strategicTelemetry={favorableVictims:0,falloutSkipped:0,falloutFallback:0,afkTargets:0,assists:0,neutralLandings:0,forecastCount:0,engineForecasts:0,proxyForecasts:0,forecastComparisons:0,forecastUnavailable:0};
    nukeBusy=false;lastNuke=-Infinity;nukePending=null;nukeStatus='Warte auf Silo';nukeShots=0;nukeAttempts=0;nukeUnconfirmed=0;nuclearCache=null;nuclearCacheTick=-Infinity;
    learnMatch={sample:null,key:null,finished:false};
    opponentProfiles.clear();operation=null;operationCooldown.clear();duoPlan=null;victoryThreat=null;decisionTimeline=[];decisionKeys.clear();
    duoLocal.peer=null;duoLocal.match=null;duoLocal.status=opts.duoEnabled?'Neue Partie · verbinde':'AUS';
    duoLocal.lastPublished=0;duoLocal.lastAt=0;duoLocal.lastPromise=null;
    duoLocal.relayDrops=0;duoLocal.relayTimeouts=0;duoLocal.ackTimeouts=0;
    duoLocal.seenPeer=false;duoLocal.lastExpiredPlan=null;
    warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};diagnostics=[];recordSequence=resumed?Math.max(0,Math.floor(prior.seq||0)):0;recordCounts={};recordsDropped=0;recordsEvicted=0;streamErrors=0;lastDiagnosticTick=-Infinity;gameEnd=null;forecastAudits=[];lastForecastAudit=null;incomeAttribution=[];
    investmentStatus='Grundaufbau';lastWarReview=-Infinity;
    defenseStatus='Keine Bedrohung';lastEmergencyRetreat=-Infinity;lastDefenseLog=-Infinity;
    retreatRequests.clear();defenseStats={retreatsOrdered:0,retreatsObserved:0,unknown:0,unconfirmed:0};
    autoTuning={aggressive:85,reserve:35,actionsPerMinute:72,maxTargets:16,
      mode:'INIT',reason:'Warte auf Spielzustand',tick:-Infinity};
    // Start this new match as soon as EventBus becomes ready.
    opts.enabled=false;persist();
    status=gameType(g)==='Singleplayer'?'Singleplayer erkannt · '+(opts.autoStart?'Autostart wartet auf EventBus':'Bot bereit'):
      multiplayerMatch(g)?'Multiplayer erkannt · '+(opts.autoStart?'Autostart wartet auf EventBus':'Bot bereit'):
      'Replay/unbekannter Spieltyp · gesperrt';
    if(g?.config?.().isReplay?.())status='Replay · BOT GESPERRT';
    log(status);
    reportIntents();
  }
  // Never overwrite manually selected slider values. Auto settings are
  // recomputed from current troops, threats, strategy and worker latency.
  function setting(key){return opts.fullAuto?autoTuning[key]:opts[key];}
  // Hysteresis prevents oscillation and keeps worker/transport costs bounded.
  // Critical defense changes are immediate; ordinary strategy changes settle
  // for at least 45 ticks. These values never modify the user's manual sliders.
  function tuneAutonomously(me,items,s,tick,context) {
    if(!opts.fullAuto)return s;
    const late=lateGame(me),home=Math.max(1,s.home);
    // Rush the opening while neutral land remains and the home front is safe.
    // On the large World map the bot needs more time to establish territory
    // before Impossible AI reaches its frontier and forces it to defend.
    const opening=tick<(largeMap()?2400:1000) && items.some(g=>g.id===null&&!g.fallout) &&
      s.incoming<home*.025 && s.strongest<home*.85 && s.ratio>=.27 &&
      (!opts.impossibleExperiment || (!recentHostilePressure(tick) &&
        !(armyTrend(tick)?.tiles< -80) &&
        (!hardMode() || !frontPressureForecast(me,items,tick).pressured)));
    const invasion=s.incoming/home,neighbor=s.strongest/home;
    const emergency=invasion>=.18 || (invasion>=.10 && context.rebuilding);
    let mode='BALANCED',reason='Ausgeglichene Spielphase';
    let v={aggressive:82,reserve:35,actionsPerMinute:76,maxTargets:15};
    if(emergency || (context.wanted==='DEFEND'&&s.incoming>0)){
      mode='DEFEND';reason='Eingehender Angriff – Heimtruppen sichern';
      v={aggressive:60,reserve:63,actionsPerMinute:88,maxTargets:9};
    } else if(context.wanted==='RECOVER'||s.ratio<.23){
      mode='RECOVER';reason='Truppen regenerieren und Bauaktionen zulassen';
      v={aggressive:64,reserve:49,actionsPerMinute:65,maxTargets:10};
    } else if(context.wanted==='ASSAULT'&&!s.incoming){
      mode='ASSAULT';reason='Konzentrierte Offensive mit überprüfter Heimreserve';
      v={aggressive:late?98:92,reserve:late?23:29,actionsPerMinute:late?98:87,maxTargets:late?22:19};
    } else if(context.wanted==='TECH'||context.wanted==='ECONOMY'){
      mode=context.wanted;reason='Wirtschaft und strategische Technik finanzieren';
      v={aggressive:73,reserve:40,actionsPerMinute:72,maxTargets:13};
    } else if(context.wanted==='EXPAND'){
      mode='EXPAND';reason='Neutrales Land effizient erobern';
      v={aggressive:late?87:82,reserve:late?29:33,actionsPerMinute:late?88:78,maxTargets:late?18:15};
    } else if(late&&s.ratio>.74&&!s.incoming){
      mode='LATE';reason='Große Truppenreserve – Chancen häufiger prüfen';
      v={aggressive:93,reserve:27,actionsPerMinute:91,maxTargets:20};
    }
    if(opening && !emergency && !['DEFEND','RECOVER'].includes(mode)){
      mode='OPENING';reason='Frühe Landnahme: schneller expandieren, Reserve dynamisch schützen';
      v={aggressive:100,reserve:22,actionsPerMinute:105,maxTargets:23};
    }
    if(!emergency && s.incoming>0){
      v.reserve+=Math.min(13,Math.ceil(invasion*35));
      v.aggressive-=9;
    }
    if(!emergency && neighbor>1 && (mode==='ASSAULT'||mode==='EXPAND')){
      v.reserve+=Math.min(13,Math.ceil((neighbor-1)*14));
    }
    // More worker probes only help when workers respond promptly. Do not
    // compensate for a slow worker by flooding it with even more requests.
    if(runtime.combatMs>1100||runtime.borderMs>850){
      v.maxTargets-=5;v.actionsPerMinute-=12;
      reason+=' · Worker entlasten';
    } else if(runtime.combatMs>650){
      v.maxTargets-=3;v.actionsPerMinute-=6;
    }
    if(runtime.economyMs>1600)v.actionsPerMinute-=6;
    const unlearned={...v};
    v=learnAdjust(v,mode,s,emergency);
    const learnedChoice={...v};
    v=neuralAdjust(v,unlearned,me,s,items,emergency);
    const neuralChoice={...v};
    if(!emergency){const policy=neuralStrategicSignals(me,s,tick);
      if(policy){v.aggressive+=Math.round(policy.aggression*12);
        v.reserve+=Math.round(policy.reserve*10);}}

    v.aggressive=clamp(v.aggressive,40,100);
    v.reserve=clamp(v.reserve,18,65);
    v.actionsPerMinute=clamp(v.actionsPerMinute,45,110);
    v.maxTargets=clamp(v.maxTargets,6,24);
    const changed=mode!==autoTuning.mode || ['aggressive','reserve','actionsPerMinute','maxTargets']
      .some(k=>autoTuning[k]!==v[k]);
    if(!changed)return s;
    if(!emergency && tick-autoTuning.tick<45 &&
      !(mode==='ASSAULT'&&duoPlan?.strikeStatus==='locked-launch-window'&&
        s.incoming===0&&!recentHostilePressure(tick)))return s;
    autoTuning={...v,mode,reason,tick};
    if(opts.neuralEnabled)telemetry('neural_strategy_choice',
      'Regel-, Lern- und Modellvorschlag gegenüber finaler Einstellung',{
        decisionId:monitorSession+':t'+tick,model:neuralModelInfo(),
        mode,ruleChoice:unlearned,learnedChoice,modelChoice:neuralChoice,
        finalChoice:{...v},effect:'unknown',
        evidence:'policy-comparison-not-game-outcome'});
    if(mode!=='DEFEND'||tick-lastDefenseLog>=75){
      telemetry('auto_tuning','Autonome Parameter: '+mode,{...v,reason});
      if(mode==='DEFEND')lastDefenseLog=tick;
    }
    return military(me,items);
  }
  function actionBudget(channel='general') {
    const now=Date.now();actions=actions.filter(t=>now-t<60000);
    const cap=clamp(setting('actionsPerMinute'),15,120);
    // Combat may not consume the entire action window: leave room for
    // economic reinvestment, missiles and diplomacy.
    const reserve=channel==='combat'?Math.max(3,Math.ceil(cap*.16)):0;
    return actions.length<cap-reserve;
  }
  function send(kind,args,description,priority=false) {
    if(!opts.enabled || !connected())return false;
    if(!ctors[kind]){
      if(!missingIntentLogged.has(kind)){
        missingIntentLogged.add(kind);
        const message='Intent '+kind+' nicht erkannt – '+(CORE_INTENTS.includes(kind)?'Kernfunktion ausgefallen':'Funktion derzeit nicht verfügbar');
        console.warn(PREFIX,message);
        log('WARNUNG: '+message);
        telemetry('intent_send_blocked',message,{intent:kind,intents:intentHealth()});
      }
      return false;
    }
    if(!priority && !actionBudget(['attack','boat'].includes(kind)?'combat':'general'))return false;
    // The bot can make multiple decisions per cycle. Keep an independent
    // burst limiter so it never floods the game transport even at 60/min.
    if(!priority && Date.now()-lastEmission < 410)return false;
    // A final fail-closed check: do not emit if we switched to MP or replay.
    if(!permittedMatch(game))return false;
    try {
      const beforeIds=kind==='attack'?(myPlayer()?.outgoingAttacks?.()||[]).map(a=>a.id):[];
      const event=new ctors[kind](...args);
      bus.emit(event);actions.push(Date.now());lastEmission=Date.now();totalSent++;
      const actionId=monitorSession+':a'+(++actionSequence);
      lastActionId=actionId;
      const decisionId=monitorSession+':t'+number(()=>game.ticks(),0);
      if(kind==='attack'){
        const command={commandId:++attackCommandSequence,actionId,decisionId,
          tick:number(()=>game.ticks()),
          target:attackTargetID(args[0]),amount:Number(args[1]),beforeIds,matchedStack:null};
        attackCommands.push(command);
        if(attackCommands.length>80)attackCommands.shift();
        telemetry('attack_command',description,{...command});
      }
      log(description);telemetry('action',description,
        {intent:kind,actionId,decisionId,emission:'event-bus',
          requestedTroops:['attack','boat','donateTroops'].includes(kind)?
            Number(args[1]):null,quotedCost:null,
          effect:'unknown'});return true;
    } catch(e) {totalFailed++;log('Event fehlgeschlagen: '+String(e.message));return false;}
  }
  function valid(x,y) {return x>=0&&y>=0&&x<game.width()&&y<game.height();}
  // Duo Relay only exchanges observations. The real GameView remains
  // authoritative for an established alliance/team relation.
  function actualFriendly(p,me){
    // Keep the non-Duo path byte-for-byte equivalent in meaning to the
    // pre-1.20 friendship test; Duo-specific protection is layered below.
    try{return p?.id?.()===me.id()||p.isFriendly?.(me)||me.isFriendly?.(p);}
    catch(_){return false;}
  }
  const duoID=v=>typeof v==='string'&&v.length>=1&&v.length<=128&&
    /^[a-zA-Z0-9_.:@-]+$/.test(v);
  // The old manually saved PlayerID is intentionally ignored: IDs change
  // each match. The relay discovers the current one for this room.
  function duoConfigured(){
    const own=safeID(myPlayer());
    return opts.duoEnabled&&
      /^[a-zA-Z0-9_-]{6,64}$/.test(opts.duoRoom||'')&&duoID(own);
  }
  function duoPartnerID(){
    return duoTrustedPeer()?.id??null;
  }
  function duoMatchKey(){
    const cfg=game?.config?.().gameConfig?.()||{},loc=window.location||{};
    const seed=cfg.seed??cfg.gameID??cfg.gameId??'unknown';
    return ['v2',cfg.gameType??'unknown',cfg.gameMap??'unknown',
      cfg.gameMapSize??'unknown',cfg.gameMode??'unknown',seed,
      loc.pathname||'/'].join('|')
      .replace(/[^a-zA-Z0-9_.:@|,-]/g,'_').slice(0,260);
  }
  // Presentation only: never use these labels as plan authorization.
  /* __DUO_STATUS_VIEW__ */
