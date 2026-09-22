#!/usr/bin/env node
'use strict';
// Creates reproducible match identities only. It does not execute games and
// therefore never records an inferred win/loss result.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROFILES=Object.freeze([
  {id:'rule-basis',policy:'rule-basis',style:'current deterministic rules'},
  {id:'run3-schema4',policy:'run3-schema4',style:'frozen shipped champion'},
  {id:'early-pressure',policy:'rule-basis',style:'early pressure'},
  {id:'defensive-economy',policy:'rule-basis',style:'defensive economy'},
  {id:'counterattack',policy:'rule-basis',style:'opportunistic counterattack'},
  {id:'multi-front',policy:'rule-basis',style:'coordinated multi-front'},
  {id:'naval-tech',policy:'rule-basis',style:'naval and technology'}
]);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
export function createLeaguePlan({botCommit,engineCommit,seeds=['league-01'],
  maps=['World','Europe'],modes=['1v1'],candidate='candidate',createdAt=null}={}){
  if(!/^[a-f0-9]{40}$/i.test(botCommit||'')||
    !/^[a-f0-9]{40}$/i.test(engineCommit||''))throw Error('40-character bot/engine commit required');
  if(!Array.isArray(seeds)||!seeds.length||!Array.isArray(maps)||!maps.length)
    throw Error('Non-empty seeds and maps required');
  const opponents=PROFILES.map(x=>x.id),matches=[];
  for(const mode of modes){
    if(!['1v1','official-2v2','ffa-duo'].includes(mode))throw Error('Unsupported mode '+mode);
    for(const map of maps)for(const seed of seeds)for(const opponent of opponents){
      const key=[mode,map,seed,candidate,opponent].join('|');
      const participantCount=mode==='1v1'?2:mode==='official-2v2'?4:3;
      matches.push({matchId:'league-'+digest(key).slice(0,16),mode,map,seed:String(seed),
        candidate,opponent,participantClients:Array.from({length:participantCount},
          (_,i)=>'client-'+(i+1)),observedOutcome:'unknown',result:null});
    }
  }
  return {schema:'aggrobot-league-plan-v1',createdAt,
    botCommit:botCommit.toLowerCase(),engineCommit:engineCommit.toLowerCase(),
    observationUnit:'match',profiles:PROFILES,matches,
    promotion:{paired:true,requiredArms:['rule-basis','run3-schema4'],
      rotate:['seed','map','opponent'],unknownIsNotLoss:true,
      note:'Thresholds must be fixed before execution; this plan claims no result.'},
    execution:{performed:false,excludedFromGenerator:true}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=process.argv[2];
  if(!input){console.error('Usage: node tools/benchmark/league-plan.mjs INPUT.json [OUTPUT.json]');process.exitCode=2;}
  else try{
    const plan=createLeaguePlan(JSON.parse(fs.readFileSync(input,'utf8')));
    const json=JSON.stringify(plan,null,2)+'\n';
    if(process.argv[3])fs.writeFileSync(process.argv[3],json);else process.stdout.write(json);
  }catch(e){console.error(String(e));process.exitCode=1;}
}
