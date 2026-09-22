'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const relay=require('../tools/duo-relay.cjs');
const payload={room:'KITSU_DUO_123',ownID:'one',partnerID:'two',instance:'browser-A',match:'v1|Public|World|Large|FFA|123|_',state:{tick:100,spawn:null,candidate:505,target:null,ready:false,needHelp:false,allied:false,available:0,reserve:500,role:'spawn'}};
const request=(port,body,headers={})=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/duo',method:'POST',headers:{Origin:'https://openfront.io','Content-Type':'application/json',...headers}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);if(Array.isArray(body)){for(const part of body)req.write(part);req.end();}else req.end(body);});
(async()=>{const server=relay.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;try{
  const valid=JSON.stringify(payload);assert.equal((await request(port,valid,{'Content-Length':Buffer.byteLength(valid)})).status,200);
  const oversized='x'.repeat(relay.MAX_BODY+1);
  const declared=await request(port,oversized,{'Content-Length':Buffer.byteLength(oversized)});assert.equal(declared.status,413);assert.equal(JSON.parse(declared.text).error,'payload-too-large');
  const chunked=await request(port,['x'.repeat(3000),'x'.repeat(2000)]);assert.equal(chunked.status,413);assert.equal(JSON.parse(chunked.text).error,'payload-too-large');
  const after=await request(port,valid,{'Content-Length':Buffer.byteLength(valid)});assert.equal(after.status,200,'server remains usable after oversized requests');
  console.log('PASS Duo relay oversized bodies return deterministic 413 and server remains usable');
}finally{await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
