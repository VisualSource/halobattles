import type { HttpRequest } from "uWebSockets.js";

export const getQuery = (req: HttpRequest) => {
    return Object.fromEntries(new URLSearchParams(req.getQuery()).entries());
}