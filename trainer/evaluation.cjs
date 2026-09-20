'use strict';
// Strict, paired holdout gate. Tick-limited, synthetic and broken runs cannot
// turn into victories, regardless of Qwen text or auxiliary training reward.
function compare(incumbent,candidate){
  if(!Array.isArray(incumbent)||!Array.isArray(candidate)||
    !incumbent.length||incumbent.length!==candidate.length)
    return {valid:false,promoted:false,incumbentWins:0,candidateWins:0};
  const signature=x=>[x.map,x.nation,x.seed].join('|');
  const seen=new Set();
  for(let i=0;i<incumbent.length;i++){
    const a=incumbent[i],b=candidate[i],key=signature(a);
    if(seen.has(key)||key!==signature(b)||!a.confirmed||!b.confirmed||
      !['victory','defeat'].includes(a.outcome)||
      !['victory','defeat'].includes(b.outcome))
      return {valid:false,promoted:false,incumbentWins:0,candidateWins:0};
    seen.add(key);
  }
  const wins=rows=>rows.filter(r=>r.outcome==='victory').length;
  const incumbentWins=wins(incumbent),candidateWins=wins(candidate);
  return {valid:true,promoted:candidateWins>incumbentWins,
    incumbentWins,candidateWins};
}
module.exports={compare};
