// Managed official OpenFront dev backend for visible localhost browser tests.
// Requires the exact pinned engine checkout already validated by serve-browser.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

export const PORTS=[3000,3001,3002];
export function portOpen(port,host='127.0.0.1',timeout=1200){
  return new Promise(resolve=>{
    const s=net.createConnection({host,port});
    let done=false;
    const finish=value=>{if(done)return;done=true;s.destroy();resolve(value);};
    s.setTimeout(timeout,()=>finish(false));
    s.once('connect',()=>finish(true));
    s.once('error',()=>finish(false));
  });
}
export async function openPorts(ports=PORTS){
  const checks=await Promise.all(ports.map(port=>portOpen(port)));
  return ports.filter((_,i)=>checks[i]);
}
export function backendCommand(platform=process.platform,env=process.env){
  // Static argv: never concatenate engine paths or prompts into a shell command.
  return platform==='win32'?
    {command:env.ComSpec||'cmd.exe',args:['/d','/s','/c','npm.cmd run start:server-dev']}:
    {command:'npm',args:['run','start:server-dev']};
}
export async function startBackend({engine,dir,timeoutMs=120000,
    ports=PORTS,intervalMs=350,log=console.log,launch=backendCommand()}){
  const occupied=await openPorts(ports);
  if(occupied.length)throw Error(
    'OpenFront backend port(s) already occupied: '+occupied.join(', ')+
    '. Stop the other backend first; refusing to use a possibly different engine.');
  const command=launch;
  const output=path.join(dir,'openfront-backend.log');
  const fd=fs.openSync(output,'a');
  let child;
  try{
    child=spawn(command.command,command.args,{
      cwd:engine,env:{...process.env,GAME_ENV:'dev',NUM_WORKERS:'2'},
      detached:process.platform!=='win32',stdio:['ignore',fd,fd],windowsHide:true});
  }finally{fs.closeSync(fd);}
  let terminated=false,exitError=null;
  child.once('error',e=>{exitError=e;});
  child.once('exit',(code,signal)=>{
    if(!terminated)exitError=Error('Official OpenFront backend exited: '+code+'/'+signal+
      '. See '+output);
  });
  const stop=()=>{
    if(terminated)return;terminated=true;
    if(child.pid&&process.platform==='win32')
      spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],
        {stdio:'ignore',timeout:10000,windowsHide:true});
    else if(child.pid){
      try{process.kill(-child.pid,'SIGTERM');}catch(_){
        try{child.kill('SIGTERM');}catch(_){}
      }
    }
  };
  log('Starting official OpenFront backend (3000, 3001, 3002). Log: '+output);
  const started=Date.now();
  try{
    while(Date.now()-started<timeoutMs){
      if(exitError)throw exitError;
      if((await openPorts(ports)).length===ports.length){
        // Recheck once: fast startup may accept TCP just before failure.
        await new Promise(resolve=>setTimeout(resolve,350));
        if(exitError)throw exitError;
        log('Official OpenFront backend ready: '+ports.join(', '));
        return {child,stop,output};
      }
      await new Promise(resolve=>setTimeout(resolve,intervalMs));
    }
    const ready=await openPorts(ports);
    throw Error('Official OpenFront backend did not become ready. Missing ports: '+
      ports.filter(p=>!ready.includes(p)).join(', ')+'. See '+output);
  }catch(e){stop();throw e;}
}
