import { z } from 'zod';
import { procedure } from '../context.js';
import Dijkstra from '../dijkstra.js';
import { TRPCError } from '@trpc/server';
import { UnitStackState } from 'halobattles-shared';

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

export type MoveGroupResponse = {
    uuid: string;
    group: number;
    stack: {
        state: UnitStackState,
        icon: string | null;
    }
}

const moveGroup = procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    const planet = ctx.global.getPlanet(input.from);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });

    // units already on same node, so no travel time.
    if (input.from === input.to) {
        if (input.fromGroup === input.toGroup) return;
        if (planet.owner !== ctx.user.steamid) throw new TRPCError({ code: "UNAUTHORIZED" });

        planet.mergeUnits(input.fromGroup, input.toGroup);

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

    ctx.global.send("updatePlanet", {
        id: input.from,
        spies: planet.spies,
        [`stack_${input.fromGroup}`]: { icon: null, state: UnitStackState.Empty },
    });

    ctx.global.startTransfer({ time: exec_time, to: input.to, toGroup: input.toGroup });

    ctx.global.send("transfer", { path, node: input.from, group: input.fromGroup });
});

export default moveGroup;