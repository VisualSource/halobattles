import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { on } from 'node:process';
import cors from 'cors';

import { createHttpContext, createWSContext } from './context.js';
import { appRouter } from './appRouter.js';
import { AppRouter } from './lib.js';

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
        console.log(`➖➖ Connection (${wss.clients.size})`);
    });
});

on("SIGTERM", () => {
    handler.broadcastReconnectNotification();
    wss.close();
    server.close();
});

listen(2022);