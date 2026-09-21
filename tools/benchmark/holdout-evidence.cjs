'use strict';
// Evidence is trusted only when tied to the exact process, model, bot, engine,
// config and a successful exit. Never infer success from a report alone.
const fs=require('node:fs'),path=require('node:path');
const {isDeepStrictEqual}=require('node:util');
const common=require('./common.cjs');
const hex64=/^[a-f0-9]{64}$/;
function requireEqual(actual,expected,name){
  if(!isDeepStrictEqual(actual,expected))throw Error(name+' mismatch');
}
function verifyEvidence(meta,report,expected,exitCode){
  if(exitCode!==0)throw Error('Benchmark process failed: '+String(exitCode));
  if(!meta||!report?.benchmarkMeta||!expected)throw Error('Missing benchmark evidence');
  const proof=report.benchmarkMeta;
  if(!hex64.test(expected.policySHA256)||!hex64.test(expected.botSHA256))
    throw Error('Missing or malformed expected hashes');
  for(const field of ['policySHA256','botSHA256']){
    if(!hex64.test(meta[field])||!hex64.test(proof[field]))
      throw Error('Missing or malformed '+field);
    requireEqual(meta[field],expected[field],field+' run');
    requireEqual(proof[field],expected[field],field+' report');
  }
  for(const field of ['engineCommit','seed','profile','opponentProfile',
    'scriptedHumans','maxTicks']){
    requireEqual(meta[field],expected[field],field+' run');
    requireEqual(proof[field],expected[field],field+' report');
  }
  requireEqual(meta.harness,'engine-gameview-v2','harness run');
  requireEqual(proof.harness,'engine-gameview-v2','harness report');
  requireEqual(meta.settings,common.profiles[expected.profile],'profile settings run');
  requireEqual(proof.settings,common.profiles[expected.profile],'profile settings report');
  const cfg={gameMap:expected.map,gameMapSize:expected.size,
    difficulty:expected.difficulty,gameType:expected.gameType,
    gameMode:expected.gameMode==='FFA'?'Free For All':'Team',
    nations:expected.nations===0?'disabled':expected.nations};
  for(const [key,value] of Object.entries(cfg)){
    requireEqual(meta.gameConfig?.[key],value,'gameConfig.'+key+' run');
    requireEqual(proof.gameConfig?.[key],value,'gameConfig.'+key+' report');
  }
  if(!['game-over','eliminated','tick-limit'].includes(report.run?.termination))
    throw Error('Unconfirmed termination');
  if(!Number.isSafeInteger(report.run?.tick)||report.run.tick<0||
    report.run.tick>expected.maxTicks)throw Error('Invalid final tick');
  return {valid:true,termination:report.run.termination,
    outcome:report.gameEnd?.outcome||'incomplete',tick:report.run.tick,
    land:report.finalState?.land??null,
    policySHA256:expected.policySHA256,botSHA256:expected.botSHA256};
}
function reserveOutputDir(dir){
  const out=path.resolve(dir);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  // Exclusive creation is atomic: an existing or concurrently created
  // result directory must never be reused, even if still empty.
  fs.mkdirSync(out);
  return out;
}
module.exports={verifyEvidence,reserveOutputDir};
