import { App } from 'uWebSockets.js';
import process from 'node:process';
import cors from 'cors';
//import { renderTrpcPanel } from "trpc-panel";
import { createUWebSocketsHandler, applyWSHandler } from './lib/trpc-uwebsockets/index.js';
import { createContext } from './lib/context.js';
import { router } from './router.js';

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

/*app.get("/debug/panel", (res, _) => {
    res.end(renderTrpcPanel(router, { url: "http://localhost:8000/trpc" }))
});*/

app.listen("0.0.0.0", 8000, () => {
    console.log("Server listening on http://localhost:8000");
});

process.on("SIGTERM", () => {
    console.log("SIGTREM");
    handler.broadcastReconnectNotification();
    app.close();
});