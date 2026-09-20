'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('OpenFront_Solo_AggroBot.user.js','utf8');
const begin=src.indexOf("  // Hybrid learning: bounded contextual adjustments;");
const end=src.indexOf("  const escapeHTML =",begin);
assert(begin>0&&end>begin,'learning module must be embedded');
const block=src.slice(begin,end);
const memory=new Map();
const events=[];
const context={localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
  opts:{learningEnabled:true,fullAuto:true},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  number:(f,d=0)=>{try{return Number(f());}catch{return d;}},
  telemetry:(...v)=>events.push(v)};
vm.createContext(context);
vm.runInContext(block+'\nglobalThis.api={learnKey,learnObserve,learnAdjust,learnFinish,saveLearn,get:()=>learn,reset:()=>{learnMatch={sample:null,key:null,finished:false}}};',context);
const {api}=context;
const soldier={home:1000,incoming:0,strongest:0,max:1000};
assert.equal(api.learnKey('ASSAULT',soldier),'ASSAULT:SAFE');
assert.equal(api.learnKey('ASSAULT',{...soldier,incoming:10}),'ASSAULT:THREAT');
assert.equal(api.learnKey('UNRECOGNIZED',soldier),null);
const me={hasSpawned:()=>true,isAlive:()=>true,numTilesOwned:()=>1000+context.land,
  troops:()=>500+context.troops};
context.land=0;context.troops=0;
api.learnObserve(0,me,soldier,'ASSAULT');
api.learnObserve(200,me,soldier,'ASSAULT');
assert.equal(api.get().updates,0,'short intervals do not train');
for(let i=1;i<=4;i++){context.land=i*100;api.learnObserve(i*240,me,soldier,'ASSAULT');}
assert.equal(api.get().updates,4);
assert(api.get().contexts['ASSAULT:SAFE'].mean>0);
const orig={aggressive:92,reserve:29};
const learned=api.learnAdjust(orig,'ASSAULT',soldier,false);
assert(learned.aggressive>=92&&learned.aggressive<=97);
assert(learned.reserve>=25&&learned.reserve<=29);
assert.equal(api.learnAdjust(orig,'ASSAULT',soldier,true),orig,'emergency bypasses learning');
assert.equal(api.learnAdjust(orig,'ASSAULT',{...soldier,incoming:2},false).aggressive,92);
api.learnFinish('unknown');assert.equal(api.get().lastResult,null);
api.learnFinish('victory');assert.equal(api.get().lastResult,null,'unknown finish is idempotent');
api.reset();api.learnFinish('victory');assert.equal(api.get().lastResult,'victory');
assert(memory.has('of-aggrobot-learning-v1'),'persist separately from options');
context.opts.learningEnabled=false;api.reset();api.learnObserve(0,me,soldier,'ASSAULT');
api.learnObserve(500,me,soldier,'ASSAULT');assert.equal(api.get().updates,4);
assert.equal(api.learnAdjust(orig,'ASSAULT',soldier,false).aggressive,92);
console.log('Hybrid learning regression: PASS');
