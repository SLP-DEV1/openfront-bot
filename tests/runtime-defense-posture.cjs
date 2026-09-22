'use strict';
// Phase 2 (S3): defense posture state machine unit tests.
// Covers signal gating (relative evidence, corroboration), the 60-tick
// stabilization exit, the 120/900-tick recovery bounds, and the strict
// escalation order. Pure module import — no browser globals needed.
const assert=require('node:assert/strict');
const {DEFENSE_POSTURES,POSTURE_CONSTANTS,postureSignals,postureStep}=
  require('../src/runtime/defense-posture.cjs');

let tick=1000;
const calm={incoming:0,home:10000,landLoss:0,crisis:false,pressure:false};
const sigAt=(overrides)=>Object.assign({
  incoming:0,home:10000,strongest:0,landLoss:0,crisis:false,
  pressure:false},overrides);
const step=(state,prev,sig)=>postureStep(
  prev?{state,entered:prev.entered,stableSince:prev.stableSince}:
  {state,entered:0},sig,tick++);

// Postures exist exactly as the strategy requires.
assert.deepEqual(DEFENSE_POSTURES,['NORMAL','THREATENED','CRITICAL',
  'RECOVERING'],'posture names and order');

// --- Signal gating ---------------------------------------------------
assert.equal(postureSignals(sigAt({incoming:1200000,home:1500000,
  strongest:900000,landLoss:.2})).signals.join('+'),
  'S1-ratio-overwhelm+S2-relative-loss+S3-mega-attack',
  '1M+ incoming with 80% ratio and land loss corroborates S3');
assert.equal(postureSignals(sigAt({incoming:1100000,home:15000000,
  strongest:3000,landLoss:0})).signals.length,0,
  '1M absolute troops alone is NOT a critical signal (relative 7.3%)');
assert.equal(postureSignals(sigAt({incoming:1100000,home:5000000,
  strongest:6000000,landLoss:0})).signals.join(),'S3-mega-attack',
  '1M+ with a strongest army above the home base corroborates S3');
assert.equal(postureSignals(sigAt({incoming:1100000,home:10000000,
  strongest:3000,landLoss:0,crisis:true})).signals.length,0,
  'mega attack without land loss, 12%+ ratio, or strongest evidence stays quiet');

// --- NORMAL -> CRITICAL (immediate) -----------------------------------
let s=step('NORMAL',null,calm);
assert.equal(s.state,'NORMAL');
s=step('NORMAL',s,sigAt({incoming:1200000,home:10000,landLoss:.1}));
assert.equal(s.state,'CRITICAL',
  'mega attack with 12000% ratio enters CRITICAL immediately');
assert.ok(s.reason.length>0);

// --- CRITICAL exit: 59 calm ticks are NOT enough -----------------------
let c=postureStep({state:'CRITICAL',entered:0,stableSince:null},
  sigAt({}),tick++);
for(let i=0;i<59;i++)c=postureStep(c,sigAt({}),tick++);
assert.equal(c.state,'CRITICAL',
  'stabilization below '+POSTURE_CONSTANTS.CRITICAL_EXIT_TICKS+' ticks holds');
assert.equal(c.stableSince,tick-59-1,
  'stabilization clock starts on the first calm tick');
c=postureStep(c,sigAt({}),tick++);
assert.equal(c.state,'RECOVERING',
  '60 confirmed stabilization ticks move CRITICAL -> RECOVERING');

// A new critical signal during stabilization re-arms CRITICAL.
let s2=postureStep({state:'CRITICAL',entered:0,stableSince:tick-30},{},
  tick);
for(let i=0;i<30;i++)s2=postureStep(s2,sigAt({}),tick++);
assert.equal(s2.state,'CRITICAL');
s2=postureStep(s2,sigAt({incoming:1300000,home:10000,landLoss:.1}),tick++);
assert.equal(s2.state,'CRITICAL');
assert.equal(s2.stableSince,null,
  'new critical evidence resets the stabilization clock');

// CRITICAL de-escalates via stabilization, never directly to NORMAL.
const crit60=postureStep({state:'CRITICAL',entered:0,
  stableSince:tick-60},sigAt({incoming:3000,home:10000,strongest:500,
  landLoss:.005}),tick++);
assert.equal(crit60.state,'RECOVERING',
  'CRITICAL with only relative pressure exits to RECOVERING after '+
  POSTURE_CONSTANTS.CRITICAL_EXIT_TICKS+' stable ticks');

// --- RECOVERING: hard 900-tick bound -----------------------------------
let r={state:'RECOVERING',entered:tick-1,stableSince:null};
for(let i=0;i<899;i++)r=postureStep(r,sigAt({incoming:100,home:100000,
  strongest:120,pressure:true}),tick++);
assert.equal(r.state,'RECOVERING',
  '899 ticks of low pressure still recover');
r=postureStep(r,sigAt({incoming:100,home:100000,strongest:120,
  pressure:true}),tick++);
assert.equal(r.state,'NORMAL',
  'RECOVER_MAX_TICKS=900 forces NORMAL even under lingering pressure');

// RECOVERING with a critical signal escalates straight back to CRITICAL.
let back={state:'RECOVERING',entered:tick,stableSince:null};
for(let i=0;i<5;i++)back=postureStep(back,sigAt({}),tick++);
back=postureStep(back,sigAt({incoming:1200000,home:10000,landLoss:.1,
  crisis:true}),tick++);
assert.equal(back.state,'CRITICAL',
  'crisis during recovery re-enters CRITICAL');
assert.equal(back.entered,tick-1);

// --- Escalation order is strict ----------------------------------------
assert.equal(step('NORMAL',null,sigAt({incoming:3000,home:10000,
  strongest:500,landLoss:.04})).state,'THREATENED',
  '30% ratio with small land loss is THREATENED, not CRITICAL');
assert.equal(step('THREATENED',null,sigAt({incoming:1200000,
  home:10000,landLoss:.1})).state,'CRITICAL',
  'THREATENED escalates to CRITICAL on corroborated mega evidence');
assert.equal(step('RECOVERING',null,sigAt({incoming:3000,home:10000,
  strongest:500,landLoss:.04})).state,'RECOVERING',
  'RECOVERING under relative pressure keeps vigilance');

// --- State entry clock semantics ---------------------------------------
const before={state:'NORMAL',entered:0,stableSince:null};
const t0=5000;
const toCrit=postureStep(before,sigAt({incoming:1200000,home:10000,
  landLoss:.1}),t0);
assert.equal(toCrit.entered,t0,'CRITICAL entry stores its tick');
let toRec=postureStep(toCrit,sigAt({}),t0);
for(let i=1;i<=60;i++)toRec=postureStep(toRec,sigAt({}),t0+i);
assert.equal(toRec.state,'RECOVERING',
  'RECOVERING starts 60 ticks after CRITICAL entry under calm');
assert.equal(toRec.entered,t0+60,'RECOVERING starts a fresh recovery clock');
const backToCrit=postureStep(toRec,sigAt({incoming:1300000,
  home:10000,landLoss:.1}),toRec.entered+1);
assert.equal(backToCrit.entered,toRec.entered+1);

// Reason strings are stable for UI display.
assert.match(postureStep(before,sigAt({incoming:1200000,home:10000,
  landLoss:.1}),t0).reason,/kritische Signale/i);

console.log('PASS defense-posture: signals, 60-tick stabilization, '+
  '900-tick recovery bound, strict escalation, entry clocks');
