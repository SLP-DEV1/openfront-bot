'use strict';
// Bounded, deterministic result ordering regardless of match completion order.
async function parallelMap(items,limit,task){
  if(!Array.isArray(items)||!Number.isSafeInteger(limit)||limit<1||limit>32||
    typeof task!=='function')throw Error('Invalid parallel job configuration');
  const results=new Array(items.length);
  let next=0;
  async function worker(){
    while(next<items.length){
      const index=next++;
      results[index]=await task(items[index],index);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return results;
}
module.exports={parallelMap};
