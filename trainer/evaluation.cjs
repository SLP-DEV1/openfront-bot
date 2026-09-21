'use strict';
// Paired, disjoint holdout over verified official-engine outcomes.
// Outcomes rank victory > censored tick-limit > defeat; a tick limit is
// right-censored survival, never a victory. A no-win generation may
// progress via repeatable survival or territory gains, never via error,
// fabricated victory or a single lucky outlier.
function compare(incumbent,candidate){
  const invalid={valid:false,promoted:false,reason:'incomplete-or-unpaired',
    incumbentWins:0,candidateWins:0,improved:0,regressed:0,survivalTicks:0,
    survivalArea:0};
  if(!Array.isArray(incumbent)||!Array.isArray(candidate)||
    incumbent.length<2||incumbent.length!==candidate.length)return invalid;
  const signature=x=>[x.difficulty,x.map,x.nation,x.gameType??'Singleplayer',
    x.gameMode??'FFA',x.scriptedHumans??0,x.opponentProfile??'none',x.seed].join('|');
  const acceptable=x=>['victory','defeat','incomplete'].includes(x.outcome);
  const seen=new Set();
  for(let i=0;i<incumbent.length;i++){
    const a=incumbent[i],b=candidate[i],key=signature(a);
    if(seen.has(key)||key!==signature(b)||!a.validSample||!b.validSample||
      !acceptable(a)||!acceptable(b)||
      a.exitCode!==0||b.exitCode!==0||
      !Number.isFinite(a.endTick)||!Number.isFinite(b.endTick)||
      !Number.isFinite(a.land)||!Number.isFinite(b.land))
      return invalid;
    seen.add(key);
  }
  const rank=x=>x.outcome==='victory'?2:x.outcome==='incomplete'?1:0;
  const wins=rows=>rows.filter(r=>r.outcome==='victory').length;
  const incumbentWins=wins(incumbent),candidateWins=wins(candidate);
  let improved=0,regressed=0,survivalTicks=0,survivalArea=0;
  for(let i=0;i<incumbent.length;i++){
    const a=incumbent[i],b=candidate[i];
    if(rank(b)>rank(a)){
      improved++;
      survivalArea+=Math.max(0,b.land-a.land);
      continue;
    }
    if(rank(b)<rank(a)){regressed++;continue;}
    if(b.outcome==='victory')continue;
    const elapsed=b.endTick-a.endTick;
    const area=b.land-a.land;
    survivalTicks+=elapsed;
    if(elapsed>=150 || (elapsed>=0 && area>=Math.max(500,a.land*.08))){
      improved++;
      survivalArea+=Math.max(0,area);
    }else if(elapsed<=-150 || (elapsed<=0 && area<=-Math.max(500,b.land*.08)))
      regressed++;
  }
  // A new victory does not compensate for verified regressions on other
  // matched seeds. Keep the declared no-regression contract for BOTH gates.
  const won=candidateWins>incumbentWins&&regressed===0;
  const survived=candidateWins===incumbentWins&&improved>=2&&
    regressed===0&&(survivalTicks>=600||survivalArea>=10000);
  return {valid:true,promoted:won||survived,
    reason:won?'more-observed-victories':survived?'consistent-survival-improvement':
      regressed>0?'regressions-block-promotion':'no-verified-improvement',incumbentWins,candidateWins,
    improved,regressed,survivalTicks,survivalArea};
}
module.exports={compare};
