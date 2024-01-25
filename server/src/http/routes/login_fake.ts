import type { HttpRequest } from 'uWebSockets.js';
import { getResponse } from './steam_callback.js';
import { content } from '#game/content.js';
import HttpError from "../HttpError.js";


const login_fake: (req: HttpRequest) => Promise<Response> = async (req: HttpRequest) => {
    try {
        const query = new URLSearchParams(req.getQuery());
        //https://api.dicebear.com/7.x/identicon/svg?size=64&seed=BOT__0001
        const user = query.get("user");

        if (!user) {
            throw new HttpError("No user", "BAD_REQUEST");
        }

        const data = await content.getUser(user);
        if (!data) throw new Error("No User");

        return getResponse(user)
    } catch (error) {
        console.error(error);
        return new Response((error as Error)?.message ?? "Bad Request", {
            status: (error as HttpError<"INTERNAL_ERROR">)?.status?.code ?? 500
        });
    }
}

export default login_fake;