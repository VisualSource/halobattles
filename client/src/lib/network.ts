import {
    createWSClient,
    httpLink,
    splitLink,
    wsLink,
    createTRPCProxyClient
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { AppRouter } from 'server';

export const userId = "1724ea86-18a1-465c-b91a-fce23e916aae";

const wsClient = createWSClient({
    url: "ws://localhost:2022",
});

const data = {
    links: [
        splitLink({
            condition(op) {
                return op.type === "subscription";
            },
            true: wsLink({
                client: wsClient
            }),
            false: httpLink({
                url: "http://localhost:2022",
                headers() {
                    return {
                        Authorization: userId
                    }
                }
            })
        })
    ]
};

export const trpc = createTRPCReact<AppRouter>();
export const network = createTRPCProxyClient<AppRouter>(data);
export const client = trpc.createClient(data);