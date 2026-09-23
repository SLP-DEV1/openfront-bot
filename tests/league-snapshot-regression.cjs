'use strict';
// P1 (plan.md box: freeze every opponent/profile version and league snapshot;
// retain legacy/champion snapshots instead of silently replacing them).
// writeLeagueSnapshot must write a content-addressed snapshot that is never
// overwritten, and keep distinct league definitions side by side.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const mod=await import(pathToFileURL(
    path.join(__dirname,'..','tools','benchmark','league-plan.mjs')).href);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'league-snap-'));
  try{
    const base={botCommit:'a'.repeat(40),engineCommit:'b'.repeat(40),
      seeds:['s1'],maps:['World'],modes:['1v1'],candidate:'run3'};
    const plan=mod.createLeaguePlan(base);
    const r1=mod.writeLeagueSnapshot(plan,tmp);
    assert.equal(r1.retained,false,'first write creates a snapshot');
    assert.ok(fs.existsSync(r1.file),'snapshot file exists');
    // Gleiche Definition → behalten, nicht still ersetzt.
    const r2=mod.writeLeagueSnapshot(plan,tmp);
    assert.equal(r2.retained,true,'identical plan is retained');
    assert.equal(r2.file,r1.file,'identical plan reuses the same snapshot file');
    // Andere Definition (anderer Kandidat) → eigener Snapshot, alter bleibt.
    const plan2=mod.createLeaguePlan({...base,candidate:'candidate'});
    const r3=mod.writeLeagueSnapshot(plan2,tmp);
    assert.equal(r3.retained,false,'different plan yields a new snapshot');
    assert.notEqual(r3.file,r1.file,'distinct snapshot files');
    assert.ok(fs.existsSync(r1.file)&&fs.existsSync(r3.file),
      'legacy and new snapshot are both retained');
    const content=JSON.parse(fs.readFileSync(r1.file,'utf8'));
    assert.equal(content.schema,'aggrobot-league-snapshot-v1');
    assert.equal(content.plan.candidate,'run3');
    assert.equal(content.plan.engineCommit,'b'.repeat(40));
    assert.ok(Array.isArray(content.plan.matches)&&content.plan.matches.length>0);
    assert.ok(typeof content.frozenAt==='string');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  console.log('PASS P1 league snapshot freeze and retention');
})().catch(e=>{console.error(e);process.exitCode=1;});
