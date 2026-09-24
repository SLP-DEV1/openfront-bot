'use strict';
// P3 regression: the corrected schema-5 candidate (trainer/candidate-v5-v2.json)
// is proven to deviate from the rule basis on the corrected validation data.
// Three properties are asserted, all deterministic:
//
//   1. DISCRIMINATIVE: the candidate's score varies across the candidates on a
//      large share of frames. The previously-degenerate (zero-init) model
//      returned ONE constant score for every candidate on every frame and
//      therefore could not deviate from the rule basis at all.
//   2. EVALUATION DEPARTURE: the model's top-1 by score differs from the rule
//      basis' top-1 by utility on a substantial share of frames.
//   3. CONTROL-ARM DECISION DEPARTURE: with the control arm explicitly
//      activated (candidateControlKernel, gain 18), the actual pick differs
//      from the rule basis' pick on at least one frame.
//
// A contrast with candidate.zero() documents that the departure is driven by
// the trained weights, not by the kernel.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const candidate = require('../trainer/candidate-policy-v5.cjs');
const ev = require('../trainer/v5-control-evidence.cjs');
const { sideOf } = require('../trainer/train-v5.cjs');

const modelPath = path.join(__dirname, '..', 'trainer', 'candidate-v5-v2.json');
const datasetPath = path.join(__dirname, '..', 'tools', 'benchmark', 'v5full-v2', 'dataset.json');
const model = candidate.validate(JSON.parse(fs.readFileSync(modelPath, 'utf8')));
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

function firstValidationFrame() {
  for (const m of dataset.matches) {
    if (sideOf(String(m.matchId), 80) !== 'validation') continue;
    const frames = (m.frames || []).slice().sort((a, b) => (a.tick || 0) - (b.tick || 0));
    if (frames.length) return { ...frames[0], matchId: m.matchId };
  }
  throw Error('no validation frame in corrected dataset');
}
const std = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, xs.length));
};

// --- 1. discriminative on a sample frame (and the degenerate model is not) ---
const frame0 = firstValidationFrame();
const trainedEv = ev.frameEvidence(frame0, model, 18);
const trainedScores = trainedEv.candidates.map(c => c.score);
assert.ok(std(trainedScores) > 0.02,
  'trained model discriminates across candidates (std ' + std(trainedScores).toFixed(4) + ')');

const zeroEv = ev.frameEvidence(frame0, candidate.zero(), 18);
const zeroScores = zeroEv.candidates.map(c => c.score);
assert.ok(zeroScores.every(s => Math.abs(s) < 1e-9),
  'zero model is constant (every score ~0), so it cannot rank candidates');

// --- 2. evaluation departure across the validation frames ---
const diag = ev.diagnostic(dataset, model, { onlyValidation: true, splitPct: 80 });
const n = diag.summary.frames;
assert.ok(n >= 300, 'enough validation frames (' + n + ')');
// The model must be discriminative on at least 90% of frames.
assert.ok(diag.summary.discriminativeFrames / n >= 0.9,
  'discriminative on >=90% of frames (' +
  (diag.summary.discriminativeFrames / n).toFixed(3) + ')');
// The model's evaluation must deviate from the rule basis on >=50% of frames.
assert.ok(diag.summary.evaluationDepartureRate >= 0.5,
  'evaluation departure >=50% (' + diag.summary.evaluationDepartureRate.toFixed(3) + ')');

// --- 3. control-arm decision departure exists ---
assert.ok(diag.summary.decisionDepartures >= 1,
  'at least one control-arm decision departure (' + diag.summary.decisionDepartures + ')');
// Each recorded departure is internally consistent: changedIntent means the
// control pick is a real candidate and differs from the rule pick.
for (const e of diag.decisionDepartureFrames) {
  assert.notEqual(e.controlChoice, e.ruleChoice, 'changedIntent implies a different pick');
  assert.ok(e.candidates.some(c => c.id === e.controlChoice), 'control pick is a real candidate');
}

// --- 4. the zero model is non-discriminative on EVERY validation frame ---
// (constant score for all candidates -> its ranking is pure tie-breaking, so it
//  cannot express a genuine deviation from the rule basis). The trained model
//  is discriminative on >=90% of frames (already asserted above).
for (const m of dataset.matches) {
  if (sideOf(String(m.matchId), 80) !== 'validation') continue;
  for (const f of (m.frames || [])) {
    const e = ev.frameEvidence({ ...f, matchId: m.matchId }, candidate.zero(), 18);
    assert.ok(e.candidates.every(c => Math.abs(c.score) < 1e-9),
      'zero model is constant on every frame');
  }
}

// --- 5. deterministic ---
const diag2 = ev.diagnostic(dataset, model, { onlyValidation: true, splitPct: 80 });
assert.deepEqual(diag2.summary, diag.summary, 'diagnostic is deterministic');

console.log('PASS P3 control departure (schema-5 candidate deviates from rule basis: ' +
  'evaluation ' + (diag.summary.evaluationDepartureRate * 100).toFixed(1) + '% of ' + n +
  ' frames; control-arm decision departures ' + diag.summary.decisionDepartures +
  '; discriminative ' + (diag.summary.discriminativeFrames / n * 100).toFixed(1) + '%)');
