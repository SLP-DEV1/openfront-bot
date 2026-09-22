'use strict';

// Winner is ['player', clientID] or ['team', teamID], not a list of winners.
// Resolve team membership from the actual player view, never lineup indices.
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
      (team?.id?.()??team?.id??null);
    if(id==null)return 'unknown';
    return String(id)===winner[1]?'victory':'defeat';
  }
  return 'unknown';
}

module.exports={winnerOutcome};
