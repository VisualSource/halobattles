import { z } from 'zod';
import Piscina from 'piscina';
import { type UUID } from "node:crypto";
import { procedure } from '../context.js';
import Dijkstra from '../dijkstra.js';
import { TRPCError } from '@trpc/server';
import { UnitStackState } from 'halobattles-shared';
import { merge } from '#lib/utils.js';

const schema = z.object({ from: z.string(), to: z.string() }).transform((args) => {
    const [fromUuid, fromGroup] = args.from.split(";");
    const [toUuid, toGroup] = args.to.split(";");

    return {
        from: fromUuid,
        to: toUuid,
        fromGroup,
        toGroup
    }
}).pipe(z.object({
    from: z.string().uuid(),
    to: z.string().uuid(),
    fromGroup: z.coerce.number().min(0).max(2),
    toGroup: z.coerce.number().min(0).max(2)
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

        ctx.global.send("updatePlanet", {
            id: planet.uuid,
            spies: planet.spies,
            stack_0: planet.getStackState(0),
            stack_1: planet.getStackState(1),
            stack_2: planet.getStackState(2)
        });

        return;
    }

    const { path, exec_time } = Dijkstra(ctx.global.mapData, { start: input.from, end: input.to, user: "", }, ctx.global.getWeight);

    const transferId = ctx.global.createTransfer(
        { id: input.from as UUID, group: input.fromGroup as 0 | 1 | 2 },
        { id: input.to as UUID, group: input.toGroup as 0 | 1 | 2 },
        ctx.user.steamid
    );

    ctx.global.send("updatePlanet", {
        id: input.from,
        spies: planet.spies,
        [`stack_${input.fromGroup}`]: { icon: null, state: UnitStackState.Empty },
    });

    ctx.global.startTransfer({ time: exec_time, to: input.to, toGroup: input.toGroup, transferId });

    ctx.global.send("transfer", { path, node: input.from, group: input.fromGroup });
});

export default moveGroup;