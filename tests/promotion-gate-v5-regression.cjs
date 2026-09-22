'use strict';
const assert=require('node:assert/strict');
const {evaluate}=require('../trainer/promotion-gate-v5.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const sha=n=>String(n).repeat(64);
const protocol={engineCommit:'a'.repeat(40),modes:['1v1'],
  maps:['World','Europe'],opponents:['balanced','cautious'],
  seeds:['holdout-1','holdout-2'],minPairsPerCell:2,
  arms:{
    candidate:{botSHA256:sha('b'),policySHA256:sha('c')},
    'rule-basis':{botSHA256:sha('d'),policySHA256:sha('e')},
    'run3-schema4':{botSHA256:sha('f'),policySHA256:sha('0')}
  }};
const rows=[];
let index=0;
for(const mode of protocol.modes)for(const map of protocol.maps)
for(const opponent of protocol.opponents)for(const seed of protocol.seeds)
for(const arm of Object.keys(protocol.arms)){
  const candidate=arm==='candidate';
  rows.push({arm,matchId:'holdout-'+(++index),mode,map,opponent,seed,
    engineCommit:protocol.engineCommit,...protocol.arms[arm],
    exitCode:0,verified:true,confirmed:true,
    recording:{complete:true,dropped:0,streamErrors:0},
    outcome:candidate&&seed==='holdout-1'?'victory':'defeat',
    termination:'game-over',endLand:candidate?1200:1000,endTick:3500});
}
const run=(nextRows=rows,nextProtocol=protocol)=>
  evaluate({protocol:nextProtocol,rows:nextRows});
assert.equal(run().eligible,true,'genuine paired improvements pass advisory gate');
assert.equal(run().nPerArm,8,'count one complete match per arm and scenario');
assert.equal(run().comparisons['rule-basis'].candidateWins,4);
assert.equal(run().comparisons['run3-schema4'].candidateWins,4);
assert.equal(run([...rows].reverse()).eligible,true,'order must not matter');
const reject=(mutate,reason)=>{
  const copy=clone(rows);
  mutate(copy);
  const result=run(copy);
  assert.equal(result.valid,false,reason);
  assert.equal(result.eligible,false,reason);
  assert.equal(result.reason,reason);
};
reject(x=>x.pop(),'missing-or-extra-match');
reject(x=>x.push(clone(x[0])),'missing-or-extra-match');
reject(x=>x[0].arm=x[1].arm,'duplicate-scenario-arm');
reject(x=>x[0].matchId=x[1].matchId,'missing-or-duplicate-match-id');
reject(x=>x[0].policySHA256=sha('1'),'provenance-mismatch');
reject(x=>x[0].engineCommit='a'.repeat(39)+'b','provenance-mismatch');
reject(x=>x[0].verified=false,'incomplete-recording-or-unverified');
reject(x=>x[0].confirmed=false,'incomplete-recording-or-unverified');
reject(x=>x[0].recording.complete=false,'incomplete-recording-or-unverified');
reject(x=>x[0].recording.dropped=1,'incomplete-recording-or-unverified');
reject(x=>x[0].recording.streamErrors=1,'incomplete-recording-or-unverified');
reject(x=>x[0].exitCode=1,'incomplete-recording-or-unverified');
reject(x=>x[0].outcome='unknown','censored-or-invalid-result');
reject(x=>x[0].termination='tick-limit','censored-or-invalid-result');
reject(x=>x[0].endLand=null,'censored-or-invalid-result');
reject(x=>x[0].endTick=-1,'censored-or-invalid-result');
reject(x=>x[0].seed='unplanned','unplanned-scenario');
reject(x=>x[0].arm='unplanned','unexpected-arm');
const noWins=clone(rows);
for(const row of noWins)if(row.arm==='candidate')row.outcome='defeat';
assert.equal(run(noWins).valid,true);
assert.equal(run(noWins).eligible,false,'higher land cannot replace observed win improvement');
const collapse=clone(rows);
for(const row of collapse)if(row.arm==='candidate'&&row.map==='Europe'){
  row.outcome='defeat';row.endLand=100;
}
assert.equal(run(collapse).eligible,false,'map-level loss/land regression blocks promotion');
assert.equal(run(rows,{...protocol,minPairsPerCell:3}).eligible,false,
  'undersized per-cell holdout cannot be promoted');
assert.equal(run(rows,{...protocol,seeds:['holdout-1','holdout-1']}).valid,false,
  'duplicate seeds cannot inflate coverage');
assert.equal(run(rows,{...protocol,maps:['World']}).valid,false,
  'single-map protocol is not a rotated holdout');
assert.equal(run(rows,{...protocol,opponents:['balanced']}).valid,false,
  'single-opponent protocol is not a mixed holdout');
assert.equal(evaluate().eligible,false,'missing data fails closed');
console.log('PASS P6 paired promotion: complete verified matches, provenance, rotation and fail-closed gates');
