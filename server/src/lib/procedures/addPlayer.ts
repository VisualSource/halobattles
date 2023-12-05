import { z } from 'zod';
import { t } from '../context.js';
import { Team } from '../game/enums.js';
import Player from '../game/Player.js';
import { USER_DATABASE } from '../http_utils.js';
import { TRPCError } from '@trpc/server';

const schema = z.object({
    id: z.string(),
    color: z.string(),
    team: z.nativeEnum(Team),
});

const addPlayer = t.procedure.input(schema).mutation(({ ctx, input }) => {
    const user = USER_DATABASE.get(input.id);

    if (!user) throw new TRPCError({ message: "No user data found for given user id.", code: "BAD_REQUEST" });

    const player = new Player(input.id, user.personaname, input.team, input.color);


    ctx.players.set(input.id, player);

});

export default addPlayer;
