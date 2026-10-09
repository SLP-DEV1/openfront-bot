'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../OpenFront_Solo_AggroBot.user.js'),'utf8');
const i=source.indexOf('  function duoStatusView('),j=source.indexOf('  function duoTrustedPeer(){',i);
assert(i>=0&&j>i,'Duo status code must be present in delivered Solo userscript');
const fn=vm.runInNewContext('('+source.slice(i,j).trim()+')');
const stats={relayDrops:0,seenPeer:false};
const plan={planId:'plan1',partnerAck:false,ready:false,expiresTick:250};
const check=(enabled,peer,plan,tick,stats,want)=>
  assert.equal(fn(enabled,peer,plan,tick,stats).phase,want);
check(false,null,null,0,stats,'off');
check(true,null,null,0,stats,'waiting-ack');
check(true,null,null,0,{relayDrops:1,seenPeer:true},'autonomous-fallback');
check(true,{id:'partner'},plan,200,stats,'waiting-ack');
check(true,{id:'partner'},{...plan,partnerAck:true,ready:true},200,stats,'ready');
check(true,{id:'partner'},plan,251,stats,'expired');
check(true,{id:'partner'},{...plan,partnerAck:true,ready:true},251,stats,'expired');
assert(source.includes('duoLocal.relayDrops=0;duoLocal.relayTimeouts=0;duoLocal.ackTimeouts=0;'));
assert(source.includes('duoLocal.relayDrops++'));
assert(source.includes("if(e?.name==='AbortError')duoLocal.relayTimeouts++"));
assert(source.includes('duoLocal.ackTimeouts++'));
assert(source.includes('duoLocal.lastExpiredPlan!==duoPlan.planId'),
 'timeout counts must be de-duplicated per plan');
assert(source.includes('Duo state: ${enHTML(duoStatusView('));
console.log('PASS Duo ready, waiting-ack, expired and autonomous fallback without intent influence');
