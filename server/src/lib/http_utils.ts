import { HttpRequest } from "uWebSockets.js";

export const getCookies = (req: HttpRequest) => {
    return req.getHeader("Cookie").split("; ").reduce((acc, e) => {
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