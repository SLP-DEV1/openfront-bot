#!/usr/bin/env node
'use strict';
// OpenFront Duo Relay: localhost-only, per-room, read-only strategy hints.
// No game actions, no remote interface and no persistent identifiers.
const http=require('node:http');
const port=Number(process.env.AGGROBOT_DUO_PORT||8767);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid relay port');
const host='127.0.0.1',TTL=10000,MAX=80;
const rooms=new Map();
const idOK=s=>typeof s==='string'&&s.length>=1&&s.length<=128&&
  /^[a-zA-Z0-9_.:@-]+$/.test(s);
const roomOK=s=>typeof s==='string'&&s.length>=6&&s.length<=64&&
  /^[a-zA-Z0-9_-]+$/.test(s);
const matchOK=s=>typeof s==='string'&&s.length>=3&&s.length<=260&&
  /^[a-zA-Z0-9_.:@|,-]+$/.test(s);
function validate(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||!roomOK(v.room)||
    !idOK(v.ownID)||!idOK(v.instance)||!matchOK(v.match))return false;
  if(v.auto===true){
    if(v.partnerID!=null)return false;
  }else if(!idOK(v.partnerID)||v.ownID===v.partnerID)return false;
  if(v.clear===true)return true;
  const q=v.state;
  if(!q||typeof q!=='object'||Array.isArray(q))return false;
  return (q.tick===null||Number.isInteger(q.tick)&&q.tick>=0)&&
    (q.spawn===null||Number.isSafeInteger(q.spawn)&&q.spawn>=0)&&
    (q.candidate===null||Number.isSafeInteger(q.candidate)&&q.candidate>=0)&&
    (q.target===null||idOK(q.target))&&
    (q.strikeTick==null||Number.isInteger(q.strikeTick)&&q.strikeTick>=0)&&
    typeof q.ready==='boolean'&&typeof q.needHelp==='boolean'&&
    typeof q.allied==='boolean'&&
    (q.available===null||Number.isFinite(q.available)&&q.available>=0)&&
    (q.reserve===null||Number.isFinite(q.reserve)&&q.reserve>=0)&&
    ['spawn','build','support','attack','defend','unknown'].includes(q.role);
}
function trim(now=Date.now()){
  for(const [key,room] of rooms){
    for(const [id,v] of room)if(now-v.updated>TTL)room.delete(id);
    if(!room.size)rooms.delete(key);
  }
}
function exchange(v,now=Date.now()){
  trim(now);
  // Auto rooms admit exactly two distinct live instances. A third fails
  // closed instead of silently joining the wrong duo.
  const key=v.auto===true?
    'auto|'+v.room+'|'+v.match:
    'manual|'+v.room+'|'+[v.ownID,v.partnerID].sort().join('|')+'|'+v.match;
  let room=rooms.get(key);
  if(!room){if(rooms.size>=MAX)return {status:429,body:{error:'relay-full'}};
    room=new Map();rooms.set(key,room);}
  if(v.clear===true){
    if(room.get(v.ownID)?.instance===v.instance)room.delete(v.ownID);
    if(!room.size)rooms.delete(key);
    return {status:200,body:{ok:true,partner:null}};
  }
  const existing=room.get(v.ownID);
  // A second active browser cannot impersonate an already registered ID.
  if(existing&&existing.instance!==v.instance&&now-existing.updated<TTL)
    return {status:409,body:{error:'duplicate-player-id'}};
  if(v.auto===true){
    const other=[...room.entries()].filter(([id,p])=>
      id!==v.ownID&&p.instance!==v.instance);
    if(other.length>=2)return {status:409,body:{error:'room-has-more-than-two'}};
    // The same instance cannot advertise two different current PlayerIDs.
    if([...room.entries()].some(([id,p])=>id!==v.ownID&&p.instance===v.instance))
      return {status:409,body:{error:'instance-already-registered'}};
    room.set(v.ownID,{instance:v.instance,partnerID:null,
      state:v.state,updated:now});
    const peers=[...room.entries()].filter(([id,p])=>
      id!==v.ownID&&p.instance!==v.instance);
    return {status:200,body:{ok:true,partner:peers.length===1?
      {id:peers[0][0],state:peers[0][1].state,
        ageMs:now-peers[0][1].updated}:null,expiresMs:TTL}};
  }
  room.set(v.ownID,{instance:v.instance,partnerID:v.partnerID,
    state:v.state,updated:now});
  const peer=room.get(v.partnerID);
  const paired=peer&&peer.partnerID===v.ownID&&peer.instance!==v.instance&&
    now-peer.updated<TTL;
  return {status:200,body:{ok:true,partner:paired?{
    id:v.partnerID,state:peer.state,ageMs:now-peer.updated
  }:null,expiresMs:TTL}};
}
function allowed(origin){
  return typeof origin==='string'&&
    /^https:\/\/(?:[a-z0-9-]+\.)*openfront\.io$/i.test(origin);
}
function createServer(){
  return http.createServer((req,res)=>{
    const origin=req.headers.origin;
    if(!allowed(origin)){
      res.writeHead(403,{'Content-Type':'application/json',
        'Cache-Control':'no-store'}).end('{"error":"origin-denied"}');return;
    }
    const headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin',
      'Access-Control-Allow-Methods':'POST,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
      'Access-Control-Allow-Private-Network':'true',
      'Cache-Control':'no-store','Content-Type':'application/json'};
    if(req.method==='OPTIONS'){
      res.writeHead(204,headers).end();return;
    }
    if(req.method!=='POST'||req.url!=='/duo'){
      res.writeHead(404,headers).end('{"error":"not-found"}');return;
    }
    let text='',overflow=false;
    req.on('data',chunk=>{
      text+=chunk;
      if(text.length>4096){overflow=true;req.destroy();}
    });
    req.on('end',()=>{
      let data;try{data=JSON.parse(text);}catch(_){}
      if(overflow||!validate(data)){
        res.writeHead(400,headers).end('{"error":"invalid-payload"}');return;
      }
      const result=exchange(data);
      res.writeHead(result.status,headers).end(JSON.stringify(result.body));
    });
  });
}
if(require.main===module){
  const server=createServer();
  server.listen(port,host,()=>console.log(
    '[AggroBot Duo] Nur lokal: http://'+host+':'+server.address().port+
    ' · nur OpenFront-Seiten; STRG+C stoppt den Relay.'));
}
module.exports={createServer,validate,exchange,rooms,trim,allowed,TTL};
