'use strict';
// P6: deployment identity (model/script/engine hashes) is visible in the panel
// and the diagnostic export; the fail-closed reasons are explicit; Solo and
// Run3 share the same canonical logic and shadow runtime; and the Run3
// champion reference stays unchanged (a schema-5 candidate is shadow-only, so
// it never replaces the champion placeholder).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const solo=fs.readFileSync(path.join(root,'OpenFront_Solo_AggroBot.user.js'),'utf8');
const run3=fs.readFileSync(path.join(root,'OpenFront_AggroBot_Impossible_Run3.user.js'),'utf8');

 // 1. Deployment identity is exposed in the diagnostic export and the panel.
 assert(solo.includes('function shadowModelInfo()'),'shadowModelInfo must exist');
 assert(solo.includes('function deploymentInfo()'),'deploymentInfo must exist');
 assert(solo.includes('deployment:deploymentInfo()'),'snapshot must expose deployment');
 assert(solo.includes('modelHashes:{champion:neuralModelInfo().fingerprint'),
   'provenance must record model hashes');
 assert(solo.includes('scriptVersion:VERSION'),'provenance must record script version');
 assert(solo.includes('Deployment: Modell'),'panel must show deployment identity');

 // 2. The fail-closed reasons are explicit in the candidate arm.
 assert(solo.includes('feature-drift'),'feature-drift fail-closed reason must exist');
 assert(solo.includes('failClosed:String(e?.message||e)'),'fail-closed reason must be recorded');
 assert(solo.includes('changedIntent:false'),'fail-closed must keep changedIntent false');

 // 3. Solo and Run3 share the same canonical logic and shadow runtime.
 const versionOf=s=>(s.match(/const VERSION = '([^']+)'/)||[])[1];
 assert(versionOf(solo)&&versionOf(solo)===versionOf(run3),
   'Solo and Run3 must share the same VERSION');
 const shadowBlock=s=>{
   const i=s.indexOf('  const shadowV5=(()=>{');
   const j=s.indexOf('  // GENERATED-SHADOW-V5-END',i);
   return s.slice(i,j);
 };
 assert(shadowBlock(solo).length>0&&shadowBlock(solo)===shadowBlock(run3),
   'Solo and Run3 must share the identical shadowV5 runtime');
 assert(run3.includes('function shadowModelInfo()')&&
   run3.includes('function deploymentInfo()')&&
   run3.includes('Deployment: Modell'),
   'Run3 bundle must carry the same deployment identity logic');

 // #153: live UI must not call active candidate control shadow-only.
 for(const bundle of [solo,run3]){
   assert(bundle.includes('CONTROL AKTIV (Gain '),
     'active control must be visible in both userscripts');
   assert(bundle.includes('Fallback Regelbasis: '),
     'fail-closed rule fallback must be visible in both userscripts');
   assert(bundle.includes('Auswahl durch Modell verändert'),
     'changed-intent must be visibly distinguishable');
   assert(bundle.includes('opts.shadowRankEnabled&&opts.candidateControlEnabled'),
     'control status must derive from runtime activation, not model load');
 }

 // 4. The Run3 champion reference is unchanged: the embedded champion is the
 //    reviewed schema-4 champion and the candidate placeholder stays empty.
 const modelLine=(s,name)=>{
   const prefix='const '+name+' = ';
   const line=s.split('\n').find(l=>l.includes(prefix));
   assert(line,'missing '+name);
   const i=line.indexOf(prefix)+prefix.length;
   return JSON.parse(line.slice(i).replace(/;$/,''));
 };
 const referencePath=path.join(root,'trainer','run3-champion.json');
 assert.equal(crypto.createHash('sha256')
   .update(fs.readFileSync(referencePath)).digest('hex'),
   '65589febcf8a376c9dbd0e895e4ce643d2591b1ac185270012e148a9315f7ff3',
   'Run3 reference champion file must be unchanged');
 const champion=modelLine(run3,'NEURAL_BUNDLED_MODEL');
 assert.equal(champion.schema,4);
 assert.equal(champion.weights.length,1000);
 assert.equal(JSON.stringify(champion),
   JSON.stringify(JSON.parse(fs.readFileSync(referencePath,'utf8'))),
   'Run3 bundle must embed the reviewed Run3 champion model');
 assert.equal(run3.split('const SHADOW_V5_BUNDLED_MODEL = null;').length-1,1,
   'Run3 candidate placeholder must stay empty (shadow-only candidate)');
 assert.equal(solo.split('const SHADOW_V5_BUNDLED_MODEL = null;').length-1,1,
   'Solo candidate placeholder must stay empty by default');

 // 5. The candidate is opt-in (defaults off) so rolling back to the unchanged
 //    Run3 reference is simply disabling the opt-in.
 assert(solo.includes('shadowRankEnabled:false'),
   'shadow ranking must default off (rollback to reference)');
 assert(solo.includes('candidateControlEnabled:false'),
   'candidate control must default off (rollback to reference)');
console.log('PASS deployment identity, fail-closed reasons, Solo/Run3 parity and unchanged Run3 reference');
