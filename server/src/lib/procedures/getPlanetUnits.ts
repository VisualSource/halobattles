import { procedure } from "#lib/context.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const schema = z.string().uuid();

const getPlanetUnits = procedure.input(schema).query(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const planet = ctx.global.getPlanet(input);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });

    if (planet.owner === ctx.user.steamid || planet.spies.includes(ctx.user.steamid)) {
        return {
            canEdit: planet.owner === ctx.user.steamid,
            units: planet.units
        };
    }

    return {
        canEdit: false,
        units: {
            0: [],
            1: [],
            2: []
        }
    }
});

export default getPlanetUnits;