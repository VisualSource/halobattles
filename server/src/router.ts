import removePlayer from "#procedure/lobby/removePlayer.js";
import updatePlayer from '#procedure/lobby/updatePlayer.js';
import getPlayerState from '#procedure/getPlayerState.js';
import getPlayers from "#procedure/lobby/getPlayers.js";
import startGame from "#procedure/lobby/startGame.js";
import addPlayer from '#procedure/lobby/addPlayer.js';
import updateGroup from '#procedure/updateGroups.js';
import { t, subscription } from '#lib/context.js';
import moveGroup from '#procedure/moveGroup.js';
import getMap from '#procedure/getMap.js';


export const router = t.router({
    removePlayer,
    addPlayer,
    updatePlayer,
    getPlayers,
    startGame,
    onAddPlayer: subscription("addPlayer"),
    onRemovePlayer: subscription("removePlayer"),
    onUpdatePlayer: subscription("updatePlayer"),



    getMap,
    moveGroup,
    getPlayerState,
    updateGroup,
    onMoveGroup: subscription("moveGroup"),
    onStartGame: subscription("startGame"),
    onEndGame: subscription("endGame"),
    onTransfer: subscription("transfer")
});

