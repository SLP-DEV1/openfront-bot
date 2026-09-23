'use strict';
// P0 decision-frame linkage on the real bundled userscript:
// candidates + actual choice + confirmed effect are linked by decisionId,
// and an absent effect stays "unknown" (never zeroed or guessed).
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'OpenFront_Solo_AggroBot.user.js'), 'utf8');
const anchor = "  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, auto-start after match discovery');";
assert(source.includes(anchor), 'bot test injection anchor missing');
const VERSION_MATCH = source.match(/const VERSION\s*=\s*'([^']+)'/);
assert(VERSION_MATCH, 'bot VERSION constant missing');
let pass = 0, fail = 0;
async function check(name, test) {
  try { await test(); ++pass; console.log('PASS', name); }
  catch (error) { ++fail; console.error('FAIL', name, error.stack); }
}
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
    gameID: () => 'game-123', config: () => config, myPlayer: () => me,
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
    'step,resolveDecisionFrames,censorPendingDecisionFrames,telemetry,send,diagnosticSnapshot,',
    'setMonitorSession:x=>monitorSession=x,setLastEmission:n=>lastEmission=n,',
    'frames:()=>decisionFrames.map(f=>({...f})),',
    'injectFrame:f=>decisionFrames.push(f),',,
    'ledger:()=>actionLedger.map(e=>({...e})),',
    'opts};'
  ].join('\n');
  vm.runInNewContext(source.replace(anchor, expose + '\n' + anchor), context, {timeout: 4000});
  win.__test.setup(game, busStub, {attack: Attack, build: Build});
  return {b: win.__test, sent, setTick: v => tick = v};
}
const lastFrame = x => x.b.frames()[x.b.frames().length - 1];
const lastLedger = x => x.b.ledger()[x.b.ledger().length - 1];
(async () => {
  await check('P0: planning step captures frame with candidates, choice and rejected set', async () => {
    const x = boot();
    x.b.setMonitorSession('p0');
    x.b.setLastEmission(0);
    await x.b.step();
    const frames = x.b.frames();
    assert.ok(frames.length >= 1, 'no decision frame captured');
    const frame = frames[frames.length - 1];
    assert.equal(frame.tick, 300);
    assert.equal(frame.decisionId, 'p0:t300');
    assert.equal(frame.matchId, 'game-123');
    assert.equal(frame.clientId, 'me');
    assert.ok(Array.isArray(frame.candidates) && frame.candidates.length >= 1, 'no candidates');
    assert.equal(frame.selected.id, frame.candidates[0].id, 'selected must be top-ranked candidate');
    assert.deepEqual(frame.rejectedCandidates.map(c => c.id),
      frame.candidates.slice(1).map(c => c.id), 'rejected set must be the remaining candidates');
    assert.equal(frame.outcomeStatus, 'pending');
    assert.equal(frame.resolved, false);
    assert.equal(frame.dataAge.requestedTick, 300);
    assert.equal(typeof frame.dataAge.borderAgeTicks, 'number');
    assert.equal(typeof frame.missingMask.borderStale, 'boolean');
    assert.equal(typeof frame.missingMask.opponentTroopsUnknown, 'number');
    assert.equal(typeof frame.missingMask.modelEnabled, 'boolean');
    assert.equal(frame.provenance.bot, VERSION_MATCH[1]);
    assert.equal(typeof frame.provenance.gameMode, 'string');
    const snapshot = x.b.diagnosticSnapshot();
    assert.equal(snapshot.decisionFrames.length, frames.length);
    assert.equal(snapshot.decisionFrames[snapshot.decisionFrames.length - 1].decisionId, frame.decisionId);
  });
  await check('P0: confirmed effect links to its frame, absent effect stays unknown', async () => {
    const x = boot();
    x.b.setMonitorSession('p0c');
    x.b.setLastEmission(0);
    await x.b.step();
    const frame = lastFrame(x);
    assert.equal(frame.tick, 300);
    x.b.setLastEmission(0);
    const emitted = x.sent.length;
    assert.equal(x.b.send('attack', ['weak', 10000], 'P0 test attack'), true, 'manual attack must emit');
    assert.equal(x.sent.length, emitted + 1, 'attack event must reach the bus');
    const action = lastLedger(x);
    assert.equal(action.decisionId, frame.decisionId, 'ledger entry must carry the frame decisionId');
    assert.equal(action.intent, 'attack');
    assert.equal(action.observed, 'unknown');
    assert.equal(action.effect, 'unknown');
    // Inside the 120-tick effect horizon the frame must remain pending.
    x.setTick(350);
    x.b.resolveDecisionFrames(350);
    assert.equal(lastFrame(x).resolved, false, 'frame resolved before effect horizon');
    x.b.telemetry('attack_confirmed', 'Angriff best\u00e4tigt', {actionId: action.actionId, tick: 302});
    x.setTick(frame.tick + 120);
    x.b.resolveDecisionFrames(frame.tick + 120);
    const resolved = lastFrame(x);
    assert.equal(resolved.resolved, true);
    assert.equal(resolved.outcomeStatus, 'confirmed');
    assert.equal(resolved.resolution.censored, false);
    assert.equal(resolved.resolution.effectHorizon, 120);
    assert.equal(resolved.resolution.resolveHorizon, 600);
    assert.ok(resolved.actualIntents.some(e => e.actionId === action.actionId),
      'actual intent must be linked to the frame');
    const receipt = (resolved.actionReceipt || []).find(e => e.actionId === action.actionId);
    assert.ok(receipt, 'action receipt missing for confirmed action');
    assert.equal(receipt.observed, 'attack_confirmed');
    assert.equal(receipt.effect, 'unknown', 'absent effect must stay unknown');
  });
  await check('P0: absent effect resolves unknown and censored, never zero', async () => {
    const x = boot();
    x.b.setMonitorSession('p0u');
    x.b.setLastEmission(0);
    await x.b.step();
    const frame = lastFrame(x);
    x.b.setLastEmission(0);
    assert.equal(x.b.send('attack', ['weak', 10000], 'P0 unconfirmed attack'), true);
    const action = lastLedger(x);
    assert.equal(action.decisionId, frame.decisionId);
    x.setTick(frame.tick + 600);
    x.b.resolveDecisionFrames(frame.tick + 600);
    const resolved = lastFrame(x);
    assert.equal(resolved.resolved, true);
    assert.equal(resolved.outcomeStatus, 'unknown');
    assert.equal(resolved.resolution.censored, true);
    const receipt = (resolved.actionReceipt || []).find(e => e.actionId === action.actionId);
    assert.ok(receipt, 'receipt missing for unconfirmed action');
    assert.equal(receipt.observed, 'unknown');
    assert.equal(receipt.effect, 'unknown', 'absent effect must stay unknown');
  });
  await check('P0 #137: pending survives 20 planning frames through full 600 ticks',async()=>{
    const x=boot();
    x.b.setMonitorSession('p0-horizon');
    x.b.setLastEmission(0);
    await x.b.step();
    const original=lastFrame(x);
    for(let i=0;i<20;i++){
      const tick=305+i*10;
      x.b.injectFrame({...original,decisionId:'p0-horizon:t'+tick,
        tick,resolved:false,outcomeStatus:'pending',resolution:null});
      x.setTick(tick);
      x.b.resolveDecisionFrames(tick);
    }
    assert.ok(x.b.frames().some(f=>f.decisionId===original.decisionId),
      'old unresolved frame cannot be evicted by sixteen newer frames');
    x.setTick(original.tick+600);
    x.b.resolveDecisionFrames(original.tick+600);
    const old=x.b.frames().find(f=>f.decisionId===original.decisionId);
    assert.ok(old,'frame must still exist when horizon resolves');
    assert.equal(old.resolved,true);
    assert.equal(old.outcomeStatus,'unknown');
    assert.equal(old.resolution.censored,true);
    x.b.censorPendingDecisionFrames(901,'match-end');
    assert.ok(x.b.frames().every(f=>f.resolved));
    assert.ok(x.b.frames().length<=16,'resolved history remains bounded');
  });
  await check('P0 #137: pending storage bounded without silent eviction',async()=>{
    const x=boot();
    x.b.setMonitorSession('p0-cap');
    x.b.setLastEmission(0);
    await x.b.step();
    const original=lastFrame(x);
    for(let i=0;i<1500;i++)
      x.b.injectFrame({...original,decisionId:'capacity-'+i,
        tick:300,resolved:false,outcomeStatus:'pending',resolution:null});
    x.b.resolveDecisionFrames(301);
    assert.ok(x.b.frames().length<=1040,'pending+resolved storage is bounded');
    assert.ok(x.b.frames().some(f=>f.resolution?.reason==='pending-capacity'),
      'excess frames are explicitly censored rather than silently lost');
  });
  console.log('TOTAL', pass, 'passed,', fail, 'failed');
  if (fail) process.exitCode = 1;
})();
