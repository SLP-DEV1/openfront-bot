'use strict';
// Paired, disjoint holdout over verified official-engine outcomes (v2).
// Outcomes rank victory(2) > censored tick-limit/incomplete(1) > defeat(0).
// A tick limit is right-censored survival, never a victory.
function normalizeEvaluationRow(row) {
  if (!row || typeof row !== 'object') return row;
  if (Number.isFinite(row.land)) return row;
  if (Number.isFinite(row.endLand)) return {...row, land: row.endLand};
  return row;
}
function compare(incumbent, candidate) {
  const invalid = {valid: false, promoted: false, reason: 'incomplete-or-unpaired',
    incumbentWins: 0, candidateWins: 0, improved: 0, regressed: 0, tied: 0, net: 0,
    survivalTicks: 0, survivalArea: 0, N: 0, mixed: false, decisionRoundNeeded: false};
  if (!Array.isArray(incumbent) || !Array.isArray(candidate) ||
      incumbent.length < 2 || incumbent.length !== candidate.length) return invalid;
  incumbent=incumbent.map(normalizeEvaluationRow);
  candidate=candidate.map(normalizeEvaluationRow);
  const signature = x => [x.difficulty, x.map, x.nation, x.gameType ?? 'Singleplayer',
    x.gameMode ?? 'FFA', x.scriptedHumans ?? 0, x.opponentProfile ?? 'none', x.seed].join('|');
  const acceptable = x => ['victory', 'defeat', 'incomplete'].includes(x.outcome);
  const seen = new Set();
  for (let i = 0; i < incumbent.length; i++) {
    const a = incumbent[i], b = candidate[i], key = signature(a);
    if (seen.has(key) || key !== signature(b) || !a.validSample || !b.validSample ||
        !acceptable(a) || !acceptable(b) || a.exitCode !== 0 || b.exitCode !== 0 ||
        !Number.isFinite(a.endTick) || !Number.isFinite(b.endTick) ||
        !Number.isFinite(a.land) || !Number.isFinite(b.land)) return invalid;
    seen.add(key);
  }
  const N = incumbent.length;
  const rank = x => x.outcome === 'victory' ? 2 : x.outcome === 'incomplete' ? 1 : 0;
  const wins = rows => rows.filter(r => r.outcome === 'victory').length;
  const incumbentWins = wins(incumbent), candidateWins = wins(candidate);
  let improved = 0, regressed = 0, tied = 0, survivalTicks = 0, survivalArea = 0;
  for (let i = 0; i < N; i++) {
    const a = incumbent[i], b = candidate[i];
    const ra = rank(a), rb = rank(b);
    if (rb > ra) { improved++; survivalArea += Math.max(0, b.land - a.land); continue; }
    if (rb < ra) { regressed++; continue; }
    if (b.outcome === 'victory') { tied++; continue; }
    const elapsed = b.endTick - a.endTick, area = b.land - a.land;
    survivalTicks += elapsed;
    if (elapsed >= 150 || (elapsed >= 0 && area >= Math.max(500, a.land * .08))) { improved++; survivalArea += Math.max(0, area); }
    else if (elapsed <= -150 || (elapsed <= 0 && area <= -Math.max(500, b.land * .08))) regressed++;
    else tied++;
  }
  const net = improved - regressed;
  const maxCollapse = Math.max(1, Math.floor(N / 4));
  const won = candidateWins > incumbentWins && regressed <= maxCollapse && net >= 0;
  const survived = candidateWins === incumbentWins && improved >= 2 && regressed === 0 &&
    (survivalTicks >= 600 || survivalArea >= 10000);
  const mixed = Math.abs(candidateWins - incumbentWins) <= 1 && (improved + regressed) >= 4;
  return {
    valid: true, promoted: won || survived,
    reason: won ? 'more-observed-victories-with-collapse-guard'
      : survived ? 'consistent-survival-improvement'
      : candidateWins > incumbentWins ? 'wins-up-but-collapse-too-large'
      : 'no-verified-improvement',
    incumbentWins, candidateWins, improved, regressed, tied, net, N,
    survivalTicks, survivalArea, maxCollapse, mixed,
    decisionRoundNeeded: mixed && !(won || survived)
  };
}
module.exports = {compare,normalizeEvaluationRow};
