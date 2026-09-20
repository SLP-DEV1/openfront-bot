'use strict';
// Paired, disjoint holdout: only completed official-engine outcomes count.
// A no-win generation may progress via repeatable survival gains, never via
// tick-limit, error, fabricated victory or a single lucky outlier.
function compare(incumbent,candidate){
  const invalid={valid:false,promoted:false,reason:'incomplete-or-unpaired',
    incumbentWins:0,candidateWins:0,improved:0,regressed:0,survivalTicks:0};
  if(!Array.isArray(incumbent)||!Array.isArray(candidate)||
    incumbent.length<2||incumbent.length!==candidate.length)return invalid;
  const signature=x=>[x.map,x.nation,x.seed].join('|');
  const seen=new Set();
  for(let i=0;i<incumbent.length;i++){
    const a=incumbent[i],b=candidate[i],key=signature(a);
    if(seen.has(key)||key!==signature(b)||!a.confirmed||!b.confirmed||
      !a.validSample||!b.validSample||
      a.exitCode!==0||b.exitCode!==0||
      !['victory','defeat'].includes(a.outcome)||
      !['victory','defeat'].includes(b.outcome)||
      !Number.isFinite(a.endTick)||!Number.isFinite(b.endTick)||
      !Number.isFinite(a.land)||!Number.isFinite(b.land))
      return invalid;
    seen.add(key);
  }
  const wins=rows=>rows.filter(r=>r.outcome==='victory').length;
  const incumbentWins=wins(incumbent),candidateWins=wins(candidate);
  let improved=0,regressed=0,survivalTicks=0;
  for(let i=0;i<incumbent.length;i++){
    const a=incumbent[i],b=candidate[i];
    if(a.outcome!==b.outcome){
      if(b.outcome==='victory')improved++;else regressed++;
      continue;
    }
    if(b.outcome==='victory')continue;
    const elapsed=b.endTick-a.endTick;
    const area=b.land-a.land;
    survivalTicks+=elapsed;
    if(elapsed>=150 || (elapsed>=0 && area>=Math.max(500,a.land*.08)))
      improved++;
    else if(elapsed<=-150 || (elapsed<=0 && area<=-Math.max(500,b.land*.08)))
      regressed++;
  }
  const won=candidateWins>incumbentWins;
  const survived=candidateWins===incumbentWins&&improved>=2&&
    regressed===0&&survivalTicks>=600;
  return {valid:true,promoted:won||survived,
    reason:won?'more-observed-victories':survived?'consistent-survival-improvement':
      'no-verified-improvement',incumbentWins,candidateWins,
    improved,regressed,survivalTicks};
}
module.exports={compare};
