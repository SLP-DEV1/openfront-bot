'use strict';
// Box 238 (engine-free half): the SAME current bot behaviour without Neural
// (and, separately, with the identical old Run3 policy) must be reproducible.
// Here we prove the rule-basis (no neural) planning is deterministic: booting
// the real bundled userscript twice in fresh VM contexts, with identical
// deterministic game stubs and a fixed monitor session, yields a byte-identical
// planning decision (candidate set + order, selected choice, rejected set,
// decision/match identity, missing mask, provenance) and neural stays OFF by
// default. The "identical old Run3 policy" (schema-4 champion) half is proven
// engine-side in impossible-engine.yml (same seed twice -> identical match).
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'OpenFront_Solo_AggroBot.user.js'), 'utf8');
const anchor = "  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, auto-start after match discovery');";
assert(source.includes(anchor), 'bot test injection anchor missing');

function boot() {
  let tick = 300, land = 1200, gold = 1000000, home = 90000, gameOver = false;
  const out = [], incoming = [], sent = [], timers = [];
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
    gameID: () => 'game-repro', config: () => config, myPlayer: () => me,
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
    setTimeout: fn => { timers.push(fn); return 1; },
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
  vm.runInNewContext(source.replace(anchor, expose + '\n' + anchor), context, {timeout: 4000});
  win.__test.setup(game, busStub, {attack: Attack, build: Build});
  return {b: win.__test, sent, setTick: v => tick = v};
}

// Planning-relevant fingerprint of the last decision frame.
function fingerprint(frame) {
  const raw = {
    tick: frame.tick,
    decisionId: frame.decisionId,
    matchId: frame.matchId,
    clientId: frame.clientId,
    candidates: (frame.candidates || []).map(c => c.id),
    selected: frame.selected ? frame.selected.id : null,
    rejected: (frame.rejectedCandidates || []).map(c => c.id),
    missingMask: frame.missingMask,
    modelEnabled: frame.missingMask ? frame.missingMask.modelEnabled : null,
    modelChoice: frame.modelChoice ?? null,
    modelScores: frame.modelScores ?? null,
    provenance: frame.provenance
  };
  // Coerce cross-realm (VM) structures to plain test-context values so
  // deepStrictEqual compares by value, not by the VM realm prototype.
  return JSON.parse(JSON.stringify(raw));
}

(async () => {
  // Two independent boots with identical deterministic stubs.
  const a = boot();
  a.b.setMonitorSession('repro');
  a.b.setLastEmission(0);
  await a.b.step();
  const fa = a.b.frames().slice(-1)[0];

  const b = boot();
  b.b.setMonitorSession('repro');
  b.b.setLastEmission(0);
  await b.b.step();
  const fb = b.b.frames().slice(-1)[0];

  // Identical game identity.
  assert.ok(fa && fb, 'both boots must capture a decision frame');
  assert.equal(fa.matchId, fb.matchId, 'matchId must be identical across boots');
  assert.equal(fa.decisionId, fb.decisionId, 'decisionId must be identical across boots');

  // Identical planning: same candidate set + order, same choice, same rejects.
  const pa = fingerprint(fa), pb = fingerprint(fb);
  assert.deepEqual(pa.candidates, pb.candidates,
    'candidate set and order must be reproducible');
  assert.equal(pa.selected, pb.selected, 'selected choice must be reproducible');
  assert.deepEqual(pa.rejected, pb.rejected, 'rejected set must be reproducible');
  assert.deepEqual(pa.missingMask, pb.missingMask, 'missing mask must be reproducible');
  assert.deepEqual(pa.provenance, pb.provenance, 'provenance must be reproducible');

  // The full planning fingerprint must match exactly.
  assert.deepEqual(pa, pb,
    'full planning decision must be byte-identical across two identical boots');

  // "Ohne Neural": the shipped default has no neural model active.
  assert.equal(pa.modelEnabled, false,
    'default (rule basis) must have neural disabled (modelEnabled=false)');
  assert.equal(pa.modelChoice, null,
    'with no neural model the modelChoice must stay null');
  assert.equal(pa.modelScores, null,
    'with no neural model the modelScores must stay null');

  // Sanity: the planning actually produced candidates (not an empty no-op).
  assert.ok(pa.candidates.length >= 1, 'planning must produce at least one candidate');
  assert.ok(pa.selected !== null, 'planning must select a candidate');

  console.log('PASS reproducible baseline: two identical boots produce a byte-identical rule-basis planning decision (neural off by default); Run3-policy reproducibility proven engine-side in impossible-engine.yml');
})();
