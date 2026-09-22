#!/usr/bin/env node
'use strict';
// Converts pre-extracted public GameView decision frames. Never pretends that a
// raw OpenFront replay alone contains a human player's private observations.
const fs=require('node:fs'),path=require('node:path');
const {importReplay}=require('./replay-visible-state.cjs');
const HEX=/^[a-f0-9]{40}$/i;
function convert(input,engineCommit){
 if(!HEX.test(engineCommit||''))throw Error('Exact --engineCommit SHA required');
 if(!input||input.format!=='openfront-visible-gameview-v1'||
   input.complete!==true||input.visibility!=='player-view'||
   !HEX.test(input.engineCommit||'')||
   input.engineCommit.toLowerCase()!==engineCommit.toLowerCase()||
   typeof input.matchId!=='string'||!input.matchId.trim()||
   !Array.isArray(input.frames)||!input.frames.length)
   throw Error('Unverified or incomplete visible-state replay provenance');
 let previous=-1;
 const rows=input.frames.map((f,i)=>{
   if(!f||f.source!=='GameView'||f.matchId!==input.matchId||
     f.engineCommit?.toLowerCase()!==engineCommit.toLowerCase()||
     !Number.isSafeInteger(f.tick)||f.tick<=previous)
     throw Error('Frame provenance/tick missing or duplicated at index '+i);
   previous=f.tick;
   return f;
 });
 const result=importReplay(rows,engineCommit);
 if(result.rejected.length||result.usable.length!==rows.length)
   throw Error('Incomplete/malformed visible-state frame(s): '+result.rejected.join(','));
 return {...result,matchId:input.matchId,complete:true,
   visibility:'player-view',provenance:'input-declared; not independent replay verification',
   note:'Only pre-extracted GameView decision frames accepted; unknown outcomes remain null.'};
}
function run(argv=process.argv.slice(2)){
 const opts={input:null,out:null,engineCommit:null};
 for(let i=0;i<argv.length;i++){
   const key=argv[i].replace(/^--/,'');
   if(!argv[i].startsWith('--')||!Object.hasOwn(opts,key))throw Error('Unknown option '+argv[i]);
   const value=argv[++i];if(!value||value.startsWith('--'))throw Error('Missing '+key);
   opts[key]=value;
 }
 if(!opts.input||!opts.out)throw Error('Usage: --input EXTRACTED.json --out FRAMES.json --engineCommit FULL_SHA');
 const src=path.resolve(opts.input),dst=path.resolve(opts.out);
 if(src===dst||fs.existsSync(dst))throw Error('Refuse overwrite of replay input/output');
 const result=convert(JSON.parse(fs.readFileSync(src,'utf8')),opts.engineCommit);
 fs.writeFileSync(dst,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({out:dst,frames:result.usable.length,matchId:result.matchId}));
 return result;
}
if(require.main===module){try{run();}catch(e){console.error(String(e));process.exitCode=1;}}
module.exports={convert,run};
