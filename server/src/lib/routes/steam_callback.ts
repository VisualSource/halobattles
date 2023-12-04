import type { HttpRequest } from 'uWebSockets.js';
import { parse } from 'node:path';
import { SignJWT } from 'jose';
import { HttpError, PRIVATE_KEY, USER_DATABASE } from "../http_utils.js";


export type SteamProfile = {
    response: {
        players: {
            steamid: string;
            communityvisibilitystate: number;
            profilestate: number;
            personaname: string;
            commentpermission: number;
            profileurl: string;
            avatar: string;
            avatarmedium: string;
            avatarfull: string;
            avatarhash: string;
            lastlogoff: number;
            personastate: number;
            realname: string;
            primaryclanid: number;
            timecreated: number;
            personastateflags: number;
            loccountrycode: string;
            locstatecode: number;
            loccityid: number;
        }[]
    }
}

/*
https://cindr.org/how-to-make-a-login-with-steam-button-with-php-oauth-open/
https://github.com/uNetworking/uWebSockets.js/blob/master/examples/AsyncFunction.js
*/
const steam_callback = async (req: HttpRequest): Promise<Response> => {
    try {
        const query = new URLSearchParams(req.getQuery());
        query.set("openid.mode", "check_authentication");
        const claimed_id = query.get("openid.claimed_id");
        if (!claimed_id) throw new HttpError("Missing request param 'claimed_id'.", "BAD_REQUEST");

        const request = await fetch("https://steamcommunity.com/openid/login", {
            method: "POST",
            headers: {
                "Accept-language": "en",
                "Content-type": "application/x-www-form-urlencoded"
            },
            body: query
        });

        if (!request.ok) throw new HttpError("Failed to validate user.", "INTERNAL_ERROR");

        const validation = await request.text();

        if (!validation.includes("is_valid:true")) {
            throw new HttpError("Invaild user login", "UNAUTHORIZED");
        }

        const steam_id = parse(claimed_id.replace("https://", "file://")).name;

        const profile_query = new URLSearchParams();
        profile_query.set("key", process.env.STEAM_API_KEY);
        profile_query.set("steamids", steam_id);

        const profile_request = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?${profile_query.toString()}`);

        if (!profile_request.ok) {
            throw new HttpError("Failed to fetch user profile.", "INTERNAL_ERROR");
        }

        const profile = await profile_request.json() as SteamProfile;

        const user = profile.response.players.at(0);

        if (!user) throw new HttpError("Failed to fetch user profile", "INTERNAL_ERROR");

        const jwt = await new SignJWT({ type: "steam", id: user.steamid })
            .setProtectedHeader({ alg: process.env.SIGNING_ALG })
            .setExpirationTime("5d").sign(PRIVATE_KEY);


        const five_days = 120 * 60 * 60;

        const response = new Response(undefined, {
            headers: {
                "Location": `${process.env.PUBLIC_URL}/`,
                "Set-Cookie": `session=${jwt}; path=/; SameSite=Strict; Secure; expires=${new Date(Date.now() + five_days * 1000).toUTCString()}`
            },
            status: 308
        });

        USER_DATABASE.set(user.steamid, {
            steamid: user.steamid,
            profileurl: user.profileurl,
            avatar: {
                default: user.avatar,
                full: user.avatarfull,
                medium: user.avatarmedium,
                hash: user.avatarhash,
            },
            personaname: user.personaname
        });

        return response;
    } catch (error) {
        if (error instanceof HttpError) {
            return Response.redirect(`${process.env.PUBLIC_URL}${error.getRedirectPath()}`, 308);
        }

        return Response.redirect(`${process.env.PUBLIC_URL}/error?status=500&reason=${encodeURIComponent("Interal Server Error")}`, 308);
    }
}

export default steam_callback;