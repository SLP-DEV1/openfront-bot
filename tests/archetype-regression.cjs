'use strict';
// P1: versionierte, überprüfbare Gegner-Archetypen auf dem realen Bundle.
// Beweis (kein Names-only): die GEFRORENE Strategiepolitik (archetypePolicy)
// ändert die Kandidaten-Rangfolge des Planers – und damit die tatsächlich
// gesendete Aktion – in Timing, Zielauswahl und Subsystemen. Die
// Verhaltenssignatur (archetypeSignature) belegt die beobachtete Plannerwahl.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'OpenFront_Solo_AggroBot.user.js'), 'utf8');
const anchor = "  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, auto-start after match discovery');";
assert(source.includes(anchor), 'bot test injection anchor missing');
let pass = 0, fail = 0;
async function check(name, test) {
  try { await test(); ++pass; console.log('PASS', name); }
  catch (error) { ++fail; console.error('FAIL', name, error.stack); }
}
// Startet das real gebundene Bundle mit einem festen Archetypen. Der Planer
// erzeugt hier exakt: attack:weak (Flächenfeind), hold und invest.
function boot(archetype, startTick) {
  let tick = startTick == null ? 300 : startTick;
  const sent = [], timers = [];
  const me = {
    id: () => 'me', clientID: () => 'client-me', smallID: () => 1,
    troops: () => 90000, numTilesOwned: () => 1200, gold: () => 1000000n,
    isAlive: () => true, hasSpawned: () => true, isPlayer: () => true,
    units: () => [], outgoingAttacks: () => [], incomingAttacks: () => [],
    isFriendly: () => false, state: {spawnTile: 505}, displayName: () => 'Me',
    borderTiles: async () => ({borderTiles: [1000]}),
    actions: async () => ({canAttack: true, buildableUnits: []})
  };
  const enemy = (id, troops, num, tiles) => ({
    id: () => id, smallID: () => num, troops: () => troops, numTilesOwned: () => tiles,
    isAlive: () => true, isPlayer: () => true, isFriendly: () => false,
    units: () => [], displayName: () => id, state: {spawnTile: 5}
  });
  const weak = enemy('weak', 20000, 2, 900), strong = enemy('strong', 85000, 3, 1200);
  const config = {
    gameConfig: () => ({gameType: 'Singleplayer', difficulty: 'Impossible'}),
    isReplay: () => false, maxTroops: () => 100000,
    infiniteTroops: () => false, infiniteGold: () => false,
    isUnitDisabled: () => false, samRange: () => 70
  };
  const game = {
    gameID: () => 'game-123', config: () => config, myPlayer: () => me,
    ticks: () => tick, gameOver: () => false,
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
  class Attack { constructor(t, r) { this.targetID = t; this.troops = r; } }
  class Build { constructor(u, t) { this.unit = u; this.tile = t; } }
  const win = {addEventListener: () => {}};
  const busStub = {emit: e => sent.push(e), listeners: {keys: () => [Attack, Build]}};
  const context = {
    window: win, document: {readyState: 'loading', body: null, addEventListener: () => {},
      querySelector: () => ({game, eventBus: busStub})},
    localStorage: {getItem: () => null, setItem: () => {}},
    Date: fixedDate, console: {info: () => {}, warn: () => {}, error: () => {}},
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
    'step,frames:()=>decisionFrames.map(f=>({...f})),',
    'sig:()=>archetypeSignature(),policy:()=>archetypePolicy(),',
    'applyArchetypeOptions,diagnosticSnapshot,',
    'setMonitorSession:x=>monitorSession=x,setLastEmission:n=>lastEmission=n,',
    'opts};'
  ].join('\n');
  vm.runInNewContext(source.replace(anchor, expose + '\n' + anchor), context, {timeout: 4000});
  win.__test.setup(game, busStub, {attack: Attack, build: Build});
  const b = win.__test;
  b.setMonitorSession('arch');
  b.setLastEmission(0);
  b.opts.archetype = archetype;
  b.applyArchetypeOptions();
  return {b, sent, setTick: v => tick = v};
}
const selKind = x => {
  const frames = x.b.frames();
  const f = frames[frames.length - 1];
  return f && f.selected ? f.selected.kind : null;
};
// Der Planer plant pro Tick; erst nach step() existiert ein Frame/Frame-Wahl.
const selAfterStep = async x => { await x.b.step(); return selKind(x); };
// Gefrorene Politik pro Archetyp (archetype-v1). 'legacy'/duo/champion =
// exakter Basiswert ohne Zusatzpolitik.
const FROZEN = {
  legacy: {kind: 'baseline', firstAttackGate: 0, attackUtility: 0, holdUtility: 0, investUtility: 0, navalUtility: 0, targetWeakest: false, boats: null, diplomacy: null, offerAlliances: null, nukes: null},
  rush: {kind: 'offensive-early', firstAttackGate: 1, attackUtility: 24, holdUtility: 0, investUtility: -20, navalUtility: 0, targetWeakest: false, boats: false, diplomacy: null, offerAlliances: false, nukes: null},
  turtle: {kind: 'defensive-late', firstAttackGate: 640, attackUtility: -28, holdUtility: 16, investUtility: 8, navalUtility: 0, targetWeakest: false, boats: false, diplomacy: null, offerAlliances: null, nukes: null},
  economy: {kind: 'economic-growth', firstAttackGate: 420, attackUtility: -22, holdUtility: 8, investUtility: 28, navalUtility: 0, targetWeakest: false, boats: null, diplomacy: null, offerAlliances: null, nukes: false},
  naval: {kind: 'naval-operations', firstAttackGate: 180, attackUtility: -6, holdUtility: 0, investUtility: 8, navalUtility: 36, targetWeakest: false, boats: true, diplomacy: null, offerAlliances: null, nukes: null},
  opportunist: {kind: 'weakest-target', firstAttackGate: 120, attackUtility: 10, holdUtility: 0, investUtility: 0, navalUtility: 0, targetWeakest: true, boats: null, diplomacy: null, offerAlliances: null, nukes: null},
  diplomat: {kind: 'alliance-builder', firstAttackGate: 300, attackUtility: -12, holdUtility: 8, investUtility: 0, navalUtility: 0, targetWeakest: false, boats: null, diplomacy: true, offerAlliances: true, nukes: null},
  nuke: {kind: 'nuclear-strike', firstAttackGate: 240, attackUtility: 4, holdUtility: 0, investUtility: 0, navalUtility: 0, targetWeakest: false, boats: null, diplomacy: null, offerAlliances: null, nukes: true},
  duo: {kind: 'coordinated-team', firstAttackGate: 0, attackUtility: 0, holdUtility: 0, investUtility: 0, navalUtility: 0, targetWeakest: false, boats: null, diplomacy: null, offerAlliances: null, nukes: null},
  champion: {kind: 'frozen-champion', firstAttackGate: 0, attackUtility: 0, holdUtility: 0, investUtility: 0, navalUtility: 0, targetWeakest: false, boats: null, diplomacy: null, offerAlliances: null, nukes: null}
};
(async () => {
  await check('P1: gefrorene Archetyp-Politik ist vollständig und exakt', async () => {
    for (const arch of Object.keys(FROZEN)) {
      const x = boot(arch);
      const p = x.b.policy();
      assert.equal(p.version, 'archetype-v1', arch + ' version');
      assert.equal(p.id, arch, arch + ' id');
      for (const [key, value] of Object.entries(FROZEN[arch]))
        assert.equal(p[key], value, arch + '.' + key);
    }
  });
  await check('P1: unbekannter Archetyp fällt auf den exakten Basiswert (legacy) zurück', async () => {
    const x = boot('definitely-not-an-archetype');
    const p = x.b.policy();
    assert.equal(p.id, 'legacy');
    assert.equal(p.attackUtility, 0);
    assert.equal(p.firstAttackGate, 0);
    assert.equal(p.targetWeakest, false);
  });
  await check('P1: Archetyp ändert die tatsächliche Wahl (Timing-Gate)', async () => {
    // legacy & rush greifen auf Tick 300 an (Gate 0 bzw. 1).
    assert.equal(await selAfterStep(boot('legacy')), 'attack');
    assert.equal(await selAfterStep(boot('rush')), 'attack');
    // turtle hält auf Tick 300 (Gate 640) und greift noch nicht an.
    const t = boot('turtle');
    await t.b.step();
    assert.equal(selKind(t), 'hold');
    assert.equal(t.b.sig().firstAttackTick, null, 'turtle: noch kein Angriff vor dem Gate');
    // Nach dem Gate (Tick 700 > 640) greift turtle an.
    const t2 = boot('turtle', 700);
    await t2.b.step();
    assert.equal(selKind(t2), 'attack');
    assert.equal(t2.b.sig().firstAttackTick, 700);
  });
  await check('P1: Archetyp erzwingt die geforderten Subsysteme (boats/diplomacy/nukes)', async () => {
    // Baseline: defaults boats/diplomacy/offerAlliances/nukes = true.
    const legacy = boot('legacy');
    legacy.b.opts.boats = false; legacy.b.opts.diplomacy = false;
    legacy.b.opts.offerAlliances = false; legacy.b.opts.nukes = false;
    legacy.b.applyArchetypeOptions();
    assert.deepEqual(
      {boats: legacy.b.opts.boats, diplomacy: legacy.b.opts.diplomacy,
       offerAlliances: legacy.b.opts.offerAlliances, nukes: legacy.b.opts.nukes},
      {boats: false, diplomacy: false, offerAlliances: false, nukes: false},
      'legacy erzwingt nichts und bleibt Basiswert');
    const rush = boot('rush');
    rush.b.applyArchetypeOptions();
    assert.equal(rush.b.opts.boats, false, 'rush schaltet Marine ab');
    assert.equal(rush.b.opts.offerAlliances, false, 'rush schaltet Allianzangebote ab');
    const economy = boot('economy');
    economy.b.opts.nukes = true; economy.b.applyArchetypeOptions();
    assert.equal(economy.b.opts.nukes, false, 'economy schaltet Nukes ab');
    const naval = boot('naval');
    naval.b.opts.boats = false; naval.b.applyArchetypeOptions();
    assert.equal(naval.b.opts.boats, true, 'naval erzwingt Marine');
    const diplomat = boot('diplomat');
    diplomat.b.opts.diplomacy = false; diplomat.b.opts.offerAlliances = false;
    diplomat.b.applyArchetypeOptions();
    assert.equal(diplomat.b.opts.diplomacy, true, 'diplomat erzwingt Diplomatie');
    assert.equal(diplomat.b.opts.offerAlliances, true, 'diplomat erzwingt Allianzangebote');
  });
  await check('P1 #140: Same-runtime archetype transitions restore base preferences',async()=>{
    const x=boot('legacy'),b=x.b;
    const go=id=>{b.opts.archetype=id;b.applyArchetypeOptions();};
    b.opts.boats=true;b.opts.diplomacy=true;
    b.opts.offerAlliances=true;b.opts.nukes=true;
    go('rush');
    assert.equal(b.opts.boats,false);
    assert.equal(b.opts.offerAlliances,false);
    go('legacy');
    assert.equal(b.opts.boats,true,'rush -> legacy restores marine');
    assert.equal(b.opts.offerAlliances,true,'rush -> legacy restores offers');
    go('rush');go('turtle');
    assert.equal(b.opts.boats,false,'turtle keeps its own marine override');
    assert.equal(b.opts.offerAlliances,true,'rush -> turtle drops only rush offer override');
    go('economy');
    assert.equal(b.opts.nukes,false);
    go('naval');
    assert.equal(b.opts.nukes,true,'economy -> naval restores base nukes');
    assert.equal(b.opts.boats,true,'naval overrides boats');
    go('diplomat');go('legacy');
    assert.equal(b.opts.diplomacy,true);
    assert.equal(b.opts.offerAlliances,true);
    go('legacy');go('legacy');
    assert.equal(b.opts.boats,true,'repeated transitions idempotent');
  });
  await check('P1: Verhaltenssignatur belegt pro Tick die gesendete Plannerwahl', async () => {
    const x = boot('legacy', 300);
    await x.b.step();
    assert.equal(x.b.sig().plannedTicks, 1);
    assert.equal(x.b.sig().archetype, 'legacy');
    assert.equal(x.b.sig().version, 'archetype-v1');
    // Ein Planungstick -> exakt eine gewählte Aktion (Summe der Kategorien).
    const s = x.b.sig().selectedByKind;
    const total = s.attack + s.hold + s.invest + s.naval + s.expand + s.support;
    assert.equal(total, x.b.sig().plannedTicks, 'eine Auswahl pro Planungstick');
    assert.equal(x.b.sig().firstAttackTick, 300, 'legacy greift auf Tick 300 an');
    assert.equal(x.b.sig().weakestTargetFraction, 1, 'legacy trifft den schwächsten Feind');
    // Nacher Tick: Signatur und Frame wachsen (ein Frame pro Planungstick).
    x.setTick(400);
    await x.b.step();
    assert.equal(x.b.sig().plannedTicks, 2);
    assert.equal(x.b.frames().length, 2, 'ein Frame pro Planungstick');
    const s2 = x.b.sig().selectedByKind;
    assert.equal(s2.attack + s2.hold + s2.invest + s2.naval + s2.expand + s2.support,
      x.b.sig().plannedTicks);
  });
  await check('P1: Diagnose exponiert Archetyp-Politik und Signatur', async () => {
    const x = boot('turtle');
    await x.b.step();
    const snap = x.b.diagnosticSnapshot();
    assert.equal(snap.archetype.id, 'turtle');
    assert.equal(snap.archetype.version, 'archetype-v1');
    assert.equal(snap.archetype.firstAttackGate, 640);
    assert.ok(snap.archetypeSignature, 'Signatur in der Diagnose');
    assert.equal(snap.archetypeSignature.archetype, 'turtle');
    assert.equal(snap.archetypeSignature.version, 'archetype-v1');
  });
  console.log('TOTAL', pass, 'passed,', fail, 'failed');
  if (fail) process.exitCode = 1;
})();
