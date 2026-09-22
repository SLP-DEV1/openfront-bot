'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','OpenFront_Solo_AggroBot.user.js'),'utf8');
const from=source.indexOf('  function evidencePanelState(');
const to=source.indexOf('  function paint() {',from);
assert(from>0&&to>from,'evidence presentation function missing');
const evidencePanelState=vm.runInNewContext('('+source.slice(from,to).trim()+')');
const a={id:'attack:foe',utility:42,reason:'counter-risk'};
const budget={tick:80,capUse:.97,cityWanted:true,cityCount:2,
  wantedSAM:1,nuclearThreat:true,portMilestone:true,goldFloor:500000};
const state=evidencePanelState({rejected:a},
 {reserveReason:'borderFloor',reserveFloors:{borderFloor:700}},
 {requestedTick:90},100,
 [{actionId:'a2',decisionId:'d2',effect:'unconfirmed'}],budget);
assert.equal(state.alternative.id,a.id);
assert.equal(state.reserveReason,'borderFloor');
assert.equal(state.workerAge,10);
assert.equal(state.workerStale,false);
assert.equal(state.actionId,'a2');
assert.equal(state.decisionId,'d2');
assert.equal(state.effect,'unconfirmed');
assert.equal(state.budget,budget);
const stale=evidencePanelState({}, {},{requestedTick:80},500,[],budget);
assert.equal(stale.workerStale,true);
assert.equal(stale.workerAge,420);
assert.equal(stale.budget,null,'stale budget must be labelled unknown');
assert.equal(stale.effect,'unconfirmed',
  'absence of receipt must not be interpreted as successful effect');
const unknown=evidencePanelState(null,null,null,-1,null,null);
assert.equal(unknown.workerAge,null);
assert.equal(unknown.budget,null);
assert.match(source,/evidenceMode:false/);
assert(source.includes("'duoEnabled','evidenceMode','shadowRankEnabled'].includes(key)"),
  'Evidence toggle must be read-only and persist through the existing handler');
assert(source.includes("b('evidenceMode',opts.evidenceMode?"));
assert(source.includes("economyBudgetEvidence={tick,gold:requirements.gold,"),
  'budget line must be sampled from the existing economy plan');
assert(source.includes('budget:budgetAge!==null&&budgetAge<=300?budget:null'),
  'expired economy samples must not masquerade as current');
assert(source.includes('economyBudgetEvidence,'),
  'diagnostic export must include the economy snapshot');
assert(source.includes('escapeHTML(a?a.id+'),
  'untrusted candidate labels must be escaped in the panel');
console.log('PASS read-only evidence state, stale worker/budget handling and opt-in GUI wiring');
