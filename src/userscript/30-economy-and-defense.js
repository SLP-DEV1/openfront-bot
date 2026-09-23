  function economyPosture(me,s,tick=number(()=>game.ticks(),0)){
    const units=ownStructures(me);
    if(!units.some(u=>u.type?.()==='City')||
       !units.some(u=>u.type?.()==='Factory'))return 'bootstrap';
    if(s.incoming>Math.max(1200,s.home*.10)||recentHostilePressure(tick))
      return 'defensive';
    const noNeutral=strategic.groups.every(g=>g.id!==null||g.fallout);
    if(opts.boats&&noNeutral&&tick-lastNeutralSend>=200&&
      tick-lastEnemySend>=200&&!isWar()&&!s.activeEnemy&&
      s.strongest<s.home*.85)return 'breakout';
    if(s.ratio>=.78&&!s.incoming&&s.strongest<s.home*.70)return 'recruit';
    return 'balanced';
  }
  // Shared strategic director: decide which existing LEGAL planner gets first
  // refusal. Never issues intents and never weakens any planner's safety gate.
  function strategicDirector(me,s,context,ranked,tick,planning=planningState) {
    const land=ranked.filter(x=>x.id===null);
    const enemy=ranked.filter(x=>x.id!==null);
    const threatened=s.incoming>0 || recentHostilePressure(tick,260) ||
      s.strongest>=s.home*.85;
    const recovering=context.wanted==='RECOVER'||context.wanted==='DEFEND';
    const canSail=opts.boats&&!!ctors.boat&&!pendingBoat&&!pendingAttack&&
      s.available>=1300&&s.activeEnemy===0&&!threatened&&
      tick>=navalBackoffUntil&&tick-lastBoat>=100;
    // A naval target is useful only when reachable territory may exist.
    // naval() performs the authoritative shoreline, worker and reserve checks.
    const rivals=game.playerViews?.()||[];
    const targetAtSea=rivals.some(p=>safeID(p)!==safeID(me)&&p.isAlive?.()&&
      !friendly(p,me)&&Number.isInteger(p.state?.spawnTile)&&
      (!coordinatedWar()||!isWar()||safeID(p)===warState.id));
    const noLandGrowth=!land.length;
    const stalledFront=!enemy.length && noLandGrowth &&
      tick-lastEnemySend>180 && s.ratio>=.52;
    const navalFirst=canSail && (stalledFront || (!land.length&&!enemy.length)) &&
      (targetAtSea || s.activeNeutral===0);
    const ruleOrder=navalFirst?['naval','land','hold']:
      enemy.length||land.length?['land','naval','hold']:
      ['naval','hold'];
    const learned=neuralStrategicSignals(me,s,tick);
    const planned=channel=>planning?.candidates?.filter(x=>x.channel===channel)
      .reduce((best,x)=>Math.max(best,x.utility),-1000)??-1000;
    const utility={
      land:(land.length||enemy.length?110:0)+((land.length||enemy.length)?learned?.landPriority||0:0)*65+
        clamp(planned('land'),-100,160)*.22,
      naval:(canSail?(navalFirst?120:80):-1000)+
        (canSail?(learned?.navalPriority||0)*65:0)+clamp(planned('naval'),-100,160)*.22,
      hold:(land.length||enemy.length||canSail?-25:35)+(learned?.holdPriority||0)*60+
        clamp(planned('hold'),-100,160)*.22
    };
    // Recover/defend is an absolute gate; priority values never grant legality.
    const hasLearnedPreference=learned&&
      ['landPriority','navalPriority','holdPriority'].some(k=>Math.abs(learned[k])>1e-8);
    // Zero weights / no model MUST reproduce v1.16.0 exactly. In particular,
    // naval() can refresh a stale preliminary canSail snapshot.
    const order=recovering?['hold']:
      !hasLearnedPreference?ruleOrder:
      [...new Set([...ruleOrder,'land','naval','hold'])].sort((a,b)=>
        utility[b]-utility[a]);
    const reason=recovering?'Heimtruppen und Grenzen stabilisieren':
      planning?.selected?.reason?'Planung: '+planning.selected.reason:
      navalFirst?'Keine sichere Landexpansion: Marineweg vor Landkrieg prüfen':
      enemy.length?'Sicheren Landkrieg vor Küstenoperation prüfen':
      land.length?'Freies Land vor teurer Küstenoperation':
      'Keine freigegebene Landaktion; Seeweg prüfen';
    return {order,reason,landCandidates:land.length,enemyCandidates:enemy.length,
      navalCandidate:canSail,threatened,economy:economyPosture(me,s,tick),
      planning:{selected:planning?.selected?.id||null,
        rejected:planning?.rejected?.id||null,durationMs:planning?.durationMs??null},
      neural:learned?{utility,weights:learned}:null};
  }
  async function legalTarget(me,item,serial) {
    // Four-at-a-time worker checks remove the old serialized waterfall.
    // A short negative cache prevents probing the same blocked frontier 50x/s.
    const now=number(()=>game.ticks(),0), probes=item.tiles.slice(0,Math.min(24,clamp(setting('maxTargets'),4,25)));
    if(legalNegative.size>500)for(const [k,expiry] of legalNegative)if(expiry<=now)legalNegative.delete(k);
    for(let offset=0;offset<probes.length;offset+=4){
      if(!live(serial))return null;
      const batch=probes.slice(offset,offset+4).filter(tile=>
        (legalNegative.get(String(item.id)+':'+tile)||0)<=now);
      if(!batch.length)continue;
      const results=await Promise.all(batch.map(async tile=>{
        runtime.attackProbes++;
        try{return {tile,allowed:!!(await me.actions(tile,null))?.canAttack};}
        catch(_){return {tile,allowed:false};}
      }));
      if(!live(serial))return null;
      for(const v of results){
        if(v.allowed && safeID(game.owner(v.tile))===item.id)return v.tile;
        legalNegative.set(String(item.id)+':'+v.tile,now+35);
      }
    }
    return null;
  }
  // OpenFront counters incoming attacks against the same opponent 1:1;
  // leaving troops at home usually preserves the Defense Post bonus.
  // Retreating a player attack costs 25% and returns after ~20 game ticks.
  function defenseAssessment(me,s,tick) {
    const hostile=s.inc.filter(a=>{
      try {const p=game.playerBySmallID?.(a.attackerID);
        return !p || !friendly(p,me);}catch(_){return true;}
    });
    const incoming=hostile.reduce((sum,a)=>sum+a.troops,0);
    const home=Math.max(1,s.home),ratio=incoming/home;
    const samples=troopSamples.filter(x=>tick-x.tick<=110);
    const prev=samples[0],land=number(()=>me.numTilesOwned(),0);
    const landLoss=prev&&prev.tiles>0?Math.max(0,(prev.tiles-land)/prev.tiles):0;
    const neuralWarning=neuralChannel('defensePriority',me,s,tick)>.7;
    return {incoming,ratio,landLoss,hostile,
      severe:ratio>=.43||(ratio>=.23&&landLoss>=.035)||
        (neuralWarning&&ratio>=.33),
      critical:ratio>=.80||(ratio>=.40&&landLoss>=.075)};
  }
  function refreshRetreats(me,tick) {
    // Use the UNFILTERED game snapshot: military().out excludes retreating
    // stacks, so disappearance there cannot prove that the retreat succeeded.
    const raw=(()=>{try{return me.outgoingAttacks?.()||[];}catch(_){return [];}})();
    const active=new Map(raw.map(a=>[a.id,a]));
    for(const [id,request] of retreatRequests){
      const a=active.get(id);
      if(a?.retreating){
        retreatRequests.delete(id);defenseStats.retreatsObserved++;
        telemetry('defense_retreat_confirmed','Rückzugsflag im Spielzustand gesehen',
          {attackID:id,target:request.target,troops:a.troops});
      } else if(!a){
        retreatRequests.delete(id);defenseStats.unknown++;
        telemetry('defense_retreat_unknown','Angriffsverband verschwunden: Rückzug oder Verlust unbekannt',
          {attackID:id,target:request.target,expected:request.recoverable});
      } else if(tick-request.tick>=65){
        retreatRequests.delete(id);defenseStats.unconfirmed++;
        telemetry('defense_retreat_unconfirmed','Rückzugsflag fehlt nach Timeout',
          {attackID:id,target:request.target});
      }
    }
  }
  function emergencyRetreat(me,tick,s) {
    refreshRetreats(me,tick);
    const threat=defenseAssessment(me,s,tick);
    if(!threat.incoming){defenseStatus='Keine eingehenden Angriffe';return false;}
    defenseStatus='Eingehend '+Math.floor(threat.incoming/10)+' · Heim '+
      Math.floor(s.home/10)+' · '+Math.round(threat.ratio*100)+'%';
    if(!opts.defense||!threat.severe)return false;
    if(!ctors.cancel){
      defenseStatus+=' · Rückzug-Event nicht gefunden';
      if(tick-lastDefenseLog>=100){lastDefenseLog=tick;
        telemetry('defense_unavailable',defenseStatus,{incoming:threat.incoming,committed:s.committed});}
      return false;
    }
    const candidates=s.out.filter(a=>typeof a.id==='string'&&a.troops>0&&
      !a.retreating&&!retreatRequests.has(a.id));
    if(!candidates.length){defenseStatus+=' · Keine rückrufbaren Angriffe';return false;}
    if(tick-lastEmergencyRetreat<6||retreatRequests.size>=5)return false;
    candidates.sort((a,b)=>{
      const rank=x=>x.targetID===null||x.targetID===0?0:
        (isWar()&&attackTargets(x.targetID,warState.id)?2:1);
      return rank(a)-rank(b)||b.troops-a.troops;
    });
    let issued=0;
    for(const a of candidates){
      const recoverable=a.troops*(a.targetID===null||a.targetID===0?1:.75);
      if(recoverable<Math.max(250,s.home*.025))continue;
      if(!send('cancel',[a.id],'NOT-RÜCKZUG → '+String(a.targetID??'neutral')+
          ' ('+Math.floor(recoverable/10)+' Tr. voraussichtlich zurück)',true))continue;
      retreatRequests.set(a.id,{id:a.id,target:a.targetID,tick,troops:a.troops,recoverable});
      defenseStats.retreatsOrdered++;issued++;
      telemetry('defense_retreat_ordered','Angriff wegen akuter Bedrohung zurückgerufen',
        {attackID:a.id,target:a.targetID,troops:a.troops,recoverable,
          incoming:threat.incoming,home:s.home,critical:threat.critical});
      if(issued>=(threat.critical?3:1)||retreatRequests.size>=5)break;
    }
    if(issued){lastEmergencyRetreat=tick;defenseStatus+=' · '+issued+' Rückzug/Rückzüge angefordert';}
    return issued>0;
  }
  async function defense(me,tick,serial,groups,s) {
    if(!opts.defense||!ctors.attack||!s.incoming||pendingAttack)return false;
    const threat=defenseAssessment(me,s,tick);
    // Do not forbid every counterattack merely because the invasion is serious.
    // A counteroffensive is allowed only if the home defense remains funded.
    if(threat.critical&&s.home<threat.incoming*1.35)return false;
    // Keep the home force against active stacks; a large incoming percentage
    // alone is not a reason to skip a safe raid on the attacker's weak home.
    if(s.activeEnemy||s.home<threat.incoming*1.35)return false;
    const attacks=threat.hostile.slice().sort((a,b)=>b.troops-a.troops);
    for(const a of attacks.slice(0,3)){
      let attacker;
      try{attacker=game.playerBySmallID?.(a.attackerID);}catch(_){continue;}
      if(!attacker?.isPlayer?.()||friendly(attacker,me))continue;
      const id=safeID(attacker),key=String(id),their=number(()=>attacker.troops(),Infinity);
      if(coordinatedWar()&&isWar()&&id!==warState.id)continue;
      if(!Number.isFinite(their)||their<0||
         tick-(cooldowns.get(key)??-Infinity)<160)continue;
      const candidate=groups.find(x=>x.id===id);
      if(!candidate||!await legalTarget(me,candidate,serial))continue;
      if(!live(serial))return false;
      // Alliances and troop numbers can change while me.actions() awaits.
      const current=game.playerViews?.().find(p=>safeID(p)===id);
      if(!current?.isAlive?.()||friendly(current,me)||
        (coordinatedWar()&&isWar()&&warState.id!==id)){
        telemetry('defense_allied_skip','Gegenangriff nach Allianz-/Frontwechsel verhindert',
          {target:id,friendly:!!current&&friendly(current,me)});
        continue;
      }
      const fresh=military(me,strategic.groups);
      const enemyHome=number(()=>current.troops(),Infinity);
      if(!Number.isFinite(enemyHome)||enemyHome<0||fresh.activeEnemy||
        fresh.home<fresh.incoming*1.35)continue;
      const homeFloor=Math.max(fresh.reserve,fresh.incoming*1.35);
      const spare=Math.max(0,Math.min(fresh.available,fresh.home-homeFloor));
      const amount=Math.floor(Math.min(spare*.84,fresh.home*.28));
      // Commit only a force capable of pressuring the remaining enemy home;
      // preserve our live incoming defense and dynamic reserve after dispatch.
      if(amount<Math.max(500,enemyHome*1.10)||fresh.home-amount<homeFloor)continue;
      if(send('attack',[id,amount],'KONTROLLIERTER GEGENANGRIFF → '+nameOf(current))){
        const out=fresh.out.filter(x=>attackTargets(x.targetID,id)&&!x.retreating);
        pendingAttack={actionId:lastActionId,id,name:nameOf(current),tick,amount,ownLand:number(()=>me.numTilesOwned()),
          enemyLand:number(()=>current.numTilesOwned()),beforeIds:out.map(x=>x.id),
          beforeTroops:out.reduce((v,x)=>v+x.troops,0)};
        cooldowns.set(key,tick);lastEnemySend=tick;return true;
      }
    }
    return false;
  }
  async function attack(me,tick,serial,ranked,s) {
    if(!ctors.attack||pendingAttack)return false;
    for(const item of ranked.slice(0,clamp(setting('maxTargets'),4,25))){
      if(!live(serial)||!actionBudget('combat'))return false;
      // Rendezvous delay cannot block emergency defence or an active war.
      if(item.id!==null&&duoPlan?.target===item.id&&
        Number.isInteger(duoPlan.strikeTick)&&tick<duoPlan.strikeTick&&
        s.incoming===0&&warState.id!==item.id&&
        !(duoFocus(me,item.opponent)?.on>0))continue;
      const tile=await legalTarget(me,item,serial);
      if(tile===null){rejected.set(item.key,tick);
        decisionNote('ziel_verworfen','Ziel '+(item.opponent?nameOf(item.opponent):'Neutralland')+
          ': keine bestätigte legale Angriffsposition',[
            'Nächster Schritt: andere Grenze oder Marine prüfen'],tick);
        continue;}
      // Re-read the live relation after the async worker legality probe.
      if(item.id!==null){
        const current=game.playerViews?.().find(p=>safeID(p)===item.id);
        if(!current?.isAlive?.()||friendly(current,me)||
          (coordinatedWar()&&isWar()&&warState.id!==item.id)){
          telemetry('attack_allied_skip','Angriff nach Allianz-/Frontwechsel verhindert',
            {target:item.id,friendly:!!current&&friendly(current,me)});
          decisionNote('ziel_verworfen','Ziel '+item.id+
            ': Allianz oder Front nach Worker-Abfrage gewechselt',[],tick);
          continue;
        }
      }
      // The game state may advance during the async worker legality probe.
      const fresh=military(me,strategic.groups); // Never forget stronger OTHER neighbors on recheck.
      const freshJoint=item.id!==null?duoJointOpportunity(me,strategic.groups,
        fresh,item,number(()=>game.ticks(),tick),true):null;
      const freshFront=item.id!==null?frontRiskPlan(strategic.groups,fresh,item.id):null;
      if(item.id!==null && (freshFront.danger||freshFront.pressure||
        fresh.incoming>fresh.home*(lateGame(me)?.15:.04) ||
        (fresh.activeEnemy>=(lateGame(me)&&fresh.strongest<fresh.home*.55?2:1)&&
          !sameFrontFollowUp(me,strategic.groups,fresh,item,
            number(()=>game.ticks(),tick))) ||
        (!freshJoint&&fresh.available+duoBattleCredit(me,item.opponent)<
          Math.max(100,number(()=>item.opponent.troops(),Infinity)*
            (lateGame(me)?1.15:1.3)))))continue;
      if(item.id===null && fresh.activeNeutral>=1)continue;
      if(item.fallout && (fresh.incoming>0 ||
        fresh.strongest>fresh.home*.65 || fresh.ratio<.60 ||
        fresh.available<fresh.home*.30))continue;
      if(item.id!==null && coordinatedWar() && (!warReadiness(me,strategic.groups,fresh,tick,item).ready ||
        !targetOpportunity(me,strategic.groups,fresh,item) ||
        (isWar()&&warState.id!==item.id)))continue;
      let amount=Math.min(item.amount,fresh.available,
        item.id===null ? neutralAttackAmount(fresh,clamp(setting('aggressive'),40,100)/100) :
        Math.min(freshFront.safeStrike,Math.floor(fresh.available*(hardMode()?.76:.8))));
      if(item.id!==null){
        const protectedStrike=offensiveCommitment(strategic.groups,fresh,item,amount);
        if(protectedStrike.capped){
          telemetry('offensive_guard','Großangriff nach verbleibendem Heimschutz begrenzt',
            {target:item.id,requested:amount,allowed:protectedStrike.amount,
              floor:protectedStrike.floor,other:protectedStrike.other,
              reason:protectedStrike.reason});
          if(!protectedStrike.amount){
            blockedTargets.set(item.id,tick+110);
            continue;
          }
        }
        amount=protectedStrike.amount;
        if(operation?.target===item.id)
          amount=Math.min(amount,Math.max(0,operation.budget-operation.spent));
        if(freshJoint&&amount+freshJoint.ally<freshJoint.needed){
          telemetry('duo_strike_veto',
            'Duo-Angriff gestoppt: eigener Einsatz plus Partnerbudget reicht nicht',
            {target:item.id,own:amount,ally:freshJoint.ally,
              required:freshJoint.needed});
          continue;
        }
      }
      if(amount<100){
        decisionNote('ziel_verworfen','Ziel '+(item.opponent?nameOf(item.opponent):'Neutralland')+
          ': Truppenbudget oder Heimschutz begrenzt',[],tick);
        continue;
      }
      const label=item.opponent?nameOf(item.opponent):'neutrales Land';
      if(send('attack',[item.id,amount],`ANGRIFF → ${label} (${Math.floor(amount/10)} Tr.)`)){
        cooldowns.set(item.key,tick);
        if(item.id===null)lastNeutralSend=tick;
        else {
          lastEnemySend=tick;
          plan={id:item.id,until:tick+(hardMode()?1000:300),name:label};
          if(operation?.target===item.id){operation.spent+=amount;
            decisionNote('operation','Einsatz '+amount+' / '+operation.budget+
              ' für '+operation.targetName,[],tick);}
        }
        const before=s.out.filter(a=>attackTargets(a.targetID,item.id)&&!a.retreating);
        pendingAttack={actionId:lastActionId,id:item.id,name:label,tick,amount,ownLand:number(()=>me.numTilesOwned()),
          enemyLand:item.opponent?number(()=>item.opponent.numTilesOwned()):0,
          beforeIds:before.map(a=>a.id),beforeTroops:before.reduce((v,a)=>v+a.troops,0),
          forecast:item.forecast||null};
        if(item.opponent?.isDisconnected?.()===true)strategicTelemetry.afkTargets++;
        if(item.opponent && adversaryWindow(me,item.opponent).exposed)
          telemetry('opportunity_attack','Angriff im gegnerischen Mehrfront-Konflikt',
            {target:item.id,window:adversaryWindow(me,item.opponent)});
        if(item.opponent&&allyAssistTarget(me,item.opponent))strategicTelemetry.assists++;
        lastSelection=label+' · score '+item.score.toFixed(0)+
          (item.fallout?' · Fallout-Fallback':'');
        telemetry('attack_intent','Angriff angefordert – wartet auf Bestätigung',
          {target:item.id,troops:amount,baseScore:item.baseScore,
            neuralDelta:item.neuralDelta,chosenScore:item.score,
            kind:item.id===null?'neutral':'enemy'});
        return true;
      }
    }
    return false;
  }
  // canBuild predicts the resulting building tile; the intent retains the queried
  // request tile so the engine resolves it once. canUpgrade is a unit ID, not
  // interchangeable. Own tiles INSIDE the country matter more than border-only probes.
  const STRUCTURE_TYPES=['City','Factory','Port','Defense Post','SAM Launcher','Missile Silo'];
  const ECON_PENDING_TTL=100; // 10 game seconds; new builds appear before construction completes.
  function ownStructures(me) {
    try {return me.units().filter(u=>u?.isActive?.()&&STRUCTURE_TYPES.includes(u.type?.()));}
    catch (_) {return [];}
  }
  function economicUnitsByType(units,type) {return units.filter(u=>u.type?.()===type);}
  function ownedTile(ref,me) {
    try {
      if(!Number.isInteger(ref)||(typeof game.isValidRef==='function'&&!game.isValidRef(ref))||!game.isLand(ref)||game.isImpassable(ref))return false;
      if(typeof game.ownerID==='function' && typeof me.smallID==='function')return game.ownerID(ref)===me.smallID();
      return safeID(game.owner(ref))===safeID(me);
    }catch(_){return false;}
  }
  function buildObserved(pending,units) {
    if(pending.kind==='upgrade')return units.some(u=>u.id?.()===pending.unitId &&
      u.type?.()===pending.type && number(()=>u.level(),0)>pending.level);
    return units.some(u=>u.type?.()===pending.type && number(()=>u.tile(),-9999)===pending.tile);
  }
  function pendingEconomy(tick,units) {
    if(!economicPending)return false;
    if(buildObserved(economicPending,units)){
      economicStatus='Bestätigt: '+economicPending.type;
      successfulEconomyTick=tick;failedEconomyProbes=0;
      telemetry('build_confirmed',economicStatus,
        {actionId:economicPending.actionId??null,type:economicPending.type,
          kind:economicPending.kind,evidence:'structure-or-level-observed'});
      if(economicPending.type==='Port')telemetry('port_confirmed','Hafen im Spielzustand bestätigt',
        {tile:economicPending.tile,buildKind:economicPending.kind});
      if(['City','Factory','Port'].includes(economicPending.type)){
        const me=myPlayer();
        const sample={tick,type:economicPending.type,
          tile:economicPending.tile,buildKind:economicPending.kind,
          beforeTrain:number(()=>me?.trainGold?.(),NaN),
          beforeTrade:number(()=>me?.tradeGold?.(),NaN),finished:false};
        incomeAttribution.push(sample);
        if(incomeAttribution.length>40)incomeAttribution.shift();
      }
      economicPending=null;
      return false;
    }
    if(tick-economicPending.tick<ECON_PENDING_TTL){
      economicStatus='Warte auf '+economicPending.type+'-Bestätigung';
      return true;
    }
    const k=economicPending.kind+':'+economicPending.type+':'+economicPending.tile;
    economicBlocked.set(k,tick+220);
    failedEconomyProbes++;
    log('BAU nicht bestätigt: '+economicPending.type+' · neuen Standort suchen');
    telemetry('build_unconfirmed','Bauauftrag nicht im Spielzustand bestätigt',
      {actionId:economicPending.actionId??null,type:economicPending.type,
        tile:economicPending.tile,evidence:'unobserved-within-window'});
    economicPending=null;return false;
  }
  // Cheap, cached strategic view of visible missiles, silos, structures and SAM coverage.
  // SAMs automatically intercept in the engine; the bot only builds/positions them.
  function nuclearIntel(me,ourUnits=ownStructures(me)) {
    const tick=number(()=>game?.ticks?.(),0);
    if(nuclearCache && tick-nuclearCacheTick<24)return nuclearCache;
    const units=(()=>{try{return game.units();}catch(_){return [];}})();
    const myID=safeID(me);
    const enemy=[],friendlyUnits=[],enemySilos=[],enemySAM=[],incomingNukes=[];
    for(const u of units){
      const owner=u.owner?.(),id=safeID(owner),type=u.type?.();
      if(!type||!u.isActive?.())continue;
      if(id===myID || (owner?.isPlayer?.()&&friendly(owner,me))){
        if(STRUCTURE_TYPES.includes(type))friendlyUnits.push(u);
        continue;
      }
      if(type==='Missile Silo')enemySilos.push(u);
      if(type==='SAM Launcher')enemySAM.push(u);
      if(STRUCTURE_TYPES.includes(type)&&owner?.isPlayer?.())enemy.push(u);
      if(['Atom Bomb','Hydrogen Bomb','MIRV','MIRV Warhead'].includes(type)){
        const target=u.targetTile?.();
        if(Number.isInteger(target) && (ownedTile(target,me)||ourUnits.some(o=>{
          const t=number(()=>o.tile?.(),-1);return t>=0 && Math.hypot(game.x(t)-game.x(target),game.y(t)-game.y(target))<115;
        })))incomingNukes.push(u);
      }
    }
    // Buildable own territory is the primary SAM task. Allied infrastructure
    // is optional collateral coverage, not an impossible own-site obligation.
    // Retain the ownStructures fallback when game.units() is not exposed.
    const ourStructures=ourUnits.filter(u=>STRUCTURE_TYPES.includes(u.type?.()));
    const allyStructures=friendlyUnits.filter(u=>safeID(u.owner?.())!==myID);
    const protectedUnits=ourStructures.concat(allyStructures);
    const sams=protectedUnits.filter(u=>u.type?.()==='SAM Launcher');
    const assetType=u=>['City','Factory','Port','Missile Silo'].includes(u.type?.());
    const allyAssets=allyStructures.filter(assetType);
    // Shared allied SAM coverage counts, but allied buildings alone must
    // never trigger an own-territory launcher purchase, including Impossible.
    const assets=ourStructures.filter(assetType);
    const range=s=>number(()=>game.config().samRange(s.level?.()||1),70);
    const covered=a=>sams.some(s=>{
      const r=range(s),x=game.x(a.tile())-game.x(s.tile()),y=game.y(a.tile())-game.y(s.tile());
      return x*x+y*y<=r*r;
    });
    const uncovered=assets.filter(a=>!covered(a));
    const allyUncovered=hardMode()?[]:allyAssets.filter(a=>!covered(a));
    nuclearCache={enemy,enemySilos,enemySAM,incomingNukes,sams,assets,uncovered,
      allyAssets,allyUncovered,protectedUnits};
    nuclearCacheTick=tick;return nuclearCache;
  }
  function assetValue(type) {return {'City':5,'Factory':5,'Missile Silo':8,'Port':3,'SAM Launcher':7,'Defense Post':2}[type]||1;}
  function samCoverageValue(tile,units,intel) {
    const x=game.x(tile),y=game.y(tile),near=(a,r)=>{
      const dx=x-game.x(a.tile()),dy=y-game.y(a.tile());return dx*dx+dy*dy<=r*r;
    };
    let score=0;
    const radius=number(()=>game.config().samRange?.(1),70);
    for(const u of intel.assets){
      if(!near(u,radius))continue;
      const covered=intel.sams.some(s=>nearSAM(s,u));
      score+=assetValue(u.type?.())*(covered?0.22:2.25);
    }
    // An own asset must benefit before optional allied overlap adds value.
    if(score>0)for(const u of intel.allyUncovered||[]){
      if(near(u,radius))score+=assetValue(u.type?.())*.35;
    }
    for(const sam of intel.sams){if(near(sam,45))score-=65;else if(near(sam,75))score-=22;}
    return score;
  }
  function nearSAM(sam,asset) {
    const r=number(()=>game.config().samRange(sam.level?.()||1),70);
    const dx=game.x(asset.tile())-game.x(sam.tile()),dy=game.y(asset.tile())-game.y(sam.tile());
    return dx*dx+dy*dy<=r*r;
  }
  // Dedicated coast discovery, independent from the 190 generic inland
  // anchors. The worker remains the authority for an actual Port build tile.
  function portCoastalAnchors(me,tiles,tick,limit=40){
    if(!game?.isShore || !opts.boats)return [];
    const result=[],seen=new Set(),w=game.width(),h=game.height();
    const add=t=>{
      if(result.length>=limit || seen.has(t))return;
      seen.add(t);
      if(ownedTile(t,me)&&shoreNear(t))result.push(t);
    };
    const addNear=t=>{
      if(!Number.isInteger(t) || result.length>=limit)return;
      add(t);
      const x=game.x(t),y=game.y(t);
      for(const [dx,dy] of [[5,0],[-5,0],[0,5],[0,-5],
        [10,0],[-10,0],[0,10],[0,-10]]){
        if(result.length>=limit)break;
        if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)add(game.ref(x+dx,y+dy));
      }
    };
    const coastTiles=tiles||[];
    const stride=Math.max(1,Math.ceil(coastTiles.length/650));
    const phase=Math.floor(tick/40)%stride;
    for(let i=phase;i<coastTiles.length&&result.length<limit;i+=stride){
      const t=coastTiles[i];
      if(ownedTile(t,me) && shoreNear(t))addNear(t);
    }
    // A long inland/hostile front need not contain a coastline: rotate a
    // second bounded grid through the whole map as a fallback.
    if(result.length<8){
      const spacing=Math.max(9,Math.ceil(Math.sqrt(w*h/420)));
      const phase2=Math.floor(tick/60)%4,dx=phase2%2?Math.floor(spacing/2):0,
        dy=phase2>=2?Math.floor(spacing/2):0;
      for(let y=Math.floor(spacing/2)+dy;y<h&&result.length<limit;y+=spacing)
        for(let x=Math.floor(spacing/2)+dx;x<w&&result.length<limit;x+=spacing){
          const t=game.ref(x,y);
          if(ownedTile(t,me)&&shoreNear(t))addNear(t);
        }
    }
    return result;
  }
  // SAMs need a dedicated asset-centered grid. Generic city/front anchors
  // can fill their quota before an asset has a safe launcher position.
  function samBuildAnchors(me,intel,tick,limit=180){
    if(!opts.antiNuke||!intel?.uncovered?.length)return [];
    const sites=[],seen=new Set(),w=game.width(),h=game.height();
    const assets=intel.uncovered.filter(u=>Number.isInteger(u.tile?.())&&
      ownedTile(u.tile(),me)).sort((a,b)=>assetValue(b.type?.())-assetValue(a.type?.()));
    const start=assets.length?Math.floor(tick/70)*5%assets.length:0;
    const sampled=assets.slice(start).concat(assets.slice(0,start));
    const add=(x,y)=>{
      if(sites.length>=limit||x<0||y<0||x>=w||y>=h)return;
      const ref=game.ref(x,y);
      if(!seen.has(ref)&&ownedTile(ref,me)){seen.add(ref);sites.push(ref);}
    };
    const phase=Math.floor(tick/45)%8;
    for(const u of sampled.slice(0,18)){
      if(sites.length>=limit)break;
      const x=game.x(u.tile()),y=game.y(u.tile());
      add(x,y);
      for(const radius of [20,34,48,58]){
        for(let k=0;k<8;k++){
          const angle=Math.PI*(k+phase%2*.5)/4;
          add(Math.round(x+radius*Math.cos(angle)),
            Math.round(y+radius*Math.sin(angle)));
        }
      }
    }
    return sites;
  }
  // P2 multi-horizon investment evidence. Values are comparative estimates,
  // not claims about exact engine yield and never create build authorization.
  function investmentAssessment(item,cost,requirements,units){
    const income=incomeStatus.observed?incomeStatus:null;
    const horizons=[120,600],gold=Math.max(1,requirements.gold),base={
      type:item.type,cost:Number.isFinite(cost)?cost:null,horizons,
      priceSource:'worker',siteConfirmed:true,expiresTick:number(()=>game.ticks(),0)+120,
      marginal:{short:0,long:0},paybackTicks:null,risk:0,score:0};
    if(item.type==='SAM Launcher'&&requirements.nuclearThreat){
      base.score=requirements.intel.uncovered.length?46:9;
      base.marginal={short:requirements.incomingNukes?90:35,long:55};
      base.risk=requirements.intel.uncovered.length?0.15:.55;return base;
    }
    if(item.type==='Defense Post'&&requirements.immediate){
      base.score=35;base.marginal={short:70,long:20};base.risk=.2;return base;
    }
    if(item.type==='City'){
      base.score=(requirements.pressure>.70?28:0)+(requirements.capStalled?35:0);
      base.marginal={short:requirements.capStalled?65:18,long:requirements.capStalled?85:42};
      base.risk=requirements.immediate?.65:.2;return base;
    }
    if(item.type==='Factory'&&income?.train>0){
      // Total observed train income is not the marginal return of one new
      // Factory. Attribute only a conservative per-completed-unit proxy.
      const completed=units.filter(u=>u.type?.()==='Factory'&&
        !u.isUnderConstruction?.()).length;
      const marginal=completed>0?income.train/completed:0;
      const perTick=marginal/120;base.paybackTicks=cost/Math.max(1,perTick);
      base.score=Math.min(24,marginal/Math.max(1,cost)*18);
      base.marginal={short:Math.min(60,marginal/cost*20),long:Math.min(100,marginal/cost*80)};
      base.risk=requirements.immediate?.7:.25;return base;
    }
    if(item.type==='Port'){
      const completed=units.filter(u=>u.type?.()==='Port'&&!u.isUnderConstruction?.()).length;
      if(completed===0){base.score=requirements.portMilestone?35:12;
        base.marginal={short:requirements.portMilestone?25:5,long:requirements.portMilestone?70:20};
        base.risk=requirements.coastSites?0.3:.9;return base;}
      if(income?.trade===0){base.score=-70;base.risk=.8;return base;}
      if(income?.trade>0){const marginal=income.trade/completed;
        base.score=Math.min(28,marginal/Math.max(1,cost)*14);
        base.paybackTicks=cost/Math.max(1,marginal/120);
        base.marginal={short:Math.min(50,marginal/cost*18),long:Math.min(100,marginal/cost*70)};
        base.risk=.3;return base;}
    }
    base.risk=cost/gold;base.score=0;return base;
  }
  function investmentValue(item,cost,requirements,units){
    return investmentAssessment(item,cost,requirements,units).score;
  }
  function economicDefensePressure(me,s,tick=number(()=>game.ticks())){
    const home=Math.max(1,number(()=>me.troops()));
    if(s.incoming>home*.18)return true;
    if(!(s.incoming>=home*.08))return false; // Ignore small probes.
    const recent=troopSamples.filter(x=>x.tick<=tick&&tick-x.tick<=120);
    const peak=Math.max(number(()=>me.numTilesOwned()),...recent.map(x=>x.tiles));
    const losing=peak-number(()=>me.numTilesOwned())>=Math.max(100,peak*.03);
    // Require consecutive observations; stale/gapped samples cannot prove pressure.
    let since=tick,previous=tick;
    for(let i=recent.length-1;i>=0;i--){
      const x=recent[i];
      if(previous-x.tick>40||!(x.incoming>=Math.max(1,x.home)*.08))break;
      since=x.tick;previous=x.tick;
    }
    return s.strongest>=home*.85||losing||tick-since>=40;
  }
  function economicNeeds(me,units,tiles) {
    const mine=number(()=>me.numTilesOwned(),0);
    const gold=goldAmount(me);
    const cap=Math.max(1,troopSnapshot.max||number(()=>game.config().maxTroops(me),1));
    const troops=number(()=>me.troops(),0);
    const threatened=troopSnapshot.incoming>0 || troopSnapshot.strongest>troops*.6;
    const hostileFronts=strategic.groups.filter(g=>g.id!==null&&g.opponent?.isAlive?.()).length;
    const count=type=>economicUnitsByType(units,type).length;
    const cities=count('City'),factories=count('Factory'),ports=count('Port');
    const cityEnabled=game.config().isUnitDisabled?.('City')!==true;
    const factoryEnabled=game.config().isUnitDisabled?.('Factory')!==true;
    const portEnabled=game.config().isUnitDisabled?.('Port')!==true;
    const wantedCity=cityEnabled?(hardMode()?Math.min(13,Math.max(2,2+Math.floor(mine/600))):Math.min(9,Math.max(1,1+Math.floor(mine/900)))):0;
    const wantedFactory=factoryEnabled?(hardMode()?Math.min(11,Math.max(2,2+Math.floor(mine/900))):Math.min(8,Math.max(1,1+Math.floor(mine/1350)))):0;
    const wantedPort=!portEnabled?0:opts.boats?Math.min(5,Math.max(1,Math.floor(mine/1050)+1)):
      (factories>=1 && mine>600?Math.min(2,Math.floor(mine/2700)+1):0);
    const nowTick=number(()=>game.ticks(),0);
    const startup=(cityEnabled&&cities<1)||(factoryEnabled&&factories<1);
    // After losing the last productive buildings, do not keep the former
    // Warship/Port/SAM savings target ahead of a legal, affordable core.
    // An observed incoming nuke or currently active invasion keeps priority.
    // A still-standing City/Factory is not proof that the economy can
    // recover: prolonged observed train+trade income collapse needs a
    // productive rebuild too. Do not override active attacks or nukes.
    const recoverySeed=economyRecoveryKernel({
      observed:incomeStatus.observed,train:incomeStatus.train,trade:incomeStatus.trade,
      cities,factories,failedEconomyProbes,startup,land:mine,
      incoming:troopSnapshot.incoming,nuclearThreat:false});
    const incomeCollapse=recoverySeed.incomeCollapse;
    let coreRecovery=recoverySeed.coreRecovery;
    // Eight failed coast scans used to disable first-port planning forever.
    // Retry after a bounded pause: territory and legal build sites can change.
    if(portProbeFailures>=8 && Number.isFinite(lastPortRetryTick) &&
      nowTick-lastPortRetryTick>=180){
      portProbeFailures=0;lastPortRetryTick=nowTick;
    }
    const coastSites=ports===0&&opts.boats?
      portCoastalAnchors(me,tiles,nowTick,24):[];
    const tradePeer=duoTrustedPeer()?.player;
    const peerPorts=tradePeer&&actualFriendly(tradePeer,me)?
      (tradePeer.units?.()||[]).filter(u=>u.isActive?.()&&
        u.type?.()==='Port'&&!u.isUnderConstruction?.()).length:0;
    const duoTradeReady=ports===0&&peerPorts>0;
    const portMilestone=!!(opts.boats&&portEnabled&&ports===0&&!startup&&
      coastSites.length&&portProbeFailures<8);
    const tradePortMilestone=portMilestone&&duoTradeReady;
    const basic=(cityEnabled&&cities<2)||(factoryEnabled&&factories<2);
    // Never buy decorative defense posts while the first city/factory are still
    // unaffordable. Only a *real* incoming offensive can override the basics.
    const immediate=economicDefensePressure(me,troopSnapshot,nowTick);
    const emergency=immediate||(troopSnapshot.strongest>troops*1.25&&
      (troopSnapshot.ratio<.75||hostileFronts>=2));
    // The first Public game purchased 24 defense posts with little economy.
    // Cap non-emergency posts separately from urgent defensive construction.
    const wantedDefense=!threatened||(startup&&!immediate)?0:
      immediate?Math.min(10,Math.max(3,Math.ceil((tiles?.length||0)/165),hostileFronts*2)):
      Math.min(7,Math.max(2,Math.ceil((tiles?.length||0)/310),hostileFronts),
        Math.max(2,(cities+factories)*2));
    const intel=nuclearIntel(me,units);
    const enemySilos=intel.enemySilos.length,enemyNukes=intel.incomingNukes.length;
    const late=lateGame(me),siloCount=count('Missile Silo');
    // Begin anti-nuclear coverage before the late game, especially when a
    // nearby opponent has a silo; keep the first City/Factory affordable.
    const proactiveSAM=!basic&&!(crisisTrend&&nowTick<crisisTrend.expires)&&
      intel.uncovered.length>0&&
      intel.assets.length>=2&&gold>=350000&&
      troopSnapshot.incoming<troops*.10&&
      (hostileFronts>0||late);
    const threat=!!(enemySilos||enemyNukes);
    // A confirmed nuclear threat keeps SAM funding ahead of an income-collapse
    // rebuild. Preserve the existing first-core startup path separately.
    coreRecovery=economyRecoveryKernel({
      observed:incomeStatus.observed,train:incomeStatus.train,trade:incomeStatus.trade,
      cities,factories,failedEconomyProbes,startup,land:mine,
      incoming:troopSnapshot.incoming,nuclearThreat:threat}).coreRecovery;
    const siloAllowed=opts.nukes && game.config().isUnitDisabled?.('Missile Silo')!==true &&
      ['Atom Bomb','Hydrogen Bomb','MIRV'].some(t=>game.config().isUnitDisabled?.(t)!==true);
    const samSearchBlocked=samAffordableFailureSince!==null&&nowTick-samAffordableFailureSince>=180;
    const trusted=duoTrustedPeer();
    const peer=trusted&&actualFriendly(trusted.player,me)?trusted:null;
    const peerUnits=peer?(peer.player.units?.()||[]):[];
    const duoNuclear=duoNuclearInvestmentKernel({
      ownId:safeID(me),peerId:peer?.id,peerValid:!!peer,
      peerCoreReady:!!(peer&&peer.state?.cities>=2&&peer.state?.factories>=2),
      peerSilos:peerUnits.filter(u=>u.isActive?.()&&u.type?.()==='Missile Silo').length,
      coreReady:(!cityEnabled||cities>=2)&&(!factoryEnabled||factories>=2),
      siloAllowed,late,land:mine,silos:siloCount,nukeShots,
      ownSAM:count('SAM Launcher'),
      antiNuke:opts.antiNuke&&game.config().isUnitDisabled?.('SAM Launcher')!==true,
      enemySilos,incomingNukes:enemyNukes,uncovered:intel.uncovered.length,
      proactiveSAM,samSearchBlocked,urgentVictory:winStatus.urgent});
    const wantedSAM=duoNuclear.wantedSAM;
    // Both teammates build an initial guard when needed. Only the designated
    // partner funds a first silo until that partner actually owns a silo;
    // stale/untrusted relay state falls back to independent solo planning.
    const wantedSilo=duoNuclear.firstSiloWindow?
      (siloCount===0?1:nukeShots>0&&gold>2500000?
        Math.min(3,1+Math.floor(mine/18000)):1):0;
    const pressure=troops/cap;
    // Only territory and COMPLETED City levels increase maxTroops in the
    // pinned OpenFront engine. A Factory is evaluated for economic returns,
    // never treated as troop-cap relief.
    const capStalled=pressure>=.85&&cityEnabled&&
      troopSnapshot.incoming<troops*.08&&!immediate;
    const capacityCityDesired=capStalled?
      Math.max(wantedCity,cities+1):wantedCity;
    const posture=economyPosture(me,troopSnapshot,nowTick);
    const style=effectiveBuildStyle() || 'Ausgewogen';
    const defBoost=style==='Defensiv'?22:0,econBoost=style==='Wirtschaft'?24:0;
    // Repeated failed location/quote probes must not postpone the first
    // productive buildings forever. This changes priority, never worker legality.
    const productiveStall=failedEconomyProbes>=5&&!immediate&&!threat&&
      ((cityEnabled&&cities<3)||(factoryEnabled&&factories<3));
    const neural=neuralStrategicSignals(me,troopSnapshot,nowTick);
    const list=[
      {type:'City',desired:capacityCityDesired,score:92+
        (coreRecovery&&cities<2?530:0)+(productiveStall&&cities<3?110:0)+(neural?.cityPriority||0)*90+econBoost/2+(posture==='recruit'?38:0)+Math.max(0,pressure-.35)*75+
          (pressure>.80&&!immediate?30:0)+(cities===0?115:hardMode()&&cities<2?80:0)+
          (capStalled?pressure>=.98?355:pressure>=.95?295:pressure>=.90?230:135:0)},
      {type:'Factory',desired:wantedFactory,score:91+
        (coreRecovery&&factories<2?520:0)+(productiveStall&&factories<3?110:0)+(neural?.factoryPriority||0)*90+econBoost+(posture==='bootstrap'?20:0)+
          (factories===0?100:hardMode()&&factories<2?85:0)+
          (gold<450000?15:0)+(pressure<.60&&factories>0?10:0)+
          (factories<2&&cities>=2?24:0)-
          (incomeStatus.observed&&incomeStatus.train===0&&factories>=2?26:0)},
      {type:'Port',desired:wantedPort,score:tradePortMilestone?485:portMilestone?430:
        59+(neural?.portPriority||0)*90+econBoost/2+(posture==='breakout'?115:0)+(ports===0&&wantedPort?12:0)+
        (incomeStatus.observed&&incomeStatus.trade===0&&ports===0?35:0)+
        (duoTradeReady?55:0)+(ports<2&&coastSites.length?22:0)},
      {type:'Defense Post',desired:wantedDefense,score:immediate?310+defBoost:threatened?(basic?36:77)+(neural?.defensePriority||0)*90+defBoost+(posture==='defensive'?24:0):20},
      {type:'SAM Launcher',desired:wantedSAM,score:enemyNukes?510+defBoost:
        duoNuclear.firstGuard?465+defBoost:threat?175+defBoost:proactiveSAM?155+defBoost:40},
      {type:'Missile Silo',desired:wantedSilo,score:siloCount===0?410:opts.nukes?(late?131:94)+(neural?.nuclearPriority||0)*75+(gold>6000000?13:0):0}
    ];
    const crisisAllowed=type=>!immediate||
      ['Defense Post','SAM Launcher'].includes(type)||
      coreRecovery&&!enemyNukes&&['City','Factory'].includes(type);
    const value=list.filter(x=>crisisAllowed(x.type)&&x.desired>count(x.type)).map(x=>({...x,count:count(x.type),
      urgency:x.score+Math.min(50,35*(x.desired-count(x.type))/x.desired)}));
    // Upgrades become useful when expansion is tight or troop cap is near.
    if(opts.upgrades){
      for(const x of list.filter(x=>crisisAllowed(x.type)&&['City','Factory','Port','SAM Launcher','Missile Silo'].includes(x.type)&&count(x.type)>0 &&
        (x.type!=='SAM Launcher'||opts.antiNuke&&duoNuclear.samUpgradeAllowed) && (x.type!=='Missile Silo'||opts.nukes))){
        const upgradeScore=x.score-(count(x.type)<x.desired?17:36)+
          (x.type==='City'&&pressure>.75?27:0)+
          (x.type==='City'&&capStalled?35:0)+
          (x.type==='SAM Launcher'&&threat?32:0)+
          (x.type==='Missile Silo'&&late&&opts.nukes?22:0);
        value.push({...x,count:count(x.type),upgrade:true,urgency:upgradeScore});
      }
    }
    // Deduplicate type list for game actions, but keep separate build/upgrade priorities.
    value.sort((a,b)=>b.urgency-a.urgency);
    const saveForSilo=duoNuclear.siloFundActive&&!basic;
    const saveForNuke=siloAllowed && late && siloCount>0 &&
      intel.enemy.length>0 && nukeShots===0;
    const firstRocketFund=game.config().isUnitDisabled?.('Atom Bomb')===true?
      (game.config().isUnitDisabled?.('Hydrogen Bomb')===true?
        (game.config().isUnitDisabled?.('MIRV')===true?0:26000000):6400000):1100000;
    // A former legal quote is useful for funding, but must not freeze other
    // production forever after the front or shoreline changes.
    const samFund=duoNuclear.samFundingUrgent&&intel.uncovered.length>0&&
      wantedSAM>count('SAM Launcher')&&!samSearchBlocked&&
      nowTick-samQuotedTick<=300?samQuotedCost:0;
    // On Public Europe this first Port cost 500k, but a worker may omit a
    // buildable option while funds are low. Use an explicitly provisional
    // floor until a real, current worker quote replaces it.
    const portFund=portMilestone?
      (nowTick-portQuotedTick<=210&&portQuotedCost>0?portQuotedCost:
        // Provisional saving begins only after a productive core exists;
        // otherwise early harbor hoarding delays essential income buildings.
        cities>=2&&factories>=2&&!hardMode()?500000:0):0;
    const firstPortWindow=portMilestone&&(!capStalled||pressure<.95);
    const savingsTarget=immediate||coreRecovery?0:samFund>0?samFund:
      capStalled&&!firstPortWindow&&!enemyNukes?0:portFund>0?portFund:
      portMilestone||(threat&&intel.uncovered.length>0&&wantedSAM>0)?0:
      saveForSilo?1150000:saveForNuke?firstRocketFund:0;
    investmentStatus=immediate?'Verteidigung vor Investitionen':startup?'Erste Stadt/Fabrik':
      samFund>0&&gold<samFund?'SAM-Schutz '+Math.round(samFund).toLocaleString()+' Gold':
      threat&&intel.uncovered.length>0&&wantedSAM>0?'SAM-Schutz vor Raketenfonds':
      capStalled&&!firstPortWindow&&!enemyNukes?'Truppenlimit: Stadt/City-Upgrade oder Landgewinn priorisiert':
      portFund>0&&gold<portFund?'Hafen-Fonds '+Math.round(portFund).toLocaleString()+' Gold':
      portMilestone?'Hafen vor Silo':basic?'Zwei Städte und zwei Fabriken':
      saveForSilo?'Silo-Fonds 1,15 Mio.':saveForNuke?'Raketen-Fonds '+firstRocketFund.toLocaleString():'Wirtschaft & Offensive';
    const policyBiases={City:(neural?.cityPriority||0)*90,
      Factory:(neural?.factoryPriority||0)*90,
      Port:(neural?.portPriority||0)*90,
      'Defense Post':(neural?.defensePriority||0)*90,
      'SAM Launcher':0,
      'Missile Silo':(neural?.nuclearPriority||0)*75};
    return {list:value,policyBiases,threatened,gold,cities,factories,mine,pressure,nuclearThreat:threat,incomingNukes:enemyNukes,intel,
      startup,coreRecovery,incomeCollapse,basic,emergency,immediate,capStalled,firstPortWindow,savingsTarget,saveForSilo,saveForNuke,siloCount,
      enemySilos,proactiveSAM,wantedDefense,wantedSAM,portMilestone,coastSites:coastSites.length,portProbeFailures,
      samQuotedCost,portQuotedCost,posture,samSearchBlocked,
      duoNuclear, samFundingUrgent:duoNuclear.samFundingUrgent};
  }
  // Only actual worker quotes can establish a core funding target. A quote
  // when canBuild=false due to insufficient gold proves PRICE, not SITE.
  function coreFundingStatus(me,units=ownStructures(me),tick=number(()=>game.ticks(),0)){
    const missing=['City','Factory'].filter(type=>
      game.config().isUnitDisabled?.(type)!==true&&
      !units.some(u=>u.type?.()===type&&!u.isUnderConstruction?.()));
    for(const type of [...coreQuotes.keys()])
      if(!missing.includes(type))coreQuotes.delete(type);
    const live=[...coreQuotes].filter(([type,q])=>missing.includes(type)&&
      Number.isFinite(q.cost)&&q.cost>0&&tick-q.tick<=300);
    const gold=goldAmount(me);
    const price=live.length?Math.min(...live.map(([,q])=>q.cost)):null;
    coreFunding={tick,missing,gold,quotes:Object.fromEntries(coreQuotes),
      needed:price,shortfall:price===null?null:Math.max(0,price-gold),
      status:!missing.length?'core-ready':price===null?'price-unknown':
        gold>=price?'funded-recheck-worker':'saving-known-worker-price'};
    return coreFunding;
  }
  // One shared, short-lived spending ledger across economy, ships, missiles
  // and donations. Worker quotes are checked against current gold immediately
  // before send; unconfirmed overlapping intents cannot spend the same money.
  const goldBudgetBlockedSeen=new Map();
  function reportGoldBudgetBlocked(tick,purpose,data){
    const key=String(monitorSession)+'|'+purpose+'|'+data.floor+'|'+data.samFund+
      '|'+data.emergency;
    const prev=goldBudgetBlockedSeen.get(key);
    if(prev&&tick-prev.tick<80){prev.suppressed++;return;}
    const suppressed=prev?.suppressed||0;
    goldBudgetBlockedSeen.set(key,{tick,suppressed:0});
    if(goldBudgetBlockedSeen.size>120){
      for(const [k,v] of goldBudgetBlockedSeen)
        if(tick-v.tick>600)goldBudgetBlockedSeen.delete(k);
    }
    telemetry('gold_budget_blocked','Gemeinsamer Goldfonds schützt '+purpose,
      {...data,suppressedSinceLast:suppressed});
  }
  function spendBudget(me,cost,purpose,emergency=false,tiles=[]){
    const infinite=game.config().infiniteGold?.()===true;
    if(infinite)return true;
    const cash=goldAmount(me,NaN);
    if(!Number.isFinite(cash)||!Number.isFinite(cost)||cost<0)return false;
    const tick=number(()=>game.ticks(),0);
    budgetCommitments=budgetCommitments.filter(c=>
      tick-c.tick<=35&&cash>c.startGold-c.cost+1);
    const pending=budgetCommitments.reduce((n,c)=>n+c.cost,0);
    const units=ownStructures(me);
    const needs=economicNeeds(me,units,tiles);
    const core=coreFundingStatus(me,units,tick);
    // A real, still-required SAM quote outranks discretionary fleet/nukes.
    const samFund=needs.samFundingUrgent&&needs.wantedSAM>0&&
      needs.intel.uncovered.length>0&&!needs.samSearchBlocked&&
      Number.isFinite(needs.samQuotedCost)&&needs.samQuotedCost>0&&
      tick-samQuotedTick<=300?needs.samQuotedCost:0;
    let floor=needs.savingsTarget;
    if(purpose==='Warship')floor=needs.saveForSilo||needs.saveForNuke?
      Math.max(needs.savingsTarget,samFund):samFund;
    if(needs.coreRecovery&&['City','Factory'].includes(purpose)){
      // Only when no current troop invasion exists; final worker legality,
      // real quote and shared pending-gold checks still apply below.
      floor=0;
    }
    if(purpose==='SAM Launcher'&&needs.samFundingUrgent||
      purpose==='Port'&&needs.portMilestone&&
      needs.savingsTarget===needs.portQuotedCost||
      purpose==='Missile Silo'&&needs.saveForSilo||
      ['Atom Bomb','Hydrogen Bomb','MIRV'].includes(purpose)&&needs.saveForNuke&&
        !samFund)floor=0;
    if(emergency&&purpose==='Warship')floor=0;
    // A provisional first-Port estimate is not a permanent spending lock
    // once that estimate is funded but the worker offers no legal harbor.
    // The economy may then buy productive City/Factory alternatives.
    if(!samFund&&needs.portMilestone&&needs.portQuotedCost===0&&
      needs.savingsTarget>0&&cash>=needs.savingsTarget&&
      ['City','Factory'].includes(purpose))floor=0;
    // After repeated unsuccessful builds, release ONLY speculative silo/nuke
    // savings for a productive core. Never consume the observed SAM quote.
    if(needs.capStalled&&purpose==='City'&&!needs.incomingNukes&&!samFund)floor=0;
    if(!samFund&&!needs.nuclearThreat&&failedEconomyProbes>=5&&
      ['City','Factory'].includes(purpose)&&
      (needs.cities<3||needs.factories<3)&&
      (needs.saveForSilo||needs.saveForNuke))floor=0;
    // Do not spend the known price of the first productive building on
    // ships, nukes or donations. This never blocks actual emergency defense.
    const productive=purpose==='City'||purpose==='Factory';
    const urgent=purpose==='Defense Post'||
      purpose==='SAM Launcher'&&needs.samFundingUrgent||
      emergency&&purpose==='Warship';
    // Unknown prices are never invented. Preserve unrelated legal actions
    // until the worker supplies a real price, then protect that quote.
    if(core.missing.length&&!productive&&!urgent&&core.needed!==null)
      floor=Math.max(floor,core.needed);
    if(cash-pending-cost>=floor)return true;
    reportGoldBudgetBlocked(tick,purpose,
      {purpose,cost,cash,pending,floor,samFund,emergency});
    return false;
  }
  function commitGoldSpend(me,cost,purpose){
    if(game.config().infiniteGold?.()===true)return;
    budgetCommitments.push({tick:number(()=>game.ticks(),0),
      startGold:goldAmount(me),cost,purpose});
  }
  function economicAnchors(me,tiles,units,tick) {
    const w=game.width(),h=game.height(),anchors=[],seen=new Set();
    const add=ref=>{
      if(anchors.length>=190 || !Number.isInteger(ref)||seen.has(ref))return;
      seen.add(ref);
      if(ownedTile(ref,me))anchors.push(ref);
    };
    const addXY=(x,y)=>{if(x>=0&&y>=0&&x<w&&y<h)add(game.ref(x,y));};
    // Reserve early worker probes for SAMs around uncovered structures.
    // This must happen BEFORE interior/front samples fill the anchor cap.
    if(opts.antiNuke){
      const intel=nuclearIntel(me,units);
      for(const u of intel.uncovered.slice(0,8)){
        const t=number(()=>u.tile(),NaN);
        if(!Number.isInteger(t))continue;
        const x=game.x(t),y=game.y(t);
        for(const [dx,dy] of [[0,0],[25,0],[-25,0],[0,25],[0,-25],
          [45,0],[-45,0],[0,45],[0,-45],[25,25],[-25,-25]])
          addXY(x+dx,y+dy);
      }
    }
    // City/factory upgrades are anchored at existing units; relying on border
    // offsets makes these upgrades almost impossible on large maps.
    for(const u of units){const t=number(()=>u.tile(),NaN);if(!Number.isInteger(t))continue;
      add(t);const x=game.x(t),y=game.y(t);
      for(const [dx,dy] of [[18,0],[-18,0],[0,18],[0,-18],[40,0],[-40,0],[0,40],[0,-40]])addXY(x+dx,y+dy);
      if(anchors.length>=120)break;
    }
    const spawn=me.state?.spawnTile;
    if(Number.isInteger(spawn)){
      const sx=game.x(spawn),sy=game.y(spawn);add(spawn);
      for(const [dx,dy] of [[0,0],[20,0],[-20,0],[0,20],[0,-20],[50,0],[-50,0],[0,50],[0,-50],[80,0],[-80,0],[0,80],[0,-80]])addXY(sx+dx,sy+dy);
    }
    // Sample ALL owned regions, including the interior of a giant country.
    const spacing=Math.max(18,Math.ceil(Math.sqrt(w*h/750)));
    const phase=Math.floor(tick/90)%3;
    for(let y=Math.floor(spacing/2)+phase*3;y<h&&anchors.length<145;y+=spacing)
      for(let x=Math.floor(spacing/2)+phase*3;x<w&&anchors.length<145;x+=spacing)addXY(x,y);
    // Frontline anchors for defensive posts/ports; do not let them crowd out core tiles.
    if(tiles?.length){const step=Math.max(1,Math.floor(tiles.length/55));
      const offset=Math.floor(tick/90)%step;
      for(let i=offset;i<tiles.length&&anchors.length<190;i+=step){const t=tiles[i],x=game.x(t),y=game.y(t);
        add(t);for(const [dx,dy] of [[0,0],[15,0],[-15,0],[0,15],[0,-15],[38,0],[-38,0],[0,38],[0,-38]])addXY(x+dx,y+dy);
      }
    }
    return anchors;
  }
  function frontDistance(ref,fronts) {
    if(!fronts.length)return Infinity;
    const x=game.x(ref),y=game.y(ref);let closest=Infinity;
    for(const t of fronts){const dx=x-game.x(t),dy=y-game.y(t);
      const d=dx*dx+dy*dy;if(d<closest)closest=d;
    }
    return Math.sqrt(closest);
  }
  function shoreNear(ref) {
    if(typeof game.isShore!=='function')return false;
    const x=game.x(ref),y=game.y(ref),w=game.width(),h=game.height();
    for(const [dx,dy] of [[0,0],[8,0],[-8,0],[0,8],[0,-8],[15,0],[-15,0],[0,15],[0,-15]]){
      if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;
      try{if(game.isShore(game.ref(x+dx,y+dy)))return true;}catch(_){}
    }
    return false;
  }
  // The browser GameView does not expose the server's RailNetwork.findStationsPath.
  // Probe ownership/terrain along bounded potential corridors instead of
  // assuming that every station within maxRange can actually connect.
  function railCorridor(from,to){
    const ax=game.x(from),ay=game.y(from),bx=game.x(to),by=game.y(to),
      dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
    if(len<1)return 1;
    const steps=Math.min(140,Math.max(4,Math.ceil(len/2)));
    const pass=(x,y)=>{
      const xx=Math.round(x),yy=Math.round(y);
      if(typeof game.isValidCoord==='function'&&!game.isValidCoord(xx,yy))
        return false;
      if(xx<0||yy<0||xx>=game.width()||yy>=game.height())return false;
      const tile=game.ref(xx,yy);
      return ownedTile(tile,myPlayer())&&game.isLand?.(tile)!==false &&
        game.isImpassable?.(tile)!==true;
    };
    let best=0;
    // Try direct path and two mild bends; this is NOT a verified rail route.
    for(const bend of [0,.12,-.12]){
      let passed=0,longest=0,run=0;
      for(let i=0;i<=steps;i++){
        const t=i/steps,offset=bend*Math.sin(Math.PI*t);
        const x=ax+dx*t-dy*offset,y=ay+dy*t+dx*offset;
        if(pass(x,y)){passed++;run++;longest=Math.max(longest,run);}
        else run=0;
      }
      best=Math.max(best,(passed/(steps+1))*.35+
        (longest/(steps+1))*.65);
    }
    return best;
  }
  function railStationScore(ref,units){
    const cfg=game.config(),min=number(()=>cfg.trainStationMinRange?.(),12);
    const max=number(()=>cfg.trainStationMaxRange?.(),110);
    const x=game.x(ref),y=game.y(ref);
    const stations=units.filter(u=>['City','Factory','Port'].includes(u.type?.()) &&
      !u.isUnderConstruction?.() && u.hasTrainStation?.()!==false);
    let reachable=0,tooClose=0,blocked=0;
    for(const u of stations){
      const tile=number(()=>u.tile(),-1);
      if(tile<0)continue;
      const d=Math.hypot(x-game.x(tile),y-game.y(tile));
      if(d>=min&&d<=max){
        const likelihood=railCorridor(ref,tile);
        if(likelihood>=.83)reachable++;
        else blocked++;
      }
      if(d<min)tooClose++;
    }
    return {reachable,blocked,method:'owned-corridor-proxy',
      score:Math.min(40,reachable*15)-tooClose*30-blocked*7-
        (stations.length>1&&reachable===0?25:0)};
  }
  function siteScore(type,ref,fronts,units,priority,alreadyCoastal,precomputedDist) {
    const distance=precomputedDist===undefined?frontDistance(ref,fronts):precomputedDist;
    const coast=alreadyCoastal ?? shoreNear(ref);
    if(type==='Port'&&!coast)return -Infinity;
    let value=priority;
    if(type==='Defense Post'){
      const range=number(()=>game.config().defensePostRange?.(),30);
      // A post must finish construction BEHIND the frontier while still
      // protecting it. With an incoming attack, move the safe band deeper.
      const lost=armyTrend(number(()=>game.ticks(),0))?.tiles||0;
      const standoff=range*(troopSnapshot.incoming>0?.78:.65)+
        (opts.impossibleExperiment&&lost< -100?range*.08:0);
      if(fronts.length && (distance<standoff || distance>range-2))return -Infinity;
      if(!fronts.length)value-=75;
      else {
        let covered=0,uncovered=0;
        const x=game.x(ref),y=game.y(ref);
        const posts=units.filter(u=>u.type?.()==='Defense Post'&&!u.isUnderConstruction?.());
        for(const ft of fronts){const fx=game.x(ft),fy=game.y(ft);
          if((fx-x)**2+(fy-y)**2>(range-2)**2)continue;
          if(posts.some(p=>{const px=game.x(p.tile()),py=game.y(p.tile());
            return (fx-px)**2+(fy-py)**2<=range**2;}))covered++;
          else uncovered++;
        }
        value+=Math.min(95,uncovered*8)+Math.min(12,covered)-Math.abs(distance-range*.86)*1.4;
        if(uncovered===0)value-=75;
      }
    }
    else if(type==='SAM Launcher'){
      // SAMs belong near protected assets, but not where an advancing army
      // can capture them before the launcher is finished.
      if(fronts.length && distance<Math.max(34,number(()=>game.config().samRange?.(1),70)*.52))return -Infinity;
      const intel=nuclearIntel(myPlayer(),units);
      const coverage=samCoverageValue(ref,units,intel);
      if(intel.uncovered.length && coverage<=0)return -Infinity;
      value+=coverage*1.8+Math.min(10,distance*.05);
    }
    else {
      const lost=armyTrend(number(()=>game.ticks(),0))?.tiles||0;
      const safety=troopSnapshot.incoming>0||
        (opts.impossibleExperiment&&lost< -100)?36:20;
      if(fronts.length && distance<safety)return -Infinity;
      value+=Number.isFinite(distance)?Math.min(50,distance*.24)-Math.max(0,80-distance)*1.2:30;
      // Repeated zero ship revenue after a completed harbor is not a reason
      // to buy yet another idle harbor ahead of productive core buildings.
      if(type==='Port'&&units.some(u=>u.type?.()==='Port'&&
        !u.isUnderConstruction?.())&&incomeStatus.observed&&
        incomeStatus.trade===0)value-=65;
      if(['City','Factory','Port'].includes(type))value+=railStationScore(ref,units).score;
      if(type==='Factory'){
        // Favor nearby City/Port infrastructure without assuming rail connectivity.
        const hubs=units.filter(u=>['City','Port'].includes(u.type?.()) &&
          u.isUnderConstruction?.()!==true);
        if(hubs.length){
          const x=game.x(ref),y=game.y(ref);
          const nearest=Math.min(...hubs.map(u=>Math.hypot(x-game.x(u.tile()),y-game.y(u.tile()))));
          value+=nearest>=18&&nearest<=105?22:nearest>160?-20:0;
        }
      }
    }
    const same=units.filter(u=>u.type?.()===type).map(u=>number(()=>u.tile(),-1)).filter(t=>t>=0);
    if(same.length){const x=game.x(ref),y=game.y(ref);
      let nearest=Infinity;
      for(const t of same){const d=Math.hypot(x-game.x(t),y-game.y(t));if(d<nearest)nearest=d;}
      if(nearest<30)value-=33;
      else value+=Math.min(16,nearest*.08);
    }
    return value;
  }
