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
console.log('PASS paired experiment identity, hashes, valid outcomes and match-level observation');
