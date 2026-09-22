'use strict';
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

(async () => {
  const {createLeaguePlan} = await import(pathToFileURL(
    path.join(__dirname, '..', 'tools', 'benchmark', 'league-plan.mjs')).href);
  const base = {botCommit:'a'.repeat(40),engineCommit:'b'.repeat(40),
    seeds:['seed-1'],maps:['World'],modes:['1v1'],candidate:'run3'};
  const a = createLeaguePlan(base);
  const again = createLeaguePlan(base);
  assert.deepEqual(a.matches, again.matches, 'same provenance yields stable matches');
  assert.equal(a.matches.length, a.profiles.length, 'one match per opponent profile');
  assert.equal(new Set(a.matches.map(m => m.matchId)).size, a.matches.length);
  assert.ok(a.matches.every(m => m.result === null && m.observedOutcome === 'unknown'),
    'a plan does not fabricate observed results');
  const botChanged = createLeaguePlan({...base,botCommit:'c'.repeat(40)});
  const engineChanged = createLeaguePlan({...base,engineCommit:'d'.repeat(40)});
  assert.notEqual(a.matches[0].matchId,botChanged.matches[0].matchId,
    'bot commit belongs in match identity');
  assert.notEqual(a.matches[0].matchId,engineChanged.matches[0].matchId,
    'engine commit belongs in match identity');
  const uppercase = createLeaguePlan({...base,botCommit:base.botCommit.toUpperCase()});
  assert.deepEqual(a.matches,uppercase.matches,'hex case must not change identity');
  assert.notEqual(a.matches[0].matchId,
    createLeaguePlan({...base,seeds:['seed-2']}).matches[0].matchId);
  assert.notEqual(a.matches[0].matchId,
    createLeaguePlan({...base,maps:['Europe']}).matches[0].matchId);
  assert.notEqual(a.matches[0].matchId,
    createLeaguePlan({...base,modes:['official-2v2']}).matches[0].matchId);
  assert.equal(createLeaguePlan({...base,modes:['official-2v2']})
    .matches[0].participantClients.length,4);
  console.log('PASS P6 league plan provenance IDs');
})().catch(e => {console.error(e);process.exitCode=1;});
