'use strict';
const assert=require('node:assert/strict');
const {manifest}=require('../tools/benchmark/experiment-manifest.cjs');
const base={matchId:'world-001',seed:'paired-001',map:'World',
  mode:'official-2v2',botCommit:'a'.repeat(40),
  engineCommit:'b'.repeat(40),settings:{reserve:35,aggressive:85},
  participants:['botA','botB','enemyA','enemyB'],policy:'rule-basis'};
const assets={source:'source-v1',run3:'bundle-v1',model:'champion-v1'};
const x=manifest(base,assets);
assert.equal(x.schema,'aggrobot-experiment-v1');
assert.equal(x.participantSessions,4);
assert.equal(x.observationUnit,'match');
assert.equal(x.observedOutcome,'unknown');
assert.equal(x.settingsSha256,manifest({...base,
  settings:{aggressive:85,reserve:35}},assets).settingsSha256);
assert.notEqual(x.sourceSha256,manifest(base,{...assets,source:'source-v2'}).sourceSha256);
assert.throws(()=>manifest({...base,participants:['botA','botA','enemyA','enemyB']},assets));
assert.throws(()=>manifest({...base,engineCommit:'unknown'},assets));
assert.throws(()=>manifest({...base,mode:'1v1'},assets));
assert.throws(()=>manifest({...base,observedOutcome:'assumed-win'},assets));
assert.throws(()=>manifest({...base,settings:{reserve:Infinity}},assets));
const expectedHashes={settings:x.settingsSha256,source:x.sourceSha256,
  run3:x.run3Sha256,model:x.championSha256};
assert.deepEqual(manifest({...base,expectedHashes},assets),x,
  'identical pinned inputs retain reproducible manifest');
for(const key of Object.keys(expectedHashes)){
  assert.throws(()=>manifest({...base,expectedHashes:{
    ...expectedHashes,[key]:'0'.repeat(64)}},assets),
  /fingerprint mismatch/,key+' changed without updating pinned identity');
}
assert.throws(()=>manifest({...base,expectedHashes:{source:x.sourceSha256}},assets),
  /Expected all four/,'partial pins cannot hide a model or settings change');
assert.throws(()=>manifest({...base,expectedHashes:{
  ...expectedHashes,model:'not-a-sha'}},assets),/fingerprint mismatch/);
console.log('PASS pinned experiment fingerprints for source, Run3, champion and settings');
console.log('PASS paired experiment identity, hashes, valid outcomes and match-level observation');
