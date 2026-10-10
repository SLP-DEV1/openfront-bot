'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..',
  'src/userscript/50-ui-and-entrypoint.js'),'utf8');
const start=source.indexOf('  // Skip expensive DOM replacement');
const end=source.indexOf("  document.addEventListener('keydown'",start);
assert(start>=0&&end>start,'UI painter markers must exist');
const painter=source.slice(start,end);
assert.match(painter,/if\(nextMarkup!==lastPanelMarkup\)/,
  'panel redraw must avoid replacing unchanged markup');
assert.match(painter,/panel\.innerHTML=nextMarkup;/,
  'changed markup must still be rendered');
const ctx=vm.createContext({});
vm.runInContext(`
let lastPanelMarkup=null;
const panel={updates:0,set innerHTML(x){this.updates++;this.html=x;}};
function apply(nextMarkup){
  if(nextMarkup!==lastPanelMarkup){
    panel.innerHTML=nextMarkup;
    lastPanelMarkup=nextMarkup;
  }
}
globalThis.test={panel,apply};
`,ctx);
ctx.test.apply('<div>turn 1</div>');
ctx.test.apply('<div>turn 1</div>');
assert.equal(ctx.test.panel.updates,1,'no redundant DOM replacement');
ctx.test.apply('<div>turn 2</div>');
assert.equal(ctx.test.panel.updates,2,'changed state must repaint');
assert.match(source,/const nextMarkup=`<b /,
  'menu must render through a stable markup snapshot');
console.log('PASS unchanged-panel DOM replacement avoidance with changed-state redraw');
