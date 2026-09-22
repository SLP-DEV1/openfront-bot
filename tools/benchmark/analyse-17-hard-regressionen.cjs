'use strict';
// Analyse der 17 Hard-Regressionspaare: V5-V4-prov vs stageC (Spielsituationen)
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/SPK/Desktop/openfront/.worktrees/neural-v5-curriculum/benchmark-results/neural-v5-curriculum/holdout/difficulty-Hard/matches';

const PAIRS = [
  ['v5hold-0', 'World', 1], ['v5hold-0', 'Europe', 1], ['v5hold-0', 'Europe', 4],
  ['v5hold-1', 'Europe', 1], ['v5hold-1', 'Europe', 4], ['v5hold-2', 'World', 1],
  ['v5hold-2', 'Europe', 4], ['v5hold-3', 'World', 1], ['v5hold-3', 'World', 4],
  ['v5hold-3', 'Europe', 4], ['v5hold-4', 'World', 1], ['v5hold-4', 'World', 4],
  ['v5hold-5', 'World', 1], ['v5hold-5', 'Europe', 4], ['v5hold-6', 'World', 4],
  ['v5hold-10', 'Europe', 4], ['v5hold-11', 'World', 1],
];

function load(model, seed, map, nation) {
  const dir = path.join(ROOT, model, `${seed}-${map}-${nation}`);
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'match.json'), 'utf8'));
  } catch (e) {
    return { _missing: true };
  }
}

function profile(m) {
  if (!m || m._missing) return { missing: true };
  const t = m.trajectory || {};
  const s = t.samples || [];
  let peakTick = 0, peak = 0, collapse50 = null, collapse25 = null;
  for (const p of s) {
    if (p.land > peak) { peak = p.land; peakTick = p.tick; }
  }
  for (const p of s) {
    if (peak > 0 && p.tick > peakTick) {
      if (collapse50 === null && p.land < peak * 0.5) collapse50 = p.tick;
      if (collapse25 === null && p.land < peak * 0.25) collapse25 = p.tick;
    }
  }
  const mil = m.military || {};
  const inc = (mil.inc || []).map(x => Math.round(x.troops)).sort((a, b) => b - a);
  const vt = m.victoryThreat || {};
  const ge = m.gameEnd || {};
  const fs_ = m.finalState || {};
  const mar = (m.marine && m.marine.stats) || {};
  const st = m.strategicTelemetry || {};
  return {
    outcome: ge.outcome, reason: ge.reason, endTick: ge.tick,
    peak, peakTick, collapse50, collapse25,
    home: mil.home, ratio: mil.ratio != null ? +mil.ratio.toFixed(2) : null,
    incTop: inc.slice(0, 2),
    threat: vt.name ? { name: vt.name, progress: +vt.progress, land: vt.land, urgent: vt.urgent } : null,
    fleet: typeof m.fleet === 'string' ? m.fleet : (m.fleet && m.fleet.status) || null,
    landFails: (m.landingFailures || []).length,
    neutralLandings: st.neutralLandings || 0,
    warshipSent: mar.warshipSent || 0, transportArrived: mar.transportArrived || 0,
    bridgeheadLost: mar.bridgeheadLost || 0,
    unitsEnd: fs_.units ? fs_.units.length : null,
  };
}

const out = [];
for (const [seed, map, nation] of PAIRS) {
  const c = profile(load('stageC', seed, map, nation));
  const v = profile(load('V5-V4-prov', seed, map, nation));
  const key = `${seed} ${map}|${nation}`;
  out.push({ key, c, v });
  const fmt = p => p.missing ? 'MISSING' :
    `${p.outcome}@${p.endTick} peak=${p.peak}@${p.peakTick} c50=${p.collapse50 ?? '-'} ` +
    `home=${p.home} ratio=${p.ratio} inc=${p.incTop.join('/')} ` +
    `threat=${p.threat ? p.threat.name + ' ' + p.threat.progress + '%/' + p.threat.land : '-'} ` +
    `fleet=${p.fleet} nf=${p.landFails} nl=${p.neutralLandings} ws=${p.warshipSent} ta=${p.transportArrived}`;
  console.log('=== ' + key);
  console.log('  stageC: ' + fmt(c));
  console.log('  V5    : ' + fmt(v));
}
console.log('\n=== Zusammenfassung V5-Kollaps-Typen');
const types = { earlyWipe: [], peakCollapse: [], midDeath: [], lateDeficit: [], earlyDeath: [] };
for (const { key, v, c } of out) {
  if (v.missing) continue;
  const early = v.endTick < 6500;
  const wiped = v.peak > 10000 && v.collapse50 != null && v.collapse50 <= (v.endTick || 999999) && (v.collapse25 != null || (v.endTick - v.collapse50) < 2500);
  if (early && v.peak > 10000) types.earlyWipe.push(key + ` (peak ${v.peak} @${v.peakTick}, wiped by ~${v.endTick})`);
  else if (v.peak > 60000 && v.collapse50 != null && c.outcome !== 'defeat') types.peakCollapse.push(key + ` (peak ${v.peak} @${v.peakTick}, c50=${v.collapse50})`);
  else if (early) types.earlyDeath.push(key + ` (peak ${v.peak}, end ${v.endTick})`);
  else if (c.outcome === 'victory' || c.outcome === 'incomplete') types.lateDeficit.push(key);
  else types.midDeath.push(key);
}
for (const [k, v] of Object.entries(types)) {
  console.log(`\n[${k}] ${v.length}`);
  v.forEach(x => console.log('  ' + x));
}
