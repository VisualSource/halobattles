import { getFile } from '#lib/utils.js';
import sqlite3 from 'sqlite3';

//CREATE TABLE IF NOT EXISTS units (id TEXT NOT NULL, name TEXT, className TEXT, health INTEAGER, );
//CREATE TABLE IF NOT EXISTS buildings (id TEXT NOT NULL, name TEXT);
//CREATE TABLE IF NOT EXISTS tech (id TEXT NOT NULL, name TEXT);
export default async function createDataDB() {
    const db = new sqlite3.Database(getFile("../db/units.db", import.meta.url), sqlite3.OPEN_READONLY);

    return {
        getUnit(id: string) {
            return new Promise<{}>((resolve, reject) => {
                db.get<{}>("SELECT * FROM units WHERE id = ?", [id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                })
            });
        },
        getBuilding(id: string) {
            return new Promise<{}>((resolve, reject) => {
                db.get<{}>("SELECT * FROM buildings WHERE id = ?", [id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                })
            });
        },
        getTech(id: string) {
            return new Promise<{}>((resolve, reject) => {
                db.get<{}>("SELECT * FROM tech WHERE id = ?", [id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                })
            });
        },
        getUnits(ids: string[]) {
            return new Promise<unknown[]>((resolve, reject) => {
                const data: unknown[] = [];
                db.each("SELECT * FROM units WHERE id = ?", ids,
                    (err, row) => {
                        if (err) return reject(err);
                        data.push(row);
                    },
                    (err) => {
                        if (err) return reject(err);
                        resolve(data);
                    })
            });
        },
        getBuildings(ids: string[]) {
            return new Promise<unknown[]>((resolve, reject) => {
                const data: unknown[] = [];
                db.each("SELECT * FROM buildings WHERE id = ?", ids,
                    (err, row) => {
                        if (err) return reject(err);
                        data.push(row);
                    },
                    (err) => {
                        if (err) return reject(err);
                        resolve(data);
                    })
            });
        }
    }
}

