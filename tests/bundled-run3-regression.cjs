'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(root, 'OpenFront_Solo_AggroBot.user.js'), 'utf8');
const deployed = fs.readFileSync(path.join(root, 'OpenFront_AggroBot_Impossible_Run3.user.js'), 'utf8');
const model = JSON.parse(fs.readFileSync(path.join(root,
  'docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json'), 'utf8'));
assert.equal(model.schema, 4);
assert.equal(model.arch, '24x24x16-tanh');
assert.equal(model.weights.length, 1000);
assert(model.weights.every(v => Number.isFinite(v) && Math.abs(v) <= 5));
const marker = 'const NEURAL_BUNDLED_MODEL = null;';
assert.equal(original.split(marker).length, 2);
const expected = original.replace(marker, 'const NEURAL_BUNDLED_MODEL = ' + JSON.stringify(model) + ';')
  .replace('// @name         OpenFront Solo AggroBot',
    '// @name         OpenFront AggroBot Impossible Run3 Neural')
  .replace('// @description  OpenFront autopilot for Singleplayer, Public and Private games; economy, combat, nukes, defense and diplomacy.',
    '// @description  AggroBot 1.20.5 with bundled Impossible Run3 schema-4 champion (experimental); no external Brain or Qwen.');
assert.equal(deployed, expected, 'Live bundle must match source and reviewed champion');
execFileSync(process.execPath, ['--check', path.join(root, 'OpenFront_AggroBot_Impossible_Run3.user.js')], {stdio:'pipe'});
console.log('PASS bundled Impossible Run3: verified model, source parity and JS syntax');
