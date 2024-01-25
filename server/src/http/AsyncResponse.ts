import type { HttpRequest, HttpResponse } from "uWebSockets.js";

export default async function AsyncResponse(res: HttpResponse, req: HttpRequest, handler: (req: HttpRequest) => Promise<Response>): Promise<void> {
    res.onAborted(() => {
        res.aborted = true;
    });

    const result = await handler(req);

    const body = result.body ? await result.text() : null;

    if (!res.aborted) {
        res.cork(() => {
            res.writeStatus(`${result.status} ${result.statusText}`);

            result.headers.forEach((value, key) => {
                res.writeHeader(key, value);
            });

            res.end(body ? body : undefined);
        });
    }
}