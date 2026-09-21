'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../tools/benchmark/browser.html'),'utf8');
const first=html.indexOf('async function finish(reason,error){');
const last=html.indexOf("\n$('start').onclick",first);
assert(first>=0&&last>first,'finish function missing');
const finishCode=html.slice(first,last);
async function scenario(failRoute){
  const controls={stop:{disabled:false},status:{textContent:''},
    details:{textContent:''}};
  const calls=[],snapshot={recording:{total:2,streamErrors:0},records:[]};
  let snapshots=0,stops=0,failures=0;
  const scope={
    $:key=>controls[key],Date,JSON,String,Error,clearInterval:()=>{},
    post:async(route,data)=>{
      calls.push(route);
      if(route===failRoute&&failures++===0)throw Error('network interrupted');
    },
    frame:null,poll:1,done:false,finishPromise:null,finishRecord:null,
    pending:[{seq:1},{seq:2}],spawned:true,startTime:Date.now()-100,
    bot:{status:()=>({tick:150,alive:true}),snapshot:()=>{
      snapshots++;return snapshot;},stop:()=>{stops++;}}
  };
  vm.createContext(scope);
  vm.runInContext('async function flush(){\n'+
    '  if(pending.length){const batch=pending;pending=[];\n'+
    "  try{await post('events',batch);}catch(e){pending.unshift(...batch);throw e;}}\n"+
    '}\n'+finishCode+'\nthis.callFinish=finish;',scope);
  await assert.rejects(()=>scope.callFinish('manual-stop'),/network interrupted/);
  assert.equal(scope.done,false);
  assert.equal(controls.stop.disabled,false,'retry remains clickable');
  assert.equal(scope.pending.length,failRoute==='events'?2:0);
  await scope.callFinish('manual-stop');
  assert.equal(scope.done,true);
  assert.equal(snapshots,1,'retry must not replace frozen evidence');
  assert.equal(stops,1,'controller stops game only once');
  assert.equal(controls.stop.disabled,true);
  assert.equal(calls.filter(x=>x==='finish').length,
    failRoute==='finish'?2:1);
}
(async()=>{
  await scenario('events');
  await scenario('finish');
  console.log('PASS browser finalization retries event and finish writes without new snapshot');
})().catch(e=>{console.error(e);process.exitCode=1;});
