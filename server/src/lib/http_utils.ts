import type { HttpRequest, HttpResponse } from "uWebSockets.js";
import { importPKCS8, jwtVerify } from 'jose';
import type { Database } from "sqlite3";

export const PRIVATE_KEY = await importPKCS8(process.env.PRIVATE_KEY, process.env.SIGNING_ALG);

export async function AsyncResponse(res: HttpResponse, req: HttpRequest, db: Database, handler: (req: HttpRequest, db: Database) => Promise<Response>): Promise<void> {
    res.onAborted(() => {
        res.aborted = true;
    });

    const result = await handler(req, db);

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

export class HttpError<T extends keyof typeof HTTP_STATUS> extends Error {
    public status: typeof HTTP_STATUS[T];
    constructor(msg: string, status: T, public redirect: string = "/error", private withQuery: boolean = true) {
        super(msg);
        this.status = HTTP_STATUS[status];
    }

    public getRedirectPath(): string {
        return `${this.redirect}${this.withQuery ? `?status=${encodeURIComponent(`${this.status.code} ${this.status.text}`)}&reason=${encodeURIComponent(this.message)}` : ""}`;
    }
}

export const getCookies = (req: HttpRequest) => {
    return req.getHeader("cookie").split("; ").reduce((acc, e) => {
        const parts = e.trim().split("=");
        const k = decodeURIComponent(parts[0] ?? "");
        const v = decodeURIComponent(parts[1] ?? "");

        if (k) {
            acc[k] = v;
        }

        return acc;
    }, {} as Record<string, string>)
}

export const getQuery = (req: HttpRequest) => {
    return Object.fromEntries(new URLSearchParams(req.getQuery()).entries());
}


export const isAuthorized = async (req: HttpRequest, redirect: string = "/error", errorWithQuery: boolean = true): Promise<string> => {
    const cookies = getCookies(req);

    if (!cookies["session"]) throw new HttpError("No session was found", "UNAUTHORIZED", redirect, errorWithQuery);

    const { payload } = await jwtVerify(cookies["session"] as string, PRIVATE_KEY).catch((e) => {
        console.error(e);
        throw new HttpError("Failed to validate session", "UNAUTHORIZED", redirect, errorWithQuery);
    });

    if (!payload.id || typeof payload.id !== "string") {
        throw new HttpError("Missing user id in session.", "INTERNAL_ERROR", redirect, errorWithQuery);
    }

    return payload.id;
}

export const HTTP_STATUS = {
    OK: { text: "Ok", code: 200 },
    BAD_REQUEST: { text: "Bad Request", code: 400 },
    UNAUTHORIZED: { text: "Unauthorized", code: 401 },
    FORBIDDEN: { text: "Forbidden", code: 403, },
    NOT_FOUND: { text: "Not Found", code: 404 },
    MOVED_PERMANETLY: { text: "Moved Permanently", code: 301 },
    TEMPORARY_REDIRECT: { text: "Temporary Redirect", code: 307 },
    PERMANENT_REDIRECT: { text: "Permanent Redirect", code: 308 },
    INTERNAL_ERROR: { text: "Internal Server Error", code: 500 }
} as const;