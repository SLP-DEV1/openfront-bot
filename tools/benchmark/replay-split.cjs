'use strict';
// P2 – deterministic train/holdout separation for replay learning pairs.
//
// Hard rule: matchId is atomic even when keyOf returns a player/style key.
// Shared custom keys join *whole matches* into connected components; never
// split a match because two players or styles give it different custom keys.
// Assignment depends only on seed and component identity, not frame content.

const crypto=require('node:crypto');
const normKey=r=>String(r&&r.matchId!=null?r.matchId:'unknown');

function splitReplays(records,opts){
  const o=opts&&typeof opts==='object'?opts:{};
  const seed=o.seed!=null?String(o.seed):'split';
  const ratio=o.holdoutRatio!=null?o.holdoutRatio:0.25;
  if(!Number.isFinite(ratio)||ratio<0||ratio>1)
    throw Error('holdoutRatio must be a finite number in [0,1]');
  const keyOf=o.keyOf||normKey;
  const byMatch=new Map(),customOwner=new Map(),parent=new Map();
  const find=k=>{
    const p=parent.get(k);
    if(p===k)return k;
    const root=find(p);
    parent.set(k,root);
    return root;
  };
  const unite=(a,b)=>{
    const x=find(a),y=find(b);
    if(x!==y){const low=x<y?x:y,high=x<y?y:x;parent.set(high,low);}
  };
  for(const r of records||[]){
    if(r?.matchId==null||String(r.matchId)==='')
      throw Error('Replay split requires a non-empty matchId for every frame');
    const matchId=normKey(r);
    if(!byMatch.has(matchId)){byMatch.set(matchId,[]);parent.set(matchId,matchId);}
    byMatch.get(matchId).push(r);
  }
  // First ingest every match; then join matches sharing a custom identity.
  // A single match with several players remains atomic by construction.
  for(const [matchId,rows] of byMatch){
    for(const row of rows){
      const k=String(keyOf(row));
      if(customOwner.has(k))unite(matchId,customOwner.get(k));
      else customOwner.set(k,matchId);
    }
  }
  const components=new Map();
  for(const [matchId,rows] of byMatch){
    const root=find(matchId);
    if(!components.has(root))components.set(root,{matchIds:[],rows:[]});
    components.get(root).matchIds.push(matchId);
    components.get(root).rows.push(...rows);
  }
  const train=[],holdout=[],trainMatches=[],holdoutMatches=[];
  for(const key of [...components.keys()].sort()){
    const group=components.get(key);
    const h=crypto.createHash('sha256').update(seed+'|'+key,'utf8').digest();
    const u=h.readUInt32LE(0)/0x100000000;
    const target=u<ratio?holdout:train;
    const ids=u<ratio?holdoutMatches:trainMatches;
    target.push(...group.rows);ids.push(...group.matchIds.sort());
  }
  trainMatches.sort();holdoutMatches.sort();
  const trainSet=new Set(trainMatches);
  if(holdoutMatches.some(k=>trainSet.has(k)))
    throw Error('Replay split leaked a match across train and holdout');
  return {
    seed,holdoutRatio:ratio,train,holdout,trainMatches,holdoutMatches,
    note:'Atomic match groups; shared custom player/style keys join entire matches, never frames.'
  };
}

module.exports={splitReplays};
