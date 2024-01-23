import { Team } from 'halobattles-shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { procedure } from '#trpc/context.js';

const schema = z.object({
    color: z.string(),
    team: z.nativeEnum(Team),
});

const addPlayer = procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ message: "Missing user", code: "UNAUTHORIZED" });
    ctx.global.addPlayer({ user: ctx.user, team: input.team, color: input.color });

    ctx.global.send("addPlayer", undefined);
});

export default addPlayer;
