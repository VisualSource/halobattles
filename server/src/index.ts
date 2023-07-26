import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { on } from 'node:process';
import cors from 'cors';

import { createHttpContext, createWSContext } from './context';
import { appRouter } from './appRouter';
import { AppRouter } from './lib';

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
});

listen(2022);