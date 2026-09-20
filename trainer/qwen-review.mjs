// Optional Qwen Code post-generation supervisor. No match-level tool calls;
// model may suggest only bounded sigma, never replace a champion or send intents.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const safeNumber=v=>Number.isFinite(v)?v:0;
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
  const windows=process.platform==='win32';
  // Qwen Code supports headless -p / --output-format json. Windows npm
  // installs typically expose qwen.cmd. No game log text enters this prompt.
  const result=spawnSync(windows?'qwen.cmd':'qwen',
    ['-p',prompt,'--output-format','json','--approval-mode','plan',
      '--max-session-turns','4','--max-wall-time','2m'],
    {cwd:path.resolve('.'),encoding:'utf8',timeout:150000,maxBuffer:512*1024,
      ...(windows?{shell:true}:{})});
  if(result.error||result.status!==0){
    const message=String(result.error?.message||result.stderr||result.status).slice(0,400);
    fs.writeFileSync(path.join(out,'qwen-error-'+g+'.txt'),message+'\n');
    console.warn('Qwen review unavailable; fixed trainer continues: '+message);
    return null;
  }
  fs.writeFileSync(path.join(out,'qwen-review-'+g+'.json'),
    String(result.stdout||'').slice(0,400000));
  try{
    const messages=JSON.parse(result.stdout);
    const reply=Array.isArray(messages)?
      [...messages].reverse().find(x=>x.type==='result')?.result:null;
    const object=JSON.parse(String(reply||'').trim());
    if(!object||typeof object!=='object'||
      Object.keys(object).some(k=>!['sigma','note'].includes(k))||
      typeof object.sigma!=='number'||!Number.isFinite(object.sigma)||
      object.sigma<.02||object.sigma>.75||typeof object.note!=='string'||
      object.note.length>350)throw Error('Invalid Qwen recommendation');
    console.log('Qwen: next sigma '+object.sigma+'; '+object.note.slice(0,150));
    return {sigma:object.sigma,note:object.note};
  }catch(e){
    console.warn('Qwen review ignored: '+String(e.message).slice(0,110));
    return null;
  }
}
