  function mount() {
    if(panel||!document.body)return;
    panel=document.createElement('section');panel.id='of-solo-aggrobot';
    panel.style.cssText='position:fixed;left:12px;bottom:12px;width:302px;max-width:calc(100vw - 24px);max-height:55vh;overflow:auto;z-index:2147483644;padding:10px;background:rgba(9,18,32,.96);border:1px solid #42a5d9;border-radius:10px;color:#f0f4fa;font:12px/1.4 system-ui,Arial,sans-serif;box-shadow:0 5px 25px #000a';
    panel.addEventListener('click',e=>{
      const key=e.target.closest('button[data-key]')?.dataset.key;if(!key)return;
      if(key==='export'){exportDiagnostics();return;}
      if(key==='enabled'){
        if(!connected())status=conflicts()?'Alte Bot-Version deaktivieren':
          advisorConflict()?'Spawn Advisor Auto/Smart/Auto-Accept ausschalten':
          'Nur in laufender Singleplayer-, Public- oder Private-Partie mit EventBus';
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
          duoLocal.status=opts.duoEnabled?'Verbinde lokalen Relay':'AUS';
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
        duoLocal.status='Partnerdaten geändert · erneut verbinden';
      }
      persist();lastPaint=0;paint();
    });
    document.body.appendChild(panel);
  }
  // Presentation-only readout. No planner or intent consumes this state.
  function evidencePanelState(plan,s,frame,currentTick,ledger,budget){
    const age=frame&&Number.isFinite(currentTick)&&Number.isFinite(frame.requestedTick)?
      Math.max(0,currentTick-frame.requestedTick):null;
    const latest=ledger?.at(-1)||null;
    const budgetAge=budget&&Number.isFinite(currentTick)&&Number.isFinite(budget.tick)?
      Math.max(0,currentTick-budget.tick):null;
    return {alternative:plan?.rejected??null,reserveReason:s?.reserveReason??'unbekannt',
      reserveFloors:s?.reserveFloors??null,workerAge:age,
      workerStale:age===null||age>20,
      actionId:latest?.actionId??null,decisionId:latest?.decisionId??null,
      effect:latest?.effect??'unconfirmed',
      budget:budgetAge!==null&&budgetAge<=300?budget:null,budgetAge};
  }
  function paint() {
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
      <div style="color:#bed5e8;margin:6px 0">${escapeHTML(status)}</div>
      ${game?.inSpawnPhase?.()?'<div style="color:#9bd0e4">Strategischer Spawn: '+
        escapeHTML(spawnState.phase)+' · geprüft '+spawnState.scanned+
        ' · Versuche '+spawnState.attempts+' · Rest '+
        spawnRemaining(game)+' Ticks</div>':''}
      <div>${b('enabled',opts.enabled?'⏸ PAUSE':'▶ STARTEN')} ${b('autoStart',opts.autoStart?'⚡ Auto-Start AN':'⚡ Auto-Start AUS')}</div>
      <div style="color:#a9efc9">${escapeHTML(strategic.mode)} · ${escapeHTML(strategic.reason)} · ${escapeHTML(economicStatus)}</div>
      <details data-section="features"${openFor('features')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Module &amp; Optionen</summary>
      <div>${b('autoSpawn','Spawn')} ${b('defense','Gegenangriff')} ${b('economy','Wirtschaft')} ${b('boats','Marine')}</div>
      <div>${b('upgrades','Upgrades')} ${b('safeMode','Not-Aus')} ${b('autoStrategy','Auto-Strategie '+(opts.autoStrategy?'AN':'AUS'))} ${b('fullAuto','Vollautonom '+(opts.fullAuto?'AN':'AUS'))}</div>
      <div>${b('diplomacy','Diplomatie')} ${b('offerAlliances','Bündnisse anbieten')}</div>
      <div>${b('nukes','Auto-Nukes')} ${b('antiNuke','Intelligente SAMs')} ${b('lateOffense','Late-Game-Offensive')}</div>
      <div>${b('impossibleExperiment','Impossible AI Test')} ${b('learningEnabled','Lernen')} ${b('neuralEnabled','Neurales Netz')} ${b('impossibleMode','Unmöglich-Taktik')}</div>
      </details>
      <details data-section="localduo"${openFor('localduo')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">🤝 Duo-Modus (2 Browser, 1 PC)</summary>
      <div>${b('duoEnabled','Lokales Duo '+(opts.duoEnabled?'AN':'AUS'))}</div>
      <div style="color:#9bd0e4">Eigene Spieler-ID: <b>${escapeHTML(safeID(myPlayer())??'noch nicht im Spiel')}</b></div>
      <label>Partnername (nur Anzeige)<input type="text" data-option="duoPartnerName" maxlength="80" value="${escapeHTML(opts.duoPartnerName||'')}" placeholder="z. B. KitsukamiBot2" style="box-sizing:border-box;width:100%"></label>
      <div>Partner-ID (automatisch): ${escapeHTML(duoTrustedPeer()?.id??"Warte auf Partner")}</div>
      <label>Duo-Raumcode (in beiden Browsern gleich)<input type="text" data-option="duoRoom" maxlength="64" value="${escapeHTML(opts.duoRoom)}" placeholder="z. B. KITSU_DUO_01" style="box-sizing:border-box;width:100%"></label>
      <div>Status: ${escapeHTML(duoLocal.status)} · ${duoTrustedPeer()?'Partner im aktuellen Match bestätigt':'Partner nicht verbunden'}</div>
      <div style="color:#9bd0e4">Duo-Zustand: ${escapeHTML(duoStatusView(opts.duoEnabled,duoTrustedPeer(),duoPlan,number(()=>game?.ticks?.(),-1),duoLocal).phase)} · Relay-Drops ${duoLocal.relayDrops} · Relay-Timeouts ${duoLocal.relayTimeouts} · ACK-Timeouts ${duoLocal.ackTimeouts}</div>
      <div style="color:#9bd0e4;font-size:10px">Matchkennung: ${escapeHTML(duoMatchKey())}</div>
      <div>Spielname: ${escapeHTML(duoTrustedPeer()?nameOf(duoTrustedPeer().player):'—')}${duoTrustedPeer()&&opts.duoPartnerName&&nameOf(duoTrustedPeer().player)!==opts.duoPartnerName?' · Name weicht von Anzeige ab (ID maßgeblich)':''}</div>
      <div>Duo-Fremdbündnisse (Angriffsschutz): ${escapeHTML((duoTrustedPeer()?.state?.allies||[]).map(id=>nameOf((game?.playerViews?.()||[]).find(p=>safeID(p)===id)||{id:()=>id})).join(', ')||'—')}</div>
      <div>Partner: Ziel ${escapeHTML(duoTrustedPeer()?.state?.target??'—')} · verfügbar ${Math.round(duoTrustedPeer()?.state?.available||0)} · Reserve ${Math.round(duoTrustedPeer()?.state?.reserve||0)} · Hilfe ${duoTrustedPeer()?.state?.needHelp?'JA':'nein'}</div>
      <div>Gemeinsamer Plan: ${escapeHTML(duoPlan?duoPlan.role+' → '+duoPlan.targetName+(duoPlan.strikeTick!==null?' · Angriff ab Tick '+duoPlan.strikeTick:''):'Gemeinsam starten → Allianz bestätigen → Front aufteilen')}</div>
      <div>Duo-Angriffsbudget: ${duoPlan?.joint?escapeHTML(Math.round(duoPlan.joint.own/10)+' eigene + '+Math.round(duoPlan.joint.ally/10)+' Partner-Truppen · nötig '+Math.round(duoPlan.joint.needed/10)):'Noch keine gemeinsam sichere Front'}</div>
      <div>Angriffsbindung: ${escapeHTML(duoPlan?.strikeStatus||'keine')} · Partnerwarnung ${duoPlan?.partnerWarning||0}/2 · Truppenanzeige = Engine-Wert / 10</div>
      <div style="margin-top:4px"><b>Duo-Timeline</b>${decisionTimeline.filter(d=>d.kind==='2v2').slice(-4).reverse().map(d=>'<div style="border-top:1px solid #354d66;padding:2px 0">'+escapeHTML('Tick '+d.tick+' · '+d.why)+'</div>').join('')}</div>
      <div style="color:#a9efc9">Start_Live_Duo.bat starten · Port 8767 · nur Raumcode in beiden Browsern gleich · Bündnis gilt erst nach Bestätigung im Spiel · Relay-Ausfall ⇒ beide spielen autonom weiter.</div>
      </details>
      <details data-section="neural"${openFor('neural')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Neurales Modell</summary>
      <div>${b('shadowRankEnabled',opts.shadowRankEnabled?'Schema-5 Shadow AN':'Schema-5 Shadow AUS')}</div>
      <div style="color:#9bd0e4">Shadow: ${shadowV5Model?'Schema 5 geladen, nur Vergleich':'kein Schema-5-Kandidat geladen'} · ${escapeHTML(shadowDecisionEvidence?.wouldPrefer??'—')} (ohne Aktionswirkung)</div>
      <div style="color:#9bd0e4">Inferenz: ${escapeHTML(neuralModelInfo().fingerprint||'kein Modell')} · Signale ${neuralEvidence.nonzero}/${neuralEvidence.calls} · Ranking ${neuralEvidence.actionNonzero}/${neuralEvidence.actionCalls}</div>
      <div style="color:#9bd0e4">Neurales Modell: ${neuralModel?.schema===4?'Strategische Policy v4 (24 Signale)':neuralModel?.schema===3?'Strategische Policy v3 (16 Signale)':neuralModel?.schema===2?'Aktionsranking (max. ±14 Punkte)':neuralModel?.schema===1?'Slider (max. ±8 Punkte)':'nicht geladen'} · nur bei freigegebener Partie</div>
      </details>
      <details data-section="situation"${openFor('situation')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Lage &amp; Diplomatie</summary>
      <div style="color:#a9efc9">Hauptfront: ${escapeHTML(warState.name)} · Krieg ${isWar()?'aktiv':'frei'} · ${escapeHTML(lastRecoveryReason||'bereit')}</div>
      <div>${b('plan','Manuell: '+opts.plan)}<br>${b('buildStyle','Manueller Baufokus: '+opts.buildStyle)}</div>
      <div style="color:#a9efc9">KI-Strategie: ${escapeHTML(strategic.mode)} · ${escapeHTML(strategic.reason)} · Bau: ${escapeHTML(effectiveBuildStyle())}</div>
      <div style="color:#9bd0e4">Verteidigung: ${escapeHTML(defenseStatus)} · Rückzüge ${defenseStats.retreatsOrdered}/${defenseStats.retreatsObserved} beobachtet · unklar ${defenseStats.unknown} · unbestätigt ${defenseStats.unconfirmed}</div>
      <div style="color:#9bd0e4">Spielmodus: ${escapeHTML(winStatus.mode)} · Siegfortschritt: ${winStatus.progress===null?'unbekannt':(winStatus.progress*100).toFixed(1)+'%'} · Siegschwelle: ${winStatus.threshold===null?'unbekannt':winStatus.threshold+'%'} · Zeit: ${winStatus.remaining===null?'ohne Timer':Math.round(winStatus.remaining)+'s'} · Doomsday: ${winStatus.doomsday?'JA':'NEIN'}</div>
      <div style="color:#9bd0e4">Handel / 60s: Bahn ${incomeStatus.train===null?'unbekannt':Math.round(incomeStatus.train)} · Schiff ${incomeStatus.trade===null?'unbekannt':Math.round(incomeStatus.trade)} · ${escapeHTML(tradeStatus)} · geöffnet ${tradeStats.opened} / Embargos ${tradeStats.embargoed}</div>
      <div style="color:#9bd0e4">Marine: ${escapeHTML(fleetStatus)}</div>
      <div style="color:#9bd0e4">Nukes: ${escapeHTML(nukeStatus)} · bestätigt ${nukeShots} / Versuche ${nukeAttempts} / unbestätigt ${nukeUnconfirmed} · SAM-Schutz ${nuclearCache?.assets?.length - nuclearCache?.uncovered?.length||0}/${nuclearCache?.assets?.length||0}</div>
      <div style="color:#9bd0e4">Allianzen: ${escapeHTML(diplomacyStatus)} · Bestätigt: ${diplomacyStats.accepted} angenommen, ${diplomacyStats.rejected} abgelehnt · ${diplomacyPending.size} ausstehend · ${diplomacyStats.offered} angeboten</div>
      </details>
      <details data-section="humanplan"${openFor('humanplan')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Gegneranalyse &amp; Operationen</summary>
      <div>Operation: ${operation?escapeHTML(operation.type+' → '+operation.targetName+' · '+operation.spent+'/'+operation.budget+' Tr. · Abbruch: '+operation.abort):'Keine sichere Operation'}</div>
      <div>Duo: ${duoPlan?escapeHTML(duoPlan.role+' · Ziel '+duoPlan.targetName+' · Partner-Einsatz '+duoPlan.partnerCommitted+' · Hilfebedarf '+(duoPlan.needHelp?'JA':'nein')):'Kein bestätigter Team-/Duo-Partner'}</div>
      <div>Gegnerischer Sieg: ${victoryThreat?escapeHTML(victoryThreat.name+' · '+victoryThreat.progress.toFixed(1)+'% / '+victoryThreat.threshold+'%'+(victoryThreat.urgent?' · WARNUNG':'')):'Keine belegbare Schwelle / kein Gegner'}</div>
      ${[...opponentProfiles.values()].slice(0,8).map(p=>'<div>'+escapeHTML(p.name+' · '+p.profile+' · '+Math.round(p.confidence*100)+'% Beobachtungssicherheit')+'</div>').join('')}
      <div style="margin-top:5px"><b>Entscheidungs-Timeline</b>${decisionTimeline.slice(-8).reverse().map(d=>'<div style="padding:3px 0;border-top:1px solid #354d66">'+escapeHTML('Tick '+d.tick+' · '+d.why)+(d.alternatives.length?'<br><span style="color:#9bd0e4">'+escapeHTML(d.alternatives.join(' | '))+'</span>':'')+'</div>').join('')}</div>
      </details>
      <details data-section="tuning"${openFor('tuning')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Feintuning</summary>
      <div style="color:#a9efc9">Parameter: ${opts.fullAuto?'AUTONOM '+escapeHTML(autoTuning.mode)+' · '+escapeHTML(autoTuning.reason):'MANUELL'}</div>
      <label>Aggressivität: ${setting('aggressive')}%${opts.fullAuto?' (Auto)':''}<input type="range" data-option="aggressive" min="40" max="100" value="${setting('aggressive')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Reserve: ${setting('reserve')}%${opts.fullAuto?' (Auto)':''}<input type="range" data-option="reserve" min="5" max="65" value="${setting('reserve')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Aktionen/Min.: ${setting('actionsPerMinute')}${opts.fullAuto?' (Auto)':''}<input type="range" data-option="actionsPerMinute" min="15" max="120" value="${setting('actionsPerMinute')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      <label>Zielprüfungen: ${setting('maxTargets')}${opts.fullAuto?' (Auto)':''}<input type="range" data-option="maxTargets" min="4" max="25" value="${setting('maxTargets')}" ${opts.fullAuto?'disabled':''} style="display:block;width:100%"></label>
      </details>
      <details data-section="diagnostics"${openFor('diagnostics')} style="${sectionStyle}"><summary style="cursor:pointer;font-weight:bold;color:#83dcff">Diagnose &amp; Protokoll</summary>
      <div>${b('evidenceMode',opts.evidenceMode?'🔎 Evidence AN':'🔎 Evidence AUS')}</div>
      ${opts.evidenceMode?(()=>{
        const e=evidencePanelState(planningState,troopSnapshot,lastDecisionFrame,
          number(()=>game?.ticks?.(),-1),actionLedger,economyBudgetEvidence);
        const a=e.alternative;
        return '<div style="color:#a9efc9">Verworfene Alternative: '+
          escapeHTML(a?a.id+' · Nutzen '+a.utility+' · '+a.reason:'noch keine Rangliste')+'</div>'+
          '<div style="color:#9bd0e4">Reservegrund: '+escapeHTML(e.reserveReason)+
          ' · Worker-Alter: '+(e.workerAge===null?'unbekannt':e.workerAge+' Ticks')+
          (e.workerStale?' (veraltet/unklar)':'')+'</div>'+
          '<div style="color:#9bd0e4">Letzte Aktion: '+escapeHTML(e.actionId??'—')+
          ' · Entscheidung: '+escapeHTML(e.decisionId??'—')+
          ' · Wirkung: '+escapeHTML(e.effect)+' (nicht aus Intent ableiten)</div>'+
          '<div style="color:#9bd0e4;font-size:10px">Nur Rangfolge und Beobachtung; keine zusätzliche Aktionsfreigabe.</div>';
      })():''}
      ${(()=>{const e=evidencePanelState(planningState,troopSnapshot,lastDecisionFrame,
        number(()=>game?.ticks?.(),-1),actionLedger,economyBudgetEvidence),q=e.budget;
        return '<div style="color:#9bd0e4">Budget-Zeile: '+(q?
          escapeHTML('Cap '+(q.capUse===null?'?':(q.capUse*100).toFixed(0)+'%')+
            ' · City-Wunsch '+(q.cityWanted?'JA':'nein')+' ('+q.cityCount+')'+
            ' · SAM '+(q.wantedSAM||0)+(q.nuclearThreat?' (Bedrohung)':'')+
            ' · Hafen-Meilenstein '+(q.portMilestone?'JA':'nein')+
            ' · Gold-Floor '+q.goldFloor+' (Basis, bauabhängig)'+
            ' · SAM-Quote '+(q.samQuote??'?')+' · Port-Quote '+(q.portQuote??'?')):
            'noch kein frischer Wirtschaftssnapshot')+'</div>';
      })()}
      
      <div style="color:#9bd0e4">Bau: ${escapeHTML(economicStatus)} · Sparziel: ${escapeHTML(investmentStatus)} · Prioritäten: ${escapeHTML(economicLastPlan)}</div>
      <div style="color:#9bd0e4">Tempo: Front ${runtime.borderMs}ms · Kampf ${runtime.combatMs}ms · Bau ${runtime.economyMs}ms · Worker-Checks ${runtime.attackProbes}/${runtime.buildProbes}</div>
      <div style="color:${intentHealth().critical.length?'#ff8181':intentHealth().missing.length?'#ffd480':'#a9efc9'}">Intents: ${intentHealth().eventBus?intentHealth().found+'/'+intentHealth().total:'EventBus ausstehend'} · ${intentHealth().missing.length?'Fehlen: '+escapeHTML(intentHealth().missing.join(', ')):'alle erkannt'}${intentHealth().critical.length?' · KERNFUNKTION EINGESCHRÄNKT':''}</div>
      <div style="color:#9bd0e4">Aktionsbudget: ${actions.length}/${setting('actionsPerMinute')} · Gesendet: ${totalSent} · Fehlgeschlagen: ${totalFailed} · Fehler: ${errors}</div>
      <div style="color:#9bd0e4">Heim: ${Math.floor(troopSnapshot.home/10)} · Reserve: ${Math.floor(troopSnapshot.reserve/10)} · Laufende Angriffe: ${Math.floor(troopSnapshot.committed/10)} · Einkommen/Reserve: ${(troopSnapshot.ratio*100).toFixed(0)}% Kapazität</div>
      <div style="color:#9bd0e4">Eingehend: ${Math.floor(troopSnapshot.incoming/10)} · Stärkster Grenznachbar: ${Math.floor(troopSnapshot.strongest/10)} · Ziel: ${escapeHTML(lastSelection||plan?.name||'Suche')} · ${borderCache?.length||0} Grenzfelder</div>
      <div style="border-top:1px solid #527;margin-top:7px;padding-top:5px"><b>Letzte Entscheidungen</b>${recent.map(s=>`<div>• ${escapeHTML(s)}</div>`).join('')}</div>
      <button data-key="export" style="border:1px solid #73acdd;border-radius:5px;background:#235078;color:white;padding:5px 7px;cursor:pointer">📄 Diagnose JSON</button>
      </details>
      <div style="color:#97a8be;font-size:10px;margin-top:8px">Singleplayer, Public und Private freigegeben · Replays gesperrt · Autostart pro Partie · Pause bis zum Spielwechsel · Alt+Shift+P Start/Pause · Alt+Shift+X NOT-AUS (Autostart AUS).<br>Bei parallelem Spawn Advisor: Auto-Spawn, Smart Attack und Auto-Accept Alliances dort ausschalten.</div>`;
  }
  document.addEventListener('keydown',e=>{
    if(!e.altKey||!e.shiftKey||!['p','x'].includes(e.key.toLowerCase())||e.repeat||e.target?.isContentEditable||
      /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||''))return;
    e.preventDefault();
    if(e.key.toLowerCase()==='x'){
      opts.enabled=false;opts.autoStart=false;autoStartGame=game;generation++;log('NOT-AUS über Hotkey · Autostart AUS');
    }else if(connected()){
      opts.enabled=!opts.enabled;autoStartGame=game;generation++;log(opts.enabled?'BOT START':'BOT PAUSE');
      if(opts.enabled)reportIntents(true);
    } else status='Bot nur in laufender Singleplayer-, Public- oder Private-Partie verfügbar';
    persist();lastPaint=0;paint();
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint,{once:true});
  const interval=setInterval(step,400);
  // DonateEvent exists only in the current GameView update. Sample frequently
  // instead of relying exclusively on the 400 ms planner cycle (which can
  // skip a donation update). Background-tab throttling can still miss one.
  const donationInterval=setInterval(()=>{
    if(opts.enabled&&game&&permittedMatch(game))diagnosticDonationUpdates();
  },90);
  const economyInterval=setInterval(economyStep,750);
  const diplomacyInterval=setInterval(diplomacyTick,950);
  const tradeInterval=setInterval(()=>{tradeTick().catch(e=>{
    tradeStatus='Handel: '+String(e?.message||e).slice(0,75);
  });},1250);
  const nukeInterval=setInterval(nukeStep,1100);
  const duoInterval=setInterval(()=>{duoPublish().catch(e=>{
    duoLocal.status='Relay-Fehler: '+String(e?.message||e).slice(0,55);
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
          if(!allowed[key]||typeof value!=='number'||!Number.isFinite(value)||value<allowed[key][0]||value>allowed[key][1])
            throw new Error('Invalid benchmark setting: '+key);
        }
        Object.assign(opts,settings);if(opts.fullAuto)opts.autoStrategy=true;
        autoTuning.tick=-Infinity;opts.enabled=true;autoStartGame=game;generation++;
        telemetry('benchmark_start','Lokaler Testlauf gestartet',{settings});
        reportIntents(true);
      },
      stop:()=>{telemetry('benchmark_stop','Lokaler Testlauf gestoppt');opts.enabled=false;autoStartGame=game;generation++;},
      // Engine harness awaits every cycle; ordinary browser timers stay unchanged.
      pump:async()=>{await step();await economyStep();await diplomacyTick();
        await nukeStep();if(opts.duoEnabled)await duoPublish();}
    });
  }
  console.info(PREFIX,'v'+VERSION,'ready; Singleplayer/Public/Private, auto-start after match discovery');
})();
