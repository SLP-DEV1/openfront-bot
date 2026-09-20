// Local-only controller around the unmodified OpenFront frontend, LocalServer and Worker.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import common from './common.cjs';
const opts=common.parse(process.argv.slice(2)),engineCommit=common.engineInfo(opts.engine);
const requireEngine=createRequire(path.join(opts.engine,'package.json'));
requireEngine('tsx/esm/api').register({tsconfig:path.join(opts.engine,'tsconfig.json')});
const enums=await import(pathToFileURL(path.join(opts.engine,'src/core/game/Game.ts')).href);
const resolve=(values,input)=>{const key=Object.keys(values).find(k=>k.toLowerCase()===input.toLowerCase());if(!key)throw Error('Unknown enum '+input);return values[key];};
const gameConfig={gameMap:resolve(enums.GameMapType,opts.map),gameMapSize:resolve(enums.GameMapSize,opts.size),
  difficulty:resolve(enums.Difficulty,opts.difficulty),gameType:'Singleplayer',gameMode:'Free For All',
  nations:opts.nations===0?'disabled':opts.nations,bots:opts.bots,donateGold:false,donateTroops:false,
  infiniteGold:false,infiniteTroops:false,instantBuild:false,randomSpawn:false};
const dir=common.outputDir(opts),source=fs.readFileSync(opts.bot,'utf8'),token=crypto.randomBytes(24).toString('hex');
const metadata={harness:'browser-localserver-worker-v1',engineCommit,botSHA256:common.digest(source),
  seed:opts.seed,gameID:common.digest(opts.seed).slice(0,8),seedSource:'sha256(seed)[0:8] -> GameStartInfo.gameID',profile:opts.profile,settings:common.profiles[opts.profile],gameConfig,maxTicks:opts.ticks,browser:true};
common.writeJSON(path.join(dir,'run.json'),metadata);
let lastSeq=0,finalized=false;
const here=path.dirname(fileURLToPath(import.meta.url));
const {createServer}=await import(pathToFileURL(requireEngine.resolve('vite')).href);
process.chdir(opts.engine);
const plugin={name:'aggrobot-local-test',configureServer(server){server.middlewares.use(async(req,res,next)=>{
  const route=req.url?.split('?')[0];if(!route?.startsWith('/__aggrobot/'))return next();
  const host=req.headers.host;
  if(host!==`127.0.0.1:${opts.port}`&&host!==`localhost:${opts.port}`){res.writeHead(403).end();return;}
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'&&route==='/__aggrobot/'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    const html=fs.readFileSync(path.join(here,'browser.html'),'utf8');
    res.end(html.replace('/*BENCHMARK_CONFIG*/',JSON.stringify({token,metadata})));return;
  }
  if(req.method==='GET'&&route==='/__aggrobot/bot.js'){res.setHeader('Content-Type','text/javascript');res.end(source);return;}
  if(req.method!=='POST'||req.headers['x-benchmark-token']!==token||finalized){res.writeHead(403).end();return;}
  try{
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8*1024*1024)throw Error('Body too large');}
    const data=JSON.parse(body);
    if(route==='/__aggrobot/events'){
      if(!Array.isArray(data)||data.length>2000)throw Error('Invalid record batch');
      let seq=lastSeq;for(const record of data){if(record.seq!==++seq)throw Error('Non-contiguous event sequence');}
      fs.appendFileSync(path.join(dir,'events.jsonl'),data.map(r=>JSON.stringify(r)+'\n').join(''));lastSeq=seq;
    }else if(route==='/__aggrobot/checkpoint'||route==='/__aggrobot/finish'){
      data.benchmarkMeta={...data.benchmarkMeta,...metadata,gameMap:gameConfig.gameMap,gameMapSize:gameConfig.gameMapSize,gameMode:gameConfig.gameMode};
      data.recording={...data.recording,streamFile:'events.jsonl',streamCount:lastSeq,
        complete:lastSeq===data.recording?.total&&data.recording?.streamErrors===0};
      common.writeJSON(path.join(dir,route.endsWith('/finish')?'match.json':'checkpoint.json'),data);
      if(route.endsWith('/finish')){finalized=true;console.log(JSON.stringify({output:dir,termination:data.run?.termination,outcome:data.gameEnd?.outcome??'unknown',records:lastSeq}));}
    }else{res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':'application/json'}).end('{"ok":true}');
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
});}};
const server=await createServer({root:opts.engine,plugins:[plugin],server:{host:'127.0.0.1',port:opts.port,strictPort:true,open:false}});
await server.listen();
console.log(`Browser benchmark: http://127.0.0.1:${opts.port}/__aggrobot/`);
console.log('Output: '+dir);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
