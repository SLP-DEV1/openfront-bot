#!/usr/bin/env node
'use strict';
// Mandate §6 — five objective variants for campaign-v5finetune-20260925,
// all on the SAME 32x20x2/702 candidate-group ranking backbone (so any
// winner is a drop-in for the existing schema-5 kernel):
//
//   A  ranking-only baseline (the train-v5rank objective). One documented
//      difference from train-v5rank's implementation: its rankDPos/rankDNeg
//      pre-multiply by the output-layer Jacobian (1-t^2)/2 and then
//      backpropFromOutDelta multiplies by it AGAIN, so the reference
//      gradient equals the true gradient only up to a per-output factor
//      (1-t^2)/2. A here applies the Jacobian exactly once, so A's
//      gradient is the exact gradient of its reported mean ranking loss
//      ((1/nNeg) Σ_neg -log σ(s_pos - s_neg), verified by finite
//      differences in test-variants.cjs).
//   B  + utility alignment: rows with a binding ruleUtility also regress
//      their score margin onto the frame-normalized utility value, so the
//      model's preference order tracks the rule's utility order
//   C  outcome-aware: group loss scaled by match outcome
//      (victory 1.5 / defeat 0.5 / unknown 1) — a losing match is weaker
//      evidence than a winning one
//   D  action-kind calibration: learns a per-kind bias on the score margin
//      from the ranking gradient itself (counteracts systematic overranking
//      of e.g. naval/invest), with a small L2 on the biases
//   E  hard-negative mining: frames flagged in hard-negatives.json
//      (model flip to LOWER rule-utility) get pos weight x --hardNegBoost
//   F  combined B+C+D+E: all four correction terms together, per the
//      error-analysis.md "Consequences for training" items 2-4 (utility
//      alignment penalizing large-gap overrides, outcome-aware weighting,
//      kind calibration, hard-negative focus). On hard-flip frames the
//      observed (flipped) row is the ranking pos, so B's utility targets
//      demote the flipped action while E's boost strengthens the frame -
//      the loss-level equivalent of relabeling hard flips toward the rule
//      top-1 without changing the observed/pos contract
//
// Every variant also reports the §7 bias metrics on the validation split:
// flipRate, flipToLowerRate, mean rule-utility delta on flips, and the
// model-vs-rule top-1 kind shares (naval/invest focus).
//
// Dataset contract: build-dataset.cjs rows (v5 rows + ru/hardNeg/
// frameLandDelta600/ruleTop1). The plain v5 dataset (no extra fields) is
// also accepted: variants then degrade gracefully (B/D no-op terms).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const candidate = require('./candidate-policy-v5.cjs');
const { buildRankGroups } = require('./train-v5rank.cjs');
const { sideOf } = require('./train-v5.cjs');
const lab = require('./v5-labels.cjs');

function arg(name, def){
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const HIDDEN = 20, INPUTS = 32, OUTPUTS = 2;
const hiddenBias = INPUTS * HIDDEN;
const outStart = hiddenBias + HIDDEN;
const outBias = outStart + HIDDEN * OUTPUTS;
const LENGTH = outBias + OUTPUTS; // 702
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
// Mirror buildRankGroups' group selection (same order, same filters) and
// attach the dataset row objects each group row refers to, so the trainer
// can read ru/hardNeg/ruleTop1 per group-local row position.
function groupKeys(dataset, splitPct){
  const horizonTicks = Number(dataset.horizonTicks) || 600;
  const landScale = Number(dataset.landScale) || 800;
  const trainKeys = [], valKeys = [];
  for (let matchIdx = 0; matchIdx < dataset.matches.length; matchIdx++){
    const match = dataset.matches[matchIdx];
    const side = sideOf(String(match.matchId), splitPct);
    const frames = (match.frames || []).slice()
      .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
    if (!frames.length) continue;
    const labels = lab.buildLabels(frames,
      {horizonTicks, landScale, matchOutcome: match.outcome});
    const groups = [];
    for (let i = 0; i < frames.length; i++){
      if (i > 0 && frames[i].tick === frames[i - 1].tick)
        groups[groups.length - 1].push(i);
      else groups.push([i]);
    }
    const push = (g, rows) => (side === 'train' ? trainKeys : valKeys).push({matchIdx, rows});
    for (const g of groups){
      let pos = -1; const negs = [];
      for (let r = 0; r < g.length; r++){
        const fi = g[r];
        const f = frames[fi];
        const row = labels[fi];
        const observed = f.observed !== false;
        if (observed && row && row.usable && row.heldGain != null && row.lossRisk != null) pos = r;
        else if (!observed) negs.push(r);
      }
      if (pos < 0 || negs.length === 0) continue;
      push(g, g.map(fi => frames[fi]));
    }
  }
  return { trainKeys, valKeys };
}
const rowMetaOf = f => ({ ru: f.ru ?? null, hardNeg: !!f.hardNeg,
  ruleTop1: !!f.ruleTop1, kind: String(f.action?.type || '').toLowerCase() });
const keysToGm = keys => keys.map(k => ({ matchIdx: k.matchIdx,
  metas: k.rows.map(rowMetaOf) }));

function lossAndGrad(w, groups, gm, cfg){
  const G = groups.length;
  const grad = new Float64Array(LENGTH);
  const biasGrad = cfg.bias ? new Float64Array(cfg.kinds.length) : null;
  let loss = 0;
  for (let gi = 0; gi < G; gi++){
    const g = groups[gi];
    const gMeta = gm[gi]; // {matchIdx, metas: group-local row position -> meta}
    const metas = gMeta.metas;
    const fwd = g.rows.map(r => forward(r.x, w));
    const pos = g.posIdx, negs = g.negIdx;
    const posMeta = metas[pos];
    const negMetas = negs.map(ni => metas[ni]);
    const kPos = posMeta.kind;
    const outPos = fwd[pos].out;
    const nNeg = negs.length;
    let gw = 1;
    if (cfg.useOutcomeWeight) gw = cfg.outcomeWeight[gm[gi].outcome] ?? 1;
    if (cfg.useHardNegBoost && posMeta.hardNeg) gw *= cfg.hardNegBoost;
    let ruMin = null, ruMax = null;
    if (cfg.useUtilityAlign){
      const rus = [posMeta, ...negMetas].filter(mm => mm.ru != null);
      if (rus.length >= 2){
        ruMin = Math.min(...rus.map(mm => mm.ru));
        ruMax = Math.max(...rus.map(mm => mm.ru));
      }
    }
    const utilTarget = mm => (cfg.useUtilityAlign && mm.ru != null && ruMax > ruMin) ?
      (mm.ru - ruMin) / (ruMax - ruMin) : null;
    const biasOf = k => cfg.bias ? cfg.bias[cfg.kinds.indexOf(k)] : 0;
    const dPos = new Float64Array(OUTPUTS);
    const dNeg = negs.map(() => new Float64Array(OUTPUTS));
    let groupLoss = 0;
    if (nNeg){
      for (let ni = 0; ni < nNeg; ni++){
        const outNeg = fwd[negs[ni]].out;
        const s = (outPos[0] - outPos[1]) - (outNeg[0] - outNeg[1]) + biasOf(kPos) - biasOf(negMetas[ni].kind);
        const dLdz = sig(s) - 1;
        const dS = gw * cfg.lambda * (1 / nNeg) * dLdz;
        dPos[0] += dS; dPos[1] -= dS;
        dNeg[ni][0] -= dS; dNeg[ni][1] += dS;
        groupLoss += (cfg.lambda / nNeg) * -Math.log(clamp01(sig(s)));
      }
      if (biasGrad){
        for (let ni = 0; ni < nNeg; ni++){
          const outNeg = fwd[negs[ni]].out;
          const s = (outPos[0] - outPos[1]) - (outNeg[0] - outNeg[1]) + biasOf(kPos) - biasOf(negMetas[ni].kind);
          const dLds = gw * cfg.lambda * (1 / nNeg) * (sig(s) - 1);
          biasGrad[cfg.kinds.indexOf(kPos)] += dLds;
          biasGrad[cfg.kinds.indexOf(negMetas[ni].kind)] -= dLds;
        }
      }
    }
    if (cfg.useUtilityAlign){
      const nUtil = 1 + negMetas.filter(mm => utilTarget(mm) != null).length;
      const up = utilTarget(posMeta);
      if (up != null){
        const s = (outPos[0] - outPos[1]) + biasOf(kPos);
        const dS = gw * (cfg.ruWeight / nUtil) * 2 * (s - up);
        dPos[0] += dS; dPos[1] -= dS;
        groupLoss += cfg.ruWeight * (s - up) * (s - up) / nUtil;
      }
      for (let ni = 0; ni < nNeg; ni++){
        const un = utilTarget(negMetas[ni]);
        if (un == null) continue;
        const outNeg = fwd[negs[ni]].out;
        const s = (outNeg[0] - outNeg[1]) + biasOf(negMetas[ni].kind);
        const dS = gw * (cfg.ruWeight / nUtil) * 2 * (s - un);
        dNeg[ni][0] += dS; dNeg[ni][1] -= dS;
        groupLoss += cfg.ruWeight * (s - un) * (s - un) / nUtil;
      }
    }
    backpropFromOutDelta(g.rows[pos].x, fwd[pos].h, fwd[pos].out, dPos, w, grad);
    for (let ni = 0; ni < nNeg; ni++)
      backpropFromOutDelta(g.rows[negs[ni]].x, fwd[negs[ni]].h, fwd[negs[ni]].out, dNeg[ni], w, grad);
    loss += groupLoss;
  }
  const scale = 1 / G;
  for (let p = 0; p < LENGTH; p++) grad[p] *= scale;
  if (biasGrad) for (let k = 0; k < biasGrad.length; k++) biasGrad[k] *= scale;
  return { loss: scale * loss, grad, biasGrad };
}

// §7 bias metrics: model top-1 vs rule top-1 per validation frame.
function biasMetrics(w, groups, gm, cfg){
  let frames = 0, flips = 0, worse = 0, ruSum = 0;
  const kindModel = {}, kindRule = {};
  for (let gi = 0; gi < groups.length; gi++){
    const g = groups[gi];
    const metas = gm[gi].metas;
    const ruRows = g.rows.map((r, i) => ({ i, ru: metas[i].ru, kind: metas[i].kind }))
      .filter(o => o.ru != null);
    if (ruRows.length < 2) continue;
    let ruleTop = ruRows[0];
    for (const o of ruRows) if (o.ru > ruleTop.ru) ruleTop = o;
    let modelTop = 0, modelBest = -Infinity;
    for (let i = 0; i < g.rows.length; i++){
      const f = forward(g.rows[i].x, w);
      const s = f.out[0] - f.out[1] + (cfg.bias ? cfg.bias[cfg.kinds.indexOf(metas[i].kind)] : 0);
      if (s > modelBest){ modelBest = s; modelTop = i; }
    }
    const mKind = metas[modelTop].kind;
    const mRu = metas[modelTop].ru;
    frames++;
    kindModel[mKind] = (kindModel[mKind] || 0) + 1;
    kindRule[ruleTop.kind] = (kindRule[ruleTop.kind] || 0) + 1;
    if (mKind !== ruleTop.kind){
      flips++;
      if (mRu != null && mRu < ruleTop.ru) worse++;
      ruSum += ruleTop.ru - (mRu ?? ruleTop.ru);
    }
  }
  const share = obj => Object.fromEntries(
    Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / frames).toFixed(4)]));
  return { frames, flips, flipRate: +(flips / Math.max(1, frames)).toFixed(4),
    flipToLowerRate: +(worse / Math.max(1, flips)).toFixed(4),
    meanRuDeltaOnFlip: +(ruSum / Math.max(1, flips)).toFixed(4),
    kindShareModel: share(kindModel), kindShareRule: share(kindRule) };
}

function shaOf(w){
  let s = '';
  for (let i = 0; i < w.length; i++) s += w[i];
  return crypto.createHash('sha256').update(s).digest('hex');
}

function main(){
  const variant = arg('--variant', 'A').toUpperCase();
  if (!['A', 'B', 'C', 'D', 'E', 'F'].includes(variant))
    throw Error('--variant A|B|C|D|E|F');
  const out = path.resolve(arg('--out', ''));
  if (!out) throw Error('--out <dir> is required');
  if (fs.existsSync(out) && fs.readdirSync(out).length > 0) throw Error('Output directory already exists: ' + out);
  const epoch = Number(arg('--epoch', '200'));
  const lr = Number(arg('--lr', '0.1'));
  const splitPct = Number(arg('--splitPct', '21'));
  const lambda = Number(arg('--lambda', '1'));
  const seed = Number(arg('--seed', '1337'));
  const bagSize = Number(arg('--bagSize', '96'));
  const ruWeight = Number(arg('--ruWeight', '0.5'));
  const hardNegBoost = Number(arg('--hardNegBoost', '3'));
  const biasL2 = Number(arg('--biasL2', '0.001'));
  const dataset = JSON.parse(fs.readFileSync(path.resolve(arg('--dataset', '')), 'utf8'));
  const { train, val } = buildRankGroups(dataset, splitPct);
  if (!train.length || !val.length) throw Error('No trainable groups');
  const keys = groupKeys(dataset, splitPct);
  if (keys.trainKeys.length !== train.length || keys.valKeys.length !== val.length)
    throw Error('groupKeys/buildRankGroups mismatch: ' +
      keys.trainKeys.length + '/' + train.length + ' train, ' +
      keys.valKeys.length + '/' + val.length + ' val');
  const outcomes = dataset.matches.map(m => m.outcome || 'unknown');
  const gmTrain = keysToGm(keys.trainKeys).map((k, i) => ({ ...k, outcome: outcomes[k.matchIdx] }));
  const gmVal = keysToGm(keys.valKeys).map(k => ({ ...k, outcome: outcomes[k.matchIdx] }));
  const kinds = [...new Set(gmTrain.flatMap(k => k.metas.map(m => m.kind)).concat(
    gmVal.flatMap(k => k.metas.map(m => m.kind))))].sort();
  const hasBias = variant === 'D' || variant === 'F';
  const bias = hasBias ? new Float64Array(kinds.length) : null;
  const cfg = { variant, lambda, ruWeight, hardNegBoost, biasL2,
    useOutcomeWeight: variant === 'C' || variant === 'F',
    useUtilityAlign: variant === 'B' || variant === 'F',
    useHardNegBoost: variant === 'E' || variant === 'F',
    outcomeWeight: { victory: 1.5, defeat: 0.5, unknown: 1 }, kinds, bias };
  const w = new Float64Array(LENGTH);
  const scale = Math.sqrt(6 / (INPUTS + HIDDEN));
  let s0 = seed >>> 0;
  const init = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296 - 0.5; };
  for (let i = 0; i < LENGTH; i++) w[i] = init() * scale;
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
    let lastLoss = null;
    for (let b = 0; b < order.length; b += bagSize){
      const idxs = order.slice(b, b + bagSize);
      const bag = idxs.map(i => train[i]);
      const bagGm = idxs.map(i => gmTrain[i]);
      const { loss, grad, biasGrad } = lossAndGrad(w, bag, bagGm, cfg);
      if (!Number.isFinite(loss)) throw Error('Loss diverged at epoch ' + e);
      for (let p = 0; p < LENGTH; p++) w[p] = clampW(w[p] - lr * grad[p]);
      if (bias && biasGrad)
        for (let k = 0; k < bias.length; k++)
          bias[k] = clampW(bias[k] - lr * (biasGrad[k] + cfg.biasL2 * bias[k]));
      lastLoss = loss;
    }
    if ((e + 1) % 25 === 0 || e === 0 || e === epoch - 1){
      const vl = lossAndGrad(w, val, gmVal, cfg).loss;
      curve.push({ epoch: e + 1, trainLoss: +(lastLoss ?? 0).toFixed(6), valLoss: +vl.toFixed(6) });
    }
  }
  const metrics = biasMetrics(w, val, gmVal, { ...cfg, bias: hasBias ? bias : null });
  const model = { schema: 5, arch: '32x20x2-tanh', outputs: ['heldGain', 'lossRisk'],
    weights: Array.from(w), sha256: shaOf(w),
    training: {
      generatedBy: 'trainer/train-v5fn-variants.cjs', variant,
      length: LENGTH, epoch, lr, splitPct, lambda, seed, bagSize,
      ruWeight, hardNegBoost, biasL2,
      curve, wallMs: Date.now() - t0,
      kindBias: hasBias ? Object.fromEntries(kinds.map((k, i) => [k, +bias[i].toFixed(6)])) : null,
      biasMetrics: metrics } };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'model.json'), JSON.stringify(model, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'training.json'), JSON.stringify({
    variant, epoch, lr, splitPct, lambda, seed, bagSize, ruWeight, hardNegBoost, biasL2,
    trainGroups: train.length, valGroups: val.length,
    wallMs: Date.now() - t0, finalValLoss: curve[curve.length - 1].valLoss,
    biasMetrics: metrics }, null, 2) + '\n');
  console.log(JSON.stringify({ out, variant, finalValLoss: curve[curve.length - 1].valLoss,
    flipRate: metrics.flipRate, flipToLowerRate: metrics.flipToLowerRate,
    meanRuDeltaOnFlip: metrics.meanRuDeltaOnFlip,
    navalModel: metrics.kindShareModel.naval ?? 0, navalRule: metrics.kindShareRule.naval ?? 0,
    investModel: metrics.kindShareModel.invest ?? 0, investRule: metrics.kindShareRule.invest ?? 0,
    wallMs: Date.now() - t0 }));
}
if (require.main === module) main();
module.exports = { LENGTH, HIDDEN, lossAndGrad, groupKeys, biasMetrics,
  rowMetaOf, keysToGm };
