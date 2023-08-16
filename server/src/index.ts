import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import process from 'node:process';
import cors from 'cors';

import { createHttpContext, createWSContext } from './context.js';
import { appRouter } from './appRouter.js';
import { AppRouter } from './lib.js';
import { Lobby } from './routers/ui.js';

const { server, listen } = createHTTPServer({
    router: appRouter,
    middleware: cors(),
    createContext: createHttpContext
});

const wss = new WebSocketServer({ server });
const handler = applyWSSHandler<AppRouter>({
    wss,
    router: appRouter,
    createContext: createWSContext
});

wss.on("connection", (ws) => {
    console.log(`➕➕ Connection (${wss.clients.size})`);
    ws.once("close", () => {
        Lobby.get().emit("player-disconnection");
        console.log(`➖➖ Connection (${wss.clients.size})`);
    });
});

process.on("SIGTERM", () => {
    handler.broadcastReconnectNotification();
    wss.close();
    server.close();
});

listen(2022);