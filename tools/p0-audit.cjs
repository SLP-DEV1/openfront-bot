#!/usr/bin/env node
'use strict';
// Read-only reproducibility and regression audit for the P0 roadmap.
// Run in a CLEAN worktree: node tools/p0-audit.cjs
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const shaFile=p=>fs.existsSync(path.join(root,p))?
  sha(fs.readFileSync(path.join(root,p))):null;
const git=(...args)=>{
  const p=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:15000});
  return p.status===0?p.stdout.trim():null;
};
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const revision=git('rev-parse','--short=12','HEAD')||'no-git';
const checks=[
  ['syntax-main',['--check','OpenFront_Solo_AggroBot.user.js']],
  ['syntax-run3',['--check','OpenFront_AggroBot_Impossible_Run3.user.js']],
  ['bundle',['tools/build-run3-bundle.cjs','--check']],
  ['bundle-regression',['tests/bundled-run3-regression.cjs']],
  ['strategy',['tests/strategy-regression.cjs']],
  ['duo-relay',['tests/duo-relay-regression.cjs']],
  ['neural',['tests/neural-regression.cjs']],
  ['neural-v2',['tests/neural-v2-regression.cjs']],
  ['benchmark',['tests/benchmark-regression.cjs']],
  ['autostart',['tests/autostart-regression.cjs']],
  ['learning',['tests/learning-regression.cjs']],
  ['live-monitor',['tests/live-monitor-regression.cjs']],
  ['browser-finish',['tests/browser-finish-regression.cjs']],
  ['openfront-backend',['tests/openfront-backend-regression.cjs']],
  ['holdout',['tests/holdout-regression.cjs']]
];
const dirty=git('status','--porcelain=v1')||'';
const report={
  kind:'aggrobot-p0-native-audit',timestamp:new Date().toISOString(),
  node:process.version,platform:process.platform,arch:process.arch,
  git:{revision,dirty:dirty.length>0,workingTreeStatus:dirty},
  files:Object.fromEntries([
    'OpenFront_Solo_AggroBot.user.js',
    'OpenFront_AggroBot_Impossible_Run3.user.js',
    'docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json',
    'tools/build-run3-bundle.cjs',
    'tests/strategy-regression.cjs'
  ].map(p=>[p,shaFile(p)])),
  checks:[]
};
const dir=path.join(root,'benchmark-results','p0-audit-'+stamp+'-'+revision);
fs.mkdirSync(dir,{recursive:true});
for(const [name,args] of checks){
  const start=Date.now();
  const result=spawnSync(process.execPath,args,{
    cwd:root,encoding:'utf8',timeout:180000,maxBuffer:12*1024*1024
  });
  const row={name,args,status:result.status,signal:result.signal,
    durationMs:Date.now()-start,pass:result.status===0&&
      !result.error,error:result.error?String(result.error):null};
  report.checks.push(row);
  fs.writeFileSync(path.join(dir,name+'.log'),
    'COMMAND: node '+args.join(' ')+'\nSTATUS: '+row.status+
    '\nDURATION_MS: '+row.durationMs+'\n\nSTDOUT\n'+
    (result.stdout||'')+'\nSTDERR\n'+(result.stderr||''),'utf8');
  console.log((row.pass?'PASS':'FAIL')+' '+name+
    ' '+row.durationMs+'ms');
}
report.summary={passed:report.checks.filter(x=>x.pass).length,
  failed:report.checks.filter(x=>!x.pass).length,
  nativeNode:true,engineMatchesExecuted:false,
  fullMultiplayerMatchesExecuted:false};
fs.writeFileSync(path.join(dir,'report.json'),
  JSON.stringify(report,null,2)+'\n','utf8');
console.log('P0_AUDIT_REPORT '+path.join(dir,'report.json'));
if(dirty)console.warn('WARN: worktree dirty; audit is NOT a frozen-commit result.');
if(report.summary.failed)process.exitCode=1;
