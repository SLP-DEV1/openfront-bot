'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {renderBundle,sha256} = require('../tools/build-run3-bundle.cjs');

const root = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(root, 'OpenFront_Solo_AggroBot.user.js'), 'utf8');
const deployed = fs.readFileSync(path.join(root, 'OpenFront_AggroBot_Impossible_Run3.user.js'), 'utf8');
const modelPath = path.join(root,
  'docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json');
const bytes = fs.readFileSync(modelPath);
const model = JSON.parse(bytes.toString('utf8'));
assert.equal(model.schema, 4);
assert.equal(model.arch, '24x24x16-tanh');
assert.equal(model.weights.length, 1000);
assert(model.weights.every(v => Number.isFinite(v) && Math.abs(v) <= 5));
assert.equal(deployed, renderBundle(original, model),
  'Live bundle must match generator, source and reviewed champion');
execFileSync(process.execPath, ['--check',
  path.join(root, 'OpenFront_AggroBot_Impossible_Run3.user.js')], {stdio:'pipe'});
console.log('PASS bundled Impossible Run3: source parity, model SHA-256=' +
  sha256(bytes) + ', JS syntax');
