'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const base=path.join(root,'benchmark-results','overnight-20260924-v6');
const state=JSON.parse(fs.readFileSync(path.join(base,'campaign-state.json'),'utf8'));
const decision=JSON.parse(fs.readFileSync(path.join(base,'o7hold','promotion-decision.json'),'utf8'));

const champion=state.finalResult?.activeChampion;
assert.ok(champion&&typeof champion==='object','activeChampion must be typed object');
assert.equal(champion.name,'run3');
assert.equal(champion.schema,4);
assert.match(champion.policySHA256,/^[a-f0-9]{64}$/);
assert.match(champion.fileSHA256,/^[a-f0-9]{64}$/);
assert.notEqual(champion.policySHA256,champion.fileSHA256,'policy and file identities must remain distinct');
assert.equal(champion.policySHA256,decision.references.run3,'campaign state must use same Run3 policy identity as promotion decision');
assert.equal(champion.promoted,false);
console.log('overnight champion provenance regression: ok');
