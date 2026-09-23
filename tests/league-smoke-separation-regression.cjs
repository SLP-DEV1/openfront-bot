'use strict';
// P1 (plan.md box: keep --smoke strictly separate from real league/long
// matches; verified opponent spawn with a real bot hash). Verifies league.cjs
// enforces fixed smoke conditions, rejects conflicting smoke options, records
// the real bot SHA-256, and keeps the league plan distinct from smoke.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
  crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const node=process.execPath,
  league=path.join(__dirname,'..','tools','benchmark','league.cjs'),
  engine=path.join(__dirname,'..','..','OpenFrontIO'),
  bot=path.join(__dirname,'..','OpenFront_Solo_AggroBot.user.js');
if(!fs.existsSync(engine)){
  console.log('SKIP league smoke separation (no local OpenFrontIO)');
  process.exit(0);
}
const botHash=crypto.createHash('sha256').update(fs.readFileSync(bot))
  .digest('hex');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'league-smoke-'));
try{
  const smokeOut=path.join(tmp,'smoke');
  const r=spawnSync(node,[league,'--smoke','--engine',engine,'--out',smokeOut],
    {encoding:'utf8'});
  assert.equal(r.status,0,'smoke dry-run should plan: '+r.stderr+r.stdout);
  const plan=JSON.parse(fs.readFileSync(
    JSON.parse(r.stdout.trim()).plan,'utf8'));
  assert.equal(plan.smoke,true,'smoke plan flagged');
  assert.equal(plan.participants,2,'smoke is a 2-participant protocol');
  assert.equal(plan.gameMode,'FFA','smoke is FFA');
  assert.equal(plan.ticks,700,'smoke uses the fixed tick limit');
  assert.deepEqual(plan.matches.map(m=>m.seed),
    ['league-smoke-001','league-smoke-002'],'smoke seeds are fixed');
  assert.equal(plan.botSHA256,botHash,'plan records the real bot SHA-256');
  // --smoke mit konfligierenden Optionen wird abgelehnt (strenge Trennung).
  const bad=spawnSync(node,[league,'--smoke','--seeds','x','--engine',engine,
    '--out',path.join(tmp,'bad')],{encoding:'utf8'});
  assert.notEqual(bad.status,0,'conflicting smoke option must fail');
  assert.match(String(bad.stderr)+String(bad.stdout),/fixed FFA\/full-bot/);
  // Der Liga-Plan ist von Smoke getrennt (andere Seeds/Ticks, kein Flag).
  const fullOut=path.join(tmp,'full');
  const r2=spawnSync(node,[league,'--engine',engine,'--out',fullOut],
    {encoding:'utf8'});
  assert.equal(r2.status,0,'league dry-run should plan: '+r2.stderr+r2.stdout);
  const full=JSON.parse(fs.readFileSync(
    JSON.parse(r2.stdout.trim()).plan,'utf8'));
  assert.equal(full.smoke,false,'league plan is not smoke');
  assert.equal(full.ticks,18000,'league uses the long tick limit');
  assert.notEqual(full.matches.length,plan.matches.length,
    'league and smoke use different match sets');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('PASS P1 strict smoke/league separation with real bot-hash provenance');
