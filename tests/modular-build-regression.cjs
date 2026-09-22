'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {files,assemble}=require('../tools/build-userscript.cjs');
const {duoStatusView,evidencePanelState}=require('../src/runtime/panel-state.cjs');
const {sampleVisible,trajectory,SEMANTICS}=require('../tools/benchmark/trajectory.cjs');
assert.equal(files.length,6);
assert.equal(assemble(),fs.readFileSync(
 path.join(root,'OpenFront_Solo_AggroBot.user.js'),'utf8'),
 'modular canonical sources must generate EXACT same Solo output');
const check=spawnSync(process.execPath,['tools/build-userscript.cjs','--check'],
 {cwd:root,encoding:'utf8'});
assert.equal(check.status,0,check.stderr||check.stdout);
assert.equal(duoStatusView(false,null,null,0,{}).phase,'off');
assert.equal(evidencePanelState(null,null,null,0,[],null).workerAge,null);
const me={hasSpawned:()=>true,clientID:()=> 'me',
 numTilesOwned:()=>1,troops:()=>100,gold:()=>100,isFriendly:()=>false};
const enemy={clientID:()=> 'foe',numTilesOwned:()=>2,
 troops:()=>200,isAlive:()=>true};
const samples=[];
sampleVisible(samples,1,me,[me,enemy]);
sampleVisible(samples,1,me,[me,enemy]);
assert.equal(samples.length,1);
assert.equal(trajectory(samples).summary.finalEnemyLand,2);
assert.equal(SEMANTICS,'gameview-hostile-only-v1');
console.log('PASS canonical 6-source byte-parity, direct runtime selector imports and shared benchmark module');
