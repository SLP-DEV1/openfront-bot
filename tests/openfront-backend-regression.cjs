'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
(async()=>{
  const {portOpen,openPorts,backendCommand,startBackend}=
    await import('../tools/benchmark/openfront-backend.mjs');
  assert.deepEqual(backendCommand('win32',{ComSpec:'C:\\Windows\\System32\\cmd.exe'}),
    {command:'C:\\Windows\\System32\\cmd.exe',
      args:['/d','/s','/c','npm.cmd run start:server-dev']});
  assert.deepEqual(backendCommand('linux',{}),
    {command:'npm',args:['run','start:server-dev']});
  const reserve=()=>new Promise((resolve,reject)=>{
    const server=net.createServer();server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(server));
  });
  const s1=await reserve(),s2=await reserve();
  const ports=[s1.address().port,s2.address().port];
  await new Promise(r=>s1.close(r));
  await new Promise(r=>s2.close(r));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aggro-backend-'));
  const code="const net=require('net');for(const p of JSON.parse(process.argv[1]))"+
    "{net.createServer(()=>{}).listen(p,'127.0.0.1')}";
  let backend;
  try{
    assert.deepEqual(await openPorts(ports),[]);
    backend=await startBackend({engine:dir,dir,ports,timeoutMs:9000,
      intervalMs:50,log:()=>{},
      launch:{command:process.execPath,args:['-e',code,JSON.stringify(ports)]}});
    assert.deepEqual(await openPorts(ports),ports);
    const blocked=await assert.rejects(
      startBackend({engine:dir,dir,ports,timeoutMs:500,log:()=>{},
        launch:{command:process.execPath,args:['-e',code,JSON.stringify(ports)]}}),
      /already occupied/);
    backend.stop();
    // Stop is idempotent.
    backend.stop();
    for(let i=0;i<60&&await portOpen(ports[0]);i++)
      await new Promise(r=>setTimeout(r,50));
    assert.equal(await portOpen(ports[0]),false);
    assert(fs.existsSync(path.join(dir,'openfront-backend.log')));
  }finally{
    backend?.stop();
    fs.rmSync(dir,{recursive:true,force:true});
  }
  console.log('PASS managed OpenFront backend: readiness, conflict refusal and shutdown');
})().catch(e=>{console.error(e);process.exitCode=1;});
