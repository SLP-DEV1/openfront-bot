// Optional Qwen Code post-generation supervisor. No match-level tool calls;
// model may suggest only bounded sigma, never replace a champion or send intents.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const safeNumber=v=>Number.isFinite(v)?v:0;
const QWEN_FLAGS=['--output-format','json','--approval-mode','plan',
  '--max-session-turns','4','--max-wall-time','2m'];
// Exported for a no-Qwen regression of Windows argument handling.
export function qwenCommand(platform=process.platform,env=process.env){
  if(platform==='win32'){
    // This command line is fully static; the prompt never enters cmd.exe
    // arguments, so special characters and newlines cannot split its argv.
    return {command:env.ComSpec||'cmd.exe',
      args:['/d','/s','/c','qwen.cmd '+QWEN_FLAGS.join(' ')]};
  }
  return {command:'qwen',args:[...QWEN_FLAGS]};
}
// Qwen Code 0.24 JSON output is a transcript: its trailing type=result may
// contain result:"" even though the assistant's final text contains valid JSON.
export function parseQwenOutput(stdout){
  const transcript=JSON.parse(stdout);
  const replies=Array.isArray(transcript)?[
    ...transcript.filter(e=>e?.type==='result'&&typeof e.result==='string'&&e.result.trim()).map(e=>e.result),
    ...transcript.filter(e=>e?.type==='assistant').flatMap(e=>
      Array.isArray(e.message?.content)?e.message.content.filter(c=>
        c?.type==='text'&&typeof c.text==='string').map(c=>c.text):[])
  ]:[typeof transcript?.result==='string'?transcript.result:'',
    typeof transcript?.sigma==='number'?JSON.stringify(transcript):''];
  const final=Array.isArray(transcript)&&replies.length?
    [...replies].reverse().find(x=>typeof x==='string'&&x.trim()):
    replies.find(x=>typeof x==='string'&&x.trim());
  if(!final)throw Error('Qwen returned no final text');
  const object=JSON.parse(final.trim());
  if(!object||typeof object!=='object'||Array.isArray(object)||
    Object.keys(object).some(k=>!['sigma','note'].includes(k))||
    typeof object.sigma!=='number'||!Number.isFinite(object.sigma)||
    object.sigma<.02||object.sigma>.75||typeof object.note!=='string'||
    object.note.length>350)throw Error('Invalid Qwen recommendation');
  return {sigma:object.sigma,note:object.note};
}
export function reviewGeneration(report,out){
  const g=report.generation;
  const prompt=[
    'Du bist Qwen Code als read-only Trainingsanalyst fuer einen OpenFront Bot.',
    'Analysiere nur diese verifizierten Zahlen einer Generation.',
    'Fuehre keine Shell-Befehle aus und aendere keine Dateien.',
    'Die Regel zum Modellaufstieg ist fest: mehr bestaetigte Siege auf getrennten',
    'Evaluations-Seeds, keine unvollstaendigen Partien. Du darfst sie nicht umgehen.',
    'Gib exakt ein JSON-Objekt mit sigma (Zahl zwischen 0.02 und 0.75)',
    'und note (kurze deutsche Begruendung) aus. Kein Markdown.',
    'Generation: '+g,
    'Sigma bisher: '+safeNumber(report.sigma),
    'Trainingsscore Parent: '+safeNumber(report.parentScore),
    'Trainingsscore Kandidat: '+safeNumber(report.trainScore),
    'Evaluierte Siege bisher: '+safeNumber(report.evaluation.incumbent.wins),
    'Evaluierte Siege Kandidat: '+safeNumber(report.evaluation.candidate.wins),
    'Promotion durch Spielresultate: '+String(report.promoted)
  ].join('\n');
  fs.writeFileSync(path.join(out,'qwen-prompt-'+g+'.txt'),prompt+'\n');
  const launch=qwenCommand(process.platform,process.env);
  // Pass the entire prompt via stdin. On Windows, npm's qwen.cmd needs
  // cmd.exe, but fixed CLI flags are never shell-concatenated with the prompt.
  const result=spawnSync(launch.command,launch.args,
    {cwd:path.resolve('.'),input:prompt,encoding:'utf8',timeout:150000,
      maxBuffer:512*1024,windowsHide:true});
  if(result.error||result.status!==0){
    const message=String(result.error?.message||result.stderr||result.status).slice(0,400);
    fs.writeFileSync(path.join(out,'qwen-error-'+g+'.txt'),message+'\n');
    console.warn('Qwen review unavailable; fixed trainer continues: '+message);
    return null;
  }
  fs.writeFileSync(path.join(out,'qwen-review-'+g+'.json'),
    String(result.stdout||'').slice(0,400000));
  try{
    const object=parseQwenOutput(result.stdout);
    console.log('Qwen: next sigma '+object.sigma+'; '+object.note.slice(0,150));
    return {sigma:object.sigma,note:object.note};
  }catch(e){
    console.warn('Qwen review ignored: '+String(e.message).slice(0,110));
    return null;
  }
}
