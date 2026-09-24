#!/usr/bin/env node
'use strict';
// Mandate §5 — architecture comparison. Parameterized copy of train-v5rank.cjs
// that supports a 32x40x2 hidden layer (in addition to 32x20x2) on the SAME
// candidate-group ranking objective. It reuses train-v5rank.buildRankGroups
// (arch-independent: features are the fixed 32-dim candidate vector) and
// candidate.features, but computes the layer offsets from the chosen HIDDEN.
//
// WHY: candidate-policy-v5.validate() (the runtime kernel) is locked to
// 32x20x2/702, so a 32x40x2 model is a candidate for a VERSIONED kernel. This
// trainer answers "would 32x40x2 be better offline?" on the ranking objective.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const candidate = require('./candidate-policy-v5.cjs');
const { buildRankGroups } = require('./train-v5rank.cjs');

function arg(name, def){
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const HIDDEN = Number(arg('--hidden', '40'));
const INPUTS = candidate.INPUTS; // 32
const OUTPUTS = 2;
const hiddenBias = INPUTS * HIDDEN;
const outStart = hiddenBias + HIDDEN;
const outBias = outStart + HIDDEN * OUTPUTS;
const LENGTH = outBias + OUTPUTS;
const ARCH = `32x${HIDDEN}x2-tanh`;
const tanh = Math.tanh, sig = z => 1 / (1 + Math.exp(-z)), clamp01 = v => Math.min(1, Math.max(0, v));
const clampW = v => Math.min(5, Math.max(-5, v));

function forward(x, w){
  const h = new Float64Array(HIDDEN);
  for (let j = 0; j < HIDDEN; j++){
    let z = w[hiddenBias + j];
    for (let i = 0; i < INPUTS; i++) z += x[i] * w[i * HIDDEN + j];
    h[j] = tanh(z);
  }
  const out = new Float64Array(OUTPUTS);
  for (let k = 0; k < OUTPUTS; k++){
    let z = w[outBias + k];
    for (let j = 0; j < HIDDEN; j++) z += w[outStart + j * OUTPUTS + k] * h[j];
    out[k] = (1 + tanh(z)) / 2;
  }
  return { h, out };
}
function backpropFromOutDelta(x, h, out, dOut, w, grad){
  const dzout = new Float64Array(OUTPUTS);
  for (let k = 0; k < OUTPUTS; k++){ const t = 2 * out[k] - 1; dzout[k] = dOut[k] * (1 - t * t) / 2; }
  for (let k = 0; k < OUTPUTS; k++){
    grad[outBias + k] += dzout[k];
    for (let j = 0; j < HIDDEN; j++) grad[outStart + j * OUTPUTS + k] += dzout[k] * h[j];
  }
  for (let j = 0; j < HIDDEN; j++){
    let dh = 0;
    for (let k = 0; k < OUTPUTS; k++) dh += dzout[k] * w[outStart + j * OUTPUTS + k];
    dh *= 1 - h[j] * h[j];
    grad[hiddenBias + j] += dh;
    for (let i = 0; i < INPUTS; i++) grad[i * HIDDEN + j] += dh * x[i];
  }
}
function lossAndGrad(w, groups, lambda, noRegression){
  const G = groups.length;
  const regGrad = new Float64Array(LENGTH), rankGrad = new Float64Array(LENGTH);
  let regLoss = 0, rankLoss = 0;
  for (const g of groups){
    const fwd = g.rows.map(r => forward(r.x, w));
    const pos = g.posIdx, negs = g.negIdx;
    const outPos = fwd[pos].out;
    const sPos = outPos[0] - outPos[1];
    const regD = new Float64Array(OUTPUTS);
    const rankDPos = new Float64Array(OUTPUTS);
    const rankDNeg = negs.map(() => new Float64Array(OUTPUTS));
    const y = g.rows[pos].y;
    if (!noRegression){
      for (let k = 0; k < OUTPUTS; k++){ const d = outPos[k] - y[k]; regD[k] += d; regLoss += d * d; }
    }
    if (negs.length){
      for (let ni = 0; ni < negs.length; ni++){
        const outNeg = fwd[negs[ni]].out;
        const z = sPos - (outNeg[0] - outNeg[1]);
        const dLdz = sig(z) - 1;
        const c = 1 / negs.length, dSpos = c * dLdz, dSneg = -c * dLdz;
        const t0p = 2 * outPos[0] - 1, t1p = 2 * outPos[1] - 1;
        rankDPos[0] += dSpos * (1 - t0p * t0p) / 2;
        rankDPos[1] += dSpos * (-(1 - t1p * t1p)) / 2;
        const tn0 = 2 * outNeg[0] - 1, tn1 = 2 * outNeg[1] - 1;
        rankDNeg[ni][0] += dSneg * (1 - tn0 * tn0) / 2;
        rankDNeg[ni][1] += dSneg * (-(1 - tn1 * tn1)) / 2;
        rankLoss += -Math.log(clamp01(sig(z)));
      }
    }
    backpropFromOutDelta(g.rows[pos].x, fwd[pos].h, fwd[pos].out, regD, w, regGrad);
    backpropFromOutDelta(g.rows[pos].x, fwd[pos].h, fwd[pos].out, rankDPos, w, rankGrad);
    for (let ni = 0; ni < negs.length; ni++)
      backpropFromOutDelta(g.rows[negs[ni]].x, fwd[negs[ni]].h, fwd[negs[ni]].out, rankDNeg[ni], w, rankGrad);
  }
  const grad = new Float64Array(LENGTH), scale = 1 / G;
  for (let p = 0; p < LENGTH; p++) grad[p] = scale * (regGrad[p] + lambda * rankGrad[p]);
  return { loss: scale * (regLoss + lambda * rankLoss), grad };
}
function shaOf(w){
  let s = '';
  for (let i = 0; i < w.length; i++) s += w[i];
  return crypto.createHash('sha256').update(s).digest('hex');
}

function main(){
  const out = path.resolve(arg('--out', ''));
  if (!out) throw Error('--out <dir> is required');
  const epoch = Number(arg('--epoch', '400'));
  const lr = Number(arg('--lr', '0.1'));
  const splitPct = Number(arg('--splitPct', '21'));
  const lambda = Number(arg('--lambda', '1'));
  const noRegression = process.argv.includes('--noRegression');
  const seed = Number(arg('--seed', '1337'));
  const bagSize = Number(arg('--bagSize', '48'));
  const dataset = JSON.parse(fs.readFileSync(path.resolve(arg('--dataset', '')), 'utf8'));
  if (fs.existsSync(out) && fs.readdirSync(out).length > 0) throw Error('Output directory already exists: ' + out);
  const { train, val, trainMatches, valMatches, stat } = buildRankGroups(dataset, splitPct);
  if (!train.length || !val.length) throw Error('No trainable groups');
  const make = () => {
    const w = new Float64Array(LENGTH);
    const scale = Math.sqrt(6 / (INPUTS + HIDDEN));
    let s = seed >>> 0;
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
    for (let i = 0; i < w.length; i++) w[i] = rand() * scale;
    return w;
  };
  let w = make();
  let rng = (seed ^ 0x9e3779b9) >>> 0;
  const rand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const curve = [];
  const t0 = Date.now();
  for (let e = 0; e < epoch; e++){
    const order = train.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--){
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let lastTrainLoss = null;
    for (let b = 0; b < order.length; b += bagSize){
      const bag = train.slice(order[b], order[b] + bagSize);
      const { loss, grad } = lossAndGrad(w, bag, lambda, noRegression);
      if (!Number.isFinite(loss)) throw Error('Loss diverged at epoch ' + e);
      for (let p = 0; p < LENGTH; p++) w[p] = clampW(w[p] - lr * grad[p]);
      lastTrainLoss = loss;
    }
    if ((e + 1) % 25 === 0 || e === 0 || e === epoch - 1){
      const vl = lossAndGrad(w, val, lambda, noRegression).loss;
      curve.push({ epoch: e + 1, trainLoss: +(lastTrainLoss ?? 0).toFixed(6), valLoss: +vl.toFixed(6) });
    }
  }
  const model = { schema: 5, arch: ARCH,
    outputs: ['heldGain', 'lossRisk'], weights: Array.from(w),
    sha256: shaOf(w),
    training: {
      generatedBy: 'trainer/train-v5rank-arch.cjs', hidden: HIDDEN, length: LENGTH,
      epoch, lr, splitPct, lambda, noRegression, bagSize, seed,
      objective: noRegression ? 'ranking-only' : 'regression+ranking',
      trainMatches: trainMatches.length, valMatches: valMatches.length,
      buildStat: stat,
      curve, wallMs: Date.now() - t0,
    } };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'model.json'), JSON.stringify(model, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'training.json'), JSON.stringify({
    arch: ARCH, hidden: HIDDEN, length: LENGTH, epoch, lr, splitPct, lambda,
    noRegression, trainGroups: train.length, valGroups: val.length,
    wallMs: Date.now() - t0, finalValLoss: curve[curve.length - 1].valLoss,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ out, arch: ARCH, length: LENGTH,
    finalValLoss: curve[curve.length - 1].valLoss, wallMs: Date.now() - t0 }));
}
if (require.main === module) main();
module.exports = { forward, lossAndGrad, LENGTH, hiddenBias, outStart, outBias };
