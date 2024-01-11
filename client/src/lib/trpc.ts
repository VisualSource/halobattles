import {
    createTRPCProxyClient, createWSClient, wsLink
} from '@trpc/client';
import type { AppRouter } from "halobattles-server/src/index";


export const link = {
    links: [
        wsLink({
            client: createWSClient({
                url: "ws://localhost:8000/trpc",
            })
        })
    ]
}

export const client = createTRPCProxyClient<AppRouter>(link);