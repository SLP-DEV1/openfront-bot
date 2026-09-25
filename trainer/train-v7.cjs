#!/usr/bin/env node
'use strict';
// Schema-7 branch-policy trainer: branch-group ranking on the 38-dim v7
// feature contract (trainer/action-policy-v7.cjs), on BOTH archs
// 38x24x2-tanh and 38x40x2-tanh. NEW model generation (Schema 6 was a
// negative result: the candidate-level re-ranking never changed the emitted
// action). Schema 7 sits AFTER hard legality/safety and BEFORE send(kind,
// args): it scores the set of currently executable concrete branches and the
// argmax is emitted 1:1. Hard safety stays OUTSIDE the learning decision.
//
// Approach A (branchScore) per the v7 contract: a single bounded score per
// branch; the ranking objective pushes the OBSERVED (executed) branch above
// every UNOBSERVED branch in the same frame. Unobserved branches act only as
// the "beaten" side of the pairwise ranking (no false counterfactual labels).
//
// Objectives (same backbone, one helper each):
//   S7-A ranking baseline (observed branch above unobserved branches)
//   S7-B + utility alignment (helper term pulling the score toward the
//        frame-normalized rule utility; rule utility is a helper signal, not
//        ground truth)
//   S7-C outcome-aware ranking (group loss weighted by match outcome and by
//        how clear the long-term effect is, |frame land delta|)
//   S7-D hard-negative ranking (frames where the rule's top-1 branch is NOT
//        the executed one get a boosted positive weight — the model must
//        override the rule there)
//   S7-E combined (B + C + D)
//
// Oversampling: if the executed (positive) branch kind is rare (e.g. attack/
// expand), those frames are weighted up (capped) so the model sees them at a
// usable frequency; the factor is documented in the model contract.
//
// Metrics on the validation split:
//   valRankLoss, crossBranchSpread, decisionAccuracy (model argmax == observed
//   branch), kindSelectionDistribution, hardNegativeAccuracy, flipToLowerRate,
//   flipToHigherRate.
//
// Output model contract (schema 7): {schema, arch, outputs:['branchScore'],
// weights, sha256, training:{...}}. The runtime kernel (action-policy-v7)
// validates and predicts with the EXACT same weight layout as this trainer's
// forward, so train/runtime parity holds by construction.
const fs = require('fs');
const path = require('path');
const candidate = require('./action-policy-v7.cjs');
const { sideOf } = require('./train-v5.cjs');

function arg(name, def){
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const INPUTS = candidate.INPUTS; // 38
const OUTPUTS = candidate.OUTPUTS; // 1 (branchScore)
const tanh = Math.tanh, sig = z => 1 / (1 + Math.exp(-z)),
  clamp01 = v => Math.min(1, Math.max(0, v)),
  clampW = v => Math.min(5, Math.max(-5, v));

// Weight layout (identical to action-policy-v7.predict):
//   [0, 38*H)     input->hidden   w[i*H + j]
//   [38*H, 39*H)  hidden bias     w[38*H + j]
//   [39*H, 40*H)  hidden->out     w[39*H + j*1 + 0]
//   [40*H, 40*H+1) out bias       w[40*H]
const hiddenBiasOf = H => INPUTS * H;
const outStartOf = H => hiddenBiasOf(H) + H;
const outBiasOf = H => outStartOf(H) + H * OUTPUTS;
const lengthOf = H => outBiasOf(H) + OUTPUTS;

function forward(x, w, H){
  const h = new Float64Array(H);
  const hb = hiddenBiasOf(H), outStart = outStartOf(H), outBias = outBiasOf(H);
  for (let j = 0; j < H; j++){
    let z = w[hb + j];
    for (let i = 0; i < INPUTS; i++) z += x[i] * w[i * H + j];
    h[j] = tanh(z);
  }
  const out = new Float64Array(OUTPUTS);
  for (let k = 0; k < OUTPUTS; k++){
    let z = w[outBias + k];
    for (let j = 0; j < H; j++) z += w[outStart + j * OUTPUTS + k] * h[j];
    out[k] = (1 + tanh(z)) / 2;
  }
  return { h, out };
}
function backpropFromOutDelta(x, h, out, dOut, w, H, grad){
  const hb = hiddenBiasOf(H), outStart = outStartOf(H), outBias = outBiasOf(H);
  const dzout = new Float64Array(OUTPUTS);
  for (let k = 0; k < OUTPUTS; k++){
    const t = 2 * out[k] - 1; dzout[k] = dOut[k] * (1 - t * t) / 2;
  }
  for (let k = 0; k < OUTPUTS; k++){
    grad[outBias + k] += dzout[k];
    for (let j = 0; j < H; j++) grad[outStart + j * OUTPUTS + k] += dzout[k] * h[j];
  }
  for (let j = 0; j < H; j++){
    let dh = 0;
    for (let k = 0; k < OUTPUTS; k++) dh += dzout[k] * w[outStart + j * OUTPUTS + k];
    dh *= 1 - h[j] * h[j];
    grad[hb + j] += dh;
    for (let i = 0; i < INPUTS; i++) grad[i * H + j] += dh * x[i];
  }
}
// 38-dim v7 features for a dataset row (state + branch + rule-utility ctx).
// action-policy-v7.features IS the runtime feature function, so parity holds
// by construction.
function v7RowFeatures(row){
  return candidate.features(row.state, row.branch, row.ctx);
}
// Build branch-group ranking groups with the 38-dim contract. A group is one
// planning tick: the OBSERVED (executed) branch is the positive, the
// unobserved branches in the same frame are the negatives. Rows carry meta
// (kind, own rule utility, frame rule top-1) for the objectives + metrics.
function buildV7Groups(dataset, splitPct){
  const train = [], val = [];
  for (let mi = 0; mi < dataset.matches.length; mi++){
    const match = dataset.matches[mi];
    const side = sideOf(String(match.matchId), splitPct);
    const frames = (match.frames || []).slice()
      .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
    if (!frames.length) continue;
    // One group per planning tick: consecutive frames sharing a tick.
    const groups = [];
    for (let i = 0; i < frames.length; i++){
      if (i > 0 && frames[i].tick === frames[i - 1].tick)
        groups[groups.length - 1].push(i);
      else groups.push([i]);
    }
    const push = g => (side === 'train' ? train : val).push(g);
    for (const g of groups){
      const rows = [], metas = [];
      let pos = -1; const negs = [];
      for (let r = 0; r < g.length; r++){
        const fi = g[r];
        const f = frames[fi];
        const kind = String(f.branch?.kind || '');
        rows.push({ x: v7RowFeatures(f), kind });
        metas.push({ kind, ru: f.ctx.ownRu ?? null,
          ruleTop1: f.ctx.ruleTop1 ?? null, observed: !!f.observed });
        if (f.observed) pos = r;
        else negs.push(r);
      }
      if (pos < 0 || negs.length === 0) continue;
      const obsRu = frames[g[pos]].ctx.ownRu;
      const top1 = frames[g[pos]].ctx.ruleTop1;
      push({ rows, posIdx: pos, negIdx: negs, metas, matchIdx: mi,
        outcome: match.outcome || 'unknown', posKind: metas[pos].kind,
        // Hard frame: the rule ranked a DIFFERENT branch above the executed
        // one, so the model must override the rule to match the emission.
        hardNeg: (obsRu != null && top1 != null &&
          obsRu < top1 - 1e-6),
        frameLandDelta: frames[g[pos]].frameLandDelta600 ?? null });
    }
  }
  return { train, val };
}
// Per-group training weight: boost rare executed kinds up to `oversampleMin`
// of all training groups, capped at `maxOversample`.
function groupWeights(groups, oversampleMin, maxOversample){
  const target = Math.ceil(oversampleMin * groups.length);
  const count = {};
  for (const g of groups) count[g.posKind] = (count[g.posKind] || 0) + 1;
  const weights = groups.map(g => {
    const c = count[g.posKind] || 0;
    if (c >= target) return 1;
    return Math.min(maxOversample, target / c);
  });
  return { weights, count, target };
}
// Pairwise ranking loss + gradient on the single branchScore output. For a
// frame: margin s = score(observed) - score(unobserved); loss = -log(sig(s)).
// Optional helpers (variant B) pull each score toward its frame-normalized
// rule utility.
function lossAndGrad(w, H, groups, cfg){
  const L = lengthOf(H);
  const grad = new Float64Array(L);
  let loss = 0, weightSum = 0;
  for (let gi = 0; gi < groups.length; gi++){
    const g = groups[gi];
    const fwd = g.rows.map(r => forward(r.x, w, H));
    const pos = g.posIdx, negs = g.negIdx, nNeg = negs.length;
    const posScore = fwd[pos].out[0];
    let gw = 1;
    if (cfg.useOutcomeWeight){
      const outcome = cfg.outcomes[gi] ?? 'unknown';
      gw = cfg.outcomeWeight[outcome] ?? 1;
      const ld = cfg.landDelta?.[gi] ?? null;
      if (Number.isFinite(ld))
        gw *= (0.5 + clamp01(Math.abs(ld) / cfg.landScale));
    }
    if (cfg.useHardNegBoost && g.hardNeg) gw *= cfg.hardNegBoost;
    const gWeight = gw * (cfg.weights ? cfg.weights[gi] : 1);
    weightSum += gWeight;
    let ruMin = null, ruMax = null;
    if (cfg.useUtilityAlign){
      const rus = g.metas.map(m => m.ru).filter(v => v != null);
      if (rus.length >= 2){ ruMin = Math.min(...rus); ruMax = Math.max(...rus); }
    }
    const utilTarget = i => (cfg.useUtilityAlign && g.metas[i].ru != null &&
      ruMax > ruMin) ? (g.metas[i].ru - ruMin) / (ruMax - ruMin) : null;
    const dPos = new Float64Array(OUTPUTS);
    const dNeg = negs.map(() => new Float64Array(OUTPUTS));
    let groupLoss = 0;
    for (let ni = 0; ni < nNeg; ni++){
      const s = posScore - fwd[negs[ni]].out[0];
      const dLdz = sig(s) - 1;
      const dS = gWeight * cfg.lambda * (1 / nNeg) * dLdz;
      dPos[0] += dS; dNeg[ni][0] -= dS;
      groupLoss += gWeight * (cfg.lambda / nNeg) * -Math.log(clamp01(sig(s)));
    }
    if (cfg.useUtilityAlign){
      const nUtil = 1 + negs.filter(ni => utilTarget(ni) != null).length;
      const applyUtil = (rIdx, dArr) => {
        const ut = utilTarget(rIdx);
        if (ut == null) return 0;
        const sc = fwd[rIdx].out[0];
        const dU = gWeight * (cfg.ruWeight / nUtil) * 2 * (sc - ut);
        dArr[0] += dU;
        return gWeight * cfg.ruWeight * (sc - ut) * (sc - ut) / nUtil;
      };
      groupLoss += applyUtil(pos, dPos);
      for (let ni = 0; ni < nNeg; ni++) groupLoss += applyUtil(negs[ni], dNeg[ni]);
    }
    backpropFromOutDelta(g.rows[pos].x, fwd[pos].h, fwd[pos].out, dPos, w, H, grad);
    for (let ni = 0; ni < nNeg; ni++)
      backpropFromOutDelta(g.rows[negs[ni]].x, fwd[negs[ni]].h,
        fwd[negs[ni]].out, dNeg[ni], w, H, grad);
    loss += groupLoss;
  }
  const scale = weightSum > 0 ? 1 / weightSum : 1;
  for (let p = 0; p < L; p++) grad[p] *= scale;
  return { loss: scale * loss, grad };
}
// Metrics on a split.
function metrics(w, H, groups){
  let rankLoss = 0, nGroups = 0, spreadSum = 0, spreadCount = 0, agree = 0;
  const kindModel = {};
  let frames = 0, worse = 0, higher = 0, hnFrames = 0, hnOk = 0;
  for (const g of groups){
    const fwd = g.rows.map(r => forward(r.x, w, H));
    const pos = g.posIdx, negs = g.negIdx, nNeg = negs.length;
    if (nNeg){
      let gl = 0;
      const ps = fwd[pos].out[0];
      for (const ni of negs) gl += -Math.log(clamp01(sig(ps - fwd[ni].out[0])));
      rankLoss += gl / nNeg; nGroups++;
    }
    // cross-branch spread of the score (confidence dispersion).
    const scores = g.rows.map((r, i) => fwd[i].out[0]);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sd = Math.sqrt(
      scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
    spreadSum += sd; spreadCount++;
    // model top-1 (highest branchScore) vs observed (decision accuracy).
    let modelTop = 0, modelBest = -Infinity;
    for (let i = 0; i < scores.length; i++)
      if (scores[i] > modelBest){ modelBest = scores[i]; modelTop = i; }
    const mKind = g.metas[modelTop].kind;
    kindModel[mKind] = (kindModel[mKind] || 0) + 1;
    if (mKind === g.posKind) agree++;
    // rule top-1 (highest ruleUtility) vs model top-1 (flip direction).
    const ruRows = g.rows.map((r, i) => ({ i, ru: g.metas[i].ru }))
      .filter(o => o.ru != null);
    if (ruRows.length >= 2){
      let ruleTop = ruRows[0];
      for (const o of ruRows) if (o.ru > ruleTop.ru) ruleTop = o;
      const mRu = g.metas[modelTop].ru;
      frames++;
      if (mKind !== g.metas[ruleTop.i].kind){
        if (mRu != null && mRu < ruleTop.ru) worse++;
        else if (mRu != null && mRu > ruleTop.ru) higher++;
      }
      if (g.hardNeg){
        hnFrames++;
        // In a hard frame the model should pick the executed (observed)
        // branch even though the rule disagrees.
        if (modelTop === pos) hnOk++;
      }
    }
  }
  const share = obj => Object.fromEntries(
    Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      [k, +(v / Math.max(1, nGroups)).toFixed(4)]));
  return {
    valRankLoss: nGroups ? +(rankLoss / nGroups).toFixed(6) : null,
    crossBranchSpread: spreadCount ? +(spreadSum / spreadCount).toFixed(6) : null,
    decisionAccuracy: nGroups ? +(agree / nGroups).toFixed(4) : null,
    kindSelectionDistribution: share(kindModel),
    hardNegativeAccuracy: hnFrames ? +(hnOk / hnFrames).toFixed(4) : null,
    hardNegativeFrames: hnFrames,
    flipToLowerRate: frames ? +(worse / frames).toFixed(4) : null,
    flipToHigherRate: frames ? +(higher / frames).toFixed(4) : null,
    flipFrames: frames };
}
function main(){
  const variant = arg('--variant', 'A').toUpperCase();
  if (!['A', 'B', 'C', 'D', 'E'].includes(variant))
    throw Error('--variant A|B|C|D|E');
  const arch = arg('--arch', '38x24x2-tanh');
  const H = candidate.HIDDEN_BY_ARCH[arch];
  if (H === undefined) throw Error('Invalid schema-7 arch ' + arch);
  const out = path.resolve(arg('--out', ''));
  if (!out) throw Error('--out <dir> is required');
  if (fs.existsSync(out) && fs.readdirSync(out).length > 0)
    throw Error('Output directory already exists: ' + out);
  const epoch = Number(arg('--epoch', '120'));
  const lr = Number(arg('--lr', '0.1'));
  const splitPct = Number(arg('--splitPct', '21'));
  const lambda = Number(arg('--lambda', '1'));
  const seed = Number(arg('--seed', '1337'));
  const bagSize = Number(arg('--bagSize', '96'));
  const ruWeight = Number(arg('--ruWeight', '0.5'));
  const hardNegBoost = Number(arg('--hardNegBoost', '3'));
  const oversampleMin = Number(arg('--oversampleMin', '0.05'));
  const maxOversample = Number(arg('--maxOversample', '5'));
  const datasetPath = path.resolve(arg('--dataset', ''));
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const datasetSha = require('crypto').createHash('sha256')
    .update(fs.readFileSync(datasetPath)).digest('hex');

  const { train, val } = buildV7Groups(dataset, splitPct);
  if (!train.length || !val.length) throw Error('No trainable groups');
  const { weights, count, target } = groupWeights(train, oversampleMin,
    maxOversample);
  const landScale = Number(dataset.landScale) || 800;
  const cfg = { variant, lambda, ruWeight, hardNegBoost,
    useOutcomeWeight: variant === 'C' || variant === 'E',
    useUtilityAlign: variant === 'B' || variant === 'E',
    useHardNegBoost: variant === 'D' || variant === 'E',
    outcomeWeight: { victory: 1.5, defeat: 0.5, unknown: 1 },
    landScale,
    weights,
    outcomes: train.map(g => g.outcome),
    landDelta: train.map(g => g.frameLandDelta ?? null) };

  const L = lengthOf(H);
  const w = new Float64Array(L);
  const scale = Math.sqrt(6 / (INPUTS + H));
  let s0 = seed >>> 0;
  const init = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0;
    return s0 / 4294967296 - 0.5; };
  for (let i = 0; i < L; i++) w[i] = init() * scale;
  let rng = (seed ^ 0x9e3779b9) >>> 0;
  const rand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296; };
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
      const bagCfg = { ...cfg,
        weights: idxs.map(i => cfg.weights[i]),
        outcomes: idxs.map(i => cfg.outcomes[i]),
        landDelta: idxs.map(i => cfg.landDelta[i]) };
      const { loss, grad } = lossAndGrad(w, H, bag, bagCfg);
      if (!Number.isFinite(loss)) throw Error('Loss diverged at epoch ' + e);
      for (let p = 0; p < L; p++) w[p] = clampW(w[p] - lr * grad[p]);
      lastLoss = loss;
    }
    if ((e + 1) % 20 === 0 || e === 0 || e === epoch - 1){
      const vl = lossAndGrad(w, H, val, { ...cfg, weights: val.map(() => 1),
        outcomes: val.map(g => g.outcome), landDelta: val.map(() => null) })
        .loss;
      curve.push({ epoch: e + 1, trainLoss: +(lastLoss ?? 0).toFixed(6),
        valLoss: +vl.toFixed(6) });
    }
  }
  const valMetrics = metrics(w, H, val);
  const model = { schema: 7, arch, outputs: ['branchScore'],
    weights: Array.from(w),
    training: {
      generatedBy: 'trainer/train-v7.cjs', variant,
      schema: 7, featureSchemaVersion: 4,
      featureNames: require('./v7-features.cjs').MANIFEST.map(m => m[0]),
      weightCount: L, arch,
      dataset: path.basename(datasetPath), datasetSHA256: datasetSha,
      length: L, epoch, lr, splitPct, lambda, seed, bagSize,
      ruWeight, hardNegBoost,
      oversample: { min: oversampleMin, max: maxOversample, target,
        positiveKindCounts: count },
      curve, wallMs: Date.now() - t0,
      metrics: valMetrics } };
  model.sha256 = candidate.sha(model);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'model.json'), JSON.stringify(model, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'training.json'), JSON.stringify({
    variant, arch, epoch, lr, splitPct, lambda, seed, bagSize, ruWeight,
    hardNegBoost, oversample: model.training.oversample,
    trainGroups: train.length, valGroups: val.length,
    wallMs: Date.now() - t0, finalValLoss: curve[curve.length - 1].valLoss,
    metrics: valMetrics }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'evaluation.json'), JSON.stringify({
    arch, variant, splitPct, metrics: valMetrics }, null, 2) + '\n');
  console.log(JSON.stringify({ out, arch, variant,
    finalValLoss: curve[curve.length - 1].valLoss,
    valRankLoss: valMetrics.valRankLoss,
    decisionAccuracy: valMetrics.decisionAccuracy,
    flipToLowerRate: valMetrics.flipToLowerRate,
    flipToHigherRate: valMetrics.flipToHigherRate,
    hardNegativeAccuracy: valMetrics.hardNegativeAccuracy,
    crossBranchSpread: valMetrics.crossBranchSpread,
    trainGroups: train.length, valGroups: val.length,
    wallMs: Date.now() - t0 }));
}
if (require.main === module) main();
module.exports = { INPUTS, OUTPUTS, forward, backpropFromOutDelta,
  buildV7Groups, groupWeights, lossAndGrad, metrics, v7RowFeatures,
  hiddenBiasOf, outStartOf, outBiasOf, lengthOf };
