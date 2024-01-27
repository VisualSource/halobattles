import { procedure } from "#trpc/context.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const ownsNode = procedure.input(z.string().uuid()).query(({ ctx, input }) => {
    const planet = ctx.global.getPlanet(input);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });

    return planet.owner === ctx.user.steamid;
});

export default ownsNode;