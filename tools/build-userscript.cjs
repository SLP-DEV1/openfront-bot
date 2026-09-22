#!/usr/bin/env node
'use strict';
// Canonical source is split at top-level function boundaries, and joined
// without separators: generated .user.js MUST be byte-identical.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=['00-bootstrap.js','10-duo-and-diagnostics.js',
 '20-military-and-planning.js','30-economy-and-defense.js',
 '40-economy-runner.js','50-ui-and-entrypoint.js'];
const output=path.join(root,'OpenFront_Solo_AggroBot.user.js');
function assemble(){return files.map(name=>fs.readFileSync(
 path.join(root,'src/userscript',name),'utf8')).join('');}
function main(args=process.argv.slice(2)){
 const mode=args[0]||'--check';
 if(!['--check','--write'].includes(mode)||args.length>1)
   throw Error('Usage: node tools/build-userscript.cjs [--check|--write]');
 const generated=assemble(),existing=fs.readFileSync(output,'utf8');
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
 const tmp=path.join(os.tmpdir(),'aggrobot-userscript-'+process.pid+'.user.js');
 try{
   fs.writeFileSync(tmp,generated,{flag:'wx'});
   const check=spawnSync(process.execPath,['--check',tmp],{encoding:'utf8'});
   if(check.status!==0)throw Error('Generated userscript syntax failed: '+check.stderr);
   if(existing!==generated)fs.writeFileSync(output,generated);
   console.log('USERSCRIPT_BUILD '+JSON.stringify({parts:files.length,
     bytes:generated.length,action:existing===generated?'unchanged':'written'}));
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
if(require.main===module){try{main();}catch(e){console.error(String(e));process.exitCode=1;}}
module.exports={files,assemble,main};
