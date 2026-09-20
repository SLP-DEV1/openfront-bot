'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {makeStore}=require('./store.cjs');
const {makeAdvisor,configFromEnv}=require('./qwen.cjs');
const ORIGIN=/^https:\/\/(?:[a-z0-9-]+\.)*openfront\.io$/i;
const LOCAL_ORIGIN=/^http:\/\/(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/i;
function authToken(dir){
  const env=process.env.AGGROBOT_TOKEN;
  if(env){if(env.length<24||env.length>256)throw Error('AGGROBOT_TOKEN must have 24-256 characters');return env;}
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const filename=path.join(dir,'auth-token');
  if(fs.existsSync(filename)){
    const value=fs.readFileSync(filename,'utf8').trim();
    if(!/^[a-f0-9]{64}$/.test(value))throw Error('Invalid stored auth token');
    return value;
  }
  const token=crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(filename,token+'\n',{flag:'wx',mode:0o600});
  return token;
}
function createServer({token,store,advisor=null}){
  if(typeof token!=='string'||token.length<24)throw Error('A token of at least 24 characters is required');
  if(!store)throw Error('A store is required');
  return http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    const allowed=!origin||ORIGIN.test(origin)||LOCAL_ORIGIN.test(origin);
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(allowed&&origin){
      headers['Access-Control-Allow-Origin']=origin;
      headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers']='Content-Type, X-Aggrobot-Token';
      headers['Access-Control-Allow-Private-Network']='true';
    }
    const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
    if(!allowed)return send(403,{error:'Origin rejected'});
    if(req.method==='OPTIONS')return send(204,{});
    if(req.method==='GET'&&req.url==='/health')return send(200,{status:'ready',schema:1});
    if(req.headers['x-aggrobot-token']!==token)return send(401,{error:'Invalid token'});
    if(req.method==='GET'&&req.url==='/v1/report')return send(200,store.report());
    if(req.method==='GET'&&req.url==='/v1/qwen')return send(200,{status:advisor?.status()||{enabled:false},recent:store.recentQwen()});
    if(req.url==='/v1/qwen/test'){
      if(req.method!=='POST')return send(405,{error:'Use POST'});
      if(!advisor?.manualTest)return send(503,{error:'Qwen advisor unavailable'});
      const probe=advisor.manualTest();
      return send(probe.accepted?202:409,probe);
    }
    if(req.method!=='POST'||!['/v1/observe','/v1/finish'].includes(req.url))
      return send(404,{error:'Not found'});
    let raw='';
    try{
      for await(const chunk of req){
        raw+=chunk.toString('utf8');
        if(Buffer.byteLength(raw)>16384)return send(413,{error:'Payload too large'});
      }
      const data=JSON.parse(raw);
      const output=req.url==='/v1/observe'?store.observe(data):store.finish(data);
      // Fire-and-forget: slow/occupied llama.cpp cannot hold open a game request.
      if(advisor){
        if(req.url==='/v1/observe')advisor.onObservation(data);
        else if(output.recorded)advisor.onFinish(data.matchId,data.outcome);
      }
      return send(200,output);
    }catch(e){
      if(e instanceof TypeError||e instanceof RangeError||e instanceof SyntaxError)
        return send(400,{error:e.message});
      console.error('Brain request failure',e);
      return send(500,{error:'Internal error'});
    }
  });
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length>2||args[0]&&args[0]!=='--port')throw Error('Usage: node brain/server.cjs [--port 8765]');
  const port=args.length===2?Number(args[1]):8765;
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
  const dir=path.resolve(__dirname,'data'),token=authToken(dir),store=makeStore(path.join(dir,'experiences.sqlite'));
  const qwenConfig=configFromEnv();
  const advisor=makeAdvisor({store,config:qwenConfig,logger:(label,value)=>console.log(label,value)});
  const server=createServer({token,store,advisor});
  server.listen(port,'127.0.0.1',()=>{
    console.log('AggroBot Brain listening on http://127.0.0.1:'+port);
    console.log('Browser token (paste into Tampermonkey panel): '+token);
    console.log('Brain DB: '+path.join(dir,'experiences.sqlite'));
    console.log('Qwen shadow advisor: '+(qwenConfig.enabled?'ENABLED':'OFF')+
      ' · '+qwenConfig.model+' · 127.0.0.1:8080');
  });
  for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>server.close(()=>{store.close();process.exit(0);}));
}
module.exports={createServer,authToken};
