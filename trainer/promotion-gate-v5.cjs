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
const scenarioKey=scenarioId=>scenarioId;
function evaluate({protocol,rows}={}){
  if(!protocol||!Array.isArray(rows))return fail('missing-protocol-or-rows');
  const {engineCommit,modes,maps,opponents,scenarios,arms,minPairsPerCell}=protocol;
  if(!HEX40.test(engineCommit||'')||!uniqueStrings(modes)||
     !modes.every(m=>['1v1','official-2v2','ffa-duo'].includes(m))||
     !uniqueStrings(maps)||maps.length<2||
     !uniqueStrings(opponents)||opponents.length<2||!Array.isArray(scenarios)||
     scenarios.length===0||
     !Number.isSafeInteger(minPairsPerCell)||minPairsPerCell<2||
     !arms||
     Object.keys(arms).sort().join('|')!==[...ARMS].sort().join('|')||
     ARMS.some(a=>!HEX64.test(arms[a]?.botSHA256||'')||
       !HEX64.test(arms[a]?.policySHA256||'')))
    return fail('invalid-preregistered-protocol');
  const scenarioIds=new Set(),matchSeeds=new Set(),cellCounts=new Map();
  for(const scenario of scenarios){
    if(!scenario||typeof scenario.scenarioId!=='string'||
       !scenario.scenarioId.trim()||scenario.scenarioId.length>128||
       typeof scenario.matchSeed!=='string'||!scenario.matchSeed.trim()||
       scenario.matchSeed.length>128||!modes.includes(scenario.mode)||
       !maps.includes(scenario.map)||!opponents.includes(scenario.opponent)||
       scenarioIds.has(scenario.scenarioId)||matchSeeds.has(scenario.matchSeed))
      return fail('invalid-or-reused-scenario-block');
    scenarioIds.add(scenario.scenarioId);
    matchSeeds.add(scenario.matchSeed);
    const cell=JSON.stringify([scenario.mode,scenario.map,scenario.opponent]);
    cellCounts.set(cell,(cellCounts.get(cell)||0)+1);
  }
  for(const mode of modes)for(const map of maps)for(const opponent of opponents)
    if((cellCounts.get(JSON.stringify([mode,map,opponent]))||0)<minPairsPerCell)
      return fail('undersized-holdout-cell');
  const planned=new Map();
  for(const scenario of scenarios)
    planned.set(scenarioKey(scenario.scenarioId),{scenario,arms:new Map()});
  if(rows.length!==planned.size*ARMS.length)return fail('missing-or-extra-match');
  const matchIds=new Set();
  for(const r of rows){
    if(!r||!ARMS.includes(r.arm)||!own(arms,r.arm))
      return fail('unexpected-arm');
    const block=planned.get(scenarioKey(r.scenarioId));
    if(!block)return fail('unplanned-scenario');
    const {scenario,arms:group}=block;
    if(r.mode!==scenario.mode||r.map!==scenario.map||
       r.opponent!==scenario.opponent||r.matchSeed!==scenario.matchSeed)
      return fail('scenario-block-mismatch');
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
  if([...planned.values()].some(block=>block.arms.size!==ARMS.length))
    return fail('missing-paired-arm');
  const comparisons={};
  for(const baseline of ARMS.slice(1)){
    let baselineWins=0,candidateWins=0,baselineLand=0,candidateLand=0;
    const cells=[];
    for(const mode of modes)for(const map of maps)for(const opponent of opponents){
      let bw=0,cw=0,bl=0,cl=0;
      const blocks=[...planned.values()].filter(({scenario})=>
        scenario.mode===mode&&scenario.map===map&&scenario.opponent===opponent);
      for(const {arms:g} of blocks){
        const a=g.get(baseline),b=g.get('candidate');
        bw+=Number(a.outcome==='victory');cw+=Number(b.outcome==='victory');
        bl+=a.endLand;cl+=b.endLand;
      }
      const n=blocks.length;
      baselineWins+=bw;candidateWins+=cw;baselineLand+=bl;candidateLand+=cl;
      cells.push({mode,map,opponent,n,baselineWins:bw,
        candidateWins:cw,baselineMeanLand:bl/n,
        candidateMeanLand:cl/n,
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
