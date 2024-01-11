import { type inferAsyncReturnType, initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { EventName, Events } from './game/types.js';
import Core from './game/Core.js';
import { PRIVATE_KEY } from './http_utils.js';
import { jwtVerify } from 'jose';
import type { Database } from 'sqlite3';
const global = new Core();

export const createContext = async (opts: unknown, db: Database) => {
    const cookie = (opts as { req: { headers: { cookie: string; } } })?.req?.headers?.cookie;
    if (cookie) {
        const cookies = cookie.split("; ");
        const session = cookies.find(value => value.startsWith("session"))?.replace("session=", "");
        if (!session) throw new TRPCError({ message: "Failed to get user session", code: "FORBIDDEN" });
        const { payload } = await jwtVerify(decodeURIComponent(session), PRIVATE_KEY);
        const user = await new Promise((ok, reject) => db.get(`SELECT * FROM users WHERE steamid = ?`, payload.id, (err, row) => {
            if (err) return reject(err);
            ok(row);
        }));
        return { user, global };
    }

    return { global, }
};

export type Context = inferAsyncReturnType<typeof createContext>;

export const t = initTRPC.context<Context>().create({
    isDev: process.env.NODE_ENV === "development",
});

export const procedure = t.procedure;

export const subscription = <T extends EventName>(event: T) => {
    return procedure.subscription(() => observable<Events[T]>((emit) => {
        const callback = (data: Events[T]) => emit.next(data);
        global.on(event, callback);
        return () => global.off(event, callback);
    }));
}