'use strict';
// P4 Collapse-Wächter (plan.md P4.4 + P4.5):
// Deterministische Erkennung degenerierter Lern-Kategorien aus einem
// protokollierten Match-Report (match.json-Struktur), plus Trennung von
// Trainings-/Suchsignalen und dem entscheidenden Promotions-Signal.
//
// Die acht P4.4-Kategorien werden jeweils mit einer eigenen, nachvollziehbaren
// Bedingung auf echten Diagnostic-Feldern erkannt (kein LLM-Guess):
//   passive_hold_spam, blind_rush, gold_hoarding, missing_city_building,
//   alliance_errors, endless_war_lock, pure_survival, faulty_marine_eta
//
// P4.5: Der bestätigte Match-Outcome ist das entscheidende Promotions-Signal.
// Gehaltene Land-/Öko-/Verlust-/Überlebens-Größen sind nur AUXILIARE Such-
// Signale. Ein Tick-Limit zählt als zensiert (Outcome unbekannt → nicht
// entscheidend). Training ist damit explizit von Promotion getrennt.

const EARLY_TICK = 300;          // Krieg/Kolonie "früh" = Rush-Indikator
const HOARD_GOLD = 40000;        // Gold ohne Baufortschritt = Horten
const LOW_LAND_RATIO = 0.08;     // Land/Tick unter Wert = kaum Expansion
const LOW_LAND_ABS = 4;          // absolute Untergrenze für "kaum Land"

const CATEGORIES = Object.freeze([
  'passive_hold_spam','blind_rush','gold_hoarding','missing_city_building',
  'alliance_errors','endless_war_lock','pure_survival','faulty_marine_eta']);

function isObj(v){return v&&typeof v==='object'&&Array.isArray(v)===false;}
function topPlanning(d){
  const list=Array.isArray(d?.planning?.candidates)?d.planning.candidates:[];
  if(!list.length)return null;
  let best=null;
  for(const c of list){
    if(!isObj(c)||typeof c.utility!=='number')continue;
    if(best===null||c.utility>best.utility)best=c;
  }
  return best;
}
function landRatio(match,b){
  const tick=Number(match.run?.tick)||0;
  if(tick<=0)return 0;
  const land=Number(b.land)||0;
  return land/tick;
}
function teamMode(match){
  // Zuverlässiges Signal: die engine-config gameMode (FFA = 'Free For All',
  // Team = 'Team'). FFA-Lineups tragen trotzdem teamIndex 0/1 → nicht verwenden.
  const g=match.benchmarkMeta?.gameMode
    ??match.benchmarkMeta?.gameConfig?.gameMode;
  return g==='Team';
}

// Eine degenerierte Kategorie → {flagged, reason, evidence}.
function detect(category,match,b){
  const d=b.diagnostics||{};
  const income=d.income||{};
  const construction=d.construction||{};
  const war=d.war||{};
  const marine=d.marine||{};
  const military=d.military||{};
  const defense=d.defense||{};
  const localDuo=d.localDuo||{};
  const top=topPlanning(d);
  const gold=Number(income.netGold??income.gold)||0;
  const land=Number(b.land)||0;
  const ratio=landRatio(match,b);
  const censored=match.run?.termination==='tick-limit'||match.gameEnd==null;
  const noBuildPending=!construction.pending;
  const missingCity=Array.isArray(construction.coreFunding?.missing)
    ?construction.coreFunding.missing.includes('City')
    :false;
  const lowLand=land<LOW_LAND_ABS||ratio<LOW_LAND_RATIO;
  const holdDominant=top?.kind==='hold';
  const earlyWar=war.since!=null&&war.since<EARLY_TICK;
  const inWar=war.id!=null;
  const ev=(o)=>o;

  switch(category){
    case 'passive_hold_spam':
      // Hält, hat Gold zum Bauen/Handeln, baut aber nichts und expandiert kaum.
      return holdDominant&&noBuildPending&&gold>HOARD_GOLD&&lowLand
        ?{flagged:true,
          reason:'Hold ist bester Plan, Geld da, aber kein Bau und kaum Land',
          evidence:ev({topCandidate:top?.kind,utility:top?.utility,gold,land,
            constructionPending:construction.pending,landRatio:+ratio.toFixed(4)})}
        :{flagged:false,reason:'kein passiver Hold-Spam',
          evidence:ev({topCandidate:top?.kind,gold,land,noBuildPending,lowLand})};
    case 'blind_rush':
      // Sehr früh Krieg, aber noch keine Stadt/Kern gebaut → blinder Rush.
      return earlyWar&&missingCity&&lowLand
        ?{flagged:true,reason:'Früher Krieg ohne gebauten Kern und kaum Land',
          evidence:ev({warSince:war.since,missingCity,land,
            warId:war.id??null,landRatio:+ratio.toFixed(4)})}
        :{flagged:false,reason:'kein blinder Rush',
          evidence:ev({warSince:war.since??null,missingCity,land})};
    case 'gold_hoarding':
      // Viel Gold, aber kein Baufortschritt und kaum Land → Horten.
      return gold>HOARD_GOLD&&noBuildPending&&lowLand
        ?{flagged:true,reason:'Hohes Gold ohne Bau- oder Expansionsfortschritt',
          evidence:ev({gold,netGold:income.netGold??null,
            constructionPending:construction.pending,land})}
        :{flagged:false,reason:'kein Gold-Horten',
          evidence:ev({gold,constructionPending:construction.pending,land})};
    case 'missing_city_building':
      // Kernstadt fehlt und wird nicht gebaut → Städte-Fortschritt fehlt.
      return missingCity&&noBuildPending
        ?{flagged:true,reason:'Kernstadt fehlt und kein Bau in Arbeit',
          evidence:ev({missing:construction.coreFunding?.missing??[],
            constructionPending:construction.pending,
            investment:construction.investment??null})}
        :{flagged:false,reason:'Städtebau vorhanden',
          evidence:ev({missing:construction.coreFunding?.missing??[],
            constructionPending:construction.pending})};
    case 'alliance_errors':
      // Nur in 2v2: Duo/Allianz nicht verbunden, obwohl Team-Mitglied.
      if(!teamMode(match))
        return {flagged:false,reason:'kein 2v2-Modus',
          evidence:ev({teamMode:false})};
      return localDuo.connected===false
          &&isObj(localDuo.phase)
          &&localDuo.phase.phase!=='on'
        ?{flagged:true,reason:'Team-Mitglied, aber Duo/Allianz nicht aktiv',
          evidence:ev({teamIndex:b.teamIndex,duoStatus:localDuo.status,
            connected:localDuo.connected,phase:localDuo.phase?.phase})}
        :{flagged:false,reason:'keine erkennbare Allianz-Fehlerlage',
          evidence:ev({teamIndex:b.teamIndex,connected:localDuo.connected})};
    case 'endless_war_lock':
      // Dauerkrieg seit Anfang, zensiert (Tick-Limit), immer noch am Leben.
      return inWar&&earlyWar&&censored&&b.alive===true
        ?{flagged:true,reason:'Früh eingeleiteter Krieg bis zum Tick-Limit ungeklärt',
          evidence:ev({warId:war.id,warSince:war.since,censored,alive:b.alive})}
        :{flagged:false,reason:'kein endloser Kriegslust-Verdacht',
          evidence:ev({warId:war.id??null,warSince:war.since??null,
            censored,alive:b.alive})};
    case 'pure_survival':
      // Kein Krieg, Hold-dominant, kaum Land → scheinbar sicheres Überleben.
      return !inWar&&holdDominant&&lowLand
        ?{flagged:true,reason:'Kein Krieg, Hold-dominant, kaum Expansion',
          evidence:ev({warId:war.id??null,topCandidate:top?.kind,land,
            landRatio:+ratio.toFixed(4),
            retreatsObserved:defense.stats?.retreatsObserved??0})}
        :{flagged:false,reason:'kein reines Überlebens-Verhalten',
          evidence:ev({warId:war.id??null,holdDominant,land})};
    case 'faulty_marine_eta':
      // Marine-Transports versendet, aber keine Brückenkopfe gehalten.
      const sent=Number(marine.stats?.transportSent)||0;
      const held=Number(marine.stats?.bridgeheadHeld)||0;
      const unconfirmed=Number(marine.stats?.transportUnconfirmed)||0;
      const landFail=Array.isArray(d.landingFailures)
        ?d.landingFailures.length:0;
      return sent>0&&held===0&&(unconfirmed>0||landFail>0)
        ?{flagged:true,reason:'Marine-Transports ohne gehaltenen Brückenkopf',
          evidence:ev({transportSent:sent,bridgeheadHeld:held,
            transportUnconfirmed:unconfirmed,landingFailures:landFail})}
        :{flagged:false,reason:'keine fehlerhaften Marine-ETA erkennbar',
          evidence:ev({transportSent:sent,bridgeheadHeld:held,
            transportUnconfirmed:unconfirmed})};
    default:
      throw Error('Unknown collapse category '+category);
  }
}

// Evaluieren der acht Kategorien für einen Bot. botIndex = der zu prüfende Bot
// (Standard: der Modell-Teilnehmer mit Index 0).
function watchBot(match,b,index){
  const flags=CATEGORIES.map(c=>({category:c,...detect(c,match,b)}));
  return {botIndex:index,clientID:b.clientID??null,
    archetype:b.archetype??null,land:b.land??null,alive:b.alive??null,
    outcome:b.outcome??null,flags,
    flaggedCategories:flags.filter(f=>f.flagged).map(f=>f.category)};
}

// Alle Bot-Teile evaluieren; defaultFocus=0 gibt den Modell-Teilnehmer.
function watch(match,{focus=0}={}){
  const bots=Array.isArray(match.fullBots)?match.fullBots:[];
  if(!bots.length)throw Error('watch() requires fullBots[]');
  const perBot=bots.map((b,i)=>watchBot(match,b,i));
  const focusResult=perBot[focus]??perBot[0];
  return {schema:'collapse-watch-v1',censored:
    match.run?.termination==='tick-limit'||match.gameEnd==null,
    termination:match.run?.termination??'unknown',
    focus,
    bots:perBot,focusBot:focusResult,
    flaggedCategories:focusResult?.flaggedCategories??[],
    summary:{totalFlagged:focusResult?.flaggedCategories.length??0,
      flagged:focusResult?.flaggedCategories??[]}};
}

// P4.5: Promotions- vs. Such-Signal trennen.
//  - decisiveness: der BESTÄTIGTE Match-Outcome entscheidet über Release.
//  - auxiliary: gehaltene Land-/Öko-/Verlust-/Überlebens-Größen sind nur
//    Suchsignale (Training), nie allein entscheidend.
//  - censored: Tick-Limit → Outcome unbekannt → nicht entscheidend.
function assessPromotion(match,b,index=0){
  const censored=match.run?.termination==='tick-limit'||match.gameEnd==null;
  const outcome=match.gameEnd?.outcome??null;
  let promotionSignal;
  if(censored)promotionSignal='censored-tick-limit';
  else if(outcome)promotionSignal='confirmed-'+String(outcome);
  else promotionSignal='unknown';
  const d=(b.diagnostics||{});
  const income=d.income||{};
  const military=d.military||{};
  return {schema:'promotion-vs-auxiliary-v1',botIndex:index,
    censored,decisive:!censored,promotionSignal,outcome,
    note:censored
      ?'Tick-Limit zensiert den Outcome; nur Suchsignal, nicht release-entscheidend'
      :'Bestätigter Match-Outcome ist das release-entscheidende Signal',
    auxiliary:{
      heldLand:Number(b.land)||0,
      economicEffect:Number(income.netGold??income.gold)||0,
      troopLosses:military.strongest!=null
        ?Math.max(0,(Number(military.max)||0)-(Number(military.strongest)||0))
        :null,
      survival:b.alive??null,
      landRatio:+((match.run?.tick||0)>0?(Number(b.land||0)/(match.run.tick)):0).toFixed(4)
    }};
}

module.exports={CATEGORIES,EARLY_TICK,HOARD_GOLD,LOW_LAND_RATIO,LOW_LAND_ABS,
  watchBot,watch,assessPromotion,detect};
