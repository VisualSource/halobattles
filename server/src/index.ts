import { type inferAsyncReturnType, initTRPC } from '@trpc/server';
import { App } from 'uWebSockets.js';
import { object, z } from 'zod';
import { EventEmitter } from 'node:events';
import process from 'node:process';
import cors from 'cors';
import { observable } from '@trpc/server/observable';
import { createUWebSocketsHandler, applyWSHandler } from './lib/trpc-uwebsockets/index.js';

const global_event = new EventEmitter();

const createContext = async () => {
    return {}
}

type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

const router = t.router({
    onAdd: t.procedure.subscription(() => {
        return observable<{ id: string; text: string; }>((emit) => {
            const onAdd = (data: { id: string; text: string; }) => {
                emit.next(data);
            }

            global_event.on("add", onAdd);

            return () => global_event.off("add", onAdd);
        });
    }),
    add: t.procedure.input(z.object({ id: z.string(), text: z.string().min(1) })).mutation(async opts => {
        const post = { ...opts.input };

        global_event.emit("add", post);

        return post;
    })
});

export type AppRouter = typeof router;

const app = App();

createUWebSocketsHandler(app, "/trpc", {
    router,
    createContext,
    middleware(req, res, next) {
        cors({})(req, {
            end: () => res.end(undefined, true),
            setHeader: (key: string, value: string) => res.writeHeader(key, value),
        }, next)
    },
});

const handler = applyWSHandler(app, "/trpc", {
    router,
    createContext
})

app.any("/*", res => {
    res.writeStatus("404 NOT FOUND");
    res.end();
});

app.listen("0.0.0.0", 8000, () => {
    console.log("Server listening on http://localhost:8000");
});

process.on("SIGTERM", () => {
    console.log("SIGTREM");
    handler.broadcastReconnectNotification();
    app.close();
});