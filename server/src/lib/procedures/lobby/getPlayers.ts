import type { PlayerJson } from "#lib/game/Player.js";
import { procedure } from "#lib/context.js";

const getPlayers = procedure.query(({ ctx }) => {
    const players: PlayerJson[] = [];
    ctx.global.players.forEach((value) => {
        players.push(value.asJson());
    });
    return players;
});

export default getPlayers;