#!/usr/bin/env node
'use strict';
// Reproducible *metadata*, not a game runner or a claim of a result.
// One match is one statistical observation, regardless of participant exports.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/i.test(x);
function canonical(v){
  if(Array.isArray(v))return v.map(canonical);
  if(v&&typeof v==='object'){
    if(Object.getPrototypeOf(v)!==Object.prototype)
      throw Error('Plain JSON objects required');
    return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
  }
  if(v===null||['string','boolean'].includes(typeof v)||
      typeof v==='number'&&Number.isFinite(v))return v;
  throw Error('Non-JSON experiment value');
}
function manifest(input,assets){
  if(!input||!assets||typeof input!=='object')throw Error('Missing input/assets');
  const {matchId,seed,map,mode,botCommit,engineCommit,settings,participants,
    policy='rule-basis',observedOutcome='unknown'}=input;
  if(!matchId||typeof matchId!=='string'||!seed||
      !map||typeof map!=='string'||!['1v1','official-2v2','ffa-duo'].includes(mode)||
      !sha(botCommit)||!sha(engineCommit)||!settings||
      typeof settings!=='object'||Array.isArray(settings)||
      !Array.isArray(participants)||
      new Set(participants).size!==participants.length||
      participants.some(x=>typeof x!=='string'||!x))throw Error('Invalid experiment identity');
  if(mode==='1v1'&&participants.length!==2||
      mode==='official-2v2'&&participants.length!==4||
      mode==='ffa-duo'&&participants.length<3)
    throw Error('Participants inconsistent with match mode');
  if(!['rule-basis','run3-schema4','candidate'].includes(policy)||
      !['unknown','win','loss','draw'].includes(observedOutcome))
    throw Error('Unknown policy/outcome');
  for(const key of ['source','run3','model']){
    if(typeof assets[key]!=='string'||!assets[key].length)
      throw Error('Missing asset '+key);
  }
  const normalized=canonical(settings);
  return {schema:'aggrobot-experiment-v1',matchId,seed:String(seed),map,mode,
    botCommit:botCommit.toLowerCase(),engineCommit:engineCommit.toLowerCase(),
    policy,participantSessions:participants.length,observationUnit:'match',
    observedOutcome,settingsSha256:hash(JSON.stringify(normalized)),
    sourceSha256:hash(assets.source),run3Sha256:hash(assets.run3),
    championSha256:hash(assets.model)};
}
if(require.main===module){
  const file=process.argv[2];
  if(!file||process.argv.length!==3){
    console.error('Usage: node tools/benchmark/experiment-manifest.cjs INPUT.json');
    process.exitCode=2;
  }else{
    try{
      const root=path.resolve(__dirname,'../..');
      const input=JSON.parse(fs.readFileSync(file,'utf8'));
      const read=p=>fs.readFileSync(path.join(root,p),'utf8');
      const result=manifest(input,{
        source:read('OpenFront_Solo_AggroBot.user.js'),
        run3:read('OpenFront_AggroBot_Impossible_Run3.user.js'),
        model:read('docs/training-analysis-20260921/schema4-impossible-world-europe-20260920-run3/champion.json')
      });
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }catch(e){console.error(String(e));process.exitCode=1;}
  }
}
module.exports={manifest,canonical,hash};
