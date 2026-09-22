'use strict';
const {hostilePlayers}=require('./enemy-metrics.cjs');
// Shared trajectory contract for both official-engine harnesses. This consumes
// only the primary bot's GameView; allied players are never enemy metrics.
const SEMANTICS='gameview-hostile-only-v1';
const SOURCE='bot GameView visible samples, every 200 engine ticks';
function sampleVisible(samples,tick,me,players){
 if(!me?.hasSpawned?.()||samples.at(-1)?.tick===tick)return null;
 const num=fn=>{try{const v=Number(fn());return Number.isFinite(v)?v:0;}catch(_){return 0;}};
 const enemies=hostilePlayers(players,me);
 const row={tick,land:num(()=>me.numTilesOwned()),home:num(()=>me.troops()),
   gold:num(()=>me.gold()),
   enemyLand:enemies.reduce((v,p)=>v+num(()=>p.numTilesOwned()),0),
   enemyTroops:enemies.reduce((v,p)=>v+num(()=>p.troops()),0)};
 samples.push(row);return row;
}
function trajectory(samples){
 if(!samples.length)return null;
 const xs=samples,peakLand=Math.max(...xs.map(x=>x.land)),
   mean=key=>xs.reduce((v,x)=>v+x[key],0)/xs.length,
   end=xs.at(-1),start=xs[0];
 return {source:SOURCE,samples:xs,summary:{peakLand,meanLand:mean('land'),
   endLand:end.land,firstLand:start.land,landChange:end.land-start.land,
   retention:peakLand>0?end.land/peakLand:0,
   peakHome:Math.max(...xs.map(x=>x.home)),
   meanHome:mean('home'),meanEnemyLand:mean('enemyLand'),
   finalEnemyLand:end.enemyLand,sampleCount:xs.length}};
}
module.exports={SEMANTICS,SOURCE,sampleVisible,trajectory};
