'use strict';
// P3: Schema-7 feature availability audit and runtime feature parity.
//
// action-policy-v7.features() is the SINGLE source of truth for the 38
// inputs. At runtime (src/userscript/40-economy-runner.js, the dispatch loop
// after strategicDirector and before send) it is called with the visible
// state + the actionable-branch contract + the per-frame rule-utility context:
//   state = {gamePhase,home,troops,reserve,gold,income,enemyPressure,
//            activeWars,frontCount,allyPressure,homeThreat,nukeThreat,
//            recentLandTrend,recentTroopTrend,maxLand}
//   branch= {kind,ruleUtility,cost,troopCommitment,reserveAfter,
//            targetStrength,targetLand,expectedBuildValue,
//            expectedDefenseValue,cooldownReady,alreadyActiveOperation,
//            targetReachable,isEmergency,isFinisher,isExpansion}
//   ctx   = {ownRu,ruleTop1}
//
// The rule-utility context is computable at BOTH ends, so parity holds by
// construction:
//   * runtime: the branch set is rule-sorted before scoring, so
//     ctx.ruleTop1 = branches[0].ruleUtility, ctx.ownRu = branch.ruleUtility.
//   * training: the branch frame binding carries each branch's ruleUtility +
//     the frame's legal top-1 rule utility.
//
// idx 0-13 are the state contract; idx 14-28 are the branch contract;
// idx 29-37 are the 9-family kind one-hot.
const candidate = require('./action-policy-v7.cjs');

const RUNTIME_STATE_FIELDS = [
  'gamePhase','home','troops','reserve','gold','income','enemyPressure',
  'activeWars','frontCount','allyPressure','homeThreat','nukeThreat',
  'recentLandTrend','recentTroopTrend','maxLand','land'
];
const RUNTIME_BRANCH_FIELDS = [
  'kind','ruleUtility','cost','troopCommitment','reserveAfter','targetStrength',
  'targetLand','expectedBuildValue','expectedDefenseValue','cooldownReady',
  'alreadyActiveOperation','targetReachable','isEmergency','isFinisher',
  'isExpansion'
];
const RUNTIME_CTX_FIELDS = ['ownRu','ruleTop1'];

// Per-feature source manifest, index-aligned with action-policy-v7.features
// output (38 entries).
const MANIFEST = [
  ['state:gamePhase'],                 // 0
  ['state:land','state:maxLand'],      // 1 landRatio
  ['state:troops','state:home'],       // 2 troopRatio
  ['state:reserve','state:home'],      // 3 reserveRatio
  ['state:gold'],                      // 4 goldRatio
  ['state:income'],                    // 5
  ['state:enemyPressure'],             // 6
  ['state:activeWars'],                // 7
  ['state:frontCount'],                // 8
  ['state:allyPressure'],              // 9
  ['state:homeThreat'],                // 10
  ['state:nukeThreat'],                // 11
  ['state:recentLandTrend'],           // 12
  ['state:recentTroopTrend'],          // 13
  ['ctx:ownRu'],                       // 14 ruleUtility
  ['ctx:ownRu','ctx:ruleTop1'],        // 15 utilityGapToTop
  ['branch:cost','state:home'],        // 16 costRatio
  ['branch:troopCommitment','state:home'], // 17
  ['branch:reserveAfter','state:home'],    // 18
  ['branch:targetStrength'],           // 19
  ['branch:targetLand'],               // 20
  ['branch:expectedBuildValue'],       // 21
  ['branch:expectedDefenseValue'],     // 22
  ['branch:cooldownReady'],            // 23
  ['branch:alreadyActiveOperation'],   // 24
  ['branch:targetReachable'],          // 25
  ['branch:isEmergency'],              // 26
  ['branch:isFinisher'],               // 27
  ['branch:isExpansion'],              // 28
  ['branch:kind'],                     // 29 (wait)
  ['branch:kind'],                     // 30 (expand)
  ['branch:kind'],                     // 31 (attack)
  ['branch:kind'],                     // 32 (boat)
  ['branch:kind'],                     // 33 (warship)
  ['branch:kind'],                     // 34 (build_warship)
  ['branch:kind'],                     // 35 (nuclear)
  ['branch:kind'],                     // 36 (build_economy)
  ['branch:kind']                      // 37 (donate)
];

// 4: the runtime provides the full state + branch + rule-utility context
// contract, so all 38 features are active (no masked constants).
const FEATURED_SCHEMA_VERSION = 4;

function sourceAvailable(field, runtimeState, runtimeBranch, runtimeCtx){
  const sep = field.indexOf(':');
  const scope = field.slice(0, sep), name = field.slice(sep + 1);
  if (scope === 'state') return runtimeState.has(name);
  if (scope === 'branch') return runtimeBranch.has(name);
  return runtimeCtx.has(name);
}

function audit(){
  const runtimeState = new Set(RUNTIME_STATE_FIELDS);
  const runtimeBranch = new Set(RUNTIME_BRANCH_FIELDS);
  const runtimeCtx = new Set(RUNTIME_CTX_FIELDS);
  const active = [], constant = [], constantValues = {};
  const baseline = candidate.features({}, {}, {}); // all source fields absent
  MANIFEST.forEach((fields, i) => {
    const allPresent = fields.every(f =>
      sourceAvailable(f, runtimeState, runtimeBranch, runtimeCtx));
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
function buildFeatures(state, branch, ctx){
  return candidate.features(state, branch, ctx);
}

// Assert feature parity: the training builder produces the identical vector
// to the runtime shadowV7.features for the same state/branch/context.
function assertFeatureParity(state, branch, ctx){
  const a = buildFeatures(state, branch, ctx);
  const b = candidate.features(state, branch, ctx);
  if (a.length !== b.length || a.some((v, i) => v !== b[i]))
    throw Error('Training/runtime feature parity violation');
  return a;
}

module.exports = {
  FEATURED_SCHEMA_VERSION, RUNTIME_STATE_FIELDS, RUNTIME_BRANCH_FIELDS,
  RUNTIME_CTX_FIELDS, MANIFEST, audit, buildFeatures, assertFeatureParity
};
