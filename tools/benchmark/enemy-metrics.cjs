'use strict';

function hostilePlayers(players,me){
  if(!me)return [];
  const ownClientID=me.clientID?.();
  return (players||[]).filter(player=>{
    if(!player||player.clientID?.()===ownClientID||!player.isAlive?.())return false;
    try {
      return typeof me.isFriendly==='function'?!me.isFriendly(player):true;
    } catch (_) {
      return true;
    }
  });
}

module.exports={hostilePlayers};
