'use strict';
// P3: Schema-5 target and label construction.
//
// Two targets are operationalized on a fixed horizon (not the final game
// total), so labels are bounded and comparable:
//   heldGain : net territorial effect over [t, t+horizon] relative to the
//              start of the window, clamped to [0,1].
//   lossRisk : probability of a predefined observed loss (net territorial
//              drop or defeat/elimination/abort) within the window, [0,1].
//
// Label hygiene:
//   * Labels are produced ONLY for frames whose horizon was observably
//     reached (a frame at least `horizonTicks` later exists). If the horizon
//     is not reached, heldGain/lossRisk are null (UNKNOWN), never 0.
//   * behaviorChoice is a SEPARATE imitation label (the executed action
//     kind). selectionBias marks that it is a human-executed choice, not an
//     unbiased/RL sample. It does not change the outcome targets.
const clamp01 = v => Math.min(1, Math.max(0, v));

// frames: normalized visible-state records for ONE match, sorted by tick.
//   each: {tick, visibleState:{land}, outcome?, action:{type}?}
// config: {horizonTicks, landScale, matchOutcome?}
function buildLabels(frames, config = {}){
  const horizonTicks = Number(config.horizonTicks);
  const landScale = Number(config.landScale);
  if (!Number.isFinite(horizonTicks) || horizonTicks <= 0) throw Error('horizonTicks must be > 0');
  if (!Number.isFinite(landScale) || landScale <= 0) throw Error('landScale must be > 0');
  if (!Array.isArray(frames)) throw Error('frames must be an array');
  const matchOutcome = config.matchOutcome ?? frames[frames.length - 1]?.outcome ?? null;

  const land = frames.map(f => Math.max(0, Number(f?.visibleState?.land) || 0));
  const out = [];
  for (let i = 0; i < frames.length; i++){
    const startTick = Number(frames[i]?.tick);
    // Find the horizon frame: first frame at tick >= startTick + horizonTicks.
    let j = i + 1;
    while (j < frames.length && Number(frames[j].tick) < startTick + horizonTicks) j++;
    const horizonReached = j < frames.length;

    let heldGain = null, lossRisk = null;
    if (horizonReached){
      const startLand = land[i];
      heldGain = clamp01((land[j] - startLand) / landScale);
      // Observed loss within the window: worst net territorial drop from
      // start; upgraded to 1 if the match was defeated/eliminated and the
      // window reaches the end of the data (the loss was realized).
      let maxDrop = 0;
      for (let k = i; k <= j; k++) maxDrop = Math.max(maxDrop, startLand - land[k]);
      lossRisk = clamp01(maxDrop / landScale);
      const lostMatch = ['defeat','eliminated','abort'].includes(matchOutcome);
      if (lostMatch && j >= frames.length - 1) lossRisk = 1;
    }
    const behaviorChoice = frames[i]?.action?.type ?? null;
    out.push({
      tick: Number.isFinite(startTick) ? startTick : null,
      horizonTicks,
      heldGain, lossRisk,
      behaviorChoice,
      selectionBias: behaviorChoice != null,
      usable: heldGain != null && lossRisk != null
    });
  }
  return out;
}

module.exports = { clamp01, buildLabels };
