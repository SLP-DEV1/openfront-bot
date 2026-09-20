'use strict';
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {observation,contextOf,progress,advice}=require('./learning.cjs');
function makeStore(filename=':memory:'){
  if(filename!==':memory:')fs.mkdirSync(path.dirname(path.resolve(filename)),{recursive:true});
  const db=new DatabaseSync(filename);
  if(filename!==':memory:')db.exec('PRAGMA journal_mode=WAL;');
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    match_id TEXT PRIMARY KEY,last_seq INTEGER NOT NULL,last_tick INTEGER NOT NULL,
    land REAL NOT NULL,home REAL NOT NULL,max_troops REAL NOT NULL,
    context TEXT NOT NULL,finished INTEGER NOT NULL DEFAULT 0,outcome TEXT
  );
  CREATE TABLE IF NOT EXISTS context_stats (
    context TEXT PRIMARY KEY,samples INTEGER NOT NULL,mean REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS experiences (
    match_id TEXT NOT NULL,seq INTEGER NOT NULL,tick INTEGER NOT NULL,
    context TEXT NOT NULL,reward REAL NOT NULL,
    PRIMARY KEY(match_id,seq)
  );
  CREATE INDEX IF NOT EXISTS ix_experience_context ON experiences(context);
  CREATE INDEX IF NOT EXISTS ix_experience_match ON experiences(match_id);`);
  db.exec(`CREATE TABLE IF NOT EXISTS qwen_advice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,match_id TEXT NOT NULL,tick INTEGER NOT NULL,
    kind TEXT NOT NULL,strategy TEXT NOT NULL,reason_code TEXT NOT NULL,
    explanation TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ix_qwen_match ON qwen_advice(match_id,tick);`);
  const insertQwen=db.prepare(`INSERT INTO qwen_advice
    (match_id,tick,kind,strategy,reason_code,explanation) VALUES(?,?,?,?,?,?)`);
  const recentQwen=db.prepare(`SELECT match_id AS matchId,tick,kind,strategy,
    reason_code AS reasonCode,explanation,created_at AS createdAt
    FROM qwen_advice ORDER BY id DESC LIMIT 20`);
  const latestQwen=db.prepare(`SELECT match_id AS matchId,tick,kind,strategy,
    reason_code AS reasonCode FROM qwen_advice
    WHERE match_id=? AND kind IN ('periodic','stagnation','threat')
    AND tick<=? ORDER BY tick DESC,id DESC LIMIT 1`);
  function saveQwenAdvice(entry){
    if(!entry||!/^([A-Za-z0-9_-]{8,96})$/.test(entry.matchId||'')||
      !Number.isSafeInteger(entry.tick)||entry.tick<0||
      !['stagnation','postmatch','threat','periodic','manual'].includes(entry.kind)||
      !['HOLD','EXPAND','ECONOMY','DEFEND','NAVAL','TECH','REPOSITION'].includes(entry.strategy)||
      !['STAGNATION','THREAT','RESOURCE','EXPANSION','ENDGAME','OTHER'].includes(entry.reasonCode)||
      typeof entry.explanation!=='string'||entry.explanation.length<3||entry.explanation.length>360)
      throw new TypeError('Invalid Qwen shadow advice');
    insertQwen.run(entry.matchId,entry.tick,entry.kind,entry.strategy,
      entry.reasonCode,entry.explanation);
  }
  const findSession=db.prepare('SELECT * FROM sessions WHERE match_id=?');
  const upsert=db.prepare(`INSERT INTO sessions(match_id,last_seq,last_tick,land,home,max_troops,context)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(match_id) DO UPDATE SET last_seq=excluded.last_seq,
      last_tick=excluded.last_tick,land=excluded.land,home=excluded.home,
      max_troops=excluded.max_troops,context=excluded.context`);
  const selectStats=db.prepare('SELECT samples,mean FROM context_stats WHERE context=?');
  const setStats=db.prepare(`INSERT INTO context_stats(context,samples,mean) VALUES(?,?,?)
    ON CONFLICT(context) DO UPDATE SET samples=excluded.samples,mean=excluded.mean`);
  const addExperience=db.prepare('INSERT INTO experiences(match_id,seq,tick,context,reward) VALUES(?,?,?,?,?)');
  const complete=db.prepare('UPDATE sessions SET finished=1,outcome=? WHERE match_id=? AND finished=0');
  const total=db.prepare('SELECT COUNT(*) AS count FROM experiences');
  function stats(context){
    const x=selectStats.get(context);
    return x?{samples:x.samples,mean:x.mean}:{samples:0,mean:0};
  }
  function observe(input){
    const o=observation(input),key=contextOf(o);
    db.exec('BEGIN IMMEDIATE');
    try{
      const prev=findSession.get(o.matchId);
      if(prev?.finished)throw new RangeError('Match already finished');
      if(prev&&(o.seq<=prev.last_seq||o.tick<=prev.last_tick))
        throw new RangeError('Stale or duplicate observation');
      let reward=null,trainedContext=null;
      if(prev&&o.tick-prev.last_tick>=240){
        reward=progress({land:prev.land,home:prev.home,max:prev.max_troops},o);
        trainedContext=prev.context;
        const old=stats(trainedContext),n=Math.min(100000,old.samples+1);
        const mean=Math.max(-1,Math.min(1,old.mean+(reward-old.mean)/Math.min(n,100)));
        setStats.run(trainedContext,n,mean);
        addExperience.run(o.matchId,o.seq,o.tick,trainedContext,reward);
      }
      upsert.run(o.matchId,o.seq,o.tick,o.land,o.home,o.max,key);
      const current=stats(key),delta=advice(current);
      db.exec('COMMIT');
      return {schema:1,matchId:o.matchId,seq:o.seq,context:key,
        samples:current.samples,mean:current.mean,...delta,
        trainedContext,reward,experienceCount:total.get().count};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  function finish(input){
    if(!input||typeof input!=='object'||!/^[A-Za-z0-9_-]{8,96}$/.test(input.matchId||'')||
      !['victory','defeat','unknown','incomplete'].includes(input.outcome))
      throw new TypeError('Invalid finish');
    // Never transform missing/ambiguous outcomes into wins or losses.
    const result=db.prepare('SELECT finished,outcome FROM sessions WHERE match_id=?').get(input.matchId);
    if(!result)return {recorded:false,reason:'No observed match'};
    if(result.finished)return {recorded:false,reason:'Already finished',outcome:result.outcome};
    complete.run(input.outcome,input.matchId);
    return {recorded:true,outcome:input.outcome};
  }
  function report(){
    return {experiences:total.get().count,
      sessions:db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
      finished:db.prepare('SELECT outcome,COUNT(*) AS count FROM sessions WHERE finished=1 GROUP BY outcome').all(),
      contexts:db.prepare('SELECT context,samples,mean FROM context_stats ORDER BY context').all()};
  }
  return {db,observe,finish,report,saveQwenAdvice,recentQwen:()=>recentQwen.all(),
    latestQwen:(id,tick)=>latestQwen.get(id,tick)||null,
    hasMatch:id=>!!findSession.get(id),close:()=>db.close()};
}
module.exports={makeStore};
