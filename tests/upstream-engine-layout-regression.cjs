const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {locate}=require('../tools/benchmark/engine-layout.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'aggrobot-upstream-'));
try{
  assert.throws(()=>locate(root),/GameRunner not found/);
  fs.mkdirSync(path.join(root,'src/core'),{recursive:true});
  fs.writeFileSync(path.join(root,'src/core/GameRunner.ts'),'');
  assert.equal(locate(root).modern,false);
  assert.equal(locate(root).resolve('src/core/Schemas.ts'),'src/core/Schemas.ts');
  fs.mkdirSync(path.join(root,'packages/engine/src'),{recursive:true});
  fs.writeFileSync(path.join(root,'packages/engine/src/GameRunner.ts'),'');
  assert.equal(locate(root).modern,true);
  assert.equal(locate(root).resolve('src/core/Schemas.ts'),'packages/engine-api/src/Schemas.ts');
  assert.equal(locate(root).resolve('src/core/game/Game.ts'),'packages/engine-api/src/game/GameTypes.ts');
  console.log('PASS legacy + current OpenFront module path mapping');
}finally{fs.rmSync(root,{recursive:true,force:true});}
