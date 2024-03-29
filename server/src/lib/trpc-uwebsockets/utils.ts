import type { HttpRequest, HttpResponse } from 'uWebSockets.js';
import { TRPCError } from '@trpc/server';
import type { WrappedHTTPRequest } from './types.js';

export function getPostBody(method: 'GET' | 'POST', res: HttpResponse, maxBodySize?: number) {
    return new Promise<
        | { ok: true; data: unknown; preprocessed: boolean }
        | { ok: false; error: TRPCError }
    >((resolve) => {
        if (method === "GET") {
            // no body in get request
            return resolve({
                ok: true,
                data: undefined,
                preprocessed: false,
            });
        }

        let buffer: Buffer;

        res.onData((ab, isLast) => {
            //resolve right away if there is only one chunk
            if (buffer === undefined && isLast) {
                return resolve({
                    ok: true,
                    data: Buffer.from(ab).toString(),
                    preprocessed: false,
                });
            }

            const chunk = Buffer.from(ab);

            if (maxBodySize && buffer.length >= maxBodySize) {
                resolve({
                    ok: false,
                    error: new TRPCError({ code: 'PAYLOAD_TOO_LARGE' }),
                });
            }

            buffer = Buffer.concat(buffer ? [buffer, chunk] : [chunk]);

            if (isLast) resolve({
                ok: true,
                data: buffer.toString(),
                preprocessed: false,
            });

        });

        res.onAborted(() => {
            resolve({
                ok: false,
                error: new TRPCError({ code: 'CLIENT_CLOSED_REQUEST' }),
            });
        });
    });
}

export function extractAndWrapHttpRequest(
    prefix: string,
    req: HttpRequest
): WrappedHTTPRequest {
    const method = req.getMethod().toUpperCase() as 'GET' | 'POST';
    const url = req.getUrl().substring(prefix.length + 1);
    const query = new URLSearchParams(req.getQuery());

    const headers: Record<string, string> = {};
    req.forEach((key, value) => {
        headers[key] = value;
    });

    return {
        headers,
        method,
        query,
        url,
    };
}