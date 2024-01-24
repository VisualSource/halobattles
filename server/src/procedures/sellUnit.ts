import { procedure } from "#trpc/context.js";
import { z } from "zod";

const schema = z.object({
    node: z.string().uuid()
});

const sellUnit = procedure.input(schema).mutation(({ ctx, input }) => {
    const planet = ctx.global.getPlanet(input.node);

});

export default sellUnit;