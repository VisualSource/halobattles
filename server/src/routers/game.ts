import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { GameEvents, MoveRequest, MoveResponse, UpdateLocationResponse } from '../object/Events';
import GameState from '../object/GameState';
import Dijkstra from '../lib/dijkstra';
import type { UUID } from '../lib';
import { t } from "../trpc";
import { buildOptions } from '../map/upgradeList';
import { planetInfo } from '../map/planet_info';

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
    getPlanetInfo: t.procedure.input(z.object({ name: z.string(), owner: z.string().uuid().nullable() })).query(({ input }) => {
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
        // @TODO
        throw new TRPCError({ message: "Not Implemented", code: "UNPROCESSABLE_CONTENT" });
    }),
});