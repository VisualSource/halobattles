import sqlite3 from "sqlite3";
import { resolve } from 'node:path';
import { __dirname } from './utils.js';

export const createDb = async (path: string) => {
    const file = resolve(__dirname(import.meta.url), path);
    const source = new sqlite3.Database(file);
    await new Promise<void>((ok, reject) => {
        source.exec("CREATE TABLE IF NOT EXISTS users (steamid TEXT, profile TEXT, avatar_full TEXT, avatar_default TEXT, avatar_medium TEXT, displayname TEXT, created TIMESTAMP);", (err) => {
            if (err) return reject(err);
            ok();
        });
    });

    return source;
}



