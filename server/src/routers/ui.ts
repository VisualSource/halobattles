import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { t } from "../trpc.js";
import type { UUID } from '../lib.js';

const chatEmitter = new EventEmitter();

export const uiRouter = t.router({
    getMaps: t.procedure.query(() => {
        return ["test_map"];
    }),
    setGameSettings: t.procedure.input(z.object({})).mutation(() => { }),
    setUsername: t.procedure.input(z.string().min(3).max(20)).mutation(() => { }),
    setFaction: t.procedure.input(z.enum(["UNSC", "Basnished", "Covent", "Forerunners"])).mutation(() => { }),
    kickPlayer: t.procedure.input(z.object({})).mutation(() => { }),
    sendMsg: t.procedure.input(z.string().min(3).max(255)).mutation(({ input, ctx }) => {
        chatEmitter.emit("msg", { msg: input, id: ctx.user });
    }),
    onMsg: t.procedure.subscription(() => {
        return observable<{ msg: string; username: string; id: UUID; }>((emit) => {
            const onMsg = (data: { msg: string; username: string; id: UUID }) => emit.next(data);
            chatEmitter.on("msg", onMsg);
            return () => {
                chatEmitter.off("msg", onMsg);
            }
        });
    })
});