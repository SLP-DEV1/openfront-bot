'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'.github','workflows',name),'utf8');
const paired=read('impossible-paired.yml');
const required=[
  "'.github/workflows/impossible-paired.yml'",
  "'tools/benchmark/**'",
  "'trainer/**'",
  "'OpenFront_Solo_AggroBot.user.js'",
  "'OpenFront_AggroBot_Impossible_Run3.user.js'"
];
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
for(const trigger of required)
  assert.match(paired,new RegExp(`^\\s*- ${escapeRegex(trigger)}\\s*$`,'m'),
    `Impossible Paired Evaluation must run for ${trigger}`);
assert.doesNotMatch(paired,/^\s*- ['"]?docs\/\*\*/m,
  'documentation-only changes should not trigger the paired engine matrix');
console.log('PASS Impossible paired workflow covers trainer, source and Run3 policy changes');
