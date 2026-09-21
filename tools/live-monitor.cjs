'use strict';
// Local receiver for the optional Tampermonkey monitor. It cannot send game intents.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const host='127.0.0.1',port=8766,maxBody=1024*1024;
const token=crypto.randomBytes(32).toString('hex');
const root=path.resolve(__dirname,'../benchmark-results');
let runDir,lastSeq=0,lastTick=-1,count=0,gaps=0,counts={},startedAt;

function newRun(){
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  runDir=path.join(root,stamp+'-live-monitor');
  fs.mkdirSync(runDir,{recursive:true});
  lastSeq=0;lastTick=-1;count=0;gaps=0;counts={};startedAt=new Date().toISOString();
  console.log('Diagnoseordner: '+runDir);
}
function status(){return {startedAt,updatedAt:new Date().toISOString(),lastSeq,lastTick,count,gaps,counts};}
function send(res,code,body){
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}
function valid(record){
  return record&&typeof record==='object'&&!Array.isArray(record)&&
    Number.isSafeInteger(record.seq)&&record.seq>0&&
    Number.isSafeInteger(record.tick)&&record.tick>=0&&
    typeof record.kind==='string'&&record.kind.length<=80&&
    typeof record.time==='string'&&record.time.length<=40;
}

newRun();
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{status:'ready'});
  if(req.method!=='POST'||req.url!=='/v1/events')return send(res,404,{error:'not found'});
  if(req.headers['x-aggrobot-monitor-token']!==token)return send(res,401,{error:'unauthorized'});
  let body='';
  try{
    for await(const chunk of req){body+=chunk;if(body.length>maxBody)throw Error('body too large');}
    const data=JSON.parse(body);
    if(!Array.isArray(data?.records)||data.records.length<1||data.records.length>100||
       !data.records.every(valid))throw Error('invalid records');
    const records=data.records;
    const fresh=records.filter(r=>r.seq>lastSeq);
    if(fresh.some((r,i)=>i>0&&r.seq!==fresh[i-1].seq+1))throw Error('non-contiguous records');
    if(fresh.length){
      gaps+=Math.max(0,fresh[0].seq-lastSeq-1);
      fs.appendFileSync(path.join(runDir,'events.jsonl'),fresh.map(r=>JSON.stringify(r)).join('\n')+'\n');
      for(const r of fresh){lastSeq=r.seq;lastTick=r.tick;count++;counts[r.kind]=(counts[r.kind]||0)+1;}
      fs.writeFileSync(path.join(runDir,'status.json'),JSON.stringify(status(),null,2)+'\n');
      if(fresh.some(r=>r.kind==='game_over'))console.log('Spielende aufgezeichnet: '+runDir);
    }
    send(res,200,{accepted:fresh.length,lastSeq});
  }catch(error){send(res,400,{error:String(error.message||error)});}
});
server.listen(port,host,()=>{
  console.log('AggroBot-Monitor: http://'+host+':'+port+'/health');
  console.log('Tampermonkey-Token: '+token);
  console.log('Den Token nur im Tampermonkey-Menü des Begleitskripts eingeben.');
});
