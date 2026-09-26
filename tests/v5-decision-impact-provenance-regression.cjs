'use strict';
const assert=require('node:assert/strict');
const {
  validateScenarioProvenance,
  validateArmIdentityAcrossScenarios
}=require('../tools/benchmark/v5-decision-impact.cjs');

const sid='scenario-1';
const arms=['rule-basis','run3-schema4','schema-5','hybrid'];
const config={
  gameMap:'Europe',difficulty:'Medium',gameType:'Singleplayer',
  gameMode:'Free For All',gameMapSize:'Compact',nations:2,bots:2
};
function row(overrides={}){
  return {
    seed:'seed-1',engineCommit:'engine-1',
    gameMap:'Europe',gameMapSize:'Compact',gameMode:'Free For All',
    opponentProfile:'balanced',scriptedHumans:1,profile:'autonomous',
    harness:'engine-gameview-v2',trajectorySemantics:'gameview-hostile-only-v1',
    gameConfig:config,candidateControl:null,candidateGain:null,controlMode:null,
    botSHA256:'bot-basis',policySHA256:null,endLand:100,...overrides
  };
}
function validRows(){
  return {
    'rule-basis':row(),
    'run3-schema4':row({policySHA256:'policy-run3'}),
    'schema-5':row({botSHA256:'bot-v5',policySHA256:'policy-v5',
      candidateControl:true,candidateGain:18}),
    hybrid:row({botSHA256:'bot-v5',policySHA256:'policy-hybrid',
      candidateControl:true,candidateGain:18})
  };
}
function manifest(){
  const rows=validRows();
  return {
    engineCommit:'engine-1',
    arms,
    scenarios:[{scenarioId:sid,matchSeed:'seed-1',mode:'1v1',
      map:'Europe',opponent:'balanced'}],
    rows:arms.map(arm=>({
      scenarioId:sid,arm,matchSeed:'seed-1',
      botSHA256:rows[arm].botSHA256,policySHA256:rows[arm].policySHA256
    }))
  };
}
function clone(v){return structuredClone(v);}

assert.doesNotThrow(()=>validateScenarioProvenance(
  sid,arms,validRows(),manifest()));

{
  const rows=validRows(); rows['schema-5'].seed='different-seed';
  assert.throws(()=>validateScenarioProvenance(sid,arms,rows,manifest()),
    /mismatched seed/);
}
{
  const rows=validRows(); rows.hybrid.engineCommit='different-engine';
  assert.throws(()=>validateScenarioProvenance(sid,arms,rows,manifest()),
    /mismatched engineCommit/);
}
{
  const rows=validRows(); rows.hybrid.gameMap='World';
  assert.throws(()=>validateScenarioProvenance(sid,arms,rows,manifest()),
    /mismatched gameMap/);
}
{
  const rows=validRows(); delete rows.hybrid;
  assert.throws(()=>validateScenarioProvenance(sid,arms,rows,manifest()),
    /missing requested arms/);
}
{
  const rows=validRows(); rows['schema-5'].policySHA256='wrong-policy';
  assert.throws(()=>validateScenarioProvenance(sid,arms,rows,manifest()),
    /policySHA256 differs from capture manifest/);
}
{
  const rows=validRows(); rows['schema-5'].candidateControl=false;
  assert.throws(()=>validateScenarioProvenance(sid,arms,rows,manifest()),
    /must enable candidate control/);
}
{
  const rows1=validRows(),rows2=clone(rows1);
  assert.doesNotThrow(()=>validateArmIdentityAcrossScenarios([
    {perArm:rows1},{perArm:rows2}
  ],arms));
  rows2.hybrid.botSHA256='drifted-bot';
  assert.throws(()=>validateArmIdentityAcrossScenarios([
    {perArm:rows1},{perArm:rows2}
  ],arms),/botSHA256 drifted across scenarios/);
}

console.log('v5 decision-impact provenance regression: ok');
