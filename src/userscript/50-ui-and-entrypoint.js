  function mount() {
    if(panel||!document.body)return;
    panel=document.createElement('section');panel.id='of-solo-aggrobot';
    panel.style.cssText='position:fixed;left:12px;bottom:12px;width:302px;max-width:calc(100vw - 24px);max-height:55vh;overflow:auto;z-index:2147483644;padding:10px;background:rgba(9,18,32,.96);border:1px solid #42a5d9;border-radius:10px;color:#f0f4fa;font:12px/1.4 system-ui,Arial,sans-serif;box-shadow:0 5px 25px #000a';
    panel.addEventListener('click',e=>{
      const key=e.target.closest('button[data-key]')?.dataset.key;if(!key)return;
      if(key==='export'){exportDiagnostics();return;}
      if(key==='enabled'){
        if(!connected())status=conflicts()?'Disable the older bot version':
          advisorConflict()?'Disable Spawn Advisor auto/smart/auto-accept':
          'Only available in an active single-player, public or private match with EventBus';
        else {opts.enabled=!opts.enabled;autoStartGame=game;generation++;log(opts.enabled?'BOT START':'BOT PAUSE');
          if(opts.enabled)reportIntents(true);}
      }else if(key==='autoStart'){
        opts.autoStart=!opts.autoStart;
        if(opts.autoStart&&!opts.enabled)autoStartGame=null;
      }else if(key==='fullAuto'){
        opts.fullAuto=!opts.fullAuto;
        if(opts.fullAuto){opts.autoStrategy=true;autoTuning.tick=-Infinity;}
      }else if(key==='autoStrategy'&&opts.fullAuto){opts.fullAuto=false;opts.autoStrategy=false;}
      else if(['economy','boats','autoSpawn','defense','stopOnError','upgrades','safeMode','autoStrategy','diplomacy','offerAlliances','nukes','antiNuke','lateOffense','impossibleMode','impossibleExperiment','learningEnabled','neuralEnabled','duoEnabled','evidenceMode','shadowRankEnabled'].includes(key)){
        opts[key]=!opts[key];
        if(key==='duoEnabled'){
          duoLocal.peer=null;duoLocal.lastAt=0;duoLocal.match=null;
          duoLocal.status=opts.duoEnabled?'Connecting to local relay':'AUS';
        }
      }
      else if(key==='plan'){opts.fullAuto=false;opts.autoStrategy=false;opts.plan=opts.plan==='Blitz'?'Adaptiv':opts.plan==='Adaptiv'?'Ökonomie':'Blitz';}
      else if(key==='buildStyle'){opts.fullAuto=false;opts.autoStrategy=false;opts.buildStyle=opts.buildStyle==='Ausgewogen'?'Wirtschaft':opts.buildStyle==='Wirtschaft'?'Defensiv':'Ausgewogen';}
      persist();lastPaint=0;paint();
    });
    panel.addEventListener('change',e=>{
      const key=e.target.dataset?.option;
      if(key==='aggressive')opts.aggressive=clamp(e.target.value,40,100);
      if(key==='reserve')opts.reserve=clamp(e.target.value,5,65);
      if(key==='actionsPerMinute')opts.actionsPerMinute=clamp(e.target.value,15,120);
      if(key==='maxTargets')opts.maxTargets=clamp(e.target.value,4,25);
      if(key==='duoRoom'||key==='duoPartnerName'){
        opts[key]=String(e.target.value||'').trim();
        duoLocal.peer=null;duoLocal.lastAt=0;duoLocal.match=null;
        duoLocal.status='Partner details changed · reconnecting';
      }
      persist();lastPaint=0;paint();
    });
    document.body.appendChild(panel);
  }
  // Presentation-only readout. No planner or intent consumes this state.
  /* __EVIDENCE_PANEL_STATE__ */
  // Presentation-only translation: stored strategy enum values remain unchanged.
  const MENU_STATUS_TRANSLATIONS=[["Warte auf Spiel","Waiting for a match"],["Singleplayer erkannt","Single-player detected"],["Multiplayer erkannt","Multiplayer detected"],["Autostart wartet auf EventBus","auto-start waiting for EventBus"],["Bot bereit","Bot ready"],["Replay · BOT GESPERRT","Replay · BOT DISABLED"],["Verteidigung vor Investitionen","Defense before investing"],["Erste Stadt/Fabrik","First City/Factory"],["SAM-Schutz vor Raketenfonds","SAM defense before missile savings"],["Truppenlimit: Stadt/City-Upgrade oder Landgewinn priorisiert","Troop cap: prioritize City upgrades or territory"],["Hafen vor Silo","Port before silo"],["Zwei Städte und zwei Fabriken","Two Cities and two Factories"],["Wirtschaft & Offensive","Economy & offense"],["Keine legalen Bauoptionen im geprüften Gebiet","No legal building options in inspected area"],["Baukandidaten durch Priorität oder Reserve gesperrt","Build choices blocked by priority or reserve"],["Gold für Bauoption fehlt; Standort noch ungeprüft","Not enough gold for construction; site not yet verified"],["Spare auf ersten Kernbau:","Saving for first core building:"],["Spare auf SAM:","Saving for SAM:"],["Warte auf","Waiting for"],["Keine","No"],["keine","none"],["Verteidigung","Defense"],["Wirtschaft","Economy"],["Hafen","Port"],["Stadt","City"],["Truppen","Troops"],["Angriff","Attack"],["Gegner","Opponent"],["Bündnis","Alliance"],["bestätigt","confirmed"],["unbestätigt","unconfirmed"],["ausstehend","pending"],["unbekannt","unknown"],["bereit","ready"],["aktiv","active"],["Defensiv","Defensive"],["Ausgewogen","Balanced"],["Adaptiv","Adaptive"],["Ökonomie","Economy"],["Warte auf Spielzustand","Waiting for game state"],["Warte auf Silo","Waiting for missile silo"],["Bauplanung bereit","Construction planner ready"],["Noch keine Anfrage","No alliance requests yet"],["Keine Bedrohung","No threats detected"],["Keine Marineaktivität","No naval activity"],["Handel automatisch offen","Trade automatically available"],["Gebäudeziele erreicht","Building targets reached"],["Grundaufbau","Initial construction"],["Startphase","Opening phase"],["Neue Partie","New match"],["Neue Singleplayer-Partie","New single-player match"],["Neue Multiplayer-Partie","New multiplayer match"],["Warte auf Spawn","Waiting for spawn"],["Spare:","Saving:"],["Not-Aus","Emergency stop"]];
  function translateMenuText(value) {
    let text=String(value??'');
    // Longest phrases first, then only whole words/phrases. This prevents
    // e.g. 'Warte auf Spielzustand' -> 'Waiting for a matchzustand'.
    for(const [from,to] of MENU_STATUS_TRANSLATIONS.slice().sort((a,b)=>b[0].length-a[0].length)){
      const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text=text.replace(new RegExp('(?<![\\p{L}])'+escaped+'(?![\\p{L}])','gu'),to);
    }
    return text;
  }
  function paint() {
    const enHTML=value=>escapeHTML(translateMenuText(value));
    if(!document.body)return;if(!panel)mount();
    if(!panel||Date.now()-lastPaint<900)return;
    // Keep the user's slider interaction from being interrupted by a redraw.
    if(panel.contains(document.activeElement)&&document.activeElement?.matches('input'))return;
    lastPaint=Date.now();actionBudget();
    // Rebuilding innerHTML must not collapse sections the player opened.
    const expanded={};
    for(const detail of panel.querySelectorAll('details[data-section]'))expanded[detail.dataset.section]=detail.open;
    const openFor=key=>expanded[key]?' open':'';
    const sectionStyle='border:1px solid #354d66;border-radius:6px;margin-top:6px;padding:5px 7px';
    const b=(key,label)=>`<button data-key="${key}" style="border:1px solid #779;border-radius:5px;color:#fff;background:${opts[key]?'#167247':'#344157'};padding:5px 7px;margin:2px;cursor:pointer">${label}</button>`;
    panel.innerHTML=`<b style="font-size:14px;color:#83dcff">AggroBot ${VERSION}</b> ${permittedMatch(game)?'🟢':'🔒'}
      <div style="color:#bed5e8;margin:6px 0">${enHTML(status)}</div>
      ${game?.inSpawnPhase?.()?'<div style="color:#9bd0e4">Strategic spawn: '+
        enHTML(spawnState.phase)+' · checked '+spawnState.scanned+
        ' · attempts '+spawnState.attempts+' · remaining '+
        spawnRemaining(game)+' ticks</div>':''}
      <div>${b('enabled',opts.enabled?'⏸ PAUSE':'▶ START')} ${b('autoStart',opts.autoStart?'⚡ Auto-start ON':'⚡ Auto-start OFF')}</div>
      <div style="color:#a9efc9">${enHTML(strategic.mode)} · ${enHTML(strategic.reason)} · ${enHTML(economicStatus)}</div>
      <details data-section="features"${openFor('features')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Modules &amp; settings</summary>
      <div>${b('autoSpawn','Spawn')} ${b('defense','Counterattack')} ${b('economy','Economy')} ${b('boats','Navy')}</div>
      <div>${b('upgrades','Upgrades')} ${b('safeMode','Emergency stop')} ${b('autoStrategy','Auto-strategy '+(opts.autoStrategy?'ON':'OFF'))} ${b('fullAuto','Fully autonomous '+(opts.fullAuto?'ON':'OFF'))}</div>
      <div>${b('diplomacy','Diplomacy')} ${b('offerAlliances','Offer alliances')}</div>
      <div>${b('nukes','Auto-Nukes')} ${b('antiNuke','Smart SAMs')} ${b('lateOffense','Late-game offense')}</div>
      <div>${b('impossibleExperiment','Impossible AI Test')} ${b('learningEnabled','Learning')} ${b('neuralEnabled','Neural network')} ${b('impossibleMode','Impossible strategy')}</div>
      </details>
      <details data-section="localduo"${openFor('localduo')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">🤝 Duo mode (2 browsers, 1 PC)</summary>
      <div>${b('duoEnabled','Local Duo '+(opts.duoEnabled?'ON':'OFF'))}</div>
      <div style="color:#9bd0e4">My player ID: <b>${enHTML(safeID(myPlayer())??'not in a match yet')}</b></div>
      <label>Partner name (display only)<input type="text" data-option="duoPartnerName" maxlength="80" value="${enHTML(opts.duoPartnerName||'')}" placeholder="e.g. ExamplePartner" style="box-sizing:border-box;width:100%"></label>
      <div>Partner ID (automatic): ${enHTML(duoTrustedPeer()?.id??"Waiting for partner")}</div>
      <label>Duo room code (same in both browsers)<input type="text" data-option="duoRoom" maxlength="64" value="${enHTML(opts.duoRoom)}" placeholder="e.g. EXAMPLE_DUO_01" style="box-sizing:border-box;width:100%"></label>
      <div>Status: ${enHTML(duoLocal.status)} · ${duoTrustedPeer()?'Partner verified in current match':'Partner disconnected'}</div>
      <div style="color:#9bd0e4">Duo state: ${enHTML(duoStatusView(opts.duoEnabled,duoTrustedPeer(),duoPlan,number(()=>game?.ticks?.(),-1),duoLocal).phase)} · Relay drops ${duoLocal.relayDrops} · Relay timeouts ${duoLocal.relayTimeouts} · ACK timeouts ${duoLocal.ackTimeouts}</div>
      <div style="color:#9bd0e4;font-size:10px">Match ID: ${enHTML(duoMatchKey())}</div>
      <div>In-game name: ${enHTML(duoTrustedPeer()?nameOf(duoTrustedPeer().player):'—')}${duoTrustedPeer()&&opts.duoPartnerName&&nameOf(duoTrustedPeer().player)!==opts.duoPartnerName?' · Display name mismatch (player ID takes precedence)':''}</div>
      <div>Partner's other allies (attack protection): ${enHTML((duoTrustedPeer()?.state?.allies||[]).map(id=>nameOf((game?.playerViews?.()||[]).find(p=>safeID(p)===id)||{id:()=>id})).join(', ')||'—')}</div>
      <div>Partner: target ${enHTML(duoTrustedPeer()?.state?.target??'—')} · available ${Math.round(duoTrustedPeer()?.state?.available||0)} · Reserve ${Math.round(duoTrustedPeer()?.state?.reserve||0)} · needs help ${duoTrustedPeer()?.state?.needHelp?'YES':'no'}</div>
      <div>Joint plan: ${enHTML(duoPlan?duoPlan.role+' → '+duoPlan.targetName+(duoPlan.strikeTick!==null?' · attack from tick '+duoPlan.strikeTick:''):'Start together → confirm alliance → divide the front')}</div>
      <div>Joint attack budget: ${duoPlan?.joint?enHTML(Math.round(duoPlan.joint.own/10)+' own + '+Math.round(duoPlan.joint.ally/10)+' partner troops · required '+Math.round(duoPlan.joint.needed/10)):'No jointly safe front yet'}</div>
      <div>Attack coordination: ${enHTML(duoPlan?.strikeStatus||'none')} · partner warnings ${duoPlan?.partnerWarning||0}/2 · displayed troops = engine value / 10</div>
      <div style="margin-top:4px"><b>Duo timeline</b>${decisionTimeline.filter(d=>d.kind==='2v2').slice(-4).reverse().map(d=>'<div style="border-top:1px solid #354d66;padding:2px 0">'+enHTML('Tick '+d.tick+' · '+d.why)+'</div>').join('')}</div>
      <div style="color:#a9efc9">Run Start_Live_Duo.bat · port 8767 · use the same room code in both browsers · alliances require in-game confirmation · on relay loss, both bots continue independently.</div>
      </details>
      <details data-section="neural"${openFor('neural')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Neural model</summary>
      <div>${b('shadowRankEnabled',opts.shadowRankEnabled?'Shadow ranking ON':'Shadow ranking OFF')}</div>
      <div style="color:#9bd0e4">Shadow: ${shadowV6Model||shadowV5Model?((shadowV6Model?'Schema 6':'Schema 5')+(opts.shadowRankEnabled&&opts.candidateControlEnabled?' CONTROL ACTIVE (gain '+enHTML(shadowModelInfo().controlGain)+')':', loaded, comparison only')):'no shadow candidate loaded'} · ${enHTML(shadowDecisionEvidence?.wouldPrefer??'—')} ${(shadowV6Model||shadowV5Model)&&opts.shadowRankEnabled&&opts.candidateControlEnabled?(shadowDecisionEvidence?.failClosed?'(rule-based fallback: '+enHTML(shadowDecisionEvidence.failClosed)+')':shadowDecisionEvidence?.changedIntent?'(model changed the selected action)':'(control configured; last choice unchanged)'):'(no action effect)'}</div>
      <div style="color:#9bd0e4">Inference: ${enHTML(neuralModelInfo().fingerprint||'no model')} · signals ${neuralEvidence.nonzero}/${neuralEvidence.calls} · Ranking ${neuralEvidence.actionNonzero}/${neuralEvidence.actionCalls}</div>
      <div style="color:#9bd0e4">Deployment: model ${enHTML(deploymentInfo().model.champion.fingerprint||'—')} · candidate ${enHTML(deploymentInfo().model.candidate.fingerprint||'—')} · script ${enHTML(deploymentInfo().script.version)} · Engine ${enHTML(deploymentInfo().engine.commit||'—')}</div>
      <div style="color:#9bd0e4">Neural model: ${neuralModel?.schema===4?'Strategic policy v4 (24 signals)':neuralModel?.schema===3?'Strategic policy v3 (16 signals)':neuralModel?.schema===2?'Action ranking (max ±14 points)':neuralModel?.schema===1?'Slider (max ±8 points)':'not loaded'} · only in a permitted match</div>
      </details>
      <details data-section="situation"${openFor('situation')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Situation &amp; diplomacy</summary>
      <div style="color:#a9efc9">Main front: ${enHTML(warState.name)} · war ${isWar()?'active':'none'} · ${enHTML(lastRecoveryReason||'ready')}</div>
      <div>${b('plan','Manual: '+enHTML(opts.plan))}<br>${b('buildStyle','Manual building focus: '+enHTML(opts.buildStyle))}</div>
      <div style="color:#a9efc9">AI strategy: ${enHTML(strategic.mode)} · ${enHTML(strategic.reason)} · Construction: ${enHTML(effectiveBuildStyle())}</div>
      <div style="color:#9bd0e4">Defense: ${enHTML(defenseStatus)} · retreats ${defenseStats.retreatsOrdered}/${defenseStats.retreatsObserved} observed · unknown ${defenseStats.unknown} · unconfirmed ${defenseStats.unconfirmed}</div>
      <div style="color:#9bd0e4">Game mode: ${enHTML(winStatus.mode)} · victory progress: ${winStatus.progress===null?'unknown':(winStatus.progress*100).toFixed(1)+'%'} · victory threshold: ${winStatus.threshold===null?'unknown':winStatus.threshold+'%'} · time: ${winStatus.remaining===null?'no timer':Math.round(winStatus.remaining)+'s'} · Doomsday: ${winStatus.doomsday?'YES':'NO'}</div>
      <div style="color:#9bd0e4">Trade per 60s: rail ${incomeStatus.train===null?'unknown':Math.round(incomeStatus.train)} · ship ${incomeStatus.trade===null?'unknown':Math.round(incomeStatus.trade)} · ${enHTML(tradeStatus)} · opened ${tradeStats.opened} / embargoes ${tradeStats.embargoed}</div>
      <div style="color:#9bd0e4">Navy: ${enHTML(fleetStatus)}</div>
      <div style="color:#9bd0e4">Nukes: ${enHTML(nukeStatus)} · confirmed ${nukeShots} / attempts ${nukeAttempts} / unconfirmed ${nukeUnconfirmed} · SAM coverage ${nuclearCache?.assets?.length - nuclearCache?.uncovered?.length||0}/${nuclearCache?.assets?.length||0}</div>
      <div style="color:#9bd0e4">Alliances: ${enHTML(diplomacyStatus)} · confirmed: ${diplomacyStats.accepted} accepted, ${diplomacyStats.rejected} rejected · ${diplomacyPending.size} pending · ${diplomacyStats.offered} offered</div>
      </details>
      <details data-section="humanplan"${openFor('humanplan')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Opponent analysis &amp; operations</summary>
      <div>Operation: ${operation?enHTML(operation.type+' → '+operation.targetName+' · '+operation.spent+'/'+operation.budget+' troops · abort: '+operation.abort):'No safe operation'}</div>
      <div>Duo: ${duoPlan?enHTML(duoPlan.role+' · target '+duoPlan.targetName+' · partner commitment '+duoPlan.partnerCommitted+' · needs help '+(duoPlan.needHelp?'YES':'no')):'No verified team/Duo partner'}</div>
      <div>Opponent victory: ${victoryThreat?enHTML(victoryThreat.name+' · '+victoryThreat.progress.toFixed(1)+'% / '+victoryThreat.threshold+'%'+(victoryThreat.urgent?' · WARNING':'')):'No verifiable threshold / no opponent'}</div>
      ${[...opponentProfiles.values()].slice(0,8).map(p=>'<div>'+enHTML(p.name+' · '+p.profile+' · '+Math.round(p.confidence*100)+'% observation confidence')+'</div>').join('')}
      <div style="margin-top:5px"><b>Decision timeline</b>${decisionTimeline.slice(-8).reverse().map(d=>'<div style="padding:3px 0;border-top:1px solid #354d66">'+enHTML('Tick '+d.tick+' · '+d.why)+(d.alternatives.length?'<br><span style="color:#9bd0e4">'+enHTML(d.alternatives.join(' | '))+'</span>':'')+'</div>').join('')}</div>
      </details>
      <details data-section="tuning"${openFor('tuning')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Fine-tuning</summary>
      <div style="color:#a9efc9">Parameters: ${opts.fullAuto?'AUTONOMOUS '+enHTML(autoTuning.mode)+' · '+enHTML(autoTuning.reason):'MANUAL'}</div>
      <label>Aggressiveness: ${setting('aggressive')}%${opts.fullAuto?' (Auto)':''}<input type="range" data-option="aggressive" min="40" max="100" value="${setting('aggressive')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Reserve: ${setting('reserve')}%${opts.fullAuto?' (Auto)':''}<input type="range" data-option="reserve" min="5" max="65" value="${setting('reserve')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Actions/min: ${setting('actionsPerMinute')}${opts.fullAuto?' (Auto)':''}<input type="range" data-option="actionsPerMinute" min="15" max="120" value="${setting('actionsPerMinute')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Target checks: ${setting('maxTargets')}${opts.fullAuto?' (Auto)':''}<input type="range" data-option="maxTargets" min="4" max="25" value="${setting('maxTargets')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      </details>
      <details data-section="diagnostics"${openFor('diagnostics')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Diagnostics &amp; log</summary>
      <div>${b('evidenceMode',opts.evidenceMode?'🔎 Evidence ON':'🔎 Evidence OFF')}</div>
      ${opts.evidenceMode?(()=>{
        const e=evidencePanelState(planningState,troopSnapshot,lastDecisionFrame,
          number(()=>game?.ticks?.(),-1),actionLedger,economyBudgetEvidence);
        const a=e.alternative;
        return '<div style="color:#a9efc9">Rejected alternative: '+
          enHTML(a?a.id+' · utility '+a.utility+' · '+a.reason:'no ranked alternatives')+'</div>'+
          '<div style="color:#9bd0e4">Reserve reason: '+enHTML(e.reserveReason)+
          ' · worker age: '+(e.workerAge===null?'unknown':e.workerAge+' Ticks')+
          (e.workerStale?' (stale/uncertain)':'')+'</div>'+
          '<div style="color:#9bd0e4">Last action: '+enHTML(e.actionId??'—')+
          ' · decision: '+enHTML(e.decisionId??'—')+
          ' · effect: '+enHTML(e.effect)+' (cannot infer from intent)</div>'+
          '<div style="color:#9bd0e4;font-size:10px">Ranking and observation only; no additional authorization to act.</div>';
      })():''}
      ${(()=>{const e=evidencePanelState(planningState,troopSnapshot,lastDecisionFrame,
        number(()=>game?.ticks?.(),-1),actionLedger,economyBudgetEvidence),q=e.budget;
        return '<div style="color:#9bd0e4">Budget breakdown: '+(q?
          enHTML('Cap '+(q.capUse===null?'?':(q.capUse*100).toFixed(0)+'%')+
            ' · City desired '+(q.cityWanted?'YES':'no')+' ('+q.cityCount+')'+
            ' · SAM '+(q.wantedSAM||0)+(q.nuclearThreat?' (threat)':'')+
            ' · Port milestone '+(q.portMilestone?'YES':'no')+
            ' · Gold-Floor '+q.goldFloor+' (baseline, depends on construction)'+
            ' · SAM quote '+(q.samQuote??'?')+' · Port quote '+(q.portQuote??'?')):
            'no recent economy snapshot')+'</div>';
      })()}
      
      <div style="color:#9bd0e4">Construction: ${enHTML(economicStatus)} · savings target: ${enHTML(investmentStatus)} · priorities: ${enHTML(economicLastPlan)}</div>
      <div style="color:#9bd0e4">Runtime: front ${runtime.borderMs}ms · combat ${runtime.combatMs}ms · construction ${runtime.economyMs}ms · worker checks ${runtime.attackProbes}/${runtime.buildProbes}</div>
      <div style="color:${intentHealth().critical.length?'#ff8181':intentHealth().missing.length?'#ffd480':'#a9efc9'}">Intents: ${intentHealth().eventBus?intentHealth().found+'/'+intentHealth().total:'EventBus pending'} · ${intentHealth().missing.length?'Missing: '+enHTML(intentHealth().missing.join(', ')):'all detected'}${intentHealth().critical.length?' · CORE FUNCTION DEGRADED':''}</div>
      <div style="color:#9bd0e4">Action budget: ${actions.length}/${setting('actionsPerMinute')} · sent: ${totalSent} · failed: ${totalFailed} · errors: ${errors}</div>
      <div style="color:#9bd0e4">Home: ${Math.floor(troopSnapshot.home/10)} · Reserve: ${Math.floor(troopSnapshot.reserve/10)} · ongoing attacks: ${Math.floor(troopSnapshot.committed/10)} · income/reserve: ${(troopSnapshot.ratio*100).toFixed(0)}% capacity</div>
      <div style="color:#9bd0e4">Incoming: ${Math.floor(troopSnapshot.incoming/10)} · strongest border neighbor: ${Math.floor(troopSnapshot.strongest/10)} · target: ${enHTML(lastSelection||plan?.name||'Searching')} · ${borderCache?.length||0} border tiles</div>
      <div style="border-top:1px solid #527;margin-top:7px;padding-top:5px"><b>Recent decisions</b>${recent.map(s=>`<div>• ${enHTML(s)}</div>`).join('')}</div>
      <button data-key="export" style="border:1px solid #73acdd;border-radius:5px;background:#235078;color:white;padding:5px 7px;cursor:pointer">📄 Export diagnostic JSON</button>
      </details>
      <div style="color:#97a8be;font-size:10px;margin-top:8px">Single-player, public and private matches supported · replays disabled · one auto-start per match · pause until match change · Alt+Shift+P start/pause · Alt+Shift+X emergency stop (auto-start OFF).<br>When running Spawn Advisor, disable its auto-spawn, smart attack and auto-accept alliances.</div>`;
  }
  document.addEventListener('keydown',e=>{
    if(!e.altKey||!e.shiftKey||!['p','x'].includes(e.key.toLowerCase())||e.repeat||e.target?.isContentEditable||
      /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||''))return;
    e.preventDefault();
    if(e.key.toLowerCase()==='x'){
      opts.enabled=false;opts.autoStart=false;autoStartGame=game;generation++;log('Emergency stop by hotkey · auto-start OFF');
    }else if(connected()){
      opts.enabled=!opts.enabled;autoStartGame=game;generation++;log(opts.enabled?'BOT START':'BOT PAUSE');
      if(opts.enabled)reportIntents(true);
    } else status='Bot available only in an active single-player, public or private match';
    persist();lastPaint=0;paint();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint,{once:true});
  // Catch both synchronous and asynchronous failures before they escape
  // timer callbacks as unhandled promise rejections.
  function runIntervalTask(task,label){
    Promise.resolve().then(task).catch(e=>{
      errors++;
      status='Runtime error ('+label+'): '+String(e?.message||e).slice(0,90);
      console.warn(PREFIX,label+' interval error:',e);
      if((opts.stopOnError||opts.safeMode)&&errors>=5){
        opts.enabled=false;generation++;autoStartGame=game;persist();
        status='Emergency stop: 5 runtime errors';
      }
      lastPaint=0;
      try{paint();}catch(paintError){console.warn(PREFIX,'Panel error:',paintError);}
    });
  }
  const interval=setInterval(()=>runIntervalTask(step,'main'),400);
  // DonateEvent exists only in the current GameView update. Sample frequently
  // instead of relying exclusively on the 400 ms planner cycle (which can
  // skip a donation update). Background-tab throttling can still miss one.
  const donationInterval=setInterval(()=>{
    if(opts.enabled&&game&&permittedMatch(game))diagnosticDonationUpdates();
  },90);
  const economyInterval=setInterval(()=>runIntervalTask(economyStep,'economy'),750);
  const diplomacyInterval=setInterval(diplomacyTick,950);
  const tradeInterval=setInterval(()=>{tradeTick().catch(e=>{
    tradeStatus='Trade: '+String(e?.message||e).slice(0,75);
  });},1250);
  const nukeInterval=setInterval(()=>runIntervalTask(nukeStep,'nuclear'),1100);
  const duoInterval=setInterval(()=>{duoPublish().catch(e=>{
    duoLocal.status='Relay error: '+String(e?.message||e).slice(0,55);
  });},950);
  window.addEventListener('beforeunload',()=>{clearInterval(interval);clearInterval(economyInterval);clearInterval(diplomacyInterval);clearInterval(tradeInterval);clearInterval(nukeInterval);clearInterval(duoInterval);clearInterval(donationInterval);});
  if(benchmark){
    window.__OF_BENCHMARK__=Object.freeze({
      snapshot:diagnosticSnapshot,
      status:()=>({version:VERSION,connected:!!connected(),enabled:opts.enabled,
        gameType:gameType(game),tick:number(()=>game.ticks(),-1),
        spawned:!!myPlayer()?.hasSpawned?.(),alive:myPlayer()?.isAlive?.()??null,
        gameOver:!!game?.gameOver?.(),status}),
      start:(settings={})=>{
        if(!connected()||!permittedMatch(game))
          throw new Error('Benchmark requires a local permitted match');
        const allowed={aggressive:[40,100],reserve:[5,65],actionsPerMinute:[15,120],maxTargets:[4,25]};
        for(const [key,value] of Object.entries(settings)){
          if(key==='fullAuto'&&typeof value==='boolean')continue;
          if(key==='duoEnabled'&&typeof value==='boolean')continue;
          if(key==='duoRoom'&&typeof value==='string'&&
            /^[a-zA-Z0-9_-]{6,64}$/.test(value))continue;
          if(key==='archetype'&&typeof value==='string'&&
            Object.prototype.hasOwnProperty.call(ARCHETYPES,value))continue;
          if(!allowed[key]||typeof value!=='number'||!Number.isFinite(value)||value<allowed[key][0]||value>allowed[key][1])
            throw new Error('Invalid benchmark setting: '+key);
        }
        Object.assign(opts,settings);if(opts.fullAuto)opts.autoStrategy=true;
        applyArchetypeOptions();
        autoTuning.tick=-Infinity;opts.enabled=true;autoStartGame=game;generation++;
        telemetry('benchmark_start','Local benchmark started',{settings});
        reportIntents(true);
      },
      stop:()=>{telemetry('benchmark_stop','Local benchmark stopped');opts.enabled=false;autoStartGame=game;generation++;},
      // Step 3: benchmark-only per-decision frame for real training capture.
      planningFrame:()=>planningFrame(),
      // §28 schema-7 branch funnel (aggregate + last decision) for the
      // pre-gate and dev/holdout reconciliation from the benchmark report.
      branchFunnel:()=>({...branchFunnel,
        lastDecision:branchFunnel.lastDecision?
          {...branchFunnel.lastDecision}:null}),
      // Engine harness awaits every cycle; ordinary browser timers stay unchanged.
      pump:async()=>{await step();await economyStep();await diplomacyTick();
        await nukeStep();if(opts.duoEnabled)await duoPublish();}
    });
  }
  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, auto-start after match discovery');
})();
