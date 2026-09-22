'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'OpenFront_Solo_AggroBot.user.js'),'utf8');
const run3=fs.readFileSync(path.join(root,'OpenFront_AggroBot_Impossible_Run3.user.js'),'utf8');
for(const [label,script] of [['Solo',source],['Run3',run3]]){
  for(const kind of ['duo_help_expired','duo_help_accepted','duo_help_action_sent',
    'duo_help_support_observed','duo_help_action_unconfirmed',
    'duo_help_commitment_seen','attack_outcome_observed','neural_strategy_choice',
    'donation_observed','boat_unresolved','boat_delayed','build_quote']){
    assert(script.includes("'"+kind+"'"),label+' '+kind);
  }
  assert.match(script,/requestedSupportTroops/);
  assert.match(script,/estimatedArrivalTick/);
  assert.match(script,/actualTroopOutflow:'unknown'/);
  assert.match(script,/actualGoldCost:'unknown'/);
  assert.match(script,/actionId:boat\.actionId\?\?null/);
  assert.match(script,/evidence:'gameview-donate-event'/);
  assert.match(script,/const donationInterval=setInterval\(/);
  assert.match(script,/\},90\);/);
  assert.match(script,/clearInterval\(donationInterval\)/);
}
const from=source.indexOf('  function diagnosticArrival(');
const to=source.indexOf('  function duoState(){',from);
assert(from>0&&to>from,'extract direct donation observation');
const events=[],self={id:()=> 'own'};
const sandbox={
 game:{ticks:()=>100,updatesSinceLastTick:()=>({26:[]})},
 myPlayer:()=>self,safeID:p=>p?.id?.()??null,
 duoTrustedPeer:()=>({id:'ally'}),duoLocal:{peer:{state:{}}},
 diagnosticHelpId:null,diagnosticHelpSince:null,diagnosticHelpDeadline:null,
 diagnosticLastHelpAck:null,diagnosticHelpExpired:false,
 donationCapture:{polls:0,readable:0,candidates:0,matched:0,
    lastProbeTick:-Infinity,lastReceiptTick:null,lastProblem:null},
 diagnosticAid:{requestId:'h1',partnerId:'ally',actionId:'a1',tick:99,
   partnerHomeAtEmission:8000,amount:1500},
 diagnosticDonationSeen:new Map(),actionLedger:[{actionId:'a1',
   actualTroopOutflow:'unknown',effect:'unknown'}],
 monitorSession:'session',telemetry:(kind,message,data)=>events.push({kind,...data}),
 number:(fn,fallback)=>{try{const n=Number(fn());return Number.isFinite(n)?n:fallback;}
   catch{return fallback;}},
};
const functions=vm.runInNewContext('(()=>{'+source.slice(from,to)+
  ';return {diagnosticArrival,diagnosticCloseHelp,diagnosticDonationUpdates}})()',sandbox);
let eta=functions.diagnosticArrival([{troops:500},{troops:1200}]);
assert.equal(eta.estimatedArrivalTick,null,'unknown ETA must stay unknown');
eta=functions.diagnosticArrival([{arrivalTick:160},{arrivalTick:140},{troops:2}]);
assert.equal(eta.estimatedArrivalTick,140);
sandbox.game.updatesSinceLastTick=()=>({26:[{donationType:'troops',
  senderId:'own',recipientId:'ally',amount:1400n}]});
functions.diagnosticDonationUpdates();
assert.equal(events.filter(x=>x.kind==='duo_help_support_observed').length,1);
assert.equal(events.find(x=>x.kind==='duo_help_support_observed').actualTroops,'1400');
assert.equal(sandbox.actionLedger[0].actualTroopOutflow,'1400');
assert.equal(sandbox.actionLedger[0].effect,'delivered-to-recipient');
assert.equal(sandbox.donationCapture.matched,1);
assert.equal(sandbox.donationCapture.candidates,1);
functions.diagnosticDonationUpdates();
assert.equal(events.filter(x=>x.kind==='duo_help_support_observed').length,1,
  'polling same update twice must not duplicate a receipt');
sandbox.game.ticks=()=>101;
sandbox.diagnosticAid=null;sandbox.diagnosticHelpId='h2';
sandbox.game.updatesSinceLastTick=()=>({26:[{donationType:'troops',
  senderId:'ally',recipientId:'own',amount:1900n}]});
functions.diagnosticDonationUpdates();
assert.equal(events.filter(x=>x.kind==='duo_help_support_observed').length,2,
  'requester also recognizes actual peer donation');
sandbox.game.ticks=()=>102;
sandbox.game.updatesSinceLastTick=()=>({26:[{donationType:'troops',
  senderId:'other',recipientId:'own',amount:1900n}]});
functions.diagnosticDonationUpdates();
assert.equal(events.filter(x=>x.kind==='duo_help_support_observed').length,2,
  'unrelated donation cannot confirm Duo help');
sandbox.game.updatesSinceLastTick=()=>null;
functions.diagnosticDonationUpdates();
assert.equal(sandbox.donationCapture.lastProblem,'no-gameview-updates-this-poll');
sandbox.diagnosticHelpId='h3';sandbox.diagnosticHelpSince=90;
sandbox.diagnosticHelpDeadline=110;
functions.diagnosticCloseHelp('deadline',110);
assert.equal(events.at(-1).kind,'duo_help_expired');
assert.equal(events.at(-1).supportObserved,'unknown');
console.log('PASS diagnostic v2 evidence: native donation receipts, idempotency, unknown ETA, unrelated donor, expiry');
