'use strict';
// Reference-formula regression, NOT an integrated OpenFront engine test.
// Source: OpenFrontIO commit 7c27263390d8f1976566e5c5ad9adf6fcad311b6
// src/core/configuration/Config.ts lines 355-356, 1021-1052, 1055-1086.
// Keep this independent of the AggroBot implementation to detect invented
// Factory/Port capacity effects; integrated engine verification remains P0 open.
const assert=require('node:assert/strict');
const PIN='7c27263390d8f1976566e5c5ad9adf6fcad311b6';
function referenceMaxTroops({
  tiles,cityLevels=[],unfinishedCityLevels=[],factoryLevels=[],portLevels=[],
  playerType='Human',difficulty='Impossible',infiniteTroops=false
}){
  assert(Number.isSafeInteger(tiles)&&tiles>=0);
  const sum=cityLevels.reduce((a,b)=>a+b,0);
  const base=infiniteTroops&&playerType==='Human'?1_000_000_000:
    2*(Math.pow(tiles,.6)*1000+50000)+sum*250000;
  if(playerType==='Bot')return base/3;
  if(playerType==='Human')return base;
  const multiplier={Easy:.5,Medium:.75,Hard:1,Impossible:1.25}[difficulty];
  assert(Number.isFinite(multiplier));
  return base*multiplier;
}
const base={tiles:13044,cityLevels:[1],factoryLevels:[1]};
const cap=referenceMaxTroops(base);
assert(cap>925552,'Russia snapshot needs to be near capacity');
assert(cap<960000,'wrong map/city level conversion');
assert.equal(referenceMaxTroops({...base,factoryLevels:[1,2,3]}),cap,
  'Factories do not appear in the capacity formula');
assert.equal(referenceMaxTroops({...base,portLevels:[1,4]}),cap,
  'Ports do not appear in the capacity formula');
assert.equal(referenceMaxTroops({...base,unfinishedCityLevels:[1]}),cap,
  'Under-construction cities do not appear in the capacity formula');
assert(Math.abs(referenceMaxTroops({...base,cityLevels:[1,1]})-cap-250000)<1e-6,
  'Completed City level adds 250000 engine troops for Humans');
assert(Math.abs(referenceMaxTroops({...base,cityLevels:[2]})-cap-250000)<1e-6,
  'One completed City upgrade adds 250000 engine troops');
assert(referenceMaxTroops({...base,tiles:base.tiles+800})>cap,
  'Owned territory increases capacity');
assert.equal(referenceMaxTroops({...base,playerType:'Bot'}),cap/3);
assert.equal(referenceMaxTroops({...base,playerType:'Nation',
  difficulty:'Impossible'}),cap*1.25);
const currentGrowth=Math.max(0,10+Math.pow(925552,.73)/4)*(1-925552/cap);
const grownCap=cap+250000;
const expandedGrowth=Math.max(0,10+Math.pow(925552,.73)/4)*
  (1-925552/grownCap);
assert(expandedGrowth>currentGrowth,
  'Growth rate rises when a real cap increase relieves saturation');
console.log('PASS capacity reference formula '+PIN+
  ' (NOT engine integration): '+Math.round(cap)+' engine troops');
module.exports={referenceMaxTroops,PIN};
