'use strict';
// Box 242 (runtime half): the schema-5 shadow changes NO emitted intent and is
// observed completely and correctly labeled as NOT causal.
//
// We boot the real bundled userscript twice in fresh VM contexts against the
// exact same deterministic game stub:
//   - shadow OFF  (SHADOW_V5_BUNDLED_MODEL = null, default)
//   - shadow ON   (a valid zero model injected, opts.shadowRankEnabled=true)
// and assert:
//   1. The emitted intent (planning.selected.id) is IDENTICAL in both boots,
//      and equals the top-ranked candidate (the rule choice). The shadow's own
//      pick (wouldPrefer / modelChoice) is recorded separately and is never
//      injected into the emitted intent.
//   2. With shadow ON the observation is complete: modelScores is a non-empty
//      ranking over candidates, modelChoice is a real candidate id, and
//      shadowDecisionEvidence is present.
//   3. shadowDecisionEvidence.changedIntent === false and its evidence string
//      labels the observation as "not observed game effect" (non-causal).
//   4. Shadow is opt-in: with the shipped null model it stays off.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const zero = require('../trainer/candidate-policy-v5.cjs').zero();
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'OpenFront_Solo_AggroBot.user.js'), 'utf8');
const anchor = "  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, auto-start after match discovery');";
assert(source.includes(anchor), 'bot test injection anchor missing');
assert(source.includes('SHADOW_V5_BUNDLED_MODEL = null'), 'shadow opt-in default must be null');

function boot({ shadowOn }) {
  const modelJson = JSON.stringify(zero);
  const code = shadowOn
    ? source.replace('SHADOW_V5_BUNDLED_MODEL = null',
      'SHADOW_V5_BUNDLED_MODEL = ' + modelJson)
    : source;

  let tick = 300, land = 1200, gold = 1000000, home = 90000, gameOver = false;
  const out = [], incoming = [], sent = [];
  const me = {
    id: () => 'me', clientID: () => 'client-me', smallID: () => 1,
    troops: () => home, numTilesOwned: () => land, gold: () => BigInt(gold),
    isAlive: () => true, hasSpawned: () => true, isPlayer: () => true,
    units: () => [], outgoingAttacks: () => out, incomingAttacks: () => incoming,
    isFriendly: () => false, state: {spawnTile: 505}, displayName: () => 'Me',
    borderTiles: async () => ({borderTiles: [1000]}),
    actions: async (tile, types) => ({
      canAttack: true,
      buildableUnits: (types || []).map(type => ({
        type, canBuild: false, canUpgrade: false, cost: 125000n
      }))
    })
  };
  const enemy = (id, troops, num, tiles) => ({
    id: () => id, smallID: () => num, troops: () => troops, numTilesOwned: () => tiles,
    isAlive: () => true, isPlayer: () => true, isFriendly: () => false,
    units: () => [], displayName: () => id
  });
  const weak = enemy('weak', 20000, 2, 900), strong = enemy('strong', 85000, 3, 1200);
  weak.state = {spawnTile: 5}; strong.state = {spawnTile: 6};
  const config = {
    gameConfig: () => ({gameType: 'Singleplayer', difficulty: 'Impossible'}),
    isReplay: () => false, maxTroops: () => 100000,
    infiniteTroops: () => false, infiniteGold: () => false,
    isUnitDisabled: () => false, samRange: () => 70
  };
  const game = {
    gameID: () => 'game-shadow', config: () => config, myPlayer: () => me,
    ticks: () => tick, gameOver: () => gameOver,
    playerViews: () => [me, weak, strong], units: () => [], inSpawnPhase: () => false,
    terrainByte: () => 1,
    x: t => t % 100, y: t => Math.floor(t / 100), width: () => 100, height: () => 100,
    ref: (x, y) => y * 100 + x,
    isValidRef: t => Number.isInteger(t) && t >= 0 && t < 10000,
    isLand: () => true, isImpassable: () => false, isShore: () => false,
    ownerID: () => 1, owner: t => t === 5005 ? weak : t === 5006 ? strong : me,
    neighbors4: (t, scratch) => { if (t !== 1000) return 0; scratch.push(5005, 5006); return 2; }
  };
  const fixedDate = class extends Date { static now() { return 1789848000000; } };
  class Attack { constructor(targetID, troops) { this.targetID = targetID; this.troops = troops; } }
  class Build { constructor(unit, tile) { this.unit = unit; this.tile = tile; } }
  const win = {addEventListener: () => {}};
  const busStub = {emit: e => sent.push(e), listeners: {keys: () => [Attack, Build]}};
  const context = {
    window: win,
    document: {readyState: 'loading', body: null, addEventListener: () => {},
      querySelector: () => ({game, eventBus: busStub})},
    localStorage: {getItem: () => null, setItem: () => {}},
    Date: fixedDate,
    console: {info: () => {}, warn: () => {}, error: () => {}},
    setInterval: () => 1, clearInterval: () => {},
    setTimeout: fn => 1,
    performance: {now: () => 0},
    URL: {createObjectURL: () => '', revokeObjectURL: () => {}},
    Blob: class {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async () => { throw Error('Unexpected network request in regression'); }
  };
  const expose = [
    'window.__test={',
    'setup:(g,b,c)=>{game=g;bus=b;ctors=c;opts.enabled=true;},',
    'step,resolveDecisionFrames,telemetry,send,diagnosticSnapshot,',
    'setMonitorSession:x=>monitorSession=x,setLastEmission:n=>lastEmission=n,',
    'frames:()=>decisionFrames.map(f=>({...f})),',
    'ledger:()=>actionLedger.map(e=>({...e})),',
    'opts};'
  ].join('\n');
  vm.runInNewContext(code.replace(anchor, expose + '\n' + anchor), context, {timeout: 4000});
  win.__test.setup(game, busStub, {attack: Attack, build: Build});
  if (shadowOn) win.__test.opts.shadowRankEnabled = true;
  win.__test.setMonitorSession('shadow');
  win.__test.setLastEmission(0);
  return win.__test;
}

(async () => {
  const off = boot({shadowOn: false});
  await off.step();
  const offSnap = off.diagnosticSnapshot();
  const offFrame = off.frames().slice(-1)[0];
  const offSelected = offSnap.planning && offSnap.planning.selected ? offSnap.planning.selected.id : (offFrame.selected ? offFrame.selected.id : null);
  const offCandidates = offFrame.candidates.map(c => c.id);

  const on = boot({shadowOn: true});
  await on.step();
  const onSnap = on.diagnosticSnapshot();
  const onFrame = on.frames().slice(-1)[0];
  const onSelected = onSnap.planning && onSnap.planning.selected ? onSnap.planning.selected.id : (onFrame.selected ? onFrame.selected.id : null);
  const onCandidates = onFrame.candidates.map(c => c.id);

  // Identical game stub -> identical candidate universe and rule choice.
  // (The arrays come from two separate VM realms; compare the primitive ids
  // realm-independently via a join, not deepStrictEqual by prototype.)
  assert.equal(onCandidates.join('\u0001'), offCandidates.join('\u0001'),
    'candidate set must be identical across shadow off/on');
  assert.ok(offCandidates.length >= 1, 'planning must produce candidates');

  // 1) Non-causal: the emitted intent is unchanged by the shadow and stays the
  //    top-ranked (rule) candidate.
  assert.equal(onSelected, offSelected, 'shadow must not change the emitted intent');
  assert.equal(onSelected, onCandidates[0], 'emitted intent must remain the top-ranked (rule) candidate');

  // Shadow OFF (default): no shadow ranking recorded, no shadow evidence.
  assert.equal(offSnap.planning && offSnap.planning.modelChoice, null,
    'with the shipped null model the shadow modelChoice must stay null');
  assert.equal(offSnap.planning && offSnap.planning.modelScores, null,
    'with the shipped null model the shadow modelScores must stay null');
  assert.equal(offSnap.shadowDecisionEvidence, null,
    'with the shipped null model no shadow evidence must be recorded');

  // 2) Shadow ON: observation is complete (a full ranking over the candidates).
  const onScores = onSnap.planning && onSnap.planning.modelScores;
  const onChoice = onSnap.planning && onSnap.planning.modelChoice;
  assert.ok(Array.isArray(onScores) && onScores.length === onCandidates.length,
    'shadow must rank every candidate');
  const scoreIds = onScores.map(s => (typeof s === 'object' ? s.id : s)).sort();
  assert.equal(scoreIds.join('\u0001'), [...onCandidates].sort().join('\u0001'),
    'shadow ranking must cover the same candidate set');
  assert.equal(typeof onChoice, 'string', 'shadow modelChoice must be a candidate id');
  assert.ok(onCandidates.includes(onChoice), 'shadow modelChoice must be one of the candidates');

  // 3) Non-causal labeling: changedIntent=false and explicit "not observed" text.
  const ev = onSnap.shadowDecisionEvidence;
  assert.ok(ev, 'shadow evidence must be recorded when shadow is enabled');
  assert.equal(ev.changedIntent, false, 'shadow must report changedIntent=false');
  assert.ok(/not observed game effect/.test(ev.evidence),
    'shadow evidence must be labeled as not observed game effect');
  assert.equal(ev.wouldPrefer, onChoice, 'wouldPrefer must be the shadow\'s own pick, not the emitted intent');
  assert.equal(ev.ruleChoice, onSelected, 'ruleChoice must be the emitted (rule) intent');
  assert.notEqual(ev.ruleChoice, undefined, 'rule choice must be present');

  // 4) The shadow's own pick is recorded separately from the emitted intent.
  //    (Both are candidate ids; when the shadow disagrees it still only records.)
  assert.ok(onCandidates.includes(ev.wouldPrefer), 'wouldPrefer must be a candidate id');

  console.log('PASS shadow-v5 non-causal: shadow changes no emitted intent, ranks all candidates, and is labeled changedIntent=false / "not observed game effect"');
})().catch(e => { console.error(e); process.exit(1); });
