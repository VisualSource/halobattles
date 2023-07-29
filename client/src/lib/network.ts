import {
    createWSClient,
    httpLink,
    splitLink,
    wsLink,
    createTRPCProxyClient
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { AppRouter } from 'server';
import { user } from './user';

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
                        Authorization: user.getUser()
                    }
                }
            })
        })
    ]
};

export const trpc = createTRPCReact<AppRouter>();
export const network = createTRPCProxyClient<AppRouter>(data);
export const client = trpc.createClient(data);