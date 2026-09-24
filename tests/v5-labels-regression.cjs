'use strict';
// P3 regression: schema-5 target/label construction hygiene.
const assert = require('node:assert/strict');
const lab = require('../trainer/v5-labels.cjs');

// A match whose land increases over time.
const rising = Array.from({length: 12}, (_, f) => ({
  tick: f * 10,
  visibleState: {land: 10 + f * 2},
  action: {type: f % 2 === 0 ? 'attack' : 'investment'}
}));
const H = 60, LAND = 8;
const rows = lab.buildLabels(rising, {horizonTicks: H, landScale: LAND, matchOutcome: 'victory'});
// Early frames reach the horizon (10 + f*2 over +60 ticks => up to +12).
for (let i = 0; i < 6; i++){
  assert.equal(rows[i].usable, true, 'usable at ' + i);
  assert.equal(typeof rows[i].heldGain, 'number', 'heldGain number');
  assert.ok(rows[i].heldGain > 0 && rows[i].heldGain <= 1, 'heldGain in (0,1]');
  assert.ok(rows[i].lossRisk >= 0 && rows[i].lossRisk <= 1, 'lossRisk in [0,1]');
  // Rising land => minimal observed drop within the window.
  assert.equal(rows[i].lossRisk, 0, 'no loss while land rises');
}
// The last frames cannot reach +60 ticks => UNKNOWN, must be null (not 0).
for (let i = 6; i < 12; i++){
  assert.equal(rows[i].usable, false, 'not usable at ' + i);
  assert.equal(rows[i].heldGain, null, 'heldGain null when horizon not reached');
  assert.equal(rows[i].lossRisk, null, 'lossRisk null (unknown != 0)');
}
// behaviorChoice mirrors the executed action and marks selection bias.
assert.equal(rows[0].behaviorChoice, 'attack', 'behaviorChoice = executed type');
assert.equal(rows[1].behaviorChoice, 'investment', 'behaviorChoice = executed type');
assert.equal(rows[0].selectionBias, true, 'human choice is selection-biased');

// A defeated match with falling land: loss realized => lossRisk 1, heldGain 0.
const falling = Array.from({length: 12}, (_, f) => ({
  tick: f * 10, visibleState: {land: 20 - f * 2}, action: {type: 'attack'}
}));
const frows = lab.buildLabels(falling, {horizonTicks: H, landScale: LAND, matchOutcome: 'defeat'});
assert.equal(frows[0].heldGain, 0, 'net territorial loss clamps to 0');
assert.equal(frows[0].lossRisk, 1, 'defeat realized within window => lossRisk 1');
assert.equal(frows[0].usable, true, 'usable despite loss');

// A wait/no-action frame still yields outcome labels but no imitation label.
const noAction = Array.from({length: 12}, (_, f) => ({
  tick: f * 10, visibleState: {land: 10 + f}, action: {type: null}
}));
const nrows = lab.buildLabels(noAction, {horizonTicks: H, landScale: LAND});
assert.equal(nrows[0].behaviorChoice, null, 'no executed action => no imitation label');
assert.equal(nrows[0].selectionBias, false, 'no selection bias without a choice');
assert.equal(typeof nrows[0].heldGain, 'number', 'outcome labels still present');

// Chosen-only attribution: an unchosen candidate (observed:false) must NOT
// inherit the executed action's outcome labels — unknown (null), never 0.
const multi = [
  {tick: 0, observed: false, visibleState: {land: 10}, action: {type: 'attack'}},
  {tick: 0, observed: true, visibleState: {land: 10}, action: {type: 'investment'}},
  {tick: 10, observed: true, visibleState: {land: 12}, action: {type: 'investment'}},
  {tick: 20, observed: true, visibleState: {land: 14}, action: {type: 'investment'}},
  {tick: 30, observed: true, visibleState: {land: 16}, action: {type: 'investment'}},
  {tick: 40, observed: true, visibleState: {land: 18}, action: {type: 'investment'}},
  {tick: 50, observed: true, visibleState: {land: 20}, action: {type: 'investment'}},
  {tick: 60, observed: true, visibleState: {land: 22}, action: {type: 'investment'}}
];
const mrows = lab.buildLabels(multi, {horizonTicks: H, landScale: LAND, matchOutcome: 'victory'});
assert.equal(mrows[0].usable, false, 'unchosen candidate is not usable');
assert.equal(mrows[0].heldGain, null, 'unchosen heldGain unknown');
assert.equal(mrows[0].lossRisk, null, 'unchosen lossRisk unknown (never 0)');
assert.equal(mrows[0].observed, false, 'unchosen row flagged unobserved');
assert.equal(mrows[0].counterfactual, true, 'unchosen row flagged counterfactual');
assert.equal(mrows[0].selectionBias, false, 'no selection bias for an unchosen row');
assert.equal(mrows[1].usable, true, 'chosen row carries observed labels');
assert.ok(mrows[1].heldGain > 0 && mrows[1].heldGain <= 1, 'chosen heldGain observed');
assert.equal(mrows[1].observed, true, 'chosen row flagged observed');
// A realized defeat must not leak into the unchosen row either.
const drows = lab.buildLabels(multi.map(r => ({...r})), {horizonTicks: H, landScale: LAND, matchOutcome: 'defeat'});
assert.equal(drows[0].heldGain, null, 'defeat: unchosen heldGain still unknown');
assert.equal(drows[0].lossRisk, null, 'defeat: unchosen lossRisk still unknown');

// Validation: horizon and scale must be positive.
assert.throws(() => lab.buildLabels(rising, {horizonTicks: 0, landScale: LAND}), /horizonTicks/);
assert.throws(() => lab.buildLabels(rising, {horizonTicks: H, landScale: 0}), /landScale/);
console.log('PASS P3 label construction (horizon, unknown!=0, behaviorChoice, selection bias, chosen-only attribution)');
