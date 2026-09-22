'use strict';
const assert=require('node:assert/strict');
const {parse}=require('../tools/benchmark/common.cjs');
const {summarize,compare}=require('../tools/match-report.cjs');
const base={bot:'1.10.9',gameType:'Singleplayer',difficulty:'Medium',
  benchmarkMeta:{gameMap:'World',gameMapSize:'Compact',gameMode:'Free For All',seed:'test-1',
    seedSource:'GameStartInfo.gameID',harness:'engine-gameview-v1',engineCommit:'123',
    botSHA256:'old',policySHA256:null,profile:'autonomous',settings:{fullAuto:true},
    scriptedHumans:0,opponentProfile:'balanced',maxTicks:18000,
    gameConfig:{bots:40,nations:8}},
  gameEnd:{outcome:'victory',land:100,tick:300},
  recording:{total:1500,counts:{attack_confirmed:32},dropped:0,complete:true},records:[]};
const copy=x=>JSON.parse(JSON.stringify(x));
const other=copy(base);other.benchmarkMeta.botSHA256='new';
assert.equal(compare([summarize(base),summarize(other)]).length,1);
const differentPolicy=copy(other);differentPolicy.benchmarkMeta.botSHA256='old';
differentPolicy.benchmarkMeta.policySHA256='a'.repeat(64);
assert.equal(compare([summarize(base),summarize(differentPolicy)]).length,1,
  'same userscript with different model is a real variant');
const settingsVariant=copy(other);settingsVariant.benchmarkMeta.botSHA256='old';
settingsVariant.benchmarkMeta.settings={fullAuto:false,reserve:35};
assert.equal(compare([summarize(base),summarize(settingsVariant)]).length,1,
  'effective settings describe a variant, not a match condition');
const unknownOpponent=copy(other);
delete unknownOpponent.benchmarkMeta.opponentProfile;
assert.equal(compare([summarize(base),summarize(unknownOpponent)]).length,0,
  'cannot pair unknown scripted opponents');

for(const [key,value] of [['engineCommit','456'],['harness','browser-localserver-worker-v1'],
  ['seed','test-2'],['seedSource',null],['maxTicks',9000],
  ['scriptedHumans',2],['opponentProfile','rush'],
  ['gameConfig',{bots:41,nations:8}]]){
  const changed=copy(other);changed.benchmarkMeta[key]=value;
  assert.equal(compare([summarize(base),summarize(changed)]).length,0,key);
}
for(const outcome of ['incomplete','unknown']){
  const changed=copy(other);changed.gameEnd.outcome=outcome;
  assert.equal(summarize(changed).finished,false);
  assert.equal(compare([summarize(base),summarize(changed)]).length,0);
}
assert.equal(summarize(base).attackConfirmed,32,'lifetime counters survive ring truncation');
const dropped=copy(base);dropped.recording.dropped=100;
assert.equal(summarize(dropped).recordingComplete,false,
  'explicit complete cannot override 100 dropped records');
assert.equal(compare([summarize(dropped),summarize(other)]).length,0,
  'a completed game with dropped records is not a verified pair');
assert.equal(summarize({...base,recording:{complete:true,dropped:0,streamErrors:0}}).recordingComplete,true);
assert.equal(summarize({...base,recording:{complete:true,dropped:0,streamErrors:1}}).recordingComplete,false);
assert.equal(summarize({...base,recording:{complete:true}}).recordingComplete,null,
  'missing drop counter is not verified completeness');
assert.equal(summarize({...base,recording:{dropped:0}}).recordingComplete,null,
  'zero drops without completion confirmation is unknown');
assert.equal(summarize({...base,recording:undefined}).recordingComplete,null);
assert.equal(compare([summarize({...base,recording:undefined}),summarize(other)]).length,0,
  'unknown recording completeness cannot establish a paired result');
assert.equal(summarize({...base,gameEnd:null,finalState:{land:55},run:{tick:100}}).finalLand,55);
assert.throws(()=>parse(['--engine','/tmp/engine','--ticks','NaN']),/Invalid ticks/);
assert.throws(()=>parse(['--engine','/tmp/engine','--seed','../oops']),/Seed/);
assert.throws(()=>parse(['--engine','/tmp/engine','--mystery','1']),/Unknown option/);
assert.throws(()=>parse(['--engine','/tmp/engine','--profile','nope']),/Unknown profile/);
// P6 league planning regression: a temporary *pinned* git repository suffices
// for a dry-run. This must never execute a match or claim a victory.
{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {execFileSync}=require('node:child_process');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aggro-league-plan-'));
  try {
    const engine=path.join(temp,'engine'),output=path.join(temp,'league');
    fs.mkdirSync(engine);
    const git=(...argv)=>execFileSync('git',['-C',engine,...argv],
      {encoding:'utf8'}).trim();
    git('init','-q');
    git('-c','user.name=Regression','-c','user.email=regression@example.invalid',
      'commit','--allow-empty','-qm','test engine pin');
    const commit=git('rev-parse','HEAD');
    const runner=path.join(__dirname,'../tools/benchmark/league.cjs');
    execFileSync(process.execPath,[runner,'--engine',engine,
      '--engineCommit',commit,'--out',output,'--seeds','league-test-01,league-test-02',
      '--profiles','balanced','--opponents','rush','--scripted'],{encoding:'utf8'});
    const report=JSON.parse(fs.readFileSync(path.join(output,'league.json'),'utf8'));
    assert.equal(report.engineCommit,commit);
    assert.equal(report.kind,'legacy-scripted-opponent-league');
    assert.match(report.botSHA256,/^[a-f0-9]{64}$/);
    assert.equal(report.matches.length,2);
    assert.equal(new Set(report.matches.map(m=>m.id)).size,2);
    assert(report.matches.every(m=>m.status==='not-run'&&m.outcome==='unknown'));
    assert(!fs.existsSync(path.join(output,report.matches[0].relativeOutput,'match.json')),
      'dry-run must not fabricate game results');
    assert.throws(()=>execFileSync(process.execPath,[runner,'--engine',engine,
      '--engineCommit',commit,'--out',output],{stdio:'pipe'}),
      'cannot overwrite existing provenance report');
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
}
const {aggregateRecordings}=require('../tools/benchmark/multibot-recording.cjs');
{
  const reports=[{recording:{total:2,streamErrors:0}},
    {recording:{total:3,streamErrors:0}}];
  assert.deepEqual(aggregateRecordings(reports,5),
    {total:5,streamCount:5,streamErrors:0,complete:true},
    'all full bots contribute to one complete JSONL stream');
  assert.equal(aggregateRecordings(reports,2).complete,false,
    'first-client count alone is not the multi-client total');
  assert.equal(aggregateRecordings(reports,4).complete,false,
    'missing records must remain incomplete');
  assert.equal(aggregateRecordings([{recording:{total:2,streamErrors:1}},
    reports[1]],5).complete,false,'stream failures stay visible');
  assert.equal(aggregateRecordings([{recording:{total:2}},reports[1]],5).complete,
    false,'unknown stream-error counter cannot establish completeness');
  assert.equal(aggregateRecordings([reports[0]],2).complete,false,
    'this aggregator must not accept single-bot metrics as multi-bot proof');
}
console.log('PASS benchmark report isolation, censored results, lifetime counters and CLI validation');
