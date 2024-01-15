import { Team } from 'halobattles-shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { t } from '../../context.js';

const schema = z.object({
    color: z.string(),
    team: z.nativeEnum(Team),
});

const addPlayer = t.procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ message: "Missing user", code: "UNAUTHORIZED" });
    ctx.global.addPlayer(ctx.user, input.team, input.color);

    ctx.global.send("addPlayer", undefined);
});

export default addPlayer;
