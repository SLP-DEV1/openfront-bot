#!/usr/bin/env node
'use strict';
// Freeze a NEW holdout seed set for a three-arm paired holdout and PROVE it was
// never consumed by training-data generation nor any prior holdout evaluation.
//
// The paired-holdout protocol derives deterministic seed strings of the form
//   holdout-<mode>-<map>-<opp>-p<pair>-<n>
// where <n> is a global sequential index that depends on the protocol
// composition (maps x opponents x runs) and their iteration order. A seed is
// "new" only if that exact string was never passed to the engine before --
// i.e. it is absent from both the training-data generation runs (v5full-*) and
// every prior paired-holdout evaluation. This tool:
//   1. builds the exact protocol (via paired-holdout, so the execution run can
//      reuse the identical composition and reproduce the same seeds),
//   2. collects every consumed seed (all benchmark-results/*/holdout.json plus
//      the training dataset match ids),
//   3. asserts the new seeds are internally distinct and disjoint from the
//      consumed set, and
//   4. writes a committed frozen manifest BEFORE any match is executed.
//
// No engine is required (pure protocol + provenance). The execution run must
// use the exact same mode/maps/opponents/runs as the frozen protocol.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const paired=require('./paired-holdout.cjs');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');

// Collect every consumed seed string from all holdout.json files under root.
function consumedSeeds(root){
  const set=new Set();const files=[];
  let entries=[];
  try{entries=fs.readdirSync(root,{withFileTypes:true});}catch(_){return{set,files};}
  for(const e of entries){
    if(!e.isDirectory())continue;
    const f=path.join(root,e.name,'holdout.json');
    if(!fs.existsSync(f))continue;
    files.push(f);
    let h;try{h=JSON.parse(fs.readFileSync(f,'utf8'));}catch(_){continue;}
    const add=v=>{if(typeof v==='string')set.add(v);};
    for(const r of (Array.isArray(h.rows)?h.rows:[]))add(r&&r.matchSeed);
    const sc=(h.protocol&&Array.isArray(h.protocol.scenarios))?h.protocol.scenarios:[];
    for(const x of sc)add(x&&x.matchSeed);
  }
  return{set,files};
}

// Collect training match ids (the games the candidate was trained on).
function trainingIds(files){
  const set=new Set();
  for(const f of files){
    if(!fs.existsSync(f))continue;
    let d;try{d=JSON.parse(fs.readFileSync(f,'utf8'));}catch(_){continue;}
    for(const m of (Array.isArray(d.matches)?d.matches:[]))if(m&&m.matchId)set.add(m.matchId);
  }
  return set;
}

function freeze(o){
  const parsed=paired.parseArgs([
    '--mode',o.mode,'--maps',o.maps.join(','),'--opponents',o.opponents.join(','),
    '--runs',String(o.runs),'--engineCommit',o.engineCommit,'--bot',o.bot,
    '--run3Policy',o.run3Policy,'--candidateModel',o.candidateModel
  ]);
  const arms=paired.resolveArms(parsed);
  const protocol=paired.buildProtocol(parsed,arms);
  const seeds=protocol.scenarios.map(s=>s.matchSeed);
  if(new Set(seeds).size!==seeds.length)throw Error('New protocol has duplicate seeds');

  const consumed=new Set();
  const cons=consumedSeeds(path.resolve(o.resultsRoot));
  for(const s of cons.set)consumed.add(s);
  const training=trainingIds(o.trainingFiles);
  for(const s of training)consumed.add(s);
  const collisions=seeds.filter(s=>consumed.has(s));
  if(collisions.length)
    throw Error('Seeds already consumed (not a new holdout): '+collisions.join(', '));

  const rel=f=>path.relative(path.resolve('.'),f);
  const manifest={
    kind:'frozen-holdout-seeds',schema:5,
    mode:parsed.mode,maps:parsed.maps,opponents:parsed.opponents,
    minPairsPerCell:parsed.runs,engineCommit:parsed.engineCommit,
    arms:{
      'rule-basis':{policySHA256:arms['rule-basis'].policySHA256},
      'run3-schema4':{policySHA256:arms['run3-schema4'].policySHA256},
      candidate:{policySHA256:arms['candidate'].policySHA256,
        model:parsed.candidateModel}
    },
    botSHA256:arms['rule-basis'].botSHA256,
    protocol,seeds,
    seedListSHA256:digest(JSON.stringify(seeds)),
    consumed:{
      priorHoldoutFiles:cons.files.map(rel),
      priorHoldoutSeedCount:cons.set.size,
      trainingFiles:o.trainingFiles.map(f=>rel(f)),
      trainingMatchCount:training.size,
      collisions:collisions.length
    },
    note:'New ffa-duo holdout seed set. Every seed string is proven disjoint from all training-data generation matches and all prior holdout evaluations BEFORE any match was executed. Pre-registered: the execution must use exactly this protocol (mode/maps/opponents/runs).',
    frozen:new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(o.out),{recursive:true});
  fs.writeFileSync(o.out,JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if(require.main===module){
  const argv=process.argv.slice(2);
  const get=(k,d)=>{const i=argv.indexOf(k);return i>=0&&argv[i+1]?argv[i+1]:d;};
  const o={
    mode:get('--mode','ffa-duo'),
    maps:JSON.parse(get('--maps','["World","Europe"]')),
    opponents:JSON.parse(get('--opponents','["opportunist","defender","balanced","rush"]')),
    runs:Number(get('--runs','2')),
    engineCommit:get('--engineCommit','13b403387af01d388f8c8ed8c953b6d3a11d1457'),
    bot:get('--bot','OpenFront_AggroBot_Impossible_Run3.user.js'),
    run3Policy:get('--run3Policy','docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json'),
    candidateModel:get('--candidateModel','trainer/candidate-v5-v2.json'),
    resultsRoot:get('--resultsRoot','benchmark-results'),
    trainingFiles:JSON.parse(get('--trainingFiles','["tools/benchmark/v5full-v2/dataset.json"]')),
    out:get('--out','benchmark-results/holdout-ffa-duo-v2/frozen.json')
  };
  const m=freeze(o);
  console.log(JSON.stringify({ok:true,mode:m.mode,
    scenarios:m.protocol.scenarios.length,seeds:m.seeds.length,
    seedListSHA256:m.seedListSHA256.slice(0,16),
    consumedChecked:m.consumed.priorHoldoutSeedCount+m.consumed.trainingMatchCount,
    collisions:m.consumed.collisions,out:path.resolve(o.out)}));
}
module.exports={freeze,consumedSeeds,trainingIds,digest};
