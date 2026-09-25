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
// Canonical source is LF. Normalize on read so assembly is independent of the
// working-tree line endings (git autocrlf checks out CRLF on Windows).
const norm=s=>s.replace(/\r\n/g,String.fromCharCode(10));
function assemble(){
 const nl=String.fromCharCode(10);
 let source=files.map(name=>norm(fs.readFileSync(
   path.join(root,'src/userscript',name),'utf8'))).join('');
 const panel=norm(fs.readFileSync(path.join(root,'src/runtime/panel-state.cjs'),'utf8'));
 const kernels=norm(fs.readFileSync(path.join(root,'src/runtime/decision-kernels.cjs'),'utf8'));
 const segments=[
   [panel,'/* __DUO_STATUS_VIEW__ */','// DUO-STATUS-BEGIN','// DUO-STATUS-END'],
   [panel,'/* __EVIDENCE_PANEL_STATE__ */','// EVIDENCE-STATE-BEGIN','// EVIDENCE-STATE-END'],
   [kernels,'/* __DECISION_KERNELS__ */','// DECISION-KERNELS-BEGIN','// DECISION-KERNELS-END']
 ];
 for(const [moduleSource,marker,start,end] of segments){
   const placeholder='  '+marker+nl,open=start+nl;
   if(moduleSource.split(open).length!==2||source.split(placeholder).length!==2)
     throw Error('Duplicate or missing canonical selector: '+marker);
   const selector=moduleSource.split(open)[1].split(end)[0];
   if(!selector.includes('function '))throw Error('Missing runtime function block: '+marker);
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
 const existing=fs.existsSync(output)?norm(fs.readFileSync(output,'utf8')):null;
 if(!generated.startsWith('// ==UserScript==')||
    generated.split('const NEURAL_BUNDLED_MODEL = null;').length!==2)
    throw Error('Invalid assembled userscript header or model marker');
 const candidate=require('node:fs').readFileSync(
   path.join(root,'trainer/candidate-policy-v5.cjs'),'utf8');
 const shared=candidate.slice(candidate.indexOf('const INPUTS=32'),
   candidate.indexOf('function sha(model)'));
 if(!shared||!generated.includes(shared))
   throw Error('Schema-5 shadow runtime drifted from trainer model source');
 const candidateV6=require('node:fs').readFileSync(
   path.join(root,'trainer/candidate-policy-v6.cjs'),'utf8');
 // Anchor on the unique declaration strings (not the prose mentions of the
 // same tokens in the header comment).
 const sharedV6=candidateV6.slice(
   candidateV6.indexOf('const INPUTS=38,OUTPUTS=2;'),
   candidateV6.indexOf('function sha(model){'));
 if(!sharedV6||!generated.includes(sharedV6))
   throw Error('Schema-6 shadow runtime drifted from trainer model source');
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
