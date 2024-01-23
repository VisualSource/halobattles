import type { PlayerJson } from "#game/Player.js";
import { procedure } from "#trpc/context.js";

const getPlayers = procedure.query(({ ctx }) => {
    const players: PlayerJson[] = [];
    ctx.global.players.forEach((value) => {
        players.push(value.asJson());
    });
    return players;
});

export default getPlayers;