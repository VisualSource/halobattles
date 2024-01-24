import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { procedure } from "#trpc/context.js";
import { content } from '#game/content.js';

const schema = z.object({
    node: z.string().uuid(),
    instance: z.string()
});

const sellBuilding = procedure.input(schema).mutation(async ({ ctx, input }) => {
    const planet = ctx.global.getPlanet(input.node);
    if (!planet) throw new TRPCError({ code: "NOT_FOUND", message: "Failed to find planet." });
    if (planet.owner !== ctx.user.steamid) throw new TRPCError({ code: "UNAUTHORIZED" });

    const user = ctx.global.players.get(ctx.user.steamid);
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const building = planet.buildings.findIndex(e => e.instance === input.instance);
    if (building === -1) throw new TRPCError({ code: "NOT_FOUND", message: "Failed to find building." });

    const item = planet.buildings.splice(building, 1).at(0);
    if (!item) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const itemData = await content.getBuilding(item.id, ["upkeep_energy", "attributes", "upkeep_supplies", "supplies", "energy"])

    // give back have the value of the building.
    user.credits += Math.floor(itemData.supplies / 2);
    user.energy += Math.floor(itemData.energy / 2);
    user.income_credits += itemData.upkeep_supplies;
    user.income_energy += itemData.upkeep_energy;

    // TODO Handle attribues

    ctx.global.send("updateResouces", undefined, [ctx.user.steamid]);
    ctx.global.send("updateBuildings", planet.uuid, [ctx.user.steamid]);
});

export default sellBuilding;