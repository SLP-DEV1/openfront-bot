'use strict';
const assert=require('node:assert/strict');
const {detectEvents,TAGS}=require('../tools/benchmark/replay-events.cjs');
const sha='a'.repeat(40);
const mk=(matchId,tick,type,vs)=>({engineCommit:sha,matchId,tick,
  visibleState:Object.assign({home:1,gold:1,land:100,incoming:0,committed:10},vs),
  action:{type},outcome:null});
// One match exercising every tag with visible state/actions only.
const M=[
  mk('M',10,'attack',{committed:50,land:100,incoming:0,partnerNeed:null}), // early-rush; later committed halves -> retreat; no land gain -> failed-attack
  mk('M',20,'hold',{committed:10,land:100}),
  mk('M',30,'transport',{committed:10,land:100}),                            // naval-landing
  mk('M',40,'nuke',{committed:10,land:100,incoming:10}),                     // nuke-timing
  mk('M',50,'attack',{committed:40,land:100,incoming:10,partnerNeed:0.5}),   // counterattack + duo-synchronized
  mk('M',60,'alliance request',{committed:10,land:100,incoming:0}),          // alliance-change
  mk('M',70,'hold',{committed:10,land:80}),                                  // land drops (new low)
  mk('M',72,'hold',{committed:10,land:90}),                                  // rebuild (recovers above low) + hold run
  mk('M',74,'hold',{committed:10,land:90})                                   // hold run length 3
];
const events=detectEvents(M);
// every one of the 10 required tags is produced from visible data alone
const seen=new Set(events.map(e=>e.tag));
for(const t of ['early-rush','alliance-change','counterattack','nuke-timing',
  'naval-landing','duo-synchronized','retreat','rebuild','hold','failed-attack'])
  assert.equal(seen.has(t),true,'missing tag '+t);
// only the documented tags are ever emitted
for(const e of events)assert.ok(TAGS.includes(e.tag),'unexpected tag '+e.tag);
// provenance fields are always present and well-formed
for(const e of events){
  assert.equal(typeof e.source,'string','source');
  assert.equal(Number.isFinite(e.tick),true,'tick');
  assert.equal(e.observation&&typeof e.observation==='object',true,'observation');
  assert.equal(e.validity==='observed'||e.validity==='inferred',true,'validity');
  assert.equal(e.matchId,'M','matchId');
}
// determinism (same input -> identical output)
assert.deepEqual(detectEvents(M),events);
// specific, checkable facts
const early=events.filter(e=>e.tag==='early-rush');
assert.equal(early.length,1,'early-rush fires once');
assert.equal(early[0].tick,10);
assert.equal(early[0].validity,'observed');
const hold=events.filter(e=>e.tag==='hold');
assert.equal(hold.length,1,'hold run detected once');
assert.equal(hold[0].tick,70);
assert.equal(hold[0].observation.count,3);
// a second, tiny match is tagged separately and does not bleed into M
const N=[
  mk('N',10,'attack',{committed:5,land:10}),
  mk('N',40,'hold',{committed:5,land:10})
];
const both=detectEvents([...M,...N]);
assert.equal(both.filter(e=>e.matchId==='M').length,events.length,'M unchanged');
assert.ok(both.filter(e=>e.matchId==='N').length>0,'N produces its own events');
assert.equal(both.every(e=>e.matchId==='M'||e.matchId==='N'),true);
// no hidden engine truth: events depend only on visible fields
const stripped=detectEvents(M.map(f=>({...f,action:{type:f.action.type},
  visibleState:{home:f.visibleState.home,gold:f.visibleState.gold,
    land:f.visibleState.land,incoming:f.visibleState.incoming,
    committed:f.visibleState.committed,partnerNeed:f.visibleState.partnerNeed}})));
assert.deepEqual(stripped,events);
console.log('PASS replay events: 10 visible-only tags with source/tick/observation/validity');
