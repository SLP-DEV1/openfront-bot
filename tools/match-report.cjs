'use strict';
/**
 * Issue #12: summarize real AggroBot JSON exports, never simulated wins.
 * Usage: node tools/match-report.cjs exported-match-1.json exported-match-2.json
 * Optional: JSON output: node tools/match-report.cjs --json file1.json file2.json
 *
 * A paired baseline needs the SAME explicit seed/map/mode/difficulty and
 * distinct bot releases; never compare matches with unknown seeds.
 */
const fs=require('node:fs');
function count(records,kind){return records.filter(r=>r?.kind===kind).length;}
function last(records,kind){return [...records].reverse().find(r=>r?.kind===kind)||null;}
function summarize(data,file='<input>'){
  const rec=Array.isArray(data.records)?data.records:[];
  const counts=data.recording?.counts;
  const total=kind=>Number.isSafeInteger(counts?.[kind])?counts[kind]:count(rec,kind);
  const meta=data.benchmarkMeta||{},end=data.gameEnd||null;
  const snap=last(rec,'snapshot');
  const finale=rec[rec.length-1]||null;
  const finalLand=end?.land??data.finalState?.land??finale?.land??null;
  const gameMap=meta.gameMap??null,seed=meta.seed??null;
  const outcome=['victory','defeat','incomplete'].includes(end?.outcome)?
    end.outcome:'unknown';
  return {
    file,bot:data.bot??null,map:gameMap,mapSize:meta.gameMapSize??null,
    gameMode:meta.gameMode??null,difficulty:data.difficulty??null,
    gameType:data.gameType??null,seed,outcome,
    finished:!!end&&['victory','defeat'].includes(outcome),
    termination:data.run?.termination??null,
    harness:meta.harness??null,engineCommit:meta.engineCommit??null,
    botSHA256:meta.botSHA256??null,profile:meta.profile??null,
    seedSource:meta.seedSource??null,gameConfig:meta.gameConfig??null,maxTicks:meta.maxTicks??null,
    recordingComplete:data.recording?.complete??(data.recording?data.recording.dropped===0:null),
    recordedEvents:data.recording?.total??rec.length,
    endTick:end?.tick??data.run?.tick??data.finalState?.tick??finale?.tick??null,finalLand,
    attackIntents:total('attack_intent'),
    attackConfirmed:total('attack_confirmed'),
    attacksUnconfirmed:total('attack_unconfirmed'),
    buildConfirmed:total('build_confirmed'),
    portConfirmed:total('port_confirmed'),
    transportSent:total('boat_intent'),
    transportConfirmed:total('boat_confirmed'),
    landingsObserved:total('boat_arrived'),
    warshipRequests:total('warship_intent'),
    warshipsConfirmed:total('warship_confirmed'),
    warshipsUnconfirmed:total('warship_unconfirmed'),
    spawnConfirmed:total('spawn_confirmed')>0,
    missileLaunchesConfirmed:data.rockets?.confirmed??null,
    trainPerMinute:snap?.income?.train??null,
    tradePerMinute:snap?.income?.trade??null,
    deathOrLossReason:outcome==='defeat'?
      (end?.reason??'not provided by export'):null
  };
}
function comparisonKey(row){
  // Missing engine/config identity cannot establish a controlled comparison.
  if(!row.finished||row.seed===null||!row.seedSource||!row.harness||!row.engineCommit||
    !row.gameConfig||!row.botSHA256||!row.profile||!row.maxTicks)return null;
  const ordered=Object.fromEntries(Object.entries(row.gameConfig).sort(([a],[b])=>a.localeCompare(b)));
  return JSON.stringify([row.harness,row.engineCommit,row.seed,row.seedSource,ordered,row.maxTicks]);
}
function compare(rows){
  const groups=new Map();
  for(const row of rows){
    const key=comparisonKey(row);if(!key)continue;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
  }
  return [...groups].filter(([,items])=>new Set(items.map(x=>x.botSHA256+':'+x.profile)).size>=2)
    .map(([key,items])=>({key:JSON.parse(key),matches:items.map(r=>({
      bot:r.bot,botSHA256:r.botSHA256,profile:r.profile,outcome:r.outcome,land:r.finalLand,
      endTick:r.endTick,attackConfirmed:r.attackConfirmed,portConfirmed:r.portConfirmed,
      warshipsConfirmed:r.warshipsConfirmed,landingsObserved:r.landingsObserved}))}));
}
function findings(row){
  const out=[];
  if(!row.finished)out.push('No verified completed result; exclude from win-rate denominator.');
  if(row.recordingComplete===false)out.push('Recording is incomplete; inspect stream/checkpoint before drawing conclusions.');
  if(row.warshipsUnconfirmed>0)out.push(`${row.warshipsUnconfirmed} warship requests lacked confirmation.`);
  if(row.attacksUnconfirmed>0)out.push(`${row.attacksUnconfirmed} attacks lacked confirmation.`);
  if(row.transportSent>row.transportConfirmed)out.push(`${row.transportSent-row.transportConfirmed} transport requests lacked a visible ship.`);
  return out;
}
function main(args){
  const json=args.includes('--json'),paths=args.filter(x=>x!=='--json');
  if(!paths.length){
    console.error('Usage: node tools/match-report.cjs [--json] export1.json [export2.json ...]');
    process.exitCode=2;return;
  }
  const rows=paths.map(p=>summarize(JSON.parse(fs.readFileSync(p,'utf8')),p));
  const report={matches:rows,pairedComparisons:compare(rows),
    findings:rows.map(row=>({file:row.file,items:findings(row)})),
    note:'Pairing requires verified completion and identical engine, harness, seed source, full game config and tick limit. Engine matches do not verify browser/multiplayer performance.'};
  if(json)console.log(JSON.stringify(report,null,2));
  else for(const m of rows)console.log([
    m.file,m.bot,m.map,m.difficulty,m.gameMode,
    'seed='+String(m.seed),'outcome='+m.outcome,
    'land='+String(m.finalLand),
    'attacks='+m.attackConfirmed+'/'+m.attackIntents,
    'ports='+m.portConfirmed,'landings='+m.landingsObserved
  ].join(' | '));
  if(!json)console.log('Valid paired comparisons:',report.pairedComparisons.length);
}
if(require.main===module)main(process.argv.slice(2));
module.exports={summarize,compare,comparisonKey,findings};

