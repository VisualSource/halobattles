import { UnitStackState } from 'halobattles-shared';
import { TRPCError } from '@trpc/server';
import type { UUID } from "node:crypto";
import { z } from 'zod';

import type { IndexRange } from '#game/Planet.js';
import { procedure } from '#trpc/context.js';
import Dijkstra from '#lib/dijkstra.js';
import merge from '#lib/merge.js';

const schema = z.object({ from: z.string(), to: z.string() }).transform((args) => {
    const [fromUuid, fromGroup] = args.from.split(";");
    const [toUuid, toGroup] = args.to.split(";");
    console.log(fromUuid, fromGroup, toUuid, toGroup);
    return {
        from: fromUuid,
        to: toUuid,
        fromGroup,
        toGroup
    }
}).pipe(z.object({
    from: z.string().uuid({ message: "Invalid from uuid." }).describe("The node in which to transfer units from."),
    to: z.string().uuid({ message: "Invalid to uuid." }).describe("The node in which to transfer units to."),
    fromGroup: z.coerce.number().min(0).max(2).describe("The group from which unit are takin from."),
    toGroup: z.coerce.number().min(0).max(2).describe("The group where the unit will be put.")
}));

export type MoveGroupSchema = z.infer<typeof schema>;

const moveGroup = procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    const planet = ctx.global.getPlanet(input.from);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });

    // units already on same node, so no travel time.
    if (input.from === input.to) {
        if (input.fromGroup === input.toGroup) return;
        if (planet.owner !== ctx.user.steamid) throw new TRPCError({ code: "UNAUTHORIZED" });

        planet.units[input.toGroup as 0 | 1 | 2] = merge(planet.units[input.toGroup as 0 | 1 | 2], planet.units[input.fromGroup as 0 | 1 | 2]);
        planet.units[input.fromGroup as 0 | 1 | 2] = [];
        planet.invalidedCache(input.toGroup as IndexRange);
        planet.invalidedCache(input.fromGroup as IndexRange);

        const data = {
            id: planet.uuid,
            spies: planet.spiesArray,
            stack_0: planet.getStackState(0),
            stack_1: planet.getStackState(1),
            stack_2: planet.getStackState(2)
        };

        ctx.global.send("updatePlanet", data, [planet.owner]);
        ctx.global.send("updatePlanets", [data], ctx.global.getNeighborsOwners(planet.neighbors))

        return;
    }

    const { path, exec_time } = Dijkstra(ctx.global.mapData, { start: input.from, end: input.to, user: ctx.user.steamid, }, ctx.global.getWeight);

    const transferId = ctx.global.createTransfer(
        { id: input.from as UUID, group: input.fromGroup as IndexRange },
        { id: input.to as UUID, group: input.toGroup as IndexRange },
        ctx.user.steamid
    );

    ctx.global.send("updatePlanet", {
        id: input.from,
        spies: planet.spiesArray,
        [`stack_${input.fromGroup}`]: { icon: null, state: UnitStackState.Empty },
    });

    ctx.global.startTransfer({ time: exec_time, to: input.to, toGroup: input.toGroup, transferId });

    ctx.global.send("transfer", { path, node: input.from, group: input.fromGroup });
});

export default moveGroup;