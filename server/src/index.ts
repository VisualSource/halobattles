import { config } from 'dotenv';
import { App } from 'uWebSockets.js';
import { parse } from 'node:path';

import process from 'node:process';
import cors from 'cors';
//import { renderTrpcPanel } from "trpc-panel";
import { createUWebSocketsHandler, applyWSHandler } from './lib/trpc-uwebsockets/index.js';
import { createContext } from './lib/context.js';
import { router } from './router.js';
import init_passport from './lib/passport.js';
import { HTTP_STATUS } from './lib/http_utils.js';

export type AppRouter = typeof router;

config();

if (!process.env.STEAM_API_KEY) {
    throw new Error("Missing Steam api key");
}

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


app.get("/login", (res, req) => {
    const query = new URLSearchParams();

    query.append('openid.ns', 'http://specs.openid.net/auth/2.0')
    query.append('openid.mode', 'checkid_setup');
    query.append('openid.return_to', 'http://localhost:8000/steam/cb'),
        query.append('openid.realm', "http://localhost:8000/");
    query.append('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
    query.append('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');

    // This is order matters for redirect.
    // @see https://github.com/uNetworking/uWebSockets.js/discussions/156#discussioncomment-178102
    res.writeStatus("308").writeHeader("Location", `https://steamcommunity.com/openid/login?${query.toString()}`).end();
});

/*
https://cindr.org/how-to-make-a-login-with-steam-button-with-php-oauth-open/
https://github.com/uNetworking/uWebSockets.js/blob/master/examples/AsyncFunction.js
*/
app.get("/steam/cb", async (res, req) => {
    res.onAborted(() => {
        res.aborted = true;
    });

    const query = new URLSearchParams(req.getQuery());

    query.set("openid.mode", "check_authentication")

    const result = await fetch("https://steamcommunity.com/openid/login", {
        method: "POST",
        headers: {
            "Accept-language": "en",
            "Content-type": "application/x-www-form-urlencoded"
        },
        body: query
    });

    if (!result.ok) {
        return res.end("Invaild") as never as void;
    }

    const content = await result.text();


    if (!content.includes("is_valid:true")) {
        throw new Error("unable to validate your request");
    }

    const claimed_id = query.get("openid.claimed_id");

    if (!claimed_id) throw new Error("");


    const steam_id = parse(claimed_id.replace("https://", "file://")).name;

    const profile = new URLSearchParams();
    profile.set("key", process.env.STEAM_API_KEY as string);
    profile.set("steamids", steam_id);
    console.log(steam_id, profile);


    const a = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?${profile.toString()}`);

    const d = await a.json() as { response: { players: {}[] } };

    if (!res.aborted) {
        res.cork(() => res.end(""));
    }
});

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