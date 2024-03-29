import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { procedure } from "#trpc/context.js";
import { content } from "#game/content.js";

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
            const unit = await content.getUnit(input.item);

            console.log("Buy unit", unit);

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

            // apply changes.

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

            // add unit to build queue.
            node.unit_queue.addTask({ ...unit, build_time: unit.build_time * 1000, node: node.uuid }, (meta) => {
                const node = ctx.global.getPlanet(meta.node);
                if (!node) throw new Error("Failed to find node");

                node.appendUnits(0, [{ id: meta.id, icon: meta.icon, count: 1 }]);

                ctx.global.send("updateQueue", {
                    node: meta.node,
                    type: "unit"
                }, [ctx.user.steamid]);

                const planet = ctx.global.getPlanet(meta.node);
                if (!planet) throw new Error("Planet Not Found");

                const data = {
                    stack_0: planet.getStackState(0),
                    spies: planet.spiesArray,
                    id: planet.uuid
                }

                ctx.global.send("updatePlanet", data, [planet.owner!]);
                ctx.global.send("updatePlanets", [data], ctx.global.getNeighborsOwners(planet.neighbors));
            });

            ctx.global.send("updateQueue", {
                node: node.uuid,
                type: "unit"
            }, [ctx.user.steamid]);

            break;
        }
        case "building": {
            const building = await content.getBuilding(input.item);

            console.log("Buy building", building);

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

            if ((node.buildings.length + 1) > node.building_slots) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Max building slots"
                })
            }

            user.credits -= building.supplies;
            user.energy -= building.energy;

            user.income_credits -= building.upkeep_supplies;
            user.income_energy -= building.upkeep_energy;

            const instanceId = randomBytes(5).toString("hex");
            // local instance.
            // hide until build time is done.
            node.buildings.push({ display: false, id: building.id, icon: building.icon, instance: instanceId });

            if (building.max_global_instances !== -1) {
                const item = user.unique.get(building.id);
                user.unique.set(building.id, item ? item + 1 : 1);
            }

            node.building_queue.addTask({ ...building, build_time: building.build_time * 1000, node: node.uuid, instance: instanceId }, (meta) => {
                const node = ctx.global.getPlanet(meta.node);
                if (!node) throw new Error("Failed to find node");

                const item = node.buildings.find(e => e.id === meta.id && e.instance === meta.instance);
                if (!item) throw new Error("Failed to find building instance");
                item.display = true;

                ctx.global.send("updateQueue", {
                    node: meta.node,
                    type: "building"
                }, [ctx.user.steamid]);

                // handle building attributes
                // I.E inc unit cap
            });

            ctx.global.send("updateQueue", {
                node: node.uuid,
                type: "building"
            }, [ctx.user.steamid]);

            break;
        }
    }


    ctx.global.send("updateResouces", undefined, [ctx.user.steamid]);
});

export default buyItem;