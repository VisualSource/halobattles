import type { HttpRequest } from "uWebSockets.js";

const steam_login: (req: HttpRequest) => Promise<Response> = async (req: HttpRequest) => {
    const query = new URLSearchParams();

    query.append('openid.ns', 'http://specs.openid.net/auth/2.0')
    query.append('openid.mode', 'checkid_setup');
    query.append('openid.return_to', `${process.env.PUBLIC_URL}/auth/steam/cb`),
        query.append('openid.realm', process.env.PUBLIC_URL);
    query.append('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
    query.append('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');

    return Response.redirect(`https://steamcommunity.com/openid/login?${query.toString()}`, 308);
}

export default steam_login;