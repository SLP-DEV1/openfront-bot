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
//   * Outcome attribution: observed consequences belong ONLY to the action
//     that was actually chosen and executed. Rows flagged `observed:false`
//     are unchosen candidates: their outcomes are unknown (null, never 0)
//     unless a counterfactual is demonstrated separately, so they must not
//     inherit the executed action's success labels. Rows without the
//     `observed` field are legacy exports and are treated as observed.
//   * behaviorChoice is a SEPARATE imitation label (the executed action
//     kind). selectionBias marks that it is a human-executed choice, not an
//     unbiased/RL sample. It does not change the outcome targets.
const clamp01 = v => Math.min(1, Math.max(0, v));

// frames: normalized visible-state records for ONE match, sorted by tick.
//   each: {tick, visibleState:{land}, outcome?, action:{type}?, observed?}
// config: {horizonTicks, landScale, matchOutcome?}
function buildLabels(frames, config = {}){
  const horizonTicks = Number(config.horizonTicks);
  const landScale = Number(config.landScale);
  if (!Number.isFinite(horizonTicks) || horizonTicks <= 0) throw Error('horizonTicks must be > 0');
  if (!Number.isFinite(landScale) || landScale <= 0) throw Error('landScale must be > 0');
  if (!Array.isArray(frames)) throw Error('frames must be an array');
  const matchOutcome = config.matchOutcome ?? frames[frames.length - 1]?.outcome ?? null;
  const lostMatch = ['defeat','eliminated','abort'].includes(matchOutcome);

  const land = frames.map(f => Math.max(0, Number(f?.visibleState?.land) || 0));
  const out = [];
  for (let i = 0; i < frames.length; i++){
    const frame = frames[i];
    // Unchosen candidate: no observed outcome was attributed to this action;
    // its targets stay unknown (null), never imputed from the executed one.
    if (frame && frame.observed === false){
      const behaviorChoice = frame?.action?.type ?? null;
      out.push({
        tick: Number.isFinite(Number(frame?.tick)) ? Number(frame.tick) : null,
        horizonTicks,
        heldGain: null, lossRisk: null,
        behaviorChoice,
        selectionBias: false,
        observed: false, counterfactual: true,
        outcomeBasis: 'unchosen-candidate-unknown',
        usable: false
      });
      continue;
    }
    const startTick = Number(frame?.tick);
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
      if (lostMatch && j >= frames.length - 1) lossRisk = 1;
    }
    const behaviorChoice = frame?.action?.type ?? null;
    out.push({
      tick: Number.isFinite(startTick) ? startTick : null,
      horizonTicks,
      heldGain, lossRisk,
      behaviorChoice,
      selectionBias: behaviorChoice != null,
      observed: true, counterfactual: false,
      usable: heldGain != null && lossRisk != null
    });
  }
  return out;
}

module.exports = { clamp01, buildLabels };
