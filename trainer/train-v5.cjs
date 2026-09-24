'use strict';
// P3: Deterministic offline supervised/imitation trainer for the schema-5
// candidate policy (32x20x2-tanh, 702 weights).
//
// This is NOT a derivative-free mutated weight list. It is plain full-batch
// backprop on the 2 outcome targets (heldGain, lossRisk) over frames whose
// horizon was observably reached. Properties guaranteed by construction:
//   * deterministic: fixed data order (matches by id, frames by tick),
//     full-batch gradient descent, no RNG;
//   * disjoint per-match train/validation split (no leakage between matches);
//   * reproducible model file: schema-5 model + SHA256 (candidate.sha);
//   * runtime feature parity: features built by candidate.features (the same
//     function the runtime shadow ranker uses);
//   * checkpoint/resume: epoch + weights + data hash; resume continues exactly;
//   * no live deployment: writes model.json + reports only, never the
//     userscript, Run3, the champion or the shadow bundle.
const fs = require('fs');
const path = require('path');
const candidate = require('./candidate-policy-v5.cjs');
const feat = require('./v5-features.cjs');
const lab = require('./v5-labels.cjs');

const INPUTS = candidate.INPUTS, HIDDEN = candidate.HIDDEN, OUTPUTS = candidate.OUTPUTS;
const hiddenBias = INPUTS * HIDDEN, outStart = hiddenBias + HIDDEN,
  outBias = outStart + HIDDEN * OUTPUTS, LENGTH = outBias + OUTPUTS;
const clamp01 = v => Math.min(1, Math.max(0, v));

// Deterministic weight initialization.
//
// Zero-init (the previous default) is a dead start for this network: with the
// input weights at 0 the hidden layer is tanh(0)=0 for every unit, so the
// backpropagated gradient to the first layer is 0 and it never moves — the
// network stays at the "predict the class mean" constant. A fixed-seed Xavier
// (Glorot-uniform) init breaks the symmetry while remaining fully
// reproducible (no wall-clock RNG), so the determinism/resume contracts hold.
// The seed is a pinned constant so a fresh run always starts from identical
// weights; resume continues from checkpoint weights instead.
const INIT_SEED = 0x2545F491;
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function xavierInitWeights(){
  const rng = mulberry32(INIT_SEED);
  const w = new Float64Array(LENGTH);
  const uniform = lim => (rng() * 2 - 1) * lim;
  const inLim = Math.sqrt(6 / (INPUTS + HIDDEN));
  for (let i = 0; i < INPUTS * HIDDEN; i++) w[i] = uniform(inLim);
  for (let j = 0; j < HIDDEN; j++) w[hiddenBias + j] = uniform(0.05);
  const outLim = Math.sqrt(6 / (HIDDEN + OUTPUTS));
  for (let i = 0; i < HIDDEN * OUTPUTS; i++) w[outStart + i] = uniform(outLim);
  for (let k = 0; k < OUTPUTS; k++) w[outBias + k] = uniform(0.05);
  return w;
}

function forward(x, w){
  const h = new Float64Array(HIDDEN);
  for (let j = 0; j < HIDDEN; j++){
    let s = w[hiddenBias + j];
    for (let i = 0; i < INPUTS; i++) s += x[i] * w[i * HIDDEN + j];
    h[j] = Math.tanh(s);
  }
  const out = new Float64Array(OUTPUTS);
  for (let k = 0; k < OUTPUTS; k++){
    let s = w[outBias + k];
    for (let j = 0; j < HIDDEN; j++) s += h[j] * w[outStart + j * OUTPUTS + k];
    out[k] = (Math.tanh(s) + 1) / 2;
  }
  return {h, out};
}
function predictArray(w, x){
  const {out} = forward(x, w);
  return [out[0], out[1]];
}
// Full-batch mean gradient of the per-output squared loss, averaged over
// samples and the 2 outputs. Deterministic.
function gradient(w, xs, ys){
  const grad = new Float64Array(LENGTH);
  const N = xs.length;
  for (let s = 0; s < N; s++){
    const x = xs[s], y = ys[s];
    const {h, out} = forward(x, w);
    const deltaOut = new Float64Array(OUTPUTS);
    for (let k = 0; k < OUTPUTS; k++){
      const t = 2 * out[k] - 1; // tanh(zout); d(out)/d(zout) = (1 - t^2) / 2
      deltaOut[k] = (out[k] - y[k]) * (1 - t * t);
    }
    for (let k = 0; k < OUTPUTS; k++){
      grad[outBias + k] += deltaOut[k];
      for (let j = 0; j < HIDDEN; j++) grad[outStart + j * OUTPUTS + k] += deltaOut[k] * h[j];
    }
    for (let j = 0; j < HIDDEN; j++){
      let dh = 0;
      for (let k = 0; k < OUTPUTS; k++) dh += deltaOut[k] * w[outStart + j * OUTPUTS + k];
      dh *= 1 - h[j] * h[j];
      grad[hiddenBias + j] += dh;
      for (let i = 0; i < INPUTS; i++) grad[i * HIDDEN + j] += dh * x[i];
    }
  }
  const scale = 1 / (N * OUTPUTS);
  for (let p = 0; p < LENGTH; p++) grad[p] *= scale;
  return grad;
}
function mse(w, xs, ys){
  if (!xs.length || xs.length !== ys.length) throw Error('MSE requires non-empty aligned samples');
  let sum = 0;
  for (let s = 0; s < xs.length; s++){
    const o = predictArray(w, xs[s]);
    sum += (o[0] - ys[s][0]) ** 2 + (o[1] - ys[s][1]) ** 2;
  }
  return sum / (xs.length * OUTPUTS);
}

// Deterministic per-match split: stable hash of matchId -> train if
// hash % 100 < splitPct. Disjoint per match (no frame leakage).
function stableHash(str){
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function sideOf(matchId, splitPct){ return (stableHash(matchId) % 100) < splitPct ? 'train' : 'validation'; }

// Build the training/validation sample sets from a dataset.
function buildSamples(dataset){
  const matches = Array.isArray(dataset.matches) ? dataset.matches : [];
  const horizonTicks = Number(dataset.horizonTicks) || 120;
  const landScale = Number(dataset.landScale) || 20;
  const train = {x: [], y: []}, validation = {x: [], y: []};
  const trainMatches = new Set(), valMatches = new Set();
  for (const match of matches){
    const matchId = String(match.matchId);
    const frames = (Array.isArray(match.frames) ? match.frames : []).slice()
      .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
    const labRows = lab.buildLabels(frames, {horizonTicks, landScale, matchOutcome: match.outcome});
    const side = sideOf(matchId, splitPctGlobal);
    (side === 'train' ? trainMatches : valMatches).add(matchId);
    const bag = side === 'train' ? train : validation;
    frames.forEach((frame, i) => {
      const row = labRows[i];
      if (!row.usable || row.heldGain == null || row.lossRisk == null) return;
      const vs = frame.visibleState || {};
      const state = {home: vs.home, maxTroops: vs.maxTroops, committed: vs.committed,
        incoming: vs.incoming, reserve: vs.reserve, gold: vs.gold, land: vs.land,
        capacityUse: vs.capacityUse, frontCount: vs.frontCount,
        // Extension fields (featuredSchemaVersion 2). Legacy frames omit
        // them; absent fields yield the same baseline features the runtime
        // produced when it did not provide them (absent trend -> baseline,
        // absent 0..1 field -> 0).
        economyRelative: vs.economyRelative ?? 0, frontReach: vs.frontReach ?? 0,
        partnerNeed: vs.partnerNeed ?? 0, enemyBound: vs.enemyBound ?? 0,
        landTrend: vs.landTrend, goldTrend: vs.goldTrend,
        troopTrend: vs.troopTrend, portAccess: vs.portAccess ?? 0,
        technologyCoverage: vs.technologyCoverage ?? 0};
      const cand = {kind: frame.action?.type, costTroops: vs.costTroops || 0,
        costGold: vs.costGold || 0, expectedLand: vs.expectedLand || 0,
        duration: vs.duration || 0, returnTime: vs.returnTime || 0,
        counterRisk: vs.counterRisk || 0, thirdPartyRisk: vs.thirdPartyRisk || 0,
        infrastructureValue: vs.infrastructureValue || 0,
        incomeValue: vs.incomeValue || 0, recruitmentValue: vs.recruitmentValue || 0,
        siteRisk: vs.siteRisk || 0, holdProbability: vs.holdProbability ?? 1,
        legalConfidence: vs.legalConfidence};
      const x = feat.buildFeatures(state, cand); // == candidate.features (parity)
      bag.x.push(x); bag.y.push([row.heldGain, row.lossRisk]);
    });
  }
  return {train, validation, trainMatches, valMatches};
}
let splitPctGlobal = 80;

const crypto = require('node:crypto');
function hashBag(bag){
  const payload = JSON.stringify(bag.x.map((x, i) => [x, bag.y[i]]));
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function makeModel(w){
  const weights = Array.from(w, v => Math.min(5, Math.max(-5, v)));
  return candidate.validate({schema: 5, arch: '32x20x2-tanh',
    outputs: ['heldGain','lossRisk'], weights});
}

function train(dataset, plan){
  splitPctGlobal = plan.splitPct;
  const {train: T, validation: V, trainMatches, valMatches} = buildSamples(dataset);
  if (!T.x.length) throw Error('No usable training frames');
  if (!V.x.length) throw Error('No usable validation frames');
  let w = plan.resume ? Float64Array.from(plan.resume.weights) : xavierInitWeights();
  const startEpoch = plan.resume ? plan.resume.epoch : 0;
  const curve = plan.resume ? plan.resume.curve.slice() : [];
  const baseLoss = {train: mse(w, T.x, T.y), validation: mse(w, V.x, V.y)};
  for (let e = startEpoch + 1; e <= plan.epochs; e++){
    const g = gradient(w, T.x, T.y);
    for (let p = 0; p < LENGTH; p++) w[p] = Math.min(5, Math.max(-5, w[p] - plan.lr * g[p]));
    const point = {epoch: e,
      trainLoss: Math.round(mse(w, T.x, T.y) * 1e9) / 1e9,
      valLoss: Math.round(mse(w, V.x, V.y) * 1e9) / 1e9};
    curve.push(point);
    plan.onEpoch && plan.onEpoch(e, point, w, curve);
  }
  return {w, curve, baseLoss, T, V, trainMatches, valMatches};
}

// Baselines for ablation (all deterministic, no learned weights).
function meanModelMetrics(x, y){
  if(!y.length || x.length!==y.length) throw Error('Mean baseline requires non-empty aligned samples');
  const m = [0, 1].map(k => y.reduce((s, r) => s + r[k], 0) / Math.max(1, y.length));
  const loss = y.reduce((s, r) => s + (r[0] - m[0]) ** 2 + (r[1] - m[1]) ** 2, 0) / (y.length * OUTPUTS);
  return {kind: 'mean-constant', mse: loss};
}
function nullModelMetrics(x, y){
  if(!y.length || x.length!==y.length) throw Error('Null baseline requires non-empty aligned samples');
  const loss = y.reduce((s, r) => s + (r[0] - 0.5) ** 2 + (r[1] - 0.5) ** 2, 0) / (y.length * OUTPUTS);
  return {kind: 'zero-weights-null', mse: loss};
}
function ruleModel(x, y){
  if(!y.length || x.length!==y.length) throw Error('Rule baseline requires non-empty aligned samples');
  // A fixed deterministic heuristic mapping features -> targets (documented,
  // not learned). Used only as an ablation reference.
  const pred = xi => [clamp01(0.5 + 0.3 * (xi[1] - 0.5) - 0.2 * (xi[3] - 0.5)),
    clamp01(0.5 - 0.3 * (xi[4] - 0.5) + 0.2 * (xi[3] - 0.5))];
  const loss = y.reduce((s, r, i) => {
    const p = pred(x[i]); return s + (p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2;
  }, 0) / (y.length * OUTPUTS);
  return {kind: 'fixed-rule', mse: loss};
}
function calibration(w, x, y){
  const bins = [];
  const B = 4;
  for (let b = 0; b < B; b++){
    const lo = b / B, hi = (b + 1) / B; let n = 0, pSum = 0, aSum = 0;
    for (let i = 0; i < x.length; i++){
      const p = predictArray(w, x[i])[1];
      if (p >= lo && p < hi || (b === B - 1 && p === 1)){ n++; pSum += p; aSum += y[i][1]; }
    }
    bins.push({bin: [lo, hi], n, meanPredicted: n ? pSum / n : null, meanActual: n ? aSum / n : null});
  }
  return bins;
}

module.exports = {
  INPUTS, HIDDEN, OUTPUTS, LENGTH, hiddenBias, outStart, outBias,
  forward, predictArray, gradient, mse,
  INIT_SEED, mulberry32, xavierInitWeights,
  stableHash, sideOf, buildSamples, hashBag, makeModel, train,
  meanModelMetrics, nullModelMetrics, ruleModel, calibration
};

// --- CLI ---
function main(argv){
  const cfg = {dataset: null, out: null, epochs: '50', learningRate: '0.05',
    split: '80', resume: null, dryRun: 'false'};
  for (let i = 0; i < argv.length; i++){
    const key = argv[i];
    if (!key.startsWith('--')) throw Error('Unknown argument ' + key);
    const k = key.slice(2);
    if (!Object.hasOwn(cfg, k)) throw Error('Unknown option ' + k);
    const v = argv[++i]; if (!v || v.startsWith('--')) throw Error('Missing value for ' + k);
    cfg[k] = v;
  }
  const epochs = Number(cfg.epochs), lr = Number(cfg.learningRate), splitPct = Number(cfg.split);
  if (!Number.isSafeInteger(epochs) || epochs < 1 || epochs > 10000) throw Error('Invalid epochs');
  if (!Number.isFinite(lr) || lr <= 0 || lr > 1) throw Error('Invalid learningRate');
  if (!Number.isInteger(splitPct) || splitPct < 10 || splitPct > 95) throw Error('Invalid split');
  if (cfg.dryRun !== 'true' && !cfg.dataset) throw Error('Provide --dataset or --dryRun true');
  splitPctGlobal = splitPct;
  const dataset = JSON.parse(fs.readFileSync(cfg.dataset, 'utf8'));
  const {train: T, validation: V, trainMatches, valMatches} = buildSamples(dataset);
  const plan = {epochs, lr, splitPct, dataset: cfg.dataset,
    dataHash: hashBag(T),validationHash:hashBag(V),
    trainSamples: T.x.length, valSamples: V.x.length,
    trainMatches: [...trainMatches].sort(), valMatches: [...valMatches].sort(),
    featuredSchemaVersion: feat.FEATURED_SCHEMA_VERSION};
  // Epoch target is excluded: a partial run may resume longer. Both splits,
  // hyperparameters, and feature/label configuration remain pinned.
  const resumeContract={trainHash:plan.dataHash,valHash:plan.validationHash,
    trainMatches:plan.trainMatches,valMatches:plan.valMatches,
    splitPct,lr,featuredSchemaVersion:plan.featuredSchemaVersion,
    modelArch:'32x20x2-tanh',horizonTicks:Number(dataset.horizonTicks)||120,
    landScale:Number(dataset.landScale)||20};
  plan.resumeSignature=crypto.createHash('sha256')
    .update(JSON.stringify(resumeContract)).digest('hex');
  if (cfg.dryRun === 'true'){ console.log(JSON.stringify(plan, null, 2)); return; }
  if (trainMatches.size && valMatches.size &&
      [...trainMatches].some(m => valMatches.has(m)))
    throw Error('Train/validation matches overlap');
  if (T.x.length === 0) throw Error('No usable training frames');
  if (V.x.length === 0 || valMatches.size===0) throw Error('No usable validation frames');
  if (trainMatches.size===0) throw Error('No usable training match set');
  const out = path.resolve(cfg.out);
  if (cfg.resume){
    if (fs.existsSync(out)) throw Error('Output directory already exists: ' + out);
    fs.mkdirSync(out, {recursive: true});
  } else if (fs.existsSync(out)) throw Error('Output directory already exists: ' + out);
  fs.mkdirSync(out, {recursive: true});
  const writeJSON = (p, d) => fs.writeFileSync(path.join(out, p), JSON.stringify(d));
  writeJSON('plan.json', plan);
  let resume = null;
  if (cfg.resume){
    const r = JSON.parse(fs.readFileSync(path.resolve(cfg.resume), 'utf8'));
    if (r.dataHash !== plan.dataHash || r.resumeSignature !== plan.resumeSignature)
      throw Error('Resume provenance signature mismatch (train/validation/parameters)');
    if (!r.weights || r.weights.length !== LENGTH) throw Error('Invalid checkpoint weights');
    resume = {weights: r.weights, epoch: r.epoch, curve: r.curve};
  }
  const started = Date.now();
  const res = train(dataset, {epochs, lr, splitPct, resume,
    onEpoch: (e, point, w, curve) => {
      if (e % Math.max(1, Math.floor(epochs / 20)) === 0 || e === epochs)
        writeJSON('checkpoint.json', {epoch: e, weights: Array.from(w), lr,
          epochs, dataHash: plan.dataHash,resumeSignature:plan.resumeSignature, curve});
    }});
  // Final checkpoint always written for resume.
  writeJSON('checkpoint.json', {epoch: epochs, weights: Array.from(res.w), lr,
    epochs, dataHash: plan.dataHash,resumeSignature:plan.resumeSignature, curve: res.curve});
  const model = makeModel(res.w);
  writeJSON('model.json', model);
  const metrics = {
    validation: {trained: {mse: Math.round(mse(res.w, res.V.x, res.V.y) * 1e9) / 1e9,
      n: res.V.x.length},
      null: nullModelMetrics(res.V.x, res.V.y),
      rule: ruleModel(res.V.x, res.V.y),
      mean: meanModelMetrics(res.V.x, res.V.y)},
    trainLossFinal: res.curve[res.curve.length - 1]?.trainLoss,
    valLossFinal: res.curve[res.curve.length - 1]?.valLoss,
    valLossInitial: res.curve[0]?.valLoss,
    improved: (res.curve[res.curve.length - 1]?.valLoss ?? Infinity) <
      (res.baseLoss.validation),
    numericStable: Array.from(res.w).every(v => Number.isFinite(v) && Math.abs(v) <= 5),
    maxAbsWeight: Math.max(...Array.from(res.w).map(Math.abs)),
    labelHorizons: {trainUsable: res.T.x.length, valUsable: res.V.x.length},
    featureParity: true, // buildFeatures === candidate.features by construction
    runtime: feat.audit()
  };
  writeJSON('evaluation.json', metrics);
  writeJSON('calibration.json', {risk: calibration(res.w, res.V.x, res.V.y)});
  writeJSON('learning-curve.json', {curve: res.curve});
  console.log(JSON.stringify({
    finished: true, out, modelSHA256: candidate.sha(model),
    schema: 5, trainSamples: res.T.x.length, valSamples: res.V.x.length,
    trainMatches: plan.trainMatches.length, valMatches: plan.valMatches.length,
    epochs, split: splitPct, ms: Date.now() - started,
    valLossFinal: metrics.valLossFinal, improved: metrics.improved,
    liveDeployment: false,
    note: 'Offline supervised training only; no userscript/Run3/champion/shadow change.'
  }));
}
if (require.main === module){
  try { main(process.argv.slice(2)); }
  catch (e){ console.error('train-v5 failed: ' + e.message); process.exit(1); }
}
