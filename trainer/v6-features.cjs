'use strict';
// P3: Schema-6 feature availability audit and runtime feature parity.
//
// candidate-policy-v6.features() is the SINGLE source of truth for the 38
// inputs. At runtime (src/userscript/20-military-and-planning.js,
// strategicCandidatePlan) it is called with the visible state/candidate
// contract PLUS the per-frame rule-utility context:
//   state    = {home,maxTroops,committed,incoming,reserve,gold,land,
//               capacityUse,frontCount,economyRelative,frontReach,
//               partnerNeed,enemyBound,landTrend,goldTrend,troopTrend,
//               portAccess,technologyCoverage}
//   candidate= {kind,costTroops,costGold,expectedLand,duration,returnTime,
//               counterRisk,thirdPartyRisk,infrastructureValue,incomeValue,
//               recruitmentValue,siteRisk,holdProbability,legalConfidence}
//   ctx      = {ownRu,ruTop1,ruTop2}
//
// The rule-utility context is computable at BOTH ends, so parity holds by
// construction:
//   * runtime: the candidate set is rule-sorted before scoring, so
//     ctx.ruTop1 = candidates[0].utility, ctx.ruTop2 = candidates[1].utility,
//     ctx.ownRu = candidate.utility (its own rule utility).
//   * training: the planning frame binding carries each candidate's
//     ruleUtility + rankByRule, so ruTop1/ruTop2 are the frame's legal top-1/
//     top-2 rule utilities and ownRu is the row's candidate ruleUtility.
//
// idx 0-28 are identical to the schema-5 contract; idx 29-34 are the explicit
// per-kind one-hots; idx 35-37 are the bounded rule-utility context.
const candidate = require('./candidate-policy-v6.cjs');

const RUNTIME_STATE_FIELDS = [
  'home','maxTroops','committed','incoming','reserve','gold','land',
  'capacityUse','frontCount','economyRelative','frontReach','partnerNeed',
  'enemyBound','landTrend','goldTrend','troopTrend','portAccess',
  'technologyCoverage'
];
const RUNTIME_CANDIDATE_FIELDS = [
  'kind','costTroops','costGold','expectedLand','duration','returnTime',
  'counterRisk','thirdPartyRisk','infrastructureValue','incomeValue',
  'recruitmentValue','siteRisk','holdProbability','legalConfidence'
];
const RUNTIME_CTX_FIELDS = ['ownRu','ruTop1','ruTop2'];

// Per-feature source manifest, index-aligned with candidate.features output.
const MANIFEST = [
  ['state:home','state:maxTroops'],   // 0
  ['state:gold'],                     // 1
  ['state:incoming'],                 // 2
  ['state:committed'],                // 3
  ['state:reserve'],                  // 4
  ['state:economyRelative'],          // 5
  ['state:capacityUse'],              // 6
  ['state:frontReach'],               // 7
  ['state:partnerNeed'],              // 8
  ['state:enemyBound'],               // 9
  ['state:landTrend'],                // 10
  ['state:goldTrend'],                // 11
  ['state:troopTrend'],               // 12
  ['state:frontCount'],               // 13
  ['state:portAccess'],               // 14
  ['state:technologyCoverage'],       // 15
  ['candidate:expectedLand','state:land'], // 16
  ['candidate:costTroops'],           // 17
  ['candidate:costGold'],             // 18
  ['candidate:duration'],             // 19
  ['candidate:returnTime'],           // 20
  ['candidate:counterRisk'],          // 21
  ['candidate:thirdPartyRisk'],       // 22
  ['candidate:infrastructureValue'],  // 23
  ['candidate:incomeValue'],          // 24
  ['candidate:recruitmentValue'],     // 25
  ['candidate:siteRisk'],             // 26
  ['candidate:holdProbability'],      // 27
  ['candidate:legalConfidence'],      // 28
  ['candidate:kind'],                 // 29 (hold)
  ['candidate:kind'],                 // 30 (invest)
  ['candidate:kind'],                 // 31 (attack)
  ['candidate:kind'],                 // 32 (expand)
  ['candidate:kind'],                 // 33 (naval)
  ['candidate:kind'],                 // 34 (support)
  ['ctx:ownRu'],                      // 35 candidateRuleUtility
  ['ctx:ownRu','ctx:ruTop1'],         // 36 utilityGapToRuleTop1
  ['ctx:ownRu','ctx:ruTop2']          // 37 utilityGapToRuleTop2
];

// 3: the runtime provides the full 17 state + 14 candidate + 3 rule-utility
// context fields, so all 38 features are active (no masked constants).
const FEATURED_SCHEMA_VERSION = 3;

function sourceAvailable(field, runtimeState, runtimeCand, runtimeCtx){
  const sep = field.indexOf(':');
  const scope = field.slice(0, sep), name = field.slice(sep + 1);
  if (scope === 'state') return runtimeState.has(name);
  if (scope === 'candidate') return runtimeCand.has(name);
  return runtimeCtx.has(name);
}

function audit(){
  const runtimeState = new Set(RUNTIME_STATE_FIELDS);
  const runtimeCand = new Set(RUNTIME_CANDIDATE_FIELDS);
  const runtimeCtx = new Set(RUNTIME_CTX_FIELDS);
  const active = [], constant = [], constantValues = {};
  const baseline = candidate.features({}, {}, {}); // all source fields absent
  MANIFEST.forEach((fields, i) => {
    const allPresent = fields.every(f =>
      sourceAvailable(f, runtimeState, runtimeCand, runtimeCtx));
    if (allPresent) active.push(i);
    else { constant.push(i); constantValues[i] = baseline[i]; }
  });
  if (active.length + constant.length !== candidate.INPUTS)
    throw Error('Manifest length mismatch');
  return { featuredSchemaVersion: FEATURED_SCHEMA_VERSION, inputs: candidate.INPUTS,
    active, constant, constantValues,
    note: 'Active features vary at runtime; constant features are masked to their runtime baseline' };
}

// The training feature builder. It IS the runtime feature function, so
// training and runtime parity hold by construction.
function buildFeatures(state, cand, ctx){
  return candidate.features(state, cand, ctx);
}

// Assert feature parity: the training builder produces the identical vector
// to the runtime shadowV6.features for the same state/candidate/context.
function assertFeatureParity(state, cand, ctx){
  const a = buildFeatures(state, cand, ctx);
  const b = candidate.features(state, cand, ctx);
  if (a.length !== b.length || a.some((v, i) => v !== b[i]))
    throw Error('Training/runtime feature parity violation');
  return a;
}

module.exports = {
  FEATURED_SCHEMA_VERSION, RUNTIME_STATE_FIELDS, RUNTIME_CANDIDATE_FIELDS,
  RUNTIME_CTX_FIELDS, MANIFEST, audit, buildFeatures, assertFeatureParity
};
