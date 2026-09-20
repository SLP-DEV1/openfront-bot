// Opt-in post-match Qwen Code code proposal. The installed bot is NEVER overwritten.
// Usage: node tools/benchmark/propose-live-fix.mjs --run benchmark-results/...
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--run')throw Error('Usage: node tools/benchmark/propose-live-fix.mjs --run <finished match folder>');
const dir=path.resolve(args[1]),matchPath=path.join(dir,'match.json');
const reportPath=path.join(dir,'qwen-live-report.md');
const bot=path.resolve('OpenFront_Solo_AggroBot.user.js');
for(const f of [matchPath,reportPath,bot])if(!fs.existsSync(f))throw Error('Missing: '+f);
const match=JSON.parse(fs.readFileSync(matchPath,'utf8'));
if(!['game-over','eliminated'].includes(match?.run?.termination))
  throw Error('A confirmed finished match is required (not timeout/manual stop)');
if(!['victory','defeat'].includes(match?.gameEnd?.outcome))
  throw Error('Missing confirmed game outcome');
const source=fs.readFileSync(bot,'utf8');
const sha=crypto.createHash('sha256').update(source).digest('hex');
if(match?.benchmarkMeta?.botSHA256!==sha)
  throw Error('Bot source changed since this match; do not propose against mismatched source');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'aggro-qwen-fix-'));
const candidate=path.join(dir,'proposed-AggroBot.user.js');
if(fs.existsSync(candidate))throw Error('Candidate already exists; never overwrite it');
fs.writeFileSync(path.join(work,'OpenFront_Solo_AggroBot.user.js'),source);
fs.copyFileSync(reportPath,path.join(work,'qwen-live-report.md'));
const prompt=[
  'Du bist Qwen Code. Arbeite AUSSCHLIESSLICH in diesem temporaeren Workspace.',
  'Lies qwen-live-report.md und OpenFront_Solo_AggroBot.user.js.',
  'Untersuche erst die konkreten, belegten Schwachstellen. Bericht ist eine KI-Hypothese.',
  'Fasse nur EINE kleine, nachvollziehbare Korrektur in der Userscript-Datei an.',
  'Erhalte Spielregeln, Legalitaetschecks, Allianzen, Reserve und Not-Aus.',
  'Keine Netzwerk-Aktionen, keine externen Tools, keine Shell-Befehle, keine Git-Aktionen.',
  'Fuehre keinen Code aus und aendere keine Datei ausser OpenFront_Solo_AggroBot.user.js.',
  'Wenn keine belastbare Verbesserung erkennbar ist, aendere NICHTS.',
  'Gib am Ende eine kurze deutsche Erklaerung der Aenderung und einen Testvorschlag.'
].join('\n');
const flags=['--output-format','json','--approval-mode','auto-edit',
  '--max-session-turns','12','--max-wall-time','5m'];
const windows=process.platform==='win32';
const command=windows?(process.env.ComSpec||'cmd.exe'):'qwen';
const launch=windows?['/d','/s','/c','qwen.cmd '+flags.join(' ')]:flags;
let run;
try{
  run=spawnSync(command,launch,{cwd:work,input:prompt,encoding:'utf8',
    timeout:330000,maxBuffer:1024*1024,windowsHide:true});
  fs.writeFileSync(path.join(dir,'qwen-fix-transcript.json'),
    String(run.stdout||'').slice(0,1024*1024));
  if(run.error||run.status!==0)throw Error(
    'Qwen Code failed: '+String(run.error?.message||run.stderr||run.status).slice(0,500));
  const updated=fs.readFileSync(path.join(work,'OpenFront_Solo_AggroBot.user.js'),'utf8');
  if(updated===source){console.log('Qwen proposed no code change.');process.exit(0);}
  const syntax=spawnSync(process.execPath,['--check',path.join(work,'OpenFront_Solo_AggroBot.user.js')],
    {encoding:'utf8',timeout:30000});
  if(syntax.error||syntax.status!==0)throw Error('Candidate fails node --check: '+syntax.stderr);
  fs.writeFileSync(candidate,updated,{flag:'wx'});
  console.log('PROPOSAL ONLY: '+candidate);
  console.log('Test this candidate with --bot '+candidate+'; original bot was not modified.');
}finally{fs.rmSync(work,{recursive:true,force:true});}
