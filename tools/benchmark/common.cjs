'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const ENGINE_COMMIT='13b403387af01d388f8c8ed8c953b6d3a11d1457';
const IMPOSSIBLE_REFERENCE_COMMIT='bb8af015b515b3b717bd4d901074c5f4c16641cb';
function parse(argv){
  const out={engine:null,map:'World',size:'Compact',difficulty:'Medium',bots:40,nations:8,
    seed:'aggro-train-001',ticks:18000,out:null,profile:'autonomous',bot:null,policy:null,rivals:'none',port:5173,engineCommit:ENGINE_COMMIT};
  for(let i=0;i<argv.length;i++){
    const key=argv[i].replace(/^--/,'');
    if(!argv[i].startsWith('--')||!Object.hasOwn(out,key))throw Error('Unknown option '+argv[i]);
    if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value for '+argv[i]);
    const value=argv[++i];out[key]=typeof out[key]==='number'?Number(value):value;
  }
  for(const [key,min,max] of [['ticks',1,72000],['bots',0,400],['nations',0,100],['port',1024,65535]])
    if(!Number.isInteger(out[key])||out[key]<min||out[key]>max)throw Error('Invalid '+key);
  if(!out.engine)throw Error('--engine /path/to/OpenFrontIO is required');
  if(!/^[a-f0-9]{40}$/.test(out.engineCommit))throw Error('Invalid --engineCommit SHA');
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(out.seed))throw Error('Seed must contain 1–64 letters, digits, _ or -');
  if(!profiles[out.profile])throw Error('Unknown profile '+out.profile);
  const rivalStyles=out.rivals==='none'?[]:out.rivals.split(',');
  if(rivalStyles.length>4||new Set(rivalStyles).size!==rivalStyles.length||
    rivalStyles.some(s=>!['rush','economy','defense','opportunist'].includes(s)))
    throw Error('Invalid --rivals: none or a unique comma-separated subset of rush,economy,defense,opportunist');
  out.engine=path.resolve(out.engine);out.bot=path.resolve(out.bot||path.join(__dirname,'../../OpenFront_Solo_AggroBot.user.js'));
  if(out.out)out.out=path.resolve(out.out);
  return out;
}
const profiles=Object.freeze({autonomous:{fullAuto:true},
  balanced:{fullAuto:false,aggressive:80,reserve:35,actionsPerMinute:72,maxTargets:16},
  cautious:{fullAuto:false,aggressive:65,reserve:50,actionsPerMinute:60,maxTargets:16},
  expansion:{fullAuto:false,aggressive:95,reserve:25,actionsPerMinute:90,maxTargets:20}});
function engineInfo(dir,expected=ENGINE_COMMIT){
  if(!/^[a-f0-9]{40}$/.test(expected))throw Error('Invalid pinned Engine SHA');
  const commit=execFileSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(commit!==expected)throw Error(`Engine mismatch: expected ${expected}, got ${commit}. Use the documented pinned revision.`);
  const dirty=execFileSync('git',['-C',dir,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
  if(dirty)throw Error('Engine has tracked changes; use a clean checkout for reproducible tests');
  return commit;
}
function digest(text){return crypto.createHash('sha256').update(text).digest('hex');}
function outputDir(opts){
  const dir=opts.out||path.resolve('benchmark-results',new Date().toISOString().replace(/[:.]/g,'-')+'-'+opts.seed+'-'+opts.profile);
  fs.mkdirSync(dir,{recursive:true});
  if(fs.existsSync(path.join(dir,'match.json'))||fs.existsSync(path.join(dir,'events.jsonl')))throw Error('Output already contains a run: '+dir);
  return dir;
}
function writeJSON(file,data){fs.writeFileSync(file,JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');}
module.exports={parse,profiles,engineInfo,digest,outputDir,writeJSON,ENGINE_COMMIT,IMPOSSIBLE_REFERENCE_COMMIT};
