#!/usr/bin/env node
'use strict';
// Schema-6 core trainer: candidate-group ranking on the 38-dim v6 feature
// contract (trainer/candidate-policy-v6.cjs), on BOTH archs 38x24x2-tanh and
// 38x40x2-tanh. This is a NEW model generation, not a Schema-5 fine-tune:
// the 38-dim vector carries an explicit one-hot for every action kind the
// planner can emit (hold/invest/attack/expand/naval/support, idx 29-34) and a
// bounded rule-utility context (idx 35-37: own utility, gap to rule top-1/2)
// that is computable identically at training (per-frame binding) and at
// inference (the candidate set is rule-sorted before scoring), so
// train/runtime parity holds by construction.
//
// Objectives (mission 10), all on the same candidate-group ranking backbone:
//   S6-A ranking baseline (observed action above unobserved candidates)
//   S6-B + utility alignment (helper term toward frame-normalized rule
//        utility; rule utility is a helper signal, not ground truth)
//   S6-C outcome-aware ranking (group loss weighted by match outcome and by
//        how clear the long-term effect is)
//   S6-D hard-negative ranking (frames flagged in hard-negatives.json get a
//        boosted positive weight)
//   S6-E combined (B + C + D)
//
// The ranking objective ranks the OBSERVED (executed) candidate above the
// unobserved candidates in the same frame. Unobserved candidates keep null
// targets (mission 9: no false counterfactual labels) and act only as the
// "beaten" side of the pairwise ranking.
//
// Mission 8 oversampling: if expand or attack is < 5% of the ranking-suitable
// training groups, those positive groups are weighted up (capped) so the
// model sees them at a usable frequency; the factor is documented.
//
// Mission 12 metrics on the validation split:
//   valRankLoss, crossCandidateSpread, decisionAccuracy,
//   kindSelectionDistribution, hardNegativeAccuracy, flipToLowerRate,
//   flipToHigherRate
//
// Output model contract (schema 6): {schema, arch, outputs, weights,
// sha256, training:{...}}. The runtime kernel (candidate-policy-v6) validates
// and predicts with the exact same weight layout as this trainer's forward.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const candidate = require('./candidate-policy-v6.cjs');
const { sideOf } = require('./train-v5.cjs');
const lab = require('./v5-labels.cjs');

function arg(name, def){
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const INPUTS = candidate.INPUTS; // 38
const OUTPUTS = candidate.OUTPUTS; // 2
const tanh = Math.tanh, sig = z => 1 / (1 + Math.exp(-z)),
  clamp01 = v => Math.min(1, Math.max(0, v));
const clampW = v => Math.min(5, Math.max(-5, v));

// Weight layout (identical to candidate-policy-v6.predict / train-v5rank):
//   [0, 38*H)      input->hidden   w[i*H + j]
//   [38*H, 41*H)  hidden bias     w[38*H + j]
//   [41*H, 43*H)  hidden->out     w[41*H + j*2 + k]
//   [43*H, 43*H+2) out bias       w[43*H + k]
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
  for (let k = 0; k < OUTPUTS; k++){ const t = 2 * out[k] - 1; dzout[k] = dOut[k] * (1 - t * t) / 2; }
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
// 38-dim v6 features for a dataset row (visibleState + action + ru context).
function v6RowFeatures(row){
  const vs = row.visibleState;
  const st = {home:vs.home, maxTroops:vs.maxTroops, committed:vs.committed,
    incoming:vs.incoming, reserve:vs.reserve, gold:vs.gold, land:vs.land,
    capacityUse:vs.capacityUse, frontCount:vs.frontCount,
    economyRelative:vs.economyRelative ?? 0, frontReach:vs.frontReach ?? 0,
    partnerNeed:vs.partnerNeed ?? 0, enemyBound:vs.enemyBound ?? 0,
    landTrend:vs.landTrend, goldTrend:vs.goldTrend, troopTrend:vs.troopTrend,
    portAccess:vs.portAccess ?? 0, technologyCoverage:vs.technologyCoverage ?? 0};
  const cand = {kind:row.action.type, costTroops:vs.costTroops || 0,
    costGold:vs.costGold || 0, expectedLand:vs.expectedLand || 0,
    duration:vs.duration || 0, returnTime:vs.returnTime || 0,
    counterRisk:vs.counterRisk || 0, thirdPartyRisk:vs.thirdPartyRisk || 0,
    infrastructureValue:vs.infrastructureValue || 0,
    incomeValue:vs.incomeValue || 0, recruitmentValue:vs.recruitmentValue || 0,
    siteRisk:vs.siteRisk || 0, holdProbability:vs.holdProbability ?? 1,
    legalConfidence:vs.legalConfidence};
  const ctx = {ownRu:row.ru, ruTop1:row.ruTop1, ruTop2:row.ruTop2};
  return candidate.features(st, cand, ctx);
}
// Build candidate-group ranking groups with the 38-dim contract. A group is
// one planning tick: the observed (executed) candidate is the positive, the
// unobserved candidates are the negatives. Rows carry their meta (kind, ru,
// ruTop1/2, hardNeg) for the objectives and the 12 metrics.
function buildV6Groups(dataset, splitPct){
  const horizonTicks = Number(dataset.horizonTicks) || 600;
  const landScale = Number(dataset.landScale) || 800;
  const train = [], val = [];
  for (let mi = 0; mi < dataset.matches.length; mi++){
    const match = dataset.matches[mi];
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
    const push = g => (side === 'train' ? train : val).push(g);
    for (const g of groups){
      const rows = [], metas = [];
      let pos = -1; const negs = [];
      for (let r = 0; r < g.length; r++){
        const fi = g[r];
        const f = frames[fi];
        const row = labels[fi];
        const kind = String(f.action?.type || '').toLowerCase();
        rows.push({x: v6RowFeatures(f), y: row});
        metas.push({kind, ru: f.ru ?? null, ruTop1: f.ruTop1 ?? null,
          ruTop2: f.ruTop2 ?? null, hardNeg: !!f.hardNeg,
          ruleTop1: !!f.ruleTop1});
        const observed = f.observed !== false;
        if (observed && row && row.usable && row.heldGain != null && row.lossRisk != null)
          pos = r;
        else if (!observed) negs.push(r);
      }
      if (pos < 0 || negs.length === 0) continue;
      push({rows, posIdx: pos, negIdx: negs, metas, matchIdx: mi,
        outcome: match.outcome || 'unknown', posKind: metas[pos].kind,
        hardNeg: metas[pos].hardNeg,
        frameLandDelta: frames[g[pos]].frameLandDelta600 ?? null});
    }
  }
  return { train, val };
}
// Per-group training weight: boost rare positive kinds (expand/attack) up to
// `oversampleMin` of all training groups, capped at `maxOversample`.
function groupWeights(groups, oversampleMin, maxOversample){
  const target = Math.ceil(oversampleMin * groups.length);
  const count = {};
  for (const g of groups) count[g.posKind] = (count[g.posKind] || 0) + 1;
  const w = groups.map(g => {
    const c = count[g.posKind] || 0;
    if (c >= target) return 1;
    return Math.min(maxOversample, target / c);
  });
  return { weights: w, count, target };
}

// Score margin for the ranking: (heldGain - lossRisk) [+ kindBias if used].
function marginOf(fwd, H, bias, kinds, kind){
  const m = fwd.out[0] - fwd.out[1];
  return m + (bias ? bias[kinds.indexOf(kind)] : 0);
}

function lossAndGrad(w, H, groups, cfg){
  const L = lengthOf(H);
  const grad = new Float64Array(L);
  const biasGrad = cfg.bias ? new Float64Array(cfg.kinds.length) : null;
  let loss = 0, weightSum = 0;
  for (let gi = 0; gi < groups.length; gi++){
    const g = groups[gi];
    const fwd = g.rows.map(r => forward(r.x, w, H));
    const pos = g.posIdx, negs = g.negIdx;
    const metas = g.metas;
    const kPos = metas[pos].kind;
    const outPos = fwd[pos].out;
    const nNeg = negs.length;
    let gw = 1;
    if (cfg.useOutcomeWeight){
      const outcome = cfg.outcomes[gi] ?? 'unknown';
      gw = cfg.outcomeWeight[outcome] ?? 1;
      const ld = cfg.landDelta?.[gi] ?? null; // |frame land delta 600| clarity
      if (Number.isFinite(ld))
        gw *= (0.5 + clamp01(Math.abs(ld) / cfg.landScale));
    }
    if (cfg.useHardNegBoost && g.hardNeg) gw *= cfg.hardNegBoost;
    const gWeight = gw * (cfg.weights ? cfg.weights[gi] : 1);
    weightSum += gWeight;
    let ruMin = null, ruMax = null;
    if (cfg.useUtilityAlign){
      const rus = g.rows.map((r, i) => metas[i].ru)
        .filter(v => v != null);
      if (rus.length >= 2){
        ruMin = Math.min(...rus); ruMax = Math.max(...rus);
      }
    }
    const utilTarget = i => (cfg.useUtilityAlign && metas[i].ru != null &&
      ruMax > ruMin) ? (metas[i].ru - ruMin) / (ruMax - ruMin) : null;
    const biasOf = k => cfg.bias ? cfg.bias[cfg.kinds.indexOf(k)] : 0;
    const dPos = new Float64Array(OUTPUTS);
    const dNeg = negs.map(() => new Float64Array(OUTPUTS));
    let groupLoss = 0;
    if (nNeg){
      for (let ni = 0; ni < nNeg; ni++){
        const outNeg = fwd[negs[ni]].out;
        const s = marginOf(fwd[pos], H, cfg.bias, cfg.kinds, kPos) -
          marginOf(fwd[negs[ni]], H, cfg.bias, cfg.kinds, metas[negs[ni]].kind);
        const dLdz = sig(s) - 1;
        const dS = gWeight * cfg.lambda * (1 / nNeg) * dLdz;
        dPos[0] += dS; dPos[1] -= dS;
        dNeg[ni][0] -= dS; dNeg[ni][1] += dS;
        groupLoss += gWeight * (cfg.lambda / nNeg) *
          -Math.log(clamp01(sig(s)));
        if (biasGrad){
          const dLds = gWeight * cfg.lambda * (1 / nNeg) * (sig(s) - 1);
          biasGrad[cfg.kinds.indexOf(kPos)] += dLds;
          biasGrad[cfg.kinds.indexOf(metas[negs[ni]].kind)] -= dLds;
        }
      }
    }
    if (cfg.useUtilityAlign){
      const nUtil = 1 + negs.filter(ni => utilTarget(ni) != null).length;
      const up = utilTarget(pos);
      if (up != null){
        const s = marginOf(fwd[pos], H, cfg.bias, cfg.kinds, kPos);
        const dS = gWeight * (cfg.ruWeight / nUtil) * 2 * (s - up);
        dPos[0] += dS; dPos[1] -= dS;
        groupLoss += gWeight * cfg.ruWeight * (s - up) * (s - up) / nUtil;
      }
      for (let ni = 0; ni < nNeg; ni++){
        const un = utilTarget(negs[ni]);
        if (un == null) continue;
        const s = marginOf(fwd[negs[ni]], H, cfg.bias, cfg.kinds,
          metas[negs[ni]].kind);
        const dS = gWeight * (cfg.ruWeight / nUtil) * 2 * (s - un);
        dNeg[ni][0] += dS; dNeg[ni][1] -= dS;
        groupLoss += gWeight * cfg.ruWeight * (s - un) * (s - un) / nUtil;
      }
    }
    backpropFromOutDelta(g.rows[pos].x, fwd[pos].h, fwd[pos].out, dPos, w, H, grad);
    for (let ni = 0; ni < nNeg; ni++)
      backpropFromOutDelta(g.rows[negs[ni]].x, fwd[negs[ni]].h, fwd[negs[ni]].out,
        dNeg[ni], w, H, grad);
    loss += groupLoss;
  }
  const scale = weightSum > 0 ? 1 / weightSum : 1;
  for (let p = 0; p < L; p++) grad[p] *= scale;
  if (biasGrad) for (let k = 0; k < biasGrad.length; k++) biasGrad[k] *= scale;
  return { loss: scale * loss, grad, biasGrad };
}

// 12 metrics on a split. `groups` must match the order used for cfg.outcomes
// / cfg.landDelta / cfg.weights (the same array passed to lossAndGrad).
function metrics(w, H, groups, cfg){
  let rankLoss = 0, nGroups = 0;
  let spreadSum = 0, spreadCount = 0;
  let agree = 0;
  const kindModel = {};
  let frames = 0, flips = 0, worse = 0, higher = 0;
  let hnFrames = 0, hnOk = 0;
  for (let gi = 0; gi < groups.length; gi++){
    const g = groups[gi];
    const metas = g.metas;
    const fwd = g.rows.map(r => forward(r.x, w, H));
    // ranking loss (unweighted, plain mean) for a stable valRankLoss.
    const pos = g.posIdx, negs = g.negIdx, nNeg = negs.length;
    const kPos = metas[pos].kind;
    if (nNeg){
      let gl = 0;
      for (const ni of negs){
        const s = marginOf(fwd[pos], H, cfg.bias, cfg.kinds, kPos) -
          marginOf(fwd[ni], H, cfg.bias, cfg.kinds, metas[ni].kind);
        gl += -Math.log(clamp01(sig(s)));
      }
      rankLoss += gl / nNeg;
      nGroups++;
    }
    // cross-candidate spread of the decision margin.
    const margins = g.rows.map((r, i) =>
      marginOf(fwd[i], H, cfg.bias, cfg.kinds, metas[i].kind));
    const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
    const sd = Math.sqrt(margins.reduce((a, b) => a + (b - mean) ** 2, 0) /
      margins.length);
    spreadSum += sd; spreadCount++;
    // model top-1 vs observed (decision accuracy) and rule top-1 (flips).
    let modelTop = 0, modelBest = -Infinity;
    for (let i = 0; i < g.rows.length; i++){
      const m = margins[i];
      if (m > modelBest){ modelBest = m; modelTop = i; }
    }
    const mKind = metas[modelTop].kind;
    kindModel[mKind] = (kindModel[mKind] || 0) + 1;
    if (mKind === g.posKind) agree++;
    const ruRows = g.rows.map((r, i) => ({ i, ru: metas[i].ru, kind: metas[i].kind }))
      .filter(o => o.ru != null);
    if (ruRows.length >= 2){
      let ruleTop = ruRows[0];
      for (const o of ruRows) if (o.ru > ruleTop.ru) ruleTop = o;
      const mRu = metas[modelTop].ru;
      frames++;
      if (mKind !== ruleTop.kind){
        flips++;
        if (mRu != null && mRu < ruleTop.ru) worse++;
        else if (mRu != null && mRu > ruleTop.ru) higher++;
      }
      if (g.hardNeg){
        hnFrames++;
        const ok = modelTop === ruleTop.i ||
          (mRu != null && mRu >= ruleTop.ru);
        if (ok) hnOk++;
      }
    }
  }
  const share = obj => Object.fromEntries(
    Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      [k, +(v / Math.max(1, nGroups)).toFixed(4)]));
  return {
    valRankLoss: nGroups ? +(rankLoss / nGroups).toFixed(6) : null,
    crossCandidateSpread: spreadCount ? +(spreadSum / spreadCount).toFixed(6) : null,
    decisionAccuracy: nGroups ? +(agree / nGroups).toFixed(4) : null,
    kindSelectionDistribution: share(kindModel),
    hardNegativeAccuracy: hnFrames ? +(hnOk / hnFrames).toFixed(4) : null,
    hardNegativeFrames: hnFrames,
    flipToLowerRate: frames ? +(worse / frames).toFixed(4) : null,
    flipToHigherRate: frames ? +(higher / frames).toFixed(4) : null,
    flipFrames: frames, flipCount: flips };
}

function shaOf(w){
  let s = '';
  for (let i = 0; i < w.length; i++) s += w[i];
  return crypto.createHash('sha256').update(s).digest('hex');
}

function main(){
  const variant = arg('--variant', 'A').toUpperCase();
  if (!['A', 'B', 'C', 'D', 'E'].includes(variant))
    throw Error('--variant A|B|C|D|E');
  const arch = arg('--arch', '38x24x2-tanh');
  const H = candidate.HIDDEN_BY_ARCH[arch];
  if (H === undefined) throw Error('Invalid schema-6 arch ' + arch);
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
  const useBias = arg('--useBias', 'false') === 'true';
  const datasetPath = path.resolve(arg('--dataset', ''));
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const datasetSha = crypto.createHash('sha256')
    .update(fs.readFileSync(datasetPath)).digest('hex');

  const { train, val } = buildV6Groups(dataset, splitPct);
  if (!train.length || !val.length) throw Error('No trainable groups');
  const { weights, count, target } = groupWeights(train, oversampleMin, maxOversample);

  // cfg shared by train/val metrics (same group order).
  const landScale = Number(dataset.landScale) || 800;
  const cfgBase = { variant, lambda, ruWeight, hardNegBoost, kinds: null,
    useOutcomeWeight: variant === 'C' || variant === 'E',
    useUtilityAlign: variant === 'B' || variant === 'E',
    useHardNegBoost: variant === 'D' || variant === 'E',
    outcomeWeight: { victory: 1.5, defeat: 0.5, unknown: 1 },
    bias: null, landScale };
  const hasBias = useBias;
  const kinds = hasBias ?
    [...new Set(train.flatMap(g => g.metas.map(m => m.kind)).concat(
      val.flatMap(g => g.metas.map(m => m.kind))))].sort() : null;
  const bias = hasBias ? new Float64Array(kinds.length) : null;
  const cfg = { ...cfgBase, kinds, bias,
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
      const { loss, grad, biasGrad } = lossAndGrad(w, H, bag, bagCfg);
      if (!Number.isFinite(loss)) throw Error('Loss diverged at epoch ' + e);
      for (let p = 0; p < L; p++) w[p] = clampW(w[p] - lr * grad[p]);
      if (bias && biasGrad)
        for (let k = 0; k < bias.length; k++)
          bias[k] = clampW(bias[k] - lr * (biasGrad[k] + 0.001 * bias[k]));
      lastLoss = loss;
    }
    if ((e + 1) % 20 === 0 || e === 0 || e === epoch - 1){
      const vl = lossAndGrad(w, H, val, { ...cfg, weights: val.map(() => 1),
        outcomes: val.map(g => g.outcome), landDelta: val.map(() => null) }).loss;
      curve.push({ epoch: e + 1, trainLoss: +(lastLoss ?? 0).toFixed(6),
        valLoss: +vl.toFixed(6) });
    }
  }
  const valCfg = { ...cfg, bias: hasBias ? bias : null,
    weights: val.map(() => 1), outcomes: val.map(g => g.outcome),
    landDelta: val.map(() => null) };
  const valMetrics = metrics(w, H, val, valCfg);
  const model = { schema: 6, arch, outputs: ['heldGain', 'lossRisk'],
    weights: Array.from(w), sha256: shaOf(w),
    training: {
      generatedBy: 'trainer/train-v6.cjs', variant,
      schema: 6, featureSchemaVersion: 3,
      featureNames: require('./v6-features.cjs').MANIFEST.map(m => m.name),
      weightCount: L, arch,
      dataset: path.basename(datasetPath), datasetSHA256: datasetSha,
      length: L, epoch, lr, splitPct, lambda, seed, bagSize,
      ruWeight, hardNegBoost, useBias,
      oversample: { min: oversampleMin, max: maxOversample, target,
        positiveKindCounts: count },
      curve, wallMs: Date.now() - t0,
      kindBias: hasBias ?
        Object.fromEntries(kinds.map((k, i) => [k, +bias[i].toFixed(6)])) : null,
      metrics: valMetrics } };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'model.json'), JSON.stringify(model, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'training.json'), JSON.stringify({
    variant, arch, epoch, lr, splitPct, lambda, seed, bagSize, ruWeight,
    hardNegBoost, useBias, oversample: model.training.oversample,
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
    crossCandidateSpread: valMetrics.crossCandidateSpread,
    wallMs: Date.now() - t0 }));
}
if (require.main === module) main();
module.exports = { INPUTS, OUTPUTS, forward, backpropFromOutDelta,
  buildV6Groups, groupWeights, lossAndGrad, metrics, v6RowFeatures,
  hiddenBiasOf, outStartOf, outBiasOf, lengthOf };
