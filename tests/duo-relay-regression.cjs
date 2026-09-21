'use strict';
const assert=require('node:assert/strict');
const {once}=require('node:events');
const relay=require('../tools/duo-relay.cjs');
const mk=(ownID,partnerID,instance,match='v1|Public|World|Large|FFA|123|_')=>({
  room:'KITSU_DUO_123',ownID,partnerID,instance,match,
  state:{tick:100,spawn:null,candidate:505,target:null,ready:false,
    needHelp:false,allied:false,available:0,reserve:500,role:'spawn'}
});
(async()=>{
  relay.rooms.clear();
  const A=mk('one','two','browser-A'),B=mk('two','one','browser-B');
  assert.equal(relay.exchange(A,1000).body.partner,null);
  assert.equal(relay.exchange(B,1001).body.partner.id,'one');
  assert.equal(relay.exchange(A,1002).body.partner.id,'two');
  assert.equal(relay.exchange({...A,instance:'clone'},1003).status,409,
    'duplicate ID must not displace active browser');
  assert.equal(relay.exchange({...B,match:'v1|different'},1004).body.partner,null,
    'match context must scope state');
  assert.equal(relay.exchange(A,15000).body.partner,null,'expired peer is not connected');
  assert.equal(relay.exchange({...A,clear:true},15001).body.partner,null);
  assert.equal(relay.validate({...A,partnerID:'one'}),false);
  assert.equal(relay.validate({...A,state:{...A.state,target:'../bad'}}),false);
  assert.equal(relay.validate({...A,state:{...A.state,strikeTick:345}}),true);
  assert.equal(relay.validate({...A,state:{...A.state,strikeTick:-3}}),false);
  assert.equal(relay.validate({...A,state:{...A.state,strikeTick:'345'}}),false);
  relay.rooms.clear();
  const server=relay.createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const endpoint='http://127.0.0.1:'+server.address().port+'/duo';
  const call=(data,origin='https://openfront.io')=>fetch(endpoint,{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify(data)});
  try{
    assert.equal((await call(A,'https://evil.example')).status,403);
    const preflight=await fetch(endpoint,{method:'OPTIONS',
      headers:{Origin:'https://play.openfront.io',
        'Access-Control-Request-Private-Network':'true'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-private-network'),'true');
    assert.equal((await call({...A,ownID:'not valid'})).status,400);
    const first=await call(A);assert.equal(first.status,200);
    assert.equal((await first.json()).partner,null);
    const second=await call(B);assert.equal((await second.json()).partner.id,'one');
    const dup=await call({...A,instance:'different'});
    assert.equal(dup.status,409);
    console.log('PASS Duo relay: loopback HTTP, CORS/PNA, mutual IDs, match isolation, TTL and duplicate veto');
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
