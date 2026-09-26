'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const base=path.join(root,'benchmark-results','overnight-20260924-v6');
const campaign=JSON.parse(fs.readFileSync(path.join(base,'campaign-state.json'),'utf8'));
const promotion=JSON.parse(fs.readFileSync(
  path.join(base,'o7hold','promotion-decision.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(base,'inventory.json'),'utf8'));
const run3=(inventory.models||[]).find(x=>x.id==='run3');
assert.ok(run3,'run3 inventory entry missing');

const active=campaign.finalResult?.activeChampion;
assert.equal(typeof active,'object','activeChampion must be structured');
assert.equal(active.name,'run3');
assert.equal(active.schema,4);
assert.equal(active.policySHA256,run3.policySHA256);
assert.equal(active.fileSHA256,run3.fileSHA256);
assert.equal(active.policySHA256,promotion.references?.run3);
assert.notEqual(active.policySHA256,active.fileSHA256,
  'policy SHA and file SHA are different identity domains');
assert.equal(campaign.finalResult?.promoted,false);
assert.equal(active.promoted,false);

console.log('overnight champion provenance regression: ok');
