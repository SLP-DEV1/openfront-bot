'use strict';
// P1 (plan.md box: freeze every opponent/profile version and league snapshot;
// retain legacy/champion snapshots instead of silently replacing them).
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
    const r2=mod.writeLeagueSnapshot(plan,tmp);
    assert.equal(r2.retained,true,'identical plan is retained');
    assert.equal(r2.file,r1.file,'identical plan reuses the same snapshot file');

    const plan2=mod.createLeaguePlan({...base,candidate:'candidate'});
    const r3=mod.writeLeagueSnapshot(plan2,tmp);
    assert.equal(r3.retained,false,'different candidate yields a new snapshot');
    assert.notEqual(r3.file,r1.file,'distinct snapshot files');

    // #157: IDs alone are insufficient. Same profile ID with changed semantics
    // must create a different content-addressed definition.
    const profileDrift=JSON.parse(JSON.stringify(plan));
    profileDrift.profiles[0].style='changed deterministic rules';
    profileDrift.profiles[0].version='v2';
    const r4=mod.writeLeagueSnapshot(profileDrift,tmp);
    assert.notEqual(r4.file,r1.file,'same profile ID with changed definition gets new snapshot');

    // Protocol/rotation changes are provenance too.
    const protocolDrift=JSON.parse(JSON.stringify(plan));
    protocolDrift.promotion.rotate=[...protocolDrift.promotion.rotate,'candidateSeat'];
    const r5=mod.writeLeagueSnapshot(protocolDrift,tmp);
    assert.notEqual(r5.file,r1.file,'protocol definition drift gets new snapshot');

    // Timestamps do not alter semantic identity.
    const timestampOnly={...plan,createdAt:'2026-09-23T12:00:00.000Z'};
    const r6=mod.writeLeagueSnapshot(timestampOnly,tmp);
    assert.equal(r6.file,r1.file,'createdAt alone does not fork semantic snapshot identity');
    assert.equal(r6.retained,true);

    const content=JSON.parse(fs.readFileSync(r1.file,'utf8'));
    assert.equal(content.schema,'aggrobot-league-snapshot-v1');
    assert.equal(content.plan.candidate,'run3');
    assert.equal(content.plan.engineCommit,'b'.repeat(40));
    assert.ok(Array.isArray(content.plan.matches)&&content.plan.matches.length>0);
    assert.ok(typeof content.frozenAt==='string');
    assert.match(content.definitionSha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(content.definition,mod.leagueSnapshotDefinition(plan));

    // Existing filename is not proof of identity: tampering/collision fails closed.
    const tampered={...content,definitionSha256:content.definitionSha256,
      definition:{...content.definition,candidate:'tampered'}};
    fs.writeFileSync(r1.file,JSON.stringify(tampered));
    assert.throws(()=>mod.writeLeagueSnapshot(plan,tmp),/collision.*does not match/i,
      'mismatching content at expected ID fails closed');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  console.log('PASS P1 league snapshot freeze, provenance identity and collision guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
