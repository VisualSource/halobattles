import { type HTTPRequest, resolveHTTPResponse } from "@trpc/server/http";
import type { AnyRouter, inferRouterContext } from "@trpc/server";
import type { uHTTPRequestHandlerOptions, WrappedHTTPRequest, WrappedHTTPResponse } from './types.js';
import { getPostBody } from './utils.js';

export async function uWsHTTPRequestHandler<
    TRouter extends AnyRouter,
    TRequest extends WrappedHTTPRequest,
    TResponse extends WrappedHTTPResponse
>(opts: uHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
    const handleViaMiddleware = opts.middleware ?? ((_req, _res, next) => next());
    let aborted = false;
    opts.res.onAborted(() => {
        // console.log('request was aborted');
        aborted = true;
    });
    return handleViaMiddleware(opts.req, opts.res, async (err) => {
        if (err) throw err;

        const createContext = async (): Promise<inferRouterContext<TRouter>> => opts.createContext?.(opts);

        // this may not be needed
        const query = new URLSearchParams(opts.req.query);

        const { res, req } = opts;

        if (aborted) return;

        const bodyResult = await getPostBody(req.method, res, opts.maxBodySize);

        const reqObj: HTTPRequest = {
            method: opts.req.method!,
            headers: opts.req.headers,
            query,
            body: bodyResult.ok ? bodyResult.data : undefined,
        };

        const result = await resolveHTTPResponse({
            batching: opts.batching,
            responseMeta: opts.responseMeta,
            path: opts.path,
            createContext,
            router: opts.router,
            req: reqObj,
            error: bodyResult.ok ? null : bodyResult.error,
            preprocessedBody: false,
            onError(o) {
                opts?.onError?.({
                    ...o,
                    req: opts.req,
                });
            },
        });

        if (aborted) return;

        res.cork(() => {
            res.writeStatus(result.status.toString());

            for (const [key, value] of Object.entries(result.headers ?? {})) {
                if (!value) continue;
                if (Array.isArray(value)) {
                    value.forEach(v => res.writeHeader(key, v));
                    continue;
                }

                res.writeHeader(key, value);
            }

            res.end(result.body);
        });
    });
}