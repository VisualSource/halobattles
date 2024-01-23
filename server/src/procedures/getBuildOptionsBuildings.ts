import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { procedure } from "#trpc/context.js";
import { content } from '#game/content.js';

const getBuildOptionsBuildings = procedure.input(z.string().uuid()).query(({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const user = ctx.global.players.get(ctx.user.steamid);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    const planet = ctx.global.getPlanet(input);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND" });
    if (planet.owner !== ctx.user.steamid) throw new TRPCError({ code: "UNAUTHORIZED" });

    const tech_and_buildings = [...planet.getUniqueBuildings(), ...Array.from(user.tech)];

    const options = content.getBuildableBuildings(user.team, tech_and_buildings);

    return options;
});

export default getBuildOptionsBuildings;