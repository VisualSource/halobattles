import { TRPCError } from '@trpc/server';
import { procedure } from '#trpc/context.js';

const getPlayerState = procedure.query(({ ctx }) => {
    const id = ctx.user?.steamid;
    if (!id) throw new TRPCError({ message: "No id", code: "UNAUTHORIZED" });

    const player = ctx.global.players.get(id);
    if (!player) throw new TRPCError({ message: "Not found", code: "NOT_FOUND" });

    return player.getResouces();
});

export default getPlayerState;