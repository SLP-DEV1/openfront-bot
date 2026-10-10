'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','src/userscript/00-bootstrap.js'),'utf8');
function block(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert(a>=0&&b>a,'missing canonical Duo source: '+start);
  return source.slice(a,b);
}
const configured=block('  function duoConfigured(){','  function duoPartnerID(){');
const key=block('  function duoMatchKey(){','  // Presentation only:');
const context=vm.createContext({window:{location:{pathname:'/game'}}});
vm.runInContext(`
let game=null;
const opts={duoEnabled:true,duoRoom:'TEST_ROOM_12'};
const duoID=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:@-]+$/.test(x);
const safeID=x=>x?.id?.()??null;
const myPlayer=()=>game?.myPlayer?.();
${configured}
${key}
globalThis.probe={
  setGame:value=>{game=value;},
  configured:duoConfigured,
  key:duoMatchKey
};`,context);
const makeGame=id=>({
  gameID:()=>id,
  myPlayer:()=>({id:()=> 'player-1'}),
  config:()=>({gameConfig:()=>({
    gameType:'Private',gameMap:'World',gameMapSize:'Large',
    gameMode:'Team',seed:12345
  })})
});
context.probe.setGame(makeGame('lobby-AAAA'));
const first=context.probe.key();
assert(context.probe.configured(),'valid live GameID permits local Duo');
assert(first.includes('lobby-AAAA'),'fingerprint must contain the real GameView ID');
context.probe.setGame(makeGame('lobby-BBBB'));
assert.notEqual(context.probe.key(),first,
  'separate games with identical settings and URL must never share a key');
context.probe.setGame(makeGame('lobby-AAAA'));
assert.equal(context.probe.key(),first,
  'two browsers in the same game must compute the same key');
context.probe.setGame(makeGame(null));
assert.equal(context.probe.configured(),false,
  'unidentified games must not enter the local Duo relay');
console.log('PASS Duo keys use authoritative live gameID, isolate lobbies and fail closed');
