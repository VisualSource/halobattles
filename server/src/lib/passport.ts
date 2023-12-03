import type { HttpRequest, HttpResponse } from 'uWebSockets.js';
import { Strategy as SteamStrategy } from 'passport-steam';
import { Passport } from 'passport';

import { getCookies, getQuery, HTTP_STATUS } from './http_utils.js';

export default function init_passport() {
    const passport = new Passport();

    // This is passport session setup
    //   To support persistent login sessions, Passport needs to be able to
    //   serialize users into and deserialize users out of the session.  
    //   Typically,
    //   this will be as simple as storing the user ID when serializing, and finding
    //   the user by ID when deserializing.
    // 
    // @TODO: setup stoarge for users 
    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((obj, done) => {
        done(null, obj as Express.User);
    });

    passport.use(new SteamStrategy({
        returnURL: "http://localhost:8000/auth/steam/cb",
        realm: "http://localhost:3000",
        apiKey: process.env.STEAM_API_KEY
    }, (identifier: unknown, profile: Record<string, unknown>, done: (err: null, user: Record<string, unknown>) => void) => {
        // simple
        profile.identifier = identifier;
        return done(null, profile);
    }));

    passport.initialize();



    return {
        login: (req: HttpRequest, res: HttpResponse): void => {
            const request = {
                query: getQuery(req),
                cookies: getCookies(req),
                logIn: ""
            }

            console.log(request);


            try {
                const cb = passport.authenticate("steam", { session: false }, (err: Error | null, user: unknown, info: unknown) => {
                    console.log(err, user, info);
                });

                cb(request)
            } catch (error) {
                console.error(error);
            }


            res.writeStatus(HTTP_STATUS.OK).end("HELLO");

            /*return new Promise((ok, rej) => {
                const request = {
                    query: Object.fromEntries(new URLSearchParams(req.getQuery()).entries()),
                    cookies: req.getHeader("Cookie").split("; ").reduce((acc, e) => {
                        const parts = e.trim().split("=");
                        const k = decodeURIComponent(parts[0] ?? "");
                        const v = decodeURIComponent(parts[1] ?? "");

                        if (k) {
                            acc[k] = v;
                        }

                        return acc;
                    }, {} as Record<string, string>)
                };
                const response = {};

                passport.authenticate("steam", (err: Error | null, user: unknown, info: unknown) => {
                    try {
                        if (err) return ok(res.writeStatus("400 NOT FOUND").end());
                        if (!user) return ok(res.writeStatus("401 UNAUTHORIZED").end());
                        ok(res.writeHeader("Content-Type", "application/json").end(JSON.stringify(user)));
                    } catch (error) {
                        console.error(error);
                        rej(res.writeStatus("500 SERVER ERROR").writeHeader("Content-Type", "application/json").end(JSON.stringify((error as Error)?.message) ?? "Server Error"));
                    }
                })(request, response);
            });*/
        }
    }
}

