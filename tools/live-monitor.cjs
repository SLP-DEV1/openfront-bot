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
const maxSessions=48,idleMs=30*60*1000;
const startedAt=new Date().toISOString();
// Disk is authoritative after an in-memory session is retired. Never reuse a
// session ID in a fresh directory or reset its last accepted sequence.
function existingSession(id){
  const suffix=crypto.createHash('sha256').update(id).digest('hex').slice(0,16);
  const matches=fs.readdirSync(root).filter(name=>name.endsWith('-'+suffix+'-live-monitor'));
  for(const name of matches){
    const dir=path.join(root,name),file=path.join(dir,'status.json');
    if(!fs.existsSync(file))continue;
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    if(saved.session!==id)continue; // check the full ID, not only its hash
    if(!Number.isSafeInteger(saved.lastSeq)||saved.lastSeq<0)
      throw Error('invalid persisted session sequence');
    return {id,dir,lastSeq:saved.lastSeq,lastTick:saved.lastTick,
      count:saved.count,gaps:saved.gaps,counts:saved.counts,
      startedAt:saved.startedAt,completed:!!saved.completed,
      lastSeen:Date.parse(saved.updatedAt)||0};
  }
  return null;
}
function sessionState(id){
  let state=sessions.get(id);
  if(state){state.lastSeen=Date.now();return state;}
  if(sessions.size>=maxSessions){
    // Only completed games or long-idle sessions may leave memory. Active
    // clients keep their slot and disk files are never removed.
    const eligible=[...sessions.values()].filter(s=>
      s.completed||Date.now()-s.lastSeen>=idleMs)
      .sort((a,b)=>Number(b.completed)-Number(a.completed)||
        a.lastSeen-b.lastSeen);
    if(!eligible.length){
      const error=Error('session capacity temporarily exhausted');
      error.statusCode=503;throw error;
    }
    sessions.delete(eligible[0].id);
  }
  state=existingSession(id);
  if(!state){
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const suffix=crypto.createHash('sha256').update(id).digest('hex').slice(0,16);
    const dir=path.join(root,stamp+'-'+suffix+'-live-monitor');
    fs.mkdirSync(dir,{recursive:false});
    state={id,dir,lastSeq:0,lastTick:-1,count:0,gaps:0,counts:{},
      startedAt:new Date().toISOString(),completed:false};
  }
  state.lastSeen=Date.now();
  sessions.set(id,state);
  console.log('Diagnoseordner: '+state.dir);
  return state;
}
function status(state){return {session:state.id,startedAt:state.startedAt,
  updatedAt:new Date().toISOString(),lastSeq:state.lastSeq,
  lastTick:state.lastTick,count:state.count,gaps:state.gaps,
  counts:state.counts,completed:state.completed};}
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
        if(r.kind==='game_over')state.completed=true;
      }
      fs.writeFileSync(path.join(state.dir,'status.json'),
        JSON.stringify(status(state),null,2)+'\n');
      if(fresh.some(r=>r.kind==='game_over'))
        console.log('Spielende aufgezeichnet: '+state.dir);
    }
    send(res,200,{accepted:fresh.length,lastSeq:state.lastSeq,
      session,runDir:state.dir});
  }catch(error){send(res,error.statusCode||400,{error:String(error.message||error)});}
});
server.listen(port,host,()=>{
  console.log('AggroBot-Monitor: http://'+host+':'+port+'/health');
  console.log('Tampermonkey-Token: '+token);
  console.log('Den Token nur im Tampermonkey-Menü des Begleitskripts eingeben.');
});
