import type { HttpRequest } from "uWebSockets.js";

const getCookies = (req: HttpRequest) => {
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

export default getCookies;