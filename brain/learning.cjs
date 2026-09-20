'use strict';
// Pure, bounded training policy. Only observable aggregate state is accepted.
const MODES=new Set(['BALANCED','EXPAND','ASSAULT','RECOVER','ECONOMY','TECH','LATE','DEFEND']);
const MATCH=/^[A-Za-z0-9_-]{8,96}$/;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
function observation(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||body.schema!==1||
    !MATCH.test(body.matchId||'')||!Number.isSafeInteger(body.seq)||body.seq<1||body.seq>1e9||
    !Number.isSafeInteger(body.tick)||body.tick<0||body.tick>1e9||
    !MODES.has(body.mode)||!finite(body.land,0,1e9)||
    !finite(body.home,0,1e12)||!finite(body.max,1,1e12)||
    !finite(body.incoming,0,1e12)||!finite(body.strongest,0,1e12))
    throw new TypeError('Invalid aggregate observation');
  return {matchId:body.matchId,seq:body.seq,tick:body.tick,mode:body.mode,
    land:body.land,home:body.home,max:body.max,incoming:body.incoming,strongest:body.strongest};
}
function contextOf(o){
  return o.mode+':'+(o.incoming>0||o.strongest>Math.max(1,o.home)*1.1?'THREAT':'SAFE');
}
function progress(previous,current){
  return clamp(.75*(current.land-previous.land)/Math.max(100,previous.land)+
    .25*(current.home-previous.home)/Math.max(1,previous.max),-1,1);
}
function advice(stats){
  if(!stats||stats.samples<3)return {aggressiveDelta:0,reserveDelta:0};
  const signal=clamp(stats.mean*Math.min(1,(stats.samples-2)/15),-1,1);
  return {aggressiveDelta:clamp(Math.round(signal*5),-5,5),
    reserveDelta:clamp(-Math.round(signal*4),-4,4)};
}
module.exports={MODES,MATCH,clamp,observation,contextOf,progress,advice};
