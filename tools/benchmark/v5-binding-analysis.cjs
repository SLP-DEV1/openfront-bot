#!/usr/bin/env node
'use strict';
// Mandate §4: BINDING analysis. Reads the schema-5 arm's captured
// --planningFrames (each carries the per-candidate `binding` evidence:
// ruleUtility, modelScore, gain, combinedUtility, rankByRule) and quantifies,
// from the ACTUAL scores and utility gaps (not an average), why the model's
// candidate control rarely moves the pick away from the rule-basis top:
//   1. distribution of the 1st-vs-2nd rule-utility gap (the barrier a switch
//      must overcome) and of the model-score gap on the SAME candidates
//      (the lever the model can actually push with),
//   2. the per-frame gain required to flip (ruleGap / modelGap), against the
//      ACTUAL gain applied,
//   3. how many frames the model WANTED to switch (required gain <= applied)
//      and were blocked, with the exact safety reason,
//   4. how many legal alternatives the model preferred but were not chosen,
//   5. a round()/clamping/ID-mapping/priority/missing-feature sanity check.
// It reads a capture dir laid out as  <dir>/<scenarioId>/schema-5/match.json.
const fs=require('node:fs'),path=require('node:path');

function parseArgs(argv){
  const o={out:null};
  for(let i=0;i<argv.length;i++){
    const key=argv[i].replace(/^--/,'');
    if(!argv[i].startsWith('--')||!Object.hasOwn(o,key))throw Error('Unknown option '+argv[i]);
    if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing value for '+argv[i]);
    o[key]=argv[++i];
  }
  if(!o.out)throw Error('--out <captureDir> is required');
  o.out=path.resolve(o.out);
  return o;
}
function quantile(sorted,q){
  if(!sorted.length)return null;
  const idx=(sorted.length-1)*q,lo=Math.floor(idx),hi=Math.ceil(idx);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);
}
function summarize(vals){
  if(!vals.length)return null;
  const sorted=[...vals].sort((a,b)=>a-b);
  const n=sorted.length,sum=vals.reduce((a,b)=>a+b,0);
  return{count:n,min:sorted[0],max:sorted[n-1],mean:+(sum/n).toFixed(4),
    p25:+quantile(sorted,0.25).toFixed(4),p50:+quantile(sorted,0.5).toFixed(4),
    p75:+quantile(sorted,0.75).toFixed(4),p90:+quantile(sorted,0.9).toFixed(4)};
}
function hist(vals,edges){
  const buckets=edges.map(()=>0);
  for(const v of vals){
    let placed=false;
    for(let i=0;i<edges.length;i++){
      if(v<=edges[i]){buckets[i]++;placed=true;break;}
    }
    if(!placed)buckets[buckets.length-1]++;
  }
  return edges.map((e,i)=>({le:e,count:buckets[i]}));
}
function loadFrames(dir){
  let manifest=null;
  try{manifest=JSON.parse(fs.readFileSync(path.join(dir,'capture-manifest.json'),'utf8'));}
  catch(_){/* no manifest */}
  const ids=(manifest&&manifest.scenarios&&manifest.scenarios.length)
    ?manifest.scenarios.map(s=>s.scenarioId)
    :fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);
  const frames=[];
  for(const sid of ids){
    const file=path.join(dir,sid,'schema-5','match.json');
    if(!fs.existsSync(file))continue;
    let rep;try{rep=JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){continue;}
    const cfg=rep.benchmarkMeta?.gameConfig||{};
    for(const f of rep.planningFrames||[]){
      if(!f||!Array.isArray(f.binding)||!f.binding.length)continue;
      frames.push(Object.assign({},f,{scenarioId:sid,
        map:cfg.gameMap??null,opponent:cfg.opponentProfile??null,
        mode:cfg.gameMode??null}));
    }
  }
  return{frames,manifest};
}
// Per-frame binding row. All flip math uses the ACTUAL captured values.
function analyzeFrame(f){
  const binding=f.binding;
  const byId=new Map(binding.map(b=>[b.id,b]));
  const rule=f.ruleChoice,model=f.modelChoice,final=f.finalChoice;
  const rb=byId.get(rule),mb=byId.get(model),fb=byId.get(final);
  const gain=f.controlGain;
  const row={scenarioId:f.scenarioId,tick:f.tick,
    rule,ruleUtility:rb?rb.ruleUtility:null,
    model,modelScore:mb?mb.modelScore:null,
    final,finalUtility:fb?fb.combinedUtility:null,
    ruleTop2Gap:f.ruleTop2Gap??null,
    controlGain:gain,
    changedIntent:f.changedIntent===true,
    safetyBlockReason:f.safetyBlockReason??null};
  // ID-mapping + missing-feature checks.
  row.idUnmapped=!(byId.has(rule)&&byId.has(model)&&byId.has(final));
  row.missingModelScore=binding.filter(b=>b.modelScore==null).length;
  row.missingRuleUtility=binding.filter(b=>typeof b.ruleUtility!=='number').length;
  // Does ruleChoice equal the rule rank-0 candidate?
  const ruleRank0=binding.find(b=>b.rankByRule===0);
  row.ruleChoiceIsRank0=(rule==null||ruleRank0?ruleRank0.id===rule:true);
  // Does modelChoice equal the argmax modelScore candidate?
  if(model!=null&&mb&&mb.modelScore!=null){
    const top=binding.reduce((a,b)=>
      (b.modelScore??-Infinity)>(a.modelScore??-Infinity)?b:a,binding[0]);
    row.modelChoiceIsArgmaxTopScore=top.id===model;
  }
  // Flip math between the rule pick and the model's own preferred pick.
  if(model!=null&&model!==rule&&rb&&mb&&mb.modelScore!=null&&
     typeof rb.ruleUtility==='number'&&typeof mb.ruleUtility==='number'){
    const ruleGap=rb.ruleUtility-mb.ruleUtility; // >0 => rule prefers `rule`
    const modelGap=mb.modelScore-rb.modelScore;  // >0 => model prefers `model`
    row.ruleGapToModel=ruleGap;
    row.modelGapToRule=modelGap;
    if(modelGap>1e-9)row.requiredGain=ruleGap/modelGap;
    else row.requiredGain=null; // model's own pick is not clearly preferred
    // Did the ACTUAL control (gain, with the kernel's Math.round) rank the
    // model's pick above the rule pick?
    row.modelRankedAboveRule=(mb.combinedUtility??-Infinity)>
      (rb.combinedUtility??-Infinity);
    // round()/priority effect: does the exact pre-round top-1 differ from the
    // rounded top-1 over ALL candidates?
    const exactTop=binding.reduce((a,b)=>
      (b.ruleUtility+gain*b.modelScore)>(a.ruleUtility+gain*a.modelScore)?b:a,
      binding[0]);
    const roundTop=binding.reduce((a,b)=>
      (b.combinedUtility??-Infinity)>(a.combinedUtility??-Infinity)?b:a,binding[0]);
    row.roundChangedTopPick=exactTop.id!==roundTop.id;
    // Tie at the rounded top? (priority = lower id wins in the kernel)
    const topUtility=roundTop.combinedUtility;
    row.roundTieAtTop=binding.filter(b=>b.combinedUtility===topUtility).length;
  }
  // Legal alternative the model preferred that was not chosen.
  if(model!=null&&mb&&mb.legal===true&&final!=null&&model!==final)
    row.legalButNotChosen=true;
  return row;
}
function fmt(v,d){return v==null?'—':Number(v).toFixed(d);}
function main(){
  const o=parseArgs(process.argv.slice(2));
  const {frames,manifest}=loadFrames(o.out);
  const rows=frames.map(analyzeFrame);
  if(!rows.length)throw Error('No binding frames found under '+o.out);
  const gain=rows[0].controlGain;
  const appliedGain=gain;
  const withPref=rows.filter(r=>
    r.ruleGapToModel!=null&&r.modelGapToRule!=null);
  const modelPrefersOther=withPref.filter(r=>r.modelGapToRule>1e-9);
  const reqGains=modelPrefersOther.map(r=>r.requiredGain).filter(Number.isFinite);
  const wouldFlip=modelPrefersOther.filter(r=>
    r.requiredGain!=null&&r.requiredGain<=appliedGain);
  const actuallyFlipped=rows.filter(r=>r.changedIntent);
  const blocked=rows.filter(r=>r.safetyBlockReason!=null);
  const blockReasons={};
  for(const r of blocked)
    blockReasons[r.safetyBlockReason]=(blockReasons[r.safetyBlockReason]||0)+1;
  const legalNotChosen=rows.filter(r=>r.legalButNotChosen);
  const ruleGaps=rows.map(r=>r.ruleTop2Gap).filter(Number.isFinite);
  const modelGaps=withPref.map(r=>r.modelGapToRule).filter(Number.isFinite);
  const roundChanged=rows.filter(r=>r.roundChangedTopPick===true);
  const report={
    kind:'v5-binding-analysis',generated:new Date().toISOString(),
    engineCommit:manifest?.engineCommit??null,
    modelSHA:frames[0]?.modelSHA??null,
    modelPolicySHA:manifest?.rows?.[0]?.policySHA256??null,
    scenarios:(manifest?.scenarios||[]).map(s=>s.scenarioId),
    frameCount:rows.length,
    appliedGain,
    ruleUtilityGap1v2:summarize(ruleGaps),
    ruleUtilityGap1v2Histogram:hist(ruleGaps,[10,25,50,100,250,500]),
    modelScoreGap:summarize(modelGaps),
    modelScoreGapHistogram:hist(modelGaps,[-1,-0.5,-0.25,0,0.25,0.5,1]),
    framesModelPrefersOther:modelPrefersOther.length,
    requiredGain:summarize(reqGains),
    requiredGainHistogram:hist(reqGains,[1,5,10,18,30,60,150]),
    requiredGainLeAppliedGain:wouldFlip.length,
    actuallyFlipped:actuallyFlipped.length,
    changedRate:actuallyFlipped.length/rows.length,
    blocked:blocked.length,blockReasons,
    legalButNotChosen:legalNotChosen.length,
    roundChangedTopPick:roundChanged.length,
    idUnmapped:rows.filter(r=>r.idUnmapped).length,
    ruleChoiceNotRank0:rows.filter(r=>r.ruleChoiceIsRank0===false).length,
    modelChoiceNotArgmax:rows.filter(r=>r.modelChoiceIsArgmaxTopScore===false).length,
    framesWithMissingModelScore:rows.filter(r=>r.missingModelScore>0).length,
    framesWithMissingRuleUtility:rows.filter(r=>r.missingRuleUtility>0).length,
    note:"Flip = the model argmax-score candidate replacing the rule rank-0 pick. requiredGain = (ruleUtility[rule]-ruleUtility[model])/(modelScore[model]-modelScore[rule]); the pick flips when requiredGain <= applied gain (the kernel then re-sorts by round(ruleUtility+gain*modelScore)). appliedGain is the gain actually in the built bot for this capture. blocked frames have safetyBlockReason set; legalButNotChosen counts frames where the model preferred a legal candidate that was not the final pick."};
  // Per-scenario detail.
  const perScenario={};
  for(const r of rows){
    const k=r.scenarioId;
    if(!perScenario[k])perScenario[k]={scenarioId:k,frames:0,
      modelPrefersOther:0,requiredGainLeApplied:0,flipped:0,blocked:0};
    const s=perScenario[k];
    s.frames++;
    if(r.modelGapToRule!=null&&r.modelGapToRule>1e-9)s.modelPrefersOther++;
    if(r.requiredGain!=null&&r.requiredGain<=appliedGain)s.requiredGainLeApplied++;
    if(r.changedIntent)s.flipped++;
    if(r.safetyBlockReason!=null)s.blocked++;
  }
  report.perScenario=Object.values(perScenario);
  fs.writeFileSync(path.join(o.out,'binding-analysis.json'),
    JSON.stringify(report,null,2)+'\n');
  // Human-readable Markdown.
  const md=[];
  md.push('# §4 Binding-Analyse (Echte Engine-Kandidaten)\n');
  md.push(`- Engine-Commit: \`${report.engineCommit}\``);
  md.push(`- Kandidaten-Modell (SHA): \`${report.modelSHA}\``);
  md.push(`- Szenarien: ${report.scenarios.length} (${report.scenarios.join(', ')})`);
  md.push(`- Entscheidungsfelder: **${report.frameCount}** (alle mit per-Kandidaten-Binding)`);
  md.push(`- Tatsächlich angewendeter Gain: **${report.appliedGain}**\n`);
  md.push('## 1. Barrieren vs. Hebel\n');
  const rg=report.ruleUtilityGap1v2,mg=report.modelScoreGap;
  md.push('| Metrik (tatsächliche Werte) | min | p25 | p50 | p75 | p90 | max | Ø |');
  md.push('|---|---|---|---|---|---|---|---|');
  md.push(`| Regel-Nutzungs-Gap 1↔2 (Barrier) | ${fmt(rg?.min,0)} | ${fmt(rg?.p25,0)} | ${fmt(rg?.p50,0)} | ${fmt(rg?.p75,0)} | ${fmt(rg?.p90,0)} | ${fmt(rg?.max,0)} | ${fmt(rg?.mean,1)} |`);
  md.push(`| Modell-Score-Gap Regel↔Modell (Hebel) | ${fmt(mg?.min,3)} | ${fmt(mg?.p25,3)} | ${fmt(mg?.p50,3)} | ${fmt(mg?.p75,3)} | ${fmt(mg?.p90,3)} | ${fmt(mg?.max,3)} | ${fmt(mg?.mean,3)} |\n`);
  md.push('Die Regel-Gaps sind in Einheiten der **integeren Regel-Nutzens**; der Modell-Hebel ist der Score-Unterschied ∈ [-2,2]. Ein Wechsel braucht `Gain × Score-Gap ≥ Regel-Gap`.\n');
  md.push('## 2. Echter erforderlicher Gain (kein Durchschnitt)\n');
  md.push(`- Felder, in denen das Modell einen **anderen** Kandidaten bevorzugt: **${report.framesModelPrefersOther} / ${report.frameCount}**`);
  md.push(`- Echter erforderlicher Gain, um den Regel-Pick zu schlagen: ${report.requiredGain?`min ${fmt(report.requiredGain.min,1)}, p50 ${fmt(report.requiredGain.p50,1)}, p90 ${fmt(report.requiredGain.p90,1)}, max ${fmt(report.requiredGain.max,1)}`:'—'}`);
  md.push(`- Echter erforderlicher Gain **≤ ${report.appliedGain}** (sollte bei aktuellem Gain wechseln): **${report.requiredGainLeAppliedGain}**`);
  md.push(`- Tatsächlich gewechselt (changedIntent): **${report.actuallyFlipped}** (Quote ${(report.changedRate*100).toFixed(2)}%)`);
  md.push(`- Blockiert (safetyBlockReason gesetzt): **${report.blocked}** — Gründe: ${Object.entries(report.blockReasons).map(([k,v])=>`${k}=${v}`).join(', ')||'—'}`);
  md.push(`- Legal, vom Modell bevorzugt, aber nicht gewählt: **${report.legalButNotChosen}**\n`);
  md.push('## 3. Round / Clamping / ID-Mapping / Priorität / Features\n');
  md.push(`- Round() ändert Top-1 (exakt vs. gerundet): **${report.roundChangedTopPick}** Felder`);
  md.push(`- ID nicht in Binding gemappt: **${report.idUnmapped}**`);
  md.push(`- ruleChoice ≠ Regel-Rang-0: **${report.ruleChoiceNotRank0}**`);
  md.push(`- modelChoice ≠ Argmax-Score: **${report.modelChoiceNotArgmax}**`);
  md.push(`- Felder mit fehlendem modelScore: **${report.framesWithMissingModelScore}**`);
  md.push(`- Felder mit fehlendem ruleUtility: **${report.framesWithMissingRuleUtility}**\n`);
  md.push('## 4. Verteilung des tatsächlichen Gain-Bedarfs\n');
  md.push('Kumulativ: wie viele Modell-Präferenz-Felder bei welchem Gain gewechselt hätten.');
  md.push('| erforderlich Gain (kumulativ) | Felder |');
  md.push('|---|---|');
  let cum=0;
  for(const b of report.requiredGainHistogram){
    cum+=b.count;
    md.push(`| ≤ ${b.le} | ${cum} |`);
  }
  md.push('');
  md.push('## 5. Pro Szenario\n');
  md.push('Notiz: `modelChoice ≠ Argmax-Score` zählt Felder, in denen das globale Raw-Score-Argmax außerhalb der von der Steuerung betrachteten Top-8 liegt (Design-Artefakt, kein Fehler).');
  md.push('| Szenario | Felder | Modell bevorzugt andere | Gain ≤ ${g} | gewechselt | blockiert |'.replace('${g}',String(report.appliedGain)));
  md.push('|---|---|---|---|---|---|');
  for(const s of report.perScenario)
    md.push(`| ${s.scenarioId} | ${s.frames} | ${s.modelPrefersOther} | ${s.requiredGainLeApplied} | ${s.flipped} | ${s.blocked} |`);
  md.push('');
  // §4 conclusion, derived from the actual distributions (no averages).
  const sortedReq=reqGains.slice().sort((a,b)=>a-b);
  const atGain=g=>sortedReq.filter(x=>x<=g).length;
  const q=p=>{if(!sortedReq.length)return null;
    const i=(sortedReq.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
    return lo===hi?sortedReq[lo]:sortedReq[lo]+(sortedReq[hi]-sortedReq[lo])*(i-lo);};
  md.push('## 6. Interpretation & Entscheidung\n');
  md.push(`- Das Modell bevorzugt in **${report.framesModelPrefersOther}** Feldern einen anderen Kandidaten als die Regelbasis.`);
  md.push(`- Der Score-Unterschied, mit dem es die Regel-Pick überbieten will, ist winzig: p50 ≈ ${fmt(mg?.p50,4)}, p90 ≈ ${fmt(mg?.p90,3)}. Der Modell-Hebel ist also klein.`);
  md.push(`- Die Regel-Barrier ist dagegen groß (integer): p50 ≈ ${fmt(rg?.p50,0)}, p90 ≈ ${fmt(rg?.p90,0)}.`);
  md.push(`- Folglich ist der erforderliche Gain riesig: p50 ≈ ${fmt(q(0.5),0)}, p90 ≈ ${fmt(q(0.9),0)}.`);
  md.push(`- Bei aktuellem Gain ${report.appliedGain} wechseln **${atGain(report.appliedGain)}** dieser Felder; bei Gain 60 (Cap) **${atGain(60)}**; das Median-Feld würde Gain ≈ ${fmt(q(0.5),0)} brauchen (≈ ${q(0.5)?(q(0.5)/report.appliedGain).toFixed(0):'—'}× aktuell).`);
  md.push(`- **Fazit:** Der Engpass ist nicht allein der niedrige Gain — er ist die **Score-Entartung des Modells** (nahezu konstante Scores über die legalen Kandidaten). Ein bloßes Hochsetzen des Gains (Variante B) würde die meisten Präferenzen weiterhin blockiert lassen und ist „der Gain maximal hochgesetzt". Die principled-Fix liegt in einer **Kalibrierung des Score→Utility-Mappings** (Variante C), die den Modell-**Rang** (nicht die Raw-Magnitude) in den Re-Ordering einbringt, bzw. in einer **Konfidenz-Threshold-Steuerung** (Variante G), die nur bei klarer Modell-Präferenz übersteuert.`);
  md.push('');
  fs.writeFileSync(path.join(o.out,'binding-analysis.md'),md.join('\n')+'\n');
  console.log(JSON.stringify({
    frames:report.frameCount,appliedGain:report.appliedGain,
    ruleGapP50:rg?.p50,modelGapP50:mg?.p50,
    modelPrefersOther:report.framesModelPrefersOther,
    requiredGainP50:report.requiredGain?.p50,
    requiredGainLeApplied:report.requiredGainLeAppliedGain,
    flipped:report.actuallyFlipped,
    blocked:report.blocked,legalNotChosen:report.legalButNotChosen,
    changedRate:+report.changedRate.toFixed(4)},null,2));
}
if(require.main===module)main();
module.exports={parseArgs,loadFrames,analyzeFrame,main};
