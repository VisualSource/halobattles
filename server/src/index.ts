import "#lib/env.js";
import { Team } from 'halobattles-shared';
import { App } from 'uWebSockets.js';
import process from 'node:process';

import steam_callback from '#http/routes/steam_callback.js';
import steam_profile from '#http/routes/steam_profile.js';
import { initWebSocket } from '#http/initWebSocket.js';
import steam_login from '#http/routes/steam_login.js';
import login_fake from "#http/routes/login_fake.js";
import { type User, global } from '#trpc/context.js';
import { initHttpRoutes } from "#http/router.js";
import logout from '#http/routes/logout.js';
import { __dirname } from "#lib/utils.js";
import { createDb } from "#lib/sqlite.js";
import { router } from '#trpc/router.js';

export type AppRouter = typeof router;

const app = App();

const db = await createDb("../../db/game.db");

if (process.env.NODE_ENV === "development") {
    db.get("SELECT * FROM users;", (err, row) => {
        if (err) {
            console.error(err);
            return;
        }
        global.addPlayer({ user: row as User, team: Team.BANISHED });
    });
}

initWebSocket(app, db);
initHttpRoutes({
    db, app, routes: [
        {
            path: "/auth/login/fake",
            callback: login_fake,
            method: "get",
            devOnly: true
        },
        {
            path: "/logout",
            method: "get",
            callback: logout,
        },
        {
            path: "/profile",
            method: "get",
            callback: steam_profile
        },
        {
            path: "/login",
            method: "get",
            callback: steam_login
        },
        {
            path: "/auth/steam/cb",
            method: "get",
            callback: steam_callback
        },
    ]
});

app.listen("0.0.0.0", 8000, () => {
    console.log("Server listening on http://localhost:8000");
});