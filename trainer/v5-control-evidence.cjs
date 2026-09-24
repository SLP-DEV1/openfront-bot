'use strict';
// Deterministic offline reconstruction of the schema-5 candidate-v5 decision
// evidence on the corrected dataset. For each captured frame it rebuilds the
// bounded candidate set from the visible state (mirroring the live
// strategicCandidatePlan rule utilities), then ranks that SAME set three ways:
//
//   * rule basis   -> argmax utility            (the Regelbasis, no model)
//   * shadow       -> argmax (heldGain-lossRisk) (the model's evaluation)
//   * control arm  -> argmax (utility + gain*score) via candidateControlKernel
//
// The three rankings share one candidate set, so a departure measures the
// model's RELATIVE influence: "does the model rank these candidates differently
// than the rule utilities do?" and "does the bounded control override actually
// change the pick?" This module is a read-only analysis tool: it never runs
// the engine, never changes any live behavior, and is deterministic.
//
// Fields not captured per frame are proxied from visible aggregates (documented
// per candidate below). The candidate set here is a faithful mirror of the live
// rule utilities restricted to what the frame exposes.

const candidate = require('./candidate-policy-v5.cjs');
const { candidateControlKernel } = require('../src/runtime/decision-kernels.cjs');
const { sideOf } = require('./train-v5.cjs');

const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));

// v5 candidate contract (the 14 candidate fields). Mirrors the live
// v5Contract: cost/counterRisk/holdProbability are this candidate's own values;
// the rest are bounded visible estimates for THIS candidate only.
function v5Contract(kind, cost, counterRisk, holdProb, extra = {}) {
  const duration = extra.duration || 0;
  return { kind, costTroops: cost || 0, costGold: extra.costGold || 0,
    expectedLand: extra.expectedLand || 0, duration,
    returnTime: extra.returnTime ?? duration,
    counterRisk: counterRisk || 0,
    thirdPartyRisk: clamp(extra.thirdPartyRisk || 0),
    infrastructureValue: clamp(extra.infrastructureValue || 0),
    incomeValue: clamp(extra.incomeValue || 0),
    recruitmentValue: clamp(extra.recruitmentValue || 0),
    siteRisk: clamp(extra.siteRisk || 0),
    holdProbability: clamp(holdProb ?? 1),
    legalConfidence: clamp(extra.legalConfidence ?? 1) };
}

// Deterministic mirror of the live strategicCandidatePlan rule utilities,
// restricted to the visible state. Proxied fields (not captured per frame):
//   * strongest  <- enemyBound * home   (enemyBound = strongest/home)
//   * income     <- economyRelative * home (economyRelative = income/home)
//   * cap        <- maxTroops          (s.max)
//   * waitGrowth <- 0                  (s.growthPotential not captured)
// Per-target attack score/held/counter/third are not captured per frame, so a
// single representative front attack is emitted from visible aggregates.
function buildCandidateSet(S = {}) {
  const home = Math.max(1, S.home);
  const strongest = (S.enemyBound || 0) * home;
  const income = (S.economyRelative || 0) * home;
  const holdRisk = clamp(Math.max(S.incoming || 0, strongest) / home, 0, 2);
  const cap = Math.max(1, S.maxTroops || home);
  const capPressure = home / cap;
  const cands = [];

  cands.push({ id: 'hold', kind: 'hold',
    utility: Math.round(35 + holdRisk * 85),
    v5: v5Contract('hold', 0, holdRisk, 1 - Math.min(1, holdRisk),
      { thirdPartyRisk: clamp(S.enemyBound || 0) }) });

  cands.push({ id: 'invest', kind: 'invest',
    utility: Math.round(42 + (capPressure > 0.82 ? 48 : 0) +
      Math.min(35, income / 50000) - holdRisk * 55),
    v5: v5Contract('invest', 0, holdRisk, 1 - Math.min(1, holdRisk),
      { thirdPartyRisk: clamp(S.enemyBound || 0),
        incomeValue: clamp(income / 100000) }) });

  if ((S.frontCount || 0) > 0) {
    const amount = Math.round(home * 0.4);
    cands.push({ id: 'attack:front', kind: 'attack',
      utility: Math.round(55 + Math.min(45, (S.land || 0) / home * 8) - holdRisk * 60),
      v5: v5Contract('attack', amount, clamp(holdRisk * 0.8),
        1 - Math.min(1, holdRisk * 0.8),
        { expectedLand: Math.max(1, Math.round((S.land || 0) / 8)),
          thirdPartyRisk: clamp((S.enemyBound || 0) * 0.5),
          siteRisk: clamp(S.enemyBound || 0),
          legalConfidence: 0.7 }) });
  }
  if ((S.incoming || 0) === 0) {
    cands.push({ id: 'naval', kind: 'naval',
      utility: Math.round((S.frontCount || 0) ? 36 : 82 - holdRisk * 55),
      v5: v5Contract('naval', 0, holdRisk, 1 - Math.min(1, holdRisk),
        { thirdPartyRisk: clamp(S.enemyBound || 0) }) });
  }
  if (S.partnerNeed === 1) {
    cands.push({ id: 'support:peer', kind: 'support', utility: 90,
      v5: v5Contract('support', 0, holdRisk, 1 - Math.min(1, holdRisk),
        { thirdPartyRisk: clamp(S.enemyBound || 0) }) });
  }
  return cands;
}

// Rule-basis sort (mirrors strategicCandidatePlan): utility desc, then id.
function ruleSort(cands) {
  return cands.slice().sort((a, b) =>
    (b.utility - a.utility) || String(a.id).localeCompare(String(b.id)));
}

// Per-frame evidence: one candidate set ranked by rule basis, model score, and
// the bounded control kernel. Returns the choices plus the two departure flags.
function frameEvidence(frame, model, gain = 18) {
  const S = frame.visibleState || {};
  const cands = buildCandidateSet(S);
  const scoreOf = (cd) => {
    const f = candidate.features(S, cd.v5);
    const o = candidate.predict(model, f);
    return o.heldGain - o.lossRisk;
  };
  const scores = new Map(cands.map(cd => [cd.id, scoreOf(cd)]));
  const scored = cands.map(cd => ({ id: cd.id, utility: cd.utility,
    score: scores.get(cd.id) }));
  const byRule = scored.slice().sort((a, b) =>
    (b.utility - a.utility) || String(a.id).localeCompare(String(b.id)));
  const byScore = scored.slice().sort((a, b) =>
    (b.score - a.score) || String(a.id).localeCompare(String(b.id)));
  const controlled = candidateControlKernel(cands, scores, gain);
  const ruleChoice = byRule[0].id;
  const modelChoice = byScore[0].id;
  const controlChoice = controlled[0].id;
  return {
    matchId: frame.matchId ?? null,
    tick: frame.tick ?? null,
    candidates: scored,
    ruleChoice,
    modelChoice,
    controlChoice,
    // The model's evaluation deviates from the rule basis when its top-1 by
    // score is not the rule's top-1 by utility.
    evaluationDeparted: modelChoice !== ruleChoice,
    // In the explicitly-activated control arm, the ACTUAL decision (the pick
    // that would be emitted) deviates from the rule basis when the control
    // kernel's top-1 is not the rule's top-1.
    changedIntent: controlChoice !== ruleChoice,
  };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// Run frameEvidence over the (validation) frames of a corrected dataset and
// summarize departures. Deterministic. opts: { onlyValidation=true, gain=18,
// maxSamples=Infinity, sample=25 }.
function diagnostic(dataset, model, opts = {}) {
  const gain = opts.gain ?? 18;
  const onlyValidation = opts.onlyValidation !== false;
  const splitPct = opts.splitPct ?? 80;
  const maxSamples = opts.maxSamples ?? Infinity;
  const frames = [];
  for (const m of dataset.matches) {
    if (onlyValidation && sideOf(String(m.matchId), splitPct) !== 'validation') continue;
    for (const f of (m.frames || [])) frames.push({ ...f, matchId: m.matchId });
  }
  frames.sort((a, b) => (a.tick || 0) - (b.tick || 0));
  const ev = frames.slice(0, maxSamples).map(f => frameEvidence(f, model, gain));
  const n = ev.length;
  const decisionDepartures = ev.filter(e => e.changedIntent);
  const evaluationDepartures = ev.filter(e => e.evaluationDeparted);
  const spread = ev.map(e => {
    const s = e.candidates.map(c => c.score);
    const m = mean(s);
    return Math.sqrt(mean(s.map(x => (x - m) * (x - m))));
  });
  const discriminative = spread.filter(x => x > 0.02).length;
  return {
    summary: {
      frames: n,
      evaluationDepartures: evaluationDepartures.length,
      evaluationDepartureRate: n ? evaluationDepartures.length / n : 0,
      decisionDepartures: decisionDepartures.length,
      decisionDepartureRate: n ? decisionDepartures.length / n : 0,
      discriminativeFrames: discriminative,
      meanCrossCandidateScoreStd: mean(spread),
      gain,
    },
    decisionDepartureFrames: decisionDepartures,
    evaluationDepartureSample: evaluationDepartures.slice(0, opts.sample ?? 25),
  };
}

module.exports = { v5Contract, buildCandidateSet, ruleSort, frameEvidence, diagnostic };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const arg = (name, def) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : def;
  };
  const modelPath = arg('--model', path.join(__dirname, 'candidate-v5-v2.json'));
  const datasetPath = arg('--dataset',
    path.join(__dirname, '..', 'tools', 'benchmark', 'v5full-v2', 'dataset.json'));
  const out = arg('--out', null);
  const model = candidate.validate(JSON.parse(fs.readFileSync(modelPath, 'utf8')));
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const report = diagnostic(dataset, model, { onlyValidation: true, sample: 40 });
  const text = JSON.stringify({
    generatedBy: 'trainer/v5-control-evidence.cjs',
    modelSHA256: candidate.sha(model),
    ...report,
  }, null, 2);
  if (out) { fs.writeFileSync(out, text); console.log('wrote ' + out); }
  else console.log(text);
}
