import moveGroup from './lib/procedures/moveGroup.js';
import { t, subscription } from './lib/context.js';
import getMap from './lib/procedures/getMap.js';
import updateGroup from './lib/procedures/updateGroups.js';
import getPlayerState from './lib/procedures/getPlayerState.js';

export const router = t.router({
    getMap,
    moveGroup,
    getPlayerState,
    updateGroup,
    onMoveGroup: subscription("moveGroup"),
    onStartGame: subscription("startGame"),
    onEndGame: subscription("endGame"),
    onAddPlayer: subscription("addPlayer"),
    onRemovePlayer: subscription("removePlayer"),
    onUpdatePlayer: subscription("updatePlayer"),
    onTransfer: subscription("transfer")
});