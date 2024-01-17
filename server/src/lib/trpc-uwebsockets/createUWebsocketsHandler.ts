import type { TemplatedApp, HttpResponse, HttpRequest } from 'uWebSockets.js';
import type { AnyRouter } from '@trpc/server';

import { applyWSHandler, type WSSHandlerOptions } from './applyWsHandler.js';
import type { uHTTPHandlerOptions, WrappedHTTPRequest } from './types.js';
import { uWsHTTPRequestHandler } from './requestHandler.js';
import { extractAndWrapHttpRequest } from './utils.js';

/**
 * @param uWsApp uWebsockets server instance
 * @param prefix The path to trpc without trailing slash (ex: "/trpc")
 * @param opts handler options
 */
export function createUWebSocketsHandler<TRouter extends AnyRouter>(
    uWsApp: TemplatedApp,
    prefix: string,
    opts: uHTTPHandlerOptions<TRouter, WrappedHTTPRequest, HttpResponse>
) {
    const handler = (res: HttpResponse, req: HttpRequest) => {
        const wrappedReq = extractAndWrapHttpRequest(prefix, req);

        uWsHTTPRequestHandler({
            req: wrappedReq,
            res: res,
            path: wrappedReq.url,
            ...opts,
        });
    };
    uWsApp.get(prefix + '/*', handler);
    uWsApp.post(prefix + '/*', handler);

    if (opts.enableSubscriptions) {
        opts.router;
        applyWSHandler(uWsApp, prefix, opts as WSSHandlerOptions<TRouter>);
    }
}