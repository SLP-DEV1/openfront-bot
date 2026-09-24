#!/usr/bin/env node
'use strict';
// One-shot, idempotent capture of the versioned schema-5 training set
// (featuredSchemaVersion 2) across the exact 28-match seed matrix that the
// original v1 capture used. Re-captures with the CURRENT runtime so the
// training frames carry the full visible-state extension + per-candidate v5
// contract that live inference actually provides (feature parity by
// construction, see trainer/v5-features.cjs).
//
// Idempotent: skips a (map, difficulty, seed) whose match.json already
// exists, so a partial run can be resumed. Usage:
//   node capture-v5-v2.cjs --engine <dir> --out <resultsDir>
const path=require('node:path');
const fs=require('node:fs');
const common=require('./common.cjs');
const {runOne}=require('./v5-dataset.cjs');

const o={engine:null,out:null,engineCommit:common.ENGINE_COMMIT,
  ticks:6000,scriptedHumans:3,opponentProfile:'mixed'};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i].replace(/^--/,'');
  if(!process.argv[i].startsWith('--')||!Object.hasOwn(o,key))
    throw Error('Unknown option '+process.argv[i]);
  if(!process.argv[i+1]||process.argv[i+1].startsWith('--'))
    throw Error('Missing value for '+process.argv[i]);
  const v=process.argv[++i];
  o[key]=typeof o[key]==='number'?Number(v):v;
}
if(!o.engine||!o.out)throw Error('--engine and --out are required');
o.engine=path.resolve(o.engine);o.out=path.resolve(o.out);
common.engineInfo(o.engine,o.engineCommit);

// Exact 28-match seed matrix from the original v1 capture (verified against
// .qwen/tmp/v5full/dataset.json matchIds). map/difficulty are the engine's
// capitalized values; runOne lowercases them for the output dir.
const MATRIX=[
  ['World','Medium',20260000],['World','Medium',20260001],['World','Medium',20260002],
  ['World','Medium',20260003],['World','Medium',20260004],['World','Medium',20260005],
  ['World','Medium',21000000],['World','Medium',21000001],
  ['World','Hard',20260100],['World','Hard',20260101],['World','Hard',20260102],
  ['World','Hard',20260103],['World','Hard',20260104],['World','Hard',20260105],
  ['Europe','Medium',20260200],['Europe','Medium',20260201],['Europe','Medium',20260202],
  ['Europe','Medium',20260203],['Europe','Medium',20260204],['Europe','Medium',20260205],
  ['Europe','Medium',21000100],['Europe','Medium',21000101],
  ['Europe','Hard',20260300],['Europe','Hard',20260301],['Europe','Hard',20260302],
  ['Europe','Hard',20260303],['Europe','Hard',20260304],['Europe','Hard',20260305]
];

let ok=0,skip=0,fail=0;
for(const [map,difficulty,seed] of MATRIX){
  const dir=path.join(o.out,map.toLowerCase(),difficulty.toLowerCase(),String(seed));
  if(fs.existsSync(path.join(dir,'match.json'))){skip++;console.error(`[v5v2] skip ${map} ${difficulty} ${seed}`);continue;}
  const res=runOne(o,map,difficulty,seed);
  if(res.ok)ok++;else fail++;
  console.error(`[v5v2] ${map} ${difficulty} seed=${seed} -> ${res.ok?'ok':'FAIL'}`);
  if(!res.ok)console.error(String(res.stderr).slice(-2000));
}
console.log(JSON.stringify({captured:ok,skipped:skip,failed:fail,total:ok+skip}));
if(fail)process.exit(1);
