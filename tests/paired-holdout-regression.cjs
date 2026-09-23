'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const holdout=require('../tools/benchmark/paired-holdout.cjs');
const {evaluate}=require('../trainer/promotion-gate-v5.cjs');
const {parseArgs,buildProtocol,resolveArms,pairedCi,computePaired,
  computeNegativeGates,byScenario,ARM_ORDER}=holdout;
const sha=h=>h.repeat(64);
// Arm hashes use distinct hex digits so they satisfy the gate's HEX64 check.
const ARMS={candidate:{botSHA256:sha('1'),policySHA256:sha('2')},
  'rule-basis':{botSHA256:sha('3'),policySHA256:sha('4')},
  'run3-schema4':{botSHA256:sha('5'),policySHA256:sha('6')}};

// --- parseArgs ---
const o=parseArgs(['--bot','b.user.js','--run3Policy','p.json',
  '--candidateModel','m.json','--maps','World,Europe','--opponents',
  'balanced,rush','--runs','2']);
assert.deepEqual(o.maps,['World','Europe']);
assert.deepEqual(o.opponents,['balanced','rush']);
assert.equal(o.runs,2);assert.equal(o.mode,'1v1');
assert.equal(o.execute,false);assert.equal(o.smoke,false);
const base=['--bot','b','--run3Policy','p','--candidateModel','m'];
assert.throws(()=>parseArgs([...base,'--maps','World']),/maps/);
assert.throws(()=>parseArgs([...base,'--opponents','balanced']),/opponents/);
assert.throws(()=>parseArgs([...base,'--runs','1']),/runs/);
assert.throws(()=>parseArgs([...base,'--mode','4v4']),/mode/);

// --- buildProtocol: rotation + unique seeds + cell coverage ---
const proto=buildProtocol({maps:['World','Europe'],opponents:['balanced','rush'],
  runs:2,mode:'1v1',engineCommit:'a'.repeat(40),gain:18},ARMS);
assert.equal(proto.scenarios.length,8,'2 maps x 2 opponents x 2 runs');
assert.equal(proto.minPairsPerCell,2);
assert.equal(new Set(proto.scenarios.map(s=>s.matchSeed)).size,8,'unique real seeds');
assert.equal(new Set(proto.scenarios.map(s=>s.scenarioId)).size,8,'unique scenario ids');
assert.ok(proto.roleRotation,'role-rotation documented');
assert.deepEqual(Object.keys(proto.arms).sort(),ARM_ORDER.slice().sort());
for(const map of ['World','Europe'])for(const opp of ['balanced','rush']){
  const cell=proto.scenarios.filter(s=>s.map===map&&s.opponent===opp);
  assert.ok(cell.length>=proto.minPairsPerCell,'cell '+map+'/'+opp);
}

// --- resolveArms: three arms on the SAME bot code ---
const real=resolveArms({
  bot:path.resolve(__dirname,'../OpenFront_AggroBot_Impossible_Run3.user.js'),
  run3Policy:path.resolve(__dirname,'../docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json'),
  candidateModel:path.resolve(__dirname,'../trainer/candidate-v5-holdout.json'),
  engineCommit:'a'.repeat(40),gain:18});
assert.equal(real['rule-basis'].botSHA256,real['run3-schema4'].botSHA256,
  'rule-basis and run3-schema4 run the identical bot code');
assert.notEqual(real['candidate'].botSHA256,real['rule-basis'].botSHA256,
  'the candidate arm embeds the schema-5 model into the source');
for(const a of ARM_ORDER){
  assert.match(real[a].botSHA256,/^[a-f0-9]{64}$/);
  assert.match(real[a].policySHA256,/^[a-f0-9]{64}$/);
}
assert.equal(real['rule-basis'].expectedPolicySHA256,null);
assert.ok(real['candidate'].engineArgs.includes('--candidateControl'));
assert.ok(real['candidate'].engineArgs.includes('--candidateModel'));
assert.ok(real['run3-schema4'].engineArgs.includes('--policy'));
assert.ok(!real['rule-basis'].engineArgs.includes('--policy'));

// --- paired CI math ---
assert.equal(pairedCi([1,1,1,1]).mean,1);
assert.equal(pairedCi([1,1,1,1]).ciLow,1,'deterministic paired win is 1.0');
const zero=pairedCi([1,-1,1,-1]);
assert.equal(zero.mean,0);
assert.ok(zero.ciLow<0&&zero.ciHigh>0,'balanced pairs are indistinguishable');

// --- end-to-end eligibility: gate + paired CIs + negative gates ---
// 2 pairs per (map x opponent) cell so the gate's minPairsPerCell=2 holds.
const cells=[['World','balanced'],['World','rush'],['Europe','balanced'],
  ['Europe','rush']];
const scenarios=[];
for(const [map,opponent] of cells)for(const pair of [1,2])
  scenarios.push({scenarioId:`s-${map}-${opponent}-${pair}`,
    matchSeed:`seed-${map}-${opponent}-${pair}`,mode:'1v1',map,opponent});
const proto2={engineCommit:'a'.repeat(40),modes:['1v1'],maps:['World','Europe'],
  opponents:['balanced','rush'],minPairsPerCell:2,roleRotation:'x',arms:ARMS,
  scenarios};
function mkRow(s,arm,outcome,endLand){
  return {arm,scenarioId:s.scenarioId,mode:s.mode,map:s.map,opponent:s.opponent,
    matchSeed:s.matchSeed,matchId:`${s.scenarioId}:${arm}`,
    engineCommit:'a'.repeat(40),botSHA256:ARMS[arm].botSHA256,
    policySHA256:ARMS[arm].policySHA256,exitCode:0,verified:true,confirmed:true,
    recording:{complete:true,dropped:0,streamErrors:0},outcome,
    termination:'game-over',endLand,endTick:3000};
}
function finalEligible(p,rows){
  const gate=evaluate({protocol:p,rows});
  const raw=computePaired(p,rows);
  const gatesPass=computeNegativeGates(rows,byScenario(rows),p).every(g=>!g.triggered);
  const comp=gate.valid?gate.comparisons:{};
  const distinguishable=['rule-basis','run3-schema4'].every(b=>
    (comp[b]?.passes===true)&&raw[b].win.ciLow>0);
  return {gate,gatesPass,distinguishable,
    eligible:!!gate.eligible&&gatesPass&&distinguishable};
}
// Candidate beats both baselines in every scenario -> proven, eligible.
const rowsWin=[];
for(const s of proto2.scenarios){
  rowsWin.push(mkRow(s,'candidate','victory',1500));
  rowsWin.push(mkRow(s,'rule-basis','defeat',1000));
  rowsWin.push(mkRow(s,'run3-schema4','defeat',1100));
}
const win=finalEligible(proto2,rowsWin);
assert.equal(win.gate.valid,true);
assert.equal(win.gate.eligible,true,'gate: wins+land above both baselines');
assert.equal(win.gatesPass,true);
assert.equal(win.distinguishable,true,'paired win CI excludes zero');
assert.equal(win.eligible,true,'proven paired improvement is eligible');
// 0/0 (candidate loses everything) -> gate fails, not eligible.
const rowsZero=[];
for(const s of proto2.scenarios){
  rowsZero.push(mkRow(s,'candidate','defeat',900));
  rowsZero.push(mkRow(s,'rule-basis','victory',1200));
  rowsZero.push(mkRow(s,'run3-schema4','victory',1300));
}
const zero2=finalEligible(proto2,rowsZero);
assert.equal(zero2.gate.eligible,false,'0/0 cannot be eligible');
assert.equal(zero2.distinguishable,false,'0/0 win CI is not above zero');
assert.equal(zero2.eligible,false,'0/0 or not-distinguishable never promotes');
// Untenable regression: candidate loses while both baselines win -> gate fires.
const rowsRegression=[];
for(const s of proto2.scenarios){
  rowsRegression.push(mkRow(s,'candidate','defeat',800));
  rowsRegression.push(mkRow(s,'rule-basis','victory',1200));
  rowsRegression.push(mkRow(s,'run3-schema4','victory',1250));
}
const gates=computeNegativeGates(rowsRegression,byScenario(rowsRegression),proto2);
assert.equal(gates.find(g=>g.gate==='untenable-regression-fixed-scenario').triggered,
  true,'candidate regression in a fixed scenario is flagged');

// --- rowFromReport: real engine report shape -> verified holdout row ---
// The engine normalizes the CLI gameMode into its runtime label ('FFA' ->
// 'Free For All'); rowFromReport must verify against that normalized label.
const scen0=proto.scenarios[0];
const cfg1v1=holdout.MODE_CONFIG['1v1'];
const candArm=real.candidate;
const makeReport=gameModeLabel=>({
  benchmarkMeta:{
    botSHA256:candArm.botSHA256,
    policySHA256:candArm.expectedPolicySHA256,
    engineCommit:o.engineCommit,
    seed:scen0.matchSeed,
    opponentProfile:scen0.opponent,
    gameConfig:{gameMode:gameModeLabel,gameMap:scen0.map},
    harness:'engine-gameview-v2'},
  run:{termination:'game-over',tick:1234},
  gameEnd:{outcome:'victory'},
  finalState:{land:42},
  recording:{complete:true,dropped:0,streamErrors:0}});
const okRow=holdout.rowFromReport(makeReport('Free For All'),'candidate',
  candArm,scen0,cfg1v1,o,0,'');
assert.equal(okRow.verified,true,'row verifies against engine-normalized gameMode');
assert.equal(okRow.confirmed,true,'game-over => confirmed');
assert.equal(okRow.outcome,'victory');
assert.equal(okRow.termination,'game-over');
assert.equal(okRow.endLand,42);
assert.equal(okRow.endTick,1234);
assert.equal(okRow.recording.complete,true);
assert.equal(okRow.exitCode,0);
// The raw CLI label is NOT what the engine reports -> not verified.
const rawRow=holdout.rowFromReport(makeReport('FFA'),'candidate',
  candArm,scen0,cfg1v1,o,0,'');
assert.equal(rawRow.verified,false,'raw FFA label must not verify');

// #154: Censored outcomes must never be imputed as confirmed defeats.
const censored=rowsWin.map(r=>({...r}));
const scenario0=proto2.scenarios[0].scenarioId;
const c0=censored.find(r=>r.scenarioId===scenario0&&r.arm==='candidate');
c0.outcome='incomplete';c0.confirmed=false;c0.termination='tick-limit';
let censorResult=computePaired(proto2,censored);
for(const b of ['rule-basis','run3-schema4']){
  assert.equal(censorResult[b].decisivePairs,7,'only confirmed pairs enter win CI');
  assert.equal(censorResult[b].censoredPairs,1);
  assert.equal(censorResult[b].win.n,7);
  assert.equal(censorResult[b].win.mean,1,'incomplete vs defeat is not counted as 0');
}
let censorGates=computeNegativeGates(censored,byScenario(censored),proto2);
assert.equal(censorGates.find(g=>g.gate==='insufficient-decisive-pairs').triggered,
  true,'any cell with fewer than 2 decisive pairs is ineligible');
assert.equal(finalEligible(proto2,censored).eligible,false,
  'censored cell cannot pass promotion');
const censoredVsVictory=rowsZero.map(r=>({...r}));
const c1=censoredVsVictory.find(r=>r.scenarioId===scenario0&&r.arm==='candidate');
c1.outcome='unknown';c1.confirmed=false;c1.termination='tick-limit';
assert.equal(computePaired(proto2,censoredVsVictory)['rule-basis'].win.n,7,
  'unknown candidate vs confirmed victory is not a -1 win pair');
const doubleCensored=censoredVsVictory.map(r=>({...r}));
const b0=doubleCensored.find(r=>r.scenarioId===scenario0&&r.arm==='rule-basis');
b0.outcome='incomplete';b0.confirmed=false;b0.termination='tick-limit';
assert.equal(computePaired(proto2,doubleCensored)['rule-basis'].win.n,7,
  'incomplete vs incomplete is not a 0 win pair');
assert.equal(computePaired(proto2,rowsWin)['rule-basis'].win.n,8,
  'confirmed pairs remain decisive');

console.log('PASS P5 paired holdout: pre-registration, same-code arms, paired CIs, negative gates and 0/0 no-promotion');
