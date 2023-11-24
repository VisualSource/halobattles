import {
    createTRPCProxyClient, createWSClient, wsLink
} from '@trpc/client';
//import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/src/index";


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
//export const trpcClient = createTRPCReact<AppRouter>();
//export const trpc = trpcClient.createClient(link);
