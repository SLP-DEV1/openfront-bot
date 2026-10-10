#!/usr/bin/env node
'use strict';
// Report only recorded, GameView-visible metrics. Never infer victories from land.
// Usage: node tools/benchmark/matrix-diagnostics.cjs <matrix.json>
const fs=require('node:fs');
const path=require('node:path');
function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){return null;}}
function readIntents(file){
  try{return fs.readFileSync(file,'utf8').trim().split(/\r?\n/).filter(Boolean)
    .flatMap(line=>{
      let obj;try{obj=JSON.parse(line);}catch(_){return [];}
      return (obj.intents||[]).map(intent=>({tick:obj.turnNumber,type:intent.type}));
    });}catch(_){return [];}
}
const at=(samples,tick)=>{
  const found=samples.filter(s=>Number.isFinite(s.tick)&&s.tick<=tick).at(-1);
  return found?found.land:null;
};
function analyzeRun(row){
  const game=readJSON(path.join(row.dir,'match.json'));
  const samples=game?.trajectory?.samples||[];
  const intents=readIntents(path.join(row.dir,'turns.jsonl'));
  const action=types=>intents.find(r=>types.includes(r.type))?.tick??null;
  const firstAttackTick=action(['attack','boat']);
  const firstConstructionTick=action(['build_unit','upgrade_structure']);
  return {variant:row.variant,map:row.map,seed:row.seed,nations:row.nations,
    confirmed:row.observed===true,termination:row.termination,
    outcome:row.observed===true?row.outcome:'incomplete',
    endTick:Number.isFinite(game?.run?.tick)?game.run.tick:row.endTick??null,
    firstAttackTick,firstConstructionTick,
    landAt1000:at(samples,1000),landAt3000:at(samples,3000),
    peakLand:game?.trajectory?.summary?.peakLand??null,
    meanLand:game?.trajectory?.summary?.meanLand??null,
    endLand:game?.trajectory?.summary?.endLand??null,
    sampleCount:samples.length};
}
function analyze(matrix){
  if(!Array.isArray(matrix?.runs))throw Error('Expected matrix with runs array');
  const rows=matrix.runs.map(analyzeRun);
  const paired=[];
  const groups=new Map();
  for(const row of rows){
    const key=JSON.stringify([row.map,row.nations,row.seed]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  for(const group of groups.values()){
    const baseline=group.find(x=>x.variant==='baseline');
    const candidate=group.find(x=>x.variant==='candidate');
    if(!baseline||!candidate)continue;
    const delta=k=>Number.isFinite(candidate[k])&&Number.isFinite(baseline[k])?
      candidate[k]-baseline[k]:null;
    paired.push({map:candidate.map,nations:candidate.nations,seed:candidate.seed,
      comparable:baseline.confirmed&&candidate.confirmed,
      outcomeBaseline:baseline.outcome,outcomeCandidate:candidate.outcome,
      deltaLand1000:delta('landAt1000'),
      deltaLand3000:delta('landAt3000'),
      deltaMeanLand:delta('meanLand'),
      deltaEndLand:delta('endLand'),
      deltaFirstAttackTick:delta('firstAttackTick'),
      deltaFirstConstructionTick:delta('firstConstructionTick')});
  }
  return {note:'Only recorded GameView and submitted intents; missing metrics are null, unfinished results do not count as wins.',
    totals:matrix.totals||null,rows,paired};
}
function markdown(report){
  const s=['# Paired Impossible diagnostic','',
    report.note,'',
    '| Map | Seed | Baseline | Candidate | Δ land @1k | Δ land @3k | Δ mean land | Δ first attack |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: |'];
  const val=v=>v===null?'n/a':String(Math.round(v*10)/10);
  for(const p of report.paired)s.push(
    '| '+[p.map,p.seed,p.outcomeBaseline,p.outcomeCandidate,
      val(p.deltaLand1000),val(p.deltaLand3000),val(p.deltaMeanLand),
      val(p.deltaFirstAttackTick)].join(' | ')+' |');
  s.push('','Negative deltas indicate less land or earlier candidate actions, depending on metric.',
    'A matched seed is not necessarily a completed match; inspect comparable and outcomes before interpreting results.','');
  return s.join('\n');
}
if(require.main===module){
  const input=process.argv[2];if(!input)throw Error('Usage: matrix-diagnostics.cjs <matrix.json>');
  const file=path.resolve(input),matrix=readJSON(file);
  if(!matrix)throw Error('Missing or invalid '+file);
  const report=analyze(matrix),dir=path.dirname(file);
  fs.writeFileSync(path.join(dir,'matrix-diagnostics.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'matrix-diagnostics.md'),markdown(report));
  console.log(JSON.stringify({rows:report.rows.length,paired:report.paired.length,
    completePairs:report.paired.filter(p=>p.comparable).length,
    path:path.join(dir,'matrix-diagnostics.md')}));
}
module.exports={analyze,analyzeRun,markdown};
