'use strict';
// P1 (plan.md box: separate 1v1/FFA/2v2 protocols; rotate map, position,
// team-partner, profile, seed; no undifferentiated overall rate). Verifies
// createLeaguePlan separates the three protocols, rotates candidate seat and
// partner seat, covers both maps, and keeps the observation unit the match.
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
  const {createLeaguePlan}=await import(pathToFileURL(
    path.join(__dirname,'..','tools','benchmark','league-plan.mjs')).href);
  const base={botCommit:'a'.repeat(40),engineCommit:'b'.repeat(40),
    seeds:['s1','s2'],maps:['World','Europe'],
    modes:['1v1','official-2v2','ffa-duo'],candidate:'run3'};
  const plan=createLeaguePlan(base);
  // Getrennte Protokolle: korrekte Teilnehmerzahl je Modus.
  const byMode=mode=>plan.matches.filter(m=>m.mode===mode);
  assert.equal(byMode('1v1').every(m=>m.participantClients.length===2),true);
  assert.equal(byMode('official-2v2').every(m=>m.participantClients.length===4),true);
  assert.equal(byMode('ffa-duo').every(m=>m.participantClients.length===3),true);
  // Position-Rotation: Kandidatensitz variiert über 2v2-Matches.
  const seats=new Set(byMode('official-2v2').map(m=>m.candidateSeat));
  assert.ok(seats.size>1,'candidate seat must rotate across 2v2 matches');
  // Teampartner-Rotation: Partner variiert und sitzt nie auf dem Kandidatensitz.
  const partnerSeats=new Set(byMode('official-2v2').map(m=>m.partnerSeat));
  assert.ok(partnerSeats.size>1,'partner seat must rotate');
  assert.ok(byMode('official-2v2').every(m=>
    m.partnerSeat!==m.candidateSeat &&
    m.participantClients[m.candidateSeat].role==='candidate' &&
    m.participantClients[m.partnerSeat].role==='partner'),
    'team roles: candidate and partner occupy distinct seats');
  // 1v1 hat keinen Teampartner.
  assert.ok(byMode('1v1').every(m=>m.partnerSeat===null &&
    m.participantClients[m.candidateSeat].role==='candidate'));
  // Karten-Rotation: beide Karten werden belegt.
  assert.deepEqual([...new Set(plan.matches.map(m=>m.map))].sort(),
    ['Europe','World']);
  // Beobachtungseinheit bleibt Match; keine gepoolte Gesamtquote; kein Ergebnis.
  assert.equal(plan.observationUnit,'match');
  assert.equal(plan.promotion.unknownIsNotLoss,true);
  assert.ok(plan.matches.every(m=>m.result===null&&m.observedOutcome==='unknown'));
  // Alle Rotationsdimensionen sind deklariert.
  for(const k of ['seed','map','opponent','seat','partnerSeat'])
    assert.ok(plan.promotion.rotate.includes(k),'missing rotation dimension '+k);
  console.log('PASS P1 league protocol, position/partner rotation and per-protocol observation');
})().catch(e=>{console.error(e);process.exitCode=1;});
