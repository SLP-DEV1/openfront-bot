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

// Validation: horizon and scale must be positive.
assert.throws(() => lab.buildLabels(rising, {horizonTicks: 0, landScale: LAND}), /horizonTicks/);
assert.throws(() => lab.buildLabels(rising, {horizonTicks: H, landScale: 0}), /landScale/);
console.log('PASS P3 label construction (horizon, unknown!=0, behaviorChoice, selection bias)');
