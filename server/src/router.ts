import moveGroup from './lib/procedures/moveGroup.js';
import { t, subscription } from './lib/context.js';
import getMap from './lib/procedures/getMap.js';

export const router = t.router({
    getMap,
    moveGroup,
    onMoveGroup: subscription("moveGroup"),
    onStartGame: subscription("startGame"),
    onEndGame: subscription("endGame"),
    onAddPlayer: subscription("addPlayer"),
    onRemovePlayer: subscription("removePlayer"),
    onUpdatePlayer: subscription("updatePlayer"),
    onTransfer: subscription("transfer")
});