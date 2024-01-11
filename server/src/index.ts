import "./lib/env.js";
import { App } from 'uWebSockets.js';

import process from 'node:process';
import cors from 'cors';
//import { renderTrpcPanel } from "trpc-panel";
import { createUWebSocketsHandler, applyWSHandler } from './lib/trpc-uwebsockets/index.js';
import steam_callback from './lib/routes/steam_callback.js';
import steam_profile from './lib/routes/steam_profile.js';
import { User, createContext } from './lib/context.js';
import steam_login from './lib/routes/steam_login.js';
import { AsyncResponse } from './lib/http_utils.js';
import logout from './lib/routes/logout.js';
import { createDb } from "./lib/sqlite.js";
import { router } from './router.js';

import { global } from './lib/context.js';
import { Team } from "./lib/game/enums.js";

export type AppRouter = typeof router;

const app = App();

const db = await createDb("../../db/game.db");

if (process.env.NODE_ENV === "development") {
    db.get("SELECT * FROM users;", (err, row) => {
        if (err) {
            console.error(err);
            return;
        }
        global.addPlayer(row as User, Team.UNSC, "#ffffff");
    });
}

createUWebSocketsHandler(app, "/trpc", {
    router,
    createContext: (opts) => createContext(opts, db),
    middleware(req, res, next) {
        cors({})(req, {
            end: () => res.end(undefined, true),
            setHeader: (key: string, value: string) => res.writeHeader(key, value),
        }, next)
    },
});

const handler = applyWSHandler(app, "/trpc", {
    router,
    createContext: (opts) => createContext(opts, db)
});

app.get("/logout", (res, req) => AsyncResponse(res, req, db, logout));
app.get("/profile", (res, req) => AsyncResponse(res, req, db, steam_profile));
app.get("/login", (res, req) => AsyncResponse(res, req, db, steam_login));
app.get("/auth/steam/cb", (res, req) => AsyncResponse(res, req, db, steam_callback));
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