'use strict';
// P3 regression: deterministic schema-5 offline training path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const candidate = require('../trainer/candidate-policy-v5.cjs');
const feat = require('../trainer/v5-features.cjs');
const t = require('../trainer/train-v5.cjs');
const {makeDataset} = require('./fixtures/v5-dataset.cjs');

const SPLIT = 80, EPOCHS = 40, LR = 0.05;
const ds = makeDataset(40);

// 1) Backprop correctness: analytic gradient must match finite differences.
{
  const w = Float64Array.from({length: t.LENGTH}, (_, i) => ((i * 37) % 13 - 6) / 10);
  const xs = [Float64Array.from({length: 32}, (_, i) => (i % 7) / 11),
    Float64Array.from({length: 32}, (_, i) => ((i * 5) % 9) / 12)];
  const ys = [[0.3, 0.7], [0.6, 0.2]];
  const g = t.gradient(w, xs, ys);
  const eps = 1e-6; let maxDiff = 0;
  const lossAt = ww => {
    let s = 0;
    for (let i = 0; i < xs.length; i++){
      const o = t.predictArray(ww, xs[i]);
      s += (o[0] - ys[i][0]) ** 2 + (o[1] - ys[i][1]) ** 2;
    }
    return s / (xs.length * 2);
  };
  for (let p = 0; p < t.LENGTH; p++){
    const cp = w[p];
    const up = w.slice(); up[p] += eps;
    const dn = w.slice(); dn[p] -= eps;
    const num = (lossAt(up) - lossAt(dn)) / (2 * eps);
    w[p] = cp;
    maxDiff = Math.max(maxDiff, Math.abs(num - g[p]));
  }
  assert.ok(maxDiff < 1e-6, 'gradient check failed: ' + maxDiff);
}

// 2) Deterministic per-match split: disjoint, both sides non-empty.
{
  t.splitPctGlobal = SPLIT;
  const s = t.buildSamples(ds);
  assert.ok(s.trainMatches.size > 0 && s.valMatches.size > 0, 'both sides non-empty');
  const overlap = [...s.trainMatches].filter(m => s.valMatches.has(m));
  assert.equal(overlap.length, 0, 'train/validation matches must be disjoint');
  assert.ok(s.train.x.length > 0 && s.validation.x.length > 0, 'both sample sets non-empty');
}

// 3) Deterministic training: two runs -> identical model SHA; learning improves.
function runTrain(){
  const res = t.train(ds, {epochs: EPOCHS, lr: LR, splitPct: SPLIT});
  return {res, sha: candidate.sha(t.makeModel(res.w))};
}
const a = runTrain(), b = runTrain();
assert.equal(a.sha, b.sha, 'training must be deterministic (same SHA)');
// Model is a valid schema-5 candidate (702 weights, |w|<=5, finite).
const model = t.makeModel(a.res.w);
assert.equal(model.schema, 5, 'schema');
assert.equal(model.arch, '32x20x2-tanh', 'arch');
assert.deepEqual(model.outputs, ['heldGain','lossRisk'], 'outputs');
assert.equal(model.weights.length, 702, '702 weights');
assert.ok(model.weights.every(x => Number.isFinite(x) && Math.abs(x) <= 5), 'finite, bounded');
// Learning: final validation loss < initial (no live deploy, just improvement).
assert.ok(a.res.curve.length === EPOCHS, 'one curve point per epoch');
assert.ok(a.res.curve[EPOCHS - 1].valLoss < a.res.baseLoss.validation,
  'validation loss must improve over the zero baseline');
// Feature parity: training features === runtime features.
const x0 = a.res.T.x[0];
const state = {home: 100, maxTroops: 200, committed: 5, incoming: 3, reserve: 10,
  gold: 40000, land: 12, capacityUse: 0.4, frontCount: 1};
const cand = {kind: 'attack', costTroops: 4, counterRisk: 0.2, holdProbability: 0.8};
const parity = feat.buildFeatures(state, cand);
assert.deepEqual(parity, candidate.features(state, cand), 'feature parity');
assert.ok(x0.length === 32, 'training feature vector length');

// 4) Ablation baselines + calibration are well-formed.
{
  const {validation: V} = t.buildSamples(ds);
  const nullM = t.nullModelMetrics(V.x, V.y);
  const ruleM = t.ruleModel(V.x, V.y);
  const meanM = t.meanModelMetrics(V.x, V.y);
  for (const m of [nullM, ruleM, meanM]) assert.ok(Number.isFinite(m.mse), 'finite baseline');
  const w = a.res.w;
  const calib = t.calibration(w, V.x, V.y);
  assert.equal(calib.length, 4, 'calibration bins');
  const total = calib.reduce((s, c) => s + c.n, 0);
  assert.equal(total, V.x.length, 'calibration covers all validation frames');
}

// 5) CLI: deterministic output + checkpoint/resume reproduce the full run.
const trainer = path.join(__dirname, '..', 'trainer', 'train-v5.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p3-train-'));
const dsPath = path.join(tmp, 'dataset.json');
fs.writeFileSync(dsPath, JSON.stringify(ds));
function cli(args){
  const r = spawnSync(process.execPath, [trainer, ...args], {encoding: 'utf8'});
  if (r.status !== 0) throw Error('CLI failed: ' + r.stderr + r.stdout);
  return {out: JSON.parse(r.stdout.trim().split('\n').pop()), raw: r.stdout};
}
const full = cli(['--dataset', dsPath, '--out', path.join(tmp, 'full'),
  '--epochs', String(EPOCHS), '--learningRate', String(LR), '--split', String(SPLIT)]);
assert.equal(full.out.modelSHA256, a.sha, 'CLI SHA must equal in-memory SHA');
assert.equal(full.out.liveDeployment, false, 'CLI must not deploy live');
// Partial run then resume must equal the full run.
const partOut = path.join(tmp, 'part');
cli(['--dataset', dsPath, '--out', partOut, '--epochs', '15',
  '--learningRate', String(LR), '--split', String(SPLIT)]);
const resumedOut = path.join(tmp, 'resumed');
const resumed = cli(['--dataset', dsPath, '--out', resumedOut, '--epochs', String(EPOCHS),
  '--learningRate', String(LR), '--split', String(SPLIT),
  '--resume', path.join(partOut, 'checkpoint.json')]);
assert.equal(resumed.out.modelSHA256, full.out.modelSHA256, 'resume must reproduce full run');
// The model file written by the CLI validates as a schema-5 candidate.
const writtenModel = JSON.parse(fs.readFileSync(path.join(full.out.out, 'model.json'), 'utf8'));
assert.equal(candidate.validate(writtenModel).weights.length, 702, 'written model validates');
// #144: CLI must reject empty usable validation rather than emit 0/NaN.
const invoke=args=>spawnSync(process.execPath,[trainer,...args],{encoding:'utf8'});
const oneTrain=ds.matches.find(m=>t.sideOf(String(m.matchId),SPLIT)==='train');
assert.ok(oneTrain,'fixture must contain a train match');
const emptyValPath=path.join(tmp,'only-train.json');
fs.writeFileSync(emptyValPath,JSON.stringify({...ds,matches:[oneTrain]}));
const badValidation=invoke(['--dataset',emptyValPath,'--out',path.join(tmp,'empty-val')]);
assert.notEqual(badValidation.status,0);
assert.match(badValidation.stderr,/No usable validation frames/);
assert.ok(!fs.existsSync(path.join(tmp,'empty-val','evaluation.json')));
assert.throws(()=>t.mse(a.res.w,[],[]),/non-empty/);
assert.throws(()=>t.nullModelMetrics([],[]),/non-empty/);

// #148: a matching training bag is NOT sufficient for checkpoint resume.
const checkpoint=path.join(partOut,'checkpoint.json');
const resumeArgs=(dataset,out,extra=[])=>invoke(['--dataset',dataset,'--out',out,
  '--epochs',String(EPOCHS),'--learningRate',String(LR),
  '--split',String(SPLIT),...extra,'--resume',checkpoint]);
const changed=JSON.parse(JSON.stringify(ds));
const valMatch=changed.matches.find(m=>t.sideOf(String(m.matchId),SPLIT)==='validation');
assert.ok(valMatch&&valMatch.frames.length,'fixture must contain validation frames');
valMatch.frames[0].visibleState.home=(valMatch.frames[0].visibleState.home||1)+123;
const changedPath=path.join(tmp,'changed-validation.json');
fs.writeFileSync(changedPath,JSON.stringify(changed));
const valReject=resumeArgs(changedPath,path.join(tmp,'resume-changed-val'));
assert.notEqual(valReject.status,0);
assert.match(valReject.stderr,/Resume provenance signature mismatch/);
const lrReject=resumeArgs(dsPath,path.join(tmp,'resume-changed-lr'),
  ['--learningRate','0.04']);
assert.notEqual(lrReject.status,0);
assert.match(lrReject.stderr,/Resume provenance signature mismatch/);
const splitReject=resumeArgs(dsPath,path.join(tmp,'resume-changed-split'),
  ['--split','75']);
assert.notEqual(splitReject.status,0);
assert.match(splitReject.stderr,/Resume provenance signature mismatch/);
const horizonPath=path.join(tmp,'changed-horizon.json');
fs.writeFileSync(horizonPath,JSON.stringify({...ds,
  horizonTicks:(Number(ds.horizonTicks)||120)+1}));
const horizonReject=resumeArgs(horizonPath,path.join(tmp,'resume-changed-horizon'));
assert.notEqual(horizonReject.status,0);
assert.match(horizonReject.stderr,/Resume provenance signature mismatch/);

fs.rmSync(tmp, {recursive: true, force: true});

console.log('PASS P3 deterministic schema-5 training (grad, determinism, split, learn, ablation, resume, no-live-deploy)');
