import type { HttpRequest } from "uWebSockets.js";

const logout = async (req: HttpRequest): Promise<Response> => {

    const response = new Response(undefined, {
        headers: {
            "Location": `${process.env.PUBLIC_URL}/`,
            "Set-Cookie": `session=; path=/; SameSite=Strict; Secure; expires=${new Date(0).toUTCString()}`
        },
        status: 308
    });

    return response;
}

export default logout;