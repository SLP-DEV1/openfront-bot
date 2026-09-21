'use strict';
// Local receiver for the optional Tampermonkey monitor. It cannot send game intents.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const host='127.0.0.1',port=8766,maxBody=1024*1024;
const token=crypto.randomBytes(32).toString('hex');
const root=path.resolve(__dirname,'../benchmark-results');
fs.mkdirSync(root,{recursive:true});
const sessions=new Map();
const startedAt=new Date().toISOString();
function sessionState(id){
  let state=sessions.get(id);
  if(state)return state;
  if(sessions.size>=48)throw Error('session limit reached');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const suffix=crypto.createHash('sha256').update(id).digest('hex').slice(0,16);
  const dir=path.join(root,stamp+'-'+suffix+'-live-monitor');
  fs.mkdirSync(dir,{recursive:false});
  state={id,dir,lastSeq:0,lastTick:-1,count:0,gaps:0,counts:{},
    startedAt:new Date().toISOString()};
  sessions.set(id,state);
  console.log('Diagnoseordner: '+dir);
  return state;
}
function status(state){return {session:state.id,startedAt:state.startedAt,
  updatedAt:new Date().toISOString(),lastSeq:state.lastSeq,
  lastTick:state.lastTick,count:state.count,gaps:state.gaps,counts:state.counts};}
function send(res,code,body){
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}
function valid(record){
  return record&&typeof record==='object'&&!Array.isArray(record)&&
    Number.isSafeInteger(record.seq)&&record.seq>0&&
    Number.isSafeInteger(record.tick)&&record.tick>=0&&
    typeof record.kind==='string'&&record.kind.length<=80&&
    typeof record.time==='string'&&record.time.length<=40&&
    typeof record.session==='string'&&/^[a-zA-Z0-9_-]{8,90}$/.test(record.session);
}

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
    // A batch is one match/session. Two tabs and new matches may reuse
    // sequence 1, but must never share counters or result files.
    const records=data.records,session=records[0].session;
    if(records.some(r=>r.session!==session))throw Error('mixed sessions in batch');
    const state=sessionState(session);
    const fresh=records.filter(r=>r.seq>state.lastSeq);
    if(fresh.some((r,i)=>i>0&&r.seq!==fresh[i-1].seq+1))
      throw Error('non-contiguous records');
    if(fresh.length){
      state.gaps+=Math.max(0,fresh[0].seq-state.lastSeq-1);
      fs.appendFileSync(path.join(state.dir,'events.jsonl'),
        fresh.map(r=>JSON.stringify(r)).join('\n')+'\n');
      for(const r of fresh){
        state.lastSeq=r.seq;state.lastTick=r.tick;state.count++;
        state.counts[r.kind]=(state.counts[r.kind]||0)+1;
      }
      fs.writeFileSync(path.join(state.dir,'status.json'),
        JSON.stringify(status(state),null,2)+'\n');
      if(fresh.some(r=>r.kind==='game_over'))
        console.log('Spielende aufgezeichnet: '+state.dir);
    }
    send(res,200,{accepted:fresh.length,lastSeq:state.lastSeq,
      session,runDir:state.dir});
  }catch(error){send(res,400,{error:String(error.message||error)});}
});
server.listen(port,host,()=>{
  console.log('AggroBot-Monitor: http://'+host+':'+port+'/health');
  console.log('Tampermonkey-Token: '+token);
  console.log('Den Token nur im Tampermonkey-Menü des Begleitskripts eingeben.');
});
