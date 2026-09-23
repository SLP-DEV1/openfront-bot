  async function economy(me,tick,serial,tiles) {
    if(!opts.economy || (!ctors.build&&!ctors.upgrade))return false;
    const units=ownStructures(me);
    if(pendingEconomy(tick,units))return false;
    if(tick-lastEconomy<35 || tick-lastEconomyProbe<18)return false;
    lastEconomyProbe=tick;
    for(const [k,expiry] of economicBlocked)if(tick>=expiry)economicBlocked.delete(k);
    for(const [k,expiry] of economicNegative)if(tick>=expiry)economicNegative.delete(k);
    const requirements=economicNeeds(me,units,tiles);
    const funding=coreFundingStatus(me,units,tick);
    // Read-only snapshot from the actual economy planner, never recomputed in paint().
    economyBudgetEvidence={tick,gold:requirements.gold,
      capUse:troopSnapshot.max>0?troopSnapshot.home/troopSnapshot.max:null,
      cityWanted:requirements.capStalled||requirements.list.some(x=>x.type==='City'),
      cityCount:requirements.cities,capStalled:requirements.capStalled,
      wantedSAM:requirements.wantedSAM,nuclearThreat:requirements.nuclearThreat,
      samQuote:tick-samQuotedTick<=300&&samQuotedCost>0?samQuotedCost:null,
      portMilestone:requirements.portMilestone,
      portQuote:tick-portQuotedTick<=210&&portQuotedCost>0?portQuotedCost:null,
      goldFloor:requirements.savingsTarget,coreQuote:funding.needed,
      coreRecovery:requirements.coreRecovery,
      semantics:'shared savings target; individual build exceptions still apply'};
    // A cached price saves worker traffic while underfunded; refresh once
    // the price is funded or quotes age. Never assert a legal site from it.
    if(!requirements.immediate&&!requirements.nuclearThreat&&
      funding.missing.length&&funding.needed!==null&&
      requirements.gold<funding.needed&&
      tick-Math.min(...[...coreQuotes.values()].map(q=>q.tick))<130){
      economicStatus='Spare auf ersten Kernbau: '+Math.floor(requirements.gold).toLocaleString()+
        '/'+funding.needed.toLocaleString()+' Gold (Worker-Preis, Standort offen)';
      if(tick-lastCoreFundingReport>=100){
        lastCoreFundingReport=tick;
        telemetry('core_funding_wait',economicStatus,{coreFunding:funding,
          evidence:'price-observed-not-legal-build'});
      }
      return false;
    }
    if(requirements.samSearchBlocked)decisionNote('sam-blockiert',
      'SAM bezahlbar, aber wiederholt kein Bauplatz bestätigt; andere Bauten freigegeben',
      ['Standortsuche wird fortgesetzt; Spielregeln und Platzierung bleiben ungeklärt'],tick);
    investmentAssessments=[];
    const entries=requirements.list;
    if(lastEconomyPosture!==requirements.posture){
      lastEconomyPosture=requirements.posture;
      telemetry('economy_posture','Investitionsziel: '+requirements.posture,
        {posture:requirements.posture,priorities:entries.slice(0,3).map(e=>e.type)});
    }
    // Do not waste worker queries or count failed builds while deliberately
    // accumulating funds for the first silo / first atomic strike.
    if(requirements.savingsTarget>0 && !requirements.coreRecovery &&
      !requirements.immediate && !requirements.nuclearThreat &&
      !requirements.portMilestone && !game.config().infiniteGold?.() &&
      requirements.gold<requirements.savingsTarget){
      economicStatus='Spare: '+investmentStatus+' ('+Math.floor(requirements.gold).toLocaleString()+
        '/'+requirements.savingsTarget.toLocaleString()+' Gold)';
      return false;
    }
    if(!entries.length){economicStatus='Gebäudeziele erreicht · '+investmentStatus;return false;}
    const anchors=economicAnchors(me,tiles,units,tick);
    const coastal=opts.boats&&entries.some(e=>e.type==='Port'&&!e.upgrade)?
      portCoastalAnchors(me,tiles,tick,72):[];
    if(!anchors.length && !coastal.length){
      economicStatus='Kein eigenes Bauland gefunden';
      if(requirements.coreRecovery)telemetry('core_recovery_block',economicStatus,{
        missing:funding.missing,gold:requirements.gold,
        cause:'no-owned-anchor-not-gold',
        evidence:'candidate-search-no-worker-build-receipt'});
      return false;
    }
    const meID=safeID(me),all=game.playerViews?.()||[];
    const fronts=[];
    const borderStride=Math.max(1,Math.floor((tiles?.length||0)/220));
    for(let i=0;i<(tiles?.length||0);i+=borderStride){
      const tile=tiles[i];if(fronts.length>=160)break;
      const scratch=[];const count=game.neighbors4(tile,scratch);
      for(let n=0;n<count;n++){const owner=game.owner(scratch[n]);
        if(safeID(owner)!==null&&safeID(owner)!==meID&&!friendly(owner,me)){
          fronts.push(tile);break;
        }
      }
    }
    // Supplement sparse sampled border cells with observed hostile target
    // tiles; never mistake an arbitrary friendly border for an enemy front.
    for(const group of strategic.groups){
      if(fronts.length>=180)break;
      if(group.id===null || !group.opponent?.isAlive?.()||friendly(group.opponent,me))continue;
      for(const tile of group.tiles||[]){
        if(fronts.length>=180)break;
        if(safeID(game.owner(tile))===safeID(group.opponent))fronts.push(tile);
      }
    }
    const rankedAnchors=anchors.map(ref=>({ref,coast:shoreNear(ref),dist:frontDistance(ref,fronts)}));
    const rankedCoast=coastal.map(ref=>({
      ref,coast:true,dist:frontDistance(ref,fronts)}));
    const siteCache=new Map();
    const score=(entry,site)=>{
      const key=entry.type+':'+site.ref;
      if(!siteCache.has(key))siteCache.set(key,siteScore(entry.type,site.ref,fronts,units,0,site.coast,site.dist));
      return entry.urgency+siteCache.get(key);
    };
    const recovery=failedEconomyProbes>=5;
    const slots=[];
    for(const entry of entries.slice(0,8)){
      if(entry.upgrade && !ctors.upgrade)continue;
      if(!entry.upgrade && !ctors.build)continue;
      // Upgrades must probe existing structures, whereas new buildings probe free land.
      const valid=entry.upgrade?rankedAnchors.filter(a=>units.some(u=>u.type?.()===entry.type && number(()=>u.tile(),-1)===a.ref)):
        entry.type==='Port'?rankedCoast:rankedAnchors;
      valid.sort((a,b)=>score(entry,b)-score(entry,a));
      let ordered=valid;
      if(entry.type==='Port'&&!entry.upgrade&&valid.length>1){
        // Keep the strongest safe harbors AND explore the rest of the coast.
        // The old top-12-only rotation repeatedly tested illegal shore cells.
        const best=valid.slice(0,Math.min(valid.length,4));
        const remainder=valid.slice(best.length);
        const offset=remainder.length?Math.floor(tick/40)*11%remainder.length:0;
        ordered=best.concat(remainder.slice(offset),remainder.slice(0,offset));
        buildCursor=(buildCursor+7)%valid.length;
      }
      for(const site of ordered.slice(0,entry.upgrade?4:
        entry.type==='Port'?recovery?24:18:recovery?12:6))slots.push({entry,site});
    }
    // Probe best geographic options across building types; never sequentially
    // spend the entire time budget on the first City anchor.
    slots.sort((a,b)=>score(b.entry,b.site)-score(a.entry,a.site));
    const seen=new Set(), proposals=[],perKind=new Map();
    const probe={queries:0,errors:0,legal:0,unaffordable:0,invalidSite:0,
      lowestCost:Infinity,quoteByType:{},underfundedByType:{},workerNoOfferByType:{},
      budgetRejected:0,siteRejected:0,priorityRejected:0,
      lowestCore:Infinity,portQueries:0,portLegal:0,samQueries:0,
      samLegal:0,samUnaffordable:0,samUnsafe:0,samNoWorkerBuild:0,
      samSites:0};
    const work=[];
    // A dozen City anchors must not evict every Factory / SAM / silo query.
    for(const slot of slots){
      if(work.length>=(recovery?30:21))break;
      const kind=slot.entry.type+':'+!!slot.entry.upgrade;
      if((perKind.get(kind)||0)>(slot.entry.type==='Port'?(recovery?15:10):(recovery?5:3)))continue;
      const key=kind+':'+slot.site.ref;
      if(seen.has(key)||(economicNegative.get(key)??0)>tick)continue;
      seen.add(key);work.push(slot);
      perKind.set(kind,(perKind.get(kind)||0)+1);
    }
    // Keep an independent rotation of safe SAM sites, including sites that
    // never appear in generic inland probes or their short negative cache.
    const samEntry=entries.find(x=>x.type==='SAM Launcher'&&!x.upgrade);
    if(samEntry&&requirements.intel.uncovered.length){
      const samRefs=samBuildAnchors(me,requirements.intel,tick);
      probe.samSites=samRefs.length;
      const ranked=samRefs.map(ref=>({ref,coast:shoreNear(ref),dist:frontDistance(ref,fronts)}))
        .filter(site=>Number.isFinite(score(samEntry,site)))
        .sort((a,b)=>score(samEntry,b)-score(samEntry,a));
      const top=ranked.slice(0,6),remainder=ranked.slice(6);
      const offset=remainder.length?Math.floor(tick/40)*13%remainder.length:0;
      const rotated=top.concat(remainder.slice(offset),remainder.slice(0,offset));
      const extra=[];
      for(const site of rotated){
        if(extra.length>=18)break;
        const key='SAM Launcher:false:'+site.ref;
        if((economicNegative.get(key)??0)>tick ||
          work.some(x=>x.entry.type==='SAM Launcher'&&!x.entry.upgrade&&x.site.ref===site.ref))continue;
        extra.push({entry:samEntry,site});
      }
      work.unshift(...extra);
    }
    // Nuclear emergency and immediate land defense have their own lane.
    // Never discard legal SAM/defense candidates merely because the first
    // harbor also has high priority. Harbor-only probes apply only when safe.
    const urgentSAM=requirements.nuclearThreat&&requirements.wantedSAM>0&&
      requirements.intel.uncovered.length>0;
    const urgentLand=requirements.immediate&&requirements.wantedDefense>0;
    if(requirements.capStalled&&!requirements.firstPortWindow&&!urgentSAM&&!urgentLand){
      // The worker loop stops as soon as any legal proposal appears.
      // Without a City-first probe, a cheaper Port can win before a legal
      // capacity-building City is ever examined.
      const citySlots=slots.filter(x=>x.entry.type==='City'&&
        (economicNegative.get(x.entry.type+':'+!!x.entry.upgrade+':'+x.site.ref)??0)<=tick);
      const cityWork=work.filter(x=>x.entry.type==='City');
      if(!cityWork.length&&citySlots.length)
        work.unshift(...citySlots.slice(0,Math.min(3,citySlots.length)));
      work.sort((a,b)=>(b.entry.type==='City'?1:0)-
        (a.entry.type==='City'?1:0));
    }
    if(requirements.firstPortWindow&&!urgentSAM&&!urgentLand){
      const portWork=work.filter(x=>x.entry.type==='Port'&&!x.entry.upgrade);
      if(portWork.length)work.splice(0,work.length,...portWork,
        ...work.filter(x=>x.entry.type!=='Port'||x.entry.upgrade));
    }
    if(requirements.firstPortWindow && !urgentSAM && !urgentLand && coastal.length &&
      !work.some(x=>x.entry.type==='Port'&&!x.entry.upgrade)){
      const portEntry=entries.find(x=>x.type==='Port'&&!x.upgrade);
      const portSite=portEntry&&rankedCoast.filter(x=>
        (economicNegative.get('Port:false:'+x.ref)??0)<=tick)
        .sort((a,b)=>score(portEntry,b)-score(portEntry,a))[0];
      if(portSite)work.unshift({entry:portEntry,site:portSite});
    }
    // Worker probes stay bounded; record individual negative site/type checks.
    for(let offset=0;offset<work.length;offset+=3){
      if(!live(serial))return false;
      const batch=work.slice(offset,offset+3);
      const answers=await Promise.all(batch.map(async slot=>{
        runtime.buildProbes++;probe.queries++;
        if(slot.entry.type==='Port')probe.portQueries++;
        if(slot.entry.type==='SAM Launcher')probe.samQueries++;
        try{return {slot,legal:await me.actions(slot.site.ref,[slot.entry.type])};}
        catch(_){probe.errors++;return {slot,legal:null};}
      }));
      if(!live(serial))return false;
      for(const {slot,legal} of answers){
        if(!legal)continue;
        const {entry,site}=slot;
        // The worker supplies a price even when insufficient gold makes
        // canBuild false. Read it BEFORE testing legality; price is not a
        // build authorization, and an upgrade quote is not a new-site price.
        const quote=legal.buildableUnits?.find(u=>u.type===entry.type);
        const quoted=Number(quote?.cost);
        if(!quote)probe.workerNoOfferByType[entry.type]=
          (probe.workerNoOfferByType[entry.type]||0)+1;
        const funds=goldAmount(me);
        if(['City','Factory'].includes(entry.type)&&!entry.upgrade&&
          Number.isFinite(quoted)&&quoted>0){
          const old=probe.quoteByType[entry.type];
          probe.quoteByType[entry.type]=Math.min(old??Infinity,quoted);
          probe.lowestCore=Math.min(probe.lowestCore,quoted);
          const existing=coreQuotes.get(entry.type);
          if(!existing||quoted<=existing.cost||tick-existing.tick>=90)
            coreQuotes.set(entry.type,{cost:quoted,tick});
        }
        const priceBlocked=!game.config().infiniteGold?.()&&Number.isFinite(quoted)&&quoted>funds;
        if(!entry.upgrade&&Number.isFinite(quoted)&&quoted>0){
          if(entry.type==='SAM Launcher'){
            samQuotedCost=quoted;samQuotedTick=tick;
            if(priceBlocked)samAffordableFailureSince=null;
            else if(Number.isInteger(quote.canBuild))samAffordableFailureSince=null;
            else if(samAffordableFailureSince===null)samAffordableFailureSince=tick;
            if(requirements.nuclearThreat&&!requirements.samSearchBlocked)
              requirements.savingsTarget=quoted;
          }
          if(entry.type==='Port'&&requirements.portMilestone){
            portQuotedCost=quoted;portQuotedTick=tick;
          }
        }
        if(priceBlocked){
          probe.underfundedByType[entry.type]=
            (probe.underfundedByType[entry.type]||0)+1;
          probe.unaffordable++;
          if(entry.type==='SAM Launcher')probe.samUnaffordable++;
          probe.lowestCost=Math.min(probe.lowestCost,quoted);
          // Low funds are not an invalid site: retry immediately when funded.
          continue;
        }
        if(entry.type==='SAM Launcher' && !legal.buildableUnits?.some(u=>
          u.type==='SAM Launcher'&&Number.isInteger(u.canBuild)))probe.samNoWorkerBuild++;
        if(entry.type!=='Port' && !legal.buildableUnits?.some(u=>u.type===entry.type &&
          (entry.upgrade?u.canUpgrade!==false&&u.canUpgrade!==undefined:
            Number.isInteger(u.canBuild)))){
          const key=entry.type+':'+!!entry.upgrade+':'+site.ref;
          if(economicNegative.size>500)economicNegative.clear();
          economicNegative.set(key,tick+100);
        }
        for(const item of entries.slice(0,8)){
          // The answer belongs to THIS build/upgrade candidate only; otherwise
          // low-priority buildings steal time and sites from high-priority ones.
          if(item!==slot.entry)continue;
          const b=legal?.buildableUnits?.find(u=>u.type===item.type);
          if(!b)continue;
          const isUpgrade=!!item.upgrade;
          if(isUpgrade&&!ctors.upgrade || !isUpgrade&&!ctors.build)continue;
          if(isUpgrade ? (b.canUpgrade===false || b.canUpgrade===undefined) : (b.canBuild===false || (b.canUpgrade!==false && b.canUpgrade!==undefined)))continue;
          probe.legal++;
          if(item.type==='Port')probe.portLegal++;
          if(item.type==='SAM Launcher')probe.samLegal++;
          const tile=isUpgrade?site.ref:b.canBuild;
          if(!Number.isInteger(tile) || !ownedTile(tile,me)){
            probe.invalidSite++;probe.siteRejected++;continue;
          }
          const key=(isUpgrade?'upgrade':'build')+':'+item.type+':'+tile;
          if((economicBlocked.get(key)??0)>tick)continue;
          const cost=Number(isUpgrade?(b.upgradeCosts?.[0]??b.cost):b.cost);
          const gold=goldAmount(me);
          const infinite=game.config().infiniteGold?.()===true;
          if(Number.isFinite(cost))probe.lowestCost=Math.min(probe.lowestCost,cost);
          if(Number.isFinite(cost)&&cost>0){
            if(item.type==='SAM Launcher'&&!isUpgrade){
              samQuotedCost=cost;samQuotedTick=tick;
            }
            if(item.type==='Port'&&!isUpgrade&&requirements.portMilestone){
              portQuotedCost=cost;portQuotedTick=tick;
            }
          }
          if(!infinite && (!Number.isFinite(cost)||cost>gold)){
            probe.unaffordable++;
            if(item.type==='SAM Launcher')probe.samUnaffordable++;
            continue;
          }
          const essential=(item.type==='City'&&requirements.cities===0)||
            (item.type==='Factory'&&requirements.factories===0)||
            (item.type==='Defense Post'&&requirements.immediate)||
            (item.type==='SAM Launcher'&&requirements.nuclearThreat)||
            (item.type==='Missile Silo'&&opts.nukes&&lateGame(me));
          const economicCore=item.type==='City'||item.type==='Factory';
          // Fund the first economic structures before buying defensive posts,
          // ports or upgrades. Emergency SAM / defense remain possible.
          if(requirements.startup && (!economicCore || isUpgrade) && !essential)continue;
          if(requirements.firstPortWindow&&!requirements.immediate&&
            probe.portLegal>0 && item.type!=='Port' &&
            !(item.type==='SAM Launcher'&&requirements.nuclearThreat))
            continue;
          if(item.type==='Defense Post' && !requirements.immediate &&
            !requirements.incomingNukes && requirements.basic)continue;
          // While saving for a silo / first atomic strike, do not repeatedly
          // spend the whole treasury on expandable city/factory goals.
          if(!infinite && requirements.savingsTarget>0 && !requirements.immediate &&
            !(item.type==='SAM Launcher'&&requirements.nuclearThreat) &&
            !(item.type==='Defense Post'&&requirements.immediate) &&
            !(item.type==='Missile Silo'&&requirements.saveForSilo&&!requirements.nuclearThreat) &&
            !(item.type==='Port'&&requirements.portMilestone&&!requirements.nuclearThreat) &&
            // After fully funding the first harbor, no worker-offered Port
            // should stall all other productive buildings this cycle.
            !(requirements.portMilestone&&!hardMode()&&!requirements.nuclearThreat&&
              probe.portQueries>0&&probe.portLegal===0&&
              gold>=requirements.savingsTarget) &&
            gold-cost<requirements.savingsTarget){probe.budgetRejected++;continue;}
          const reserve=gold>650000?Math.min(220000,gold*.12):0;
          if(!infinite&&!essential&&
            !(requirements.capStalled&&item.type==='City'&&!requirements.incomingNukes)&&
            gold-cost<reserve){probe.budgetRejected++;continue;}
          let siteValue=siteScore(item.type,tile,fronts,units,item.urgency);
          if(!Number.isFinite(siteValue)){
            if(item.type==='SAM Launcher')probe.samUnsafe++;
            continue;
          }
          if(!infinite && gold>0)siteValue-=Math.min(36,(cost/gold)*26);
          const assessment=investmentAssessment(item,cost,requirements,units);
          siteValue+=assessment.score;
          if(isUpgrade)siteValue-=Math.max(0,number(()=>units.find(u=>u.id?.()===b.canUpgrade)?.level(),1)-2)*6;
          if(!isUpgrade && item.count>=item.desired)continue;
          const old=units.find(u=>u.id?.()===b.canUpgrade);
          proposals.push({kind:isUpgrade?'upgrade':'build',type:item.type,tile,requestTile:site.ref,
            unitId:b.canUpgrade,level:number(()=>old?.level(),0),cost,siteValue,assessment});
          if(!investmentAssessments.some(x=>x.type===assessment.type&&x.cost===assessment.cost))
            investmentAssessments.push(assessment);
        }
      }
      if(proposals.length)break;
    }
    if(!proposals.length){
      // Waiting for a documented price is not a worker/site failure.
      const underfundedCore=(probe.quoteByType.City!==undefined||
        probe.quoteByType.Factory!==undefined)&&
        probe.legal===0&&probe.errors===0&&
        probe.unaffordable===probe.queries;
      if(!underfundedCore)failedEconomyProbes++;
      else lastCoreFundingReport=tick;

      if(requirements.wantedSAM>0&&requirements.intel.uncovered.length&&
        (failedEconomyProbes===1||failedEconomyProbes%4===0))
        telemetry('sam_probe','SAM-Standorte / Budget geprüft',
          {enemySilos:requirements.enemySilos,uncovered:requirements.intel.uncovered.length,
            alliedUncovered:requirements.intel.allyUncovered.length,
            candidates:probe.samSites,queries:probe.samQueries,legal:probe.samLegal,
            unaffordable:probe.samUnaffordable,unsafe:probe.samUnsafe,
            unavailable:probe.samNoWorkerBuild,gold:requirements.gold,
            workerNoOfferCause:probe.samUnaffordable?'insufficient-gold':
              probe.samNoWorkerBuild?'unresolved: game rules or location':null,
            unitDisabled:game.config().isUnitDisabled?.('SAM Launcher')===true,
            quotedCost:samQuotedCost,lowestCost:Number.isFinite(probe.lowestCost)?probe.lowestCost:null});
      if(requirements.portMilestone && probe.portQueries>0 &&
        probe.portLegal===0 && (hardMode() || game.config().infiniteGold?.()||
          requirements.gold>=requirements.portQuotedCost&&requirements.portQuotedCost>0 ||
          requirements.gold>=500000)){
        portProbeFailures++;
        if(portProbeFailures===8)lastPortRetryTick=tick;
      }
      if(requirements.portMilestone && probe.portQueries>0 &&
        (portProbeFailures===1||portProbeFailures===4||portProbeFailures===8))
        telemetry('port_probe','Hafen-Bauplätze im Worker geprüft',
          {coastCandidates:coastal.length,queries:probe.portQueries,
            legal:probe.portLegal,unaffordable:probe.unaffordable,
            fundingEstimate:requirements.portQuotedCost||500000,
            fundingUncertain:requirements.portQuotedCost===0,
            failures:portProbeFailures});
      const lastPrice=coreFundingStatus(me,units,tick);
      lastEconomyProbeReport={tick,gold:requirements.gold,
        queries:probe.queries,workerErrors:probe.errors,legal:probe.legal,
        coreFunding:lastPrice,quoteByType:probe.quoteByType,
        underfundedByType:probe.underfundedByType,
        workerNoOfferByType:probe.workerNoOfferByType,
        budgetRejected:probe.budgetRejected,siteRejected:probe.siteRejected,
        invalidSite:probe.invalidSite,priorityRejected:probe.priorityRejected,
        lowestCost:Number.isFinite(probe.lowestCost)?probe.lowestCost:null};
      const reason=probe.samUnaffordable>0&&requirements.nuclearThreat?
        'Spare auf SAM: '+samQuotedCost.toLocaleString()+' Gold':probe.unaffordable>0&&probe.legal===0?
        'Gold für Bauoption fehlt; Standort noch ungeprüft':probe.invalidSite>0?
        'Bauplatz-Eigentum/Referenz ungültig':probe.legal===0?
        'Keine legalen Bauoptionen im geprüften Gebiet':'Baukandidaten durch Priorität oder Reserve gesperrt';
      economicStatus=underfundedCore&&lastPrice.needed!==null?
        'Spare auf ersten Kernbau: '+requirements.gold.toLocaleString()+
        '/'+lastPrice.needed.toLocaleString()+' Gold (Standort noch unbestätigt)':reason;
      if(underfundedCore || failedEconomyProbes===5 || failedEconomyProbes%10===0)
        telemetry('build_stalled',reason,{attempts:failedEconomyProbes,
          probe: lastEconomyProbeReport,
          gold:requirements.gold,investment:investmentStatus,priorities:entries.slice(0,4).map(e=>e.type),
          nuclear:{enemySilos:requirements.enemySilos,incomingNukes:requirements.incomingNukes,
            uncovered:requirements.intel.uncovered.length,
            alliedUncovered:requirements.intel.allyUncovered.length,
            wantedSAM:requirements.wantedSAM,
            proactiveSAM:requirements.proactiveSAM},
          queries:probe.queries,workerErrors:probe.errors,legal:probe.legal,
          port:{coastCandidates:coastal.length,queries:probe.portQueries,
            legal:probe.portLegal,failures:portProbeFailures,
            quotedCost:portQuotedCost},
          sam:{candidates:probe.samSites,queries:probe.samQueries,
            legal:probe.samLegal,unaffordable:probe.samUnaffordable,
            unsafe:probe.samUnsafe,unavailable:probe.samNoWorkerBuild,
            workerNoOfferCause:probe.samUnaffordable?'insufficient-gold':
              probe.samNoWorkerBuild?'unresolved: game rules or location':null,
            unitDisabled:game.config().isUnitDisabled?.('SAM Launcher')===true,
            quotedCost:samQuotedCost},
          unaffordable:probe.unaffordable,invalidSite:probe.invalidSite,
          lowestCost:Number.isFinite(probe.lowestCost)?probe.lowestCost:null});
      economicLastPlan=entries.slice(0,3).map(x=>x.type).join(' › ');return false;}
    // Economy has its own async scheduler. Its action ranking must use the
    // currently observed army, not a potentially uninitialized combat tick.
    const rankingMilitary=military(me,strategic.groups);
    for(const item of proposals){
      item.baseScore=item.siteValue;
      item.neuralDelta=neuralActionDelta('economy',item.siteValue,me,rankingMilitary,{
        type:item.type,
        magnitude:clamp((STRUCTURE_TYPES.indexOf(item.type)+1)/STRUCTURE_TYPES.length,0,1),
        opportunity:clamp(item.siteValue/150,0,1),
        cost:clamp(item.cost/Math.max(1,goldAmount(me)),0,1),
        risk:item.kind==='upgrade'?0.25:0
      });
      item.siteValue+=item.neuralDelta;
    }
    proposals.sort((a,b)=>b.siteValue-a.siteValue);
    // Near the troop cap, prioritize a worker-confirmed City or City upgrade,
    // not a Factory; the legal site, cost and invasion vetoes still apply.
    const urgentSAMChoice=requirements.nuclearThreat&&
      requirements.wantedSAM>0&&requirements.intel.uncovered.length>0?
      proposals.find(x=>x.type==='SAM Launcher'):null;
    const legalFirstPort=!urgentSAMChoice&&requirements.firstPortWindow?
      proposals.find(x=>x.type==='Port'&&x.kind==='build'):null;
    const capCity=requirements.capStalled&&!requirements.incomingNukes&&
      !urgentSAMChoice&&!legalFirstPort?
      proposals.find(x=>x.type==='City'&&x.kind==='upgrade')||
      proposals.find(x=>x.type==='City'):null;
    const chosen=urgentSAMChoice||legalFirstPort||capCity||proposals[0];
    const withoutPolicy=[...proposals].sort((a,b)=>
      (b.baseScore-(requirements.policyBiases[b.type]||0))-
      (a.baseScore-(requirements.policyBiases[a.type]||0)))[0];
    neuralDecisionEvidence={tick,kind:'economy',
      model:neuralModelInfo(),headBiasByType:requirements.policyBiases,
      ruleChoice:withoutPolicy?{type:withoutPolicy.type,
        score:withoutPolicy.baseScore-(requirements.policyBiases[withoutPolicy.type]||0)}:null,
      policyChoice:{type:chosen.type,score:chosen.baseScore},
      actionDelta:chosen.neuralDelta,
      finalScore:chosen.siteValue,
      changedChoice:!!withoutPolicy&&withoutPolicy!==chosen,
      evidence:'ranking-only-worker-legality-preserved'};
    lastEconomyProbeReport={tick,gold:requirements.gold,
      queries:probe.queries,workerErrors:probe.errors,legal:probe.legal,
      quoteByType:probe.quoteByType,underfundedByType:probe.underfundedByType,
      workerNoOfferByType:probe.workerNoOfferByType,
      budgetRejected:probe.budgetRejected,siteRejected:probe.siteRejected,
      priorityRejected:probe.priorityRejected,
      lowestCost:Number.isFinite(probe.lowestCost)?probe.lowestCost:null,
      selected:chosen.type,coreFunding:coreFundingStatus(me,units,tick)};
    if(!live(serial))return false;
    // Revalidate the *selected* worker option after the async site scan.
    // A candidate may have lost its tile, upgrade ID or price meanwhile.
    const freshTick=number(()=>game.ticks(),tick);
    if(freshTick<tick||freshTick-tick>12){
      telemetry('build_stale_skip','Bauplan zu alt; frischen Worker-Zustand abwarten',
        {type:chosen.type,plannedTick:tick,freshTick});return false;
    }
    const currentMilitary=military(me,strategic.groups);
    if(economicDefensePressure(me,currentMilitary)&&
      !['Defense Post','SAM Launcher'].includes(chosen.type)){
      telemetry('build_crisis_skip','Wirtschaftsbau wegen aktuellem Angriff zurückgestellt',
        {type:chosen.type,incoming:currentMilitary.incoming,home:currentMilitary.home});
      return false;
    }
    const liveNeeds=economicNeeds(me,ownStructures(me),tiles);
    if(chosen.type!=='SAM Launcher'&&chosen.type!=='Defense Post'&&
      liveNeeds.nuclearThreat&&liveNeeds.wantedSAM>0&&liveNeeds.intel.uncovered.length>0&&
      !requirements.nuclearThreat){
      telemetry('build_stale_skip','Neue Nuklearbedrohung: Bau neu priorisieren',
        {type:chosen.type,plannedTick:tick,freshTick});return false;
    }
    let verified;
    try{verified=await me.actions(chosen.requestTile,[chosen.type]);}
    catch(e){telemetry('build_stale_skip','Worker-Verifikation fehlgeschlagen',
      {type:chosen.type,error:String(e?.message||e).slice(0,90)});return false;}
    if(!live(serial)||number(()=>game.ticks(),tick)-tick>12)return false;
    const finalMilitary=military(me,strategic.groups);
    if(economicDefensePressure(me,finalMilitary)&&
      !['Defense Post','SAM Launcher'].includes(chosen.type)){
      telemetry('build_crisis_skip','Angriff waehrend finaler Worker-Pruefung',
        {type:chosen.type,incoming:finalMilitary.incoming,home:finalMilitary.home});
      return false;
    }
    const worker=verified?.buildableUnits?.find(x=>x.type===chosen.type);
    const isUpgrade=chosen.kind==='upgrade';
    const freshCost=Number(isUpgrade?(worker?.upgradeCosts?.[0]??worker?.cost):worker?.cost);
    const actualTile=isUpgrade?chosen.requestTile:worker?.canBuild;
    const validWorker=worker&&(isUpgrade?
      worker.canUpgrade!==false&&worker.canUpgrade!==undefined&&
        worker.canUpgrade===chosen.unitId:
      Number.isInteger(worker.canBuild)&&
        (worker.canUpgrade===false||worker.canUpgrade===undefined));
    if(!validWorker||!Number.isFinite(freshCost)||freshCost<0||
      actualTile!==chosen.tile||!ownedTile(chosen.tile,me)){
      telemetry('build_stale_skip','Bauplatz, Upgrade oder Preis nicht mehr bestätigt',
        {type:chosen.type,tile:chosen.tile,plannedCost:chosen.cost,freshCost});
      return false;
    }
    chosen.cost=freshCost;
    if(!spendBudget(me,chosen.cost,chosen.type,false,tiles))return false;
    const args=isUpgrade?[chosen.unitId,chosen.type,1]:[chosen.type,chosen.requestTile];
    if(send(chosen.kind,args,`${chosen.kind==='upgrade'?'UPGRADE':'BAU'} ${chosen.type} · ${chosen.cost.toLocaleString()} Gold`)){
      commitGoldSpend(me,chosen.cost,chosen.type);
      economicPending={...chosen,tick,actionId:lastActionId};
      const issued=actionLedger.find(x=>x.actionId===lastActionId);
      if(issued)issued.quotedCost=chosen.cost;
      telemetry('build_quote','Baukosten aus Worker-Angebot',{
        actionId:lastActionId,type:chosen.type,quotedCost:chosen.cost,
        evidence:'worker-quote-not-observed-spending'});
      failedEconomyProbes=0;lastEconomy=tick;lastEconomicAction=tick;
      if(chosen.type==='SAM Launcher')telemetry('sam_intent','SAM-Bau angefordert',
        {tile:chosen.tile,gold:requirements.gold,cost:chosen.cost,
          uncovered:requirements.intel.uncovered.length});
      if(chosen.type==='Port'){
        portProbeFailures=0;
        telemetry('port_intent','Hafenbau angefordert',
          {tile:chosen.tile,gold:requirements.gold,cost:chosen.cost,
            coastCandidates:coastal.length});
      }
      telemetry('neural_economy_choice','Gepruefte Bauoption gewaehlt',
        {actionId:lastActionId,decisionId:monitorSession+':t'+tick,
          kind:chosen.kind,type:chosen.type,baseScore:chosen.baseScore,
          neuralDelta:chosen.neuralDelta,chosenScore:chosen.siteValue,
          neuralDecision:neuralDecisionEvidence});
      economicStatus='Anfrage: '+chosen.type+(chosen.kind==='upgrade'?' (Upgrade)':'');
      economicLastPlan=entries.slice(0,3).map(x=>x.type).join(' › ');
      return true;
    }
    return false;
  }
  // This is deliberately uncached and runs AFTER the async worker check.
  // Sampled ring checks in nukeTargets are only a planning optimization;
  // the final launch gate must cover every tile and allied structure.
  function nukeCollateralSafe(me,tile,kind){
    try{
      const owner=game.owner(tile);
      if(!owner?.isPlayer?.()||friendly(owner,me)||me.isOnSameTeam?.(owner))return false;
      const radius=number(()=>game.config().nukeMagnitudes?.(kind).outer,
        kind==='Hydrogen Bomb'||kind==='MIRV'?100:30)+5;
      const tx=game.x(tile),ty=game.y(tile),r2=radius*radius;
      const width=game.width(),height=game.height();
      if(!Number.isInteger(width)||!Number.isInteger(height)||
        !Number.isFinite(tx)||!Number.isFinite(ty))return false;
      for(const u of game.units()){
        if(!STRUCTURE_TYPES.includes(u.type?.())||!u.isActive?.())continue;
        const p=u.owner?.();
        if(!p?.isPlayer?.()||(!friendly(p,me)&&!me.isOnSameTeam?.(p)))continue;
        const ut=u.tile?.();
        if(!Number.isInteger(ut))return false;
        const dx=tx-game.x(ut),dy=ty-game.y(ut);
        if(dx*dx+dy*dy<=r2)return false;
      }
      for(let y=Math.max(0,Math.ceil(ty-radius));y<=Math.min(height-1,Math.floor(ty+radius));y++)
        for(let x=Math.max(0,Math.ceil(tx-radius));x<=Math.min(width-1,Math.floor(tx+radius));x++){
          const dx=x-tx,dy=y-ty;
          if(dx*dx+dy*dy>r2)continue;
          const p=game.owner(game.ref(x,y));
          if(p?.isPlayer?.()&&(friendly(p,me)||me.isOnSameTeam?.(p)))return false;
        }
      return true;
    }catch(_){return false;}
  }
  // Launcher uses the SAME BuildUnitIntentEvent the game's build menu uses.
  // For nukes, tile is the ENEMY TARGET, not the launching silo location.
  function nukeTargets(me,intel,kind) {
    const radius=number(()=>game.config().nukeMagnitudes?.(kind).outer,
      kind==='Hydrogen Bomb'||kind==='MIRV'?100:30);
    const players=game.playerViews?.().filter(p=>p?.isAlive?.() && safeID(p)!==safeID(me) && !friendly(p,me))||[];
    const targets=new Set();
    for(const u of intel.enemy){const t=number(()=>u.tile?.(),NaN);if(Number.isInteger(t))targets.add(t);}
    for(const p of players){
      const spawn=p.state?.spawnTile;
      if(Number.isInteger(spawn))targets.add(spawn);
      if(targets.size>95)break;
    }
    const ownAssets=intel.protectedUnits;
    const already=(()=>{try{return game.units().filter(u=>safeID(u.owner?.())===safeID(me) &&
      ['Atom Bomb','Hydrogen Bomb','MIRV'].includes(u.type?.()));}catch(_){return [];}})();
    const proposed=[];
    for(const tile of targets){
      if(!game.isValidRef?.(tile) || game.isImpassable?.(tile))continue;
      const owner=game.owner?.(tile);
      if(!owner?.isPlayer?.() || friendly(owner,me))continue;
      const tx=game.x(tile),ty=game.y(tile);
      const distance=u=>Math.hypot(tx-game.x(u.tile()),ty-game.y(u.tile()));
      // Protect own/allied structures and conservatively sample friendly
      // territory within the blast, not only tiles carrying structures.
      if(ownAssets.some(u=>distance(u)<radius+5))continue;
      let collateral=false;
      if(typeof game.isValidCoord==='function'){
        for(const rr of [radius*.5,radius*.88]){
          for(let angle=0;angle<8;angle++){
            const x=Math.round(tx+Math.cos(angle*Math.PI/4)*rr),
              y=Math.round(ty+Math.sin(angle*Math.PI/4)*rr);
            if(!game.isValidCoord(x,y))continue;
            const p=game.owner(game.ref(x,y));
            if(p?.isPlayer?.()&&friendly(p,me)){collateral=true;break;}
          }
          if(collateral)break;
        }
      }
      if(collateral)continue;
      if(already.some(u=>Number.isInteger(u.targetTile?.()) &&
        Math.hypot(tx-game.x(u.targetTile()),ty-game.y(u.targetTile()))<radius*.9))continue;
      if(nukePending && Math.hypot(tx-game.x(nukePending.tile),ty-game.y(nukePending.tile))<radius)continue;
      let value=0,hit=0;
      for(const u of intel.enemy){
        const d=distance(u);
        if(d<radius){value+=assetValue(u.type?.())*(d<radius*.55?1:.55);hit++;}
      }
      const troops=number(()=>owner.troops?.(),0),tiles=Math.max(1,number(()=>owner.numTilesOwned?.(),1));
      value+=Math.min(8,troops/tiles/1000);
      if(plan?.id===safeID(owner))value+=7;
      if(isWar())value+=safeID(owner)===warState.id?18:-9;
      if(kind==='MIRV' && number(()=>owner.numTilesOwned(),0)>
        Math.max(900,number(()=>game.numLandTiles?.(),0)*.30))value+=25;
      if(hit===0)value-=18;
      const sams=intel.enemySAM.filter(s=>distance(s)<number(()=>game.config().samRange(s.level?.()||1),70));
      // Launching blindly into a SAM bubble wastes expensive rockets.
      value-=sams.reduce((sum,u)=>sum+9+number(()=>u.level?.(),1)*2,0);
      if(sams.length && kind==='Hydrogen Bomb')value-=9;
      if(value>=(kind==='Hydrogen Bomb'||kind==='MIRV'?(lateGame(me)?11:13):(lateGame(me)?5:8))-
        neuralChannel('nuclearPriority',me)*3)
        proposed.push({tile,value,hit,sams:sams.length,owner});
    }
    return proposed.sort((a,b)=>b.value-a.value).slice(0,10);
  }
  // Mirror OpenFront PathFinder.Parabola.getParabolaControlPoints:
  // p1/p2 lie at 1/4,3/4 of x and rise max(distance/3,50) in y,
  // clamped to map bounds. The server may choose either rocketDirectionUp,
  // so cover both curves; a trajectory risk is not a certain interception.
  function nukeBezierPoints(spawn,target,up=true){
    const ax=game.x(spawn),ay=game.y(spawn),bx=game.x(target),by=game.y(target),
      dx=bx-ax,dy=by-ay,height=Math.max(Math.hypot(dx,dy)/3,50),
      bound=number(()=>game.height(),Math.max(ay,by)+height+1)-1,
      clampY=y=>Math.min(bound,Math.max(0,y)),sign=up?-1:1;
    return [{x:ax,y:ay},
      {x:ax+dx/4,y:clampY(ay+dy/4+sign*height)},
      {x:ax+dx*3/4,y:clampY(ay+dy*3/4+sign*height)},
      {x:bx,y:by}];
  }
  function nukeBezierPoint(points,t){
    const q=1-t;
    return {x:q*q*q*points[0].x+3*q*q*t*points[1].x+
      3*q*t*t*points[2].x+t*t*t*points[3].x,
      y:q*q*q*points[0].y+3*q*q*t*points[1].y+
      3*q*t*t*points[2].y+t*t*t*points[3].y};
  }
  function nukeTrajectoryRisk(spawn,target,sams){
    if(!Number.isInteger(spawn)||!Number.isInteger(target))return 0;
    const points=[nukeBezierPoints(spawn,target,true),
      nukeBezierPoints(spawn,target,false)];
    const dist=Math.hypot(game.x(target)-game.x(spawn),
      game.y(target)-game.y(spawn));
    const samples=Math.min(160,Math.max(32,Math.ceil(dist/7)));
    return sams.filter(s=>{
      if(s.isActive?.()===false || s.isUnderConstruction?.())return false;
      const x=game.x(s.tile()),y=game.y(s.tile());
      // Tile rounding and the actual engine speed are not a proof of safety:
      // add a small margin, and sample both allowed orientations.
      const rad=number(()=>game.config().samRange(s.level?.()||1),70)+4;
      for(const path of points){
        for(let i=0;i<=samples;i++){
          const p=nukeBezierPoint(path,i/samples);
          if((p.x-x)**2+(p.y-y)**2<=rad*rad)return true;
        }
      }
      return false;
    }).length;
  }
  function rocketReadiness(silos,me){
    const observed=number(()=>me.readyMissileCount?.(),NaN);
    if(Number.isFinite(observed))return Math.max(0,Math.floor(observed));
    return silos.reduce((n,u)=>n+Math.max(0,number(()=>u.level?.(),1)-
      number(()=>u.missileTimerQueue?.().length,0)),0);
  }
  function nukeSalvoPlan(kind,candidate,silos,me,cost,gold,infinite){
    const ready=rocketReadiness(silos,me);
    if(ready<1)return {amount:0,ready};
    if(kind!=='Atom Bomb'||candidate.sams===0||
      candidate.hit<2||candidate.value<20)
      return {amount:1,ready};
    if(ready<2)return {amount:0,ready};
    const x=game.x(candidate.tile),y=game.y(candidate.tile);
    const covering=nuclearIntel(me).enemySAM.filter(u=>{
      const dx=x-game.x(u.tile()),dy=y-game.y(u.tile());
      const r=number(()=>game.config().samRange(u.level?.()||1),70);
      return dx*dx+dy*dy<=r*r;
    });
    const amount=Math.min(6,covering.reduce((n,u)=>
      n+Math.max(1,number(()=>u.level?.(),1)),0)+1);
    const affordable=infinite||gold-cost*amount>=250000;
    return {amount:ready>=amount&&affordable?amount:0,ready};
  }
  function ownMissiles(me) {
    try{return game.units().filter(u=>safeID(u.owner?.())===safeID(me) &&
      ['Atom Bomb','Hydrogen Bomb','MIRV'].includes(u.type?.()));}
    catch(_){return [];}
  }
  function inspectNukeLaunch(me,tick) {
    if(!nukePending)return false;
    const p=nukePending;
    const matches=ownMissiles(me).filter(u=>u.type?.()===p.type && Number.isInteger(u.targetTile?.()) &&
      Math.hypot(game.x(u.targetTile())-game.x(p.tile),game.y(u.targetTile())-game.y(p.tile))<15);
    // An existing missile at the same destination must NOT confirm a second
    // launch. Prefer stable unit IDs, falling back to target-matched counts.
    const unseen=matches.filter(u=>{
      const id=u.id?.();
      return id!==undefined && id!==null && !p.beforeIds.includes(String(id));
    }).length;
    const confirmed=Math.min(p.amount||1,Math.max(unseen,
      matches.length-(p.beforeMatches||0)));
    const added=confirmed-(p.confirmed||0);
    if(added>0){
      nukeShots+=added;p.confirmed=confirmed;
      nukeStatus='Raketenstart bestätigt: '+p.type+' '+confirmed+'/'+(p.amount||1);
      telemetry('nuke_confirmed',nukeStatus,{tile:p.tile,attempt:p.attempt,
        confirmed:nukeShots,partial:confirmed<(p.amount||1)});
      if(confirmed>=(p.amount||1)){nukePending=null;return false;}
      return true;
    }
    if(tick-p.tick>=55){
      nukeUnconfirmed++;
      nukeStatus='Raketenstart NICHT bestätigt – weiter sparen';
      telemetry('nuke_unconfirmed',nukeStatus,{tile:p.tile,type:p.type,attempt:p.attempt});
      nukePending=null;return false;
    }
    return true;
  }
  async function nukeStep() {
    if(nukeBusy||!opts.enabled||!opts.nukes||!connected()||!ctors.build)return;
    const me=myPlayer(),tick=number(()=>game.ticks(),-1);
    if(!me?.isAlive?.()||!me.hasSpawned?.()||game.inSpawnPhase?.()||tick<0)return;
    if(inspectNukeLaunch(me,tick))return;
    if(tick-lastNuke<clamp(65-Math.round(neuralChannel('nuclearPriority',me)*18),45,90) ||
      !actionBudget())return;
    const intel=nuclearIntel(me),silos=ownStructures(me).filter(u=>u.type?.()==='Missile Silo' &&
      !u.isUnderConstruction?.() && !u.isInCooldown?.());
    if(!silos.length){nukeStatus='Kein geladener Silo';return;}
    const gold=goldAmount(me),infinite=game.config().infiniteGold?.()===true;
    // Hold funds for defensive anti-nuke infrastructure unless already rich.
    const choices=['MIRV','Hydrogen Bomb','Atom Bomb'].filter(t=>!game.config().isUnitDisabled?.(t) &&
      (infinite||gold>=(t==='MIRV'?26000000:t==='Hydrogen Bomb'?6400000:1100000)));
    if(!choices.length){nukeStatus='Gold für Raketen sparen';return;}
    nukeBusy=true;const serial=generation;
    try {
      for(const kind of choices){
        const candidates=nukeTargets(me,intel,kind);
        for(const candidate of candidates.slice(0,6)){
          if(!live(serial))return;
          let legal;
          try{legal=await me.actions(candidate.tile,[kind]);}catch(_){continue;}
          if(!live(serial))return;
          const built=legal?.buildableUnits?.find(b=>b.type===kind);
          if(!built||built.canBuild===false||!Number.isInteger(built.canBuild))continue;
          const cost=Number(built.cost);
          if(!infinite&&(!Number.isFinite(cost)||gold-cost<
            (kind==='Hydrogen Bomb'||kind==='MIRV'?800000:250000)))continue;
          const routeRisk=nukeTrajectoryRisk(built.canBuild,candidate.tile,intel.enemySAM);
          if(routeRisk>0 && candidate.sams===0 && kind!=='MIRV')continue;
          const salvo=nukeSalvoPlan(kind,candidate,silos,me,cost,gold,infinite);
          if(salvo.amount<1)continue;
          if(!infinite&&gold-cost*salvo.amount<250000)continue;
          if(!spendBudget(me,cost*salvo.amount,kind))continue;
          // Target may have changed owner while worker checked its legality.
          const o=game.owner(candidate.tile);
          if(!o?.isPlayer?.() || friendly(o,me)||me.isOnSameTeam?.(o))continue;
          if(!nukeCollateralSafe(me,candidate.tile,kind))continue;
          const prior=ownMissiles(me).filter(u=>u.type?.()===kind &&
            Number.isInteger(u.targetTile?.()) &&
            Math.hypot(game.x(u.targetTile())-game.x(candidate.tile),
              game.y(u.targetTile())-game.y(candidate.tile))<15);
          const beforeIds=prior.map(u=>u.id?.()).filter(id=>id!==undefined&&id!==null).map(String);
          const args=salvo.amount>1?[kind,candidate.tile,undefined,salvo.amount]:[kind,candidate.tile];
          if(send('build',args,`NUKE ${kind} x${salvo.amount} → ${nameOf(o)} (${candidate.hit} Gebäude · ${candidate.value.toFixed(0)} Punkte)`)){
            commitGoldSpend(me,cost*salvo.amount,kind);
            lastNuke=tick;nukeAttempts++;
            nukePending={tile:candidate.tile,type:kind,tick,beforeIds,amount:salvo.amount,
              beforeMatches:prior.length,attempt:nukeAttempts};
            telemetry('nuke_attempt','Raketen-Befehl abgesendet, noch nicht bestätigt',
              {tile:candidate.tile,type:kind,attempt:nukeAttempts});
            nukeStatus='Start angefordert: '+kind+' · wartet auf Bestätigung';return;
          }
        }
      }
      nukeStatus='Keine rentable, legale Raketenposition';
    }catch(e){nukeStatus='Raketenplanung: '+String(e.message).slice(0,70);}
    finally{nukeBusy=false;paint();}
  }
  // The live game already holds ACCEPT and DECLINE callbacks on the incoming
  // alliance-request card. Prefer these: they close over the *real* game event
  // constructors, even if production minification hides/merges class names.
  // Never invoke a generic card just because it has buttons: verify requester
  // small ID, the three-button request layout, game ownership and expiry.
  function incomingAllianceCards(tick) {
    const cards=new Map();
    const widget=document.querySelector('actionable-events');
    if(!widget || widget.game!==game || !Array.isArray(widget.events)) return cards;
    for(const e of widget.events) {
      if(!Number.isInteger(e.requestorID) || e.focusID!==e.requestorID ||
        !Array.isArray(e.buttons) || e.buttons.length!==3 ||
        typeof e.buttons[1]?.action!=='function' || typeof e.buttons[2]?.action!=='function' ||
        (Number.isFinite(e.createdAt) && Number.isFinite(e.duration) &&
        tick-e.createdAt>=e.duration))continue;
      const p=game.playerBySmallID?.(e.requestorID);
      if(p?.isAlive?.())cards.set(safeID(p),{player:p,card:e});
    }
    return cards;
  }
  function diplomacyScore(me,p,s,offered=false,incomingOffer=false) {
    if(!p?.isAlive?.() || safeID(p)===safeID(me) || friendly(p,me))
      return {score:-999,reason:'Ungültiger / verbündeter Spieler'};
    if(p.isTraitor?.())return {score:-999,reason:'Verräter'};
    const locked=safeID(p)===warState.id || safeID(p)===plan?.id;
    const their=Math.max(0,number(()=>p.troops()));
    const own=Math.max(1,number(()=>me.troops()));
    const territory=Math.max(0,number(()=>p.numTilesOwned()));
    const mine=Math.max(1,number(()=>me.numTilesOwned()));
    const hostileIncoming=s.inc?.some(a=>
      a.attackerID===p.smallID?.() || attackTargetID(a.attackerID)===safeID(p));
    const hostileOutgoing=s.out?.some(a=>attackTargets(a.targetID,p));
    const tick=number(()=>game.ticks());
    const recent=troopSamples.filter(x=>x.tick<=tick&&tick-x.tick<=300);
    const peak=Math.max(mine,...recent.map(x=>x.tiles));
    const losing=peak-mine>=Math.max(100,peak*.05);
    const pressured=(s.incoming>=own*.10&&their>=own*.75)||
      (losing&&(their>=own*.75||s.strongest>=own))||
      (their>=own*1.25&&territory>=mine);
    // Only an actual incoming offer may override a conflict veto under pressure.
    // Keep the war lock until the alliance is observed as confirmed.
    if(incomingOffer&&(locked||hostileIncoming||hostileOutgoing)&&pressured)
      return {score:95,reason:'Friedensangebot bei militärischem Druck',peace:true};
    if(locked)return {score:-999,reason:'Aktuelles Kriegsziel'};
    if(hostileIncoming||hostileOutgoing)return {score:-999,reason:'Aktiver Konflikt'};
    if(opts.autoStrategy && strategic.mode==='ASSAULT'&&plan?.id===safeID(p))
      return {score:-100,reason:'Aktuelles Angriffsziel'};
    let score=38;
    score+=Math.min(27,Math.log2(1+their/own)*18);
    score+=Math.min(15,Math.log2(1+territory/mine)*10);
    if(s.incoming>own*.12)score+=23;
    if(s.strongest>own*.8)score+=13;
    if(their<own*.22 && s.incoming===0)score-=26;
    if(territory<mine*.15 && s.incoming===0)score-=12;
    // In the opening, ally with useful neighbours instead of inviting a
    // second war; never override conflict, traitor or current-target vetoes.
    if(number(()=>game?.ticks?.(),Infinity)<1100 && their>=own*.45 &&
      territory>=mine*.3 && warState.id!==safeID(p))score+=14;
    if(safeID(p)===plan?.id)score-=70;
    const alliances=number(()=>me.alliances?.().length);
    if(alliances>=3)score-=36;
    if(offered && strategic.mode==='ASSAULT' && their<own*.75)score-=18;
    // Strategic offers can secure a major border before/while fighting a
    // different nation. Never reward alliance with our active war target.
    if(offered && their>=own*.85 && !hostileIncoming && !hostileOutgoing &&
      warState.id!==safeID(p))score+=22;
    score+=neuralChannel('diplomacyPriority',me,s)*28;
    return {score,reason:score>=58?'Schutz/Kooperation nützlich':'Strategischer Nutzen gering'};
  }
  // Diplomacy is a priority channel. The normal minute and attack-burst limits
  // must not prevent a timely reply; a separate 700-ms limiter prevents spam.
  function answerAlliance(me,p,accept,card,tick,reason,tryCount) {
    if(!opts.enabled || !opts.diplomacy || !connected() || !permittedMatch(game) ||
      Date.now()-lastDiplomaticEmit<700)return false;
    const label=nameOf(p),key=accept?'alliance':'reject';
    let path='';
    if(card?.buttons?.[accept?1:2]?.action) {
      try {
        card.buttons[accept?1:2].action();
        actions.push(Date.now());lastEmission=Date.now();totalSent++;
        path='Spiel-UI';
        log('ALLIANZ '+(accept?'ANNAHME':'ABLEHNUNG')+' GESENDET: '+label+' · '+reason+' (Spiel-UI)');
      } catch(e){totalFailed++;log('Allianz-UI antwortet nicht: '+String(e.message));}
    }
    if(!path) {
      if(!ctors[key]) {
        diplomacyStatus='Anfrage von '+label+': keine Antwortaktion gefunden';
        const marker=String(safeID(p));
        if(!diplomacyMissingLogged.has(marker)) {
          diplomacyMissingLogged.add(marker);
          telemetry('alliance_missing_action',diplomacyStatus,
            {availableIntents:Object.keys(ctors),hasUI:!!card});
          console.warn(PREFIX,diplomacyStatus,'(bei fehlendem Konstruktor: actionable-events prüfen)');
        }
        return false;
      }
      if(!send(key,accept?[me,p]:[p],
        'ALLIANZ '+(accept?'ANNAHME':'ABLEHNUNG')+' GESENDET: '+label+' · '+reason+' (Intent)',true))return false;
      path='Intent';
    }
    lastDiplomaticEmit=Date.now();
    diplomacyPending.set(safeID(p),{accept,sentTick:tick,tries:tryCount,
      name:label,reason,path});
    diplomacyStatus=(accept?'Annahme':'Ablehnung')+' gesendet: '+label+' · Bestätigung ausstehend';
    telemetry('alliance_reply_sent',diplomacyStatus,
      {requestor:safeID(p),accept,method:path,tries:tryCount});
    return true;
  }
  function diplomacyTick() {
    try {diplomacyTickSafe();}
    catch(e){diplomacyStatus='Diplomatie-Fehler: '+String(e?.message||e).slice(0,95);
      console.warn(PREFIX,'Diplomatie:',e);
      telemetry('alliance_error',diplomacyStatus);paint();}
  }
  // All outgoing requests (including Duo offers) use a verified engine
  // action first. A trusted official PlayerPanel fallback can emit the
  // event if production minification hides its constructor in bus.listeners.
  function sendAllianceOffer(me,p,label,force=false){
    if(!opts.enabled||!opts.diplomacy||!opts.offerAlliances||
      !connected()||game.config().disableAlliances?.()===true||
      !p?.isAlive?.()||p.isTraitor?.()||
      (friendly(p,me)&&!((duoTrustedPeer()?.id===safeID(p)||
        duoPeerAlly(p))&&!actualFriendly(p,me)))||
      safeID(me)!==safeID(myPlayer()))return false;
    const path=allianceOfferPath();
    if(path==='intent')return send('alliance',[me,p],label,force);
    if(path!=='player-panel')return false;
    const panel=document.querySelector('player-panel');
    if(panel?.g!==game||panel?.eventBus!==bus||
      typeof panel.handleAllianceClick!=='function')return false;
    try{
      panel.handleAllianceClick({stopPropagation(){}},me,p);
      actions.push(Date.now());lastEmission=Date.now();totalSent++;
      log(label+' (offizieller Spielerpanel-Intent)');
      telemetry('alliance_offer_ui_fallback',label,
        {recipient:safeID(p),path:'player-panel'});
      return true;
    }catch(e){
      totalFailed++;
      telemetry('alliance_offer_ui_error',
        'Spielerpanel-Intent: '+String(e?.message||e).slice(0,90));
      return false;
    }
  }
  function diplomacyTickSafe() {
    if(!opts.enabled)return;
    if(!opts.diplomacy){diplomacyStatus='Diplomatie im Menü AUS';return;}
    if(!connected()){diplomacyStatus='Diplomatie wartet auf aktive Partie';return;}
    if(game.config().disableAlliances?.()===true){diplomacyStatus='Allianzen in Spieleinstellungen deaktiviert';return;}
    if(game.inSpawnPhase?.())return;
    const me=myPlayer(),tick=number(()=>game.ticks(),-1);
    if(!me?.hasSpawned?.()||!me?.isAlive?.()||tick<0||tick-lastDiplomacyTick<8)return;
    lastDiplomacyTick=tick;
    for(const [id,until] of diplomacyHandled)if(tick>=until)diplomacyHandled.delete(id);
    const cards=incomingAllianceCards(tick);
    const players=game.playerViews().filter(p=>safeID(p)!==safeID(me)&&p.isAlive?.());
    // Pending replies are checked against *observable game state*, not counted
    // as successful merely because EventBus.emit/callback returned normally.
    for(const [id,pending] of diplomacyPending) {
      const p=players.find(x=>safeID(x)===id);
      if(!p){diplomacyPending.delete(id);continue;}
      const allied=actualFriendly(p,me),requesting=!!p.isRequestingAllianceWith?.(me);
      const visible=cards.has(id);
      if(allied || (!requesting && !visible)) {
        const confirmed=pending.accept?allied:!allied;
        const result=confirmed?'Bestätigt':'Nicht bestätigt';
        diplomacyStatus=(pending.accept?'Annahme':'Ablehnung')+' '+result+': '+pending.name;
        if(confirmed)diplomacyStats[pending.accept?'accepted':'rejected']++;
        telemetry('alliance_reply_result',diplomacyStatus,
          {requestor:id,confirmed,accept:pending.accept,tries:pending.tries});
        log('ALLIANZ '+diplomacyStatus);
        diplomacyPending.delete(id);
        diplomacyHandled.set(id,tick+220);
        if(allied){
          if(warState.id===id)warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};
          if(plan?.id===id)plan=null;
          if(operation?.target===id)operation=null;
          frontMemory.delete(id);
        }
        continue;
      }
      if(tick-pending.sentTick<45)continue;
      if(pending.tries>=3) {
        diplomacyPending.delete(id);diplomacyHandled.set(id,tick+140);
        diplomacyStatus='Allianzantwort nicht bestätigt: '+pending.name;
        telemetry('alliance_reply_timeout',diplomacyStatus,
          {requestor:id,accept:pending.accept,tries:pending.tries});
        continue;
      }
      // Retain the attempt counter; the incoming pass below retries after the wait.
    }
    // Mutual PlayerIDs get the first alliance lane. The relay never confirms
    // friendship: only GameView/team state can do that.
    const duo=duoTrustedPeer();
    if(duo){
      const partner=duo.player,id=safeID(partner);
      if(actualFriendly(partner,me)){
        duoLocal.status='Verbunden · Bündnis/Team im Spiel bestätigt';
        if(warState.id===id)
          warState={id:null,name:'—',since:-Infinity,blockedUntil:-Infinity};
        frontMemory.delete(id);
      }else if(partner.isTraitor?.()){
        duoLocal.status='Partner als Verräter markiert: kein Bündnisbefehl';
      }else if(partner.isRequestingAllianceWith?.(me)||cards.has(id)){
        const previous=diplomacyPending.get(id);
        if(!previous||tick-previous.sentTick>=45){
          answerAlliance(me,partner,true,cards.get(id)?.card,tick,
            'Duo-Partner-ID bestätigt',previous?.tries||1);
          return;
        }
      }else if(allianceOfferPath()&&!me.isRequestingAllianceWith?.(partner)&&
        !diplomacyHandled.has(id)&&tick-lastProposalTick>=55){
        const anchor=(strategic.groups.find(g=>g.id===id)?.tiles||[])[0]??
          partner.state?.spawnTile;
        if(Number.isInteger(anchor)&&safeID(game.owner(anchor))===id){
          const serial=generation;lastProposalTick=tick;
          Promise.resolve(me.actions(anchor,null)).then(a=>{
            if(!live(serial)||!duoTrustedPeer()||
              game.config().disableAlliances?.()===true||
              !opts.duoEnabled||!opts.diplomacy||
              me.isRequestingAllianceWith?.(partner)||
              actualFriendly(partner,me)||partner.isTraitor?.()||
              safeID(game.owner(anchor))!==id||
              !a?.interaction?.canSendAllianceRequest)return;
            if(sendAllianceOffer(me,partner,
              'DUO ALLIANZ ANGEFRAGT: '+nameOf(partner),true)){
              diplomacyStatus='Duo-Bündnis angefragt · Bestätigung ausstehend';
              diplomacyHandled.set(id,tick+85);diplomacyStats.offered++;
              telemetry('duo_alliance_offer',diplomacyStatus,{partnerID:id});
            }
          }).catch(e=>{
            duoLocal.status='Allianz-Worker: '+String(e?.message||e).slice(0,55);
          });
        }
      }
    }
    const incoming=players.filter(p=>!actualFriendly(p,me)&&
      (p.isRequestingAllianceWith?.(me)||cards.has(safeID(p))));
    if(incoming.length) {
      const s=military(me,strategic.groups);
      for(const p of incoming) {
        const id=safeID(p);
        const previous=diplomacyPending.get(id);
        if(diplomacyHandled.has(id)|| (previous && tick-previous.sentTick<45))continue;
        const peer=duoTrustedPeer();
        const allyOfPeer=peer&&actualFriendly(peer.player,me)&&duoPeerAlly(p);
        const fighting=safeID(p)===warState.id||
          (me.outgoingAttacks?.()||[]).some(a=>!a.retreating&&attackTargets(a.targetID,p))||
          (me.incomingAttacks?.()||[]).some(a=>!a.retreating&&
            attackTargetID(a.attackerID)===safeID(p));
        const judgement=peer?
          {score:allyOfPeer&&!fighting&&!p.isTraitor?.()?100:-999,
            reason:allyOfPeer&&!fighting?
              'Duo: bestätigtes Partnerbündnis angleichen':
              'Duo: fremdes Bündnis vermeiden / laufenden Konflikt schützen'}:
          diplomacyScore(me,p,s,false,true);
        const accept=judgement.score>=58;
        const oldTry=previous?.tries||0;
        diplomacyPending.delete(id);
        telemetry('alliance_detected','Anfrage von '+nameOf(p),
          {requestor:id,score:judgement.score,accept,reason:judgement.reason,
            viaCard:cards.has(id),acceptCtor:!!ctors.alliance,rejectCtor:!!ctors.reject});
        answerAlliance(me,p,accept,cards.get(id)?.card,tick,judgement.reason,oldTry+1);
        paint();return; // Incoming diplomacy has priority over outgoing offers.
      }
      return;
    }
    if(renewAlliances(me,tick))return;
    // A Duo can actively form NEW outside alliances: lower PlayerID makes
    // the initial offer and the follower later proposes the same alliance
    // only after the first is genuinely confirmed by OpenFront.
    const paired=duoTrustedPeer();
    if(!opts.offerAlliances||!allianceOfferPath()||!actionBudget()){
      if(!allianceOfferPath()&&opts.offerAlliances)
        diplomacyStatus='Eigene Angebote: Allianz-Intent / Spielerpanel noch nicht verfügbar';
      return;
    }
    if(paired&&!actualFriendly(paired.player,me))return;
    if(tick-lastProposalTick<(paired?90:450))return;
    const peerWar=paired?.state?.warTarget,peerTarget=paired?.state?.target;
    const safeOffer=(p)=>p&&p.isAlive?.()&&!actualFriendly(p,me)&&
      safeID(p)!==paired?.id&&
      !p.isTraitor?.()&&!diplomacyHandled.has(safeID(p))&&
      !diplomacyPending.has(safeID(p))&&
      safeID(p)!==warState.id&&safeID(p)!==plan?.id&&
      safeID(p)!==peerWar&&safeID(p)!==peerTarget&&
      !me.isRequestingAllianceWith?.(p)&&
      !(me.outgoingAttacks?.()||[]).some(a=>!a.retreating&&
        attackTargets(a.targetID,p))&&
      !(me.incomingAttacks?.()||[]).some(a=>!a.retreating&&
        attackTargetID(a.attackerID)===safeID(p))&&
      !(paired?.player.outgoingAttacks?.()||[]).some(a=>!a.retreating&&
        attackTargets(a.targetID,p));
    const inherited=paired?players.filter(p=>
      duoPeerAlly(p)&&safeOffer(p)):[],follow=inherited[0]||null;
    // Without an inherited third-party friend, only the leader starts a
    // new offer: two independent browsers must not recruit enemies of
    // their respective partner by accident.
    const leader=!paired||String(safeID(me))<String(paired.id);
    if(paired&&!follow&&!leader)return;
    const army=military(me,strategic.groups);
    const candidates=strategic.groups.filter(g=>g.id!==null&&
      g.opponent&&g.tiles?.length&&safeOffer(g.opponent)&&
      (!['ASSAULT','EXPAND'].includes(strategic.mode)||
        number(()=>g.opponent.troops(),0)>=number(()=>me.troops(),1)*.85))
      .map(g=>({g,...diplomacyScore(me,g.opponent,army,true)}))
      .filter(x=>x.score>=72)
      .sort((a,b)=>b.score-a.score||
        String(a.g.id).localeCompare(String(b.g.id)));
    const chosen=follow?null:candidates[0];
    if(!follow&&!chosen)return;
    const target=follow||chosen.g.opponent,id=safeID(target);
    const anchor=(strategic.groups.find(g=>g.id===id)?.tiles||[])[0]??
      target.state?.spawnTile;
    if(!Number.isInteger(anchor)||safeID(game.owner(anchor))!==id)return;
    const serial=generation,peerID=paired?.id??null;
    lastProposalTick=tick;
    Promise.resolve(me.actions(anchor,null)).then(a=>{
      const connectedPair=duoTrustedPeer();
      if(!live(serial)||game.inSpawnPhase?.()||!opts.diplomacy||
        !opts.offerAlliances||game.config().disableAlliances?.()===true||
        !a?.interaction?.canSendAllianceRequest||
        safeID(game.owner(anchor))!==id||!safeOffer(target)||
        (peerID!==null&&(!connectedPair||connectedPair.id!==peerID||
          !actualFriendly(connectedPair.player,me)))||
        (follow&&!duoPeerAlly(target))||
        (!follow&&connectedPair&&
          String(safeID(me))>=String(connectedPair.id)))return;
      const label=follow?'DUO · PARTNERBÜNDNIS ANFRAGEN: ':
        paired?'DUO · GEMEINSAMES BÜNDNIS ANFRAGEN: ':
          'ALLIANZ ANGEBOTEN: ';
      if(sendAllianceOffer(me,target,label+nameOf(target),!!paired)){
        diplomacyHandled.set(id,tick+(paired?220:1050));
        diplomacyStats.offered++;
        diplomacyStatus='Bündnis angeboten: '+nameOf(target)+
          ' · Bestätigung durch Spiel ausstehend';
        telemetry('alliance_offer_sent',diplomacyStatus,
          {requestor:id,path:allianceOfferPath(),
            duo:!!paired,inherited:!!follow});
      }
    }).catch(e=>{diplomacyStatus='Allianzangebot fehlgeschlagen: '+
      String(e?.message||e).slice(0,90);});
  }
  function landingFailure(boat,tick,tile,reason){
    const key=boat.key||String(boat.dest),prior=landingFailures.get(key);
    const count=prior&&tick-prior.tick<1800?Math.min(5,prior.count+1):1;
    landingFailures.set(key,{count,tick,tile,reason});
    if(landingFailures.size>60)for(const [k,v] of landingFailures)
      if(tick-v.tick>1800)landingFailures.delete(k);
    const until=tick+Math.min(1200,280+count*180);
    navalCooldown.set(key,Math.max(navalCooldown.get(key)||0,until));
    navalSiteNegative.set(tile,Math.max(navalSiteNegative.get(tile)||0,
      tick+Math.min(1600,750+count*200)));
    navalBackoffUntil=Math.max(navalBackoffUntil,tick+Math.min(480,120+count*100));
    telemetry('landing_failure_guard','Landungsziel nach unbestätigter Landung vorübergehend gesperrt',
      {key,tile,count,until,reason,evidence:'observed-no-confirmed-arrival'});
  }
  // Prefer the visible, engine-produced grid MotionPlan for an active ship.
  // This path and ticksPerStep come from the official GameView (not BFS).
  // This projects movement only; retreat, interception and re-path can change it.
  function observedTransportETA(ship,tick=number(()=>game?.ticks?.(),0)){
    const id=ship?.id?.();
    const plan=Number.isInteger(id)?game?.motionPlans?.()?.get(id):null;
    if(!plan||!Number.isInteger(plan.startTick)||
      !Number.isInteger(plan.ticksPerStep)||plan.ticksPerStep<1||
      !plan.path?.length)return null;
    const arrivalTick=plan.startTick+
      (plan.path.length-1)*plan.ticksPerStep;
    return {source:'official-visible-motion-plan',
      etaTicksEstimate:Math.max(0,arrivalTick-tick),
      arrivalTick,steps:plan.path.length-1,
      ticksPerMove:plan.ticksPerStep,planId:plan.planId,
      etaExact:false};
  }
  function inspectMarine(me,tick){
    const units=(()=>{try{return game.units?.()||[];}catch(_){return [];}})();
    const mine=safeID(me),own=type=>units.filter(u=>
      u.type?.()===type&&safeID(u.owner?.())===mine&&u.isActive?.());
    landingAudits=landingAudits.filter(a=>{
      const held=ownedTile(a.tile,me),age=tick-a.tick;
      a.checkpoints=Array.isArray(a.checkpoints)?a.checkpoints:[];
      if(!held){
        marineStats.bridgeheadLost++;
        telemetry('bridgehead_lost','Landungsziel vor Abschluss der Wirkungsbeobachtung verloren',
          {actionId:a.actionId??null,shipIds:a.shipIds??[],
            tile:a.tile,target:a.target,observedTicks:age,
            checkpoints:a.checkpoints,evidence:'destination-ownership-not-causal'});
        navalCooldown.set(a.key,tick+350);navalSiteNegative.set(a.tile,tick+900);
        return false;
      }
      for(const horizon of [120,600])if(age>=horizon&&!a.checkpoints.includes(horizon)){
        a.checkpoints.push(horizon);
        marineStats['bridgeheadHeld'+horizon]++;
        if(horizon===120)marineStats.bridgeheadHeld++;
        telemetry('bridgehead_held_'+horizon,'Landungsziel am '+horizon+'-Tick-Horizont gehalten',
          {actionId:a.actionId??null,shipIds:a.shipIds??[],
            tile:a.tile,target:a.target,observedTicks:age,horizon,
            evidence:'destination-ownership-not-causal'});
      }
      return age<600;
    });
    if(pendingBoat){
      const boat=pendingBoat,ships=own('Transport');
      const isNew=u=>{
        const id=u.id?.();
        return id!==undefined&&!boat.beforeIds.includes(id);
      };
      // Player targets may be inland. OpenFront resolves the intent to the
      // nearest reachable shore, so accept the new own transport even when
      // its real target differs from the originally queried tile.
      const freshShips=ships.filter(isNew);
      // Prefer the observed destination, including the server's coastal
      // redirect. A pre-existing boat cannot satisfy this pending order.
      const observed=freshShips.find(u=>u.targetTile?.()===boat.dest)||
        (freshShips.length===1?freshShips[0]:null);
      if(observed){
        const position=number(()=>observed.tile?.(),NaN);
        if(Number.isInteger(position)&&position!==boat.lastShipTile){
          boat.lastShipTile=position;boat.lastProgressTick=tick;
        }
        const id=observed.id?.();
        const observedETA=observedTransportETA(observed,tick);
        if(observedETA)boat.eta=observedETA;
        const resolved=observed.targetTile?.();
        if(Number.isInteger(resolved))boat.resolvedDest=resolved;
        if(!boat.shipIds.includes(id))boat.shipIds.push(id);
        if(boat.observationLostTick!=null){
          telemetry('boat_observation_resumed','Transport wieder sichtbar',{
            actionId:boat.actionId??null,ship:id,
            lostTicks:tick-boat.observationLostTick});
          boat.observationLostTick=null;
        }
        if(!boat.seen){
          boat.seen=true;marineStats.transportConfirmed++;
          fleetStatus='Transport im Spiel sichtbar';
          telemetry('boat_confirmed','Transport im Spielzustand beobachtet',
            {actionId:boat.actionId??null,dest:boat.dest,resolvedDest:boat.resolvedDest??null,
              target:boat.target,ship:id,troops:boat.troops,
              eta:boat.eta??null});
          // An observed ship is not an observed landing. It must never
          // monopolize the land-war lock before a real bridgehead exists.
          telemetry('naval_target_provisional','Marine-Ziel vorgemerkt; Landkrieg bleibt unabhängig',{
            actionId:boat.actionId??null,target:boat.playerID??null,
            resolvedDest:boat.resolvedDest??null,
            warLock:warState.id??null,evidence:'ship-only-no-bridgehead'});

        }
      }
      const landingTile=Number.isInteger(boat.resolvedDest)?boat.resolvedDest:boat.dest;
      if(boat.seen && ownedTile(landingTile,me)){
        marineStats.transportArrived++;
        fleetStatus='Landung / Gebiet am Ziel bestätigt';
        telemetry('boat_arrived','Transportziel nach bestätigtem Schiff übernommen',
          {actionId:boat.actionId??null,dest:boat.dest,resolvedDest:landingTile,
            target:boat.target,shipIds:boat.shipIds,
            eta:boat.eta??null,status:'coast-owned-after-ship-observation',
            evidence:'ship-plus-destination-ownership-not-causal'});
        // Only confirmed own coastal territory may promote the provisional
        // marine objective. Never overwrite an independent active land war.
        if(boat.playerID&&coordinatedWar()&&warState.id===null){
          const target=game.playerViews?.().find(p=>safeID(p)===boat.playerID);
          if(target?.isAlive?.()&&!friendly(target,me)){
            warState={id:boat.playerID,name:nameOf(target),since:tick,
              blockedUntil:-Infinity,origin:'confirmed-bridgehead'};
            telemetry('naval_war_lock','Bestätigter Brückenkopf als Kriegsziel gebunden',{
              actionId:boat.actionId??null,target:boat.playerID,
              resolvedDest:landingTile,evidence:'ship-plus-own-coast'});
          }
        }
        landingAudits.push({actionId:boat.actionId??null,
          shipIds:[...boat.shipIds],eta:boat.eta??null,
          tile:landingTile,target:boat.target,key:boat.key,tick,
          checkpoints:[]});
        navalCooldown.set(boat.key,tick+140);
        landingFailures.delete(boat.key);
        navalSiteNegative.delete(landingTile);
        pendingBoat=null;
      }else if(boat.seen && tick-boat.tick>40 &&
        !ships.some(u=>boat.shipIds.includes(u.id?.()))){
        if(boat.observationLostTick==null){
          boat.observationLostTick=tick;
          fleetStatus='Transport nicht sichtbar – Küste wird nachbeobachtet';
          telemetry('boat_observation_lost',fleetStatus,{
            actionId:boat.actionId??null,dest:boat.dest,resolvedDest:landingTile,
            target:boat.playerID??null,shipIds:boat.shipIds,
            lastShipTile:boat.lastShipTile??null,
            lastProgressTick:boat.lastProgressTick,
            coastOwner:safeID(game.owner?.(landingTile)),
            eta:boat.eta??null,evidence:'ship-absent-not-proven-destroyed'});
        }
        // Watch briefly after disappearance. MotionPlan ETA is a moving
        // estimate, not proof of arrival; cap the watch to avoid starvation.
        const grace=Math.min(360,Math.max(120,
          Number.isFinite(boat.eta?.arrivalTick)?
            boat.eta.arrivalTick-boat.observationLostTick+120:120));
        if(tick-boat.observationLostTick>=grace){
          marineStats.transportUnresolved++;
          fleetStatus='Transport weiterhin ungeklärt; Küste nicht übernommen';
          telemetry('boat_unresolved',fleetStatus,{
            actionId:boat.actionId??null,dest:boat.dest,resolvedDest:landingTile,
            target:boat.playerID??null,shipIds:boat.shipIds,
            lastShipTile:boat.lastShipTile??null,
            lastProgressTick:boat.lastProgressTick,
            observationLostTick:boat.observationLostTick,
            coastOwner:safeID(game.owner?.(landingTile)),
            eta:boat.eta??null,grace,
            reason:'ship-disappeared-no-observed-bridgehead',
            status:'unresolved-not-proven-destroyed'});
          landingFailure(boat,tick,landingTile,'ship-disappeared-unresolved');
          pendingBoat=null;
        }
      }else if(boat.seen && tick-boat.tick>650 && !boat.delayed){
        boat.delayed=true;fleetStatus='Transport noch unterwegs / Landung ungeklärt';
        telemetry('boat_delayed',fleetStatus,{
          actionId:boat.actionId??null,dest:boat.dest,resolvedDest:landingTile,
          shipIds:boat.shipIds,eta:boat.eta??null,
          lastProgressTick:boat.lastProgressTick,
          status:'in-transit-arrival-unknown'});
      }else if(tick-boat.tick>(boat.seen?
        Math.max(1350,Number.isFinite(boat.eta?.arrivalTick)?
          Math.min(7200,boat.eta.arrivalTick-boat.tick+120):1350):90) &&
        (!boat.seen||boat.observationLostTick==null)&&
        (!boat.seen||tick-boat.lastProgressTick>260)){
        if(boat.seen)marineStats.transportUnresolved++;
        else marineStats.transportUnconfirmed++;
        fleetStatus=boat.seen?'Transport lange ohne Landungsbestätigung':
          'Transport nach Intent nicht im Spiel beobachtet';
        telemetry(boat.seen?'boat_unresolved':'boat_unconfirmed',fleetStatus,
          {actionId:boat.actionId??null,dest:boat.dest,
            resolvedDest:landingTile,target:boat.target,
            shipIds:boat.shipIds,eta:boat.eta??null,troops:boat.troops,
            reason:boat.seen?'stalled-no-owned-coast':'ship-not-seen',
            status:'unresolved-not-proven-lost'});
        landingFailure(boat,tick,landingTile,
          boat.seen?'stalled-no-owned-coast':'ship-not-seen');pendingBoat=null;
      }
    }
    if(pendingWarship){
      const pending=pendingWarship,ships=own('Warship');
      const observed=ships.find(u=>!pending.beforeIds.includes(u.id?.()));
      if(observed){
        marineStats.warshipConfirmed++;
        fleetStatus='Kriegsschiff im Spiel bestätigt';
        telemetry('warship_confirmed','Kriegsschiff im Spielzustand sichtbar',
          {tile:observed.tile?.(),unitId:observed.id?.(),cost:pending.cost});
        pendingWarship=null;
      }else if(tick-pending.tick>110){
        marineStats.warshipUnconfirmed++;
        fleetStatus='Kriegsschiff-Befehl nicht bestätigt';
        telemetry('warship_unconfirmed',fleetStatus,
          {tile:pending.tile,cost:pending.cost});
        pendingWarship=null;
      }
    }
  }
  function sendMarineTransport(me,dest,troops,tick,label,targetKey,route=null){
    if(pendingBoat || (navalCooldown.get(targetKey)||0)>tick)return false;
    if(!Number.isInteger(dest)||!(troops>=1000))return false;
    const fresh=military(me,strategic.groups);
    if(fresh.incoming>0||troops>fresh.available||navalHomeRisk(me,number(()=>game.ticks(),tick)))return false;
    const beforeIds=(()=>{try{return (game.units?.()||[]).filter(u=>
      u.type?.()==='Transport'&&safeID(u.owner?.())===safeID(me))
      .map(u=>u.id?.());}catch(_){return [];}})();
    if(!send('boat',[dest,troops],label))return false;
    pendingBoat={dest,tick,troops,actionId:lastActionId,
      key:targetKey,target:label,
      playerID:targetKey.startsWith('player:')?targetKey.slice(7):null,
      resolvedDest:null,beforeIds,shipIds:[],seen:false,
      lastShipTile:null,lastProgressTick:tick,observationLostTick:null,
      delayed:false,
      route:route?{distance:route.distance,etaTicks:route.etaTicks,
        risk:route.risk,uncertaintyUntil:route.uncertaintyUntil}:null};
    marineStats.transportSent++;
    navalCooldown.set(targetKey,tick+160);
    fleetStatus='Transport angefordert · Bestätigung ausstehend';
    telemetry('boat_intent','Transport angefordert; wartet auf Spielzustand',
      {actionId:pendingBoat.actionId,dest,troops,target:targetKey,
        route:pendingBoat.route});
    return true;
  }
  // Protect real owned shores from visible incoming transports. BuildUnitIntentEvent
  // for Warship uses an actual WATER tile checked through the worker.
  async function fleetDefense(me,tick,serial){
    if(!opts.boats||tick-lastFleet<120||!game.units)return false;
    const all=game.units()||[],ourID=safeID(me);
    const ownWarships=all.filter(u=>u.type?.()==='Warship'&&
      safeID(u.owner?.())===ourID&&u.isActive?.());
    if(ctors.cancelBoat){
      const unsafe=all.find(u=>u.type?.()==='Transport'&&u.isActive?.() &&
        safeID(u.owner?.())===ourID&&Number.isInteger(u.targetTile?.())&&
        game.owner(u.targetTile())?.isPlayer?.() &&
        friendly(game.owner(u.targetTile()),me) &&
        !u.transportShipState?.().isRetreating);
      if(unsafe&&Number.isInteger(unsafe.id?.())&&send('cancelBoat',[unsafe.id()],
        'LANDUNG ABBRECHEN: Ziel jetzt verbündet',true)){
        lastFleet=tick;fleetStatus='Landung abgebrochen';return true;
      }
    }
    const targets=all.filter(u=>u.type?.()==='Transport'&&u.isActive?.() &&
      safeID(u.owner?.())!==ourID&&!friendly(u.owner?.(),me)&&
      Number.isInteger(u.targetTile?.())&&ownedTile(u.targetTile(),me));
    const active=targets.find(u=>!u.transportShipState?.().isRetreating);
    const water=active?.tile?.();
    if(active&&ctors.warship&&Number.isInteger(water)&&game.isWater?.(water)){
      const ship=ownWarships.find(u=>Number.isInteger(u.id?.()) &&
        game.euclideanDistSquared?.(u.tile(),water)<300*300);
      if(ship&&send('warship',[[ship.id()],water],
        'KRIEGSSCHIFF → feindlichen Transporter abfangen')){
        lastFleet=tick;fleetStatus='Transporter abfangen';return true;
      }
    }
    if(pendingWarship||!ctors.build ||
      game.config().isUnitDisabled?.('Warship')===true)return false;
    const ports=ownStructures(me).filter(u=>u.type?.()==='Port'&&
      !u.isUnderConstruction?.());
    if(!ports.length){
      if(active)fleetStatus='Küstenschutz: Hafen fehlt';
      return false;
    }
    // Build one escort before the silo fund, a second only after the first
    // has appeared in the game. More hulls require a real incoming landing.
    const desired=active?Math.min(3,ports.length+1):
      clamp((number(()=>me.numTilesOwned(),0)>=15000?2:1)+
        Math.round(neuralChannel('fleetPriority',me)*1.5),1,3);
    if(ownWarships.length>=desired)return false;
    const gold=goldAmount(me);
    if(!active && gold<450000 && !game.config().infiniteGold?.())return false;
    let probes=0,legalFound=0;
    for(const port of ports.slice(0,3)){
      const x=game.x(port.tile()),y=game.y(port.tile());
      for(const radius of [3,6,10,15,20]){
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],
          [1,1],[-1,1],[1,-1],[-1,-1]]){
          const xx=x+dx*radius,yy=y+dy*radius;
          if(!valid(xx,yy))continue;
          const tile=game.ref(xx,yy);
          if(!game.isWater?.(tile))continue;
          let response;
          try{response=await me.actions(tile,['Warship']);probes++;}
          catch(_){continue;}
          if(!live(serial))return false;
          const ship=response?.buildableUnits?.find(u=>u.type==='Warship'&&
            Number.isInteger(u.canBuild));
          if(!ship)continue;
          legalFound++;
          const cost=Number(ship.cost);
          if(!game.config().infiniteGold?.() &&
            (!Number.isFinite(cost)||gold<cost))continue;
          // canBuild is the launch PORT; the intent expects the queried WATER patrol tile.
          if(!spendBudget(me,cost,'Warship',!!active))continue;
          if(send('build',['Warship',tile],
            (active?'KÜSTENSCHUTZ':'FLOTTENAUFBAU')+' → Kriegsschiff')){
            commitGoldSpend(me,cost,'Warship');
            pendingWarship={tick,tile,spawnTile:ship.canBuild,cost,
              beforeIds:ownWarships.map(u=>u.id?.())};
            marineStats.warshipSent++;lastFleet=tick;
            fleetStatus='Kriegsschiff angefordert · Bestätigung ausstehend';
            telemetry('warship_intent','Kriegsschiff-Bau angefordert',
              {tile,spawnTile:ship.canBuild,cost,ports:ports.length,
                priorWarships:ownWarships.length,emergency:!!active});
            return true;
          }
        }
      }
    }
    if(probes){
      lastFleet=tick;
      fleetStatus=legalFound?'Kriegsschiff: Gold/Budget fehlt':
        'Kriegsschiff: kein legaler Wasser-Bauplatz';
      telemetry('warship_probe',fleetStatus,{probes,legalFound,
        ports:ports.length,gold,warships:ownWarships.length});
    }
    return false;
  }
  function tradeIntentPath(){
    if(typeof ctors.embargo==='function')return 'intent';
    const p=document.querySelector('player-panel');
    if(!p)return null;
    return p.g===game&&p.eventBus===bus&&
      typeof p.handleEmbargoClick==='function'&&
      typeof p.handleStopEmbargoClick==='function'?'player-panel':null;
  }
  function sendTradeToggle(me,target,action,label){
    if(!opts.enabled||!connected()||!permittedMatch(game)||
      !actionBudget()||Date.now()-lastEmission<410||me!==myPlayer())return false;
    if(!target?.isAlive?.()||safeID(target)===safeID(me)||
      !['start','stop'].includes(action))return false;
    if(action==='start'&&friendly(target,me))return false;
    if(typeof ctors.embargo==='function')
      return send('embargo',[target,action],label);
    const p=document.querySelector('player-panel');
    if(tradeIntentPath()!=='player-panel'||p?.g!==game||p?.eventBus!==bus)return false;
    try{
      const ev={stopPropagation(){}};
      (action==='start'?p.handleEmbargoClick:p.handleStopEmbargoClick)
        .call(p,ev,me,target);
      actions.push(Date.now());lastEmission=Date.now();totalSent++;
      log(label+' (offizielles Spielerpanel)');
      telemetry('trade_toggle',label,{target:safeID(target),action,path:'player-panel'});
      return true;
    }catch(e){totalFailed++;return false;}
  }
  function tradeAnchor(p){
    const id=safeID(p),front=(strategic.groups||[])
      .find(g=>g.id===id)?.tiles?.[0];
    if(Number.isInteger(front)&&safeID(game.owner(front))===id)return front;
    const spawn=p?.state?.spawnTile;
    return Number.isInteger(spawn)&&safeID(game.owner(spawn))===id?spawn:null;
  }
  function tradeImpactAssessment(me,p,tick){
    const ownPorts=ownStructures(me).filter(u=>u.type?.()==='Port'&&
      !u.isUnderConstruction?.()).length;
    const enemyPorts=(p.units?.()||[]).filter(u=>u.type?.()==='Port'&&
      !u.isUnderConstruction?.()).length;
    const id=safeID(p),front=(strategic.groups||[]).find(g=>g.id===id);
    const outgoing=(me.outgoingAttacks?.()||[]).filter(a=>
      !a.retreating&&attackTargets(a.targetID,p)).length;
    const incoming=(me.incomingAttacks?.()||[]).filter(a=>
      !a.retreating&&attackTargetID(a.attackerID)===id).length;
    const conflict=outgoing+incoming;
    // OpenFront does not expose per-counterparty trade income here. Keep the
    // estimate explicit and symmetric instead of inventing exact gold values.
    const estimatedEnemyCost=enemyPorts*14+conflict*24+(front?.tiles?.length||0)*.4;
    const estimatedOwnCost=ownPorts*14;
    const score=estimatedEnemyCost-estimatedOwnCost;
    return {target:id,tick,ownPorts,enemyPorts,outgoing,incoming,
      borderTiles:front?.tiles?.length||0,estimatedEnemyCost,
      estimatedOwnCost,score,worthwhile:conflict>0&&score>=0,
      evidence:'port-count/front/conflict proxy; counterparty income unavailable'};
  }
  async function tradePolicy(me,tick){
    if(!opts.economy||tick-lastTradeTick<80||!actionBudget())return false;
    const serial=generation,tradeGame=game;
    const current=()=>live(serial)&&game===tradeGame&&me===myPlayer()&&opts.economy;
    if(!current())return false;
    if(!tradeIntentPath()){
      tradeStatus='Handel automatisch · Embargo-Intent noch nicht erkannt';
      tradeStats.skipped++;return false;
    }
    const players=(game.playerViews?.()||[]).filter(p=>p?.isPlayer?.()&&
      p.isAlive?.()&&safeID(p)!==safeID(me));
    const open=players.filter(p=>actualFriendly(p,me)&&me.hasEmbargoAgainst?.(p));
    for(const p of open){
      const tile=tradeAnchor(p);if(!Number.isInteger(tile))continue;
      lastTradeTick=tick;try{
        await me.actions(tile,null);
        if(!current())return false;
        if(actualFriendly(p,me)&&safeID(game.owner(tile))===safeID(p)&&me.hasEmbargoAgainst?.(p)&&
          sendTradeToggle(me,p,'stop','HANDEL ÖFFNEN → '+nameOf(p))){
          botEmbargoes.delete(safeID(p));tradeStats.opened++;
          tradeStatus='Handel geöffnet mit '+nameOf(p);return true;
        }
      }catch(_){tradeStats.skipped++;}
    }
    // An intended target is not yet a proven trade adversary.
    // Embargo costs our own port income too; require observed fighting.
    const hostile=players.filter(p=>{
      const id=safeID(p);
      if(friendly(p,me)||me.hasEmbargoAgainst?.(p))return false;
      return (me.outgoingAttacks?.()||[]).some(a=>
        !a.retreating&&attackTargets(a.targetID,p))||
        (me.incomingAttacks?.()||[]).some(a=>
          !a.retreating&&attackTargetID(a.attackerID)===id);
    });
    if(hostile.length){
      const assessed=hostile.map(p=>({p,a:tradeImpactAssessment(me,p,tick)}))
        .sort((a,b)=>b.a.score-a.a.score||
          number(()=>b.p.troops?.(),0)-number(()=>a.p.troops?.(),0));
      tradeAssessments=assessed.map(x=>x.a).slice(0,8);
      const selected=assessed.find(x=>x.a.worthwhile),p=selected?.p,
        tile=p?tradeAnchor(p):null;
      if(Number.isInteger(tile)){lastTradeTick=tick;try{
        const a=await me.actions(tile,null);
        if(!current())return false;
        if(a?.interaction?.canEmbargo===true&&!friendly(p,me)&&
          tradeImpactAssessment(me,p,number(()=>game.ticks(),tick)).worthwhile&&
          safeID(game.owner(tile))===safeID(p)&&!me.hasEmbargoAgainst?.(p)&&
          sendTradeToggle(me,p,'start','HANDEL STOPPEN → '+nameOf(p))){
          botEmbargoes.add(safeID(p));tradeStats.embargoed++;
           tradeStatus='Embargo gegen aktiven Gegner: '+nameOf(p)+
             ' · Wirkungsscore '+Math.round(selected.a.score);return true;
        }
      }catch(_){tradeStats.skipped++;}}
    }
    for(const id of [...botEmbargoes]){
      const p=players.find(x=>safeID(x)===id);
      if(!p){botEmbargoes.delete(id);continue;}
      const active=(me.outgoingAttacks?.()||[]).some(a=>
        !a.retreating&&attackTargets(a.targetID,p))||
        (me.incomingAttacks?.()||[]).some(a=>
          !a.retreating&&attackTargetID(a.attackerID)===id);
      if(active||!me.hasEmbargoAgainst?.(p))continue;
      const tile=tradeAnchor(p);if(!Number.isInteger(tile))continue;
      lastTradeTick=tick;try{
        await me.actions(tile,null);
        if(!current())return false;
        const fresh=tradeImpactAssessment(me,p,number(()=>game.ticks(),tick));
        if(fresh.incoming===0&&fresh.outgoing===0&&
          safeID(game.owner(tile))===id&&me.hasEmbargoAgainst?.(p)&&sendTradeToggle(me,p,'stop',
          'HANDEL WIEDER ÖFFNEN → '+nameOf(p))){
          botEmbargoes.delete(id);tradeStats.opened++;
          tradeStatus='Handel wieder geöffnet mit '+nameOf(p);return true;
        }
      }catch(_){tradeStats.skipped++;}
    }
    const ports=ownStructures(me).filter(u=>u.type?.()==='Port'&&
      !u.isUnderConstruction?.()).length;
    tradeStatus=ports?'Handel offen · '+ports+' Hafen/Häfen · Schiffe automatisch':
      'Noch kein fertiger Hafen · Handelsausbau wird bewertet';
    return false;
  }
  async function tradeTick(){
    if(tradeBusy||!opts.enabled||!connected())return;
    const me=myPlayer(),tick=number(()=>game?.ticks?.(),-1);
    if(!me?.hasSpawned?.()||!me?.isAlive?.()||tick<0)return;
    tradeBusy=true;
    try{await tradePolicy(me,tick);}
    catch(e){tradeStatus='Handel: '+String(e?.message||e).slice(0,75);}
    finally{tradeBusy=false;}
  }
  // Team aid is guarded by same-team identity, real incoming threats,
  // available HOME troops, and the silo fund. No speculative allied donations.
  function teamSupport(me,tick,s){
    const peer=duoTrustedPeer();
    const local=peer&&actualFriendly(peer.player,me)?peer:null;
    const warning=Math.max(local?.state?.warning||0,
      local?.state?.earlyCrisis?1:0);
    const donationCooldown=local?(warning>=2?90:warning>=1?160:240):300;
    if((winStatus.mode!=='Team'&&!local)||tick-lastDonation<donationCooldown||
      !actionBudget())return false;
    const team=me.team?.();
    if((team===null||team===undefined)&&!local)return false;
    const partners=(game.playerViews?.()||[]).filter(p=>
      p!==me&&p.isAlive?.()&&p.team?.()===team&&me.isOnSameTeam?.(p));
    if(!partners.length&&!local)return false;
    const duo=rankedDuo(me)||(local?
      {partner:local.player,partnerID:local.id}:null);
    if(duo){
      const partner=duo.partner;
      const inbound=(partner.incomingAttacks?.()||[]).filter(a=>!a.retreating)
        .reduce((n,a)=>n+Math.max(0,number(()=>a.troops,0)),0);
      const partnerHome=Math.max(1,number(()=>partner.troops(),1));
      const ownDanger=duoWarningLevel(s,tick)>0;
      // Donating from two symmetric bots must not form a back-and-forth
      // loop. Only donate on observed pressure and concrete troop shortage.
      const critical=warning>=2||inbound>partnerHome*.12;
      const recoveryNeed=warning>=1&&inbound===0&&s.home>partnerHome*1.35&&
        number(()=>partner.numTilesOwned(),0)<
          number(()=>me.numTilesOwned(),0)*(warning>=2?.85:.65)?
        Math.min(partnerHome*.20,s.home*.07):0;
      const shortage=Math.max(0,inbound*1.55-partnerHome,
        inbound>partnerHome*.06?inbound*.18:0,recoveryNeed);
      const floor=Math.max(s.reserve,s.incoming*1.7,
        s.strongest*(critical?.72:.60),s.home*(critical?.42:.35));
      const safe=Math.max(0,Math.floor(s.home-floor));
      const amount=Math.floor(Math.min(shortage,
        s.available*(critical?.32:.22),s.home*(critical?.14:.10),safe));
      if(!ownDanger&&(inbound>partnerHome*.025||recoveryNeed>=1000)&&
        amount>=1000&&
        ctors.donateTroops&&(!me.canDonateTroops||me.canDonateTroops(partner))&&
        send('donateTroops',[partner,amount],
          'DUO · TEAMHILFE → '+nameOf(partner))){
        lastDonation=tick;
        const requestId=local?.state?.needHelp?
          local.state.helpRequestId??null:null;
        if(requestId){
          diagnosticAid={requestId,partnerId:duo.partnerID,
            actionId:lastActionId,amount,tick,
            partnerHomeAtEmission:partnerHome};
          telemetry('duo_help_accepted','Sichere Truppenhilfe angefordert',{
            requestId,partnerId:duo.partnerID,actionId:lastActionId,
            acceptedTroops:amount,status:'accepted-for-emitted-intent',
            supportObserved:'unknown'});
          telemetry('duo_help_action_sent','Truppenspende als Intent gesendet',{
            requestId,partnerId:duo.partnerID,actionId:lastActionId,
            sentTroops:amount,status:'action-sent-not-confirmed',
            supportObserved:'unknown'});
        }
        telemetry('duo_donation','Notfallhilfe gegen beobachtete Partnerfront',
          {requestId,actionId:lastActionId,
            planId:duoPlan?.planId??null,partner:duo.partnerID,partnerIncoming:inbound,warning,
            partnerHome,amount,ownHome:s.home,remaining:s.home-amount,floor,
            displayAmount:Math.round(amount/10)});
        return true;
      }
      // One-way economic assistance: only a clearly richer teammate with a
      // funded own construction reserve may help a cash-starved partner.
      // Independent instances cannot ping-pong gold when the wealth gap
      // criterion and one-match cooldown are enforced.
      const cfg=game?.config?.().gameConfig?.()||{};
      const ownGold=goldAmount(me);
      const partnerGold=number(()=>Number(partner.gold?.()),Infinity);
      if(!ownDanger&&cfg.donateGold!==false&&ctors.donateGold&&
        (!me.canDonateGold||me.canDonateGold(partner))&&
        Number.isFinite(partnerGold)&&
        ownGold>Math.max(1400000,partnerGold+850000)&&
        (inbound>0||number(()=>partner.numTilesOwned(),0)<
          number(()=>me.numTilesOwned(),0)*.65)){
        const needs=economicNeeds(me,ownStructures(me),[]);
        const richAid=ownGold>=8000000&&partnerGold<1200000&&
          partnerGold<ownGold*.30&&!needs.capStalled&&
          s.incoming===0&&s.ratio>=.70&&s.committed<s.home*.30&&
          s.strongest<s.home*.75;
        if(!richAid&&partnerGold>=400000)return false;
        // The replay shows multi-million late-game transfers; scale aid only
        // for a verifiably struggling teammate, without spending our own
        // production, SAM or military reserves.
        const cashFloor=Math.max(needs.savingsTarget,richAid?3000000:1000000);
        const amountGold=Math.floor(richAid?
          Math.min(2000000,(ownGold-cashFloor)*.30,2000000-partnerGold):
          Math.min(200000,(ownGold-cashFloor)*.20,400000-partnerGold));
        if(amountGold>=50000&&ownGold-amountGold>=cashFloor&&
          spendBudget(me,amountGold,'donateGold')&&
          send('donateGold',[partner,BigInt(amountGold)],
            'DUO · AUFBAUHILFE → '+nameOf(partner))){
          commitGoldSpend(me,amountGold,'donateGold');
          lastDonation=tick;
          telemetry('duo_gold','Goldhilfe bei eindeutigem Wirtschaftsrückstand',
            {planId:duoPlan?.planId??null,partner:duo.partnerID,partnerGold,ownGold,
              amount:amountGold,cashFloor,partnerIncoming:inbound});
          return true;
        }
      }
      // No speculative equal-wealth donations or legacy absolute-incoming
      // selection; both bots keep their own reserve and economy.
      return false;
    }
    const needy=partners.map(p=>({p,incoming:(p.incomingAttacks?.()||[])
      .filter(a=>!a.retreating).reduce((n,a)=>n+number(()=>a.troops,0),0)}))
      .sort((a,b)=>b.incoming-a.incoming)[0];
    if(!needy || needy.incoming<number(()=>needy.p.troops(),1)*.35 ||
      s.incoming>0 || s.strongest>=s.home*.85)return false;
    const amount=Math.floor(Math.min(s.available*.18,s.home*.08));
    if(ctors.donateTroops && amount>=1000 &&
      s.home-amount>Math.max(s.home*.35,s.strongest*.6) &&
      send('donateTroops',[needy.p,amount],'TEAMHILFE → '+nameOf(needy.p))){
      lastDonation=tick;return true;
    }
    const gold=goldAmount(me);
    const reserve=economicNeeds(me,ownStructures(me),[]).savingsTarget;
    const amountGold=Math.floor(Math.min(gold*.06,250000));
    if(ctors.donateGold && gold>1200000 && amountGold>=50000 &&
      gold-amountGold>=Math.max(reserve,750000) &&
      spendBudget(me,amountGold,'donateGold')&&
      send('donateGold',[needy.p,BigInt(amountGold)],'TEAMGOLD → '+nameOf(needy.p))){
      commitGoldSpend(me,amountGold,'donateGold');
      lastDonation=tick;return true;
    }
    return false;
  }
  function renewAlliances(me,tick){
    if(!opts.diplomacy||!ctors.extend)return false;
    for(const a of me.alliances?.()||[]){
      if(!a.hasExtensionRequest||a.expiresAt-tick>250||a.expiresAt<=tick ||
        (diplomacyHandled.get('extend:'+a.id)||0)>tick)continue;
      const partner=game.playerViews().find(p=>safeID(p)===a.other);
      if(partner&&friendly(partner,me)&&send('extend',[partner],
        'ALLIANZ VERLÄNGERN → '+nameOf(partner),true)){
        diplomacyHandled.set('extend:'+a.id,tick+125);return true;
      }
    }
    return false;
  }
  // Bounded rotating grid: seek actual unowned LAND shore tiles on islands.
  // The worker validates water access and the real Transport deployment.
  // A sample may miss a tiny island this pass; successive calls rotate phase.
  // Bounded island-size estimate from the client-visible terrain. Never infer
  // a large beachhead merely from one reachable coastal tile.
  function neutralIslandEstimate(tile,limit=1800){
    if(typeof game?.neighbors4!=='function')return null;
    const pending=[tile],seen=new Set([tile]);let counted=0,hadNeighbors=false;
    while(pending.length&&counted<limit){
      const cur=pending.pop();
      if(!game.isLand(cur)||game.isImpassable?.(cur)||
        game.hasFallout?.(cur)||safeID(game.owner(cur))!==null)continue;
      counted++;
      const adjacent=[];
      const n=game.neighbors4(cur,adjacent)||0;
      if(n>0)hadNeighbors=true;
      for(let i=0;i<n;i++){
        const next=adjacent[i];
        if(!Number.isInteger(next)||seen.has(next))continue;
        seen.add(next);
        if(game.isLand(next)&&!game.isImpassable?.(next)&&
          !game.hasFallout?.(next)&&safeID(game.owner(next))===null)
          pending.push(next);
      }
    }
    return hadNeighbors?counted:null;
  }
  function neutralNavalCandidates(me,limit=12){
    if(!game.isShore||!game.width||!game.height)return [];
    const w=game.width(),h=game.height();
    if(!(w>0&&h>0))return [];
    const dx=Math.max(1,Math.ceil(w/40)),dy=Math.max(1,Math.ceil(h/40));
    const phase=navalSweep++%16;
    const ox=Math.floor((phase%4)*dx/4),oy=Math.floor(Math.floor(phase/4)*dy/4);
    const own=number(()=>me.state?.spawnTile,NaN);
    const result=[];
    for(let y=Math.floor(dy/2)+oy;y<h;y+=dy){
      for(let x=Math.floor(dx/2)+ox;x<w;x+=dx){
        try{
          const tile=game.ref(x,y);
          if(!game.isLand(tile)||game.isImpassable?.(tile)||
            !game.isShore(tile)||game.hasFallout?.(tile))continue;
          const owner=game.owner(tile);
          if(owner?.isPlayer?.()||safeID(owner)!==null)continue;
          const distance=Number.isInteger(own)?
            Math.hypot(x-game.x(own),y-game.y(own)):0;
          const neighbors=[];
          let nearbyNeutral=0,nearbyHostile=0;
          try{
            const n=game.neighbors4?.(tile,neighbors)||0;
            for(let i=0;i<n;i++){
              const other=game.owner(neighbors[i]);
              if(safeID(other)===null&&game.isLand(neighbors[i]))nearbyNeutral++;
              else if(other?.isPlayer?.()&&!friendly(other,me))nearbyHostile++;
            }
          }catch(_){}
          const score=nearbyNeutral*22-nearbyHostile*34-distance*.008;
          result.push({tile,distance,score});
        }catch(_){}
      }
    }
    for(const site of result){
      site.baseScore=site.score;
      site.neuralDelta=neuralActionDelta('naval',site.score,me,troopSnapshot,{
        opportunity:clamp(site.score/150,0,1),
        cost:clamp(site.distance/Math.max(1,game.width()+game.height()),0,1),
        risk:clamp((site.score<0?-site.score:0)/150,0,1)
      });
      site.score+=site.neuralDelta;
    }
    result.sort((a,b)=>b.score-a.score||a.distance-b.distance);
    return result.slice(0,limit).map(x=>x.tile);
  }
  function navalCommitmentRatio(me,enemy,tick){
    const trend=opponentTrend(enemy,tick),window=adversaryWindow(me,enemy);
    // Never ease naval thresholds based on a momentary third-party attack.
    const baseline=trend.valid&&trend.sustained&&trend.falling&&window.exposed?1.35:1.9;
    return baseline*(1-neuralChannel('navalThreshold',me)*.16);
  }
  function navalHomeRisk(me,tick){
    const samples=troopSamples.filter(s=>tick-s.tick<=300);
    const land=number(()=>me.numTilesOwned(),0);
    const peak=Math.max(land,...samples.map(s=>s.tiles));
    const assets=new Set(ownStructures(me)
      .filter(u=>['City','Factory','Port','Missile Silo'].includes(u.type?.()))
      .map(u=>u.id?.()??u.type()+':'+u.tile?.()));
    const lostAssets=samples.some(s=>(s.assets||[]).some(id=>!assets.has(id)));
    // Inspect visible missiles afresh, including changes during worker awaits.
    const nukes=(game.units?.()||[]).some(u=>u.isActive?.()&&
      ['Atom Bomb','Hydrogen Bomb','MIRV','MIRV Warhead'].includes(u.type?.())&&
      !friendly(u.owner?.(),me)&&Number.isInteger(u.targetTile?.())&&
      (ownedTile(u.targetTile(),me)||ownStructures(me).some(a=>
        Math.hypot(game.x(a.tile())-game.x(u.targetTile()),
          game.y(a.tile())-game.y(u.targetTile()))<115)));
    return nukes?'incoming-nuke':lostAssets?'recent-asset-loss':
      peak-land>=Math.max(200,peak*.05)?'recent-territory-loss':null;
  }
  // Recent unconfirmed arrivals are local observations, not permanent proof
  // that every future sea route requires an escort. Historical counters stay
  // cumulative for diagnostics; only these bounded records affect planning.
  function recentLandingRisk(tick,source,dest){
    const observations=[...landingFailures.values()].filter(v=>
      Number.isInteger(v.tile)&&Number.isInteger(v.tick)&&
      tick>=v.tick&&tick-v.tick<=900);
    const near=(a,b)=>Number.isInteger(a)&&Number.isInteger(b)&&
      Math.hypot(game.x(a)-game.x(b),game.y(a)-game.y(b))<115;
    return observations.some(v=>near(v.tile,source)||near(v.tile,dest));
  }
  // Bounded water-only route probe; destination itself is land.
  // TransportShipExecution at official pinned bb8af015 has ticksPerMove=1.
  // A movement step costs one engine tick; actual WaterPathFinder may follow
  // a different or delayed path, so this cannot promise arrival at one tick.
  function navalRouteEstimate(source,dest,maxVisited=1800){
    if(!Number.isInteger(source)||!Number.isInteger(dest)||
      !game?.isWater?.(source))return null;
    const adjacent=[];
    try{const n=game.neighbors4(dest,adjacent);
      if(!Number.isInteger(n)||n<1)return null;
      const targets=new Set(adjacent.slice(0,n).filter(t=>game.isWater(t)));
      if(!targets.size)return null;
      const queue=[source],previous=new Map([[source,null]]);
      for(let head=0;head<queue.length&&head<maxVisited;head++){
        const tile=queue[head];
        if(targets.has(tile)){
          const path=[];let cursor=tile;
          while(cursor!==null){path.push(cursor);cursor=previous.get(cursor);}
          path.reverse();
          const waterSteps=path.length-1;
          return {waterSteps,etaTicksEstimate:waterSteps+1,
            ticksPerMove:1,etaExact:false,
            etaMethod:'official-transport-one-tick-per-move-bfs-route-approximation',path};
        }
        const next=[];const n=game.neighbors4(tile,next);
        for(const neighbor of next.slice(0,n))if(!previous.has(neighbor)&&
          game.isWater(neighbor)){
          previous.set(neighbor,tile);queue.push(neighbor);
        }
      }
    }catch(_){}
    return null;
  }
  function navalRouteAssessment(me,source,dest,tick=number(()=>game.ticks(),0)){
    if(!Number.isInteger(source)||!Number.isInteger(dest))return {
      risk:'unknown-departure',distance:null,etaTicks:null,threats:0,
      escorts:0,uncertaintyUntil:null,method:'visible-time-screen'};
    const distance=(a,b)=>Math.hypot(game.x(a)-game.x(b),game.y(a)-game.y(b));
    const routeDistance=distance(source,dest);
    // This is deliberately a conservative ETA estimate, not pathfinding. The
    // engine remains authoritative about the real water route and destination.
    const estimatedSpeed=Math.max(.5,number(()=>game.config().boatSpeed?.('Transport'),2));
    const estimate=navalRouteEstimate(source,dest);
    const etaTicks=estimate?.etaTicksEstimate??
      Math.max(1,Math.ceil(routeDistance/estimatedSpeed));
    const ships=(game.units?.()||[]).filter(u=>u.isActive?.()&&
      !u.isUnderConstruction?.()&&u.type?.()==='Warship'&&Number.isInteger(u.tile?.()));
    const escorts=ships.filter(u=>safeID(u.owner?.())===safeID(me));
    // Prefer real connected water tiles when the bounded search resolves a
    // path; unknown routes retain the old conservative straight-line proxy.
    const route=estimate?.path;
    const ax=game.x(source),ay=game.y(source),dx=game.x(dest)-ax,dy=game.y(dest)-ay;
    const length2=dx*dx+dy*dy;
    const nearRoute=u=>{
      const x=game.x(u.tile()),y=game.y(u.tile());
      if(route)return route.some(tile=>Math.hypot(x-game.x(tile),
        y-game.y(tile))<70);
      const t=length2?clamp(((x-ax)*dx+(y-ay)*dy)/length2,0,1):0;
      return Math.hypot(x-ax-t*dx,y-ay-t*dy)<70;
    };
    const threats=ships.filter(u=>safeID(u.owner?.())!==safeID(me)&&
      !friendly(u.owner?.(),me)&&nearRoute(u));
    const localEscorts=escorts.filter(u=>nearRoute(u)||
      distance(u.tile(),source)<100||distance(u.tile(),dest)<100);
    const exposed=threats.filter(u=>!localEscorts.some(e=>
      distance(e.tile(),u.tile())<90));
    // Failed transports create uncertainty only around the observed route and
    // only while the evidence is recent. They never globally poison the navy.
    const uncertain=[...landingFailures.values()].filter(v=>
      Number.isInteger(v.tile)&&Number.isInteger(v.tick)&&tick>=v.tick&&tick-v.tick<=900&&
      (distance(v.tile,source)<150||distance(v.tile,dest)<150));
    const uncertaintyUntil=uncertain.length?Math.max(...uncertain.map(v=>v.tick+900)):null;
    const arrivalThreat=exposed.some(u=>distance(u.tile(),dest)<=
      Math.max(70,Math.min(220,etaTicks*estimatedSpeed*.8)));
    const risk=exposed.length?(arrivalThreat?'visible-warship-at-arrival':'unescorted-visible-warship'):
      uncertain.length&&!localEscorts.length?
        'no-local-escort-after-unresolved-landing':null;
    return {risk,distance:Math.round(routeDistance),etaTicks,
      threats:threats.length,unescortedThreats:exposed.length,
      escorts:localEscorts.length,uncertaintyUntil,
      method:estimate?.etaMethod||
        'straight-corridor-time-screen; engine path remains authoritative'};
  }
  function navalRouteRisk(me,source,dest,tick){
    return navalRouteAssessment(me,source,dest,tick).risk;
  }
  // A remote landing can empty the homeland even when no opposing land
  // border is currently visible. Account for other *visible live nations*,
  // excluding the selected victim and actual allies. This is not an estimate
  // of fog-of-war or a guarantee of a future attack.
  function globalNavalHomeGuard(me,target,s,requested,groups=strategic.groups){
    const major=requested>=Math.max(1000,Math.min(200000,s.home*.20));
    const targetID=safeID(target);
    const landContact=groups.some(g=>g.id===targetID&&(g.tiles||[]).length>0);
    // Keep existing Impossible policy stable until this stricter global
    // reserve wins on paired seeds; the optional AI Test can evaluate it.
    if(!major||landContact||(hardMode()&&!opts.impossibleExperiment))
      return {amount:requested,remote:!landContact,
        other:0,reason:hardMode()&&!opts.impossibleExperiment?
          'impossible-experiment-off':'small-or-land-connected'};
    const ownSpawn=me.state?.spawnTile,diag=Math.hypot(game.width(),game.height());
    const visible=(game.playerViews?.()||[]).filter(p=>{
      if(!p?.isAlive?.()||safeID(p)===safeID(me)||safeID(p)===targetID||friendly(p,me))return false;
      const id=safeID(p),contact=(groups||[]).some(g=>g.id===id&&g.tiles?.length);
      const active=(p.outgoingAttacks?.()||[]).some(a=>!a.retreating&&
        attackTargetID(a.targetID)===safeID(me));
      const spawn=p.state?.spawnTile,near=Number.isInteger(ownSpawn)&&Number.isInteger(spawn)&&
        Math.hypot(game.x(ownSpawn)-game.x(spawn),game.y(ownSpawn)-game.y(spawn))<=diag*.55;
      const naval=(game.units?.()||[]).some(u=>u.isActive?.()&&
        safeID(u.owner?.())===id&&['Transport','Warship'].includes(u.type?.())&&
        Number.isInteger(u.targetTile?.())&&ownedTile(u.targetTile(),me));
      return contact||active||near||naval;
    });
    const other=visible.reduce((best,p)=>Math.max(best,
      Math.max(0,number(()=>p.troops?.(),0))),0);
    if(other<=0)return {amount:requested,remote:true,other:0,
      reason:'no-other-visible-nations'};
    const floor=Math.max(s.reserve,s.incoming*1.7,
      Math.min(s.home*.92,other*(hardMode()?.80:.72)));
    const possible=Math.max(0,Math.floor(s.home-floor));
    const amount=Math.min(requested,possible);
    return {amount,remote:true,other,floor,requested,
      reason:amount<requested?'visible-nation-home-reserve':'protected'};
  }
  function landingThirdPartyRisk(me,dest,target,amount){
    try{
      const neighbors=[],count=game.neighbors4(dest,neighbors);
      for(let i=0;i<count;i++){
        const owner=game.owner(neighbors[i]);
        if(!owner?.isPlayer?.()||safeID(owner)===safeID(target)||
          safeID(owner)===safeID(me)||friendly(owner,me))continue;
        if(number(()=>owner.troops(),Infinity)>amount*.85)return true;
      }
    }catch(_){return true;}
    return false;
  }
  async function naval(me,tick,serial) {
    if(!opts.boats||!ctors.boat||tick-lastBoat<100||tick<navalBackoffUntil||pendingAttack||pendingBoat)return false;
    lastBoat=tick;
    const homeRisk=navalHomeRisk(me,tick);
    if(homeRisk){
      decisionNote('marine-pause','Neue Landungen pausiert: '+homeRisk,
        ['Heimat stabilisieren, dann neu bewerten'],tick);
      return false;
    }
    // Use the SAME complete threat snapshot as ground combat. Using military(me)
    // without front groups underestimates the reserve near stronger neighbors.
    for(const [tile,until] of navalSiteNegative)if(tick>=until)navalSiteNegative.delete(tile);
    const navyState=military(me,strategic.groups),spare=navyState.available;
    // Historical transport failures are observations, not proof of why a
    // ship vanished. Pause repeated attempts, then demand a local escort.
    const recentFailures=[...landingFailures.values()].filter(v=>tick-v.tick<1200);
    if(recentFailures.length>=3 &&
      !(game.units?.()||[]).some(u=>u.type?.()==='Warship'&&u.isActive?.()&&
        safeID(u.owner?.())===safeID(me))){
      decisionNote('marine-pause','Wiederholte Landungen ohne Zielbestätigung',
        ['Kriegsschiff bauen und Route erneut prüfen'],tick);
      return false;
    }
    // A cumulative unresolved counter must never veto all future beaches.
    // Repeated recent losses still impose the bounded cooldown above;
    // navalRouteRisk evaluates an escort near each prospective route.
    if(spare<1300 || navyState.incoming>0 || navyState.activeEnemy>0 ||
      recentHostilePressure(tick,260))return false;
    const foes=game.playerViews().filter(p=>safeID(p)!==safeID(me)&&p.isAlive?.()&&
      !friendly(p,me)&&Number.isInteger(p.state?.spawnTile)&&
      // The naval planner must obey the single-front war director as well.
      (!coordinatedWar() || !isWar() || safeID(p)===warState.id));
    foes.sort((a,b)=>{
      const baseA=-Math.min(150,number(()=>a.troops())/Math.max(1,navyState.home)*40);
      const baseB=-Math.min(150,number(()=>b.troops())/Math.max(1,navyState.home)*40);
      return (baseB+neuralActionDelta('naval',baseB,me,navyState,{
          magnitude:clamp(number(()=>b.troops())/Math.max(1,navyState.home)/3,0,1),
          opportunity:clamp(number(()=>b.numTilesOwned())/20000,0,1),
          risk:clamp(number(()=>b.troops())/Math.max(1,navyState.home)/3,0,1)
        }))-
        (baseA+neuralActionDelta('naval',baseA,me,navyState,{
          magnitude:clamp(number(()=>a.troops())/Math.max(1,navyState.home)/3,0,1),
          opportunity:clamp(number(()=>a.numTilesOwned())/20000,0,1),
          risk:clamp(number(()=>a.troops())/Math.max(1,navyState.home)/3,0,1)
        }));
    });
    for(const foe of foes.slice(0,6)){
      if(navyState.strongest>=navyState.home*.85)break;
      if((navalCooldown.get('player:'+safeID(foe))||0)>tick)continue;
      const failures=landingFailures.get('player:'+safeID(foe));
      if(failures?.count>=2&&tick-failures.tick<1800)
        decisionNote('marine-pause','Landungsziel '+nameOf(foe)+
          ': '+failures.count+' unbestätigte Ankünfte',
          ['Andere Küste oder lokale Eskorte erforderlich'],tick);
      const navyRatio=navalCommitmentRatio(me,foe,tick);
      if(spare<number(()=>foe.troops(),Infinity)*navyRatio ||
        number(()=>me.troops())<number(()=>game.config().maxTroops(me),1)*.47)continue;
      let points=[];
      // Prefer the opponent's actual coastal border. An inland spawn is legal
      // as a query, but the engine silently redirects it to another shore and
      // makes both confirmation and strategic targeting unnecessarily vague.
      try{
        const border=await foe.borderTiles?.();
        if(!live(serial))return false;
        const coast=[...(border?.borderTiles||[])].filter(t=>
          game.isLand(t)&&game.isShore?.(t)&&safeID(game.owner(t))===safeID(foe));
        const stride=Math.max(1,Math.floor(coast.length/8));
        for(let i=navalSweep%stride;i<coast.length&&points.length<8;i+=stride)
          points.push(coast[i]);
      }catch(_){}
      if(!points.length)points=[foe.state.spawnTile];
      // Units remain a fallback for clients without borderTiles support.
      for(const u of foe.units?.()||[]){
        const t=u.tile?.();
        if(Number.isInteger(t)&&!points.includes(t)&&points.length<7)points.push(t);
      }
      for(const dest of points){
        if((navalSiteNegative.get(dest)||0)>tick)continue;
        if(!game.isLand(dest)||safeID(game.owner(dest))!==safeID(foe))continue;
        let legal;
        try {legal=await me.actions(dest,['Transport']);}catch(_){continue;}
        if(!live(serial))return false;
        // Alliance, ownership and available troops can all change while the
        // worker is checking a destination. Revalidate the *current* foe.
        const current=game.playerViews?.().find(p=>safeID(p)===safeID(foe));
        if(!current?.isAlive?.() || friendly(current,me) ||
          safeID(game.owner(dest))!==safeID(current) ||
          (coordinatedWar() && isWar() && safeID(current)!==warState.id)){
          telemetry('naval_allied_skip','Landung nach Allianz-/Front-/Eigentümerwechsel verhindert',
            {target:safeID(foe),dest});
          continue;
        }
        const fresh=military(me,strategic.groups);
        if(fresh.incoming>0 || fresh.activeEnemy>0 ||
          fresh.available<number(()=>current.troops(),Infinity)*
           navalCommitmentRatio(me,current,tick) ||
          fresh.ratio<.47)continue;
        const ship=legal?.buildableUnits?.find(x=>x.type==='Transport'&&Number.isInteger(x.canBuild));
        if(!ship || (goldAmount(me)<Number(ship.cost)&&!game.config().infiniteGold?.()))continue;
        const route=navalRouteAssessment(me,ship.canBuild,dest,tick),routeRisk=route.risk;
        if(route.etaTicks!==null)telemetry('marine_eta_proxy',
          'Wasserroute als Näherung berechnet',{target:safeID(current),dest,
            etaTicksEstimate:route.etaTicks,etaExact:false,etaMethod:route.method});
        if(routeRisk||navalHomeRisk(me,number(()=>game.ticks(),tick))){
          decisionNote('marine-pause','Landung nach Sicherheitsprüfung zurückgestellt',
            [routeRisk||'Heimatlage hat sich verändert'],tick);
          continue;
        }
        const history=opponentHistory.get(safeID(current)),previous=history?.previous,
          interval=previous?Math.max(1,history.tick-previous.tick):null,
          growthPerTick=interval?Math.max(0,(history.troops-previous.troops)/interval):0,
          currentEnemy=number(()=>current.troops(),Infinity),
          arrivalEnemy=Math.min(currentEnemy*1.5,currentEnemy+growthPerTick*route.etaTicks);
        const committedWar=isWar()&&warState.id===safeID(current);
        const exposedNavy=opponentTrend(current,tick).sustained&&
          opponentTrend(current,tick).falling&&adversaryWindow(me,current).exposed;
        let amount=Math.floor(Math.min(fresh.available*(committedWar ? .60 : exposedNavy?.66:.36),
          fresh.home*(committedWar ? .58 : exposedNavy?.55:.30)));
        const protectedLanding=offensiveCommitment(strategic.groups,fresh,
          {id:safeID(current),opponent:current},amount);
        amount=protectedLanding.amount;
        const globalGuard=globalNavalHomeGuard(me,current,fresh,amount);
        if(globalGuard.amount<amount){
          telemetry('naval_global_guard','Seeoffensive: Heimatarmee gegen sichtbare Nationen geschützt',
            {target:safeID(current),requested:amount,allowed:globalGuard.amount,
              other:globalGuard.other,floor:globalGuard.floor,
              reason:globalGuard.reason});
          if(globalGuard.amount<number(()=>current.troops(),Infinity)*
            (hardMode()?1.05:.85)){
            navalCooldown.set('player:'+safeID(current),tick+100);
            continue;
          }
        }
        amount=globalGuard.amount;
        // Having a large spare army is not sufficient: the ACTUAL landing
        // contingent must plausibly beat the enemy's fresh home force.
        if(amount<1000||amount<arrivalEnemy*
          (hardMode()?1.05:.85) || fresh.home-amount<fresh.reserve ||
          landingThirdPartyRisk(me,dest,current,amount))continue;
        if(sendMarineTransport(me,dest,amount,
          tick,'LANDUNG → '+nameOf(current),'player:'+safeID(current),route)){
          telemetry('naval_commitment','Landung gegen geschätzte Zielstärke bei Ankunft',
            {target:safeID(current),amount,currentEnemy,arrivalEnemy,route});
          if(exposedNavy)telemetry('naval_window','Anhaltende Drittfront bestätigt',
            {target:safeID(current),amount,trend:opponentTrend(current,tick)});
          return true;
        }
      }
    }
    // No separate war: transport a safe neutral-expansion force to verified
    // unowned coasts only after easy land borders are exhausted. Never use
    // this branch to bypass the single-front director or homeland reserve.
    if(!isWar() && !strategic.groups.some(g=>g.id===null&&!g.fallout) &&
      navyState.activeNeutral===0 && navyState.ratio>=.52 &&
      navyState.strongest<navyState.home*1.20 &&
      spare>=Math.max(1400,navyState.home*.06)){
      for(const dest of neutralNavalCandidates(me)){
        if(!live(serial))return false;
        if((navalSiteNegative.get(dest)||0)>tick)continue;
        let legal;
        try{legal=await me.actions(dest,['Transport']);}catch(_){continue;}
        if(!live(serial))return false;
        const ship=legal?.buildableUnits?.find(x=>
          x.type==='Transport'&&Number.isInteger(x.canBuild));
        if(!ship||!game.isLand(dest)||game.hasFallout?.(dest)||
          game.owner(dest)?.isPlayer?.()||
          safeID(game.owner(dest))!==null){
          if(navalSiteNegative.size>300)navalSiteNegative.clear();
          navalSiteNegative.set(dest,tick+240);
          continue;
        }
        if(!game.config().infiniteGold?.() &&
          goldAmount(me)<Number(ship.cost))continue;
        const route=navalRouteAssessment(me,ship.canBuild,dest,tick);
        if(navalHomeRisk(me,number(()=>game.ticks(),tick))||route.risk)continue;
        const area=neutralIslandEstimate(dest);
        if(area!==null&&area<24){
          navalSiteNegative.set(dest,tick+480);
          continue;
        }
        // Small islands need scouting-size contingents, not six-figure stacks.
        const areaBudget=area===null?navyState.home*.10:
          Math.max(1300,area*35);
        const amount=Math.floor(Math.min(spare*.22,navyState.home*.075,areaBudget));
        // A new neutral beachhead may be worth taking beside a near-peer,
        // but the actual landing must leave a viable army at the home border.
        if(amount<1000 || navyState.home-amount<
          Math.max(navyState.reserve,navyState.strongest*.78))continue;
        if(sendMarineTransport(me,dest,amount,tick,
          'INSEL-EXPANSION → neutrales Küstenland','neutral:'+dest,route)){
          strategicTelemetry.neutralLandings++;
          fleetStatus='Neutrale Insellandung angefordert · Bestätigung ausstehend';
          return true;
        }
      }
    }
    return false;
  }
  // P1 diagnostic observation: a frozen, cycle-specific snapshot of raw state.
  // It never grants additional attack/build permissions.
  function decisionFrame(me,groups,s,tick=number(()=>game?.ticks?.(),-1),requestedTick=tick){
    // The worker border is from requestedTick; resources/armies are read at tick.
    // Preserve both timestamps so delayed worker data is never labelled fresh.
    const opponents=(groups||[]).filter(g=>g.id!==null&&
      g.opponent?.isAlive?.()).slice(0,16).map(g=>Object.freeze({
        id:g.id,front:g.tiles?.length||0,
        troops:number(()=>g.opponent.troops(),0),
        land:number(()=>g.opponent.numTilesOwned(),0),
        friendly:friendly(g.opponent,me),
        history:opponentWindows(g.opponent,tick)
      }));
    return Object.freeze({
      tick,requestedTick,borderAgeTicks:Math.max(0,tick-requestedTick),
      player:safeID(me),gameID:String(game?.gameID?.()??'unknown'),
      home:s.home,reserve:s.reserve,available:s.available,
      committed:s.committed,incoming:s.incoming,
      maxTroops:s.max,gold:goldAmount(me),
      land:number(()=>me.numTilesOwned(),0),
      duoPartner:duoTrustedPeer()?.id||null,
      opponents:Object.freeze(opponents)
    });
  }
  function decisionFrameFresh(frame,tick=number(()=>game?.ticks?.(),-1)){
    return !!frame&&Number.isInteger(tick)&&
      tick>=frame.tick&&tick-frame.tick<=20&&
      frame.player===safeID(myPlayer());
  }
  async function step() {
    const found=discover();
    if(!found){if(game){generation++;game=null;bus=null;opts.enabled=false;persist();status='Warte auf Spiel';}paint();return;}
    if(found.g!==game)reset(found.g,found.b);
    else if(found.b && found.b!==bus){
      // Rebinding listeners on the SAME match is not a new match.
      // reset() deliberately disables the bot, so never call it here.
      bus=found.b;ctors=recognize(bus);lastIntentProbe=-Infinity;
      bindWinnerCapture(bus,ctors);
      reportIntents();
      if(opts.enabled && game.inSpawnPhase?.())
        telemetry('spawn_bus_rebind','Spawnphase: EventBus gewechselt, Bot bleibt aktiv',
          {intents:intentHealth()});
    }
    if(!permittedMatch(game)){
      if(opts.enabled){opts.enabled=false;generation++;persist();}
      status=game?.config?.().isReplay?.()?'Replay: BOT GESPERRT':
        'Unbekannter Spieltyp: BOT GESPERRT';
      paint();return;
    }
    diagnosticDonationUpdates();
    if(game?.gameOver?.()){
      if(opts.enabled||gameEnd?.teamOutcomePending){
        diagnosticCloseHelp('match-end',number(()=>game.ticks(),-1));
        gameEnd=gameOutcome(game,myPlayer());
        learnFinish(gameEnd.outcome);
        telemetry('game_over','Partie beendet · Bot automatisch gestoppt',{gameEnd});
        void exportDiagnosticPackage(true);
        if(opts.enabled){opts.enabled=false;generation++;persist();}
      }
      status='Partie beendet · Bot AUS';paint();return;
    }
    // A player can be eliminated before the whole FFA/Team match ends.
    // Do not treat an already spawned dead player as awaiting spawn.
    const eliminated=myPlayer();
    if(eliminated?.hasSpawned?.()&&eliminated.isAlive?.()===false){
      if(!gameEnd){
        diagnosticCloseHelp('player-elimination',
          number(()=>game.ticks(),-1));
        const team=game?.config?.().gameConfig?.().gameMode==='Team';
        gameEnd={outcome:team?'unknown':'defeat',source:'player-elimination',
          tick:number(()=>game.ticks(),-1),land:0,personalEliminated:true,
          teamOutcomePending:team};
        if(!team)learnFinish('defeat');
        telemetry('game_over',team?'Eigener Spieler eliminiert · Teamergebnis offen':
          'Eigener Spieler eliminiert · Niederlage',{gameEnd});
        void exportDiagnosticPackage(true);
      }
      if(opts.enabled){opts.enabled=false;generation++;persist();}
      status='Spieler eliminiert · Bot AUS';paint();return;
    }
    if(!bus&&found.b){bus=found.b;ctors=recognize(bus);bindWinnerCapture(bus,ctors);reportIntents();}
    // EventBus listeners may register after initial discovery. Retry at a
    // bounded interval while a core intent is missing; never emit probe events.
    if(bus && (intentHealth().critical.length ||
      (opts.enabled&&opts.diplomacy&&opts.offerAlliances&&!ctors.alliance)||
      (opts.enabled&&opts.autoSpawn&&game.inSpawnPhase?.()&&!ctors.spawn))){
      const probeTick=number(()=>game.ticks(),-1);
      const interval=game.inSpawnPhase?.()?6:
        opts.enabled&&opts.diplomacy&&opts.offerAlliances&&!ctors.alliance?80:120;
      if(probeTick>=0 && probeTick-lastIntentProbe>=interval){
        lastIntentProbe=probeTick;ctors=recognize(bus);bindWinnerCapture(bus,ctors);reportIntents();
      }
    }
    if(conflicts()){opts.enabled=false;status='Andere AggroBot-Version aktiv – alte Skripte deaktivieren';paint();return;}
    if(advisorConflict()){opts.enabled=false;status='Spawn Advisor: Auto-Spawn/Smart Attack/Auto-Accept ausschalten';paint();return;}
    maybeAutoStart();
    if(opts.enabled&&game.inSpawnPhase?.()&&opts.autoSpawn){
      if(!bus?.emit)spawnBlock('EventBus noch nicht verfügbar');
      else if(!ctors.spawn)spawnBlock('Spawn-Intent nicht erkannt');
    }
    if(!opts.enabled||busy||!connected()){paint();return;}
    // Keep observing confirmations and refreshing strategy even when the
    // combat-specific action budget is exhausted. send() enforces the cap.
    const tick=number(()=>game.ticks(),-1);
    if(tick<0||tick===lastTick){paint();return;}
    lastTick=tick;busy=true;const serial=generation,t0=performance.now();
    try {
      const spawnMe=myPlayer();
      if(spawnState.lastSent && spawnMe?.hasSpawned?.() &&
        spawnState.phase!=='Bestätigt'){
        spawnState.phase='Bestätigt';
        const actual=spawnMe.state?.spawnTile;
        telemetry('spawn_confirmed','Spawn im Spielzustand bestätigt',
          {spawn:{...spawnState.lastSent,actualTile:Number.isInteger(actual)?actual:null,
            moved:Number.isInteger(actual)&&actual!==spawnState.lastSent.tile}});
      }
      if(game.inSpawnPhase?.()){
        status=game.config().isRandomSpawn?.()?'Zufallsspawn durch Spielserver':
          'Auto-Spawn · '+spawnState.phase;
        doSpawn(tick);return;
      }
      const me=myPlayer();
      if(!me?.isAlive?.()||!me.hasSpawned?.()){status='Warte auf Spawn';return;}
      learnObserve(tick,me,troopSnapshot,autoTuning.mode);
      sampleTroops(tick,me);sampleIncome(me,tick);inspectMarine(me,tick);victoryPlan(me);confirmAttack(me,tick);observeAttackOrigins(me,tick);evaluateLastBattle(tick,me);
      let immediateState=military(me,strategic.groups);
      rememberHostilePressure(immediateState,tick);
      // Tune immediately even if emergencyRetreat returns before the normal
      // strategy pass: a dangerous invasion must override ASSAULT right now.
      if(opts.fullAuto && immediateState.incoming>Math.max(1,immediateState.home)*.18)
        immediateState=tuneAutonomously(me,strategic.groups,immediateState,tick,
          {wanted:'DEFEND',rebuilding:true});
      // Save committed troops BEFORE any asynchronous worker border request.
      if(emergencyRetreat(me,tick,immediateState))return;
      const tiles=await borders(me,tick);
      if(!live(serial))return;
      // Refuse a slow worker result from an older decision window.
      const observedTick=number(()=>game?.ticks?.(),-1);
      if(observedTick<tick||observedTick-tick>20||
        safeID(myPlayer())!==safeID(me)){
        telemetry('decision_snapshot_expired',
          'Worker-Ergebnis veraltet; neue Entscheidungsrunde abwarten',
          {requestedTick:tick,observedTick,player:safeID(me),
            currentPlayer:safeID(myPlayer())});
        return;
      }
      const groups=targetsFromBorder(me,tiles);
      observeFronts(me,groups,tick);
      observeOpponents(me,tick);
      observeHumanProfiles(me,tick);
      observeVictoryThreat(me,tick);
      let s=military(me,groups);rememberHostilePressure(s,tick);troopSnapshot=s;
      lastDecisionFrame=decisionFrame(me,groups,s,observedTick,tick);
      strategic.groups=groups;
      coordinateDuo(me,s,tick);
      manageWar(me,groups,s,tick);
      const context=strategy(me,groups,s);
      s=tuneAutonomously(me,groups,s,tick,context);
      troopSnapshot=s;
      coordinateDuo(me,s,tick);
      diagnosticHelpObservation(me,tick);
      planOperation(me,groups,s,tick);
      if(tick-lastDiagnosticTick>=80){lastDiagnosticTick=tick;
        telemetry('snapshot','Spielzustand',{difficulty:game.config().gameConfig().difficulty,
          gameType:game.config().gameConfig().gameType,matchContext:matchContext(me),
          decisionFrame:lastDecisionFrame,
          defenseEvidence:{
            incomingAttacks:(me.incomingAttacks?.()||[]).filter(a=>!a.retreating)
              .map(a=>({
                attackerId:attackTargetID(a.attackerID)??null,
                troops:number(()=>a.troops,null),
                ...diagnosticArrival([a])})).slice(0,40),
            incomingTotal:s.incoming,home:s.home,reserve:s.reserve,
            available:s.available,committed:s.committed,
            outgoingRecallCandidates:(me.outgoingAttacks?.()||[])
              .filter(a=>!a.retreating).map(a=>({
                stackId:a.id,targetId:attackTargetID(a.targetID),
                troops:number(()=>a.troops,null)})).slice(0,40),
            warningLevel:duoWarningLevel(s,tick),
            helpRequestId:diagnosticHelpId,
            estimatedSupportDeficit:Math.max(0,Math.ceil(s.incoming*1.3-s.home)),
            evidence:'gameview-state-not-predicted-survival'},
          investment:investmentStatus,
          cities:ownStructures(me).filter(u=>u.type?.()==='City').length,
          factories:ownStructures(me).filter(u=>u.type?.()==='Factory').length,
          borders:tiles.length,tuning:{...autoTuning,enabled:!!opts.fullAuto},defense:{status:defenseStatus,incoming:s.incoming,
            committed:s.committed,pendingRetreats:retreatRequests.size},enemies:groups.filter(g=>g.id!==null&&!me.isOnSameTeam?.(g.opponent)).map(g=>({name:nameOf(g.opponent),troops:number(()=>g.opponent.troops()),land:number(()=>g.opponent.numTilesOwned())})),
          readiness:context.readiness?.reason,ratio:s.ratio,maxTroops:s.max,growthPotential:s.growthPotential,
          victory:winStatus,victoryThreat,operation,duoPlan,
          opponentProfiles:[...opponentProfiles.values()],
          decisions:decisionTimeline.slice(-8),income:incomeStatus,
          trade:{status:tradeStatus,stats:{...tradeStats},
            botEmbargoes:[...botEmbargoes],assessments:tradeAssessments},strategicTelemetry,
          attackBlockReport,crisisTrend,neuralEvidence:{...neuralEvidence,model:neuralModelInfo()},
          neuralDecisionEvidence,coreFunding,economyProbe:lastEconomyProbeReport,
          economyBudgetEvidence,shadowDecisionEvidence,
           director:lastDirectorDecision,economyPosture:lastEconomyPosture,
          forecastAudit:lastForecastAudit,
          recentIncomeSamples:incomeAttribution.slice(-4).map(v=>({...v})),
          fleet:fleetStatus,
          economicEvidence:{
            gold:goldAmount(me),trainGold:incomeStatus.train??null,
            tradeGold:incomeStatus.trade??null,
            pending:economicPending?{actionId:economicPending.actionId??null,
              type:economicPending.type,kind:economicPending.kind,
              tile:economicPending.tile,quotedCost:economicPending.cost,
              status:'requested-not-confirmed'}:null,
            lastWorkerProbe:lastEconomyProbeReport,
            unknownActualSpend:true},
          marine:{stats:{...marineStats},pendingBoat:pendingBoat?{...pendingBoat}:null,
            pendingWarship:pendingWarship?{...pendingWarship}:null,
            ports:ownStructures(me).filter(u=>u.type?.()==='Port').length,
            warships:(game.units?.()||[]).filter(u=>u.type?.()==='Warship'&&
              safeID(u.owner?.())===safeID(me)&&u.isActive?.()).length,
            portProbeFailures},
          nuclear:{enemySilos:nuclearIntel(me).enemySilos.length,
            incomingNukes:nuclearIntel(me).incomingNukes.length,
            uncovered:nuclearIntel(me).uncovered.length,
            alliedUncovered:nuclearIntel(me).allyUncovered.length,
            ownSAM:nuclearIntel(me).sams.filter(u=>safeID(u.owner?.())===safeID(me)).length}});}

      if(plan&&tick>=plan.until)plan=null;
      status='Strategie: '+context.wanted+' · Heim '+Math.round(s.home/10)+
        ' · Reserve '+Math.round(s.reserve/10)+' · Front '+Math.round(s.committed/10);
      const ranked=rankedTargets(groups,me,tick,s,context);
      const planning=strategicCandidatePlan(me,groups,s,context,ranked,tick);
      // P0: preserve pending frames until receipt/horizon resolution.
      // resolveDecisionFrames() compacts ONLY resolved history in finally.
      decisionFrames.push(planning);
      reportAttackBlocks(me,groups,s,context,ranked,tick);
      // Do not open a new front while the homeland is under heavy assault.
      const dangerNow=defenseAssessment(me,s,tick);
      if(dangerNow.severe){planning.blockReasons=['heavy-assault-hold'];
        await fleetDefense(me,tick,serial);
        status='NOTVERTEIDIGUNG · Heimtruppen halten / Angriffe zurückrufen';return;}
      if(await defense(me,tick,serial,groups,s))return;
      if(await fleetDefense(me,tick,serial))return;
      if(teamSupport(me,tick,s))return;
      // Economy has its own scheduler and cannot block the combat planner.
      const directive=strategicDirector(me,s,context,ranked,tick,planning);
      if(!lastDirectorDecision||lastDirectorDecision.order[0]!==directive.order[0]||
        lastDirectorDecision.economy!==directive.economy){
        telemetry('director_decision',directive.reason,{order:directive.order,
          economy:directive.economy,landCandidates:directive.landCandidates,
          enemyCandidates:directive.enemyCandidates,threatened:directive.threatened,
          planning:directive.planning});
      }
      lastDirectorDecision=directive;
      if(directive.order[0]==='hold') {
        planning.blockReasons=[directive.reason||'hold'];
        decisionNote('warte',directive.reason,[
          'Nächster Schritt: Reserve regenerieren oder Frontlage ändern'],tick);
        status='AUFBAU · Truppen regenerieren / Verteidigung halten';
        return;
      }
      for(const channel of directive.order) {
        if(channel==='land' && await attack(me,tick,serial,ranked,s)){
          consecutiveIdle=0;return;
        }
        if(channel==='naval' && !context.underAttack &&
          await naval(me,tick,serial)){consecutiveIdle=0;return;}
      }
      consecutiveIdle++;
      planning.blockReasons=[directive.reason||'hold','no-channel-action'];
      if(consecutiveIdle>4){status='WARTEN · '+directive.reason;
        decisionNote('warte',directive.reason,[
          ranked.length?'Ziel verworfen: Worker, Reserve oder Frontlage':'Kein sicherer Angriffskandidat',
          'Nächster Schritt: Verteidigung / Wirtschaft / Marine prüfen'],tick);
      }
    } catch(e){errors++;status='Fehler: '+String(e?.message||e).slice(0,105);
      console.warn(PREFIX,e);
      if((opts.stopOnError||opts.safeMode)&&errors>=5){
        opts.enabled=false;generation++;persist();status='Not-Aus: 5 Laufzeitfehler';
      }} finally {runtime.combatMs=Math.round(performance.now()-t0);busy=false;
      resolveDecisionFrames(tick);paint();}
  }
  async function economyStep() {
    if(economyBusy || !opts.enabled || !opts.economy || !connected())return;
    const me=myPlayer(),tick=number(()=>game.ticks(),-1);
    if(!me?.isAlive?.() || !me.hasSpawned?.() || game.inSpawnPhase?.() || tick<0)return;
    // Always poll pending construction on the fast path: the game exposes a
    // newly built unit immediately, long before its build animation completes.
    if(economicPending && pendingEconomy(tick,ownStructures(me)))return;
    if(!actionBudget() || tick-lastEconomy<35 || tick-lastEconomyProbe<18)return;
    economyBusy=true;const serial=generation,t0=performance.now();
    try {
      const tiles=await borders(me,tick);
      if(!live(serial))return;
      await economy(me,tick,serial,tiles);
    }catch(e){console.warn(PREFIX,'Economy',e);economicStatus='Fehler: '+String(e?.message||e).slice(0,55);}
    finally {runtime.economyMs=Math.round(performance.now()-t0);economyBusy=false;paint();}
  }
