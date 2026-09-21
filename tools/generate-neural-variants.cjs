'use strict';
// Neural O/W are generated from the same main userscript. The sole intentional
// O variant is the old 1000-tick opening; W keeps the world-map opening.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'OpenFront_Solo_AggroBot.user.js'),'utf8');
const marker='tick<(largeMap()?2400:1000) && items.some(g=>g.id===null&&!g.fallout)';
if(main.split(marker).length!==2)throw Error('Opening variant anchor changed');
const variants={
  'OpenFront_Solo_AggroBot_Neural_O.user.js':main.replace(marker,
    'tick<1000 && items.some(g=>g.id===null&&!g.fallout)'),
  'OpenFront_Solo_AggroBot_Neural_W.user.js':main
};
const check=process.argv.includes('--check');
for(const [name,content] of Object.entries(variants)){
  const dest=path.join(root,name);
  if(check){
    if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==content)
      throw Error('Stale generated userscript: '+name);
    console.log('PASS generated userscript: '+name);
  }else{
    fs.writeFileSync(dest,content);
    console.log('Generated '+name);
  }
}
