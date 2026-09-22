'use strict';
// Reusable, side-effect-free panel selectors, directly imported by Node tests.
// DUO-STATUS-BEGIN
  function duoStatusView(enabled,trusted,plan,tick,local){
    if(!enabled)return {phase:'off',reason:'Duo deaktiviert'};
    if(!trusted)return {phase:local?.seenPeer||local?.relayDrops>0?
      'autonomous-fallback':'waiting-ack',reason:'kein frisch bestätigter Relay-Partner'};
    if(plan?.planId&&Number.isInteger(plan.expiresTick)&&tick>plan.expiresTick)
      return {phase:'expired',reason:'Planfrist überschritten'};
    if(plan?.planId&&plan.partnerAck&&plan.ready)
      return {phase:'ready',reason:'frischer Partner-ACK und sicherer Plan'};
    return {phase:'waiting-ack',reason:plan?.planId?
      'Partner-ACK oder sichere Front fehlt':'noch kein gemeinsamer Angriffsplan'};
  }
// DUO-STATUS-END
// EVIDENCE-STATE-BEGIN
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
// EVIDENCE-STATE-END
module.exports={duoStatusView,evidencePanelState};
