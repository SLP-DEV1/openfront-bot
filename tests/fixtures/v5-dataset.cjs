'use strict';
// Deterministic synthetic dataset for P3 regression tests. No RNG: every
// match/frame is a pure function of its index, so features+labels are stable
// across runs (required for a reproducible training test).
function makeMatch(m){
  const frames = [];
  const n = 12; // frames per match
  const base = 4 + m;
  const trend = (m % 3 === 0) ? 1 : -0.5; // some matches gain land, some lose
  for (let f = 0; f < n; f++){
    const land = Math.max(0, base + trend * f + (f % 2));
    frames.push({
      tick: f * 10,
      // Full featuredSchemaVersion-2 contract (17 state + 14 candidate
      // fields), deterministic in (m, f).
      visibleState: {
        home: 60 + m, maxTroops: 120, committed: 4 + (f % 3), incoming: 2 + (f % 2),
        reserve: 8, gold: 30000 + m * 1000 + f * 500, land: Math.round(land),
        capacityUse: 0.4, frontCount: 1 + (f % 2),
        economyRelative: 0.5 + 0.1 * (f % 3), frontReach: 0.2,
        partnerNeed: m % 2, enemyBound: 0.3,
        landTrend: trend >= 0 ? 0.2 : -0.2, goldTrend: 0.1,
        troopTrend: -0.1, portAccess: m % 2, technologyCoverage: 0.5,
        costTroops: 3, costGold: 100 + f * 10, expectedLand: f % 3,
        duration: 0, returnTime: 0, counterRisk: 0.2, thirdPartyRisk: 0.1,
        infrastructureValue: 0, incomeValue: 0.2, recruitmentValue: 0,
        siteRisk: 0.1, holdProbability: 0.8, legalConfidence: 1
      },
      action: {type: f % 4 === 0 ? 'attack' : (f % 4 === 2 ? 'investment' : 'naval')}
    });
  }
  return {matchId: 'M' + m, outcome: trend < 0 ? 'defeat' : 'victory', frames};
}
function makeDataset(matches = 16){
  return {horizonTicks: 60, landScale: 8,
    matches: Array.from({length: matches}, (_, m) => makeMatch(m))};
}
module.exports = { makeDataset, makeMatch };
