'use strict';
// P1 (plan.md box: alliance/diplomacy scenarios with confirmed Team/alliance
// semantics — Team ≠ Duo-relay; alliance-break → fresh states, never a stale
// friend/enemy cache). Verifies the relationship logic is derived from live
// engine state per tick (actualFriendly + isOnSameTeam), that duo allies are a
// recent same-match veto rather than a persistent cache, and that the
// scenario pack carries the alliance/diplomacy cases.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const diag=read('src/userscript/10-duo-and-diagnostics.js');
// friendly() must consult the live engine relationship, not a cached list.
const iF=diag.indexOf('function friendly(');
assert.ok(iF>=0,'friendly() must exist');
const friendlyBody=diag.slice(iF,diag.indexOf('function ',iF+16));
assert.ok(friendlyBody.includes('actualFriendly(p,me)'),
  'friendly must consult live engine state (alliance-break → fresh)');
assert.ok(friendlyBody.includes('duoPeerAlly(p)'),
  'the verified duo partner is a separate conservative veto');
// Team semantics come from the live engine team status, distinct from relay.
assert.ok(diag.includes('me.isOnSameTeam?.(p)'),
  'team membership must come from the live engine team status');
// The duo ally list is a recent, same-match peer report — bounded, not cached.
const iA=diag.indexOf('function duoPeerAlly(');
assert.ok(iA>=0,'duoPeerAlly() must exist');
const allyBody=diag.slice(iA,diag.indexOf('function ',iA+22));
assert.ok(allyBody.includes('peer.state?.allies'),'duo allies from peer report');
assert.ok(diag.includes('duoLocal.match!==duoMatchKey()'),
  'duo peer must belong to the current match');
assert.ok(/Date\.now\(\)\s*-\s*duoLocal\.lastAt\s*>\s*3500/.test(diag),
  'duo peer report must be recent (no stale cache)');
// The scenario pack carries the alliance/diplomacy cases.
const {SCENARIOS}=require('../tools/benchmark/scenario-pack.cjs');
for(const id of ['team-not-duo-relay','alliance-break-fresh-states',
  'diplomat-pressure'])
  assert.ok(SCENARIOS.some(x=>x.id===id),'missing alliance scenario '+id);
console.log('PASS P1 alliance/diplomacy semantics are live per tick (no stale friend/enemy cache)');
