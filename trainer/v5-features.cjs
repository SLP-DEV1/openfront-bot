'use strict';
// P3: Schema-5 feature availability audit and runtime feature parity.
//
// candidate-policy-v5.features() is the SINGLE source of truth for the 32
// inputs. At runtime (src/userscript/20-military-and-planning.js,
// strategicCandidatePlan) it is called with a fixed state/candidate shape:
//   state    = {home,maxTroops,committed,incoming,reserve,gold,land,capacityUse,frontCount}
//   candidate= {kind,costTroops,counterRisk,holdProbability}
// Features whose source fields are absent there are CONSTANT across all
// runtime frames and are masked (they must not carry learned signal). The
// training path must build the identical feature vector (feature parity).
const candidate = require('./candidate-policy-v5.cjs');

// The exact fields the runtime provides to shadowV5.features (kept in sync
// with strategicCandidatePlan). A feature is ACTIVE only if every one of its
// source fields is provided here.
const RUNTIME_STATE_FIELDS = [
  'home','maxTroops','committed','incoming','reserve','gold','land',
  'capacityUse','frontCount'
];
const RUNTIME_CANDIDATE_FIELDS = ['kind','costTroops','counterRisk','holdProbability'];

// Per-feature source manifest, index-aligned with candidate.features output.
// Each entry lists the "scope:field" source fields that drive that feature.
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
  ['candidate:kind'],                 // 29 (attack)
  ['candidate:kind'],                 // 30 (investment)
  ['candidate:kind']                  // 31 (naval)
];

const FEATURED_SCHEMA_VERSION = 1;

function sourceAvailable(field, runtimeState, runtimeCand){
  const sep = field.indexOf(':');
  const scope = field.slice(0, sep), name = field.slice(sep + 1);
  return (scope === 'state' ? runtimeState : runtimeCand).has(name);
}

function audit(){
  const runtimeState = new Set(RUNTIME_STATE_FIELDS);
  const runtimeCand = new Set(RUNTIME_CANDIDATE_FIELDS);
  const active = [], constant = [], constantValues = {};
  const baseline = candidate.features({}, {}); // all source fields absent
  MANIFEST.forEach((fields, i) => {
    const allPresent = fields.every(f => sourceAvailable(f, runtimeState, runtimeCand));
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
function buildFeatures(state, cand){
  return candidate.features(state, cand);
}

// Assert feature parity: the training builder produces the identical vector
// to the runtime shadowV5.features for the same state/candidate.
function assertFeatureParity(state, cand){
  const a = buildFeatures(state, cand);
  const b = candidate.features(state, cand);
  if (a.length !== b.length || a.some((v, i) => v !== b[i]))
    throw Error('Training/runtime feature parity violation');
  return a;
}

module.exports = {
  FEATURED_SCHEMA_VERSION, RUNTIME_STATE_FIELDS, RUNTIME_CANDIDATE_FIELDS,
  MANIFEST, audit, buildFeatures, assertFeatureParity
};
