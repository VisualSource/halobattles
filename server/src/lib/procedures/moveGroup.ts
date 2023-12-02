import { z } from 'zod';
import { procedure } from '../context.js';
import Dijkstra from '../dijkstra.js';

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
    state: string;
}

const moveGroup = procedure.input(schema).mutation(({ ctx, input }) => {

    const { path, exec_time } = Dijkstra(ctx.mapData, { start: input.from, end: input.to, user: "", }, ctx.getWeight);

    ctx.send("transfer", { path, node: input.from, group: input.fromGroup });

    ctx.startTransfer({ time: exec_time, to: input.to, toGroup: input.toGroup });
});

export default moveGroup;