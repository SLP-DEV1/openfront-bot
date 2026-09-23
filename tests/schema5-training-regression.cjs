// Box 241 regression: the schema-5 candidate must have REAL training,
// validation and holdout results — not just 702 weights. The offline
// visible-state curriculum must be deterministic, split disjoint by match,
// produce finite losses, and demonstrably beat the constant (zero) baseline
// on held-out data. It must stay labeled as offline/shadow/not-promoted.
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const trainer=require('../trainer/train-schema5.cjs');
const policy=require('../trainer/candidate-policy-v5.cjs');

// Small deterministic config (fast in CI, still clearly beats baseline).
const CFG={matches:48,frames:50,seed:20260714,epochs:160};

function run(){return trainer.runPipeline(CFG);}

// 1. Deterministic: two runs yield the identical model SHA.
const a=run(),b=run();
assert.equal(a.metrics.modelSha256,b.metrics.modelSha256,
  'offline curriculum must be deterministic (same seed -> same model SHA)');
assert.ok(a.metrics.modelSha256.length===64,'model SHA must be 64-hex');

// 2. The produced artifact is a valid schema-5 dormant candidate model.
policy.validate(a.model);
assert.equal(a.model.schema,5,'model must be schema 5');
assert.equal(a.model.weights.length,policy.LENGTH,
  'model must keep exactly 702 weights (dormant candidate, not grown)');
assert.equal(a.model.arch,'32x20x2-tanh','candidate architecture must be unchanged');
assert.equal(a.metrics.modelSha256,policy.sha(a.model),
  'reported SHA must match the model content');

// 3. Splits are disjoint BY MATCH (never a frame): train/val/holdout share
//    no matchId, so holdout is genuinely unseen.
const matchSet=rows=>new Set(rows.map(r=>r.matchId));
const tr=matchSet(a.splits.train),va=matchSet(a.splits.val),ho=matchSet(a.splits.holdout);
const overlaps=(x,y)=>[...x].some(m=>y.has(m));
assert.equal(overlaps(tr,va),false,'train/val must be disjoint by match');
assert.equal(overlaps(tr,ho),false,'train/holdout must be disjoint by match');
assert.equal(overlaps(va,ho),false,'val/holdout must be disjoint by match');
assert.ok(a.splits.train.length>0&&a.splits.val.length>0&&a.splits.holdout.length>0,
  'each split must be non-empty');

// 4. All reported losses are finite and non-negative.
for(const g of['train','val','holdout']){
  for(const k of['candidateMse','baselineMse']){
    const v=a.metrics[g][k];
    assert.ok(Number.isFinite(v)&&v>=0,`${g}.${k} must be finite >=0 (got ${v})`);
  }
}

// 5. REAL result: the candidate beats the constant (zero) baseline on the
//    held-out (and validation) sets — i.e. it learned something generalizing.
assert.ok(a.metrics.holdout.candidateMse<a.metrics.holdout.baselineMse,
  'candidate must beat the constant baseline on holdout (real result)');
assert.ok(a.metrics.val.candidateMse<a.metrics.val.baselineMse,
  'candidate must beat the constant baseline on validation');
assert.equal(a.metrics.beatsBaselineOnHoldout,true);

// 6. Provenance stays honest: offline visible-state curriculum, shadow, not promoted.
const prov=a.metrics.provenance;
assert.equal(prov.kind,'offline-visible-state-curriculum');
assert.ok(/shadow/i.test(prov.label),'must be labeled shadow');
assert.ok(/not promoted/i.test(prov.label),'must be labeled not promoted');
assert.equal(prov.deterministic,true);
assert.ok(/matchId/.test(prov.splitBy),'must split by matchId');

// 7. main() writes a valid, self-consistent model + metrics to disk.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'schema5-test-'));
try{
  const realLog=console.log;
  console.log=()=>{}; // main() prints a JSON report; keep test output clean
  try{
    trainer.main(['node','train-schema5.cjs','--matches',String(CFG.matches),
      '--frames',String(CFG.frames),'--seed',String(CFG.seed),
      '--epochs',String(CFG.epochs),'--out',tmp]);
  }finally{
    console.log=realLog;
    process.exitCode=undefined;
  }
  const modelPath=path.join(tmp,'schema5-model.json');
  const metricsPath=path.join(tmp,'schema5-metrics.json');
  assert.ok(fs.existsSync(modelPath),'model file must be written');
  assert.ok(fs.existsSync(metricsPath),'metrics file must be written');
  const written=JSON.parse(fs.readFileSync(modelPath,'utf8'));
  policy.validate(written);
  const metrics=JSON.parse(fs.readFileSync(metricsPath,'utf8'));
  const checksumPath=metricsPath+'.sha256';
  assert.ok(fs.existsSync(checksumPath),'final metrics checksum sidecar required');
  const actual=crypto.createHash('sha256').update(fs.readFileSync(metricsPath)).digest('hex');
  assert.equal(fs.readFileSync(checksumPath,'utf8').split(/\\s+/)[0],actual,
    'sidecar SHA must cover final metrics file bytes');
  assert.equal(metrics.fileSha256.metrics,undefined,
    'metrics must not falsely claim their own final-byte SHA');
  const tampered=Buffer.from(fs.readFileSync(metricsPath));
  tampered[0]^=1;
  assert.notEqual(crypto.createHash('sha256').update(tampered).digest('hex'),actual,
    'one-byte tampering must invalidate the checksum');
  assert.equal(metrics.modelSha256,policy.sha(written),'metrics SHA must match written model');
  assert.equal(metrics.modelSha256,a.metrics.modelSha256,
    'written model must be the deterministic pipeline model');
  assert.ok(metrics.beatsBaselineOnHoldout==='true'||metrics.beatsBaselineOnHoldout===true,
    'written metrics must record the holdout baseline win');
}finally{
  fs.rmSync(tmp,{recursive:true,force:true});
}

console.log('PASS schema-5 offline curriculum: deterministic, disjoint-by-match splits, finite losses, beats constant baseline on holdout, labeled offline/shadow/not-promoted, valid model+metrics files');
