  function duoTrustedPeer(){
    const me=myPlayer(),peer=duoLocal.peer;
    if(!duoConfigured()||!peer||!duoID(peer.id)||
      peer.id===safeID(me)||Date.now()-duoLocal.lastAt>3500||
      duoLocal.match!==duoMatchKey()||
      duoLocal.ownID!==safeID(me))return null;
    // A relay match fingerprint is only a grouping hint; the actual
    // GameView must also contain both player IDs in THIS match.
    const player=(game?.playerViews?.()||[]).find(p=>
      safeID(p)===peer.id&&p.isPlayer?.());
    return player&&player.isAlive?.()!==false?{player,...peer}:null;
  }
  // Foreign alliances are not automatically OUR in-game alliances. A
  // recent, same-match peer report only adds a conservative attack veto.
  // The game alone decides whether either bot can send alliance commands.
  function duoPeerAlly(p){
    const peer=duoTrustedPeer(),id=safeID(p);
    return !!(peer&&duoID(id)&&id!==peer.id&&
      Array.isArray(peer.state?.allies)&&peer.state.allies.includes(id));
  }
  function duoOwnAllies(me){
    return (game?.playerViews?.()||[]).filter(p=>
      p?.isPlayer?.()&&p.isAlive?.()!==false&&
      safeID(p)!==safeID(me)&&duoID(safeID(p))&&
      (actualFriendly(p,me)||me.isOnSameTeam?.(p)))
      .map(safeID).sort().slice(0,16);
  }
  function friendly(p,me){
    // Protect a verified partner and its current confirmed third-party
    // allies. Do not inherit diplomatic status or retain old match IDs.
    return actualFriendly(p,me)||
      (safeID(me)===safeID(myPlayer())&&
       (safeID(p)===duoTrustedPeer()?.id||duoPeerAlly(p)));
  }
  // 0 = clear, 1 = early warning, 2 = observed invasion/loss.
  // Use engine troop units throughout; only UI display divides by ten.
  function duoWarningLevel(s,tick=number(()=>game?.ticks?.(),0)){
    if(!s||!s.home)return 0;
    if(s.incoming>=Math.max(1200,s.home*.10)||
      (crisisTrend&&tick<crisisTrend.expires&&
        (crisisTrend.lostLand>0||crisisTrend.lostAssets>0)))return 2;
    if(s.incoming>=Math.max(500,s.home*.025)||
      s.strongest>=s.home*.90||recentHostilePressure(tick))return 1;
    return 0;
  }
  // Native incoming attacks may expose an absolute arrival tick. Unknown ETA
  // stays null: troop totals or wall-clock observations do not imply speed.
  function diagnosticArrival(attacks){
    const absolute=(attacks||[]).filter(a=>!a.retreating).map(a=>{
      for(const field of ['arrivalTick','targetTick','etaTick']){
        if(Number.isSafeInteger(a?.[field]))return a[field];
      }
      return null;
    }).filter(v=>v!==null);
    return {estimatedArrivalTick:absolute.length?Math.min(...absolute):null,
      arrivalEvidence:absolute.length?'explicit-gameview-field':'unknown'};
  }
  function diagnosticCloseHelp(reason,tick){
    if(!diagnosticHelpId)return;
    const event=['deadline','player-elimination','match-end'].includes(reason)?
      'duo_help_expired':'duo_help_resolved';
    telemetry(event,'Duo-Hilferuf geschlossen',{
      requestId:diagnosticHelpId,partnerId:duoLocal.peer?.id??null,
      requestTick:diagnosticHelpSince,deadlineTick:diagnosticHelpDeadline,
      ageTicks:tick-diagnosticHelpSince,reason,
      supportObserved:'unknown',status:event==='duo_help_expired'?
        'expired-unverified':'no-longer-requested-no-causal-proof'});
    diagnosticHelpId=null;diagnosticHelpSince=null;
    diagnosticHelpDeadline=null;diagnosticHelpExpired=false;
    diagnosticLastHelpAck=null;
  }
  function diagnosticHelpObservation(me,tick){
    if(!diagnosticAid)return;
    const aid=diagnosticAid;
    if(aid.observedTick!==undefined){
      if(tick-aid.observedTick>=180)diagnosticAid=null;
      return;
    }
    const target=(game?.playerViews?.()||[]).find(p=>
      safeID(p)===aid.partnerId);
    if(!target||!target.isAlive?.()){
      telemetry('duo_help_action_unconfirmed','Hilfe nicht durch Spielbeleg auflösbar',{
        requestId:aid.requestId,actionId:aid.actionId,
        reason:'partner-not-alive-or-not-observable',
        status:'unconfirmed-not-proven-failed',supportObserved:'unknown'});
      diagnosticAid=null;return;
    }
    if(tick-aid.tick>=80){
      telemetry('duo_help_action_unconfirmed','Hilfe nach Beobachtungsfenster ungeklärt',{
        requestId:aid.requestId,actionId:aid.actionId,
        sentTick:aid.tick,partnerId:aid.partnerId,
        partnerHomeAtEmission:aid.partnerHomeAtEmission,
        partnerHomeNow:number(()=>target.troops?.(),null),
        status:'unconfirmed-not-proven-failed',supportObserved:'unknown',
        evidence:'no-direct-donation-receipt-in-gameview'});
      diagnosticAid=null;
    }
  }
  // GameView exposes engine DonateEvent updates (senderId, recipientId,
  // donationType, amount). Only this explicit receipt may prove that support
  // was delivered. Aggregate troop/gold deltas never establish causality.
  function diagnosticDonationUpdates(){
    const tick=number(()=>game?.ticks?.(),-1);
    if(tick<0)return;
    let updates;try{updates=game?.updatesSinceLastTick?.();}catch(_){return;}
    if(!updates)return;
    const events=Object.values(updates).flat().filter(u=>
      u&&u.donationType&&['troops','gold'].includes(u.donationType)&&
      typeof u.senderId==='string'&&typeof u.recipientId==='string'&&
      (typeof u.amount==='bigint'||typeof u.amount==='number'));
    for(let i=0;i<events.length;i++){
      const ev=events[i];
      const key=tick+':'+i+':'+ev.senderId+':'+ev.recipientId+
        ':'+String(ev.amount)+':'+ev.donationType;
      if(diagnosticDonationSeen.has(key))continue;
      diagnosticDonationSeen.set(key,tick);
      const me=safeID(myPlayer());
      if(me!==ev.senderId&&me!==ev.recipientId)continue;
      const amount=String(ev.amount);
      const aid=diagnosticAid;
      const sent=ev.donationType==='troops'&&aid&&
        ev.senderId===me&&ev.recipientId===aid.partnerId&&
        tick>=aid.tick&&tick-aid.tick<=110&&!aid.observedTick;
      const received=ev.donationType==='troops'&&diagnosticHelpId&&
        ev.recipientId===me&&ev.senderId===duoTrustedPeer()?.id;
      const requestId=sent?aid.requestId:
        received?diagnosticHelpId:null;
      const actionId=sent?aid.actionId:
        received&&duoLocal.peer?.state?.aidForRequestId===diagnosticHelpId?
          duoLocal.peer.state.aidActionId??null:null;
      telemetry('donation_observed','Engine-Spendenereignis beobachtet',{
        actionId,requestId,senderId:ev.senderId,
        recipientId:ev.recipientId,donationType:ev.donationType,
        actualAmount:amount,evidence:'gameview-donate-event'});
      if(requestId){
        telemetry('duo_help_support_observed',
          'Duo-Truppenspende durch Engine bestätigt',{
            actionId,requestId,senderId:ev.senderId,
            recipientId:ev.recipientId,actualTroops:amount,
            status:'support-observed',evidence:'gameview-donate-event'});
        if(sent){
          aid.observedTick=tick;aid.observedTroops=amount;
          const ledger=actionLedger.find(x=>x.actionId===aid.actionId);
          if(ledger){ledger.actualTroopOutflow=amount;
            ledger.observed='engine-donate-event';ledger.effect='delivered-to-recipient';}
        }
      }
    }
    for(const [key,seenTick] of diagnosticDonationSeen)
      if(tick-seenTick>20)diagnosticDonationSeen.delete(key);
    if(diagnosticDonationSeen.size>300)diagnosticDonationSeen.clear();
  }
  function duoState(){
    const me=myPlayer(),trusted=duoTrustedPeer(),peer=trusted?.player;
    const state=me?.hasSpawned?.()?military(me,strategic.groups):null;
    const target=duoPlan?.strikeTick?duoPlan.target:
      operation?.target??duoPlan?.target??warState.id;
    const candidate=spawnCache?.tile??null,spawn=me?.state?.spawnTile;
    const tick=number(()=>game?.ticks?.(),0);
    const help=!!(state&&state.incoming>Math.max(1200,state.home*.1));
    if(diagnosticHelpId&&tick>=diagnosticHelpDeadline)
      diagnosticCloseHelp('deadline',tick);
    if(help&&!diagnosticHelpId){
      diagnosticHelpId=monitorSession+':h'+(++diagnosticHelpSequence);
      diagnosticHelpSince=tick;diagnosticHelpDeadline=tick+180;
      diagnosticLastHelpAck=null;
      const arrival=diagnosticArrival(me?.incomingAttacks?.()||[]);
      const requestedSupportTroops=Math.max(0,Math.ceil(state.incoming*1.3-state.home));
      telemetry('duo_help_request','Eigene Heimat unter Angriff; Duo-Hilfe angefragt',{
        schemaVersion:2,matchId:String(game?.gameID?.()??'unknown'),
        playerId:safeID(me),decisionId:monitorSession+':t'+tick,
        requestId:diagnosticHelpId,partnerId:trusted?.id??null,
        incomingTroops:state.incoming,homeTroops:state.home,
        availableTroops:state.available,reserveTroops:state.reserve,
        ...arrival,requestedSupportTroops,
        requestDeadlineTick:diagnosticHelpDeadline,
        estimatedShortfall:Math.max(0,Math.ceil(state.incoming-state.home)),
        status:'sent-not-acknowledged',evidence:'visible-incoming-attack'});
    }else if(!help&&diagnosticHelpId){
      diagnosticCloseHelp('below-threat-threshold',tick);
    }
    return {tick:Number.isInteger(game?.ticks?.())?game.ticks():null,
      spawn:Number.isSafeInteger(spawn)?spawn:null,
      candidate:Number.isSafeInteger(candidate)?candidate:null,
      target:duoID(target)?target:null,
      warTarget:duoID(warState.id)?warState.id:null,
      strikeTick:Number.isInteger(duoPlan?.strikeTick)?duoPlan.strikeTick:null,
      planId:duoPlan?.planId??null,expiresTick:duoPlan?.expiresTick??null,
      ackPlanId:duoPlan?.planId&&duoPlan.ready&&peer&&
        state&&state.incoming===0&&
        state.available>=(duoPlan.joint?.own??Infinity)&&
        !recentHostilePressure(number(()=>game?.ticks?.(),0))&&
        actualFriendly(peer,me)&&duoPlan.partner===safeID(peer)&&
        Number.isInteger(duoPlan.expiresTick)&&
        number(()=>game.ticks(),Infinity)<=duoPlan.expiresTick?
          duoPlan.planId:null,
      ownBudget:duoPlan?.joint?.own??null,
      partnerBudget:duoPlan?.joint?.ally??null,
      abortOn:['relay-stale','alliance-lost','front-lost','own-invasion','partner-crisis'],
      ready:!!(state&&state.incoming===0&&
        !recentHostilePressure(number(()=>game?.ticks?.(),0))&&
        !(crisisTrend&&number(()=>game?.ticks?.(),0)<crisisTrend.expires)&&
        state.ratio>=.38&&!state.activeEnemy&&
        state.available>=Math.max(1200,state.home*.09)),
      needHelp:!!(state&&state.incoming>Math.max(1200,state.home*.1)),
      helpRequestId:diagnosticHelpId,helpSinceTick:diagnosticHelpSince,
      helpDeadlineTick:diagnosticHelpDeadline,
      helpShortfall:diagnosticHelpId&&state?
        Math.max(0,Math.ceil(state.incoming-state.home)):null,
      requestedSupportTroops:diagnosticHelpId&&state?
        Math.max(0,Math.ceil(state.incoming*1.3-state.home)):null,
      aidForRequestId:diagnosticAid?.requestId??null,
      aidActionId:diagnosticAid?.actionId??null,
      aidTroops:diagnosticAid?.amount??null,
      aidStatus:diagnosticAid?
        (diagnosticAid.observedTick!==undefined?'observed-engine-donate-event':
          'intent-sent-effect-unknown'):null,
      ackHelpRequestId:trusted?.state?.needHelp===true?
        trusted.state.helpRequestId??null:null,
      warning:duoWarningLevel(state),
      allied:!!(peer&&actualFriendly(peer,me)),
      allies:duoOwnAllies(me),
      fronts:(strategic.groups||[]).filter(x=>x.id!==null&&
        x.tiles?.length&&x.opponent?.isAlive?.()&&!friendly(x.opponent,me))
        .map(x=>x.id).filter(duoID).sort().slice(0,16),
      home:state?.home??null,incoming:state?.incoming??null,
      available:state?.available??null,reserve:state?.reserve??null,
      role:state&&state.incoming>Math.max(1200,state.home*.1)?'defend':
        operation?'attack':game?.inSpawnPhase?.()?'spawn':
        duoPlan?.role?.includes('entlasten')?'support':'build'};
  }
  async function duoPublish(){
    if(duoLocal.lastPromise||!opts.enabled||!duoConfigured()||
      !permittedMatch(game)||game?.gameOver?.())return;
    const ownID=safeID(myPlayer()),match=duoMatchKey(),room=opts.duoRoom;
    const partnerID=null;
    if(duoLocal.match!==match||duoLocal.partnerID!==partnerID||
      duoLocal.ownID!==ownID){
      duoLocal.peer=null;duoLocal.lastAt=0;duoLocal.match=match;
      duoLocal.partnerID=partnerID;duoLocal.ownID=ownID;
    }
    const payload={room,ownID,partnerID,match,auto:true,
      instance:duoLocal.instance,state:duoState()};
    duoLocal.lastPromise=(async()=>{
      const controller=new AbortController();
      // First browser request may wait for a local-network permission
      // prompt. 1.55s aborted it before the user could allow it.
      const timeout=setTimeout(()=>controller.abort(),8000);
      try{
        const response=await fetch('http://127.0.0.1:8767/duo',{
          method:'POST',mode:'cors',cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload),signal:controller.signal
        });
        if(!response.ok){
          const error=await response.json().catch(()=>null);
          throw Error('HTTP '+response.status+
            (error?.error?' · '+error.error:''));
        }
        const data=await response.json();
        if(!opts.duoEnabled||!game||match!==duoMatchKey()||
          room!==opts.duoRoom||ownID!==safeID(myPlayer()))return;
        if(duoLocal.peer&&!data.partner)duoLocal.relayDrops++;
        if(data.partner)duoLocal.seenPeer=true;
        duoLocal.peer=data.partner||null;
        duoLocal.lastAt=data.partner?Date.now():0;
        const helpRequest=data.partner?.state?.needHelp?
          data.partner.state.helpRequestId??null:null;
        if(helpRequest&&helpRequest!==diagnosticLastReceivedHelp){
          diagnosticLastReceivedHelp=helpRequest;
          telemetry('duo_help_received','Partner-Hilferuf empfangen',{
            requestId:helpRequest,partnerId:data.partner.id,
            estimatedShortfall:data.partner.state.helpShortfall??null,
            partnerIncoming:data.partner.state.incoming??null,
            status:'received-not-committed'});
        }else if(!helpRequest)diagnosticLastReceivedHelp=null;
        const commitment=data.partner?.state?.aidForRequestId===diagnosticHelpId&&
          diagnosticHelpId?data.partner.state:null;
        if(commitment&&diagnosticLastCommitmentSeen!==commitment.aidActionId){
          diagnosticLastCommitmentSeen=commitment.aidActionId;
          telemetry('duo_help_commitment_seen','Partner meldet Hilfs-Intent',{
            requestId:diagnosticHelpId,partnerId:data.partner.id,
            partnerActionId:commitment.aidActionId,
            promisedTroops:commitment.aidTroops??null,
            status:'intent-reported-not-observed',
            supportObserved:'unknown'});
        }
        if(diagnosticHelpId&&data.partner?.state?.ackHelpRequestId===
          diagnosticHelpId&&diagnosticLastHelpAck!==diagnosticHelpId){
          diagnosticLastHelpAck=diagnosticHelpId;
          telemetry('duo_help_ack_seen','Partner bestätigt Empfang des Hilferufs',{
            requestId:diagnosticHelpId,partnerId:data.partner.id,
            status:'received-ack-only-not-support-commitment'});
        }
        const duoTick=number(()=>game?.ticks?.(),0);
        if(duoTick-diagnosticLastPeerTick>=120){
          diagnosticLastPeerTick=duoTick;
          telemetry('duo_exchange','Duo-Relay-Zustand gesendet und Antwort empfangen',{
            ownId:ownID,peerId:data.partner?.id??null,
            localState:payload.state,peerState:data.partner?.state??null,
            relayReason:data.reason??null,
            sharedMatch:match,duoRoom:room});
        }
        duoLocal.status=data.partner?'Erkannt · '+data.partner.id:
          data.reason==='different-match'?
          'Raumcode gleich, aber Match-Kennung unterscheidet sich':
          'Warte auf zweite Browser-Instanz';
        diagnosticDuoTransition(duoLocal.status,data.partner,
          data.reason??null);
        if(data.partner)duoLocal.failures=0;
      }catch(e){
        duoLocal.failures++;duoLocal.relayDrops++;
        if(e?.name==='AbortError')duoLocal.relayTimeouts++;
        duoLocal.peer=null;duoLocal.lastAt=0;
        const reason=e?.name==='AbortError'?
          'Browser-Timeout (8s) – lokalen Netzwerkzugriff fuer openfront.io pruefen':
          'Relay-Fehler: '+String(e?.message||e).slice(0,65);
        duoLocal.status=reason;
        diagnosticDuoTransition(duoLocal.status,null,reason);
        if(duoLocal.failures===1||duoLocal.failures%10===0)
          console.warn(PREFIX,'Duo-Verbindung:',reason,
            'Match:',match,'Raum:',room);
      }finally{clearTimeout(timeout);}
    })();
    try{await duoLocal.lastPromise;}finally{duoLocal.lastPromise=null;}
  }
  // The second browser chooses a separately legal spawn around the partner.
  // It never copies/forces the partner tile and still obeys spawnScore vetoes.
  function duoSpawnCandidate(g,me,candidates,urgent=false){
    const peer=duoTrustedPeer(),anchor=peer?.state?.spawn??peer?.state?.candidate;
    if(!Number.isSafeInteger(anchor)||
      (typeof g.isValidRef==='function'&&!g.isValidRef(anchor)))return null;
    const min=number(()=>g.config().minDistanceBetweenPlayers?.(),30);
    const px=g.x(anchor),py=g.y(anchor),rivals=spawnRivals(g,me);
    const tiles=new Set(candidates.filter(Boolean).map(x=>x.tile));
    for(const rad of [min+24,min+50,min+85]){
      for(let j=0;j<16;j++){
        const theta=j*Math.PI/8,x=Math.round(px+rad*Math.cos(theta)),
          y=Math.round(py+rad*Math.sin(theta));
        if(x>=4&&y>=4&&x<g.width()-4&&y<g.height()-4)
          tiles.add(g.ref(x,y));
      }
    }
    let best=null;
    for(const tile of tiles){
      const score=spawnScore(g,tile,rivals,urgent);
      if(!score)continue;
      const distance=Math.hypot(score.x-px,score.y-py);
      if(distance<min+8||distance>min+115)continue;
      const quality=score.score+
        Math.max(0,.21-Math.abs(distance-(min+52))*.0019);
      if(!best||quality>best.quality)best={...score,quality};
    }
    return best;
  }
  function spawnBlock(reason){
    if(spawnState.blocked===reason)return;
    spawnState.blocked=reason;
    spawnState.phase='Blockiert: '+reason;
    telemetry('spawn_blocked',reason,{spawn:{...spawnState},
      eventBus:!!bus,hasIntent:!!ctors.spawn,enabled:!!opts.enabled,
      autoSpawn:!!opts.autoSpawn});
  }
  function spawnRemaining(g) {
    const fallback=multiplayerMatch(g)?200:100;
    const turns=number(()=>g.config().numSpawnPhaseTurns?.(),fallback);
    return Math.max(0,turns-number(()=>g.ticks(),0));
  }
  function spawnTileValid(g,tile) {
    try{return Number.isInteger(tile)&&
      (typeof g.isValidRef!=='function'||g.isValidRef(tile))&&
      g.isLand(tile)&&!g.isImpassable(tile)&&
      !g.hasOwner(tile)&&!g.isBorder?.(tile);}
    catch(_){return false;}
  }
  function spawnRivals(g,me) {
    const ownTeam=me?.team?.(),mine=safeID(me);
    return (g.playerViews?.()||[]).filter(p=>mine===null||safeID(p)!==mine)
      .map(p=>{
        const tile=p.state?.spawnTile;
        if(!Number.isInteger(tile)||(typeof g.isValidRef==='function'&&!g.isValidRef(tile)))return null;
        return {x:g.x(tile),y:g.y(tile),
          teammate:(ownTeam!==null&&ownTeam!==undefined&&p.team?.()===ownTeam)||
            safeID(p)===duoTrustedPeer()?.id};
      }).filter(Boolean);
  }
  // Use the actual 4-tile spawn footprint and three additional land rings.
  // Nearby free plains provide opening growth, while the outer rings penalize
  // islands/peninsulas and distant teammates do not count as enemy threats.
  function spawnScore(g,tile,rivals=spawnRivals(g,myPlayer()),urgent=false) {
    if(!spawnTileValid(g,tile))return null;
    const x=g.x(tile),y=g.y(tile),w=g.width(),h=g.height();
    const good=(xx,yy)=>{
      if(xx<0||yy<0||xx>=w||yy>=h)return null;
      const t=g.ref(xx,yy);
      if(!g.isLand(t)||g.isImpassable(t)||g.hasOwner(t))return null;
      const magnitude=number(()=>g.magnitude?.(t),
        number(()=>g.terrainByte?.(t)&31,10));
      return {plain:magnitude<10,high:magnitude<20};
    };
    let core=0,coreTotal=0,plain=0;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      if(dx*dx+dy*dy>16)continue;
      coreTotal++;
      const v=good(x+dx,y+dy);
      if(v){core++;plain+=v.plain?1:0;}
    }
    if(core<coreTotal*(urgent?.58:.83))return null;
    const minSide=Math.min(w,h),scale=Math.min(70,Math.max(15,minSide/7));
    const rings=[Math.max(8,scale*.27),Math.max(13,scale*.57),scale];
    let accessible=0,weight=0,plains=0,coastal=0;
    const angles=16;
    for(let i=0;i<rings.length;i++){
      const rr=rings[i],importance=i===0?1:i===1?1.25:1.5;
      for(let j=0;j<angles;j++){
        const t=2*Math.PI*j/angles;
        const xx=Math.round(x+rr*Math.cos(t)),yy=Math.round(y+rr*Math.sin(t));
        const v=good(xx,yy);
        weight+=importance;
        if(v){accessible+=importance;plains+=v.plain?importance:v.high?importance*.38:0;}
        try{
          if(xx>=0&&yy>=0&&xx<w&&yy<h&&
            (g.isOceanShore?.(g.ref(xx,yy))||
             (!g.isOceanShore&&g.isShore?.(g.ref(xx,yy)))))
            coastal+=importance;
        }catch(_){}
      }
    }
    const density=accessible/Math.max(1,weight);
    if(density<(urgent?.24:.48))return null;
    const enemy=rivals.filter(p=>!p.teammate)
      .map(p=>Math.abs(p.x-x)+Math.abs(p.y-y));
    const ally=rivals.filter(p=>p.teammate)
      .map(p=>Math.abs(p.x-x)+Math.abs(p.y-y));
    const nearestEnemy=enemy.length?Math.min(...enemy):Infinity;
    const nearestAlly=ally.length?Math.min(...ally):Infinity;
    const minimum=number(()=>g.config().minDistanceBetweenPlayers?.(),30);
    if(nearestEnemy<(urgent?minimum:minimum+4))return null;
    // Too many people in one shared territory prevents both players growing.
    if(nearestAlly<(urgent?16:Math.max(22,minimum*.8)))return null;
    const enemyScore=enemy.length===0?0.75:
      Math.min(1,Math.max(0,(nearestEnemy-minimum)/(minimum*2.5)));
    const teamScore=!ally.length?0:
      Math.min(1,Math.max(0,(nearestAlly-minimum)/(minimum*2.5)))*
        Math.min(1,190/Math.max(60,nearestAlly));
    // In ranked duo, independently running bots use the already visible
    // teammate spawn to converge on a shared lane without overlapping cores.
    // Keep legal spawn footprint and minimum-distance veto authoritative.
    const gc=g?.config?.().gameConfig?.()||{};
    const rankedPair=gc.rankedType==='2v2'&&gc.gameMode==='Team';
    const allyBand=rankedPair&&ally.length?
      nearestAlly<=minimum+115?
        Math.max(-.09,.12-Math.abs(nearestAlly-(minimum+45))*.0015):
        -.15:0;
    const openScore=core/coreTotal;
    const edge=Math.min(x,y,w-1-x,h-1-y);
    const edgeScore=Math.min(1,edge/Math.max(22,scale));
    // Coast is helpful for ports, not a reason to prefer a tiny island.
    const coastScore=Math.min(1,coastal/Math.max(1,weight)*3);
    // Several nearby enemy spawns are riskier than one equally close rival;
    // avoid an opening surrounded by Impossible nations even on rich land.
    const crowding=enemy.filter(d=>d<minimum*1.8).length;
    const crowdPenalty=opts.impossibleExperiment?
      Math.min(.06,Math.max(0,crowding-1)*.03):0;
    const score=openScore*.19+density*.32+
      (plain/Math.max(1,core)*.45+plains/Math.max(1,weight)*.55)*.18+
      enemyScore*.16+edgeScore*.05+coastScore*.04+
      (ally.length?teamScore*.06:0)+allyBand-crowdPenalty;
    return {tile,x,y,score,density,core:openScore,
      coast:coastScore,enemy:Number.isFinite(nearestEnemy)?nearestEnemy:null,
      teammate:Number.isFinite(nearestAlly)?nearestAlly:null};
  }
  function startSpawnSearch() {
    if(spawnJob||!game||!opts.enabled||Date.now()<spawnRetryAt||
      !game.inSpawnPhase?.()||game.config().isRandomSpawn?.())return;
    const g=game,serial=generation,me=myPlayer();
    if(me?.hasSpawned?.()||Number.isInteger(me?.state?.spawnTile))return;
    const w=g.width(),h=g.height(),margin=6;
    if(w<=margin*2||h<=margin*2)return;
    const stride=Math.max(11,Math.floor(Math.min(w,h)/19));
    const rivals=spawnRivals(g,me),candidates=new Map();
    const offsets=[0,.5].map(f=>Math.floor(stride*f));
    const jobs=[];
    for(const offset of offsets){
      for(let y=margin+offset;y<h-margin;y+=stride)
        for(let x=margin+offset;x<w-margin;x+=stride)
          jobs.push([x,y]);
    }
    let index=0;
    spawnAlternatives=[];
    spawnJob={serial,started:number(()=>g.ticks(),0),total:jobs.length,candidates};
    spawnState.phase='Suche';spawnState.scanned=0;
    function chunk(){
      if(serial!==generation||g!==game||!opts.enabled||!permittedMatch(g)||
        !g.inSpawnPhase?.()||myPlayer()?.hasSpawned?.()||
        Number.isInteger(myPlayer()?.state?.spawnTile)){
        spawnJob=null;return;
      }
      const start=performance.now();
      try{
        while(index<jobs.length && performance.now()-start<8){
          const [x,y]=jobs[index++],tile=g.ref(x,y);
          const candidate=spawnScore(g,tile,rivals);
          if(!candidate)continue;
          candidates.set(tile,candidate);
          if(candidates.size>18){
            const worst=[...candidates.values()].sort((a,b)=>a.score-b.score)[0];
            candidates.delete(worst.tile);
          }
          if(!spawnCache || candidate.score>spawnCache.score)
            spawnCache=candidate;
        }
        spawnState.scanned=index;
      }catch(e){
        spawnJob=null;spawnState.phase='Fehler';
        status='Spawn-Analyse: '+String(e?.message||e).slice(0,90);
        spawnBlock('Spawn-Suche: '+String(e?.message||e).slice(0,80));
        spawnRetryAt=Date.now()+600;return;
      }
      if(index<jobs.length){
        // Near deadline, send the best VALID candidate found so far while
        // the grid continues. Do not wait out the last spawn-phase tick.
        // Prefer a good spot early over scanning until the live spawn expires.
        const tick=number(()=>g.ticks(),0),remaining=spawnRemaining(g);
        if(spawnCache && (remaining<=110 ||
          (index>=120 && spawnCache.score>=.62)))
          doSpawn(tick);
        setTimeout(chunk,0);return;
      }
      spawnJob=null;if(!spawnState.lastSent)spawnState.phase='Fertig';
      spawnAlternatives=[...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,18);
      if(candidates.size){
        // Refine only the top candidates in a bounded local neighborhood.
        for(const top of [...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,6)){
          for(const [dx,dy] of [[0,0],[stride/3,0],[-stride/3,0],
            [0,stride/3],[0,-stride/3],[stride/3,stride/3],
            [-stride/3,-stride/3]]){
            const x=Math.round(top.x+dx),y=Math.round(top.y+dy);
            if(x<margin||y<margin||x>=w-margin||y>=h-margin)continue;
            const v=spawnScore(g,g.ref(x,y),rivals);
            if(v&&(!spawnCache||v.score>spawnCache.score))spawnCache=v;
          }
        }
      }
      if(!spawnCache){
        status='Spawn: kein sicherer Standort; Suche wiederholen';
        spawnRetryAt=Date.now()+800;return;
      }
      doSpawn(number(()=>g.ticks(),0));
    }
    setTimeout(chunk,0);
  }
  function emergencySpawnSearch(g,me){
    if(!g?.inSpawnPhase?.() || g.config().isRandomSpawn?.())return null;
    const w=g.width(),h=g.height(),step=Math.max(9,Math.floor(Math.min(w,h)/14)),
      rivals=spawnRivals(g,me);
    let best=null;
    for(let y=5;y<h-5;y+=step)for(let x=5;x<w-5;x+=step){
      const current=spawnScore(g,g.ref(x,y),rivals,true);
      if(current&&(!best||current.score>best.score))best=current;
    }
    if(best){
      spawnState.phase='Deadline-Fallback';spawnCache=best;
    }
    return best;
  }
  function doSpawn(tick) {
    if(!opts.autoSpawn){spawnBlock('Auto-Spawn ausgeschaltet');return;}
    if(!game?.inSpawnPhase?.()){spawnBlock('Spawnphase bereits beendet');return;}
    if(game.config().isRandomSpawn?.()){spawnBlock('Zufallsspawn aktiv');return;}
    if(!bus?.emit){spawnBlock('EventBus fehlt');return;}
    if(!ctors.spawn){spawnBlock('Spawn-Intent nicht erkannt');return;}
    if(tick-lastSpawn<22)return;
    const me=myPlayer();
    if(me?.hasSpawned?.()||Number.isInteger(me?.state?.spawnTile))return;
    spawnState.blocked=null;
    if(!spawnCache){
      if(spawnRemaining(game)<=110)spawnCache=emergencySpawnSearch(game,me);
      if(!spawnCache){spawnBlock('Kein gültiges Land im Spawn-Suchraster');startSpawnSearch();return;}
    }
    if(spawnJob && spawnRemaining(game)>110 &&
      (spawnState.scanned<120 || spawnCache.score<.62))return;
    // Deterministic leader/follower: lower PlayerID publishes first; the
    // other browser waits briefly for its anchor but never misses deadline.
    const peer=duoTrustedPeer();
    if(peer&&String(safeID(me))>String(peer.id)&&
      !Number.isSafeInteger(peer.state?.spawn)&&
      !Number.isSafeInteger(peer.state?.candidate)&&
      spawnRemaining(game)>85){
      spawnState.phase='Duo: warte kurz auf Partner-Spawn';return;
    }
    const rivals=spawnRivals(game,me),urgent=spawnRemaining(game)<=55;
    const candidates=[spawnCache,...spawnAlternatives,...(spawnJob?.candidates?.values()||[])];
    let best=null;
    for(const candidate of candidates){
      const current=spawnScore(game,candidate.tile,rivals,urgent);
      if(!current)continue;
      // A selected tile that has not appeared in the game state after a
      // full retry interval should not monopolize the last multiplayer ticks.
      if(spawnState.lastSent?.tile===current.tile &&
        tick-spawnState.lastSent.tick>=30 && candidates.length>1)continue;
      if(!best||current.score>best.score)best=current;
    }
    const duoNearby=duoSpawnCandidate(game,me,candidates,urgent);
    if(duoNearby){best=duoNearby;spawnState.phase='Duo: sicherer Nachbar-Spawn';}
    if(!best && urgent)best=emergencySpawnSearch(game,me);
    if(!best){
      spawnCache=null;spawnBlock('Alle Kandidaten belegt/ungültig; suche neu');
      if(!spawnJob)startSpawnSearch();
      return;
    }
    spawnCache=best;spawnState.blocked=null;
    if(send('spawn',[best.tile],
      'SPAWN → strategischer Standort ('+best.x+','+best.y+
      ') · Land '+Math.round(best.density*100)+'% · Score '+best.score.toFixed(3),
      true)){
      lastSpawn=tick;spawnState.phase='Auswahl gesendet';spawnState.attempts++;
      spawnState.lastSent={tile:best.tile,tick,score:best.score,
        density:best.density,enemy:best.enemy,teammate:best.teammate};
      telemetry('spawn_intent','Strategischer Spawn angefordert',
        {spawn:{...spawnState.lastSent},withoutPlayerView:!me});
    }else spawnBlock('Spawn-Intent nicht gesendet (EventBus/Spielstatus prüfen)');
  }
  async function borders(me,tick) {
    const id=safeID(me);
    if(borderCache && borderPlayer===id && tick-lastBorderTick<22)return borderCache;
    // Combat and economy may request the border at the same moment. One worker
    // query is enough for both; the old code launched several redundant queries.
    if(borderInflight && borderInflight.id===id && borderInflight.generation===generation)
      return borderInflight.promise;
    const serial=generation, t0=performance.now();
    const promise=(async()=>{
      const result=await me.borderTiles();
      const tiles=result?.borderTiles;
      if(!tiles || typeof tiles[Symbol.iterator]!=='function')return [];
      const copied=[...tiles];
      if(serial===generation && game && id===safeID(myPlayer())){
        borderCache=copied;borderPlayer=id;lastBorderTick=number(()=>game.ticks(),tick);
        if(tick-lastBorderRefresh>=15){borderOffset++;lastBorderRefresh=tick;}
        runtime.borderMs=Math.round(performance.now()-t0);
      }
      return copied;
    })();
    borderInflight={id,generation:serial,promise};
    try{return await promise;}
    finally {if(borderInflight?.promise===promise)borderInflight=null;}
  }
  // FFA vs team mode and the real win threshold from Config. Missing client
  // information is represented as null, NEVER filled with a guessed win rule.
  function victoryPlan(me) {
    const cfg=game.config(),gc=cfg.gameConfig(),mode=gc.gameMode==='Team'?'Team':'FFA';
    const team=me.team?.(),ours=number(()=>me.numTilesOwned(),0);
    const land=mode==='Team'&&team!==undefined&&team!==null ?
      (game.playerViews?.()||[]).filter(p=>p.team?.()===team)
        .reduce((n,p)=>n+number(()=>p.numTilesOwned(),0),0):ours;
    const total=number(()=>game.numLandTiles?.(),0),fallout=number(()=>game.numTilesWithFallout?.(),0);
    const elapsed=number(()=>game.elapsedGameSeconds?.(),number(()=>game.ticks(),0)/10);
    const winPct=number(()=>cfg.percentageTilesOwnedToWin?.(elapsed),NaN);
    const remaining=Number.isFinite(gc.maxTimerValue)?
      Math.max(0,gc.maxTimerValue*60-elapsed):null;
    const threshold=total>0&&Number.isFinite(winPct)?winPct:null;
    const progress=total>0?land/Math.max(1,total-fallout):null;
    const urgent=(remaining!==null&&remaining<300)||!!me.inDoomsdayClock?.()||
      (progress!==null&&threshold!==null&&progress*100>=threshold-8);
    winStatus={mode,progress,threshold,remaining,urgent,
      doomsday:!!me.inDoomsdayClock?.(),
      ownTiles:ours,teamTiles:land};
    return winStatus;
  }

  // Short, bounded, per-match explanations. Snapshot export keeps alternatives
  // even when an old telemetry stream has been truncated.
  function decisionNote(kind,why,alternatives=[],tick=number(()=>game?.ticks?.(),0)){
    const key=kind+':'+why,previous=decisionKeys.get(key);
    if(previous!==undefined&&tick-previous<90)return;
    decisionKeys.set(key,tick);
    if(decisionKeys.size>140)for(const [k,v] of decisionKeys)
      if(tick-v>1100)decisionKeys.delete(k);
    const row={tick,kind,why,alternatives:alternatives.slice(0,4),
      decisionId:monitorSession+':t'+tick+':d'+(++diagnosticDecisionSequence),
      evidence:'ranked-options-not-executed-actions'};
    decisionTimeline.push(row);
    if(decisionTimeline.length>90)decisionTimeline.shift();
    telemetry('decision_timeline',why,{decision:row});
  }
  // P1 bounded look-ahead. It compares a small set of already-known options
  // under three explicit responses. This ranks planners only; every action
  // still passes its existing worker, alliance, reserve and budget gates.
