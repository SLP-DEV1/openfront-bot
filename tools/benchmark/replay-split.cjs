'use strict';
// P2 – deterministic train/holdout separation for replay learning pairs.
//
// Hard rule: every frame that shares a group key stays on one side, so near
// frames of the same match are never distributed across train and holdout.
// The default key is `matchId`; pass a custom `keyOf` (e.g. matchId+player or
// matchId+style) for stronger separation "as far as possible". Assignment
// depends only on `(seed, key)` and never on frame content, so no hidden
// engine truth or feature can leak through the partition itself.

const crypto=require('node:crypto');
const normKey=r=>String(r&&r.matchId!=null?r.matchId:'unknown');

function splitReplays(records,opts){
  const o=opts&&typeof opts==='object'?opts:{};
  const seed=o.seed!=null?String(o.seed):'split';
  const ratio=o.holdoutRatio!=null?o.holdoutRatio:0.25;
  if(!Number.isFinite(ratio)||ratio<0||ratio>1)
    throw Error('holdoutRatio must be a finite number in [0,1]');
  const keyOf=o.keyOf||normKey;
  const byKey=new Map();
  for(const r of (records||[])){
    const k=keyOf(r);
    if(!byKey.has(k))byKey.set(k,[]);
    byKey.get(k).push(r);
  }
  const keys=[...byKey.keys()].sort();
  const trainKeys=[];
  const holdoutKeys=[];
  for(const k of keys){
    const h=crypto.createHash('sha256').update(seed+'|'+k,'utf8').digest();
    const u=h.readUInt32LE(0)/0x100000000; // uniform in [0,1)
    if(u<ratio)holdoutKeys.push(k);
    else trainKeys.push(k);
  }
  const train=[];
  const holdout=[];
  for(const k of keys){
    (holdoutKeys.includes(k)?holdout:train).push(...byKey.get(k));
  }
  return {
    seed,
    holdoutRatio:ratio,
    train,
    holdout,
    trainMatches:trainKeys,
    holdoutMatches:holdoutKeys,
    note:'All frames sharing a key stay on one side; assignment depends only on (seed, key), never on frame content.'
  };
}

module.exports={splitReplays};
