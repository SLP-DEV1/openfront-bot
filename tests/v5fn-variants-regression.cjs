'use strict';
// Regression for trainer/train-v5fn-variants.cjs (mandate §6/§20,
// campaign-v5finetune-20260925):
//   1) the trainer's group selection mirrors buildRankGroups exactly
//      (counts + per-group tick/observed layout on sampled groups)
//   2) variant A is objective-self-consistent: its reported loss is the
//      mean ranking loss and its gradient passes central finite
//      differences. (train-v5rank's implementation double-applies the
//      output-layer Jacobian, so exact parity with its lossAndGrad is NOT
//      the contract — the FD check is authoritative.)
//   3) biasMetrics (§7) invariants on the finetune dataset.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const t5 = require('../trainer/train-v5.cjs');
const rank = require('../trainer/train-v5rank.cjs');
const v5fn = require('../trainer/train-v5fn-variants.cjs');

const SPLIT = 21;
const FINETUNE = path.join(__dirname, '..', 'trainer', 'campaign-v5finetune-20260925', 'dataset.json');
const V5 = path.join(__dirname, '..', 'trainer', 'campaign-v5rank-20260924', 'combined', 'dataset.json');
const sig = z => 1 / (1 + Math.exp(-z));

const finetune = JSON.parse(fs.readFileSync(FINETUNE, 'utf8'));
const v5ds = JSON.parse(fs.readFileSync(V5, 'utf8'));
const built = rank.buildRankGroups(finetune, SPLIT);

// 1) group mirror vs buildRankGroups
{
  const keys = v5fn.groupKeys(finetune, SPLIT);
  assert.equal(keys.trainKeys.length, built.train.length, 'train group count');
  assert.equal(keys.valKeys.length, built.val.length, 'val group count');
  const step = Math.max(1, Math.floor(keys.trainKeys.length / 50));
  for (let i = 0; i < keys.trainKeys.length; i += step){
    const k = keys.trainKeys[i], g = built.train[i];
    assert.equal(k.rows.length, g.rows.length, 'row count group ' + i);
    assert.equal(k.rows[0].tick, g.tick, 'tick group ' + i);
    for (let r = 0; r < k.rows.length; r++)
      assert.equal(k.rows[r].observed !== false, g.rows[r].observed,
        'observed group ' + i + ' row ' + r);
  }
  console.log('1) group mirror ok (' + keys.trainKeys.length + ' train / ' +
    keys.valKeys.length + ' val groups)');
}

const fixedW = () => {
  const w = new Float64Array(v5fn.LENGTH);
  let s = 1337;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  for (let i = 0; i < w.length; i++) w[i] = rnd() * 0.3;
  return w;
};
const cfgA = () => ({ variant: 'A', lambda: 1, ruWeight: 0.5, hardNegBoost: 3,
  biasL2: 0.001, outcomeWeight: { victory: 1.5, defeat: 0.5, unknown: 1 },
  kinds: ['invest'], bias: null });
const metasOf = g => ({ matchIdx: 0, outcome: 'unknown',
  metas: g.rows.map(() => ({ ru: null, hardNeg: false, ruleTop1: false, kind: 'invest' })) });

// 2) variant A objective self-consistency
{
  const built5 = rank.buildRankGroups(v5ds, SPLIT);
  const bag = built5.train.slice(0, 48);
  const gm = bag.map(metasOf);
  const w = fixedW();
  const a = v5fn.lossAndGrad(w, bag, gm, cfgA());
  const sOf = x => { const o = t5.predictArray(w, x); return o[0] - o[1]; };
  let expect = 0;
  for (const g of bag){
    const sPos = sOf(g.rows[g.posIdx].x);
    let sum = 0;
    for (const ni of g.negIdx) sum += -Math.log(sig(sPos - sOf(g.rows[ni].x)));
    expect += sum / g.negIdx.length;
  }
  expect /= bag.length;
  assert.ok(Math.abs(a.loss - expect) < 1e-9,
    'A loss ' + a.loss + ' vs independent ' + expect);
  console.log('2a) A loss = mean ranking loss (' + a.loss.toFixed(9) + ')');
}
{
  const built5 = rank.buildRankGroups(v5ds, SPLIT);
  const bag = built5.train.slice(0, 16);
  const gm = bag.map(metasOf);
  const w = fixedW();
  const a = v5fn.lossAndGrad(w, bag, gm, cfgA());
  const lossAt = ww => v5fn.lossAndGrad(ww, bag, gm, cfgA()).loss;
  const eps = 1e-6; let maxRel = 0;
  for (let idx = 0; idx < v5fn.LENGTH; idx += Math.floor(v5fn.LENGTH / 24)){
    const up = new Float64Array(w); up[idx] += eps;
    const dn = new Float64Array(w); dn[idx] -= eps;
    const fd = (lossAt(up) - lossAt(dn)) / (2 * eps);
    const num = Math.max(1e-9, Math.abs(a.grad[idx]), Math.abs(fd));
    maxRel = Math.max(maxRel, Math.abs(a.grad[idx] - fd) / num);
  }
  assert.ok(maxRel < 1e-5, 'A gradient FD max relative diff ' + maxRel);
  console.log('2b) A gradient passes finite differences (max rel ' +
    maxRel.toExponential(2) + ')');
}

// 3) biasMetrics invariants (§7)
{
  const keys = v5fn.groupKeys(finetune, SPLIT);
  const gm = v5fn.keysToGm(keys.valKeys)
    .map(k => ({ ...k, outcome: finetune.matches[k.matchIdx].outcome || 'unknown' }));
  const w = new Float64Array(v5fn.LENGTH); // zero weights -> constant scores
  const cfg = { variant: 'A', lambda: 1, ruWeight: 0.5, hardNegBoost: 3,
    biasL2: 0.001, outcomeWeight: {}, kinds: [], bias: null };
  const mm = v5fn.biasMetrics(w, built.val, gm, cfg);
  assert.ok(mm.frames > 0, 'frames counted');
  assert.ok(mm.flipRate >= 0 && mm.flipRate <= 1, 'flipRate in [0,1]');
  assert.ok(mm.flipToLowerRate >= 0 && mm.flipToLowerRate <= 1, 'flipToLowerRate in [0,1]');
  // Zero weights: scores are constant, ties break by row order, so every
  // frame whose rule top-1 is not row 0 counts as a flip.
  console.log('3) biasMetrics ok (zero-weight frames=' + mm.frames +
    ' flipRate=' + mm.flipRate + ')');
}

// 4) end-to-end: each variant A–E trains a few epochs and emits a valid
//    schema-5 model (guards main()'s bag/gm pairing + per-variant paths).
{
  const trainer = path.join(__dirname, '..', 'trainer', 'train-v5fn-variants.cjs');
  const candidate = require('../trainer/candidate-policy-v5.cjs');
  const candidateMod = candidate; // module with sha()
  for (const variant of ['A', 'B', 'C', 'D', 'E']){
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'v5fn-' + variant + '-'));
    const res = spawnSync(process.execPath,
      [trainer, '--variant', variant, '--dataset', FINETUNE,
       '--out', out, '--epoch', '2', '--splitPct', String(SPLIT)],
      {encoding: 'utf8', timeout: 120000});
    assert.equal(res.status, 0,
      'variant ' + variant + ' train failed: ' + (res.stderr || res.stdout));
    const model = JSON.parse(fs.readFileSync(path.join(out, 'model.json'), 'utf8'));
    assert.equal(model.schema, 5, variant + ' schema');
    assert.equal(model.arch, '32x20x2-tanh', variant + ' arch');
    assert.equal(model.weights.length, 702, variant + ' 702 weights');
    assert.ok(model.weights.every(x => Number.isFinite(x) && Math.abs(x) <= 5),
      variant + ' weights finite/bounded');
    candidateMod.sha(model); // must not throw
    assert.equal(model.training.variant, variant, variant + ' variant recorded');
    const m = model.training.biasMetrics;
    assert.ok(m.flipRate >= 0 && m.flipRate <= 1, variant + ' flipRate in [0,1]');
    if (variant === 'D')
      assert.ok(model.training.kindBias && Object.keys(model.training.kindBias).length > 0,
        'D must learn a non-empty kindBias');
    console.log('4) variant ' + variant + ' trains -> ' +
      'flipRate=' + m.flipRate + ' flipToLower=' + m.flipToLowerRate);
  }
}
console.log('v5fn-variants regression: all ok');
