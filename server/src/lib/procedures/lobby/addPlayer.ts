import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { Team } from '../../game/enums.js';
import { t } from '../../context.js';

const schema = z.object({
    id: z.string(),
    color: z.string(),
    team: z.nativeEnum(Team),
});

const addPlayer = t.procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ message: "Missing user", code: "UNAUTHORIZED" });
    ctx.global.addPlayer(ctx.user, input.team, input.color);
});

export default addPlayer;
