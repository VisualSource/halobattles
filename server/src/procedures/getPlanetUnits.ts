import { procedure } from "#trpc/context.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const schema = z.string().uuid();

const getPlanetUnits = procedure.input(schema).query(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const planet = ctx.global.getPlanet(input);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });

    if (planet.owner === ctx.user.steamid || planet.spies.has(ctx.user.steamid)) {
        return {
            view: "full",
            canEdit: planet.owner === ctx.user.steamid,
            units: planet.units
        };
    }

    if (ctx.global.ownsNeighbor(planet.uuid, ctx.user.steamid)) {
        return {
            canEdit: false,
            view: "partial",
            units: planet.units
        };
    }

    return {
        canEdit: false,
        view: "none",
        units: {
            0: [],
            1: [],
            2: []
        }
    }
});

export default getPlanetUnits;