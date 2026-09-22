#!/usr/bin/env node
'use strict';
// Canonical source is split at top-level function boundaries, and joined
// without separators: generated .user.js MUST be byte-identical.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=['00-bootstrap.js','10-duo-and-diagnostics.js',
 '20-military-and-planning.js','30-economy-and-defense.js',
 '40-economy-runner.js','50-ui-and-entrypoint.js'];
const output=path.join(root,'OpenFront_Solo_AggroBot.user.js');
function assemble(){
 const nl=String.fromCharCode(10);
 let source=files.map(name=>fs.readFileSync(
   path.join(root,'src/userscript',name),'utf8')).join('');
 // autocrlf checkouts expand text files to CRLF; CI uses LF. Normalize the
 // runtime files for marker extraction and re-emit the selector in the
 // source's own line ending so the artifact stays byte-identical per tree.
 const eol=source.includes('\r\n')?'\r\n':'\n';
 const runtimes={
   'panel-state.cjs':fs.readFileSync(
     path.join(root,'src/runtime/panel-state.cjs'),'utf8').replace(/\r\n/g,nl),
   'defense-posture.cjs':fs.readFileSync(
     path.join(root,'src/runtime/defense-posture.cjs'),'utf8').replace(/\r\n/g,nl)
 };
 const segments=[
   ['panel-state.cjs','/* __DUO_STATUS_VIEW__ */','// DUO-STATUS-BEGIN','// DUO-STATUS-END'],
   ['panel-state.cjs','/* __EVIDENCE_PANEL_STATE__ */','// EVIDENCE-STATE-BEGIN','// EVIDENCE-STATE-END'],
   ['defense-posture.cjs','/* __DEFENSE_POSTURE__ */','// DEFENSE-POSTURE-BEGIN','// DEFENSE-POSTURE-END']
 ];
 for(const [file,marker,start,end] of segments){
   const runtime=runtimes[file],placeholder='  '+marker+eol,open=start+nl;
   if(runtime.split(open).length!==2||source.split(placeholder).length!==2)
     throw Error('Duplicate or missing canonical selector: '+marker);
   const selector=runtime.split(open)[1].split(end)[0].replace(/\n/g,eol);
   if(!selector.includes('function '))
     throw Error('Missing runtime selector function: '+marker);
   source=source.replace(placeholder,selector);
 }
 return source;
}
function main(args=process.argv.slice(2)){
 const mode=args[0]||'--check';
 if(!['--check','--write'].includes(mode)||args.length>1)
   throw Error('Usage: node tools/build-userscript.cjs [--check|--write]');
 const generated=assemble();
 // --write must be able to reconstruct an artifact absent from a clean checkout.
 const existing=fs.existsSync(output)?fs.readFileSync(output,'utf8'):null;
 if(!generated.startsWith('// ==UserScript==')||
    generated.split('const NEURAL_BUNDLED_MODEL = null;').length!==2)
    throw Error('Invalid assembled userscript header or model marker');
 const candidate=require('node:fs').readFileSync(
   path.join(root,'trainer/candidate-policy-v5.cjs'),'utf8');
 const shared=candidate.slice(candidate.indexOf('const INPUTS=32'),
   candidate.indexOf('function sha(model)'));
 if(!shared||!generated.includes(shared))
   throw Error('Schema-5 shadow runtime drifted from trainer model source');
 if(mode==='--check'){
   if(existing!==generated)throw Error('Solo userscript is stale; run node tools/build-userscript.cjs --write');
   console.log('USERSCRIPT_BUILD_PASS '+JSON.stringify({parts:files.length,bytes:generated.length}));
   return;
 }
 // Verify syntax without replacing the existing output on failure.
 const tmp=path.join(root,'.aggrobot-userscript-'+process.pid+'-'+Date.now()+'.user.js');
 try{
   fs.writeFileSync(tmp,generated,{flag:'wx'});
   const check=spawnSync(process.execPath,['--check',tmp],{encoding:'utf8'});
   if(check.status!==0)throw Error('Generated userscript syntax failed: '+check.stderr);
   if(existing!==generated){
     // Same-directory rename avoids exposing a partially written artifact.
     // A syntax or source-parity error leaves an existing output untouched.
     fs.renameSync(tmp,output);
   }
   console.log('USERSCRIPT_BUILD '+JSON.stringify({parts:files.length,
     bytes:generated.length,action:existing===generated?'unchanged':'written'}));
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
if(require.main===module){try{main();}catch(e){console.error(String(e));process.exitCode=1;}}
module.exports={files,assemble,main};
