import type { HttpRequest } from 'uWebSockets.js';
import { HttpError } from "../http_utils.js";
import { type Database } from 'sqlite3';
import { getResponse } from './steam_callback.js';

const login_fake: (req: HttpRequest, db: Database) => Promise<Response> = async (req: HttpRequest, db: Database) => {
    try {
        const query = new URLSearchParams(req.getQuery());
        //https://api.dicebear.com/7.x/identicon/svg?size=64&seed=BOT__0001
        const user = query.get("user");

        if (!user) {
            throw new HttpError("No user", "BAD_REQUEST");
        }

        await new Promise<void>((ok, reject) => {
            db.get(`SELECT steamid FROM users WHERE steamid = ?`, [user], (err, row) => {
                if (err) return reject(err);
                ok();
            });
        });

        return getResponse(user)
    } catch (error) {
        console.error(error);
        return new Response((error as Error)?.message ?? "Bad Request", {
            status: (error as HttpError<"INTERNAL_ERROR">)?.status?.code ?? 500
        });
    }
}

export default login_fake;