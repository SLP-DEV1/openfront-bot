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
  const meta=data.benchmarkMeta||{},end=data.gameEnd||null;
  const snap=last(rec,'snapshot');
  const finale=rec[rec.length-1]||null;
  const finalLand=end?.land??finale?.land??null;
  const gameMap=meta.gameMap??null,seed=meta.seed??null;
  const outcome=['victory','defeat','incomplete'].includes(end?.outcome)?
    end.outcome:'unknown';
  return {
    file,bot:data.bot??null,map:gameMap,mapSize:meta.gameMapSize??null,
    gameMode:meta.gameMode??null,difficulty:data.difficulty??null,
    gameType:data.gameType??null,seed,outcome,
    finished:!!end&&outcome!=='unknown',
    endTick:end?.tick??finale?.tick??null,finalLand,
    attackIntents:count(rec,'attack_intent'),
    attackConfirmed:count(rec,'attack_confirmed'),
    attacksUnconfirmed:count(rec,'attack_unconfirmed'),
    buildConfirmed:count(rec,'build_confirmed'),
    portConfirmed:count(rec,'port_confirmed'),
    transportSent:count(rec,'boat_intent'),
    transportConfirmed:count(rec,'boat_confirmed'),
    landingsObserved:count(rec,'boat_arrived'),
    warshipsConfirmed:count(rec,'warship_confirmed'),
    missileLaunchesConfirmed:data.rockets?.confirmed??null,
    trainPerMinute:snap?.income?.train??null,
    tradePerMinute:snap?.income?.trade??null,
    deathOrLossReason:outcome==='defeat'?
      (end?.reason??'not provided by export'):null
  };
}
function compare(rows){
  const groups=new Map();
  for(const row of rows){
    if(!row.finished||row.seed===null||row.map===null||
      !row.gameMode||!row.difficulty||!row.bot)continue;
    const key=JSON.stringify([row.map,row.mapSize,row.gameMode,
      row.difficulty,row.seed]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  return [...groups].filter(([,items])=>new Set(items.map(x=>x.bot)).size>=2)
    .map(([key,items])=>({key:JSON.parse(key),matches:items.map(r=>({
      bot:r.bot,outcome:r.outcome,land:r.finalLand,
      attackConfirmed:r.attackConfirmed,portConfirmed:r.portConfirmed,
      landingsObserved:r.landingsObserved}))}));
}
function main(args){
  const json=args.includes('--json'),paths=args.filter(x=>x!=='--json');
  if(!paths.length){
    console.error('Usage: node tools/match-report.cjs [--json] export1.json [export2.json ...]');
    process.exitCode=2;return;
  }
  const rows=paths.map(p=>summarize(JSON.parse(fs.readFileSync(p,'utf8')),p));
  const report={matches:rows,pairedComparisons:compare(rows),
    note:'No paired comparison without explicit identical seed/map/mode/difficulty and verified completed outcome. Statistics are observations, not a win-rate guarantee.'};
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
module.exports={summarize,compare};
