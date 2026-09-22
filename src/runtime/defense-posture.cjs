'use strict';
// Defense posture state machine (V6 Phase 2): NORMAL / THREATENED /
// CRITICAL / RECOVERING. Pure, side-effect-free transition core so Node
// tests can import it directly; tools/build-userscript.cjs inlines the
// marked block VERBATIM into the Solo userscript, so shipped and tested
// logic cannot drift (same pattern as src/runtime/panel-state.cjs).
//
// The fixed 1M-troop mega-attack scale is one CRITICAL entry signal
// among four (S3) and requires corroborating relative evidence; exit is
// driven by sustained stabilization, never by the 1M threshold alone.
// DEFENSE-POSTURE-BEGIN
  const DEFENSE_POSTURES=['NORMAL','THREATENED','CRITICAL','RECOVERING'];
  const POSTURE_CONSTANTS={
    // Absolute mega-attack scale. Deliberately NOT the sole CRITICAL
    // entry/exit condition (signal S3 below needs corroboration).
    MEGA_ATTACK:1e6,
    // Sustained stabilization required before leaving CRITICAL.
    CRITICAL_EXIT_TICKS:60,
    // Minimum vigilance after a crisis; hard cap before NORMAL is allowed.
    RECOVER_MIN_TICKS:120,
    RECOVER_MAX_TICKS:900};
  // sig: {incoming, home, strongest, landLoss, crisis, pressure}
  //   incoming  hostile incoming troops (unfiltered attack updates)
  //   home      home troops
  //   strongest strongest hostile army (observed or remembered)
  //   landLoss  fraction of tiles lost in the recent window (0..1)
  //   crisis    observed land/asset loss trend still active (boolean)
  //   pressure  hostile pressure observed within the recent window (boolean)
  // Unknown recall and ETA are NOT inputs: in-flight troops stay where the
  // engine reports them; nothing is credited until observed at home.
  function postureSignals(sig){
    const home=Math.max(1,Number(sig.home)||0);
    const inc=Math.max(0,Number(sig.incoming)||0);
    const strongest=Math.max(0,Number(sig.strongest)||0);
    const landLoss=Math.min(1,Math.max(0,Number(sig.landLoss)||0));
    const ratio=inc/home;
    const signals=[];
    if(inc>0&&ratio>=.80)signals.push('S1-ratio-overwhelm');
    if(ratio>=.40&&landLoss>=.075)signals.push('S2-relative-loss');
    if(inc>=POSTURE_CONSTANTS.MEGA_ATTACK&&(landLoss>0||ratio>=.12||
      strongest>home))signals.push('S3-mega-attack');
    if(sig.crisis&&inc>0&&strongest>home*.8)signals.push('S4-crisis-pressure');
    return {ratio,landLoss,signals,
      critical:signals.length>0,
      threatened:inc>0&&(ratio>=.23||landLoss>=.035||(sig.pressure&&ratio>=.15))};
  }
  // prev: {state, entered, stableSince} ; tick: current game tick.
  // Escalation is immediate (binding); de-escalation requires sustained
  // stabilization so a single calm tick cannot clear a live crisis.
  function postureStep(prev,sig,tick){
    const from=DEFENSE_POSTURES.includes(prev?.state)?prev.state:'NORMAL';
    const entered=Number.isFinite(prev?.entered)?prev.entered:-Infinity;
    let stableSince=prev?.stableSince??null;
    const {ratio,signals,critical,threatened}=postureSignals(sig);
    const inc=Math.max(0,Number(sig.incoming)||0);
    const stabilized=inc===0||(ratio<.35&&(sig.landLoss||0)<.01);
    let state=from,reason='';
    if(state==='CRITICAL'){
      if(critical){
        stableSince=null;reason='Kritische Signale aktiv: '+signals.join('+');
      } else if(stabilized){
        stableSince=stableSince==null?tick:stableSince;
        if(tick-stableSince>=POSTURE_CONSTANTS.CRITICAL_EXIT_TICKS){
          state='RECOVERING';reason='Stabilisierung ≥'+
            POSTURE_CONSTANTS.CRITICAL_EXIT_TICKS+' Ticks bestätigt';
        } else reason='Stabilisierung läuft ('+
          (tick-stableSince)+'/'+POSTURE_CONSTANTS.CRITICAL_EXIT_TICKS+' Ticks)';
      } else stableSince=null;
    } else if(state==='RECOVERING'){
      if(critical){
        state='CRITICAL';reason='Neues kritisches Signal in Erholung: '+
          signals.join('+');
      } else if(threatened){
        reason='Erholung mit anhaltendem Druck – Vigilanz halten';
      } else if(inc===0&&ratio<.10&&!sig.crisis&&(sig.landLoss||0)===0&&
        tick-entered>=POSTURE_CONSTANTS.RECOVER_MIN_TICKS){
        state='NORMAL';reason='Erholung abgeschlossen, Lage ruhig';
      } else if(tick-entered>=POSTURE_CONSTANTS.RECOVER_MAX_TICKS){
        state='NORMAL';reason='Erholungszeitlimit erreicht ('+
          POSTURE_CONSTANTS.RECOVER_MAX_TICKS+' Ticks)';
      } else reason='Wiederaufbau nach Krise – Reserve halten';
    } else if(state==='THREATENED'){
      if(critical){
        state='CRITICAL';reason=' Eskalation: '+signals.join('+');
      } else if(inc===0||(ratio<.10&&(sig.landLoss||0)===0)){
        state='NORMAL';reason='Druck abgeklungen';
      } else reason='Bedrohung aktiv – offensive Handlungen zurückhalten';
    } else {
      if(critical){
        state='CRITICAL';reason='Kritische Signale: '+signals.join('+');
      } else if(threatened){
        state='THREATENED';reason='Eingehender Druck '+Math.round(ratio*100)+
          '% der Heimtruppen';
      } else reason='Keine aktive Bedrohung';
    }
    // State-entry clock: RECOVERING starts a fresh recovery clock when
    // entered from CRITICAL; CRITICAL/THREATENED restart on (re)entry.
    const nextEntered=(state!==from)?tick:entered;
    return {state,entered:nextEntered,stableSince:
      state==='CRITICAL'?stableSince:null,
      signals,critical,threatened,ratio,
      changed:state!==from,from,reason};
  }
// DEFENSE-POSTURE-END
module.exports={DEFENSE_POSTURES,POSTURE_CONSTANTS,postureSignals,postureStep};
