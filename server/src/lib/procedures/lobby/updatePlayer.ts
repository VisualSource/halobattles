import { t } from "#lib/context.js";
import { Team } from "#lib/game/enums.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const schema = z.object({
    team: z.nativeEnum(Team).optional(),
    color: z.string().optional(),
});

const updatePlayer = t.procedure.input(schema).mutation(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ message: "No User", code: "UNAUTHORIZED" });
    ctx.global.updatePlayer(ctx.user?.steamid, input.color, input.team);
});

export default updatePlayer;