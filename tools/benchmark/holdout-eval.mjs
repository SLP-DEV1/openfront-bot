// One official-engine holdout, with fail-closed evidence verification.
// The --out directory must not exist (including after an interrupted run).
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import common from './common.cjs';
import policyV3 from '../../trainer/strategic-policy.cjs';
import policyV4 from '../../trainer/strategic-policy-v4.cjs';
import evidence from './holdout-evidence.cjs';

const args=process.argv.slice(2);
if(!args.some(a=>a==='--out')||!args.some(a=>a==='--policy'))
  throw Error('Provide --policy and an unused --out directory');
const opts=common.parse(args);
if(!opts.out)throw Error('Missing --out directory');
if(!fs.existsSync(opts.policy))throw Error('Missing model '+opts.policy);
if(!fs.existsSync(opts.bot))throw Error('Missing bot '+opts.bot);
const raw=JSON.parse(fs.readFileSync(opts.policy,'utf8'));
const model=raw?.schema===4?policyV4.validate(raw):
  raw?.schema===3?policyV3.validate(raw):
  (()=>{throw Error('Holdout requires a schema 3/4 strategic model');})();
const expected={
  policySHA256:common.digest(JSON.stringify(model)),
  botSHA256:common.digest(fs.readFileSync(opts.bot,'utf8')),
  engineCommit:opts.engineCommit,seed:opts.seed,profile:opts.profile,
  opponentProfile:opts.opponentProfile,scriptedHumans:opts.scriptedHumans,
  maxTicks:opts.ticks,map:opts.map,size:opts.size,difficulty:opts.difficulty,
  gameType:opts.gameType,gameMode:opts.gameMode,nations:opts.nations
};
common.engineInfo(opts.engine,opts.engineCommit);
const output=evidence.reserveOutputDir(opts.out);
const runner=fileURLToPath(new URL('./engine-match.mjs',import.meta.url));
const result=spawnSync(process.execPath,[runner,...args],{
  encoding:'utf8',timeout:25*60*1000,maxBuffer:32*1024*1024});
fs.writeFileSync(path.join(output,'holdout-process.log'),
  (result.stdout||'')+(result.stderr||''),{flag:'wx'});
if(result.error)throw result.error;
if(result.signal)throw Error('Benchmark terminated by '+result.signal);
if(result.status!==0)throw Error('Benchmark exited '+String(result.status));
const meta=JSON.parse(fs.readFileSync(path.join(output,'run.json'),'utf8'));
const report=JSON.parse(fs.readFileSync(path.join(output,'match.json'),'utf8'));
const verified=evidence.verifyEvidence(meta,report,expected,result.status);
common.writeJSON(path.join(output,'holdout-verified.json'),verified);
console.log(JSON.stringify({output,verified}));
