#!/usr/bin/env node
'use strict';
// Fail closed on non-provenant, truncated, or falsely victorious engine smokes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');

function verify(report,{engineCommit,botSHA256,participants=1,minTicks=100}){
  assert.match(engineCommit,/^[0-9a-f]{40}$/,'exact official engine pin required');
  assert.equal(report?.benchmarkMeta?.engineCommit,engineCommit,'engine provenance');
  assert.equal(report?.benchmarkMeta?.botSHA256,botSHA256,'bot source hash');
  assert.equal(report?.benchmarkMeta?.harness,
    participants===1?'engine-gameview-v2':'engine-gameview-multibot-v1','real GameView harness');
  assert.equal(report?.run?.failure,null,'engine must run without an exception');
  assert(report.run.tick>=minTicks,'engine stopped before meaningful simulation');
  assert.equal(report.run.spawned,true,'primary bot never spawned');
  assert(report.run.emitted>0,'no actual bot intent was emitted');
  assert(!['error','spawn-timeout','bot-stopped'].includes(report.run.termination),
    'invalid termination: '+report.run.termination);
  assert.equal(report.recording?.complete,true,'diagnostic recording incomplete');
  assert.equal(report.recording?.streamCount,report.run.recordCount,
    'recording/event stream count drift');
  if(participants>1){
    assert.equal(report.fullBots?.length,participants,'incorrect full-bot lineup');
    assert(report.fullBots.every(x=>x.started&&x.spawned),
      'a full-bot client did not start and spawn');
    assert(report.fullBots.every(x=>x.botSHA256===botSHA256),
      'a client ran a different bot source');
  }
  const end=report.gameEnd;
  if(end){
    assert(['engine-WinUpdate','engine-elimination'].includes(end.source),
      'a userscript heuristic must not be reported as a verified game end');
    if(end.outcome==='victory'){
      assert.equal(end.source,'engine-WinUpdate','no victory from elimination');
      assert.notEqual(report.engineWinner,null,'no victory without a winner');
    }
  }
  if(report.engineWinner!=null){
    assert.equal(end?.source,'engine-WinUpdate','winner event lost');
  }
  return {tick:report.run.tick,emitted:report.run.emitted,
    participants,termination:report.run.termination,
    outcome:end?.outcome??'censored'};
}
if(require.main===module){
  const [file,engineCommit,botFile,participantsArg]=process.argv.slice(2);
  if(!file||!engineCommit||!botFile||!['1','2'].includes(participantsArg))
    throw Error('Usage: node verify-upstream-run.cjs MATCH_JSON ENGINE_SHA BOT_FILE 1|2');
  const digest=crypto.createHash('sha256').update(fs.readFileSync(botFile)).digest('hex');
  const report=JSON.parse(fs.readFileSync(file,'utf8'));
  const result=verify(report,{engineCommit,botSHA256:digest,
    participants:Number(participantsArg),minTicks:120});
  const stream=fs.readFileSync(path.join(path.dirname(file),'turns.jsonl'),'utf8')
    .trimEnd().split('\n');
  assert.equal(stream.length,report.run.tick,'replay turn stream truncated');
  console.log('PASS current official OpenFront integration '+JSON.stringify(result));
}
module.exports={verify};
