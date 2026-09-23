#!/usr/bin/env node
'use strict';
// P4 Curriculum-Runner (plan.md P4.1–P4.6):
// Gefrorene, gestufte Liga von Mechanik/Niedrig-Gegner über 1v1, spezialisierte
// Öko-/Marine-/Nuke-Szenarien, FFA und 2v2 bis zu einer gemischten
// FROZENEN Gegnerliga. Der zu trainierende Modell-Teilnehmer (Solo-AggroBot)
// spielt gegen einen FROZENEN Gegner-Mix aus dem Legacy-/Champion-Bots
// (Run3-Champion + mehrere ältere Archetyp-Stile) — NICHT ausschließlich das
// neueste eigene Modell (vermeidet Overfitting/Collapse).
//
// Jede Stufe speichert ihre eigene Modell-/Engine-/Gegner-/Datensatz-Version
// (SHA + Seed-Menge) und ist nach Fehlern fortsetzbar (Resume): bereits
// protokollierte Matches werden übersprungen.
//
// Plan-Modus (Default) erzeugt nur curriculum.json — es wird NICHTS gespielt.
// --execute führt die ausstehenden Matches über engine-multibot.mjs aus und
// wendet pro Match den P4 Collapse-Wächter + Promotions-Trennung an.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const common=require('./common.cjs');
const {watch,assessPromotion}=require('../../trainer/collapse-watch.cjs');

const ROOT=path.resolve(__dirname,'..','..');
// Gefrorene Stufen: Mechanik → 1v1 → Öko/Marine/Nuke → FFA → 2v2 → gemischte
// FROZEN-E-Liga. Gegner-Stile sind bewusst VIELFÄLTIG und nicht nur das
// neueste eigene Modell (Champion + Legacy + ältere Archetypen).
const STAGES=Object.freeze([
 {name:'mechanics-low-opponent',mode:'FFA',participants:2,difficulty:'Easy',
  opponents:['legacy'],seeds:['p4-mech-001'],
  desc:'Mechanik gegen niedrigen Gegner (Legacy, einfach)'},
 {name:'one-v-one',mode:'FFA',participants:2,difficulty:'Medium',
  opponents:['champion'],seeds:['p4-1v1-001'],
  desc:'1v1 gegen den gefrorenen Champion'},
 {name:'economy-naval-nuke',mode:'FFA',participants:2,difficulty:'Medium',
  opponents:['economy','naval','nuke'],seeds:['p4-spec-001'],
  desc:'Spezialisierte Szenarien: Öko-, Marine- und Nuke-Stile'},
 {name:'ffa',mode:'FFA',participants:2,difficulty:'Medium',
  opponents:['rush','turtle','legacy'],seeds:['p4-ffa-001'],
  desc:'FFA gegen gemischte FFA-Stile'},
 {name:'two-v-two',mode:'Team',participants:4,difficulty:'Medium',
  opponents:['rush','turtle'],seeds:['p4-2v2-001'],
  desc:'2v2 (Team) gegen zwei Rush- oder zwei Turtle-Gegner'},
 {name:'mixed-frozen-league',mode:'FFA',participants:2,difficulty:'Hard',
  opponents:['champion','economy','naval','nuke'],
  seeds:['p4-lga-001','p4-lga-002'],
  desc:'Gemischte FROZEN-E-Liga mit unbekannten Stil/Seed-Kombinationen'}]);
const DEFAULT_TICKS=6000;
const SMOKE_TICKS=1200;
// --smoke: kleine, aber mehrstufige Menge mit UNTERSCHIEDLICHEN Gegnerstilen
// (DoD: keine "einfache" Liga). Mechanik(Legacy) + Öko/Marine-Spezialisten.
const SMOKE_STAGES=Object.freeze([
 {name:'mechanics-low-opponent',mode:'FFA',participants:2,difficulty:'Easy',
  opponents:['legacy'],seeds:['p4-mech-001']},
 {name:'economy-naval-nuke',mode:'FFA',participants:2,difficulty:'Medium',
  opponents:['economy','naval'],seeds:['p4-spec-001']}]);

const values={engine:null,engineCommit:common.ENGINE_COMMIT,
  bot:'OpenFront_Solo_AggroBot.user.js',
  opponentBot:'OpenFront_AggroBot_Impossible_Run3.user.js',
  out:'benchmark-results/curriculum',
  execute:false,smoke:false,fresh:false,stage:null,ticks:String(DEFAULT_TICKS)};
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  const key=args[i].replace(/^--/,'');
  if(!args[i].startsWith('--')||
   !Object.hasOwn(values,key)&&!['execute','smoke','fresh'].includes(key))
   throw Error('Unknown curriculum option: '+args[i]);
  if(['execute','smoke','fresh'].includes(key)){values[key]=true;continue;}
  if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+key);
  values[key]=args[++i];
}
if(values.stage!==null&&!STAGES.some(s=>s.name===values.stage))
  throw Error('Unknown --stage: '+values.stage);
const stages=(values.smoke?SMOKE_STAGES:STAGES)
  .filter(s=>!values.stage||s.name===values.stage)
  .map(s=>({...s,ticks:values.smoke?SMOKE_TICKS:Number(values.ticks)}));
const engineCommit=/^[a-f0-9]{40}$/.test(values.engineCommit)
  ?values.engineCommit:common.ENGINE_COMMIT;
const engine=values.engine?path.resolve(values.engine):null;
if(values.execute&&!engine)
  throw Error('--execute requires --engine /path/to/official/OpenFrontIO');
const modelFile=path.resolve(values.bot),
 opponentFile=path.resolve(values.opponentBot),
 out=path.resolve(values.out);
const modelHash=crypto.createHash('sha256').update(fs.readFileSync(modelFile)).digest('hex');
const opponentHash=crypto.createHash('sha256').update(fs.readFileSync(opponentFile)).digest('hex');
// FROZEN-ER Gegner-Mix: Champion-Bot + alle in den Stufen genutzten Archetypen.
const mixArchetypes=[...new Set(stages.flatMap(s=>s.opponents))].sort();
const mixVersion=common.digest(JSON.stringify({opponent:opponentHash,
  archetypes:mixArchetypes,stageDefs:stages.map(s=>s.name)}));
let engineVerified=false;
const engineSha=engine?common.engineInfo(engine,values.engineCommit):values.engineCommit;
if(engine)engineVerified=true;

// Alle Matches aus den Stufen ableiten (Seed × Gegner-Stil).
function buildMatches(){
  const matches=[];
  for(const stage of stages)for(const seed of stage.seeds)
   for(const arch of stage.opponents){
     const id=[stage.name,seed,arch].join('__');
     const match={id,stage:stage.name,seed,opponentArchetype:arch,
       mode:stage.mode,participants:stage.participants,
       difficulty:stage.difficulty,ticks:stage.ticks,
       relativeOutput:path.join(stage.name,id),
       status:'not-run',termination:null,outcome:null,
       collapse:null,promotion:null,error:null};
     match.expectedLineup=lineupFor(match).map(p=>({
       teamIndex:p.teamIndex,archetype:p.archetype,
       botSHA256:p.bot===modelFile?modelHash:opponentHash}));
     matches.push(match);
   }
  return matches;
}
function lineupFor(match){
  const model={bot:modelFile,profile:'autonomous',archetype:'legacy'};
  const opp={bot:opponentFile,profile:'autonomous',archetype:match.opponentArchetype};
  if(match.mode==='Team'){
    // Two distinctly labelled matches must execute distinctly different
    // opponent lineups; never run rush+turtle under both labels.
    return [
     {...model,teamIndex:0},
     {...model,archetype:'legacy',teamIndex:0},
     {...opp,archetype:match.opponentArchetype,teamIndex:1},
     {...opp,archetype:match.opponentArchetype,teamIndex:1}];
  }
  return [{...model,teamIndex:0},{...opp,teamIndex:1}];
}
function clearDir(dir){
  for(const entry of fs.readdirSync(dir)){
    const full=path.join(dir,entry);
    fs.rmSync(full,{recursive:true,force:true});
  }
}
function isRecorded(dir){
  const file=path.join(dir,'match.json');
  if(!fs.existsSync(file))return false;
  try{const g=JSON.parse(fs.readFileSync(file,'utf8'));
    return g?.recording?.complete===true&&g.fullBots?.length>0;
  }catch{return false;}
}

// State-Datei (Resume): curriculum.json.
const outputFile=path.join(out,'curriculum.json');
if(values.fresh&&fs.existsSync(out)){
  // A fresh invocation must never silently reuse prior match.json artifacts.
  fs.rmSync(out,{recursive:true,force:true});
}
const runDefinition={schema:'curriculum-v1',smoke:values.smoke,
  stageVersion:common.digest(JSON.stringify(stages)),
  stages,modelHash,opponentHash,mixVersion,engineCommit:engineSha,
  map:'World',size:'Compact',gameType:'Private',
  profile:'autonomous',bot:values.bot,opponentBot:values.opponentBot};
const runSignature=common.digest(JSON.stringify(runDefinition));
let report=null;
if(fs.existsSync(outputFile)&&!values.fresh){
  report=JSON.parse(fs.readFileSync(outputFile,'utf8'));
  if(report?.runSignature!==runSignature||
     JSON.stringify(report?.runDefinition)!==JSON.stringify(runDefinition))
    throw Error('Curriculum resume provenance mismatch; use --fresh or a new --out directory');
}
if(!report){
  report={schema:'curriculum-v1',smoke:values.smoke,
    runSignature,runDefinition,
    stageVersion:common.digest(JSON.stringify(stages)),
    model:{file:values.bot,sha256:modelHash},
    opponent:{file:values.opponentBot,sha256:opponentHash,
      mixVersion,mixArchetypes,
      note:'FROZEN-ER Gegner-Mix: Legacy/Champion-Bot + mehrere ältere Archetyp-Stile; nicht nur das neueste eigene Modell'},
    engineCommit:engineSha,engineVerified,
    map:'World',size:'Compact',
    startedAt:new Date().toISOString(),updatedAt:null,
    stages:stages.map(({name,mode,participants,difficulty,ticks,opponents,seeds,desc})=>
     ({name,mode,participants,difficulty,ticks,opponents,seeds,desc})),
    matches:buildMatches()};
}
// Resume: Status bereits gespeicherter Matches (recorded/failed) wird nach id
// erhalten; neue Matches (z.B. erweiterte Stufen) werden ergänzt.
const oldById=new Map((report.matches||[]).map(m=>[m.id,m]));
report.matches=buildMatches().map(m=>{
  const o=oldById.get(m.id);
  return o?{...m,status:o.status,termination:o.termination,
    outcome:o.outcome,collapse:o.collapse,promotion:o.promotion,
    error:o.error}:m;
});
fs.mkdirSync(out,{recursive:true});
const save=()=>{report.updatedAt=new Date().toISOString();
  common.writeJSON(outputFile,report);};
save();
if(!values.execute){
  console.log(JSON.stringify({plan:outputFile,matches:report.matches.length,
    stages:report.stages.length,engineVerified,
    mixVersion,execute:'pass --execute to run; no games were played'}));
  process.exit(0);
}

// EXECUTE: ausstehende Matches fortsetzen.
const pending=report.matches.filter(m=>m.status!=='recorded');
for(const match of pending){
  const dir=path.join(out,match.relativeOutput);
  fs.mkdirSync(dir,{recursive:true});
  let game=null,result=null,reused=false;
  if(isRecorded(dir)){
    // Vollständiges altes Ergebnis (Resume): neu auswerten, nicht neu spielen.
    reused=true;
    game=JSON.parse(fs.readFileSync(path.join(dir,'match.json'),'utf8'));
  }else{
    clearDir(dir);
    const lineupFile=path.join(dir,'lineup.json');
    fs.writeFileSync(lineupFile,JSON.stringify(lineupFor(match),null,2)+'\n');
    const command=path.join(__dirname,'engine-multibot.mjs');
    const argv=['--engine',engine,'--engineCommit',engineSha,
      '--gameType','Private','--gameMode',match.mode,
      '--bots','0','--nations','0','--scriptedHumans','0',
      '--profile','autonomous','--out',dir,'--seed',match.seed,
      '--ticks',String(match.ticks),'--map','World','--size','Compact',
      '--difficulty',match.difficulty,'--lineup',lineupFile];
    result=spawnSync(process.execPath,
      [command,...argv],{encoding:'utf8',
       timeout:match.ticks<=2000?240000:7200000,maxBuffer:8*1024*1024});
    const file=path.join(dir,'match.json');
    game=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  }
  const fullBots=game?.fullBots||[];
  const hashesValid=fullBots.length===match.participants&&
    fullBots.every((p,i)=>{
      const expected=match.expectedLineup[i];
      return p.botSHA256===expected.botSHA256&&
        p.teamIndex===expected.teamIndex&&
        p.archetype===expected.archetype;
    });
  const originValid=game?.benchmarkMeta?.engineCommit===engineSha&&
    game?.benchmarkMeta?.seed===match.seed;
  const modelBot=fullBots[0]??{};
  const subprocessOk=result==null||
    (result.status===0&&!result.error);
  const ok=subprocessOk&&game&&hashesValid&&
    originValid&&game.recording?.complete===true&&
    game.run?.failure==null&&game.run?.spawned===true;
  if(ok){
    const collapse=watch(game,{focus:0});
    const promo=assessPromotion(game,modelBot,0);
    match.status='recorded';
    match.termination=game.run?.termination??null;
    match.outcome=game.gameEnd?.outcome??'unknown';
    match.collapse=collapse.flaggedCategories;
    match.promotion=promo;
    match.error=null;
    common.writeJSON(path.join(dir,'curriculum-result.json'),
     {schema:'curriculum-result-v1',matchId:match.id,stage:match.stage,
       collapse,promotion:promo,
       expectedLineup:match.expectedLineup,
       participants:fullBots.map(b=>({id:b.clientID,
         archetype:b.archetype,teamIndex:b.teamIndex,
         outcome:b.outcome,land:b.land,alive:b.alive}))});
  }else{
    match.status='failed';
    match.termination=game?.run?.termination??'unknown';
    match.outcome=game?.gameEnd?.outcome??'unknown';
    match.error=result?.error?.message??
      (result?
        (result.status===0?null:
         (result.stderr||'Curriculum subprocess failed').slice(-2500)):
        'reused run failed content checks');
  }
  save();
  console.error('CURRICULUM_MATCH '+JSON.stringify({id:match.id,
    status:match.status,outcome:match.outcome,
    collapse:match.collapse,error:match.error}));
  if(match.status==='failed'){
    console.error('CURRICULUM_MATCH_FAILED '+JSON.stringify({id:match.id,
      error:match.error,exitStatus:result?.status??null,
      stdout:String(result?.stdout||'').slice(-1800),
      stderr:String(result?.stderr||'').slice(-3500)}));
    process.exitCode=1;
    break;
  }
}
report.completedAt=new Date().toISOString();save();
const recorded=report.matches.filter(m=>m.status==='recorded');
const flaggedMatches=recorded.filter(m=>(m.collapse||[]).length>0);
console.log(JSON.stringify({report:outputFile,
  recorded:recorded.length,total:report.matches.length,
  matchesWithCollapseFlags:flaggedMatches.length,
  distinctOpponentStyles:report.opponent.mixArchetypes,
  notice:'Full-bot Curriculum nur mit --execute; fehlende Matches bleiben not-run/unknown'}));
