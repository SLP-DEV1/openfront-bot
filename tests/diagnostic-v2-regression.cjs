'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'OpenFront_Solo_AggroBot.user.js'),'utf8');
const run3=fs.readFileSync(path.join(root,'OpenFront_AggroBot_Impossible_Run3.user.js'),'utf8');
for(const [name,script] of [['Solo',source],['Run3',run3]]){
  assert.match(script,/const diagnosticV2=\{schemaVersion:2,critical:\[\]/,name+' v2 journal');
  assert.match(script,/diagnosticCritical\(record\)/,name+' critical recording');
  assert.match(script,/diagnosticDuoTransition\(duoLocal\.status,data\.partner/,name+' peer transition');
  assert.match(script,/diagnosticDuoTransition\(duoLocal\.status,null,reason\)/,name+' relay failure');
  assert.match(script,/personalEliminationTick:gameEnd\?\.personalEliminated\?gameEnd\.tick:null/,name+' personal elimination');
  assert.match(script,/matchEndTick:game\?\.gameOver\?\.\(\)/,name+' match end');
  assert.match(script,/dropped:diagnosticV2\.dropped/,name+' overflow accounting');
  assert.match(script,/sessionStorage\.setItem\('aggrobot-diagnostic-v2-meta'/,name+' tab checkpoint');
  assert.match(script,/indexedDB\.open\('aggrobot-diagnostic-v2',1\)/,name+' full IndexedDB journal');
  assert.match(script,/\['events\.jsonl',jsonl\(sorted\)\]/,name+' full event stream');
  assert.match(script,/\['snapshots\.jsonl',jsonl\(snapshot\)\]/,name+' snapshot stream');
  assert.match(script,/\['duo\.jsonl',jsonl\(duo\)\]/,name+' duo stream');
  assert.match(script,/diagnosticZip\(files\)/,name+' single ZIP');
  assert.match(script,/void exportDiagnosticPackage\(true\)/,name+' automatic end export');
}
console.log('PASS diagnostic v2 journal, identity, duo transitions and Run3 parity markers');
