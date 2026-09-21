'use strict';
// v2 SEARCH reward, never a champion-promotion criterion. Use only observed
// GameView trajectory and recorded bot receipts, not hidden engine state.
// Confirmed victory > tick-limit (right-censored) > confirmed defeat > invalid.
const VERSION='strategic-held-land-v2';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,Number.isFinite(x)?x:a));
const positive=x=>Math.max(0,Number.isFinite(Number(x))?Number(x):0);
function strategicProgress(trajectory,report,land){
  const t=trajectory?.summary??{};
  const end=positive(Number.isFinite(land)?land:t.endLand);
  const peak=positive(t.peakLand);
  const held=clamp(positive(t.meanLand)/100000,0,1);
  const endArea=clamp(end/100000,0,1);
  const retention=clamp(Number.isFinite(t.retention)?t.retention:
    peak>0?end/peak:0,0,1);
  const lostFromPeak=clamp((peak-end)/100000,0,1);
  // Only recorded territory receipts qualify; attack/boat intents and
  // neutral landings are NOT evidence of captured, held enemy territory.
  const conquered=clamp(positive(report?.attackReceipts?.territoryGained)/5,0,1);
  // A confirmed build and observed gold income are conservative proxies;
  // neither proves a building is productive, so their weight stays small.
  const built=clamp(positive(report?.recording?.counts?.build_confirmed)/15,0,1);
  const income=clamp(positive(report?.income?.gold)/1000000,0,1);
  return clamp(.48*held+.24*endArea+.12*retention+
    .06*conquered+.06*built+.04*income-.20*lostFromPeak,0,1);
}
// Preserve the legacy exported helper for callers inspecting trajectory alone.
function trajectoryProgress(trajectory){
  return strategicProgress(trajectory,null,trajectory?.summary?.endLand);
}
function reward({validSample,confirmed,outcome,land,endTick,ticks,trajectory,report}){
  if(!validSample)return -1;
  const survival=clamp(positive(endTick)/Math.max(1,positive(ticks)),0,1);
  const progress=strategicProgress(trajectory,report,land);
  if(confirmed&&outcome==='victory')return 1+.16*progress+.04*survival;
  if(confirmed&&outcome==='defeat')return -.4+.20*progress+.05*survival;
  // A verified tick-limit is censored, NEVER classified as victory.
  return .08+.24*progress+.04*survival;
}
module.exports={VERSION,reward,trajectoryProgress,strategicProgress};
