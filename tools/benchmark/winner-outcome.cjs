'use strict';

// The userscript's local game-end detection is diagnostic, not authoritative.
// Only an official engine WinUpdate or confirmed player elimination may mark a
// match as complete. This prevents tick-limited smokes from fabricating wins.
function winnerOutcome(winner,player){
  if(winner==null)return 'incomplete';
  if(!Array.isArray(winner)||winner.length!==2||typeof winner[1]!=='string')
    return 'unknown';
  if(!player)return 'unknown';
  if(winner[0]==='player')
    return player.clientID?.()===winner[1]?'victory':'defeat';
  if(winner[0]==='team'){
    const team=player.team?.();
    const id=typeof team==='string'?team:
      (typeof team?.id==='function'?team.id():team?.id??null);
    if(id==null)return 'unknown';
    return String(id)===winner[1]?'victory':'defeat';
  }
  return 'unknown';
}

function applyEngineOutcome(report,{hasWinUpdate=false,winner=null,player=null,
  tick,land=0,spawned=false}){
  if(report.gameEnd!==undefined){
    report.botReportedGameEnd=report.gameEnd;
    delete report.gameEnd;
  }
  if(hasWinUpdate){
    report.gameEnd={outcome:winnerOutcome(winner,player),
      source:'engine-WinUpdate',tick,land};
  }else if(spawned&&player?.isAlive?.()===false){
    report.gameEnd={outcome:'defeat',source:'engine-elimination',
      tick,land,reason:'Player eliminated after confirmed spawn'};
  }
  return report;
}

module.exports={winnerOutcome,applyEngineOutcome};
