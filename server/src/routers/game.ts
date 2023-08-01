import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
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

                const transferId = gameState.createTransfer(input, data);

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
                if (input === data.id) emit.next(data);
            }
            gameState.on(GameEvents.UpdatePlayer, onPlayerUpdate);
            return () => gameState.off(GameEvents.UpdatePlayer, onPlayerUpdate);
        });
    }),
    getSelf: t.procedure.query(({ ctx }) => {
        return gameState.getPlayer(ctx.user);
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
        if (!node) throw new TRPCError({ message: "Failed to find node.", code: "NOT_FOUND" });
        if (node.owner !== ctx.user) throw new TRPCError({ message: "Current user is not allowd to edit this node", code: "UNAUTHORIZED" });

        const item = node.buildings.findIndex(value => value.objId === input.objId);
        if (item === -1) throw new TRPCError({ message: "Failed to find item", code: "NOT_FOUND" });


        switch (input.type) {
            case 'upgrade': {
                node.buildings[item].level++;
                const data = buildOptions.get(node.buildings[item].id);
                if (!data) throw new TRPCError({ message: "Failed to run actions on item", code: "INTERNAL_SERVER_ERROR" });

                if (data.on?.create) {
                    // handle create method
                }

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
                const removed = node.buildings.splice(item, 1);
                const content = removed.at(0);
                if (!content) break;

                const data = buildOptions.get(content.id);
                if (!data) throw new TRPCError({ message: "Failed to run actions on item", code: "INTERNAL_SERVER_ERROR" });

                if (data.on?.destory) {
                    // run on destory actions.
                }

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


        // @TODO
        throw new TRPCError({ message: "Not Implemented", code: "UNPROCESSABLE_CONTENT" });
    }),
    buyItem: t.procedure.input(z.object({
        type: z.enum(["unit", "building-tech"]),
        id: z.number(),
        level: z.number().optional()
    })).mutation(({ input, ctx }) => {

        const player = gameState.getPlayer(ctx.user);
        if (!player) throw new TRPCError({ message: "Failed to update player.", code: "NOT_FOUND" });

        switch (input.type) {
            case 'unit': {
                const unit = units.get(input.id);
                if (!unit) throw new TRPCError({ message: "No unit with given id exists.", code: "NOT_FOUND" });
                player.creds -= unit.cost;
                break;
            }
            case 'building-tech': {
                if (!input.level) throw new TRPCError({ message: "A level is required for buy a building or tech.", code: "BAD_REQUEST" });
                const item = buildOptions.get(input.id);
                if (!item) throw new TRPCError({ message: "No building or tech with given id exists.", code: "NOT_FOUND" });
                player.creds -= item.levels[input.level].build?.cost ?? 0;
                break;
            }
        }

        gameState.emit(GameEvents.UpdatePlayer, player);

    }),
    buildItem: t.procedure.input(z.object({
        nodeId: z.string().uuid(),
        objData: z.object({
            id: z.number(),
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
        }

    })
});