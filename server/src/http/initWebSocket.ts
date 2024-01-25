import type { TemplatedApp } from "uWebSockets.js";

import { createUWebSocketsHandler, applyWSHandler } from '#lib/trpc-uwebsockets/index.js';
import { createContext } from '#trpc/context.js';
import { router } from '#trpc/router.js';

export function initWebSocket(app: TemplatedApp) {

    createUWebSocketsHandler(app, "/trpc", {
        router,
        createContext,
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
        createContext
    });

    process.on("SIGTERM", () => {
        console.log("SIGTREM");
        handler.broadcastReconnectNotification();
        app.close();
    });
}