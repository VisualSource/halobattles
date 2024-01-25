import type { HttpRequest, TemplatedApp } from "uWebSockets.js";

import staticFile from "./routes/static_file.js";
import AsyncResponse from "./AsyncResponse.js";

type Props = {
    app: TemplatedApp,
    routes: {
        callback: (req: HttpRequest) => Promise<Response>
        method: "get" | "post" | "any" | "options";
        devOnly?: boolean;
        path: string;
    }[]
}

export const initHttpRoutes = ({ app, routes }: Props) => {
    // CORS
    app.options("/*", (res) => {
        res.writeHeader('Access-Control-Allow-Origin', "*");
        res.endWithoutBody();
    });

    for (const route of routes) {
        if ((route?.devOnly ?? false) && process.env.NODE_ENV !== "development") continue;
        app[route.method](route.path, (res, req) => AsyncResponse(res, req, route.callback));
    }

    app.get("/*", staticFile);
    app.any("/*", res => {
        res.writeStatus("404 NOT FOUND");
        res.end("Not Found");
    });
}

