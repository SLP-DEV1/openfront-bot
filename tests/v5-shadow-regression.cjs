'use strict';
// P3 regression: connect the actually-trained schema-5 model to the EXISTING
// shadow ranking (via shadow-deploy) without changing any game intent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const candidate = require('../trainer/candidate-policy-v5.cjs');
const t = require('../trainer/train-v5.cjs');
const {makeDataset} = require('./fixtures/v5-dataset.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p3-shadow-'));
// Train a small deterministic model, then wire it into the shadow ranking.
const ds = makeDataset(24);
const res = t.train(ds, {epochs: 20, lr: 0.05, splitPct: 80});
const model = t.makeModel(res.w);
assert.equal(candidate.validate(model).weights.length, 702, 'trained model valid');
const modelPath = path.join(tmp, 'trained-v5.json');
fs.writeFileSync(modelPath, JSON.stringify(model));

const source = path.join(__dirname, '..', 'OpenFront_AggroBot_Impossible_Run3.user.js');
const out = path.join(tmp, 'shadow.user.js');
const r = spawnSync(process.execPath, [
  path.join(__dirname, '..', 'trainer', 'shadow-deploy.mjs'),
  '--model', modelPath, '--out', out, '--source', source
], {encoding: 'utf8'});
if (r.status !== 0) throw Error('shadow-deploy failed: ' + r.stderr + r.stdout);
const report = JSON.parse(r.stdout.trim().split('\n').pop());
assert.equal(report.schema, 5, 'shadow schema 5');
assert.equal(report.shadowOnly, true, 'shadow-only deploy');
assert.equal(report.modelEnabledByDefault, false, 'not enabled by default');
assert.equal(report.modelSHA256, candidate.sha(model), 'deployed model SHA matches');

const generated = fs.readFileSync(out, 'utf8');
// The trained model is embedded exactly (null replaced), as valid JS.
const expected = 'const SHADOW_V5_BUNDLED_MODEL = ' + JSON.stringify(model) + ';';
assert.ok(generated.includes(expected), 'exact trained model embedded');
assert.ok(!generated.includes('const SHADOW_V5_BUNDLED_MODEL = null;'), 'null replaced');
// Game intents unchanged: by default the schema-5 model only observes
// (no intent change); it can only override a bounded candidate when the
// explicit candidateControlEnabled flag is on, and the neural/promotion
// state is untouched by training alone.
assert.ok(generated.includes('changedIntent:false'), 'no-intent fallback preserved');
assert.ok(generated.includes('shadow-only; not observed game effect'),
  'shadow-only (no intent) evidence branch still present');
// The v6 refactor parameterized the evidence label by the live shadow
// schema (v5 or v6); assert the schema-parameterized template is present.
assert.ok(generated.includes('candidate-v${shadowSchema} bounded control override; legality still authoritative'),
  'bounded control override evidence branch present');
assert.ok(generated.includes('candidateControlEnabled'),
  'control gated on explicit candidateControlEnabled');
const neuralLine = generated.split('\n').find(l => l.includes('const NEURAL_BUNDLED_MODEL ='));
assert.ok(neuralLine, 'neural/promotion marker still present');
const neuralJson = neuralLine
  .slice(neuralLine.indexOf('const NEURAL_BUNDLED_MODEL = ') + 'const NEURAL_BUNDLED_MODEL = '.length, -1);
if (neuralJson !== 'null') assert.equal(JSON.parse(neuralJson).schema, 4,
  'promotion path still uses schema-4 champion (not the trained schema-5)');
fs.rmSync(tmp, {recursive: true, force: true});
console.log('PASS P3 shadow connection (trained model -> existing shadow ranking, no intent change)');
