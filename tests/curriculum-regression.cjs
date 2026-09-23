'use strict';
// P4 Regression: Curriculum-Runner erzeugt einen deterministischen Plan mit
// gefrorener, VIELFÄLTIGER Gegnerliga (Legacy/Champion + mehrere ältere
// Archetyp-Stile — nicht nur das neueste eigene Modell), pro-Stufen-
// Versions-Pinning (Modell/Engine/Gegner/Datensatz) und Resume-Verhalten.
// Plan-Modus spielt NICHTS (keine Engine nötig); --execute ist opt-in.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const CURRICULUM=path.join(ROOT,'tools','benchmark','curriculum.cjs');
const baseOut=path.join(os.tmpdir(),'p4-curriculum-base-'+process.pid);
const smokeOut=path.join(os.tmpdir(),'p4-curriculum-smoke-'+process.pid);
const stageOut=path.join(os.tmpdir(),'p4-curriculum-stage-'+process.pid);
function run(args,out,extra={}){
  const r=spawnSync(process.execPath,[CURRICULUM,...args,'--out',out],
    {encoding:'utf8',...extra});
  return r;
}
function lastJSON(stdout){
  const lines=String(stdout||'').trim().split('\n');
  for(let i=lines.length-1;i>=0;i--){
    const l=lines[i].trim();
    if(l.startsWith('{')){try{return JSON.parse(l);}catch{}}
  }
  throw Error('No JSON summary in stdout: '+stdout);
}
function report(out){return JSON.parse(fs.readFileSync(
  path.join(out,'curriculum.json'),'utf8'));}
const base=()=>report(baseOut);
try{
  // 1) Plan-Modus: 6 Stufen, 18 Matches, keine Engine, nichts gespielt.
  const r=run([],baseOut);
  assert.equal(r.status,0,'plan exit 0: '+(r.stderr||''));
  const summary=lastJSON(r.stdout);
  assert.equal(summary.matches,18,'18 planned matches');
  assert.equal(summary.stages,6,'6 stages');
  assert.equal(summary.engineVerified,false,'no engine in plan mode');
  const rep=base();
  assert.equal(rep.schema,'curriculum-v1');
  assert.ok(rep.opponent.mixArchetypes.length>=2,
    'frozen opponent mix has >=2 styles');
  for(const a of ['legacy','champion','economy','naval','nuke','rush','turtle'])
    assert.ok(rep.opponent.mixArchetypes.includes(a),
      'mix includes '+a);
  // Modell != Gegner (Modell ist nicht ausschließlich das eigene neueste Modell)
  assert.notEqual(rep.model.sha256,rep.opponent.sha256,
    'model bot differs from frozen champion opponent');
  // Pro-Stufe Versions-Pinning.
  assert.equal(rep.engineCommit.length,40,'engine SHA pinned');
  assert.ok(rep.stageVersion&&rep.opponent.mixVersion,
    'stage + opponent mix versions pinned');
  for(const s of rep.stages)
    assert.ok(Array.isArray(s.seeds)&&s.seeds.length>0
      &&Array.isArray(s.opponents)&&s.opponents.length>0,
      'stage has seeds + opponents');
  // Alle Matches not-run im Plan.
  assert.ok(rep.matches.every(m=>m.status==='not-run'));
  // Deterministisch: gleiche id-Menge.
  const ids=rep.matches.map(m=>m.id).sort();
  assert.equal(new Set(ids).size,ids.length,'unique match ids');

  // 2) Idempotente Replanung: gleicher Zustand, keine Duplikate.
  const r2=run([],baseOut);
  assert.equal(r2.status,0);
  const rep2=base();
  assert.equal(rep2.matches.length,18,'no duplicate matches on re-plan');
  assert.deepEqual(rep2.matches.map(m=>m.id).sort(),ids,'same match set');

  // 3) --stage filtert auf eine Stufe.
  const r3=run(['--stage','one-v-one'],stageOut);
  assert.equal(r3.status,0);
  const rep3=report(stageOut);
  assert.ok(rep3.matches.every(m=>m.stage==='one-v-one'),
    'only one-v-one matches');
  assert.equal(rep3.matches.length,1,'one-v-one has 1 opponent x 1 seed');

  // 4) --smoke: reduzierte, aber mehrstufige Menge mit unterschiedlichen
  //    Gegnerstilen (DoD: keine einzelne leichte Liga).
  const r4=run(['--smoke'],smokeOut);
  assert.equal(r4.status,0);
  const rep4=report(smokeOut);
  assert.ok(rep4.smoke===true,'smoke mode flagged');
  assert.ok(rep4.matches.length<18,'smoke is a reduced set');
  const smokeArch=rep4.matches.map(m=>m.opponentArchetype);
  assert.ok(new Set(smokeArch).size>=2,'smoke covers >=2 opponent styles');
  assert.ok(smokeArch.includes('legacy')&&
    (smokeArch.includes('economy')||smokeArch.includes('naval')),
    'smoke mixes different styles');
  assert.ok(rep4.matches.every(m=>m.ticks<=1500),
    'smoke uses short ticks');

  // 5) Resume-State: ein bereits recorded Match bleibt recorded nach Replan.
  const cur=fs.readFileSync(path.join(baseOut,'curriculum.json'),'utf8');
  const pre=JSON.parse(cur);
  pre.matches[0].status='recorded';
  pre.matches[0].outcome='victory';
  fs.writeFileSync(path.join(baseOut,'curriculum.json'),
    JSON.stringify(pre,null,2)+'\n');
  const r5=run([],baseOut);
  assert.equal(r5.status,0);
  const rep5=base();
  const restored=rep5.matches.find(m=>m.id===pre.matches[0].id);
  assert.equal(restored.status,'recorded','recorded status preserved (resume)');
  assert.equal(restored.outcome,'victory','recorded outcome preserved');

  // #147: each 2v2 match label must bind to an actually distinct lineup.
  const teams=rep5.matches.filter(m=>m.stage==='two-v-two');
  assert.equal(teams.length,2);
  assert.notDeepEqual(teams[0].expectedLineup,teams[1].expectedLineup,
    'rush and turtle matches must not silently run identical teams');
  for(const m of teams){
    assert.equal(m.expectedLineup.length,4);
    assert.deepEqual(m.expectedLineup.slice(2).map(p=>p.archetype),
      [m.opponentArchetype,m.opponentArchetype]);
    assert.ok(m.expectedLineup.slice(2).every(p=>p.teamIndex===1));
  }

  // #143: Resume is allowed ONLY for identical immutable provenance.
  const oldSignature=rep5.runSignature;
  for(const opts of [
    ['--ticks','6001'],['--smoke'],['--stage','one-v-one'],
    ['--bot','OpenFront_AggroBot_Impossible_Run3.user.js'],
    ['--opponentBot','OpenFront_Solo_AggroBot.user.js'],
    ['--engineCommit','f'.repeat(40)]
  ]){
    const rejected=run(opts,baseOut);
    assert.notEqual(rejected.status,0,'provenance drift rejected: '+opts);
    assert.match(rejected.stderr,/Curriculum resume provenance mismatch/);
    assert.equal(base().runSignature,oldSignature,
      'rejected drift did not rewrite persisted provenance');
  }
  const fresh=run(['--ticks','6001','--fresh'],baseOut);
  assert.equal(fresh.status,0,'explicit fresh can create a new run');
  assert.notEqual(base().runSignature,oldSignature);
  assert.ok(base().matches.every(m=>m.status==='not-run'),
    'fresh never retains old match outcomes');

  console.log('PASS P4 curriculum runner regression (plan, frozen mix, versioning, resume)');
}finally{
  fs.rmSync(baseOut,{recursive:true,force:true});
  fs.rmSync(smokeOut,{recursive:true,force:true});
  fs.rmSync(stageOut,{recursive:true,force:true});
}
