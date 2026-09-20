'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
  const {qwenCommand,reviewGeneration}=await import('../trainer/qwen-review.mjs');
  const linux=qwenCommand('linux',{}),win=qwenCommand('win32',{ComSpec:'C:\\Windows\\System32\\cmd.exe'});
  assert.equal(linux.command,'qwen');
  assert.equal(win.command,'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(win.args.slice(0,3),['/d','/s','/c']);
  assert(!win.args.join(' ').includes(' -p '),'Windows command must not pass prompt as an arg');
  assert(!linux.args.includes('-p')&&!linux.args.includes('--prompt'));
  assert(linux.args.includes('plan'),'Qwen must stay in read-only approval mode');
  if(process.platform!=='win32'){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aggro-qwen-')),save=process.env.PATH;
    try{
      const cli=path.join(dir,'qwen');
      fs.writeFileSync(cli,`#!/usr/bin/env node\nlet prompt='';process.stdin.setEncoding('utf8');\nprocess.stdin.on('data',v=>prompt+=v);\nprocess.stdin.on('end',()=>{if(!prompt.includes('Generation: 1'))process.exit(2);\nprocess.stdout.write(JSON.stringify([{type:'result',result:JSON.stringify({sigma:0.2,note:'Test erfolgreich'})}]));});\n`);
      fs.chmodSync(cli,0o755);
      process.env.PATH=dir+path.delimiter+save;
      const report={generation:1,sigma:.3,parentScore:0,trainScore:.1,
        evaluation:{incumbent:{wins:0},candidate:{wins:0}},promoted:false};
      const result=reviewGeneration(report,dir);
      assert.equal(result?.sigma,.2);
      assert(fs.readFileSync(path.join(dir,'qwen-prompt-1.txt'),'utf8').includes('Generation: 1'));
      assert(fs.existsSync(path.join(dir,'qwen-review-1.json')));
    }finally{process.env.PATH=save;fs.rmSync(dir,{recursive:true,force:true});}
  }
  console.log('Qwen review Windows argv and stdin integration: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
