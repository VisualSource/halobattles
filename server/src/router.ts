import removePlayer from "#procedure/lobby/removePlayer.js";
import updatePlayer from '#procedure/lobby/updatePlayer.js';
import getPlayerState from '#procedure/getPlayerState.js';
import getPlayers from "#procedure/lobby/getPlayers.js";
import startGame from "#procedure/lobby/startGame.js";
import addPlayer from '#procedure/lobby/addPlayer.js';
import updateGroup from '#procedure/updateGroups.js';
import syncDone from "#procedure/lobby/syncDone.js";
import getSelf from "#procedure/lobby/getSelf.js";
import { t, subscription } from '#lib/context.js';
import moveGroup from '#procedure/moveGroup.js';
import getMap from '#procedure/getMap.js';
import getPlanetUnits from "#procedure/getPlanetUnits.js";
import getBuildings from "#procedure/getBuildings.js";
import getBuildOptions from "#procedure/getBuildOptions.js";

export const router = t.router({
    removePlayer,
    addPlayer,
    updatePlayer,
    getPlayers,
    startGame,
    syncDone,
    getSelf,
    onUpdateResouces: subscription("updateResouces"),
    onAddPlayer: subscription("addPlayer"),
    onRemovePlayer: subscription("removePlayer"),
    onUpdatePlayer: subscription("updatePlayer"),
    onSyncDone: subscription("syncDone"),

    getMap,
    getBuildOptions,
    getPlanetUnits,
    getBuildings,
    moveGroup,
    getPlayerState,
    updateGroup,
    onMoveGroup: subscription("moveGroup"),
    onStartGame: subscription("startGame"),
    onEndGame: subscription("endGame"),
    onTransfer: subscription("transfer")
});

