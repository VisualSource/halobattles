import { Team } from "halobattles-shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { t } from "#trpc/context.js";

const schema = z.object({
    team: z.nativeEnum(Team).optional(),
    color: z.string().optional(),
});

const updatePlayer = t.procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ message: "No User", code: "UNAUTHORIZED" });

});

export default updatePlayer;