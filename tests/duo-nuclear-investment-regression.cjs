'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {duoNuclearInvestmentKernel:policy}=
  require('../src/runtime/decision-kernels.cjs');
const root=path.resolve(__dirname,'..');
const base={ownId:'a',peerId:'b',peerValid:false,peerCoreReady:false,
  peerSilos:0,coreReady:true,siloAllowed:true,late:true,land:3000,
  peerNuclearProtocol:1,peerSiloReady:false,siloSiteBlocked:false,
  silos:0,ownSAM:0,nukeShots:0,antiNuke:true,enemySilos:1,
  incomingNukes:0,uncovered:6,proactiveSAM:true,
  samSearchBlocked:false,urgentVictory:false};
const run=x=>policy({...base,...x});
let x=run({});
assert.equal(x.primary,true);
assert.equal(x.wantedSAM,1,'build initial guard, not three early launchers');
assert.equal(x.firstGuard,true);
assert.equal(x.siloFundActive,false,'first guard can precede first silo');
x=run({coreReady:false});
assert.equal(x.wantedSAM,0,'no speculative SAM before second City/Factory');
assert.equal(x.firstGuard,false,'visible enemy silo is not an inbound strike');
assert.equal(x.samFundingUrgent,false);
assert.equal(x.firstSiloWindow,false);
x=run({coreReady:false,enemySilos:20,uncovered:21,proactiveSAM:true});
assert.equal(x.wantedSAM,0,'multiple visible silos do not delay economic core');
x=run({coreReady:false,incomingNukes:1});
assert.ok(x.wantedSAM>=1,'observed inbound nuke bypasses core milestone');
assert.equal(x.samFundingUrgent,true);
x=run({ownSAM:1});
assert.equal(x.wantedSAM,0,'visible enemy silo cannot repeatedly displace first silo');
assert.equal(x.firstSiloWindow,true);
assert.equal(x.siloFundActive,true);
assert.equal(x.samFundingUrgent,false,'static threat does not get emergency SAM fund');
assert.equal(x.samUpgradeAllowed,false,'no speculative SAM upgrades before first shot');
x=run({ownSAM:1,incomingNukes:2});
assert.equal(x.siloFundActive,false,'real inbound nuke overrides silo savings');
assert.ok(x.wantedSAM>1,'inbound missile permits additional interception');
assert.equal(x.samFundingUrgent,true);
assert.equal(x.samUpgradeAllowed,true);
x=run({ownSAM:0,antiNuke:false});
assert.equal(x.wantedSAM,0);
assert.equal(x.firstGuard,false);
assert.equal(x.siloFundActive,true,'disabled SAM never deadlocks silo fund');
x=run({ownSAM:0,samSearchBlocked:true});
assert.equal(x.firstGuard,false);
assert.equal(x.siloFundActive,true,'repeatedly unavailable first guard cannot deadlock silo');
x=run({ownSAM:1,uncovered:0});
assert.equal(x.wantedSAM,0,'allied SAM coverage can satisfy our own assets');
assert.equal(x.siloFundActive,true);
x=run({ownSAM:1,peerValid:true,peerCoreReady:true,peerSiloReady:true,
  ownId:'z',peerId:'a'});
assert.equal(x.primary,false);
assert.equal(x.firstSiloWindow,false,'secondary partner defers first silo');
assert.ok(x.wantedSAM<=2,'secondary defends rather than duplicating tech opening');
x=run({ownSAM:1,peerValid:true,peerCoreReady:true,
  ownId:'z',peerId:'a',peerSilos:1,peerSiloReady:true});
assert.equal(x.firstSiloWindow,true,'secondary unlocks silo once primary owns one');
x=run({ownSAM:1,peerValid:true,peerCoreReady:false,
  ownId:'z',peerId:'a'});
assert.equal(x.primary,true,'core-ready peer takes tech lead over unready peer');
x=run({ownSAM:1,peerValid:true,peerCoreReady:true,
  ownId:'z',peerId:'a',incomingNukes:1,peerSiloReady:true});
assert.equal(x.samFundingUrgent,true,'defensive emergency independent of tech role');
x=run({ownSAM:1,urgentVictory:true});
assert.equal(x.siloFundActive,false);
x=run({ownSAM:1,silos:1});
assert.equal(x.wantedSAM,1,'first rocket remains funded after silo purchase');
assert.equal(x.samUpgradeAllowed,false);
x=run({ownSAM:1,silos:1,nukeShots:1});
assert.ok(x.wantedSAM>=2,'routine protection can resume after observed first shot');
assert.equal(x.samUpgradeAllowed,true);
x=run({ownSAM:1,peerValid:false,peerCoreReady:true});
assert.equal(x.firstSiloWindow,true,'untrusted/stale relay must never block solo');
// Different viewpoints use the same ready flags, so exactly one first-silo
// leader emerges even when City or Factory is disabled by the game config.
for(const [ownId,peerId] of [['a','b'],['b','a']]){
  const elected=run({ownSAM:1,peerValid:true,peerSiloReady:true,ownId,peerId});
  assert.equal(elected.primary,ownId==='a');
  assert.equal(elected.firstSiloWindow,ownId==='a');
}
x=run({ownSAM:1,peerValid:true,peerSiloReady:false,ownId:'z',peerId:'a'});
assert.equal(x.firstSiloWindow,true,'ready secondary takes over from unready primary');
x=run({ownSAM:1,peerValid:true,peerSiloReady:true,ownId:'a',peerId:'z',land:700});
assert.equal(x.firstSiloWindow,false,'small local territory yields silo role');
x=run({ownSAM:1,peerValid:true,peerSiloReady:true,ownId:'a',peerId:'z',siloAllowed:false});
assert.equal(x.firstSiloWindow,false,'disabled local silo cannot claim funds');
x=run({ownSAM:1,peerValid:true,peerSiloReady:true,ownId:'a',peerId:'z',siloSiteBlocked:true});
assert.equal(x.firstSiloWindow,false,'observed site failure yields role');
x=run({ownSAM:1,peerValid:true,peerSiloReady:false,ownId:'z',peerId:'a',siloSiteBlocked:false});
assert.equal(x.firstSiloWindow,true,'expired site backoff permits retry');
x=run({ownSAM:1,peerValid:true,peerNuclearProtocol:null,ownId:'a',peerId:'z'});
assert.equal(x.firstSiloWindow,false,'legacy peer readiness unknown, not false');
x=run({ownSAM:1,peerValid:true,peerNuclearProtocol:null,ownId:'a',peerId:'z',peerSilos:1});
assert.equal(x.firstSiloWindow,true,'confirmed peer silo unlocks follow-on');
const duo=fs.readFileSync(path.join(root,'src/userscript/10-duo-and-diagnostics.js'),'utf8');
assert.match(duo,/nuclearProtocol:1,coreReady,siloReady/);
assert.match(duo,/cfg\?\.isUnitDisabled\?\.\('Factory'\)===true\|\|factories>=2/);
const econ=fs.readFileSync(path.join(root,'src/userscript/30-economy-and-defense.js'),'utf8');
assert.match(econ,/peerSiloReady:peer\?\.state\?\.siloReady===true/);
assert.doesNotMatch(econ,/peerCoreReady:!!\(peer&&peer\.state\?\.cities/);
const runner=fs.readFileSync(path.join(root,'src/userscript/40-economy-runner.js'),'utf8');
assert.match(econ,/const wantedSAM=duoNuclear\.wantedSAM/);
assert.match(econ,/const coreComplete=\(!cityEnabled\|\|cities>=2\)/);
assert.match(econ,/\(coreComplete\|\|failedEconomyProbes>=8\)/);
assert.match(econ,/factories<2&&basic\?340:0/);
assert.match(econ,/cities<2&&basic\?310:0/);
assert.match(econ,/const saveForSilo=duoNuclear\.siloFundActive/);
assert.match(econ,/const samFund=duoNuclear\.samFundingUrgent/);
assert.match(econ,/const samFund=needs\.samFundingUrgent/);
assert.match(econ,/purpose==='Warship'&&needs\.saveForSilo|needs\.saveForSilo\|\|needs\.saveForNuke/);
assert.match(runner,/const urgentSAMChoice=requirements\.samFundingUrgent/);
assert.match(runner,/item\.type==='Missile Silo'&&requirements\.saveForSilo/);
assert.match(runner,/telemetry\('silo_seen'/);
assert.match(runner,/duoSiloBlockedUntil=Math\.max\(duoSiloBlockedUntil,tick\+180\)/);
assert.match(runner,/probe\.siloUnderfunded===0&&probe\.errors===0/);
assert.match(runner,/launchSiloIds:p\.siloIds/);
console.log('DUO_NUCLEAR_INVESTMENT_PASS readiness symmetry, site failover, legacy and integrated gates');
