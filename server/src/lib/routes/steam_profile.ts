import { jwtVerify } from 'jose';
import { RequestKey, getCookies, db } from "../http_utils.js";

const steam_profile = async (req: RequestKey): Promise<Response> => {
    const cookies = getCookies(req);
    try {
        const { payload } = await jwtVerify(cookies["session"] as string, req.private_key);

        const result = await new Promise((ok, rej) => {
            db.get("SELECT * FROM users where id = ?", [payload.id], (err, row) => {
                if (err) return rej(err);
                ok(row);
            });
        });

        return Response.json(result);
    } catch (error) {
        console.error(error);
        return Response.json({ status: "Error", message: "Failed to get user profile" });
    }
}

export default steam_profile;