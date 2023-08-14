import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { t } from "../trpc.js";
import type { UUID } from '../lib.js';
import type { Factions } from '../object/GameState.js';
import { TRPCError } from '@trpc/server';

const chatEmitter = new EventEmitter();

const game_settings = {
    map: "test_map"
}

const players: { [key: UUID]: { isHost: boolean, uuid: UUID; username: string; faction: Factions | "unknown" } } = {
    "1724ea86-18a1-465c-b91a-fce23e916aae": {
        uuid: "1724ea86-18a1-465c-b91a-fce23e916aae",
        username: "VisualSource",
        faction: "unknown",
        isHost: true
    }
};

const getUser = (user: string | null) => {
    if (!user) throw new TRPCError({ message: "No User is set", code: "UNPROCESSABLE_CONTENT" });
    const userData = players[user as UUID];
    if (!userData) throw new TRPCError({ message: "Failed to find user data", code: "NOT_FOUND" });
    return userData;
}

export const uiRouter = t.router({
    getPlayerList: t.procedure.query(() => {
        return Object.values(players);
    }),
    getMaps: t.procedure.query(() => {
        return ["test_map"];
    }),
    setGameSettings: t.procedure.input(z.object({ map: z.string() })).mutation(({ input, ctx }) => {
        const user = getUser(ctx.user);
        if (!user.isHost) throw new TRPCError({ message: "User is not host", code: "UNAUTHORIZED" });
        game_settings.map = input.map;
        chatEmitter.emit("msg", {
            msg: `Host changed map to ${input.map}`,
            id: "system-us-east-1",
            username: "System"
        });
        chatEmitter.emit("update-player-list");
    }),
    setUsername: t.procedure.input(z.string().min(3).max(20)).mutation(({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ message: "No User is set", code: "UNPROCESSABLE_CONTENT" });
        const user = players[ctx.user as UUID];
        if (!user) throw new TRPCError({ message: "Failed to find user data", code: "NOT_FOUND" });
        const oldUsername = user.username;
        user.username = input;
        chatEmitter.emit("msg", {
            msg: `Player changed username: 
                  ${oldUsername} -> ${input}
            `,
            id: "system-us-east-1",
            username: "System"
        });
        chatEmitter.emit("update-player-list");
    }),
    setFaction: t.procedure.input(z.enum(["UNSC", "Banished", "Covenant", "Forerunner"])).mutation(({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ message: "No User is set", code: "UNPROCESSABLE_CONTENT" });
        const user = players[ctx.user as UUID];
        if (!user) throw new TRPCError({ message: "Failed to find user data", code: "NOT_FOUND" });

        user.faction = input;

        chatEmitter.emit("msg", {
            msg: `${user.username} changed faction to ${user.faction}`,
            id: "system-us-east-1",
            username: "System"
        });
        chatEmitter.emit("update-player-list");
    }),
    kickPlayer: t.procedure.input(z.object({})).mutation(() => {

        chatEmitter.emit("update-player-list");
    }),
    sendMsg: t.procedure.input(z.string().min(1).max(255)).mutation(({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ message: "No User is set", code: "UNPROCESSABLE_CONTENT" });
        const user = players[ctx.user as UUID];
        if (!user) throw new TRPCError({ message: "Failed to find user data", code: "NOT_FOUND" });

        chatEmitter.emit("msg", { msg: input, id: user.uuid, username: user.username });
    }),
    onPlayerListUpdate: t.procedure.subscription(() => {
        return observable<void>((emit) => {
            const onUpdate = () => emit.next();
            chatEmitter.on("update-player-list", onUpdate);
            return () => chatEmitter.off("update-player-list", onUpdate);
        });
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