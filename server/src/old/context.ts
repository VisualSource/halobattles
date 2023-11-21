import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import type { inferAsyncReturnType } from '@trpc/server';

export function createHttpContext({ req }: CreateHTTPContextOptions) {
    let user = null;
    if (req.headers.authorization) {
        user = req.headers.authorization;
    }

    return {
        user
    };
}
export function createWSContext({ req }: CreateWSSContextFnOptions) {
    return {
        user: null
    }
}

export type HttpContext = inferAsyncReturnType<typeof createHttpContext>;
export type WSContext = inferAsyncReturnType<typeof createWSContext>;