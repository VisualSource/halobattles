import type { HttpRequest, HttpResponse } from "uWebSockets.js";
import sqlite3 from 'sqlite3';
import { type KeyLike, importPKCS8 } from 'jose';

export type RequestKey = HttpRequest & { private_key: KeyLike };

const private_key = await importPKCS8(process.env.PRIVATE_KEY, process.env.SIGNING_ALG);
export const db = new sqlite3.Database("./user.db");
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, profileurl TEXT, avatar TEXT, avatarfull TEXT, avatarmedium TEXT, avatarhash TEXT, username TEXT);");
});


export async function AsyncResponse(res: HttpResponse, req: HttpRequest, handler: (req: RequestKey) => Promise<Response>): Promise<void> {
    res.onAborted(() => {
        res.aborted = true;
    });

    (req as RequestKey).private_key = private_key;

    const result = await handler(req as RequestKey);

    const body = result.bodyUsed ? await result.text() : null;

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
    constructor(msg: string, status: T) {
        super(msg);
        this.status = HTTP_STATUS[status];
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

export const HTTP_STATUS = {
    OK: "200 OK",
    BAD_REQUEST: "200 BAD REQUEST",
    UNAUTHORIZED: "401 UNAUTHORIZED",
    FORBIDDEN: "403 FORBIDDEN",
    NOT_FOUND: "404 NOT FOUND",
    MOVED_PERMANETLY: "301 Moved Permanently",
    TEMPORARY_REDIRECT: "307 Temporary Redirect",
    PERMANENT_REDIRECT: "308 Permanent Redirect",
    INTERNAL_ERROR: "500 Internal Server Error"
} as const;