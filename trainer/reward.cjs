'use strict';
// A right-censored tick-limit is not a win, but it must not look worse
// than a confirmed defeat during exploratory search.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function reward({validSample,confirmed,outcome,land,endTick,ticks}){
  if(!validSample)return -1;
  const area=clamp((Number(land)||0)/100000,0,1);
  const survival=clamp((Number(endTick)||0)/Math.max(1,Number(ticks)||1),0,1);
  if(confirmed&&outcome==='victory')return 1+0.1*area+0.05*survival;
  if(confirmed&&outcome==='defeat')return -0.15+0.1*area+0.1*survival;
  // Censored: only a search hint. Champion promotion must NEVER use it.
  return 0.1+0.15*area;
}
module.exports={reward};
