import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import { GameEvents, MoveRequest, MoveResponse, UpdateLocationResponse } from '../object/Events.js';
import GameState, { Player } from '../object/GameState.js';
import { buildOptions } from '../map/upgradeList.js';
import { planetInfo } from '../map/planet_info.js';
import Dijkstra from '../lib/dijkstra.js';
import type { UUID } from '../lib.js';
import units from '../map/units.js';
import { t } from "../trpc.js";

const gameState = new GameState();
gameState.startGame();

export const gameRouter = t.router({
    finalizTransfer: t.procedure.input(z.string().uuid()).mutation((opts) => {
        if (!opts.ctx.user) throw new TRPCError({ message: "No user set", code: "UNAUTHORIZED" });
        gameState.finishTransfer(opts.ctx.user, opts.input);
    }),
    transferUnits: t.procedure.input(z.object({
        from: z.object({
            id: z.string().uuid(),
            group: z.enum(["left", "center", "right"])
        }),
        to: z.object({
            id: z.string().uuid(),
            group: z.enum(["left", "center", "right"])
        })
    })).mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ message: "No user set", code: "UNAUTHORIZED" });

        if (input.from.id === input.to.id) {
            console.log("Internal transfer");
            const transferId = gameState.createTransfer(ctx.user, input as MoveRequest);
            gameState.finishTransfer(ctx.user, transferId);
            return;
        }

        console.log("External Transfer");
        gameState.emit(GameEvents.TransferUnits, { ...input, owner: ctx.user });
    }),
    internalTransfer: t.procedure.input(z.object({
        nodeId: z.string().uuid(),
        from: z.object({
            group: z.enum(["left", "center", "right"]),
            idx: z.number(),
            id: z.number()
        }),
        to: z.object({
            group: z.enum(["left", "center", "right"]),
            idx: z.number()
        })
    })).mutation(({ input, ctx }) => {
        const node = gameState.getNode(input.nodeId as UUID);
        const result = node.moveToGroup(input.from, input.to);
        console.log("InternalTransfer", result);
        gameState.emit(GameEvents.UpdateLocation, {
            type: "update-units-groups",
            owner: ctx.user,
            payload: result
        } as UpdateLocationResponse);
    }),
    onTransferUnits: t.procedure.input(z.string().uuid()).subscription(({ input }) => {
        return observable<MoveResponse>((emit) => {
            const onTransferUnits = (data: MoveRequest) => {
                const path = Dijkstra(gameState.getSelectedMap(), data.from.id, data.to.id, input);

                const transferId = data?.transferId ?? gameState.createTransfer(input, data);

                emit.next({
                    path,
                    transferId,
                    owner: input as UUID
                });
            }
            gameState.on(GameEvents.TransferUnits, onTransferUnits);
            return () => {
                gameState.off(GameEvents.TransferUnits, onTransferUnits);
            }
        });
    }),
    onLocationUpdate: t.procedure.input(z.string().uuid()).subscription(() => {
        return observable<UpdateLocationResponse>((emit) => {
            const onLocationUpdate = (data: UpdateLocationResponse) => emit.next(data);
            gameState.on(GameEvents.UpdateLocation, onLocationUpdate);
            return () => {
                gameState.off(GameEvents.UpdateLocation, onLocationUpdate);
            }
        });
    }),
    onPlayerUpdate: t.procedure.input(z.string().uuid()).subscription(({ input }) => {
        return observable<Player>((emit) => {
            const onPlayerUpdate = (data: Player) => {
                console.log("UPDATE PLAYER", data);
                if (input === data.id) emit.next(data);
            }
            gameState.on(GameEvents.UpdatePlayer, onPlayerUpdate);
            return () => gameState.off(GameEvents.UpdatePlayer, onPlayerUpdate);
        });
    }),
    onNotify: t.procedure.input(z.string().uuid()).subscription(({ input }) => {
        return observable<{ msg: string; to: UUID | "all", type: "info" | "warn" | "error"; }>((emit) => {
            const onNoify = (data: { msg: string; to: UUID | "all"; type: "info" | "warn" | "error"; }) => {
                if (data.to === "all") return emit.next(data);
                if (data.to === input) return emit.next(data);
            }
            gameState.on(GameEvents.Notify, onNoify);
            return () => gameState.off(GameEvents.Notify, onNoify);
        });
    }),
    getSelf: t.procedure.query(({ ctx }) => {
        return gameState.getPlayer(ctx.user as UUID | null);
    }),
    getMap: t.procedure.query(() => {
        gameState.setPlayerData();
        return gameState.getSelectedMap();
    }),
    getBuildOptions: t.procedure.input(z.string().uuid()).query(({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ message: "Invaild user", code: "UNAUTHORIZED" });
        return gameState.getNodeBuildOptions(input as UUID, ctx.user as UUID);
    }),
    getUnitOptions: t.procedure.input(z.string().uuid()).query(({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ message: "Invaild user", code: "UNAUTHORIZED" });
        return gameState.getNodeUnitOptions(input as UUID, ctx.user as UUID);
    }),
    getPlanetInfo: t.procedure.input(z.object({
        name: z.string(), owner: z.string().uuid().nullable()
    })).query(({ input }) => {
        const data = planetInfo[input.name];
        if (!data) throw new TRPCError({ message: "Failed to find planet data.", code: "NOT_FOUND" });
        const player = gameState.getPlayer(input.owner as UUID | null);
        return {
            planet: data,
            owner: player
        }
    }),
    getBulidingInfo: t.procedure.input(z.number()).query(({ input }) => {
        const data = buildOptions.get(input)
        if (!data) throw new TRPCError({ message: "No Building or tech exits with that id", code: "NOT_FOUND" });
        return data;
    }),
    modifyBuilding: t.procedure.input(z.object({
        nodeId: z.string().uuid(),
        objId: z.string(),
        type: z.enum(["upgrade", "delete"])
    })).mutation(({ input, ctx }) => {
        const node = gameState.getNode(input.nodeId as UUID);
        const player = gameState.getPlayer(ctx.user as UUID | null);
        if (!node || !player) throw new TRPCError({ message: "Failed to find node.", code: "NOT_FOUND" });
        if (node.owner !== ctx.user) throw new TRPCError({ message: "Current user is not allowd to edit this node", code: "UNAUTHORIZED" });

        const item = node.buildings.findIndex(value => value.objId === input.objId);
        if (item === -1) throw new TRPCError({ message: "Failed to find item", code: "NOT_FOUND" });

        switch (input.type) {
            case 'upgrade': {
                node.buildings[item].level++;
                const data = buildOptions.get(node.buildings[item].id);
                if (!data) throw new TRPCError({ message: "Failed to run actions on item", code: "INTERNAL_SERVER_ERROR" });

                if (node.buildings[item].level - 1 > 0) {
                    for (const stats of data.levels[node.buildings[item].level - 1].values) {
                        switch (stats.stat) {
                            case "cap.current":
                                player.cap.current -= stats.value;
                                break;
                            case "credits.income":
                                player.credits.income -= stats.value;
                                break;
                            default:
                                break;
                        }
                    }
                }

                for (const stats of data.levels[node.buildings[item].level].values) {
                    switch (stats.stat) {
                        case "cap.current":
                            player.cap.current += stats.value;
                            break;
                        case "credits.income":
                            player.credits.income += stats.value;
                            break;
                        default:
                            break;
                    }
                }

                gameState.emit(GameEvents.UpdatePlayer, player);
                gameState.emit(GameEvents.UpdateLocation, {
                    type: "update-buildings",
                    payload: {
                        node: input.nodeId,
                        buildings: node.buildings
                    }
                } as UpdateLocationResponse);

                break;
            }
            case 'delete': {
                const buildId = node.buildOptions.buildings.current.findIndex(value => value === item);
                node.buildOptions.buildings.current.splice(buildId, 1);
                const removed = node.buildings.splice(item, 1);
                const content = removed.at(0);
                if (!content) break;

                const data = buildOptions.get(content.id);
                if (!data) throw new TRPCError({ message: "Failed to run actions on item", code: "INTERNAL_SERVER_ERROR" });

                for (const stats of data.levels[content.level].values) {
                    switch (stats.stat) {
                        case "cap.current":
                            player.cap.current -= stats.value;
                            break;
                        case "credits.income":
                            player.credits.income -= stats.value;
                            break;
                        default:
                            break;
                    }
                }

                gameState.emit(GameEvents.UpdatePlayer, player);
                gameState.emit(GameEvents.UpdateLocation, {
                    type: "update-buildings",
                    payload: {
                        node: input.nodeId,
                        buildings: node.buildings
                    }
                } as UpdateLocationResponse);

                break;
            }
        }
    }),
    buyItem: t.procedure.input(z.object({
        type: z.enum(["unit", "building", "tech"]),
        id: z.number(),
        level: z.number().optional()
    })).mutation(({ input, ctx }) => {

        const player = gameState.getPlayer(ctx.user as UUID | null);
        if (!player) throw new TRPCError({ message: "Failed to update player.", code: "NOT_FOUND" });

        switch (input.type) {
            case 'unit': {
                const unit = units.get(input.id);
                if (!unit) throw new TRPCError({ message: "No unit with given id exists.", code: "NOT_FOUND" });
                player.credits.current -= unit.cost;
                player.cap.current += unit.capSize;

                if (unit.globalMax !== -1) {
                    if (!player.cap.restrictions[`unit-${unit.id}`]) {
                        player.cap.restrictions[`unit-${unit.id}`] = 0;
                    }
                    player.cap.restrictions[`unit-${unit.id}`]++;
                }

                break;
            }
            case "building":
            case 'tech': {
                if (!input.level) throw new TRPCError({ message: "A level is required for buy a building or tech.", code: "BAD_REQUEST" });
                const item = buildOptions.get(input.id);
                if (!item) throw new TRPCError({ message: "No building or tech with given id exists.", code: "NOT_FOUND" });
                player.credits.current -= item.levels[input.level].build?.cost ?? 0;

                if (item.max.global !== -1) {
                    if (!player.cap.restrictions[`building-${item.id}`]) {
                        player.cap.restrictions[`building-${item.id}`] = 0;
                    }
                    player.cap.restrictions[`building-${item.id}`]++;
                }

                break;
            }
        }

        gameState.emit(GameEvents.UpdatePlayer, player);

    }),
    refunedItem: t.procedure.input(z.object({
        id: z.number(),
        level: z.number().optional(),
        type: z.enum(["unit", "building", "tech"])
    })).mutation(({ input, ctx }) => {
        const player = gameState.getPlayer(ctx.user as UUID | null);
        if (!player) throw new TRPCError({ message: "Failed to get player.", code: "UNAUTHORIZED" });

        switch (input.type) {
            case 'unit': {
                const unit = units.get(input.id);
                if (!unit) throw new TRPCError({ message: "Failed to find unit with given id.", code: "NOT_FOUND" });
                player.credits.current += Math.floor(unit.cost / 2);
                player.cap.current -= unit.capSize;

                if (unit.globalMax !== -1 && player.cap.restrictions[`unit-${unit.id}`] > 0) {
                    player.cap.restrictions[`unit-${unit.id}`]--;
                }

                break;
            }
            case 'building':
            case 'tech': {
                if (!input.level) throw new TRPCError({ message: "Missing level from request.", code: "BAD_REQUEST" });

                const item = buildOptions.get(input.id);
                if (!item) throw new TRPCError({ message: "Failed to find building/tech with given id.", code: "NOT_FOUND" });

                const stat = item.levels[input.level].build;
                if (!stat) throw new TRPCError({ message: "Failed to get item cost.", code: "UNPROCESSABLE_CONTENT" });

                player.credits.current += Math.floor(stat.cost / 2);
                break;
            }
        }

        gameState.emit(GameEvents.UpdatePlayer, player);
    }),
    buildItem: t.procedure.input(z.object({
        nodeId: z.string().uuid(),
        objData: z.object({
            id: z.number(),
            level: z.number().optional(),
            inst: z.string().optional()
        }),
        type: z.enum(["unit", "building", "tech"])
    })).mutation(({ input, ctx }) => {
        const node = gameState.getNode(input.nodeId as UUID);
        if (node.owner !== ctx.user) throw new TRPCError({ message: "User does not match node owner.", code: "UNAUTHORIZED" });

        switch (input.type) {
            case "unit": {
                const unit = units.get(input.objData.id);
                if (!unit) throw new TRPCError({ message: "Failed to find unit", code: "NOT_FOUND" });

                node.addUnit("left", {
                    count: 1,
                    idx: 0,
                    id: unit.id,
                    icon: unit.icon
                });

                gameState.emit(GameEvents.UpdateLocation, {
                    type: "update-units-groups",
                    owner: ctx.user,
                    payload: [{
                        group: "left",
                        node: node.objectId,
                        units: node.units["left"]
                    }]
                } as UpdateLocationResponse);
                break;
            }
            case "building":
            case "tech": {
                if (!input.objData.level) throw new TRPCError({ message: "A level is required for makeing a building or tech", code: "BAD_REQUEST" });

                if (input.objData.inst) {
                    const inst = node.buildings.find(value => value.objId === input.objData.inst);
                    if (!inst) throw new TRPCError({ message: "Failed to find building/tech to upgrade", code: "NOT_FOUND" });
                    inst.level++;
                } else {
                    const item = buildOptions.get(input.objData.id);
                    if (!item) throw new TRPCError({ message: "Failed to find building/tech data", code: "NOT_FOUND" });

                    node.buildOptions.buildings.current.push(item.id);

                    node.buildings.push({
                        level: input.objData.level!,
                        id: item.id,
                        icon: item.icon,
                        objId: randomBytes(5).toString("hex")
                    });
                }

                gameState.emit(GameEvents.UpdateLocation, {
                    type: "update-buildings",
                    owner: node.owner,
                    payload: {
                        buildings: node.buildings,
                        node: node.objectId
                    }
                } as UpdateLocationResponse);
                break;
            }
        }

    })
});