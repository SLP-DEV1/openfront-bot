'use strict';
// §13 identical-seed comparison: new candidate (variant D) vs the previous
// schema-5 baseline (arch-20-noreg, policySHA256 16b686d2...) on the SAME
// pre-registered v5fh scenarios, plus the within-run rule-basis / run3
// assessments already computed by the paired holdout harness.
//
// Cross-run pairing is valid because both runs used the identical protocol
// (seeds verified against the prior campaign) and deterministic engine+bot.
const fs=require('node:fs'),path=require('node:path');
const {pairedCi}=require('../../tools/benchmark/paired-holdout.cjs');
const campaignDir=__dirname;
const read=p=>JSON.parse(fs.readFileSync(path.join(campaignDir,p),'utf8'));

const dRun=read('holdout-13-d/holdout.json');
const bRun=read('holdout-13-baseline/holdout.json');
const prior=read('../campaign-v5rank-20260924/s8-holdout-1v1/holdout.json');

function rowsByScenarioArm(run){
  const m=new Map();
  for(const r of run.rows){
    const k=r.scenarioId+'|'+r.arm;
    if(m.has(k))throw Error('duplicate row '+k);
    m.set(k,r);
  }
  return m;
}
const dRows=rowsByScenarioArm(dRun),bRows=rowsByScenarioArm(bRun),
  priorRows=rowsByScenarioArm(prior);

const checks=[];
function check(name,ok,detail){checks.push({name,ok,detail});
  if(!ok)console.error('CHECK FAIL: '+name+' '+JSON.stringify(detail));}

// 1) Protocol identity across both runs and the prior campaign.
{
  const ids=(r)=>r.protocol.scenarios.map(s=>[s.scenarioId,s.matchSeed]
    .join(':')).sort();
  check('protocol-identical-d-vs-baseline',
    JSON.stringify(ids(dRun))===JSON.stringify(ids(bRun)));
  check('protocol-identical-vs-prior-campaign',
    JSON.stringify(ids(dRun))===JSON.stringify(ids(prior)));
}
// 2) Provenance: every row verified with the right arms and engine commit.
for(const [label,run] of [['d',dRun],['baseline',bRun]]){
  const bad=run.rows.filter(r=>!r.verified||r.exitCode!==0);
  check('rows-verified-'+label,bad.length===0,{
    bad:bad.map(r=>r.matchId)});
  const candSha=run.arms.candidate.policySHA256;
  check('arm-sha-'+label,
    run.rows.filter(r=>r.arm==='candidate')
      .every(r=>r.policySHA256===candSha));
}
// 3) New candidate policy sha is variant D; baseline run carries the prior
//    baseline policy sha exactly (no silent model swap).
const D_SHA_PREFIX='2d7a6c57903b';
const BASELINE_SHA_PREFIX='16b686d291addf4e';
check('d-run-candidate-is-variant-d',
  dRun.arms.candidate.policySHA256.startsWith(D_SHA_PREFIX));
check('baseline-run-candidate-is-prior-baseline',
  bRun.arms.candidate.policySHA256.startsWith(BASELINE_SHA_PREFIX));

// 4) Wiring no-op proof: the baseline candidate arm (model without kindBias,
//    new bot source with the bias wiring) reproduces the prior campaign's
//    candidate rows exactly on every scenario.
{
  const diffs=[];
  for(const s of dRun.protocol.scenarios){
    const a=bRows.get(s.scenarioId+'|candidate'),
      b=priorRows.get(s.scenarioId+'|candidate');
    if(!a||!b){diffs.push({scenario:s.scenarioId,missing:true});continue;}
    if(a.endLand!==b.endLand||a.outcome!==b.outcome||a.endTick!==b.endTick){
      diffs.push({scenario:s.scenarioId,
        now:[a.endLand,a.outcome,a.endTick],
        prior:[b.endLand,b.outcome,b.endTick]});}
  }
  check('baseline-noop-reproduces-prior-rows',diffs.length===0,
    {diffs});
}

// 5) The §13 primary comparison: D vs prior baseline on identical seeds.
//    Land delta is a censored observation (most matches tick-limit); the
//    win delta only counts engine-confirmed outcomes.
const landPairs=[],winPairs=[],outcomeTable=[];
let censored=0;
for(const s of dRun.protocol.scenarios){
  const d=dRows.get(s.scenarioId+'|candidate'),
    b=bRows.get(s.scenarioId+'|candidate');
  if(!d||!b)continue;
  outcomeTable.push({scenario:s.scenarioId,
    d:{endLand:d.endLand,outcome:d.outcome,termination:d.termination},
    baseline:{endLand:b.endLand,outcome:b.outcome,
      termination:b.termination}});
  if(Number.isFinite(d.endLand)&&Number.isFinite(b.endLand))
    landPairs.push(d.endLand-b.endLand);
  const dc=d.termination==='game-over'||d.termination==='eliminated',
    bc=b.termination==='game-over'||b.termination==='eliminated';
  if(dc&&bc&&(d.outcome==='victory'||d.outcome==='defeat')&&
     (b.outcome==='victory'||b.outcome==='defeat'))
    winPairs.push(Number(d.outcome==='victory')-
      Number(b.outcome==='victory'));
  else censored++;
}
const land=pairedCi(landPairs),win=pairedCi(winPairs);
const landSum=landPairs.reduce((a,b)=>a+b,0);

// 6) Within-run assessments (harness-computed) for the record.
function within(run,baselineArm){
  const p=run.paired[baselineArm]||{};
  return{gatePasses:p.gatePasses,distinguishable:p.distinguishable,
    win:p.win,land:p.land,decisivePairs:p.decisivePairs};
}
const comparison={
  generated:new Date().toISOString(),
  protocol:{scenarios:dRun.protocol.scenarios,
    engineCommit:dRun.engineCommit,
    baselinePolicySHA256:bRun.arms.candidate.policySHA256,
    candidatePolicySHA256:dRun.arms.candidate.policySHA256,
    candidateBotSHA256:dRun.arms.candidate.botSHA256,
    baselineBotSHA256:bRun.arms.candidate.botSHA256},
  checks,allChecksPass:checks.every(c=>c.ok),
  dVsBaseline:{
    landPairs,winPairs,censored,
    landDeltaMean:land.mean,landDeltaCI:[land.ciLow,land.ciHigh],
    landDeltaSum:landSum,
    winDeltaMean:win.mean,winDeltaCI:[win.ciLow,win.ciHigh],
    perScenario:outcomeTable},
  dVsRuleBasis:within(dRun,'rule-basis'),
  dVsRun3:within(dRun,'run3-schema4'),
  baselineVsRuleBasis:within(bRun,'rule-basis'),
  baselineVsRun3:within(bRun,'run3-schema4'),
  dGates:{gatesPass:dRun.gatesPass,eligible:dRun.eligible,
    reason:dRun.reason},
  baselineGates:{gatesPass:bRun.gatesPass,eligible:bRun.eligible,
    reason:bRun.reason}
};
const outDir=path.join(campaignDir,'comparison-13');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'comparison.json'),
  JSON.stringify(comparison,null,1)+'\n');
console.log('checks',comparison.allChecksPass?'all pass':
  checks.filter(c=>!c.ok).length+' failing');
console.log('D vs baseline land delta mean',land.mean,
  'CI [',land.ciLow,',',land.ciHigh,'] n='+land.n);
console.log('D vs baseline win delta mean',win.mean,'n='+win.n,
  'censored',censored);
console.log('written',path.join(outDir,'comparison.json'));
