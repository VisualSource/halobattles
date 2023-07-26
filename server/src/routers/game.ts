import { observable } from '@trpc/server/observable';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { GameEvents, MoveRequest, MoveResponse, UpdateLocationResponse } from '../object/Events';
import GameState from '../object/GameState';
import Dijkstra from '../lib/dijkstra';
import type { UUID } from '../lib';
import { t } from "../trpc";

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
    getMap: t.procedure.query(() => gameState.getSelectedMap()),
});