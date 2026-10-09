'use strict';
const assert=require('node:assert/strict');
const {verify}=require('../tools/benchmark/verify-upstream-run.cjs');
const sha='a'.repeat(40),hash='b'.repeat(64);
const mk=()=>({benchmarkMeta:{engineCommit:sha,botSHA256:hash,
    harness:'engine-gameview-v2'},
  run:{tick:300,spawned:true,emitted:4,termination:'tick-limit',
    failure:null,recordCount:2},
  recording:{complete:true,streamCount:2},
  gameEnd:undefined,engineWinner:null});
const valid={engineCommit:sha,botSHA256:hash,participants:1,minTicks:120};
assert.equal(verify(mk(),valid).outcome,'censored');
const fake=mk();fake.gameEnd={outcome:'victory',source:'userscript'};
assert.throws(()=>verify(fake,valid),/userscript heuristic/);
const missing=mk();missing.gameEnd={outcome:'victory',source:'engine-WinUpdate'};
assert.throws(()=>verify(missing,valid),/no victory without a winner/);
const real=mk();real.engineWinner=['player','aggrobot'];
real.gameEnd={outcome:'victory',source:'engine-WinUpdate'};
assert.equal(verify(real,valid).outcome,'victory');
const bad=mk();bad.run.emitted=0;
assert.throws(()=>verify(bad,valid),/no actual bot intent/);
const multi=mk();multi.benchmarkMeta.harness='engine-gameview-multibot-v1';
multi.fullBots=[1,2].map(i=>({started:true,spawned:true,
  clientID:'aggrobot'+i,botSHA256:hash}));
assert.equal(verify(multi,{...valid,participants:2}).participants,2);
multi.fullBots[1].spawned=false;
assert.throws(()=>verify(multi,{...valid,participants:2}),/did not start and spawn/);
console.log('PASS current-engine integration gates, provenance, no false wins');
