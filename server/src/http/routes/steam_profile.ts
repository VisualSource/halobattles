import type { HttpRequest } from 'uWebSockets.js';

import isAuthorized from "../isAuthorized.js";
import HttpError from '../HttpError.js';
import { content } from '#game/content.js';

const steam_profile = async (req: HttpRequest): Promise<Response> => {
    try {
        const userid = await isAuthorized(req, "/", false);

        const user = await content.getUser(userid);

        if (!user) throw new Error("No data was returned");

        return Response.json(user);
    } catch (error) {
        console.error(error);
        if (error instanceof HttpError) {
            return Response.json({ status: error.status.code, statusText: error.status.text, message: error.message }, { status: error.status.code });
        }

        return Response.json({ status: 500, statusText: "Internal Server Error", message: "Failed to get user profile" }, { status: 500 });
    }
}

export default steam_profile;