'use strict';
// A tick limit is right-censored, not victory. Progress is computed only from
// sampled values visible to the bot's GameView, never engine hidden state.
// The strict held-out promotion gate ignores ALL these search rewards.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,Number.isFinite(x)?x:a));
function trajectoryProgress(trajectory){
  const t=trajectory?.summary;
  if(!t||!Number.isFinite(t.peakLand)||!Number.isFinite(t.meanLand)||
    !Number.isFinite(t.retention))return 0;
  const held=clamp(t.meanLand/100000,0,1);
  const peak=clamp(t.peakLand/100000,0,1);
  const retained=clamp(t.retention,0,1);
  // Held territory receives more credit than a momentary peak.
  return .55*held+.25*peak+.20*retained;
}
function reward({validSample,confirmed,outcome,land,endTick,ticks,trajectory}){
  if(!validSample)return -1;
  const area=clamp((Number(land)||0)/100000,0,1);
  const survival=clamp((Number(endTick)||0)/Math.max(1,Number(ticks)||1),0,1);
  const progress=trajectoryProgress(trajectory);
  if(confirmed&&outcome==='victory')return 1+.08*area+.08*progress+.04*survival;
  if(confirmed&&outcome==='defeat')return -.20+.06*area+.05*progress+.04*survival;
  // Censored: search signal only. Even a full-area tick-limit is not victory.
  return .08+.12*area+.08*progress;
}
module.exports={reward,trajectoryProgress};
