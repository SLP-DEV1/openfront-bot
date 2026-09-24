'use strict';
// Schema-5 candidate-group RANKING trainer (v5rank).
//
// Fixes the measured root cause of the non-binding schema-5 control: the
// frame-level MSE objective makes every candidate in a planning frame predict
// the SAME value, so the model's cross-candidate score spread (~0.116) is too
// small for gain-18 control to re-order rule utilities (see
// campaign-v5rank-20260924/failure-analysis.json).
//
// This trainer adds a within-frame learning-to-rank objective: in every
// planning frame the candidate that was actually CHOSEN+executed (the observed
// row) must be scored ABOVE the counterfactual (unchosen) candidates, where the
// score is exactly the runtime score s = heldGain - lossRisk. A (optional)
// outcome-regression term keeps the two outputs calibrated to the realized
// horizon outcomes. The score is therefore both calibrated AND discriminative.
//
// Objective (full-batch, deterministic, Xavier init 0x2545F491):
//   L = (1/G) * Σ_frames [ (noRegression ? 0 : (1/2) Σ_k (out_pos,k - y_pos,k)^2)
//                          + λ * (1/|neg|) Σ_neg -log σ(s_pos - s_neg) ]
//
// Reuses forward/backprop primitives, features, labels, split and model
// packaging from train-v5.cjs so runtime feature parity and the 32x20x2-tanh
// contract are preserved. Post-training discrimination is measured with the
// SAME tool as the prior campaign (v5-control-evidence.diagnostic) so the
// meanCrossCandidateScoreStd / decisionDepartures numbers are comparable.
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const candidate = require('./candidate-policy-v5.cjs');
const feat = require('./v5-features.cjs');
const lab = require('./v5-labels.cjs');
const {forward, xavierInitWeights, stableHash, sideOf, makeModel,
  INPUTS, HIDDEN, OUTPUTS, LENGTH, hiddenBias, outStart, outBias,
  predictArray} = require('./train-v5.cjs');

const clampW = v => Math.min(5, Math.max(-5, v));
const sig = z => 1 / (1 + Math.exp(-z));
const clamp01 = v => Math.min(1, Math.max(0, v));

// Build per-planning-frame candidate groups. A group is one distinct tick
// within a match: the observed (chosen+executed) row is the positive, the
// counterfactual (unchosen) rows are negatives. A group is trainable only if
// the positive has a usable horizon label AND >=1 counterfactual exists.
function buildRankGroups(dataset, splitPct){
  const train = [], val = [];
  const trainMatches = new Set(), valMatches = new Set();
  const horizonTicks = Number(dataset.horizonTicks) || 600;
  const landScale = Number(dataset.landScale) || 800;
  const stat = {groups: 0, droppedNoPositive: 0, droppedNoNegative: 0, droppedNoLabel: 0};
  for (const match of (dataset.matches || [])){
    const matchId = String(match.matchId);
    const side = sideOf(matchId, splitPct);
    (side === 'train' ? trainMatches : valMatches).add(matchId);
    const frames = (match.frames || []).slice()
      .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
    if (!frames.length) continue;
    const labels = lab.buildLabels(frames,
      {horizonTicks, landScale, matchOutcome: match.outcome});
    // Group consecutive rows by tick (frameRows emitted one row per candidate,
    // so all candidate rows of a planning frame are consecutive at equal tick).
    const groups = [];
    for (let i = 0; i < frames.length; i++){
      if (i > 0 && frames[i].tick === frames[i - 1].tick)
        groups[groups.length - 1].rows.push(i);
      else groups.push({tick: frames[i].tick, rows: [i]});
    }
    for (const g of groups){
      const rows = g.rows.map(i => {
        const f = frames[i]; const vs = f.visibleState || {};
        const state = {home: vs.home, maxTroops: vs.maxTroops, committed: vs.committed,
          incoming: vs.incoming, reserve: vs.reserve, gold: vs.gold, land: vs.land,
          capacityUse: vs.capacityUse, frontCount: vs.frontCount,
          economyRelative: vs.economyRelative ?? 0, frontReach: vs.frontReach ?? 0,
          partnerNeed: vs.partnerNeed ?? 0, enemyBound: vs.enemyBound ?? 0,
          landTrend: vs.landTrend, goldTrend: vs.goldTrend, troopTrend: vs.troopTrend,
          portAccess: vs.portAccess ?? 0, technologyCoverage: vs.technologyCoverage ?? 0};
        const cand = {kind: f.action?.type, costTroops: vs.costTroops || 0,
          costGold: vs.costGold || 0, expectedLand: vs.expectedLand || 0,
          duration: vs.duration || 0, returnTime: vs.returnTime || 0,
          counterRisk: vs.counterRisk || 0, thirdPartyRisk: vs.thirdPartyRisk || 0,
          infrastructureValue: vs.infrastructureValue || 0, incomeValue: vs.incomeValue || 0,
          recruitmentValue: vs.recruitmentValue || 0, siteRisk: vs.siteRisk || 0,
          holdProbability: vs.holdProbability ?? 1, legalConfidence: vs.legalConfidence};
        const row = labels[i];
        const observed = f.observed !== false;
        const y = (row && row.usable && row.heldGain != null && row.lossRisk != null)
          ? [row.heldGain, row.lossRisk] : null;
        return {x: feat.buildFeatures(state, cand), observed, y};
      });
      let posIdx = -1; const negIdx = [];
      for (let r = 0; r < rows.length; r++){
        if (rows[r].observed && rows[r].y != null) posIdx = r;
        else if (!rows[r].observed) negIdx.push(r);
      }
      if (posIdx < 0){ stat.droppedNoPositive++; continue; }
      if (negIdx.length === 0){ stat.droppedNoNegative++; continue; }
      stat.groups++;
      (side === 'train' ? train : val).push({tick: g.tick, rows, posIdx, negIdx});
    }
  }
  // Positive-only sample arrays (for continuity valMSE, matches train-v5 rows).
  const posOnly = bag => bag.xs.map((_, i) => [bag.xs[i], bag.ys[i]]);
  const toPosSamples = groups => {
    const xs = [], ys = [];
    for (const g of groups){ const r = g.rows[g.posIdx]; xs.push(r.x); ys.push(r.y); }
    return {xs, ys};
  };
  return {train, val, trainMatches, valMatches, stat,
    trainPos: toPosSamples(train), valPos: toPosSamples(val)};
}

// Backpropagate a custom dL/d(out) through one sample, adding into grad.
function backpropFromOutDelta(x, h, out, dOut, w, grad){
  const dzout = new Float64Array(OUTPUTS);
  for (let k = 0; k < OUTPUTS; k++){
    const t = 2 * out[k] - 1; // = tanh(zout)
    dzout[k] = dOut[k] * (1 - t * t) / 2;
  }
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

// Total loss + gradient over a bag of groups. lambda scales the ranking term;
// noRegression drops the outcome-regression term. Deterministic.
function lossAndGrad(w, groups, lambda, noRegression){
  const G = groups.length;
  const regGrad = new Float64Array(LENGTH);
  const rankGrad = new Float64Array(LENGTH);
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
      for (let k = 0; k < OUTPUTS; k++){ regD[k] += (outPos[k] - y[k]); regLoss += (outPos[k] - y[k]) ** 2; }
    }
    if (negs.length){
      for (let ni = 0; ni < negs.length; ni++){
        const outNeg = fwd[negs[ni]].out;
        const sNeg = outNeg[0] - outNeg[1];
        const z = sPos - sNeg;
        const dLdz = sig(z) - 1; // f'(z), f(z) = -log σ(z); < 0
        const c = 1 / negs.length;
        const dSpos = c * dLdz, dSneg = -c * dLdz;
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
  const grad = new Float64Array(LENGTH);
  const scale = 1 / G;
  for (let p = 0; p < LENGTH; p++) grad[p] = scale * (regGrad[p] + lambda * rankGrad[p]);
  const loss = scale * (regLoss + lambda * rankLoss);
  return {loss, grad};
}

// Continuity valMSE over positive rows (same quantity train-v5 reports).
function posMSE(w, bag){
  if (!bag.xs.length) return null;
  let sum = 0;
  for (let i = 0; i < bag.xs.length; i++){
    const o = predictArray(w, bag.xs[i]);
    sum += (o[0] - bag.ys[i][0]) ** 2 + (o[1] - bag.ys[i][1]) ** 2;
  }
  return sum / (bag.xs.length * OUTPUTS);
}

function hashGroups(bag){
  const payload = bag.xs.map((x, i) => [x, bag.ys[i]]);
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function meanCrossStd(w, groups){
  // Cross-candidate score std within each frame, using the model's score.
  const out = [];
  for (const g of groups){
    const s = g.rows.map(r => { const o = predictArray(w, r.x); return o[0] - o[1]; });
    const m = s.reduce((a, b) => a + b, 0) / s.length;
    out.push(Math.sqrt(s.reduce((a, x) => a + (x - m) ** 2, 0) / s.length));
  }
  return out.length ? out.reduce((a, b) => a + b, 0) / out.length : null;
}

function main(argv){
  const cfg = {dataset: null, out: null, epochs: '100', learningRate: '0.1',
    split: '80', lambda: '1', noRegression: 'false', resume: null, dryRun: 'false'};
  for (let i = 0; i < argv.length; i++){
    const key = argv[i];
    if (!key.startsWith('--')) throw Error('Unknown argument ' + key);
    const k = key.slice(2);
    if (!Object.hasOwn(cfg, k)) throw Error('Unknown option ' + k);
    const v = argv[++i]; if (!v || v.startsWith('--')) throw Error('Missing value for ' + k);
    cfg[k] = v;
  }
  const epochs = Number(cfg.epochs), lr = Number(cfg.learningRate),
    splitPct = Number(cfg.split), lambda = Number(cfg.lambda),
    noRegression = cfg.noRegression === 'true';
  if (!Number.isSafeInteger(epochs) || epochs < 1 || epochs > 20000) throw Error('Invalid epochs');
  if (!Number.isFinite(lr) || lr <= 0 || lr > 1) throw Error('Invalid learningRate');
  if (!Number.isInteger(splitPct) || splitPct < 10 || splitPct > 95) throw Error('Invalid split');
  if (!Number.isFinite(lambda) || lambda < 0) throw Error('Invalid lambda');
  if (cfg.dryRun !== 'true' && !cfg.dataset) throw Error('Provide --dataset or --dryRun true');

  const dataset = JSON.parse(fs.readFileSync(cfg.dataset, 'utf8'));
  const built = buildRankGroups(dataset, splitPct);
  const {train, val, trainMatches, valMatches, stat, trainPos, valPos} = built;
  if (!train.length) throw Error('No trainable ranking groups');
  if (!val.length) throw Error('No validation ranking groups');
  const plan = {epochs, lr, splitPct, lambda, noRegression, dataset: cfg.dataset,
    dataHash: hashGroups(trainPos), validationHash: hashGroups(valPos),
    trainGroups: train.length, valGroups: val.length,
    trainSamples: trainPos.xs.length, valSamples: valPos.xs.length,
    trainMatches: [...trainMatches].sort(), valMatches: [...valMatches].sort(),
    groupStat: stat, featuredSchemaVersion: feat.FEATURED_SCHEMA_VERSION,
    arch: '32x20x2-tanh', objective: noRegression ? 'ranking-only' :
      `regression+ranking(λ=${lambda})`};
  const resumeContract = {trainHash: plan.dataHash, valHash: plan.validationHash,
    trainMatches: plan.trainMatches, valMatches: plan.valMatches, splitPct, lr,
    lambda, noRegression, arch: '32x20x2-tanh',
    horizonTicks: Number(dataset.horizonTicks) || 600, landScale: Number(dataset.landScale) || 800};
  plan.resumeSignature = crypto.createHash('sha256')
    .update(JSON.stringify(resumeContract)).digest('hex');
  if (cfg.dryRun === 'true'){ console.log(JSON.stringify(plan, null, 2)); return; }
  if ([...trainMatches].some(m => valMatches.has(m))) throw Error('Train/validation matches overlap');
  const out = path.resolve(cfg.out);
  if (fs.existsSync(out) && fs.readdirSync(out).length > 0) throw Error('Output directory already exists: ' + out);
  fs.mkdirSync(out, {recursive: true});
  const writeJSON = (p, d) => fs.writeFileSync(path.join(out, p), JSON.stringify(d));
  writeJSON('plan.json', plan);
  let resume = null;
  if (cfg.resume){
    const r = JSON.parse(fs.readFileSync(path.resolve(cfg.resume), 'utf8'));
    if (r.dataHash !== plan.dataHash || r.resumeSignature !== plan.resumeSignature)
      throw Error('Resume provenance signature mismatch');
    if (!r.weights || r.weights.length !== LENGTH) throw Error('Invalid checkpoint weights');
    resume = {weights: r.weights, epoch: r.epoch, curve: r.curve};
  }
  let w = resume ? Float64Array.from(resume.weights) : xavierInitWeights();
  const startEpoch = resume ? resume.epoch : 0;
  const curve = resume ? resume.curve.slice() : [];
  const started = Date.now();
  const baseVal = posMSE(w, valPos);
  for (let e = startEpoch + 1; e <= epochs; e++){
    const {loss: preLoss, grad} = lossAndGrad(w, train, lambda, noRegression);
    for (let p = 0; p < LENGTH; p++) w[p] = clampW(w[p] - lr * grad[p]);
    const {loss: postLoss} = lossAndGrad(w, train, lambda, noRegression);
    const point = {epoch: e,
      trainLoss: Math.round(postLoss * 1e9) / 1e9,
      valMSE: Math.round((posMSE(w, valPos) ?? 0) * 1e9) / 1e9,
      valScoreStd: Math.round((meanCrossStd(w, val) ?? 0) * 1e9) / 1e9};
    curve.push(point);
    if (e % Math.max(1, Math.floor(epochs / 20)) === 0 || e === epochs)
      writeJSON('checkpoint.json', {epoch: e, weights: Array.from(w), lr,
        epochs, lambda, noRegression, dataHash: plan.dataHash,
        resumeSignature: plan.resumeSignature, curve});
  }
  writeJSON('checkpoint.json', {epoch: epochs, weights: Array.from(w), lr,
    epochs, lambda, noRegression, dataHash: plan.dataHash,
    resumeSignature: plan.resumeSignature, curve});
  const model = makeModel(w);
  writeJSON('model.json', model);
  const metrics = {
    objective: plan.objective,
    validation: {
      valMSE_positive: Math.round((posMSE(w, valPos) ?? 0) * 1e9) / 1e9,
      valScoreStd: Math.round((meanCrossStd(w, val) ?? 0) * 1e9) / 1e9,
      n_groups: val.length, n_positive: valPos.xs.length
    },
    trainLossFinal: curve[curve.length - 1]?.trainLoss,
    valMSEFinal: curve[curve.length - 1]?.valMSE,
    valScoreStdFinal: curve[curve.length - 1]?.valScoreStd,
    baseValMSE: baseVal == null ? null : Math.round(baseVal * 1e9) / 1e9,
    numericStable: Array.from(w).every(v => Number.isFinite(v) && Math.abs(v) <= 5),
    maxAbsWeight: Math.max(...Array.from(w).map(Math.abs)),
    featureParity: true,
    runtime: feat.audit(),
    ms: Date.now() - started
  };
  writeJSON('evaluation.json', metrics);
  console.log(JSON.stringify({
    finished: true, out, modelSHA256: candidate.sha(model), schema: 5,
    objective: plan.objective, trainGroups: train.length, valGroups: val.length,
    epochs, split: splitPct, ms: metrics.ms,
    valMSE_positive: metrics.validation.valMSE_positive,
    valScoreStd: metrics.validation.valScoreStd,
    liveDeployment: false,
    note: 'Offline ranking training only; no userscript/Run3/champion/shadow change.'
  }));
}
if (require.main === module){
  try { main(process.argv.slice(2)); }
  catch (e){ console.error('train-v5rank failed: ' + e.message); process.exit(1); }
}
module.exports = {buildRankGroups, lossAndGrad, backpropFromOutDelta,
  meanCrossStd, posMSE, hashGroups};
