// ==UserScript==
// @name         OpenFront AggroBot Local Monitor
// @namespace    https://openfront.io/
// @version      1.0.0
// @description  Sends AggroBot diagnostics to a local, read-only match monitor.
// @match        https://openfront.io/*
// @match        https://*.openfront.io/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(() => {
  'use strict';
  const endpoint='http://127.0.0.1:8766/v1/events';
  const tokenKey='aggrobot-local-monitor-token';
  const page=unsafeWindow;
  let queue=[],inFlight=false,failures=0;
  page.__OF_LOCAL_MONITOR_ACTIVE__=true;

  GM_registerMenuCommand('AggroBot-Monitor-Token setzen',()=>{
    const value=prompt('Token aus dem lokalen AggroBot-Monitor eingeben:');
    if(value===null)return;
    const token=value.trim();
    if(!/^[a-f0-9]{64}$/i.test(token)){alert('Ungültiger Monitor-Token.');return;}
    GM_setValue(tokenKey,token);
    flush();
  });

  page.addEventListener('aggrobot:telemetry',event=>{
    try{
      const record=JSON.parse(event.detail);
      if(!Number.isSafeInteger(record?.seq)||typeof record.kind!=='string'||
        typeof record.session!=='string'||
        !/^[a-zA-Z0-9_-]{8,90}$/.test(record.session))return;
      queue.push(record);
      // Bound memory if the local monitor is unavailable for a long time.
      if(queue.length>1000)queue.splice(0,queue.length-1000);
      if(queue.length>=50||record.kind==='game_over')flush();
    }catch(_){}
  });

  function flush(){
    if(inFlight||!queue.length)return;
    const token=GM_getValue(tokenKey,'');
    if(!/^[a-f0-9]{64}$/i.test(token))return;
    // Batch boundaries never cross match/session boundaries.
    const session=queue[0].session;
    let n=0;while(n<100&&n<queue.length&&queue[n].session===session)n++;
    const batch=queue.splice(0,n);
    inFlight=true;
    let settled=false;
    const retry=()=>{
      if(settled)return;
      settled=true;
      queue.unshift(...batch);
      if(queue.length>1000)queue.splice(1000);
      failures++;
      if(failures===1||failures%30===0)
        console.warn('[AggroBot Monitor] Lokaler Dienst nicht erreichbar; Bot spielt weiter.');
      inFlight=false;
    };
    try{
      GM_xmlhttpRequest({
        method:'POST',url:endpoint,timeout:5000,
        headers:{'Content-Type':'application/json','X-Aggrobot-Monitor-Token':token},
        data:JSON.stringify({records:batch}),
        onload:r=>{
          if(r.status!==200){retry();return;}
          if(settled)return;
          settled=true;failures=0;inFlight=false;
          if(queue.length)flush();
        },
        onerror:retry,ontimeout:retry,
      });
    }catch(_){retry();}
  }
  setInterval(flush,2000);
})();
