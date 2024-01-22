import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { procedure } from "#lib/context.js";

const schema = z.object({
    node: z.string(),
    type: z.enum(["building", "unit"])
});

const getQueue = procedure.input(schema).query(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const planet = ctx.global.getPlanet(input.node);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });
    if (planet.owner !== ctx.user.steamid) throw new TRPCError({ code: "UNAUTHORIZED" });

    if (input.type === "building") {
        return planet.building_queue.getItems();
    }

    return planet.unit_queue.getItems();
});

export default getQueue;