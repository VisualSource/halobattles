import type { TemplatedApp } from "uWebSockets.js";
import type { Database } from "sqlite3";

import { createUWebSocketsHandler, applyWSHandler } from '#lib/trpc-uwebsockets/index.js';
import { createContext } from '#trpc/context.js';
import { router } from '#trpc/router.js';

export function initWebSocket(app: TemplatedApp, db: Database) {

    createUWebSocketsHandler(app, "/trpc", {
        router,
        createContext: (opts) => createContext(opts, db),
        // CORS part 2. See https://trpc.io/docs/server/caching for more information
        responseMeta() {
            return {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                }
            }
        }
    });

    const handler = applyWSHandler(app, "/trpc", {
        router,
        createContext: (opts) => createContext(opts, db)
    });

    process.on("SIGTERM", () => {
        console.log("SIGTREM");
        handler.broadcastReconnectNotification();
        app.close();
    });
}