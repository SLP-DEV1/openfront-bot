'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','src/userscript/50-ui-and-entrypoint.js'),'utf8');
function block(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0&&b>a,'missing UI source: '+start);
 return source.slice(a,b);
}
const translation=block('  const MENU_STATUS_TRANSLATIONS=', '  function paint()');
const view=vm.createContext({});
vm.runInContext(translation+'\nthis.translate=translateMenuText;',view);
assert.equal(view.translate('Warte auf Spielzustand'),'Waiting for game state');
assert.equal(view.translate('Warte auf Spiel'),'Waiting for a match');
assert.equal(view.translate('Keine Bedrohung'),'No threats detected');
assert.equal(view.translate('Noch keine Anfrage'),'No alliance requests yet');
assert.equal(view.translate('Stadtgebiet'),'Stadtgebiet',
 'a partial word must not become a mixed German-English word');
assert.equal(view.translate('Bauplanung bereit'),'Construction planner ready');
const runner=block('  function runIntervalTask(', '  const interval=setInterval');
const runtime=vm.createContext({Promise,console:{warn:()=>{}}});
vm.runInContext(`
let errors=0,status='',generation=0,autoStartGame=null,lastPaint=1;
const PREFIX='AggroBot',game={id:'match'};
const opts={enabled:true,stopOnError:true,safeMode:false};
let persisted=0,painted=0;
function persist(){persisted++;}
function paint(){painted++;}
${runner}
globalThis.probe={run:runIntervalTask,state:()=>({
 errors,status,generation,autoStartGame,game,enabled:opts.enabled,persisted,painted,lastPaint
})};`,runtime);
(async()=>{
 for(let i=0;i<5;i++){
  runtime.probe.run(()=>Promise.reject(new Error('simulated timer failure')),'main');
  await new Promise(resolve=>setImmediate(resolve));
 }
 const s=runtime.probe.state();
 assert.equal(s.errors,5);
 assert.equal(s.enabled,false,'safety stop must disable the bot');
 assert.equal(s.autoStartGame,s.game,'a timer safety stop must block immediate re-auto-start');
 assert.equal(s.persisted,1);
 assert(s.painted>=5,'errors must update the panel');
 assert.match(s.status,/Emergency stop/);
 const sourceOfTimers=source;
 for(const name of ['step','economyStep','nukeStep'])
  assert(sourceOfTimers.includes('runIntervalTask('+name+','),
   name+' must use the guarded interval launcher');
 console.log('PASS English UI whole-word translations and protected async timer failures');
})().catch(e=>{console.error(e);process.exitCode=1;});
