import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { procedure } from "#trpc/context.js";

const getBuildings = procedure.input(z.string().uuid()).query(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const planet = ctx.global.getPlanet(input);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });

    if (planet.owner === ctx.user.steamid || planet.spies.includes(ctx.user.steamid)) {
        return {
            canEdit: planet.owner === ctx.user.steamid,
            buildings: planet.buildings,
            slots: planet.building_slots
        }
    }

    return {
        canEdit: false,
        buildings: [],
        slots: planet.building_slots
    }
});

export default getBuildings;