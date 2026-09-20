'use strict';
// Import complete engine-run samples into the exact same learning store as live play.
// Unknown/unfinished matches may provide observation data, NEVER fabricated wins.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {makeStore}=require('./store.cjs');
const {MODES}=require('./learning.cjs');
function parseRun(dir){
  const report=JSON.parse(fs.readFileSync(path.join(dir,'match.json'),'utf8'));
  const meta=report.benchmarkMeta||{};
  if(meta.harness!=='engine-gameview-v1'||meta.seed==null||
    report.recording?.complete!==true)throw Error('Requires a complete, recorded engine-gameview-v1 run');
  const raw=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').split(/\r?\n/).filter(Boolean);
  const records=raw.map(line=>JSON.parse(line));
  const observations=records.filter(r=>r?.kind==='brain_sample').map(r=>({
    seq:r.seq,tick:r.tick,mode:r.brainMode,land:r.land,home:r.home,
    max:r.maxTroops,incoming:r.incoming,strongest:r.strongest
  }));
  if(observations.some(o=>!MODES.has(o.mode)))throw Error('Invalid learning mode in recorded sample');
  const matchId='engine-'+crypto.createHash('sha256')
    .update(path.resolve(dir)+'|'+String(meta.seed)+'|'+String(meta.botSHA256)).digest('hex').slice(0,40);
  const outcome=['victory','defeat','unknown','incomplete'].includes(report.gameEnd?.outcome)?
    report.gameEnd.outcome:'unknown';
  return {matchId,outcome,observations};
}
function importRun(store,dir){
  const run=parseRun(dir);
  if(store.hasMatch(run.matchId))return {matchId:run.matchId,skipped:true,reason:'Already imported'};
  for(const row of run.observations)store.observe({schema:1,matchId:run.matchId,...row});
  const result=run.observations.length?store.finish({matchId:run.matchId,outcome:run.outcome}):null;
  return {matchId:run.matchId,skipped:false,samples:run.observations.length,
    result,recordedOutcome:run.outcome};
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length<1||args[0]?.startsWith('--')){
    console.error('Usage: node brain/import.cjs [--db brain/data/experiences.sqlite] benchmark-results/run-dir [...]');
    process.exitCode=2;
  }else{
    let dbPath=path.join(__dirname,'data/experiences.sqlite');
    if(args[0]==='--db'){
      if(!args[1])throw Error('Missing --db path');
      dbPath=args.splice(0,2)[1];
    }
    const store=makeStore(dbPath);
    try{for(const dir of args)console.log(JSON.stringify(importRun(store,dir)));}
    finally{store.close();}
  }
}
module.exports={parseRun,importRun};
