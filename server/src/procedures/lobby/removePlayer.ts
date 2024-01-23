import { z } from "zod";
import { procedure } from "#trpc/context.js";

const schema = z.object({
    id: z.string()
});

const removePlayer = procedure.input(schema).mutation(({ ctx, input }) => {
    ctx.global.removePlayer(input.id);
});

export default removePlayer;