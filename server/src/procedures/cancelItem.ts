import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { procedure } from "#trpc/context.js";

const schema = z.object({
    node: z.string().uuid(),
    item: z.string(),
    type: z.enum(["unit", "building"])
})

const cancelItem = procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const planet = ctx.global.getPlanet(input.node);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });

    try {
        if (input.type === "unit") {
            const job = planet.unit_queue.removeTask(input.item);

            ctx.global.send("updateQueue", {
                node: planet.uuid,
                type: "unit"
            }, [ctx.user.steamid]);

            return;
        }

        const job = planet.building_queue.removeTask(input.item);

        ctx.global.send("updateQueue", {
            node: planet.uuid,
            type: "building"
        }, [ctx.user.steamid]);

        // TODO: handle job cancel

    } catch (error) {
        console.error(error);
        throw new TRPCError({ code: "NOT_FOUND", message: (error as Error)?.message })
    }
});

export default cancelItem;