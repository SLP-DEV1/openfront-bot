  function strategicCandidatePlan(me,groups,s,context,ranked,tick){
    const started=performance.now(),budgetMs=50,candidates=[];
    const home=Math.max(1,s.home),waitGrowth=Math.max(0,s.growthPotential||0);
    const holdRisk=clamp(Math.max(s.incoming,s.strongest)/home,0,2);
    // P1: versionierte Archetyp-Politik. Sie verschiebt die Kandidaten-
    // Rangfolge (Timing, Zielauswahl, Subsysteme) und ändert damit die
    // tatsächlich gewählte Aktion. 'legacy' (keine Politik) bleibt identisch.
    const arch=archetypePolicy();
    candidates.push({id:'hold',channel:'hold',kind:'hold',target:null,
      utility:Math.round(35+holdRisk*85-waitGrowth/Math.max(1,home)*900),
      cost:0,risk:holdRisk,waitCost:Math.round(waitGrowth),
      scenarios:{holds:0,counter:s.incoming,thirdParty:s.strongest},
      reason:holdRisk>=.85?'sichtbarer Druck':'Reserve und Wachstum abwarten'});
    const cap=Math.max(1,s.max),capPressure=s.home/cap;
    const observedIncome=Math.max(0,(incomeStatus.train||0)+(incomeStatus.trade||0));
    candidates.push({id:'invest',channel:'hold',kind:'invest',target:null,
      utility:Math.round(42+(capPressure>.82?48:0)+Math.min(35,observedIncome/50000)-holdRisk*55),
      cost:null,risk:holdRisk,waitCost:Math.round(waitGrowth*.6),
      scenarios:{holds:observedIncome,counter:-Math.round(s.incoming*.35),thirdParty:-Math.round(s.strongest*.1)},
      reason:capPressure>.82?'Kapazität ausbauen':'beobachtetes Einkommen verstärken'});
    for(const item of (ranked||[]).slice(0,6)){
      if(performance.now()-started>budgetMs)break;
      if(item.id===null){
        const amount=Math.max(0,neutralAttackAmount(s,setting('aggressive')));
        candidates.push({id:'neutral:'+String(item.tile??item.tiles?.[0]??'land'),
          channel:'land',kind:'expand',target:null,utility:Math.round(70+Math.min(45,item.score||0)-holdRisk*60),
          cost:amount,risk:holdRisk*.55,waitCost:Math.round(waitGrowth*.25),
          scenarios:{holds:item.tiles?.length||1,counter:-Math.round(amount*.2),thirdParty:-Math.round(s.strongest*.05)},
          reason:'neutrales Wachstum mit begrenztem Einsatz'});continue;
      }
      const enemy=Math.max(0,number(()=>item.opponent?.troops?.(),0));
      const guard=frontRiskPlan(groups,s,item.id),amount=Math.max(0,
        Math.floor(Math.min(s.available*.72,guard.safeStrike||0)));
      const forecast=amount>0?attackForecast(me,item,amount):
        {loss:Infinity,time:Infinity,engine:false,method:'no-safe-budget'};
      const other=(groups||[]).filter(g=>g.id!==null&&g.id!==item.id&&
        !friendly(g.opponent,me)).reduce((n,g)=>Math.max(n,
          number(()=>g.opponent?.troops?.(),0)),0);
      const held=Math.max(0,(item.tiles?.length||0)*18-
        (Number.isFinite(forecast.loss)?forecast.loss/Math.max(1,amount)*25:60));
      const counter=Math.max(0,enemy-amount*.7),third=Math.max(0,other-(home-amount));
      candidates.push({id:'attack:'+item.id,channel:'land',kind:'attack',target:item.id,
        utility:Math.round(55+(item.score||0)+held-counter/home*90-third/home*70),
        cost:amount,risk:clamp((counter+third)/home,0,2),waitCost:Math.round(waitGrowth*.4),
        scenarios:{holds:Math.round(held),counter:Math.round(counter),thirdParty:Math.round(third)},
        forecast:{loss:Number.isFinite(forecast.loss)?forecast.loss:null,
          time:Number.isFinite(forecast.time)?forecast.time:null,method:forecast.method},
        reason:'Frontziel gegen Halten, Gegenangriff und Drittpartei verglichen'});
    }
    if((arch.boats??opts.boats)&&ctors.boat&&!pendingBoat&&s.incoming===0)
      candidates.push({id:'naval',channel:'naval',kind:'naval',target:null,
        utility:Math.round((ranked||[]).length?36:82-holdRisk*55),cost:null,
        risk:holdRisk,waitCost:Math.round(waitGrowth*.5),
        scenarios:{holds:25,counter:0,thirdParty:Math.round(s.strongest*.08)},
        reason:'alternative Seeoperation bei begrenzter Landoption'});
    const peer=duoTrustedPeer();
    if(peer?.state?.needHelp)candidates.push({id:'support:'+peer.id,channel:'hold',
      kind:'support',target:peer.id,utility:90,risk:holdRisk,cost:null,waitCost:0,
      scenarios:{holds:40,counter:s.incoming,thirdParty:s.strongest},
      reason:'bestätigter Partnerbedarf'});
    // P1: die Archetyp-Politik verschiebt die Rangfolge, bevor sie gefroren
    // wird. 'legacy' hat null Werte und ändert die Rangfolge nicht.
    for(const c of candidates){
      if(c.kind==='attack'){
        c.utility+=arch.attackUtility;
        if(tick<arch.firstAttackGate)c.utility-=1000;
      }else if(c.kind==='hold'||c.kind==='support')c.utility+=arch.holdUtility;
      else if(c.kind==='invest')c.utility+=arch.investUtility;
      else if(c.kind==='naval')c.utility+=arch.navalUtility;
    }
    if(arch.targetWeakest){
      const hostiles=(groups||[]).filter(g=>g.id!==null&&!friendly(g.opponent,me));
      const weakest=hostiles.slice().sort((a,b)=>
        number(()=>a.opponent?.troops?.(),0)-number(()=>b.opponent?.troops?.(),0))[0];
      if(weakest)for(const c of candidates)
        if(c.kind==='attack')c.utility+=c.target===weakest.id?500:-250;
    }
    candidates.sort((a,b)=>b.utility-a.utility||String(a.id).localeCompare(String(b.id)));
    const limited=candidates.slice(0,8),selected=limited[0]||null;
    const rejectedCandidates=limited.slice(1);
    archetypeRecord(selected,groups,me,tick);
    planningState={tick,candidates:limited,selected,
      rejected:limited[1]||null,rejectedCandidates,
      durationMs:Number((performance.now()-started).toFixed(2)),
      budgetMs,truncated:candidates.length>limited.length||performance.now()-started>budgetMs,
      semantics:'bounded-ranking-only; existing legality remains authoritative'};
    // P0 canonical decision frame (diagnostics only; it never authorizes or
    // blocks actions). One frame per planning tick links the rule choice, the
    // shadow model ranking and the actually emitted intent through the same
    // decisionId that send() stamps on every action record. Rejected
    // candidates are only ranked in this match; none is executed, so no
    // counterfactual effect may be attributed to them here.
    const borderAge=lastDecisionFrame?.borderAgeTicks??null;
    planningState.decisionId=monitorSession?monitorSession+':t'+
      number(()=>game?.ticks?.(),0):':t'+number(()=>game?.ticks?.(),0);
    planningState.matchId=String(game?.gameID?.()??'unknown');
    planningState.clientId=safeID(me);
    planningState.dataAge={requestedTick:lastDecisionFrame?.requestedTick??null,
      borderAgeTicks:borderAge};
    planningState.missingMask={
      borderStale:borderAge===null||borderAge>20,
      opponentTroopsUnknown:(groups||[]).filter(g=>g.id!==null&&
        !Number.isFinite(number(()=>g.opponent?.troops?.(),NaN))).length,
      modelEnabled:!!(opts.shadowRankEnabled&&shadowV5Model)};
    planningState.provenance={bot:VERSION,
      engineCommit:window.BOOTSTRAP_CONFIG?.gitCommit??null,
      gameMode:game?.config?.().gameConfig?.().gameMode??'unknown'};
    planningState.modelChoice=null;
    planningState.modelScores=null;
    planningState.actualIntents=null;
    planningState.blockReasons=null;
    planningState.actionReceipt=null;
    planningState.observedEffects=null;
    planningState.outcomeStatus='pending';
    planningState.resolved=false;
    // Candidate-v5 only observes the fixed rule-ranked choices; its output is
    // never read by an intent, budget, reserve, legality or target selector.
    if(opts.shadowRankEnabled&&shadowV5Model&&limited.length){
      try{
        const state={home:s.home,maxTroops:s.max,committed:s.committed,
          incoming:s.incoming,reserve:s.reserve,gold:goldAmount(me),
          land:number(()=>me.numTilesOwned(),0),capacityUse:s.ratio,
          frontCount:groups?.length||0};
        const rankedShadow=limited.map(candidate=>{
          const f=shadowV5.features(state,{kind:candidate.kind,
            costTroops:candidate.cost||0,counterRisk:candidate.risk||0,
            holdProbability:1-Math.min(1,candidate.risk||0)});
          const outcome=shadowV5.predict(shadowV5Model,f);
          return {id:candidate.id,heldGain:outcome.heldGain,
            lossRisk:outcome.lossRisk,score:outcome.heldGain-outcome.lossRisk};
        }).sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id)));
        shadowDecisionEvidence={tick,ruleChoice:selected?.id??null,
          wouldPrefer:rankedShadow[0]?.id??null,ranked:rankedShadow,
          changedIntent:false,evidence:'shadow-only; not observed game effect'};
        planningState.modelChoice=rankedShadow[0]?.id??null;
        planningState.modelScores=rankedShadow;
        if(tick%100<4)telemetry('neural_shadow_rank',
          'Schema-5-Vorschlag nur protokolliert',shadowDecisionEvidence);
      }catch(e){shadowDecisionEvidence={tick,error:String(e?.message||e),
        changedIntent:false};}
    }
    return planningState;
  }
  // Observed behaviour is evidence, not knowledge of a human's intentions.
  // No guesses from hidden armies, and no cross-match personal profiling.
  function observeHumanProfiles(me,tick){
    const current=new Set();
    const fleets=(game.playerViews?.()||[]).filter(p=>p.isAlive?.()&&
      (p.type?.()==='HUMAN'||typeof p.clientID?.()==='string'&&p.clientID().length>0)).map(p=>
      (p.units?.()||[]).filter(u=>u.isActive?.()&&u.type?.()==='Warship').length)
      .sort((a,b)=>a-b);
    const typicalFleet=fleets.length?fleets[Math.floor(fleets.length/2)]:0;
    for(const p of game.playerViews?.()||[]){
      const id=safeID(p);
      if(id===null||id===safeID(me)||!p.isAlive?.()||friendly(p,me)||
         me.isOnSameTeam?.(p))continue;
      const human=p.type?.()==='HUMAN' ||
        (typeof p.clientID?.()==='string'&&p.clientID().length>0);
      if(!human)continue;
      current.add(id);
      const old=opponentProfiles.get(id);
      if(old&&tick-old.tick<80)continue;
      const deployed=(p.outgoingAttacks?.()||[]).filter(a=>!a.retreating);
      const attacks=deployed.filter(a=>number(()=>a.troops,0)>0);
      const weight=attacks.reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
      const home=Math.max(1,number(()=>p.troops?.(),1));
      const units=(()=>{try{return p.units?.()||[];}catch(_){return [];}})();
      const ports=units.filter(u=>u.isActive?.()&&u.type?.()==='Port').length;
      const warships=units.filter(u=>u.isActive?.()&&u.type?.()==='Warship').length;
      const transports=units.filter(u=>u.isActive?.()&&u.type?.()==='Transport').length;
      const ships=warships+transports;
      const past=opponentTrend(p,tick);
      const samples=Math.min(12,(old?.samples||0)+1);
      const early=tick<1600;
      // Ports are infrastructure, not evidence of naval aggression. Compare
      // fleets with the current match, so island maps do not label everyone.
      const naval=transports>0||warships>=Math.max(2,typicalFleet*1.5);
      const aggressive=weight>=Math.max(900,home*.22) ||
        (past.valid&&past.landChange>.09&&early);
      const opportunistic=weight>=Math.max(500,home*.12)&&
        (past.sustained||adversaryWindow(me,p).exposed);
      const economic=past.valid&&past.growing&&
        weight<Math.max(500,home*.12);
      const profile=naval?'Marinefokus':opportunistic?'Gelegenheitsangreifer':
        aggressive&&early?'Früher Angreifer':
        economic?'Wirtschaftsaufbauer':'Unbestimmt';
      const signalSamples=profile==='Unbestimmt'?0:
        old?.profile===profile?Math.min(12,(old.signalSamples||0)+1):1;
      // A changed label starts with weak evidence even after a long match.
      // This is a heuristic score, not a calibrated probability.
      const confidence=signalSamples?Math.min(naval&&transports===0?.65:.85,
        .20+signalSamples*.07):0;
      const result={id,name:nameOf(p),profile,confidence,samples,tick,
        signalSamples,confidenceMethod:'consecutive-signal-heuristic',
        weight,ports,ships,warships,transports,typicalFleet,home};
      opponentProfiles.set(id,result);
      if(old?.profile!==profile&&confidence>=.38)
        decisionNote('profil',nameOf(p)+': '+profile+' ('+
          Math.round(confidence*100)+'% heuristische Konfidenz)',[],tick);
    }
    for(const id of opponentProfiles.keys())
      if(!current.has(id))opponentProfiles.delete(id);
  }
  // A competitor's land is measured against the same visible win denominator
  // as ours. Team players are grouped once, not counted as separate threats.
  function observeVictoryThreat(me,tick){
    const total=number(()=>game.numLandTiles?.(),0)-
      number(()=>game.numTilesWithFallout?.(),0);
    const threshold=winStatus.threshold;
    if(total<=0||!Number.isFinite(threshold)){
      victoryThreat=null;return null;
    }
    const team=winStatus.mode==='Team',ours=me.team?.(),seen=new Set();
    let leader=null;
    for(const p of game.playerViews?.()||[]){
      if(!p?.isAlive?.()||friendly(p,me)||me.isOnSameTeam?.(p))continue;
      const pTeam=p.team?.(),sameTeam=team&&pTeam!==null&&pTeam!==undefined;
      const key=sameTeam?'team:'+String(pTeam):'player:'+String(safeID(p));
      if(seen.has(key))continue;
      seen.add(key);
      if(sameTeam&&pTeam===ours)continue;
      const members=sameTeam?(game.playerViews?.()||[]).filter(q=>
        q.isAlive?.()&&q.team?.()===pTeam):[p];
      const land=members.reduce((n,q)=>n+Math.max(0,number(()=>q.numTilesOwned?.(),0)),0);
      const progress=land/total*100;
      if(!leader||progress>leader.progress)
        leader={id:safeID(p),name:sameTeam?'Team '+String(pTeam):nameOf(p),
          team:sameTeam?pTeam:null,progress,land};
    }
    const urgent=!!leader&&leader.progress>=threshold-8;
    const last=victoryThreat;
    victoryThreat=leader?{...leader,threshold,urgent,tick}:null;
    if(urgent&&(!last?.urgent||last.id!==leader.id||tick-last.tick>=180))
      decisionNote('siegwarnung','Gegnerischer Siegfortschritt: '+
        leader.name+' '+leader.progress.toFixed(1)+'% / '+threshold+'%',
        ['Eigene Verteidigung und Angriffszulässigkeit bleiben verbindlich'],tick);
    return victoryThreat;
  }
  // Ranked team state still works without the relay. When the explicitly
  // configured PlayerID is connected AND the game itself confirms friendship,
  // relay state may break ties between otherwise legal/safe targets.
  // A joint attack uses two INDEPENDENTLY protected deployment budgets.
  // Neither browser treats a relay promise as a deployed friendly stack.
  // The shared target must touch both frontiers; the launch must be
  // acknowledged by both before a weaker individual assault is allowed.
  function duoJointOpportunity(me,items,s,item,tick,launch=false){
    const peer=duoTrustedPeer(),id=item?.id,p=peer?.player,info=peer?.state;
    const observedOn=(p?.outgoingAttacks?.()||[])
      .filter(a=>!a.retreating&&attackTargets(a.targetID,id))
      .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
    if(!peer||!actualFriendly(p,me)||info?.allied!==true||
      !duoID(id)||!item?.tiles?.length||friendly(item.opponent,me)||
      !Array.isArray(info.fronts)||!info.fronts.includes(id)||
      !Number.isFinite(info.available)||!Number.isFinite(info.reserve)||
      !Number.isFinite(info.home)||!Number.isFinite(info.incoming)||
      info.incoming>0||s.incoming>0||(!info.ready&&observedOn<=0)||
      !Number.isInteger(info.tick)||Math.abs(info.tick-tick)>40||
      s.ratio<.38||s.activeEnemy||
      recentHostilePressure(tick)||
      (crisisTrend&&tick<crisisTrend.expires))return null;
    const observedHome=number(()=>p.troops?.(),NaN);
    if(!Number.isFinite(observedHome)||observedHome<=0||
      Math.abs(info.home-observedHome)>Math.max(3500,observedHome*.15)||
      info.available>Math.max(0,info.home-info.reserve)+2||
      info.available>observedHome*.8||
      (p.incomingAttacks?.()||[]).some(a=>!a.retreating&&a.troops>0))return null;
    const front=frontRiskPlan(items,s,id);
    if(front.danger||front.pressure||front.safeStrike<1000)return null;
    const own=Math.floor(Math.min(s.available*.72,front.safeStrike));
    const ally=Math.floor(Math.max(
      Math.min(info.available*.72,observedHome*.55),
      Math.min(observedOn*.55,observedHome*.75)));
    const enemyHome=number(()=>item.opponent?.troops?.(),NaN);
    if(!Number.isFinite(enemyHome)||enemyHome<0)return null;
    const enemyDeployed=(item.opponent?.outgoingAttacks?.()||[])
      .filter(a=>!a.retreating).reduce((n,a)=>
        n+Math.max(0,number(()=>a.troops,0)),0);
    const enemy=enemyHome+enemyDeployed;
    const needed=Math.max(2400,enemy*(hardMode()?1.35:1.22));
    if(own<Math.max(1000,enemy*.12)||
      ally<Math.max(1000,enemy*.12)||own+ally<needed)return null;
    if(launch&&(!duoPlan||duoPlan.target!==id||
      !Number.isInteger(duoPlan.strikeTick)||tick<duoPlan.strikeTick||
      tick>(Number.isInteger(duoPlan.expiresTick)?duoPlan.expiresTick:duoPlan.strikeTick+110)||
      (Number.isInteger(info.expiresTick)&&tick>info.expiresTick&&observedOn<=0)||
      // Both full bots agree to the same live plan before launching.
      !duoPlan.planId||info.ackPlanId!==duoPlan.planId||
      info.planId!==duoPlan.planId||
      info.target!==id||
      (info.strikeTick!==duoPlan.strikeTick&&observedOn<=0)))return null;
    return {target:id,own,ally,needed,enemy,front,
      strikeTick:duoPlan?.strikeTick??null};
  }
  function duoTeamDecision(v){
    const ownBudget=Math.max(0,Math.floor(Math.min(v.ownAvailable||0,
      (v.ownHome||0)*.72)));
    const partnerBudget=Math.max(0,Math.floor(Math.min(v.partnerAvailable||0,
      (v.partnerHome||0)*.55)));
    const role=v.invasion?(v.partnerNeeds?'support':'defend'):
      v.sharedJoint&&v.bothReady?'joint-attack':
      v.separatedFronts&&ownBudget>=Math.max(1200,(v.ownHome||0)*.12)?
        'independent-front':v.partnerWarning>0?'hold':'build';
    const reason=v.invasion?'observed-invasion':
      v.sharedJoint&&v.bothReady?'confirmed-common-front-and-budgets':
      v.separatedFronts?'confirmed-separated-fronts':
      v.partnerWarning>0?'partner-early-warning':'no-safe-joint-window';
    return Object.freeze({role,reason,ownBudget,partnerBudget,
      ownReserve:v.ownReserve||0,partnerReserve:v.partnerReserve||0,
      partnerIncoming:v.partnerIncoming||0,
      combinedBudget:ownBudget+partnerBudget,
      permission:'advisory-only-own-engine-check-required'});
  }
  function coordinateDuo(me,s,tick){
    if(duoPlan?.planId&&!duoPlan.partnerAck&&
      Number.isInteger(duoPlan.expiresTick)&&tick>duoPlan.expiresTick&&
      duoLocal.lastExpiredPlan!==duoPlan.planId){
      duoLocal.lastExpiredPlan=duoPlan.planId;duoLocal.ackTimeouts++;
    }
    let duo=rankedDuo(me);
    const connectedPeer=duoTrustedPeer();
    const local=connectedPeer&&actualFriendly(connectedPeer.player,me)?
      connectedPeer:null;
    if(local?.id)diagnosticV2.lastVerifiedPartnerId=local.id;
    if(!duo&&local){
      const enemies=(game.playerViews?.()||[]).filter(p=>p?.isPlayer?.()&&
        p.isAlive?.()&&!friendly(p,me));
      duo={partner:local.player,partnerID:local.id,enemies,team:null};
    }
    if(!duo){
      if(duoPlan)telemetry('duo_plan_abort','Duo-Plan abgebrochen',
        {planId:duoPlan.planId??null,target:duoPlan.target,
          reason:'no-trusted-allied-peer'});
      duoPlan=null;return null;
    }
    // No shared operation against a player protected by EITHER bot's
    // actual alliances; independent enemy scoring still checks friendly().
    duo.enemies=duo.enemies.filter(p=>!friendly(p,me));
    const partner=duo.partner;
    const observedIncoming=(partner.incomingAttacks?.()||[])
      .filter(a=>!a.retreating);
    const incoming=observedIncoming
      .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
    const aggressor=duo.enemies.map(p=>({p,on:observedIncoming
      .filter(a=>String(a.attackerID)===safeID(p)||
        String(a.attackerID)===String(p.smallID?.()))
      .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0)}))
      .sort((a,b)=>b.on-a.on)[0];
    const partnerHome=Math.max(1,number(()=>partner.troops?.(),1));
    const active=duo.enemies.map(p=>({p,on:duoFocus(me,p)?.on||0}))
      .sort((a,b)=>b.on-a.on ||
        String(safeID(a.p)).localeCompare(String(safeID(b.p))))[0];
    const targets=[...duo.enemies].sort((a,b)=>
      number(()=>b.numTilesOwned(),0)-number(()=>a.numTilesOwned(),0) ||
      String(safeID(a)).localeCompare(String(safeID(b))));
    const announced=local?.state?.target&&duo.enemies.find(p=>
      safeID(p)===local.state.target);
    const common=(strategic.groups||[]).filter(x=>x.id!==null&&
      duo.enemies.some(p=>safeID(p)===x.id))
      .map(x=>({item:x,joint:duoJointOpportunity(me,strategic.groups,s,x,tick)}))
      .filter(x=>x.joint)
      .sort((a,b)=>a.joint.enemy-b.joint.enemy||
        b.item.tiles.length-a.item.tiles.length||
        String(a.item.id).localeCompare(String(b.item.id)));
    const danger=s.incoming>Math.max(1200,s.home*.08);
    const partnerWarning=Math.max(duoWarningLevel(
      {home:partnerHome,incoming,strongest:0},tick),
      local?.state?.warning||0);
    const partnerNeeds=incoming>Math.max(1200,partnerHome*.035)||
      local?.state?.earlyCrisis===true||local?.state?.warning===2;
    const invasion=danger||partnerNeeds||
      (crisisTrend&&tick<crisisTrend.expires&&
        (crisisTrend.lostLand>0||crisisTrend.lostAssets>0));
    // The lower PlayerID chooses the scheduled focus. A follower uses
    // that announcement only when paired with a valid strike tick.
    const follower=local&&String(safeID(me))>String(local.id);
    const jointTarget=common.find(x=>x.item.id===safeID(announced))||
      common[0];
    // A verified rendezvous remains the priority across harmless ECONOMY/
    // TECH/RECOVER posture changes. Real invasion, lost alliance, lost
    // common border or expired launch releases it without forcing an attack.
    const retained=duoPlan?.strikeTick!==null&&
      Number.isInteger(duoPlan?.strikeTick)&&
      tick<=duoPlan.strikeTick+110&&!invasion&&local&&
      Number.isInteger(local.state?.tick)&&Math.abs(local.state.tick-tick)<=40&&
      (local.state?.ready===true||
        (local.player?.outgoingAttacks?.()||[]).some(a=>
          !a.retreating&&attackTargets(a.targetID,duoPlan.target)))&&
      actualFriendly(local.player,me)&&local.state?.allied===true&&
      Array.isArray(local.state?.fronts)&&
      local.state.fronts.includes(duoPlan.target)&&
      (strategic.groups||[]).find(x=>x.id===duoPlan.target&&
        x.tiles?.length&&x.opponent?.isAlive?.()&&
        !friendly(x.opponent,me))?.opponent;
    const shared=invasion&&aggressor?.on>0?aggressor.p:
      retained||
      (partnerWarning>0&&aggressor?.on>0?aggressor.p:null)||
      (active?.on>0?active.p:null)||
      jointTarget?.item.opponent||
      (follower&&Number.isInteger(local?.state?.strikeTick)?announced:null)||
      targets[0];
    const bothReady=!!local?.state?.ready&&!danger&&
      s.incoming===0&&s.ratio>=.38&&!s.activeEnemy&&
      !recentHostilePressure(tick)&&
      !(crisisTrend&&tick<crisisTrend.expires)&&
      s.available>=Math.max(1200,s.home*.09);
    const sharedJoint=common.find(x=>x.item.id===safeID(shared))?.joint||null;
    const leader=local&&String(safeID(me))<String(local.id);
    // The lower PlayerID proposes a stable tick; the second adopts it
    // only while both are ready. Neither skips the game's action checks.
    const held=duoPlan?.target===safeID(shared)&&
      Number.isInteger(duoPlan.strikeTick)&&
      tick<=duoPlan.strikeTick+110?duoPlan.strikeTick:null;
    const offered=local?.state?.strikeTick;
    const strikeTick=retained&&held!==null&&!invasion?
      held:
      !local||!bothReady||!sharedJoint||invasion?null:leader?
      (held??tick+45):
      Number.isInteger(offered)&&offered>=tick-15&&offered<=tick+180&&
        local?.state?.target===safeID(shared)?offered:null;
    const ownFronts=(strategic.groups||[]).filter(g=>g.id!==null&&
      g.tiles?.length&&g.opponent?.isAlive?.()&&!friendly(g.opponent,me));
    const partnerFronts=Array.isArray(local?.state?.fronts)?local.state.fronts:[];
    const separatedFronts=!!local&&ownFronts.length>0&&partnerFronts.length>0&&
      !ownFronts.some(g=>partnerFronts.includes(g.id));
    // Advisory team allocator; never counts ally troops as our own budget.
    // Independent-front decisions cannot authorize an unsafe joint strike.
    const teamDecision=duoTeamDecision({invasion,partnerNeeds,bothReady,
      separatedFronts,sharedJoint,partnerWarning,ownAvailable:s.available,
      ownHome:s.home,ownReserve:s.reserve,partnerAvailable:local?.state?.available,
      partnerReserve:local?.state?.reserve,partnerHome,partnerIncoming:incoming});
    const role=danger?'Heimat verteidigen':
      partnerNeeds?'Partner unter Druck unterstützen':
      strikeTick!==null?(tick<strikeTick?'Gemeinsamen Angriff vorbereiten':
        leader?'Gemeinsamen Angriff anführen':'Gemeinsamen Angriff unterstützen'):
      partnerWarning>0?'Partnerfrühwarnung · Reserve schützen':
      active?.on>0?'Partnerfront unterstützen':
      separatedFronts&&s.available>=Math.max(1200,s.home*.12)?
        'Getrennte Front: eigene sichere Offensive oder Landung prüfen':
      separatedFronts?'Getrennte Front: aufbauen und Heimatreserve halten':
      bothReady?'Auf Partner-Zeitpunkt warten':
      s.home>partnerHome*1.25?'Angriff vorbereiten':'Aufbauen / Landung vorbereiten';
    const planId=strikeTick===null||!shared?null:
      String(safeID(shared)).slice(0,96)+':'+String(strikeTick);
    const roleOptions=[
      {type:'hold',legal:true,utility:danger||partnerWarning>0?90:28},
      {type:'invest',legal:!danger,utility:s.ratio<.65?58:24},
      {type:'attack',legal:!!sharedJoint,utility:sharedJoint?75:0},
      {type:'relieve',legal:partnerNeeds,utility:partnerNeeds?95:0},
      {type:'flank',legal:separatedFronts,utility:separatedFronts?64:0},
      {type:'land',legal:separatedFronts&&opts.boats,utility:separatedFronts&&opts.boats?52:0},
      {type:'targeted-aid',legal:partnerNeeds||partnerWarning>0,
        utility:partnerNeeds?88:partnerWarning>0?45:0}
    ].filter(x=>x.legal).sort((a,b)=>b.utility-a.utility);
    const plan={partner:duo.partnerID,target:shared?safeID(shared):null,
      targetName:shared?nameOf(shared):'Kein Gegner',role,
      partnerCommitted:active?.on||0,partnerIncoming:incoming,
      partnerHome,needHelp:partnerNeeds,partnerWarning,
      partnerEarlyCrisis:local?.state?.earlyCrisis===true,
      partnerLand:local?.state?.land??null,
      partnerReady:!!local?.state?.ready,separatedFronts,
      teamDecision,strikeTick,
      partnerAck:!!(planId&&local?.state?.ackPlanId===planId),
      planId,
      expiresTick:strikeTick===null?null:strikeTick+110,
      strikeStatus:strikeTick===null?(separatedFronts?'independent-fronts':'none'):
        !sharedJoint?'locked-awaiting-safe-budget':
        local?.state?.ackPlanId!==planId?'locked-awaiting-peer-ack':
        tick<strikeTick?'locked-preparing':'locked-launch-window',
      joint:sharedJoint?{own:sharedJoint.own,ally:sharedJoint.ally,
        needed:sharedJoint.needed}:null,
      options:roleOptions,ownBudget:sharedJoint?.own??Math.floor(s.available*.5),
      partnerBudget:sharedJoint?.ally??number(()=>local?.state?.ownBudget,0),
      abortOn:['relay-stale','alliance-lost','target-friendly','home-invasion',
        'reserve-breach','plan-expired'],
      ready:bothReady,peerAck:!!(planId&&local?.state?.ackPlanId===planId),
      ownReserve:s.reserve,tick,source:local?
        'lokaler Duo-Relay + bestätigter Spielzustand':
        'sichtbare Spielzustände (kein Relay)'};
    if(!duoPlan||duoPlan.target!==plan.target||duoPlan.role!==role||
      duoPlan.strikeTick!==plan.strikeTick)
      decisionNote('2v2','Gemeinsamer Fokus: '+plan.targetName+' · '+role+
        (strikeTick!==null?' · Tick '+strikeTick:''),
        [local?'Relay-Ziel ist nur Priorität; eigene Sicherheitsprüfung bleibt verbindlich':
          'Partner-Einsatz nur bei beobachteten Angriffen bestätigt'],tick);
    if(duoPlan?.planId&&(duoPlan.planId!==plan.planId||
      (duoPlan.partnerAck&&!plan.partnerAck))){
      telemetry('duo_plan_abort','Bisheriger Duo-Plan nicht mehr bestätigt',{
        planId:duoPlan.planId,target:duoPlan.target,
        previousStrikeTick:duoPlan.strikeTick,
        observedPartnerAck:duoPlan.partnerAck,
        reason:invasion?'own-or-partner-threat':
          !local?'relay-or-alliance-unavailable':
          !sharedJoint?'common-front-not-safe':
          duoPlan.partnerAck&&!plan.partnerAck?'partner-ack-lost':
          'target-or-strike-replanned',
        status:'plan-released-no-execution-claim'});
    }
    if(!duoPlan||duoPlan.planId!==plan.planId||
      duoPlan.strikeStatus!==plan.strikeStatus||
      duoPlan.role!==plan.role||
      duoPlan.needHelp!==plan.needHelp)
      telemetry('duo_plan_state','Duo-Planstatus beobachtet',{
        planId:plan.planId,partnerId:plan.partner,target:plan.target,
        strikeTick:plan.strikeTick,strikeStatus:plan.strikeStatus,
        partnerAck:plan.partnerAck,role:plan.role,
        ownBudget:plan.ownBudget,partnerBudget:plan.partnerBudget,
        ownReserve:plan.ownReserve,partnerIncoming:plan.partnerIncoming,
        needHelp:plan.needHelp,permission:plan.teamDecision.permission});
    duoPlan=plan;return plan;
  }
  function operationOptions(me,items,s,tick,current=operation){
    if(!current)return null;
    const active=(s.out||[]).filter(a=>!a.retreating&&
      attackTargets(a.targetID,current.target));
    const idle=tick-(current.lastProgressTick??current.since);
    const remaining=Math.max(0,current.budget-current.spent);
    const alternatives=(items||[]).filter(x=>x.id!==null&&x.id!==current.target&&
      x.opponent?.isAlive?.()&&!friendly(x.opponent,me)).map(x=>({
        id:x.id,name:nameOf(x.opponent),opportunity:2/Math.max(.5,
          enemyOpportunityRatio(x.opponent,lateGame(me),s.home)),
        safe:!frontRiskPlan(items,s,x.id).danger})).filter(x=>x.safe)
      .sort((a,b)=>b.opportunity-a.opportunity);
    const options=[
      {action:'continue',utility:active.length?70:idle<180?45:10,
        reason:active.length?'laufende Armee beobachtet':'kurzes Fortschrittsfenster'},
      {action:'reinforce',utility:remaining>Math.max(1000,s.home*.04)&&
        s.incoming===0&&idle<260?62:-100,
        reason:'Restbudget und Heimatreserve'},
      {action:'pause',utility:idle>260&&!active.length?68:15,
        reason:'kein beobachteter Fortschritt ohne aktive Armee'},
      {action:'retreat',utility:s.incoming>Math.max(1200,s.home*.10)?95:-100,
        reason:'Heimat unter Angriff'},
      {action:'switch',utility:alternatives[0]&&idle>300&&!active.length?
        72+Math.min(20,alternatives[0].opportunity*10):-100,
        reason:alternatives[0]?'bessere sichere Alternative '+alternatives[0].name:
          'keine sichere Alternative'}
    ].sort((a,b)=>b.utility-a.utility);
    return {tick,preferred:options[0].action,options,
      activeStacks:active.length,idleTicks:idle,remainingBudget:remaining,
      alternative:alternatives[0]||null,
      semantics:'observed-state comparison; no causal battle claim'};
  }
  function planOperation(me,items,s,tick){
    const danger=s.incoming>Math.max(1200,s.home*.10);
    if(operation){
      operation.review=operationOptions(me,items,s,tick,operation);
      const p=game.playerViews?.().find(x=>safeID(x)===operation.target);
      const reason=!p?.isAlive?.()?'Ziel ausgeschieden':
        friendly(p,me)||me.isOnSameTeam?.(p)?'Ziel jetzt verbündet':
        danger?'Heimat unter Angriff':
        operation.spent>=operation.budget &&
          !s.out.some(a=>attackTargets(a.targetID,operation.target))?
            'Truppenbudget ausgeschöpft':
        tick-operation.since>1100?'Operationsfrist erreicht':
        number(()=>p.numTilesOwned?.(),Infinity)<=operation.successLand?
          'Gebietsziel beobachtet':null;
      if(!reason&&p){
        const land=number(()=>p.numTilesOwned?.(),Infinity);
        if(Number.isFinite(land)&&
          land<(operation.lastObservedLand??operation.initialLand)){
          const gained=(operation.lastObservedLand??operation.initialLand)-land;
          operation.lastObservedLand=land;operation.lastProgressTick=tick;
          telemetry('operation_progress','Beobachteter Zielgebietsverlust',
            {target:operation.target,observedTiles:land,
              delta:gained,operationSince:operation.since,
              evidence:'observed-not-causal-proof'});
        }
      }
      // Release a genuinely idle operation after a bounded default timeout.
      // The experiment may replan sooner, but neither mode abandons an
      // observed active war or an endangered home merely to change targets.
      const stallAfter=opts.impossibleExperiment?440:900;
      const stall=!reason&&
        tick-(operation.lastProgressTick??operation.since)>stallAfter&&
        !s.out.some(a=>!a.retreating&&
          attackTargets(a.targetID,operation.target))&&
        !s.activeEnemy&&!pendingAttack&&s.incoming===0;
      if(reason||stall){
        const finishedReason=reason||(stall?'Operation ohne beobachteten Fortschritt':null);
        if(stall||reason==='Truppenbudget ausgeschöpft')
          operationCooldown.set(operation.target,tick+160);
        decisionNote('operation','Operation '+operation.type+' beendet: '+finishedReason,
          ['Nächste sichere Gelegenheit neu prüfen'],tick);
        operation=null;
      }
    }
    if(operation&&duoPlan?.joint&&operation.target!==duoPlan.target&&
      s.incoming===0&&!s.activeEnemy&&!pendingAttack&&
      tick-lastEnemySend>80){
      decisionNote('2v2','Inaktive Operation beendet für gemeinsame Front',[],tick);
      operation=null;
    }
    if(operation||danger||s.available<Math.max(1200,s.home*.09))return operation;
    const eligible=items.filter(x=>x.id!==null&&x.opponent?.isAlive?.()&&
      !friendly(x.opponent,me)&&tick>=(operationCooldown.get(x.id)||0)&&
      (targetOpportunity(me,items,s,x)||
        !!duoJointOpportunity(me,items,s,x,tick,true)));
    const shared=eligible.find(x=>duoPlan?.strikeTick!==null&&
      duoPlan?.target===x.id&&duoJointOpportunity(me,items,s,x,tick,true));
    const locked=eligible.find(x=>x.id===warState.id);
    const ally=eligible.find(x=>duoFocus(me,x.opponent)?.on>0);
    const alert=eligible.find(x=>victoryThreat?.urgent&&
      (victoryThreat.team!==null?x.opponent.team?.()===victoryThreat.team:
        x.id===victoryThreat.id));
    const chosen=locked||alert||shared||ally||
      eligible.sort((a,b)=>number(()=>b.opponent.numTilesOwned(),0)-
        number(()=>a.opponent.numTilesOwned(),0)).slice(0,8).find(x=>{
          const guard=frontRiskPlan(items,s,x.id);
          return Math.min(s.available*.72,guard.safeStrike)>=100;
        });
    if(!chosen)return null;
    const land=number(()=>chosen.opponent.numTilesOwned?.(),0);
    const type=alert?'Sieg verhindern':ally?'Partner entlasten':
      pendingBoat?'Brückenkopf sichern':
      land<=Math.max(250,number(()=>me.numTilesOwned(),0)*.25)?
        'Gegner ausschalten':'Front sichern';
    const guard=frontRiskPlan(items,s,chosen.id);
    const budget=Math.max(0,Math.floor(Math.min(s.available*.72,guard.safeStrike)));
    if(budget<100)return null;
    operation={type,target:chosen.id,targetName:nameOf(chosen.opponent),
      since:tick,until:tick+1100,initialLand:land,
      successLand:type==='Gegner ausschalten'?0:
        Math.max(0,Math.floor(land*.90)),
      budget,spent:0,lastObservedLand:land,lastProgressTick:tick,
      abort:'Verlust des Ziels, Heimatinvasion, Frist oder beobachteter Stillstand'};
    decisionNote('operation',type+' → '+operation.targetName+
      ' · Budget '+budget+' · Ziel ≤ '+operation.successLand+' Felder',
      eligible.filter(x=>x.id!==chosen.id).slice(0,3).map(x=>
        nameOf(x.opponent)+' zurückgestellt: Fokus und Reserveschutz'),tick);
    return operation;
  }

  function checkIncomeAttribution(me,tick){
    for(const sample of incomeAttribution){
      if(sample.finished||tick-sample.tick<120)continue;
      const train=number(()=>me.trainGold?.(),NaN),
        trade=number(()=>me.tradeGold?.(),NaN);
      sample.finished=true;sample.afterTick=tick;
      sample.trainDelta=Number.isFinite(train)&&
        Number.isFinite(sample.beforeTrain)?
        Math.max(0,train-sample.beforeTrain):null;
      sample.tradeDelta=Number.isFinite(trade)&&
        Number.isFinite(sample.beforeTrade)?
        Math.max(0,trade-sample.beforeTrade):null;
      sample.method='interval-income-observation-not-causal';
      telemetry('income_after_build',
        'Bahn-/Schiffseinkommen nach Bau gemessen (keine kausale Zuordnung)',
        {incomeSample:sample});
    }
  }
  function sampleIncome(me,tick){
    const cur={tick,gold:goldAmount(me),
      train:number(()=>me.trainGold?.(),NaN),trade:number(()=>me.tradeGold?.(),NaN)};
    const previous=goldSamples[goldSamples.length-1];
    if(previous&&tick>previous.tick&&tick-previous.tick>=80){
      const rate=(v)=>Number.isFinite(cur[v])&&Number.isFinite(previous[v])?
        Math.max(0,(cur[v]-previous[v])/(tick-previous.tick)*600):null;
      // Gold-stock movement includes purchases, donations and conquest:
      // it is a signed NET change, not gross income (negative != zero).
      const netGold=(cur.gold-previous.gold)/(tick-previous.tick)*600;
      const train=rate('train'),trade=rate('trade');
      incomeStatus={train,trade,gold:netGold,netGold,
        otherNetAfterTradeTrain:
          train!==null&&trade!==null?netGold-train-trade:null,
        // Residual includes spending and other receipts; NEVER assign it
        // to one building or label it as additional earned gold.
        observed:true};
      goldSamples.shift();
    }
    if(!goldSamples.length)goldSamples.push(cur);
    checkIncomeAttribution(me,tick);
  }
  // Look at *where a real player's army is committed*, not only the
  // player's headline troop count. An adversary fighting a third party has a
  // short-lived opening, but this never overrides our other-border reserve.
  function adversaryWindow(me,enemy) {
    if(!enemy || !me || friendly(enemy,me))return {
      elsewhere:0,incomingOthers:0,ratio:0,exposed:false,human:false};
    const home=Math.max(1,number(()=>enemy.troops?.(),0));
    const outgoing=(()=>{try{return enemy.outgoingAttacks?.()||[];}catch(_){return [];}})();
    const incoming=(()=>{try{return enemy.incomingAttacks?.()||[];}catch(_){return [];}})();
    const elsewhere=outgoing.filter(a=>!a.retreating && !attackTargets(a.targetID,me))
      .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
    const incomingOthers=incoming.filter(a=>!a.retreating && !attackTargets(a.attackerID,me))
      .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
    const ratio=elsewhere/home,underPressure=incomingOthers/home;
    return {elsewhere,incomingOthers,ratio,home,
      exposed:ratio>=.45 || underPressure>=.40,
      human:enemy.type?.()==='HUMAN'};
  }
  // Track visible troop/land trajectories. Only sustained third-party wars
  // justify a narrower opportunity window; snapshots never override legality.
  function observeOpponents(me,tick){
    for(const enemy of game.playerViews?.()||[]){
      const id=safeID(enemy);
      if(id===null||id===safeID(me)||!enemy.isAlive?.()||friendly(enemy,me))continue;
      const old=opponentHistory.get(id);
      const troops=Math.max(0,number(()=>enemy.troops(),0));
      const land=Math.max(0,number(()=>enemy.numTilesOwned(),0));
      const window=adversaryWindow(me,enemy);
      const exposed=window.exposed &&
        (window.elsewhere>=Math.max(500,window.home*.45) ||
         window.incomingOthers>=Math.max(500,window.home*.40));
      const since=exposed?(old?.exposedSince??tick):null;
      const resample=!old||tick-old.tick>=90;
      const previous=old&&resample?{tick:old.tick,troops:old.troops,land:old.land}:
        old?.previous||null;
      // Retain only actual, time-stamped observations: no guessed opponent
      // movement, no cross-match names, and a fixed per-opponent memory bound.
      const samples=(old?.samples||[]).filter(x=>tick>=x.tick&&tick-x.tick<=450);
      if(!samples.length||tick-samples[samples.length-1].tick>=80)
        samples.push({tick,troops,land});
      opponentHistory.set(id,{tick:resample?tick:old.tick,
        troops:resample?troops:old.troops,
        land:resample?land:old.land,previous,exposedSince:since,
        observedTick:tick,samples:samples.slice(-7)});
    }
    for(const [id,v] of opponentHistory)
      if(tick-v.observedTick>360)opponentHistory.delete(id);
    if(opponentHistory.size>64)
      for(const [id] of [...opponentHistory].sort((a,b)=>a[1].observedTick-b[1].observedTick)
        .slice(0,opponentHistory.size-64))opponentHistory.delete(id);
  }
  function opponentWindows(enemy,tick=number(()=>game.ticks(),0)){
    const record=opponentHistory.get(safeID(enemy));
    const empty=()=>Object.freeze({90:null,180:null,360:null});
    if(!record||tick<record.observedTick||tick-record.observedTick>120)
      return empty();
    const nowTroops=Math.max(0,number(()=>enemy.troops(),0));
    const nowLand=Math.max(0,number(()=>enemy.numTilesOwned(),0));
    const windows={};
    for(const span of [90,180,360]){
      // At least the requested history, at most one sampling interval older.
      // Missing observations remain null rather than fabricated trends.
      const sample=(record.samples||[]).slice().reverse().find(x=>
        tick-x.tick>=span&&tick-x.tick<=span+90);
      windows[span]=sample?Object.freeze({
        observedTicks:tick-sample.tick,
        troopsChange:(nowTroops-sample.troops)/Math.max(1,sample.troops),
        landChange:(nowLand-sample.land)/Math.max(1,sample.land)
      }):null;
    }
    return Object.freeze(windows);
  }
  function opponentTrend(enemy,tick=number(()=>game.ticks(),0)){
    const v=opponentHistory.get(safeID(enemy)),previous=v?.previous;
    if(!v||tick-v.observedTick>120||!previous||
      v.tick-previous.tick<75||v.tick-previous.tick>360)
      return {valid:false,falling:false,growing:false,sustained:false,change:0,landChange:0};
    const change=(v.troops-previous.troops)/Math.max(1,previous.troops);
    const landChange=(v.land-previous.land)/Math.max(1,previous.land);
    return {valid:true,change,landChange,
      falling:change<-.15||landChange<-.08,
      growing:change>.25&&landChange>=0,
      sustained:v.exposedSince!==null&&tick-v.exposedSince>=90};
  }
  function enemyUnderAttack(enemy){
    const own=number(()=>enemy.troops?.(),0);
    const ourSmall=number(()=>myPlayer()?.smallID?.(),-1);
    // Only a third-party assault is an opportunity. Our own attack against
    // this player cannot justify launching another underpriced offensive.
    const incoming=(enemy.incomingAttacks?.()||[]).filter(a=>
      !a.retreating && a.attackerID!==ourSmall)
      .reduce((n,a)=>n+number(()=>a.troops,0),0);
    return own>0 && incoming>=own*.50;
  }
  // An estimate driven by the official pure attackLogic when exposed
  // through the browser config. Not an exact future-tile path simulation.
  function attackForecast(me,item,troops){
    const enemy=item?.opponent,front=item?.tiles||[];
    if(!enemy||!front.length||troops<1)return null;
    const units=enemy.units?.()||[];
    const posts=units.filter(u=>u.type?.()==='Defense Post'&&!u.isUnderConstruction?.());
    const total=number(()=>game.numLandTiles?.(),0),fallout=number(()=>game.numTilesWithFallout?.(),0);
    let loss=0,time=0,count=0,engine=false;
    for(const tile of front.slice(0,12)){
      try{
        const mag=number(()=>game.terrainType(tile),0);
        const covered=posts.some(u=>{
          const dx=game.x(tile)-game.x(u.tile()),dy=game.y(tile)-game.y(u.tile());
          const radius=number(()=>game.config().defensePostRange?.(),30);
          return dx*dx+dy*dy<=radius*radius;
        });
        const result=game.config().attackLogic?.({
          terrain:mag,attackTroops:troops,
          attacker:{type:me.type?.()||'HUMAN',numTiles:Math.max(1,number(()=>me.numTilesOwned(),1))},
          defender:{type:enemy.type?.()||'NATION',numTiles:Math.max(1,number(()=>enemy.numTilesOwned(),1)),
            troops:number(()=>enemy.troops(),0),isTraitor:!!enemy.isTraitor?.(),
            isDisconnectedTeammate:false},
          defenderHasDefensePost:covered,
          falloutRatio:game.hasFallout?.(tile)&&total>0?fallout/total:null,
          borderSize:Math.max(1,item.front||1)
        });
        const fallback=({0:80,1:100,2:120})[mag]||100;
        const rough=(fallback/5)*(1+number(()=>enemy.troops(),0)/
          Math.max(1,number(()=>enemy.numTilesOwned(),1))*.07)*(covered?1.5:1)*
          Math.min(2,Math.max(.6,number(()=>enemy.troops(),0)/troops));
        const tileLoss=number(()=>result?.attackerTroopLoss,rough);
        loss+=Math.max(0,tileLoss);time+=number(()=>result?.tickFraction,1);
        engine=engine||Number.isFinite(result?.attackerTroopLoss);count++;
      }catch(_){}
    }
    if(!count)return null;
    strategicTelemetry.forecastCount++;
    if(engine)strategicTelemetry.engineForecasts++;
    else{
      strategicTelemetry.proxyForecasts++;
      if(!strategicTelemetry.forecastUnavailable++){
        telemetry('forecast_engine_unavailable',
          'Browser-Config liefert keinen gültigen attackLogic-Verlustwert; Näherung verwendet',
          {exposed:typeof game?.config?.().attackLogic==='function'});
      }
    }
    const sampleTiles=Math.min(80,Math.max(1,number(()=>enemy.numTilesOwned(),1)*.15));
    return {loss:loss/count*sampleTiles,time:time/count*sampleTiles,
      sample:count,engine,method:engine?'config.attackLogic':'rough-proxy'};
  }
  function targetsFromBorder(me,tiles) {
    const groups=new Map(), scratch=[], fallout=[], cap=2000;
    const stride=Math.max(1,Math.ceil(tiles.length/cap));
    const offset=borderOffset%stride;
    const ownID=safeID(me);
    for(let i=offset;i<tiles.length;i+=stride){
      const t=tiles[i];scratch.length=0;
      const count=game.neighbors4(t,scratch);
      for(let j=0;j<count;j++){
        const ref=scratch[j];
        if(!game.isLand(ref)||game.isImpassable(ref))continue;
        const opponent=game.owner(ref),id=safeID(opponent);
        if(id===null && game.hasFallout?.(ref)){
          strategicTelemetry.falloutSkipped++;
          if(!fallout.includes(ref)&&fallout.length<80)fallout.push(ref);
          continue;
        }
        if(id===ownID||(id!==null&&friendly(opponent,me)))continue;
        let g=groups.get(id);
        if(!g){g={id,opponent:id===null?null:opponent,tiles:[],front:0};groups.set(id,g);}
        g.front++;
        // Spread action probes across different local frontiers, not just the
        // first eight cells of a broad border that may all be blocked.
        if(g.tiles.length<20 && !g.tiles.includes(ref))g.tiles.push(ref);
        else if(g.tiles.length===20 && g.front%23===0)g.tiles[(g.front/23|0)%20]=ref;
      }
    }
    // The official AI prefers clean land, then falls back to nuked TN if
    // no clean neutral border remains. Do not make fallout a free land bonus.
    if(!groups.has(null)&&fallout.length){
      groups.set(null,{id:null,opponent:null,tiles:fallout.slice(0,20),
        front:fallout.length,fallout:true});
      strategicTelemetry.falloutFallback++;
    }
    return [...groups.values()];
  }
  // Unlike v1.2, use ALL troop commitments and incoming attacks. Home troops
  // alone are misleading: 5K at home with 20K already attacking is not 5K idle.
  function lateGame(me) {
    if(!opts.lateOffense)return false;
    const tick=number(()=>game?.ticks?.(),0),land=number(()=>me?.numTilesOwned?.(),0);
    return (tick>=1800 && land>=1000) || (tick>=3300 && land>=500);
  }
  // Recruitment slows near troop cap. Spend only a genuinely safe surplus:
  // incoming attacks and significant neighboring armies veto growth spending.
  function growthPressure(s) {
    return s.ratio>.74 && s.incoming===0 && s.activeEnemy===0 &&
      s.strongest<s.home*.70;
  }
  function exposedOpeningRisk(s){return s.incoming>s.home*.025 || s.strongest>s.home*.85;}
  function neutralAttackAmount(s,aggression) {
    const base=Math.max(130,s.home*(hardMode()?(.055+aggression*.035):(.09+aggression*.08)));
    const surplus=growthPressure(s)?Math.max(0,s.home-s.max*.48)*.46:0;
    const opening=number(()=>game?.ticks?.(),Infinity)<1000 && !exposedOpeningRisk(s);
    const fraction=growthPressure(s)?(hardMode()?.49:.55):opening?(hardMode()?.44:.68):(hardMode()?.31:.55);
    const exposed=s.strongest>=s.home*.85||s.incoming>=s.home*.10;
    // Cheap expansion may continue near a strong rival, but never consume
    // a third of the army immediately before a probable counterattack.
    const safeBudget=hardMode()&&exposed?
      Math.min(s.available*.14,s.home*.025):s.available*fraction;
    const amount=Math.min(safeBudget,Math.max(base,surplus));
    return Math.floor(Math.min(safeBudget,amount*
      (1+neuralChannel('neutralCommit',myPlayer(),s)*.35)));
  }
  // An alliance, team change or elimination invalidates a remembered threat
  // immediately, including when a border scan is temporarily missing.
  function pruneFrontMemory(me){
    if(typeof game?.playerViews!=='function')return;
    const players=new Map((game.playerViews()||[]).map(p=>[safeID(p),p]));
    for(const id of frontMemory.keys()){
      const p=players.get(id);
      if(!p?.isAlive?.()||friendly(p,me)||me.isOnSameTeam?.(p))
        frontMemory.delete(id);
    }
  }
  // A vanished front is remembered briefly, never treated as a current
  // 240-tick enemy peak. Current observed armies retain full priority.
  function rememberedFrontStrength(id,tick,observed=0){
    const old=frontMemory.get(id);
    if(!old)return observed;
    const age=Math.max(0,tick-old.lastTick);
    const tail=age>=90?0:old.peak*.72*(1-age/90);
    return Math.max(observed,tail);
  }
  // Retain short-lived border pressure across transient missing border scans.
  function observeFronts(me,items,tick){
    // Human multiplayer pressure must not disappear merely because native
    // Nation difficulty is Medium/Hard. Impossible keeps its existing logic.
    pruneFrontMemory(me);
    if(!hardMode()&&!multiplayerMatch(game)){frontMemory.clear();return;}
    for(const item of items){
      if(item.id===null||!item.opponent?.isAlive?.()||friendly(item.opponent,me)||
        me.isOnSameTeam?.(item.opponent)){
        if(item.id!==null)frontMemory.delete(item.id);
        continue;
      }
      const troops=Math.max(0,number(()=>item.opponent.troops(),0));
      const old=frontMemory.get(item.id);
      frontMemory.set(item.id,{troops,lastTick:tick,
        peak:old&&tick-old.lastTick<=180?Math.max(troops,old.peak*.94):troops,
        land:number(()=>item.opponent.numTilesOwned(),0)});
    }
    for(const [id,value] of frontMemory)
      if(tick-value.lastTick>360)frontMemory.delete(id);
    if(frontMemory.size>40){
      const ordered=[...frontMemory].sort((a,b)=>a[1].lastTick-b[1].lastTick);
      for(const [id] of ordered.slice(0,frontMemory.size-40))frontMemory.delete(id);
    }
  }
  // Predict immediate pressure from observable fronts and recent own losses.
  // This is a conservative safety envelope, NOT a claim about hidden armies.
  function frontPressureForecast(me,items=[],tick=number(()=>game?.ticks?.(),0)) {
    const home=Math.max(1,number(()=>me?.troops?.(),1));
    const fronts=items.filter(g=>g.id!==null&&g.opponent?.isAlive?.()&&
      !friendly(g.opponent,me)).map(g=>{
      const now=Math.max(0,number(()=>g.opponent.troops(),0));
      const prior=frontMemory.get(g.id);
      const recent=rememberedFrontStrength(g.id,tick,now);
      return {id:g.id,troops:recent};
    }).sort((a,b)=>b.troops-a.troops);
    const primary=fronts[0]?.troops||0,secondary=fronts[1]?.troops||0;
    const trend=armyTrend(tick),lost=trend&&trend.ticks>=80?
      Math.max(0,-trend.tiles):0;
    const incoming=(me?.incomingAttacks?.()||[]).filter(a=>!a.retreating)
      .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
    const combined=primary+Math.min(secondary*.35,home*.4);
    const risk=Math.max(incoming/home,combined/home*(lost>100?1.15:1));
    return {primary,secondary,combined,incoming,lost,risk,
      pressured:incoming>home*.10 || (lost>100&&combined>home*.65)};
  }
  function military(me,items=[]) {
    const home=number(()=>me.troops());
    // Singleplayer's native infinite-troops option reports an artificial
    // 1-billion troop cap. Using it for the recovery ratio would make the
    // bot wait forever even while it can safely expand.
    const infiniteTroops=game.config().infiniteTroops?.()===true;
    const rawMax=Math.max(1,number(()=>game.config().maxTroops(me),home||1));
    const max=infiniteTroops?Math.max(1,home*1.35):rawMax;
    const out=(me.outgoingAttacks?.()||[]).filter(a=>!a.retreating&&a.troops>0);
    const inc=(me.incomingAttacks?.()||[]).filter(a=>!a.retreating&&a.troops>0);
    const committed=out.reduce((sum,a)=>sum+a.troops,0);
    const incoming=inc.reduce((sum,a)=>sum+a.troops,0);
    pruneFrontMemory(me);
    const hostile=items.filter(t=>t.id!==null && t.opponent?.isAlive?.() &&
      !friendly(t.opponent,me) && !me.isOnSameTeam?.(t.opponent));
    const tick=number(()=>game?.ticks?.(),0);
    const historical=[...frontMemory].reduce((v,[id,x])=>
      Math.max(v,rememberedFrontStrength(id,tick)),0);
    const strongest=Math.max(historical,
      hostile.reduce((v,t)=>Math.max(v,number(()=>t.opponent.troops())),0));
    const ratio=home/max;
    const adaptiveOffset=opts.autoStrategy?(strategic.mode==='RECOVER'||strategic.mode==='DEFEND'?8:
      strategic.mode==='EXPAND'&&!incoming&&!strongest?-5:0):0;
    const late=lateGame(me);
    const lateReduction=late && opts.lateOffense && !incoming && strongest<home*.65 ? (hardMode()?16:12) : 0;
    const growthRelease=ratio>.82&&!incoming&&strongest<home*.70&&!out.length?7:0;
    const baseline=home*clamp(setting('reserve')+adaptiveOffset-lateReduction-growthRelease,12,75)/100;
    // Hold meaningful troops while a larger neighbor or incoming offensive exists.
    // On Impossible, preserve a force against the largest OTHER neighbor even
    // while crushing our chosen target. Avoid permanent paralysis from maxTroops.
    const policyReserve=neuralChannel('reserve',me,{home,max,committed,incoming,strongest,ratio,
      available:Math.max(0,home-baseline)},tick);
    const policyBaseline=home*clamp(baseline/home*100+policyReserve*8,12,75)/100;
    // Publish each independently computed floor. High reserve with zero
    // incoming is often explained by a far larger bordering army.
    const activePressure=incoming>0||recentHostilePressure(tick,140)||
      !!(crisisTrend&&tick<crisisTrend.expires);
    const borderFloor=strongest>0?
      Math.min(home*(activePressure?.85:.63),strongest*(hardMode()?.59:.53)):0;
    const incomingFloor=incoming>0?Math.min(home*.94,incoming*1.3):0;
    const capFloor=strongest>0?
      Math.min(home*(activePressure?.78:.58),max*(hardMode()?.12:.14)):0;
    const defensiveFloor=Math.max(policyBaseline,borderFloor,incomingFloor,capFloor);
    const context=matchContext(me);
    const predicted=(hardMode()||context.multiplayer)?
      frontPressureForecast(me,items,tick):null;
    // Existing experimental Impossible coefficients remain opt-in. Public/
    // Private receive a narrower safety floor only when visible pressure or
    // own land loss exists; simple peaceful adjacency cannot trigger it.
    const forecastEnabled=(hardMode()&&opts.impossibleExperiment)||context.multiplayer;
    const forecastFloor=forecastEnabled&&predicted&&predicted.pressured?
      Math.min(home*(context.multiplayer?.88:.91),
        predicted.combined*(context.multiplayer?.52:.60)+incoming*.30):0;
    // Profiles only RAISE a border reserve, never relax the safety floor.
    const observedRaider=hostile.some(x=>{
      const p=opponentProfiles.get(x.id);
      return p?.profile==='Früher Angreifer'&&p.confidence>=.45;
    });
    const profileFloor=observedRaider?Math.min(home*.86,policyBaseline+home*.06):0;
    const crisisFloor=crisisTrend&&tick<crisisTrend.expires&&
      (incoming>0||strongest>home*.50)?Math.min(home*.90,home*.12+policyBaseline):0;
    const reserve=Math.min(home,Math.ceil(Math.max(defensiveFloor,forecastFloor,profileFloor,crisisFloor)));
    const available=Math.max(0,Math.floor(home-reserve));
    const total=home+committed;
    const activeEnemy=out.filter(a=>a.targetID!==0 && a.targetID!==null).length;
    const activeNeutral=out.filter(a=>a.targetID===0||a.targetID===null).length;
    const reserveFloors={ruleBaseline:baseline,neuralAdjustment:policyBaseline-baseline,
      policyBaseline,borderFloor,incomingFloor,capFloor,forecastFloor,
      profileFloor,crisisFloor,winningFloor:reserve};
    const reserveReason=Object.entries({policyBaseline,borderFloor,incomingFloor,capFloor,
      forecastFloor,profileFloor,crisisFloor})
      .filter(([,value])=>value>=reserve-.501).map(([name])=>name).join('+')||'baseline';
    return {home,max,committed,incoming,strongest,ratio,reserve,available,total,
      reserveFloors,reserveReason,reserveShare:home>0?reserve/home:0,
      growthPotential:Math.max(0,(10+Math.pow(home,.73)/4)*(1-ratio)),
      out,inc,activeEnemy,activeNeutral};
  }
  // Incoming stacks often disappear briefly between waves. Remember material
  // pressure so the bot cannot declare the coast clear and launch a large
  // offensive a few seconds after surviving an attack.
  function rememberHostilePressure(s,tick){
    const trend=armyTrend(tick);
    const unexpectedLoss=(hardMode()||multiplayerMatch(game)) &&
      s.strongest>s.home*.70 && trend && trend.ticks>=100 &&
      trend.tiles< -Math.max(140,s.home*.001);
    if(s.incoming>=Math.max(1200,Math.max(1,s.home)*.08)||unexpectedLoss){
      if(unexpectedLoss && tick-lastFrontWarning>150){
        lastFrontWarning=tick;
        telemetry('front_loss_warning','Gebietsverlust neben starkem Nachbarn: Wiederaufbau schützen',
          {lostTiles:trend.tiles,strongest:s.strongest,home:s.home});
      }
      lastHostilePressure=tick;
    }
    return tick-lastHostilePressure<220;
  }
  function recentHostilePressure(tick,window=220){
    return tick-lastHostilePressure<window;
  }
  // Correlation is evidence of a likely bot command, never proof of authorship.
  // In particular, an adopted outgoing attack can also originate elsewhere.
  function observeAttackOrigins(me,tick){
    const active=(me.outgoingAttacks?.()||[]).filter(a=>!a.retreating&&a.troops>0);
    const liveIds=new Set(active.map(a=>a.id));
    for(const id of observedAttacks.keys())if(!liveIds.has(id))observedAttacks.delete(id);
    const fresh=active.filter(a=>a.id!=null&&!observedAttacks.has(a.id));
    const matches=a=>attackCommands.filter(c=>c.matchedStack===null&&
      tick>=c.tick&&tick-c.tick<=120&&c.target===attackTargetID(a.targetID)&&
      !c.beforeIds.includes(a.id)&&c.amount>0&&a.troops<=c.amount*1.1);
    const candidates=new Map(fresh.map(a=>[a.id,matches(a)]));
    for(const a of fresh){
      const target=attackTargetID(a.targetID),possible=candidates.get(a.id);
      const command=possible.length===1&&fresh.filter(other=>
        candidates.get(other.id).includes(possible[0])).length===1?possible[0]:null;
      if(command)command.matchedStack=a.id;
      const observation={attackId:a.id,target,amount:a.troops,observedTick:tick,
        source:command?'correlated-bot-command':'unattributed',
        commandId:command?.commandId??null,
        evidence:command?'target-time-amount-correlation':'no-unique-command-match'};
      observedAttacks.set(a.id,observation);
      telemetry('attack_origin',command?'Angriff mit Bot-Befehl korreliert':'Angriffsherkunft ungeklärt',observation);
    }
  }
  function sampleTroops(tick,me) {
    if(troopSamples.length && tick<=troopSamples[troopSamples.length-1].tick)return;
    troopSamples.push({tick,home:number(()=>me.troops()),tiles:number(()=>me.numTilesOwned()),
      incoming:(me.incomingAttacks?.()||[]).filter(a=>!a.retreating&&a.troops>0)
        .reduce((sum,a)=>sum+a.troops,0),
      assets:ownStructures(me).filter(u=>['City','Factory','Port','Missile Silo'].includes(u.type?.()))
        .map(u=>u.id?.()??u.type()+':'+u.tile?.())});
    while(troopSamples.length>2&&tick-troopSamples[0].tick>900)troopSamples.shift();
    earlyCrisis(me,tick);
  }
  // Compare against a RECENT prior observation, not an all-time peak:
  // ancient expansion cannot permanently force defensive mode.
  function earlyCrisis(me,tick){
    const latest=troopSamples[troopSamples.length-1];
    const prior=[...troopSamples].reverse().find(v=>
      tick-v.tick>=100&&tick-v.tick<=360);
    if(!latest||!prior){
      if(crisisTrend&&tick>=crisisTrend.expires)crisisTrend=null;
      return crisisTrend;
    }
    const lostLand=Math.max(0,prior.tiles-latest.tiles);
    const lostAssets=prior.assets.filter(id=>!latest.assets.includes(id)).length;
    const material=lostLand>=Math.max(180,prior.tiles*.045)||lostAssets>=2||
      (lostAssets>=1&&lostLand>=Math.max(70,prior.tiles*.02));
    if(material){
      crisisTrend={tick,referenceTick:prior.tick,lostLand,lostAssets,
        land:latest.tiles,home:latest.home,
        incoming:latest.incoming,expires:tick+180};
      if(tick-lastCrisisReport>=120){
        lastCrisisReport=tick;
        telemetry('crisis_early_warning',
          'Früher Verlusttrend vor Zusammenbruch der Heimat',
          {crisis:crisisTrend,evidence:'observed-land-and-owned-structure-change'});
        decisionNote('fruehwarnung',
          'Landverlust '+lostLand+', Gebäude verloren '+lostAssets,
          ['Reserve und Verteidigung neu prüfen','Keine neue riskante Seeoffensive'],tick);
      }
    }else if(crisisTrend&&tick>=crisisTrend.expires)crisisTrend=null;
    return crisisTrend;
  }
  function armyTrend(tick) {
    const latest=troopSamples[troopSamples.length-1], earliest=troopSamples[0];
    if(!latest||!earliest||latest.tick-earliest.tick<80)return null;
    return {home:latest.home-earliest.home,tiles:latest.tiles-earliest.tiles,
      ticks:latest.tick-earliest.tick};
  }
  function evaluateLastBattle(tick,me) {
    if(!lastBattle || tick-lastBattle.tick<110)return;
    const record=lastBattle;
    // Only estimate stack attrition from an observed matching outgoing attack.
    // Never turn a disappeared stack into an asserted troop-loss number.
    const stacks=(me.outgoingAttacks?.()||[]).filter(a=>
      attackTargets(a.targetID,record.id)&&!a.retreating);
    if(stacks.length){
      const total=stacks.reduce((n,a)=>n+number(()=>a.troops,0),0);
      record.minimumObservedStack=Math.min(record.minimumObservedStack??Infinity,total);
    }
    const opponent=game.playerViews().find(p=>safeID(p)===record.id);
    if(!opponent || !opponent.isAlive?.()){lastBattle=null;return;}
    const active=(me.outgoingAttacks?.()||[]).some(a=>attackTargets(a.targetID,record.id)&&!a.retreating);
    // Don't attribute other battles, recruitment or construction to this war.
    // Evaluate only after the offensive ends or after a long front stalemate.
    if(active && tick-record.tick<620)return;
    const enemyLand=number(()=>opponent.numTilesOwned());
    const ownLand=number(()=>me.numTilesOwned());
    const captured=enemyLand<record.enemyLand && ownLand>record.ownLand;
    const stalled=!captured && enemyLand>=record.enemyLand*.99 &&
      ownLand<=record.ownLand && tick-record.tick>=260;
    if(captured){
      attackReceipts.territoryGained++;
      telemetry('war_progress','Gebietsgewinn gegen '+record.name,{enemyLandBefore:record.enemyLand,
        enemyLandAfter:enemyLand,ownLandBefore:record.ownLand,ownLandAfter:ownLand});
    } else if(stalled){
      blockedTargets.set(record.id,tick+(hardMode()?330:180));
      if(warState.id===record.id){warState.blockedUntil=tick+330;
        log('FRONT PAUSE: '+record.name+' · kein messbarer Gebietsgewinn');}
      telemetry('war_stall','Offensive ohne messbaren Gebietsgewinn',
        {enemyLandBefore:record.enemyLand,enemyLandAfter:enemyLand,
        ownLandBefore:record.ownLand,ownLandAfter:ownLand});
    } else telemetry('war_review','Ausgang nicht eindeutig: '+record.name,
      {enemyLandBefore:record.enemyLand,enemyLandAfter:enemyLand});
    if(record.forecast){
      const approxLoss=Number.isFinite(record.minimumObservedStack)?
        Math.max(0,record.amount-record.minimumObservedStack):null;
      const audit={tick,target:record.id,engine:record.forecast.engine,
        predictedLoss:record.forecast.loss,observedStackAttrition:approxLoss,
        evidence:approxLoss===null?'no-active-stack-sample':
          'outgoing-stack-net-change-not-causal',landGained:captured,
        observedTicks:tick-record.tick};
      forecastAudits.push(audit);if(forecastAudits.length>75)forecastAudits.shift();
      lastForecastAudit=audit;strategicTelemetry.forecastComparisons++;
      telemetry('forecast_audit','Angriffsprognose gegenüber sichtbarer Stack-Abnahme',
        {audit});
    }
    telemetry('attack_outcome_observed','Angriffsfenster nachträglich verglichen',{
      actionId:record.actionId??null,target:record.id,
      sentTick:record.tick,observedTick:tick,
      ownLandBefore:record.ownLand,ownLandAfter:ownLand,
      defenderLandBefore:record.enemyLand,defenderLandAfter:enemyLand,
      observedOutcome:captured?'territory-changed':
        stalled?'no-progress-observed':'unknown',
      attribution:'front-observation-not-causal-attack-result'});
    lastBattle=null;
  }
  function confirmAttack(me,tick){
    if(!pendingAttack)return;
    const p=pendingAttack;
    const out=(me.outgoingAttacks?.()||[]).filter(a=>!a.retreating && attackTargets(a.targetID,p.id));
    const newStack=out.some(a=>!p.beforeIds.includes(a.id)) ||
      out.reduce((sum,a)=>sum+a.troops,0)>p.beforeTroops+p.amount*.18;
    // A gain against neutral land must not falsely confirm an unrelated
    // player attack; require target-specific territory change for war.
    const landChanged=p.id===null ? number(()=>me.numTilesOwned())>p.ownLand :
      (number(()=>me.numTilesOwned())>p.ownLand &&
        game.playerViews().some(e=>safeID(e)===p.id &&
          number(()=>e.numTilesOwned())<p.enemyLand));
    if(newStack||landChanged){
      attackReceipts.confirmed++;
      telemetry('attack_confirmed','Angriff im Spielzustand erkannt: '+p.name,
        {actionId:p.actionId??null,target:p.id,troops:p.amount,
          ownLandBefore:p.ownLand,
          ownLandAtObservation:number(()=>me.numTilesOwned(),null),
          defenderLandBefore:p.enemyLand,
          defenderLandAtObservation:p.id===null?null:
            number(()=>game.playerViews().find(v=>safeID(v)===p.id)?.numTilesOwned?.(),null),
          observedStacks:out.map(a=>({id:a.id,troops:a.troops,
            targetID:a.targetID})),
          via:newStack?'active_stack':'territory',
          arrivalTick:null,arrivalEvidence:'not-exposed-in-attack-view',
          evidence:'observed-change-not-causal-proof'});
      if(p.id!==null){
        lastBattle={actionId:p.actionId??null,id:p.id,name:p.name,tick:p.tick,
          enemyLand:p.enemyLand,ownLand:p.ownLand,
          forecast:p.forecast||null,amount:p.amount,minimumObservedStack:null};
        if(coordinatedWar()&&warState.id===null){
          warState={id:p.id,name:p.name,since:tick,blockedUntil:-Infinity,
            origin:'confirmed-land-attack'};
          log('HAUPTKRIEGSZIEL BESTÄTIGT → '+p.name);
        }
      }
      pendingAttack=null;return;
    }
    // Terra-nullius expansion may complete between browser ticks; do not
    // declare a failed command without allowing the map to update.
    if(tick-p.tick<85)return;
    attackReceipts.unconfirmed++;
    telemetry('attack_unconfirmed','Kein Angriff/kein Gebiet nach Intent: '+p.name,
      {actionId:p.actionId??null,target:p.id,troops:p.amount,
        evidence:'unobserved-within-window'});
    log('ANGRIFF NICHT BESTÄTIGT: '+p.name+' · Ziel neu prüfen');
    blockedTargets.set(p.id,tick+90);
    if(warState.id===p.id && !out.length){
      warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};plan=null;
    }
    pendingAttack=null;
  }
  // State selection uses hysteresis: don't alternate between expansion and
  // economy every 400 ms merely because the troop ratio moved by 1%.
  function effectivePlan() {
    if(!opts.autoStrategy)return opts.plan;
    return strategic.mode==='ASSAULT'?'Blitz':strategic.mode==='ECONOMY'||strategic.mode==='RECOVER'?'Ökonomie':'Adaptiv';
  }
  function effectiveBuildStyle() {
    if(!opts.autoStrategy)return opts.buildStyle;
    return strategic.buildStyle;
  }
  // War director. A target lock stops the previous bot opening five fronts
  // in the first two minutes. All own outgoing attacks and incoming threats
  // are examined before committing to a new enemy.
  function manageWar(me,items,s,tick) {
    if(!coordinatedWar())return;
    if(pendingAttack && pendingAttack.id!==null)return;
    const foes=items.filter(x=>x.id!==null && x.opponent?.isAlive?.());
    const active=s.out.filter(a=>a.targetID!==null&&a.targetID!==0 && !a.retreating);
    if(warState.id!==null) {
      const original=game.playerViews().find(p=>safeID(p)===warState.id);
      if(!original?.isAlive?.() || friendly(original,me)) {
        log('KRIEGSZIEL ERLEDIGT: '+warState.name);
        warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};plan=null;
      } else if(tick<warState.blockedUntil) {
        // An inactive stalled war should not hold the entire nation hostage
        // while a different independently safe opportunity is available.
        const alternatives=foes.filter(x=>x.id!==warState.id&&
          targetOpportunity(me,items,s,x));
        // In Public/Private an observed, independently safe alternative
        // releases a stalled target even without the Impossible experiment.
        // Never open two fronts while a stack is still fighting or HOME is hit.
        if((opts.impossibleExperiment||!hardMode()) &&
          !active.some(a=>attackTargets(a.targetID,warState.id))&&
          tick-lastEnemySend>(hardMode()?110:260)&&alternatives.length&&
          s.incoming===0&&!recentHostilePressure(tick)){
          blockedTargets.set(warState.id,Math.max(warState.blockedUntil,tick+160));
          telemetry('war_replan','Festgefahrene Front freigegeben',
            {oldTarget:warState.id,warLockOrigin:warState.origin??'unknown',
              heldTicks:tick-warState.since,
              alternatives:alternatives.map(x=>x.id)});
          warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};plan=null;
        } else strategic.reason='Front nach Verlusten stabilisieren';
      } else if(!active.some(a=>attackTargets(a.targetID,warState.id)) &&
        ((tick-warState.since>550 && !foes.some(x=>x.id===warState.id)) ||
         (tick-warState.since>850 && tick-lastEnemySend>280 && s.incoming===0))) {
        // A once-successful war lock must not paralyze the bot forever after
        // its target becomes unreachable or too costly; allow a new front review.
        log('KRIEGSZIEL NEU BEWERTEN: '+warState.name);
        blockedTargets.set(warState.id,tick+200);lastWarReview=tick;
        warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};plan=null;
      }
    }
    // A mutually reachable joint front may replace an idle solo lock.
    // Do not replan while own stacks are out or an invasion is active.
    const shared=duoPlan?.joint&&items.find(x=>x.id===duoPlan.target);
    if(shared&&warState.id!==null&&warState.id!==shared.id&&
      !active.length&&!pendingAttack&&s.incoming===0&&
      !recentHostilePressure(tick)&&tick-lastEnemySend>80&&
      duoJointOpportunity(me,items,s,shared,tick)){
      decisionNote('2v2','Inaktive Solofront freigegeben für Duo-Ziel '+
        nameOf(shared.opponent),[],tick);
      warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};
      plan=null;
      if(operation?.target!==shared.id)operation=null;
    }
    // Two independent ranked clients can converge on a teammate's observed
    // live attack. Release an idle stale solo target lock, not an own active
    // attack or the worker/reserve checks used to authorize a new one.
    const duo=rankedDuo(me);
    if(duo&&warState.id!==null&&!active.length&&
      !(pendingAttack&&pendingAttack.id!==null)){
      const focus=duo.enemies.map(p=>({p,...duoFocus(me,p)}))
        .filter(x=>x.on>0).sort((a,b)=>b.on-a.on)[0];
      if(focus&&safeID(focus.p)!==warState.id&&
        tick-lastEnemySend>80){
        telemetry('duo_war_replan','Rangliste 2v2: inaktive Solofront zugunsten beobachteter Partnerfront freigegeben',
          {old:warState.id,partner:duo.partnerID,
            target:safeID(focus.p),partnerTroops:focus.on});
        warState={id:null,name:'—',since:tick,blockedUntil:-Infinity};
        plan=null;
      }
    }
    if(warState.id===null && active.length) {
      const a=active.sort((a,b)=>b.troops-a.troops)[0],p=attackTargetPlayer(a.targetID);
      if(p){warState={id:safeID(p),name:nameOf(p),since:tick,blockedUntil:-Infinity,
          origin:'observed-active-land-stack'};
        log('KRIEGSZIEL ÜBERNOMMEN: '+warState.name);}
    }
  }
  // Local target intelligence estimates reachable infrastructure and exposed
  // Defense Posts; the actual legality and combat outcome stay engine-owned.
  function targetEconomics(item,tick=number(()=>game.ticks(),0)) {
    const key=String(item.id),cached=targetIntelCache.get(key);
    if(cached && tick-cached.tick<24)return cached.value;
    const enemy=item.opponent,front=item.tiles||[];
    let units=[];
    try{units=enemy?.units?.()||[];}catch(_){}
    let prize=0,posts=0;
    for(const u of units.slice(0,100)){
      try{
        if(u.isActive?.()===false || !front.length)continue;
        const tile=u.tile?.();if(!Number.isInteger(tile))continue;
        const x=game.x(tile),y=game.y(tile);
        const near=front.some(t=>{const dx=x-game.x(t),dy=y-game.y(t);return dx*dx+dy*dy<=100*100;});
        if(!near)continue;
        const type=u.type?.(),level=Math.max(1,number(()=>u.level?.(),1));
        if(type==='City')prize+=5*level;
        else if(type==='Factory')prize+=6*level;
        else if(type==='Port')prize+=3*level;
        else if(type==='Defense Post' &&
          front.some(t=>{const dx=x-game.x(t),dy=y-game.y(t);return dx*dx+dy*dy<=35*35;}))posts++;
      }catch(_){}
    }
    const density=number(()=>enemy?.troops?.(),0)/Math.max(100,number(()=>enemy?.numTilesOwned?.(),0));
    const value={prize,posts,density};
    if(targetIntelCache.size>100)targetIntelCache.clear();
    targetIntelCache.set(key,{tick,value});
    return value;
  }
  // Compare the specific attack target with the OTHER neighboring threats.
  // A larger unrelated neighbor alone must not freeze every weak-front attack;
  // however the home force after the strike still must cover that neighbor.
  // AFK players can reconnect. Adjust only the opportunity ratio; the home
  // floor, other-front reserve and worker legality checks stay mandatory.
  function enemyOpportunityRatio(enemy,late,home,blitz=false){
    const normal=hardMode()?(late?1.34:1.75):
      (late?1.18:blitz?1.30:1.55);
    const learned=1-neuralChannel('warThreshold',myPlayer())*.12;
    if(enemyUnderAttack(enemy))return (hardMode()?(late?1.12:1.24):1.12)*learned;
    const trend=opponentTrend(enemy);
    if(trend.valid&&trend.sustained&&trend.falling)
      return Math.max(hardMode()?1.23:1.13,normal*.83)*learned;
    // Opportunity in a human FFA: their army is fighting someone else.
    // Never make this a blanket buff for an uncommitted player.
    const opening=adversaryWindow(myPlayer(),enemy);
    if(opening.exposed && opening.ratio>=.45 && opening.human)
      return Math.max(hardMode()?1.23:1.17,normal*.90)*learned;
    if(enemy?.isDisconnected?.()===true &&
      number(()=>enemy.troops(),Infinity)<home*1.2)
      return Math.max(1.15,normal*.86)*learned;
    return normal*learned;
  }
  function targetHomeRatio(enemy,late){
    const normal=hardMode()?(late?1.45:1.85):(late?1.24:1.45);
    const t=opponentTrend(enemy),window=adversaryWindow(myPlayer(),enemy);
    // Only the SPECIFIC target's verified decline can lower the home
    // threshold. Other-front reserve, incoming-defense and worker checks stay.
    return t.valid&&t.sustained&&t.falling&&window.exposed?
      hardMode()?(late?1.26:1.46):(late?1.16:1.32):normal;
  }
  // Ally-target marking is a preference, not an attack authorization.
  function allyAssistTarget(me,enemy){
    if(!enemy || friendly(enemy,me))return false;
    const allies=[...(me.allies?.()||[])];
    for(const teammate of game.playerViews?.()||[]){
      if(teammate!==me && me.isOnSameTeam?.(teammate) &&
        !allies.includes(teammate))allies.push(teammate);
    }
    return allies.some(ally=>ally?.isAlive?.() && friendly(ally,me) &&
      (ally.targets?.()||[]).some(target=>safeID(target)===safeID(enemy)));
  }
  // Attack budget against OTHER fronts, independent of the chosen victim.
  // These checks cannot be bypassed by target scores or AI suggestions.
  function frontRiskPlan(items,s,targetID=null) {
    const me=myPlayer();
    pruneFrontMemory(me);
    const other=items.filter(x=>x.id!==null&&x.id!==targetID&&
      x.opponent?.isAlive?.()&&!friendly(x.opponent,me)&&
      !me.isOnSameTeam?.(x.opponent)).reduce((v,x)=>Math.max(v,
      number(()=>x.opponent.troops(),0)),0);
    const tick=number(()=>game?.ticks?.(),0);
    const remembered=[...frontMemory].reduce((v,[id,x])=>
      id!==targetID&&tick-x.lastTick<=240?
        Math.max(v,x.peak*.72):v,0);
    const otherThreat=Math.max(other,remembered);
    const secondary=items.filter(x=>x.id!==null&&x.id!==targetID&&
      x.opponent?.isAlive?.()&&!friendly(x.opponent,me)&&
      !me.isOnSameTeam?.(x.opponent)).map(x=>number(()=>x.opponent.troops(),0))
      .sort((a,b)=>b-a)[1]||0;
    const combined=otherThreat+Math.min(secondary*.35,s.home*.4);
    const danger=otherThreat>s.home*1.15 ||
      (opts.impossibleExperiment&&hardMode()&&combined>s.home*1.27&&
       (s.incoming>s.home*.04 || (armyTrend(tick)?.tiles||0)< -100));
    const pressure=s.incoming>Math.max(1200,s.home*.08);
    const floor=Math.max(s.reserve,s.incoming*1.3,
      otherThreat>0?Math.min(s.home,otherThreat*(hardMode()?.63:.55)):0,
      opts.impossibleExperiment&&hardMode()&&secondary>0&&
      (s.incoming>s.home*.04 || (armyTrend(tick)?.tiles||0)< -100)?
        Math.min(s.home*.90,combined*.58):0);
    return {other:otherThreat,danger,pressure,floor,
      safeStrike:Math.max(0,Math.floor(s.home-floor)),
      emergency:danger||pressure};
  }
  // Major offensives must be defensible AFTER the army leaves home. The
  // target's remaining force and other observed fronts stay in the budget;
  // this never overrides attack legality, diplomacy or the existing reserve.
  function offensiveCommitment(items,s,item,requested){
    if(item.id===null||requested<Math.max(125000,s.home*.30))
      return {amount:requested,capped:false,reason:'small-attack'};
    const front=frontRiskPlan(items,s,item.id);
    const enemy=Math.max(0,number(()=>item.opponent?.troops?.(),0));
    const floor=Math.max(s.reserve,s.incoming*1.7,
      front.other*(hardMode()?.87:.80),
      Math.min(enemy*.35,s.home*.32));
    const amount=Math.floor(Math.min(requested,Math.max(0,s.home-floor)));
    const joint=duoJointOpportunity(myPlayer(),items,s,item,
      number(()=>game?.ticks?.(),0),true);
    const minimum=joint?Math.max(1000,joint.own*.75,
      joint.needed-joint.ally):Math.max(enemy*.45,
      enemy*(hardMode()?1.16:1.04)-duoBattleCredit(myPlayer(),item.opponent));
    return {amount:amount>=minimum?amount:0,capped:amount<requested,
      floor,other:front.other,minimum,reason:amount<minimum?
        'Verbleibende Truppen reichen nach Risikobegrenzung nicht für den Angriff':
        'Heimschutz nach Großangriff'};
  }
  function targetOpportunityCheck(me,items,s,item) {
    if(!item?.opponent?.isAlive?.()||friendly(item.opponent,me))
      return {ok:false,reason:'dead-or-friendly'};
    const late=lateGame(me);
    let rawTroops;
    try{rawTroops=item.opponent.troops?.();}catch(_){return {ok:false,reason:'unknown-troops'};}
    if(rawTroops===null||rawTroops===undefined)return {ok:false,reason:'unknown-troops'};
    const homeTroops=Number(rawTroops);
    if(!Number.isFinite(homeTroops)||homeTroops<0)return {ok:false,reason:'unknown-troops'};
    // An empty home army is attackable, but deployed enemy forces may return.
    const deployed=(item.opponent.outgoingAttacks?.()||[])
      .filter(a=>!a.retreating).reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
    const troops=homeTroops+deployed;
    if(s.incoming>s.home*(late?.15:.04))return {ok:false,reason:'incoming-attack'};
    if(s.ratio<(late?.29:.40))return {ok:false,reason:'low-home-ratio'};
    const minRatio=enemyOpportunityRatio(item.opponent,late,s.home);
    const credit=duoBattleCredit(me,item.opponent);
    const joint=duoJointOpportunity(me,items,s,item,
      number(()=>game?.ticks?.(),0),true);
    if(!joint&&s.available+credit<troops*minRatio)return {ok:false,reason:'insufficient-available',
      required:Math.ceil(troops*minRatio),available:s.available,credit};
    if(!joint&&s.home+credit<troops*targetHomeRatio(item.opponent,late))
      return {ok:false,reason:'home-versus-target',required:Math.ceil(troops*targetHomeRatio(item.opponent,late)),home:s.home};
    const front=frontRiskPlan(items,s,item.id);
    if(front.danger||front.pressure)return {ok:false,reason:'other-front-pressure',other:front.other};
    const strike=joint?joint.own:Math.min(s.available*(hardMode()?.76:.80),
      Math.max(troops*(hardMode()?1.57:1.40),s.available*.48));
    if(strike>front.safeStrike)return {ok:false,reason:'post-attack-home-guard',
      strike:Math.floor(strike),safeStrike:front.safeStrike};
    if(!joint&&strike+credit<troops*(hardMode()?1.18:1.08))
      return {ok:false,reason:'strike-below-target-force',strike:Math.floor(strike),credit};
    return {ok:true,reason:'candidate-safe',strike:Math.floor(strike)};
  }
  // Replay cR8SRtEEcR: a successful player repeatedly reinforced the SAME
  // active land front. Permit at most one guarded follow-up, never a new war,
  // and only with an independently sufficient home army and clear flank.
  function sameFrontFollowUp(me,items,s,item,tick){
    if(!item?.opponent?.isAlive?.()||friendly(item.opponent,me)||
      !isWar()||warState.id!==item.id||s.activeEnemy!==1||
      s.activeNeutral>0||s.incoming>0||recentHostilePressure(tick,180)||
      s.ratio<.70||s.committed>s.home*.35||
      tick-lastEnemySend<80)return false;
    const ownStacks=s.out.filter(a=>!a.retreating&&
      a.targetID!==null&&attackTargets(a.targetID,item.id));
    if(ownStacks.length!==1)return false;
    const enemyHome=number(()=>item.opponent.troops(),Infinity);
    if(!Number.isFinite(enemyHome)||enemyHome<0)return false;
    const flank=frontRiskPlan(items,s,item.id);
    if(flank.danger||flank.pressure)return false;
    const possible=Math.min(flank.safeStrike,s.available*.76,
      Math.max(0,s.home-s.reserve));
    return possible>=Math.max(1500,enemyHome*1.35);
  }
  function targetOpportunity(me,items,s,item){
    return targetOpportunityCheck(me,items,s,item).ok;
  }
  function warReadiness(me,items,s,tick,target=null) {
    if(!hardMode())return {ready:true,reason:'Normal'};
    const units=ownStructures(me),cities=units.filter(x=>x.type?.()==='City').length,
      factories=units.filter(x=>x.type?.()==='Factory').length,
      tiles=number(()=>me.numTilesOwned()),gold=goldAmount(me);
    const neutral=items.some(x=>x.id===null),late=lateGame(me);
    if(s.incoming>s.home*.085)return {ready:false,reason:'Eingehender Angriff'};
    if(s.activeEnemy && !isWar())return {ready:false,reason:'Laufende andere Offensive'};
    if(!late && neutral && !isWar() && (cities<2 || factories<2) && tick<2500 &&
      !game.config().infiniteGold?.()) {
      // Only defer war while basic construction is ACTUALLY advancing.
      // Expensive next-tier buildings, blocked land and insufficient gold
      // previously trapped the bot in this branch for thousands of ticks.
      const recentlyBuilt=tick-successfulEconomyTick<440;
      const underway=!!economicPending && tick-economicPending.tick<ECON_PENDING_TTL;
      const canInvest=gold>=180000 && failedEconomyProbes<5;
      if((underway || recentlyBuilt || canInvest) && tick<1750)
        return {ready:false,reason:'Grundaufbau läuft: Städte/Fabriken'};
      if(warWaitSince===-Infinity)warWaitSince=tick;
      if(tick-warWaitSince<200 && gold>=180000)
        return {ready:false,reason:'Bauplatzprüfung vor Kriegsfreigabe'};
    } else warWaitSince=-Infinity;
    const safeJoint=target&&duoJointOpportunity(me,items,s,target,tick,true);
    if(s.ratio<(late?.32:.47)&&!safeJoint)
      return {ready:false,reason:'Truppen auffüllen'};
    if(s.committed>Math.max(s.home*.70,s.max*.20))return {ready:false,reason:'Truppen bereits an Front gebunden'};
    if(s.home<Math.max(5500,s.strongest*(late?1.25:1.48))&&s.strongest>0){
      const candidates=target?[target]:items.filter(x=>x.id!==null);
      if(!safeJoint&&!candidates.some(x=>targetOpportunity(me,items,s,x)))
        return {ready:false,reason:'Keine sichere Hinterland-Reserve'};
    }
    return {ready:true,reason:'Kriegsfreigabe'};
  }
  function strategy(me,items,s) {
    const tick=number(()=>game.ticks());
    const coolingDown=recentHostilePressure(tick);
    const trend=armyTrend(tick), neutral=items.some(x=>x.id===null);
    const enemies=items.filter(x=>x.id!==null&&x.opponent?.isAlive?.());
    const gold=goldAmount(me),tiles=number(()=>me.numTilesOwned());
    const factoryCount=number(()=>me.units().filter(u=>u.isActive?.()&&u.type?.()==='Factory').length);
    const cityCount=number(()=>me.units().filter(u=>u.isActive?.()&&u.type?.()==='City').length);
    const danger=s.incoming>0 || s.strongest>s.home*.95 ||
      !!(crisisTrend&&tick<crisisTrend.expires&&s.strongest>s.home*.55);
    const rich=gold>900000 || game.config().infiniteGold?.()===true;
    const losing=!!(trend&&trend.home<-Math.max(2000,s.home*.21)&&trend.tiles<=0);
    const late=lateGame(me);
    const rebuilding=(s.ratio<(late?.17:.25) && (s.strongest>s.home*.52 || s.incoming>s.home*.12)) ||
      (losing&&(!late||s.incoming>s.home*.10)) || (s.incoming>s.home*.40);
    const readiness=warReadiness(me,items,s,tick);
    const jointReady=enemies.filter(x=>
      !!duoJointOpportunity(me,items,s,x,tick,true));
    const weak=enemies.filter(x=>
      jointReady.some(y=>y.id===x.id)||
      (hardMode()?targetOpportunity(me,items,s,x):
        s.available>number(()=>x.opponent.troops(),Infinity)*(late?1.17:1.5)));
    const fullLate=late&&s.ratio>.78&&!s.incoming&&enemies.length>0;
    const nuclearReady=opts.nukes && game.config().isUnitDisabled?.('Missile Silo')!==true &&
      game.config().isUnitDisabled?.('Atom Bomb')!==true;
    const hasSilo=ownStructures(me).some(u=>u.type?.()==='Missile Silo');

    const seriousAttack=s.incoming>s.home*(late?.15:.05)||
      !!(crisisTrend&&tick<crisisTrend.expires&&s.incoming>s.home*.08);
    let wanted,reason;
    if(rebuilding){wanted='RECOVER';reason='Truppenverlust oder geringe Reserve';}
    else if(coolingDown){wanted='RECOVER';reason='Nach Großangriff Heimatarmee stabilisieren';}
    else if(danger&&seriousAttack){wanted='DEFEND';reason='Erhebliche eingehende Angriffe';}
    else if(danger&&s.strongest>s.home*1.08 && !weak.length &&
      !(fullLate&&nuclearReady)){
      wanted='DEFEND';reason='Überlegener Nachbar: keine neue Kriegsfront';
    }
    else if(jointReady.length&&!seriousAttack&&!coolingDown&&
      !s.incoming&&readiness.ready){
      wanted='ASSAULT';
      reason='Bestätigte gemeinsame Duo-Front, getrennte Reserven gesichert';
    }
    else if(late && weak.length && s.ratio>.30 && !seriousAttack && readiness.ready){
      wanted='ASSAULT';reason='Late Game: günstige Offensivchance';
    }
    else if(fullLate && nuclearReady && (!hasSilo || s.strongest>s.available*.95)){
      wanted='TECH';reason='Late Game: Silo/Raketen finanzieren, statt defensiv festzufahren';
    }
    else if(neutral&&(tiles<900||s.ratio<.60||enemies.length===0)){
      wanted='EXPAND';reason='Unbesetzte Gebiete und Platz für Wachstum';
    }
    else if((factoryCount===0||cityCount===0)&&!rich){wanted='ECONOMY';reason='Wirtschaftlicher Engpass';}
    else if(weak.length && (s.ratio>.55||
      weak.some(x=>duoJointOpportunity(me,items,s,x,tick,true)))&&
      !s.activeEnemy&&!seriousAttack&&readiness.ready){
      wanted='ASSAULT';reason='Erreichbarer Gegner mit Kräftevorteil';
    }
    else if(danger){wanted='DEFEND';reason='Starker Nachbar an der Grenze';}
    else if(neutral){wanted='EXPAND';reason='Landnahme vor riskanter Offensive';}
    else {wanted='ECONOMY';reason='Aufbauen und auf sichere Angriffsgelegenheit warten';}
    if(!opts.autoStrategy){
      if(rebuilding)wanted='RECOVER';
      else if(seriousAttack)wanted='DEFEND';
      else if(opts.plan==='Ökonomie')wanted='ECONOMY';
      else if(opts.plan==='Blitz'&&weak.length)wanted='ASSAULT';
      reason='Manuelle Strategie: '+opts.plan;
    }
    if(wanted!==strategic.mode){
      const emergency=wanted==='RECOVER'||(wanted==='DEFEND'&&s.incoming>0)||
        (wanted==='ASSAULT'&&jointReady.length>0&&
          duoPlan?.strikeStatus==='locked-launch-window'&&
          s.incoming===0&&!coolingDown);
      if(emergency||tick-strategic.since>=65){
        strategic.mode=wanted;strategic.since=tick;strategic.reason=reason;
        log('STRATEGIE → '+wanted+' · '+reason);
      }
    } else strategic.reason=reason;
    strategic.buildStyle=(!opts.autoStrategy)?opts.buildStyle:
      ['RECOVER','ECONOMY','TECH'].includes(strategic.mode)?'Wirtschaft':
      strategic.mode==='DEFEND'?'Defensiv':'Ausgewogen';
    strategic.groups=items;
    lastRecoveryReason=rebuilding?'Truppen/Front stabilisieren':s.incoming?'Eingehende Angriffe abfangen':!readiness.ready?readiness.reason:'';
    return {wanted:strategic.mode,underAttack:s.incoming>0,neutral,foes:enemies.length,rebuilding,
      reason:strategic.reason,defensive:strategic.mode==='DEFEND'||strategic.mode==='RECOVER',readiness};
  }
  function rankedTargets(items,me,tick,s,context) {
    const available=s.available,aggression=clamp(setting('aggressive'),40,100)/100;
    const late=lateGame(me),bigLead=late&&s.strongest<s.home*.55;
    const ownTiles=number(()=>me.numTilesOwned());
    if(available<100)return [];
    return items.flatMap(item=>{
      const enemy=item.opponent,key=item.id===null?'neutral':String(item.id);
      if(enemy && !enemy.isAlive?.())return [];
      if(enemy&&operation?.target===item.id&&operation.spent>=operation.budget)return [];
      if(enemy && coordinatedWar() && (
        (pendingAttack?.id!==null && pendingAttack?.id!==undefined && pendingAttack.id!==item.id) ||
        (isWar() && item.id!==warState.id) || tick<warState.blockedUntil ||
        !context.readiness?.ready || !targetOpportunity(me,items,s,item)))return [];
      if(tick-(cooldowns.get(key)??-Infinity)<(item.id===null?22:80))return [];
      if(tick-(rejected.get(key)??-Infinity)<25 || tick<(blockedTargets.get(item.id)||0))return [];
      const isNeutral=item.id===null;
      // The game sends attacks from home troops; existing outgoing stacks
      // remain in motion. Don't spend the whole army on parallel attacks.
      if(isNeutral && (s.activeNeutral >= (s.ratio>.63 && !context.underAttack ? 2 : 1) || tick-lastNeutralSend<23))return [];
      if(!isNeutral && ((s.activeEnemy>=1&&
        !sameFrontFollowUp(me,items,s,item,tick)) ||
        tick-lastEnemySend<(hardMode()?(late?65:120):(late?35:68)) ||
        context.rebuilding))return [];
      // If pressured, never begin a fresh offensive -- defense is handled separately.
      if(!isNeutral && s.incoming>s.home*(late?.15:.04))return [];
      if(isNeutral && context.underAttack && s.incoming>s.home*.45)return [];
      const enemyTroops=enemy?number(()=>enemy.troops(),Infinity):0;
      // One target cannot be evaluated as isolated when other large enemies
      // still border our home. This was the main multi-front failure in 1.4.
      const front=enemy?frontRiskPlan(items,s,item.id):null;
      const enemyTiles=enemy?number(()=>enemy.numTilesOwned(),0):0;
      const joint=!isNeutral?duoJointOpportunity(me,items,s,item,tick,true):null;
      if(!isNeutral) {
        const minimumRatio=enemyOpportunityRatio(enemy,late,s.home,effectivePlan()==='Blitz');
        const partnerCredit=duoBattleCredit(me,enemy);
        if(s.ratio<(late?.29:.40) ||
          (!joint&&(available+partnerCredit<enemyTroops*minimumRatio||
            s.home+partnerCredit<enemyTroops*targetHomeRatio(enemy,late)))||
          front.danger||front.pressure||
          (joint?joint.own:
            Math.min(available*(hardMode()?.76:.80),
              Math.max(enemyTroops*(hardMode()?1.57:1.40),available*.48))
          )>front.safeStrike||
          enemyTroops<=0 && enemyTiles<=0)return [];
      }
      let score=isNeutral?75:52;
      score+=Math.min(20,Math.log2(item.front+1)*4.5);
      if(isNeutral) {
        if(item.fallout && (s.incoming>0 || s.strongest>s.home*.65 ||
          s.ratio<.60 || available<s.home*.30))return [];
        score+=Math.max(0,45-s.ratio*40)+(ownTiles<600?26:0);
        score+=neuralChannel('landPriority',me,s,tick)*28;
        if(item.fallout)score-=36;
        if(context.wanted==='EXPAND')score+=18;
        if(growthPressure(s))score+=Math.min(22,(s.ratio-.70)*90);
        if(late&&context.foes)score-=38;
      } else {
        score+=Math.max(-65,55-50*enemyTroops/Math.max(available,1));
        score+=neuralChannel('enemyCommit',me,s,tick)*28;
        score+=Math.min(16,enemyTiles/450);
        const local=targetEconomics(item,tick);
        score+=Math.min(29,local.prize*2.7)-
          Math.min(45,local.posts*12+Math.max(0,local.density-32)*.20);
        if(enemyTiles<300 && enemyTroops<available*.55)score+=14;
        const opening=adversaryWindow(me,enemy);
        // Capitalize on opponents fighting a *different* player, never on
        // allied attacks or their outgoing stacks aimed at us.
        if(opening.exposed && opening.human)score+=Math.min(33,
          Math.round(opening.ratio*23+opening.incomingOthers/opening.home*16));
        if(enemyUnderAttack(enemy) && (!isWar()||warState.id===item.id))score+=23;
        const trend=opponentTrend(enemy,tick);
        if(trend.valid){
          if(trend.sustained&&trend.falling)score+=18;
          if(trend.growing&&!opening.exposed)score-=Math.min(22,trend.change*25);
        }
        // Early human wars are expensive while clean free land remains.
        // A genuinely exposed player is the exception, not the default.
        if(enemy.type?.()==='HUMAN' && context.neutral && ownTiles<1100 &&
          !opening.exposed && !isWar())score-=35;
        if(enemy.isDisconnected?.()===true)score+=18;
        if(allyAssistTarget(me,enemy))score+=22;
        const focus=duoFocus(me,enemy);
        if(focus){
          if(focus.on>0)score+=Math.min(42,24+focus.on/
            Math.max(1,number(()=>enemy.troops(),1))*13);
          else if(focus.elsewhere>0)score-=12;
        }
        if(winStatus.urgent)score+=18;
        const profile=opponentProfiles.get(item.id);
        if(profile?.confidence>=.45&&profile.profile==='Gelegenheitsangreifer'&&
          opening.exposed)score+=12;
        if(operation?.target===item.id)score+=28;
        if(duoPlan?.target===item.id)score+=
          joint?72:duoPlan.partnerCommitted>0?25:10;
        if(victoryThreat?.urgent && (victoryThreat.team!==null?
          enemy.team?.()===victoryThreat.team:item.id===victoryThreat.id))score+=38;
        if(me.hasTransitiveTarget?.(enemy.smallID?.()))score+=12;
        if(plan?.id===item.id && tick<plan.until)score+=23;
        if(effectivePlan()==='Blitz')score+=12;
        if(late)score+=33;
      }
      const amount=isNeutral ?
        Math.floor(neutralAttackAmount(s,aggression)*(item.fallout?.48:1)) :
        joint?joint.own:
        Math.min(front.safeStrike,available*(hardMode()?.76:.80),
          Math.max(enemyTroops*(hardMode()?1.57:(1.25+aggression*.20)),available*.48)) *
          (1+neuralChannel('enemyCommit',me,s,tick)*.22);
      const forecast=!isNeutral?attackForecast(me,item,Math.floor(amount)):null;
      if(forecast){
        score-=Math.min(60,forecast.loss/Math.max(1,amount)*78);
        if(forecast.loss>amount*.78)score-=40;
      }
      if(isNeutral && winStatus.urgent)score+=24;
      const baseScore=score,neuralDelta=neuralActionDelta('attack',score,me,s,{
        magnitude:clamp(enemyTroops/Math.max(1,s.home)/3,0,1),
        opportunity:clamp(item.front/120,0,1),
        cost:clamp(amount/Math.max(1,s.home),0,1),
        risk:isNeutral?(item.fallout?1:0):
          clamp(enemyTroops/Math.max(1,s.home)/3,0,1)
      });
      return [{...item,key,score:score+neuralDelta,baseScore,neuralDelta,forecast,
        amount:Math.min(available,Math.floor(amount))}];
    }).sort((a,b)=>b.score-a.score);
  }
  // Explain why a visible front is absent from the ranked list. This is
  // observational: it cannot authorize any attack or relax safety gates.
  function reportAttackBlocks(me,items,s,context,ranked,tick){
    if(tick-lastAttackBlockReport<90)return attackBlockReport;
    lastAttackBlockReport=tick;
    const admitted=new Set(ranked.map(x=>x.id));
    const readiness=context.readiness||{ready:true,reason:'unknown'};
    const rows=items.filter(x=>x.id!==null).slice(0,16).map(x=>{
      let reason='unknown';
      if(!x.opponent?.isAlive?.()||friendly(x.opponent,me))reason='dead-or-friendly';
      else if(admitted.has(x.id))reason='admitted';
      else if(pendingAttack?.id!=null&&pendingAttack.id!==x.id)reason='pending-other-target';
      else if(isWar()&&warState.id!==x.id)reason='war-lock';
      else if(tick<warState.blockedUntil)reason='war-cooldown';
      else if(!readiness.ready)reason='war-readiness: '+readiness.reason;
      else if((blockedTargets.get(x.id)||0)>tick)reason='blocked-target-cooldown';
      else if(tick-(cooldowns.get(String(x.id))??-Infinity)<80)reason='attack-cooldown';
      else if(s.activeEnemy>=1)reason='outgoing-attack-active';
      else reason=targetOpportunityCheck(me,items,s,x).reason;
      return {target:x.id,name:nameOf(x.opponent),reason,
        home:Math.round(s.home),available:Math.round(s.available),
        enemyHome:number(()=>x.opponent?.troops?.(),null)};
    });
    const counts={};for(const row of rows)counts[row.reason]=(counts[row.reason]||0)+1;
    attackBlockReport={tick,ranked:ranked.length,
      lastEnemyAttackTick:Number.isFinite(lastEnemySend)?lastEnemySend:null,
      lastNeutralAttackTick:Number.isFinite(lastNeutralSend)?lastNeutralSend:null,
      lastAttackAgeTicks:tick-Math.max(lastEnemySend,lastNeutralSend),home:s.home,
      available:s.available,reserve:s.reserve,incoming:s.incoming,
      reserveShare:s.reserveShare??null,
      reserveReason:s.reserveReason??null,
      reserveFloors:s.reserveFloors??null,
      committed:s.committed,readiness:readiness.reason,counts,targets:rows.slice(0,8)};
    if(rows.length&&tick-Math.max(lastEnemySend,lastNeutralSend)>=240&&
      tick-lastOffenseDroughtReport>=180){
      lastOffenseDroughtReport=tick;
      telemetry('offense_drought','Keine neuen Angriffs-Intents trotz sichtbarer Front',{
        ...attackBlockReport,rankedTargets:ranked.slice(0,5).map(x=>({
          id:x.id,amount:x.amount,score:x.score,
          forecast:x.forecast??null})),
        blockers:counts,activeOutgoing:s.activeEnemy,
        pendingAttack:pendingAttack?.id??null,
        warLock:warState.id??null,warLockOrigin:warState.origin??null,
        warLockAgeTicks:warState.id===null?null:tick-warState.since,
        provisionalMarine:pendingBoat?.seen?{actionId:pendingBoat.actionId??null,
          target:pendingBoat.playerID??null,
          observationLostTick:pendingBoat.observationLostTick??null}:null,
        warWaitSince,
        safety:'observation-only-no-attack-permission',
        interpretation:'ranked-target-does-not-imply-safe-legal-send'});
    }
    if(!ranked.some(x=>x.id!==null)&&rows.length){
      telemetry('attack_block_report','Kein Landkriegsziel freigegeben',
        {attackBlockReport});
      decisionNote('ziel_verworfen','Landkrieg: '+Object.entries(counts)
        .sort((a,b)=>b[1]-a[1]).slice(0,2)
        .map(([k,v])=>k+' ('+v+')').join(', '),
        rows.slice(0,3).map(x=>x.name+': '+x.reason),tick);
    }
    return attackBlockReport;
  }
  // Shared investment posture; never bypasses worker building legality.
