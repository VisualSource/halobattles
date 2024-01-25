import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { procedure } from '#trpc/context.js';

const group = z.array(z.object({
    count: z.coerce.number(),
    id: z.string().uuid()
})).optional();

const schema = z.object({
    node: z.string().uuid(),
    group_1: group,
    group_2: group,
    group_3: group,
});

export type UpdateGroupSchema = z.infer<typeof schema>;

const updateGroup = procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const planet = ctx.global.getPlanet(input.node);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });


    //TODO: Update groups with new order of units.
    //Note: can not tust client to tell us how many units there are. 
    //The amount of units in this operation should not change.

    ctx.global.send("updatePlanet", {
        id: planet.uuid,
        spies: planet.spiesArray,
        stack_0: planet.getStackState(0),
        stack_1: planet.getStackState(1),
        stack_2: planet.getStackState(2)
    });
});

export default updateGroup;