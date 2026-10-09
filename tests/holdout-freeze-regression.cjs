'use strict';
// Regression: the new-holdout freeze logic must (a) read every consumed seed
// from prior holdout.json files (rows + protocol.scenarios) and training match
// ids, (b) reject a protocol whose seeds were already consumed, (c) accept a
// fresh protocol and write a committed manifest, and (d) be deterministic.
// Self-contained: fabricates a consumed set in a temp results root so the test
// does not depend on the real benchmark-results tree.
const assert=require('node:assert');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {freeze,consumedSeeds,trainingIds}=
  require('../tools/benchmark/freeze-holdout-seeds.cjs');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'freeze-holdout-'));
try{
  const resultsRoot=path.join(tmp,'results');
  const prior=path.join(resultsRoot,'prior');
  fs.mkdirSync(prior,{recursive:true});
  // Fabricated prior holdout: 2 ffa-duo row seeds (World-rush p1/p2 at n=1,2,
  // the ORIGINAL iteration order) + 2 scenario seeds (a different mode).
  fs.writeFileSync(path.join(prior,'holdout.json'),JSON.stringify({
    rows:[
      {matchSeed:'holdout-ffa-duo-World-rush-p1-1'},
      {matchSeed:'holdout-ffa-duo-World-rush-p2-2'}
    ],
    protocol:{scenarios:[
      {matchSeed:'holdout-1v1-World-rush-p1-1'},
      {matchSeed:'holdout-1v1-World-rush-p2-2'}
    ]}
  }));
  const dataset=path.join(tmp,'dataset.json');
  fs.writeFileSync(dataset,JSON.stringify({matches:[
    {matchId:'v5d-europe/hard/20260300'},
    {matchId:'v5d-europe/hard/20260301'}
  ]}));

  // 1. consumedSeeds reads both row and scenario seeds from prior holdouts.
  const cons=consumedSeeds(resultsRoot);
  assert.ok(cons.set.has('holdout-ffa-duo-World-rush-p1-1'),'row seed collected');
  assert.ok(cons.set.has('holdout-1v1-World-rush-p1-1'),'scenario seed collected');
  assert.strictEqual(cons.files.length,1,'exactly one consumed holdout file');

  // 2. trainingIds reads dataset match ids.
  const training=trainingIds([dataset]);
  assert.ok(training.has('v5d-europe/hard/20260300'),'training match id collected');
  assert.strictEqual(training.size,2,'two training matches');

  const base={
    engineCommit:'13b403387af01d388f8c8ed8c953b6d3a11d1457',
    bot:'OpenFront_AggroBot_Impossible_Run3.user.js',
    run3Policy:'trainer/run3-champion.json',
    candidateModel:'trainer/candidate-v5-v2.json',
    resultsRoot,trainingFiles:[dataset]
  };

  // 3. Fresh protocol (reversed opponent order): the 16 seeds are disjoint
  //    from the fabricated consumed set (World-rush lands at n=7,8, not 1,2)
  //    and a manifest is written.
  const out=path.join(tmp,'out','frozen.json');
  const m=freeze({mode:'ffa-duo',maps:['World','Europe'],
    opponents:['opportunist','defender','balanced','rush'],runs:2,...base,out});
  assert.strictEqual(m.seeds.length,16,'16 scenarios frozen');
  assert.strictEqual(m.consumed.collisions,0,'fresh protocol has no collisions');
  assert.ok(m.seeds.includes('holdout-ffa-duo-World-rush-p1-7'),
    'reversed order shifts World-rush to n=7');
  assert.ok(fs.existsSync(out),'frozen manifest written');
  const written=JSON.parse(fs.readFileSync(out,'utf8'));
  assert.strictEqual(written.seedListSHA256,m.seedListSHA256,'manifest records seed list');
  assert.strictEqual(written.consumed.collisions,0,'manifest records zero collisions');

  // 4. The ORIGINAL (consumed) order re-derives World-rush-p1-1 / -p2-2 and
  //    must be rejected as already consumed.
  assert.throws(()=>freeze({mode:'ffa-duo',maps:['World','Europe'],
    opponents:['rush','balanced','defender','opportunist'],runs:2,...base,
    out:path.join(tmp,'out','collide.json')}),
    /already consumed/,'colliding protocol rejected');
  assert.ok(!fs.existsSync(path.join(tmp,'out','collide.json')),
    'no manifest written for rejected protocol');

  // 5. Determinism: the same protocol reproduces the identical seed list.
  const m2=freeze({mode:'ffa-duo',maps:['World','Europe'],
    opponents:['opportunist','defender','balanced','rush'],runs:2,...base,
    out:path.join(tmp,'out','frozen2.json')});
  assert.strictEqual(m2.seedListSHA256,m.seedListSHA256,'deterministic seed list');

  console.log('holdout-freeze-regression: 5 checks passed');
}finally{
  try{fs.rmSync(tmp,{recursive:true,force:true});}catch(_){/* cleanup only */}
}
