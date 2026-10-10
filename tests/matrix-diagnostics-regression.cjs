'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {analyze,markdown}=require('../tools/benchmark/matrix-diagnostics.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aggro-matrix-audit-'));
try{
  const make=(variant,land,observed)=>{
    const dir=path.join(temp,variant);fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir,'match.json'),JSON.stringify({
      run:{tick:3000},
      trajectory:{samples:[{tick:200,land:200},{tick:1000,land:land-100},
        {tick:3000,land}],summary:{peakLand:land,meanLand:land-50,endLand:land}}
    }));
    fs.writeFileSync(path.join(dir,'turns.jsonl'),
      JSON.stringify({turnNumber:400,intents:[{type:'build_unit'}]})+'\n'+
      JSON.stringify({turnNumber:500,intents:[{type:'attack'}]})+'\n');
    return {dir,variant,map:'World',nations:4,seed:'fixed-seed',
      termination:observed?'eliminated':'tick-limit',observed,
      outcome:observed?'defeat':'incomplete',endTick:3000};
  };
  const matrix={runs:[make('baseline',300,true),make('candidate',450,false)]};
  const report=analyze(matrix);
  assert.equal(report.rows.length,2);
  assert.equal(report.paired.length,1);
  assert.equal(report.paired[0].deltaLand1000,150);
  assert.equal(report.paired[0].deltaEndLand,150);
  assert.equal(report.paired[0].deltaFirstAttackTick,0);
  assert.equal(report.paired[0].comparable,false);
  assert.equal(report.paired[0].outcomeCandidate,'incomplete');
  assert.match(markdown(report),/Paired Impossible diagnostic/);
  console.log('PASS paired opening metrics remain measured and incomplete outcomes censored');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
