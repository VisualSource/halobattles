import { procedure } from "#lib/context.js";
import { units } from "#lib/units.js";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { z } from "zod";

const schema = z.object({
    type: z.enum(["unit", "building"]),
    node: z.string().uuid(),
    item: z.string()
});

const buyItem = procedure.input(schema).mutation(async ({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    const user = ctx.global.players.get(ctx.user.steamid);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    const node = ctx.global.getPlanet(input.node);
    if (!node) throw new TRPCError({ code: "NOT_FOUND" });
    if (node.owner !== ctx.user.steamid) throw new TRPCError({ code: "UNAUTHORIZED" });

    switch (input.type) {
        case "unit": {
            const unit = await units.getUnit(input.item);

            // check if player has resource to buy unit
            if (user.credits < unit.supplies || user.energy < unit.energy) {
                throw new TRPCError({ message: "Does not have required resources.", code: "PRECONDITION_FAILED" });
            }

            // check if max_unique has not exceeded max unique
            if (unit.max_unique !== -1) {
                const item = user.unique.get(unit.id);
                if (item !== undefined && (item + unit.max_unique) > unit.max_unique) throw new TRPCError({
                    message: "Exceeded Max unique units",
                    code: "PRECONDITION_FAILED"
                });
            }

            // check if that additional unit cap will not exceeded cap.
            if (unit.unit_cap > 0 && (user.units + unit.unit_cap) > user.unit_cap) {
                throw new TRPCError({
                    message: "Exceedes Unit Cap",
                    code: "PRECONDITION_FAILED"
                });
            }

            // check that additional leader cap does not exceeded cap.
            if (unit.leader_cap > 0 && (user.leaders + unit.leader_cap) > user.leader_cap) {
                throw new TRPCError({
                    message: "Exceeds Leader Cap",
                    code: "PRECONDITION_FAILED"
                });
            }

            user.credits -= unit.supplies;
            user.energy -= unit.energy;

            if (unit.max_unique !== -1) {
                const v = user.unique.get(unit.id);
                user.unique.set(unit.id, v ? v + unit.unit_cap : unit.unit_cap);
            }

            if (unit.leader_cap > 0) {
                user.leaders += unit.leader_cap;
            }

            if (unit.unit_cap > 0) {
                user.units += unit.unit_cap;
            }

            break;
        }
        case "building": {
            const building = await units.getBuilding(input.item);

            // check if player has resource to buy unit
            if (user.credits < building.supplies || user.energy < building.energy) {
                throw new TRPCError({ message: "Does not have required resources.", code: "PRECONDITION_FAILED" });
            }
            // check if global_instances has not exceeded max unique
            if (building.max_global_instances !== -1) {
                const item = user.unique.get(building.id);
                if (item !== undefined && (item + 1) > building.max_global_instances) throw new TRPCError({
                    message: "Exceeded Max global instances",
                    code: "PRECONDITION_FAILED"
                });
            }

            if (building.max_local_instances !== -1 && (node.buildings.filter(e => e.id === building.id).length + 1) < building.max_local_instances) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Max local instances"
                });
            }

            if ((node.buildings.length + 1) < node.building_slots) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Max building slots"
                })
            }

            user.credits -= building.supplies;
            user.energy -= building.energy;

            // local instance.
            // hide until build time is done.
            node.buildings.push({ display: false, id: building.id, icon: building.icon, instance: randomBytes(5).toString("hex") });

            if (building.max_global_instances !== -1) {
                const item = user.unique.get(building.id);
                user.unique.set(building.id, item ? item + 1 : 1);
            }




            break;
        }
    }




});

export default buyItem;