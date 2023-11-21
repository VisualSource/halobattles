import type { NodeHTTPCreateContextFnOptions, NodeHTTPCreateContextOption } from '@trpc/server/adapters/node-http';
import { HTTPBaseHandlerOptions } from '@trpc/server/http';
import type { HttpResponse } from 'uWebSockets.js';
import type { AnyRouter } from '@trpc/server';

/**
 *  @author romanzy313
 *  @linkcode https://github.com/romanzy313/trpc-uwebsockets/blob/master/src/types.ts
 */


export type WrappedHTTPRequest = {
    headers: Record<string, string>;
    method: 'POST' | 'GET';
    query: URLSearchParams;
    url: string;
};

export type WrappedHTTPResponse = HttpResponse;

/**
 * @internal
 */
type ConnectMiddleware<
    TRequest extends WrappedHTTPRequest = WrappedHTTPRequest,
    TResponse extends WrappedHTTPResponse = WrappedHTTPResponse
> = (req: TRequest, res: TResponse, next: (err?: any) => any) => void;

export type uHTTPHandlerOptions<
    TRouter extends AnyRouter,
    TRequest extends WrappedHTTPRequest,
    TResponse extends WrappedHTTPResponse
> = HTTPBaseHandlerOptions<TRouter, TRequest> &
    NodeHTTPCreateContextOption<TRouter, TRequest, TResponse> & {
        middleware?: ConnectMiddleware;
        maxBodySize?: number;
        // experimental_contentTypeHandlers?: NodeHTTPContentTypeHandler<
        //   TRequest,
        //   TResponse
        // >[];

        enableSubscriptions?: boolean;
    };

export type uHTTPRequestHandlerOptions<
    TRouter extends AnyRouter,
    TRequest extends WrappedHTTPRequest,
    TResponse extends WrappedHTTPResponse
> = {
    req: TRequest;
    res: TResponse;
    path: string;
} & uHTTPHandlerOptions<TRouter, TRequest, TResponse>;

export type CreateContextOptions = NodeHTTPCreateContextFnOptions<
    WrappedHTTPRequest,
    WrappedHTTPResponse
>;