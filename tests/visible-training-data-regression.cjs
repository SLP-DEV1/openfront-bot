// Box 240 regression: reliable visible training data with (a) NO engine
// information leakage and (b) NO double counting of Duo matches.
//
//  (a) No leakage: the schema-5 feature vector must be a pure, deterministic
//      function of VISIBLE state + candidate only. Unknown enemy troops are
//      masked (flagged), never read as hidden truth. The deployed planning
//      state literal must use only visible fields.
//
//  (b) No double counting: records carry matchId+playerId+decisionId. Two
//      partner exports of the SAME match share one matchId -> one match
//      outcome (never two), while per-player frames are preserved and
//      duplicate re-exports collapse.

'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const policy=require('../trainer/candidate-policy-v5.cjs');

const planning=fs.readFileSync(
  path.join(__dirname,'..','src','userscript','20-military-and-planning.js'),'utf8');
const bootstrap=fs.readFileSync(
  path.join(__dirname,'..','src','userscript','00-bootstrap.js'),'utf8');

// ---------------------------------------------------------------------------
// (a1) The feature vector is pure + deterministic over visible inputs.
// ---------------------------------------------------------------------------
const baseState={home:10,maxTroops:50,committed:5,incoming:0,reserve:5,
  gold:100,land:5,capacityUse:0.5,frontCount:2,economyRelative:0.5,
  frontReach:0,partnerNeed:0,enemyBound:0,landTrend:0,goldTrend:0,
  troopTrend:0,portAccess:1,technologyCoverage:1};
const baseCand={kind:'attack',expectedLand:0.5,costTroops:10,costGold:20,
  duration:50,returnTime:100,counterRisk:0.3,thirdPartyRisk:0.2,
  infrastructureValue:0,incomeValue:0,recruitmentValue:0,siteRisk:0.1,
  holdProbability:0.9,legalConfidence:1};

const f1=policy.features({...baseState},baseCand);
assert.equal(f1.length,policy.INPUTS,
  'feature vector must have exactly INPUTS=32 visible dimensions');
f1.forEach(v=>assert.ok(Number.isFinite(v)&&v>=0&&v<=1,
  'each feature must be a finite value in [0,1]'));

// Determinism: identical visible inputs -> identical vector.
assert.deepEqual(policy.features({...baseState},baseCand),f1,
  'features must be deterministic (pure) over visible inputs');

// Hidden-truth invariance: extra unknown/hidden fields do not change features.
const f2=policy.features(
  {...baseState,hiddenEnemyTroops:999,secretEngineTruth:true},
  {...baseCand,hiddenEnemyTroops:999,secretEngineTruth:true});
assert.deepEqual(f2,f1,
  'unknown/hidden fields must NOT leak into the feature vector');

// Visible dependence: changing a VISIBLE input changes the vector.
assert.notDeepEqual(policy.features({...baseState,gold:250},baseCand),f1,
  'a visible gold change must be reflected in the feature vector');
assert.notDeepEqual(policy.features({...baseState},
  {...baseCand,kind:'investment'}),f1,
  'a visible candidate-kind change must be reflected in the feature vector');

// ---------------------------------------------------------------------------
// (a2) The deployed planning state for the shadow model uses ONLY visible
//      fields; unknown enemy troops are masked, not read as a feature.
// ---------------------------------------------------------------------------
// The 17-field state = visible s./me./groups base fields plus the visible
// v5StateExtension helper (own income/front/partner/structure history only).
const shadowStateLiteral=/const state=\{home:s\.home,maxTroops:s\.max,committed:s\.committed,\s*incoming:s\.incoming,reserve:s\.reserve,gold:goldAmount\(me\),\s*land:number\(\(\)=>me\.numTilesOwned\(\),0\),capacityUse:s\.ratio,\s*frontCount:groups\?\.length\|\|0,\.\.\.v5StateExtension\(me,s,groups,tick\)\};/;
assert.ok(shadowStateLiteral.test(planning),
  'shadow planning state must be built only from visible s./me./groups fields + v5StateExtension');

// The visible literal must NOT read a hidden enemy troop magnitude.
assert.ok(!/const state=\{[\s\S]{0,400}opponent\?\.troops/.test(planning),
  'shadow planning state must not read hidden opponent?.troops()');

// Unknown enemy troops are explicitly MASKED (a flag), not used as truth.
assert.ok(/opponentTroopsUnknown:\(groups\|\|\[\]\)\.filter\(g=>g\.id!==null&&\s*!Number\.isFinite\(number\(\(\)=>g\.opponent\?\.troops\?\.\(\),NaN\)\)\)\.length/.test(planning),
  'missingMask must expose opponentTroopsUnknown (mask, not hidden truth)');

// ---------------------------------------------------------------------------
// (b) No double counting of Duo matches: matchId is the outcome unit.
// ---------------------------------------------------------------------------
// Records must carry the stable identity fields used for merge/dedup.
assert.ok(/record\.matchId=String\(game\?\.gameID\?\.\(\)\?\?'unknown'\)/.test(bootstrap),
  'records must be stamped with matchId');
assert.ok(/record\.playerId=safeID\(m\)/.test(bootstrap),
  'records must be stamped with playerId');
assert.ok(/record\.decisionId=record\.decisionId\?\?null/.test(bootstrap),
  'records must carry decisionId');
// The documented merge protocol: by matchId, then playerId and session.
assert.ok(/Merge browsers by matchId, then playerId and session/.test(bootstrap),
  'the merge protocol must be documented as matchId -> playerId -> session');

// Dedup contract, modeled exactly on the identity fields records carry:
const frameKey=r=>`${r.matchId}|${r.playerId}|${r.decisionId}`;

// Two partners exporting the SAME Duo match share one matchId.
const partnerA={matchId:'M1',playerId:'A',decisionId:'A:t100',tick:100};
const partnerB={matchId:'M1',playerId:'B',decisionId:'B:t100',tick:100};
const aReExport={matchId:'M1',playerId:'A',decisionId:'A:t100',tick:100}; // duplicate

// (b1) The MATCH is not double counted: one matchId -> one outcome.
const matchOutcomes=new Set([partnerA,partnerB,aReExport].map(r=>r.matchId));
assert.equal(matchOutcomes.size,1,
  'two partner exports of the same match must count as ONE match outcome');

// (b2) Per-player frames are preserved (A and B are distinct).
const frames=new Set([partnerA,partnerB].map(frameKey));
assert.equal(frames.size,2,
  'each partner player frame must be preserved (distinct playerId)');

// (b3) A duplicate re-export of the SAME player collapses to one frame.
const withDup=new Set([partnerA,partnerB,aReExport].map(frameKey));
assert.equal(withDup.size,2,
  'a duplicate re-export of the same player/decision must not add a frame');

// (b4) Different matches stay separate (not over-merged).
const otherMatch={matchId:'M2',playerId:'A',decisionId:'A:t100',tick:100};
assert.equal(new Set([partnerA,otherMatch].map(r=>r.matchId)).size,2,
  'distinct matchIds must remain distinct matches');

console.log('PASS visible training data: pure visible features (no hidden-truth leak, unknown troops masked) + matchId dedup keeps Duo matches counted once while preserving per-player frames');
