import getBuildOptionsBuildings from "#procedure/getBuildOptionsBuildings.js";
import getBuildOptionsUnits from "#procedure/getBuildOptions.js";
import removePlayer from "#procedure/lobby/removePlayer.js";
import updatePlayer from '#procedure/lobby/updatePlayer.js';
import getPlanetUnits from "#procedure/getPlanetUnits.js";
import getPlayerState from '#procedure/getPlayerState.js';
import getPlayers from "#procedure/lobby/getPlayers.js";
import startGame from "#procedure/lobby/startGame.js";
import getBuildings from "#procedure/getBuildings.js";
import addPlayer from '#procedure/lobby/addPlayer.js';
import sellBuilding from "#procedure/sellBuilding.js";
import updateGroup from '#procedure/updateGroups.js';
import syncDone from "#procedure/lobby/syncDone.js";
import getSelf from "#procedure/lobby/getSelf.js";
import { t, subscription } from '#trpc/context.js';
import cancelItem from "#procedure/cancelItem.js";
import moveGroup from '#procedure/moveGroup.js';
import ownsNode from "#procedure/ownsNode.js";
import getQueue from "#procedure/getQueue.js";
import buyItem from "#procedure/buyItem.js";
import getMap from '#procedure/getMap.js';

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
    sellBuilding,
    ownsNode,
    cancelItem,
    buyItem,
    getMap,
    getQueue,
    getBuildOptionsUnits,
    getBuildOptionsBuildings,
    getPlanetUnits,
    getBuildings,
    moveGroup,
    getPlayerState,
    updateGroup,
    onKickPlayer: subscription("kickPlayer"),
    onNotification: subscription("notification"),
    onUpdateBuildings: subscription("updateBuildings"),
    onQueueUpdate: subscription("updateQueue"),
    onUpdatePlanet: subscription("updatePlanet"),
    onUpdatePlanets: subscription("updatePlanets"),
    onStartGame: subscription("startGame"),
    onEndGame: subscription("endGame"),
    onTransfer: subscription("transfer")
});

