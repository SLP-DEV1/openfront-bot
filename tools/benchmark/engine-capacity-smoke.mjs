// Actual pinned OpenFront Config.maxTroops integration, NOT a copied formula.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import common from './common.cjs';

const argv=process.argv.slice(2),index=argv.indexOf('--engine');
if(index<0||!argv[index+1])throw Error('--engine PATH required');
const engine=path.resolve(argv[index+1]);
const expectedIndex=argv.indexOf('--engineCommit');
const expected=expectedIndex<0?common.IMPOSSIBLE_REFERENCE_COMMIT:argv[expectedIndex+1];
if(!expected)throw Error('--engineCommit SHA required');
const engineCommit=common.engineInfo(engine,expected);
const requireEngine=createRequire(path.join(engine,'package.json'));
requireEngine('tsx/esm/api').register({tsconfig:path.join(engine,'tsconfig.json')});
const mod=p=>import(pathToFileURL(path.join(engine,p)).href);
const [{Config},{GameMapType,GameMapSize,GameMode,GameType,Difficulty,
  PlayerType,UnitType},{GameConfigSchema}]=await Promise.all([
  mod('src/core/configuration/Config.ts'),mod('src/core/game/Game.ts'),
  mod('src/core/Schemas.ts')]);
const cfg=GameConfigSchema.parse({gameMap:GameMapType.World,
  gameMapSize:GameMapSize.Compact,gameMode:GameMode.FFA,
  gameType:GameType.Singleplayer,difficulty:Difficulty.Impossible,
  nations:'disabled',bots:0,donateGold:false,donateTroops:false,
  infiniteGold:false,infiniteTroops:false,instantBuild:false,
  randomSpawn:false});
const config=new Config(cfg,null,false);
const tiles=13044;
const structure=(type,level=1,construction=false)=>({
  type:()=>type,level:()=>level,isUnderConstruction:()=>construction
});
const player=(cities=[],other=[],kind=PlayerType.Human)=>({
  type:()=>kind,numTilesOwned:()=>tiles,troops:()=>925552,
  units:(type)=>type===UnitType.City?cities:other.filter(u=>u.type()===type)
});
const cap=who=>config.maxTroops(who);
const base=player([structure(UnitType.City)]);
const capBase=cap(base);
assert(capBase>925552&&capBase<960000,'Russia plateau cap');
assert.equal(cap(player([structure(UnitType.City)],
  [structure(UnitType.Factory),structure(UnitType.Port)])),capBase,
  'Factory and Port must not alter troop capacity');
assert.equal(cap(player([structure(UnitType.City),
  structure(UnitType.City,1,true)])),capBase,
  'unfinished City must not increase capacity');
assert.equal(cap(player([structure(UnitType.City),structure(UnitType.City)]))-
  capBase,config.cityTroopIncrease(),
  'finished City must add official level increment');
assert.equal(cap(player([structure(UnitType.City,2)]))-capBase,
  config.cityTroopIncrease(),'City upgrade must add official increment');
assert.equal(cap(player([structure(UnitType.City)],[],PlayerType.Bot)),
  capBase/3,'official Bot type has a different multiplier');
assert(config.troopIncreaseRate(player([structure(UnitType.City,2)]))>
  config.troopIncreaseRate(base),'real cap relief should improve growth');
console.log('PASS official pinned Config.maxTroops / troopIncreaseRate '+engineCommit+
  ' Russia cap='+Math.round(capBase)+' City increment='+
  config.cityTroopIncrease()+'; no full GameRunner building simulated');
