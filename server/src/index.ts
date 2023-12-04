import "./lib/env.js";
import { App } from 'uWebSockets.js';

import process from 'node:process';
import cors from 'cors';
//import { renderTrpcPanel } from "trpc-panel";
import { createUWebSocketsHandler, applyWSHandler } from './lib/trpc-uwebsockets/index.js';
import { createContext } from './lib/context.js';
import { router } from './router.js';
import steam_login from './lib/routes/steam_login.js';
import steam_callback from './lib/routes/steam_callback.js';
import steam_profile from './lib/routes/steam_profile.js';
import logout from './lib/routes/logout.js';
import { AsyncResponse } from './lib/http_utils.js';

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
});

app.get("/logout", (res, req) => AsyncResponse(res, req, logout));
app.get("/profile", (res, req) => AsyncResponse(res, req, steam_profile));
app.get("/login", (res, req) => AsyncResponse(res, req, steam_login));
app.get("/auth/steam/cb", (res, req) => AsyncResponse(res, req, steam_callback));
app.any("/*", res => {
    res.writeStatus("404 NOT FOUND");
    res.end("Not Found");
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