// Select historical or modularized OpenFront source layout by its files.
// Benchmarks are always pinned to a verified exact engine SHA by common.cjs.
const fs=require('node:fs'),path=require('node:path');
const legacy={
  'src/core/GameRunner.ts':'src/core/GameRunner.ts',
  'src/core/configuration/Config.ts':'src/core/configuration/Config.ts',
  'src/core/game/Game.ts':'src/core/game/Game.ts',
  'src/core/game/TerrainMapLoader.ts':'src/core/game/TerrainMapLoader.ts',
  'src/core/EventBus.ts':'src/core/EventBus.ts',
  'src/core/Schemas.ts':'src/core/Schemas.ts',
  'src/core/Util.ts':'src/core/Util.ts',
  'src/core/game/GameUpdates.ts':'src/core/game/GameUpdates.ts'
};
const modern={
  ...legacy,
  'src/core/GameRunner.ts':'packages/engine/src/GameRunner.ts',
  'src/core/configuration/Config.ts':'packages/engine-lib/src/configuration/Config.ts',
  'src/core/game/Game.ts':'packages/engine-api/src/game/GameTypes.ts',
  'src/core/game/TerrainMapLoader.ts':'packages/engine-lib/src/game/TerrainMapLoader.ts',
  'src/core/EventBus.ts':'packages/shared/src/EventBus.ts',
  'src/core/Schemas.ts':'packages/engine-api/src/Schemas.ts',
  'src/core/Util.ts':'packages/shared/src/SharedUtil.ts',
  'src/core/game/GameUpdates.ts':'packages/engine-api/src/game/GameUpdates.ts'
};
function locate(root){
  const isModern=fs.existsSync(path.join(root,modern['src/core/GameRunner.ts']));
  const isLegacy=fs.existsSync(path.join(root,legacy['src/core/GameRunner.ts']));
  if(!isModern&&!isLegacy)throw Error('Unsupported OpenFront checkout: GameRunner not found');
  return {modern:isModern,resolve:p=>(isModern?modern:legacy)[p]||p};
}
module.exports={locate};
