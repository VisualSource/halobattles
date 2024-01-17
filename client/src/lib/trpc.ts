import {
    createTRPCProxyClient, createWSClient, wsLink
} from '@trpc/client';
import type { AppRouter } from "halobattles-server";

const clientws = createWSClient({
    url: "ws://localhost:8000/trpc",
    onClose(cause) {
        switch (cause?.code ?? 1005) {
            case 4401: {
                window.location.assign("http://localhost:8000/login");
                clientws.close();
                break;
            }
            default:
                break;
        }
    },
});

export const link = {
    links: [
        wsLink({
            client: clientws,
        })
    ]
}

export const client = createTRPCProxyClient<AppRouter>(link);