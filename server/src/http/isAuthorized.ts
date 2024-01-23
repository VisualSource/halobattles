import type { HttpRequest } from "uWebSockets.js";
import { importPKCS8, jwtVerify } from "jose";
import HttpError from "./HttpError.js";
import getCookies from "./getCookies.js";

export const PRIVATE_KEY = await importPKCS8(process.env.PRIVATE_KEY, process.env.SIGNING_ALG);

const isAuthorized = async (req: HttpRequest, redirect: string = "/error", errorWithQuery: boolean = true): Promise<string> => {
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

export default isAuthorized;