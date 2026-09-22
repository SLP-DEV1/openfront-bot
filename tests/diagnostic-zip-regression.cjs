'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','OpenFront_Solo_AggroBot.user.js'),'utf8');
const start=source.indexOf('  function diagnosticZip(files){');
const end=source.indexOf('  function diagnosticDownload(',start);
assert(start>0&&end>start,'ZIP implementation must exist in userscript');
const zip=vm.runInNewContext('(()=>{'+source.slice(start,end)+';return diagnosticZip})()',
  {Uint8Array,Uint32Array,DataView,TextEncoder,Blob,Error});
(async()=>{
  const inputs=[['summary.json','{"schemaVersion":2}'],
    ['events.jsonl','{"seq":1}\n{"seq":2}\n'],
    ['snapshots.jsonl','{"tick":80}\n'],['duo.jsonl','{"peerId":"x"}\n']];
  const bytes=new Uint8Array(await zip(inputs).arrayBuffer());
  const crcKnown=new DataView((await zip([['known.txt','123456789']]).arrayBuffer()));
  assert.equal(crcKnown.getUint32(14,true),0xcbf43926,'standard CRC-32 test vector');
  const v=new DataView(bytes.buffer);
  let offset=0;
  for(const [name,body] of inputs){
    assert.equal(v.getUint32(offset,true),0x04034b50,'local ZIP header');
    assert.equal(v.getUint16(offset+8,true),0,'store without compression');
    const length=v.getUint32(offset+18,true);
    const filename=v.getUint16(offset+26,true);
    const text=Buffer.from(bytes.subarray(offset+30+filename,
      offset+30+filename+length)).toString('utf8');
    assert.equal(Buffer.from(bytes.subarray(offset+30,offset+30+filename)).toString('utf8'),name);
    assert.equal(text,body);
    offset+=30+filename+length;
  }
  const centralStart=offset;
  for(const [name] of inputs){
    assert.equal(v.getUint32(offset,true),0x02014b50,'central ZIP directory');
    const len=v.getUint16(offset+28,true);
    assert.equal(Buffer.from(bytes.subarray(offset+46,offset+46+len)).toString('utf8'),name);
    offset+=46+len;
  }
  assert.equal(v.getUint32(offset,true),0x06054b50,'ZIP end record');
  assert.equal(v.getUint16(offset+10,true),inputs.length,'entry count');
  assert.equal(v.getUint32(offset+12,true),offset-centralStart,'central directory size');
  assert.equal(v.getUint32(offset+16,true),centralStart,'central directory offset');
  assert.equal(bytes.length,offset+22,'no truncated or trailing ZIP data');
  console.log('PASS diagnostic ZIP has valid local headers, payloads, central directory and end record');
})().catch(e=>{console.error(e);process.exitCode=1;});
