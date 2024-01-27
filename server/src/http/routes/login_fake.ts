import type { HttpRequest } from 'uWebSockets.js';
import { getResponse } from './steam_callback.js';
import { content } from '#game/content.js';
import HttpError from "../HttpError.js";
import { SignJWT } from 'jose';
import { PRIVATE_KEY } from '#http/isAuthorized.js';
import { addDays } from 'date-fns';



const login_fake: (req: HttpRequest) => Promise<Response> = async (req: HttpRequest) => {
    try {
        const query = new URLSearchParams(req.getQuery());
        //https://api.dicebear.com/7.x/identicon/svg?size=64&seed=BOT__0001
        const user = query.get("user");

        if (!user) {
            throw new HttpError("No user", "BAD_REQUEST");
        }

        let id = decodeURIComponent(user).toLowerCase();

        let data = await content.getUser(id);

        if (!data) {
            await content.insertUser({
                id: id,
                profileurl: `http://localhost:8000/${id}`,
                avatar: `https://api.dicebear.com/7.x/identicon/svg?size=80&seed=${id}`,
                avatarfull: `https://api.dicebear.com/7.x/identicon/svg?size=96&seed=${id}`,
                avatarmedium: `https://api.dicebear.com/7.x/identicon/svg?size=64&seed=${id}`,
                personaname: user,
            });
            data = await content.getUser(id);
        }

        const jwt = await new SignJWT({ type: "fake", id })
            .setProtectedHeader({ alg: process.env.SIGNING_ALG })
            .setExpirationTime("5d").sign(PRIVATE_KEY);

        return new Response(`
            <!DOCTYPE html>
            <html>
                <body>
                    <table>
                        <thead>
                        
                        </thead>
                        <tr>
                            <th>Id</th>
                            <th>Displayname</th>
                            <th>Icon</th>
                        </tr>
                        <tr>
                            <td>${data?.steamid}</td>
                            <td>${data?.displayname}</td>
                            <td><img src="${data?.avatar_full}"/></td>
                        </tr>
                    </table>
                </body>
            </html>
        `, {
            headers: {
                "Content-Type": "text/html",
                "Set-Cookie": `session=${jwt}; path=/; SameSite=Strict; Secure; expires=${addDays(new Date(), 5).toUTCString()}`
            }
        })
    } catch (error) {
        console.error(error);
        return new Response((error as Error)?.message ?? "Bad Request", {
            status: (error as HttpError<"INTERNAL_ERROR">)?.status?.code ?? 500
        });
    }
}

export default login_fake;