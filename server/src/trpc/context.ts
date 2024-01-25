import { type inferAsyncReturnType, initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { HttpResponse } from 'uWebSockets.js';
import type { Database } from 'sqlite3';
import { jwtVerify } from 'jose';

import type { EventName, Events } from "#game/types.js";
import { PRIVATE_KEY } from '../http/isAuthorized.js';
import { content } from '#game/content.js';
import Core from '#game/Core.js';

export const global = new Core();
global.setMap("test_map_01.json");

export const createContext = async (opts: { req: { headers: Record<string, string> }, res: HttpResponse }) => {
    const cookie = opts?.req?.headers?.cookie;
    if (!cookie) throw new TRPCError({ code: "PRECONDITION_FAILED" });

    const cookies = cookie.split("; ");
    const session = cookies.find(value => value.startsWith("session"))?.replace("session=", "");
    if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    const { payload } = await jwtVerify(decodeURIComponent(session), PRIVATE_KEY);

    const user = await content.getUser(payload.id as string);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." })

    return { user, global };
};

export type Context = inferAsyncReturnType<typeof createContext>;

export const t = initTRPC.context<Context>().create({
    isDev: process.env.NODE_ENV === "development",
});

export const procedure = t.procedure;

export const subscription = <T extends EventName>(event: T) => {
    return procedure.subscription(({ ctx }) => observable<Events[T]>((emit) => {
        const callback = (data: Events[T], targets: string[] | null = null) => {
            if (!targets || targets.includes(ctx.user?.steamid ?? "")) return emit.next(data);
        };
        global.on(event, callback);
        return () => global.off(event, callback);
    }));
}