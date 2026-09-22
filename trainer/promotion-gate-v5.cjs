'use strict';
// P6 advisory gate for independent, match-level paired holdouts.
// No benchmark is executed and no model is deployed by this module.
const fs=require('node:fs');
const ARMS=['candidate','rule-basis','run3-schema4'];
const HEX40=/^[a-f0-9]{40}$/i,HEX64=/^[a-f0-9]{64}$/i;
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const fail=reason=>({valid:false,eligible:false,reason});
const uniqueStrings=(xs)=>Array.isArray(xs)&&xs.length>0&&
  xs.every(x=>typeof x==='string'&&x.length>0&&x.length<=128)&&
  new Set(xs).size===xs.length;
const key=(mode,map,opponent,seed)=>JSON.stringify([mode,map,opponent,seed]);
function evaluate({protocol,rows}={}){
  if(!protocol||!Array.isArray(rows))return fail('missing-protocol-or-rows');
  const {engineCommit,modes,maps,opponents,seeds,arms,minPairsPerCell}=protocol;
  if(!HEX40.test(engineCommit||'')||!uniqueStrings(modes)||
     !modes.every(m=>['1v1','official-2v2','ffa-duo'].includes(m))||
     !uniqueStrings(maps)||maps.length<2||
     !uniqueStrings(opponents)||opponents.length<2||!uniqueStrings(seeds)||
     !Number.isSafeInteger(minPairsPerCell)||minPairsPerCell<2||
     seeds.length<minPairsPerCell||!arms||
     Object.keys(arms).sort().join('|')!==[...ARMS].sort().join('|')||
     ARMS.some(a=>!HEX64.test(arms[a]?.botSHA256||'')||
       !HEX64.test(arms[a]?.policySHA256||'')))
    return fail('invalid-preregistered-protocol');
  const planned=new Map();
  for(const mode of modes)for(const map of maps)for(const opponent of opponents)
    for(const seed of seeds){
      const k=key(mode,map,opponent,seed);
      planned.set(k,new Map());
    }
  if(rows.length!==planned.size*ARMS.length)return fail('missing-or-extra-match');
  const matchIds=new Set();
  for(const r of rows){
    if(!r||!ARMS.includes(r.arm)||!own(arms,r.arm))
      return fail('unexpected-arm');
    const k=key(r.mode,r.map,r.opponent,r.seed);
    const group=planned.get(k);
    if(!group)return fail('unplanned-scenario');
    if(group.has(r.arm))return fail('duplicate-scenario-arm');
    if(typeof r.matchId!=='string'||!r.matchId.trim()||matchIds.has(r.matchId))
      return fail('missing-or-duplicate-match-id');
    matchIds.add(r.matchId);
    if(typeof r.engineCommit!=='string'||typeof r.botSHA256!=='string'||
       typeof r.policySHA256!=='string'||
       r.engineCommit.toLowerCase()!==engineCommit.toLowerCase()||
       r.botSHA256.toLowerCase()!==arms[r.arm].botSHA256.toLowerCase()||
       r.policySHA256.toLowerCase()!==arms[r.arm].policySHA256.toLowerCase())
      return fail('provenance-mismatch');
    if(r.exitCode!==0||r.verified!==true||r.confirmed!==true||
       r.recording?.complete!==true||r.recording.dropped!==0||
       r.recording.streamErrors!==0)return fail('incomplete-recording-or-unverified');
    if(!['victory','defeat'].includes(r.outcome)||
       !['game-over','eliminated'].includes(r.termination)||
       r.outcome==='victory'&&r.termination!=='game-over'||
       !Number.isFinite(r.endLand)||r.endLand<0||
       !Number.isSafeInteger(r.endTick)||r.endTick<0)
      return fail('censored-or-invalid-result');
    group.set(r.arm,r);
  }
  if([...planned.values()].some(g=>g.size!==ARMS.length))
    return fail('missing-paired-arm');
  const comparisons={};
  for(const baseline of ARMS.slice(1)){
    let baselineWins=0,candidateWins=0,baselineLand=0,candidateLand=0;
    const cells=[];
    for(const mode of modes)for(const map of maps)for(const opponent of opponents){
      let bw=0,cw=0,bl=0,cl=0;
      for(const seed of seeds){
        const g=planned.get(key(mode,map,opponent,seed));
        const a=g.get(baseline),b=g.get('candidate');
        bw+=Number(a.outcome==='victory');cw+=Number(b.outcome==='victory');
        bl+=a.endLand;cl+=b.endLand;
      }
      baselineWins+=bw;candidateWins+=cw;baselineLand+=bl;candidateLand+=cl;
      cells.push({mode,map,opponent,n:seeds.length,baselineWins:bw,
        candidateWins:cw,baselineMeanLand:bl/seeds.length,
        candidateMeanLand:cl/seeds.length,
        passes:cw>=bw&&cl>=bl*.95});
    }
    comparisons[baseline]={n:planned.size,baselineWins,candidateWins,
      baselineMeanLand:baselineLand/planned.size,
      candidateMeanLand:candidateLand/planned.size,cells,
      passes:candidateWins>baselineWins&&candidateLand>=baselineLand&&
        cells.every(c=>c.passes)};
  }
  const eligible=Object.values(comparisons).every(c=>c.passes);
  return {valid:true,eligible,
    reason:eligible?'paired-holdout-gate-passed':'no-verified-improvement',
    observationUnit:'match',nPerArm:planned.size,
    note:'Eligibility is advisory; verify raw game artifacts and approve deployment separately.',
    comparisons};
}
if(require.main===module){
  try{
    if(process.argv.length!==3)throw Error('Usage: node trainer/promotion-gate-v5.cjs EVIDENCE.json');
    const result=evaluate(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
    console.log(JSON.stringify(result,null,2));
    if(!result.valid||!result.eligible)process.exitCode=1;
  }catch(e){console.error(String(e));process.exitCode=1;}
}
module.exports={evaluate};
