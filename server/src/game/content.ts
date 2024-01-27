import { Team, type Unit, type Building } from "halobattles-shared";
import sqlite3 from 'sqlite3';
import { getFile } from '#lib/utils.js';
import { Prettify, UniqueArray } from "./types.js";

type GetBuildingKeys<T extends (keyof Building)[]> = T extends ["*"] ? Building : Pick<Building, T[number]>;
type GetUnitKeys<T extends (keyof Unit)[]> = T extends ["*"] ? Unit : Pick<Unit, T[number]>;
export type User = { steamid: string; profile: string; avatar_full: string; avatar_medium: string; displayname: string; };
type PickedUnits = Pick<Unit, "armor" | "attributes" | "damage" | "health" | "id" | "stat" | "weapon_type" | "unit_type" | "shield">;
type PickedBuilding = Pick<Building, "armor" | "attributes" | "damage" | "health" | "id" | "shield" | "stat" | "weapon_type">;
const content = {
    db: new sqlite3.Database(getFile("../../db/units.db", import.meta.url)),
    getUser: function (id: string) {
        return new Promise<User | null>((resolve, reject) => {
            this.db.get<User | null>("SELECT * FROM users WHERE steamid = ?", [id], (err, row) => {
                if (err) {
                    console.error(err);
                    return resolve(null);
                }
                resolve(row);
            });
        });
    },
    insertUser: function (props: { id: string, profileurl: string, avatarfull: string, avatar: string, avatarmedium: string, personaname: string }) {
        return new Promise<void>((resolve, reject) => {
            this.db.run('INSERT INTO users VALUES ($id,$profileurl,$avatarfull,$avatar,$avatarmedium,$personaname,CURRENT_TIMESTAMP)', {
                $id: props.id,
                $profileurl: props.profileurl,
                $avatarfull: props.avatarfull,
                $avatar: props.avatar,
                $avatarmedium: props.avatarmedium,
                $personaname: props.personaname
            }, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    },
    getUsers: function () {
        return new Promise<User[]>((resolve, reject) => {
            this.db.all<User>("SELECT * FROM users;", (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },
    getUnit: function <T extends UniqueArray<(keyof Unit)[]>>(item: string, keys: T | ["*"] = ["*"]) {
        return new Promise<Prettify<GetUnitKeys<T>>>((resolve, reject) => {
            this.db.get<Prettify<GetUnitKeys<T>>>(`SELECT ${keys.join(",")} FROM units WHERE id = $id;`, {
                $id: item
            }, (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    },
    getBuilding: function <T extends UniqueArray<(keyof Building)[]>>(item: string, keys: T | ["*"] = ["*"]) {
        return new Promise<Prettify<GetBuildingKeys<T>>>((resolve, reject) => {
            this.db.get<Prettify<GetBuildingKeys<T>>>(`SELECT ${keys.join(",")} FROM buildings WHERE id = $id;`, {
                $id: item
            }, (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    },
    getBuildableBuildings: function (faction: Team, tech_and_buildings: string[]) {
        return new Promise<Building[]>((resolve, reject) => {
            if (tech_and_buildings.length <= 0) {
                return this.db.all<Building>("SELECT * FROM buildings WHERE json_array_length(requires) = 0 AND faction = $faction;", {
                    $faction: faction
                }, (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            }

            this.db.all<Building>(`SELECT DISTINCT buildings.* FROM buildings, json_each(buildings.requires) WHERE (json_each.value IN (${tech_and_buildings.map(e => `"${e}"`).join(",")}) OR json_array_length(buildings.requires) = 0) AND faction = $faction;`, {
                $faction: faction
            }, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },
    getBuildableUnits: function (faction: Team, tech_and_buildings: string[]) {
        return new Promise<Unit[]>((resolve, reject) => {
            if (tech_and_buildings.length <= 0) {
                return this.db.all<Unit>("SELECT * FROM units WHERE json_array_length(requires) = 0 AND faction = $faction;", {
                    $faction: faction,
                }, (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                });
            }
            //https://sqlite.org/json1.html
            this.db.all<Unit>(`SELECT DISTINCT units.* FROM units, json_each(units.requires) WHERE (json_each.value IN (${tech_and_buildings.map(e => `"${e}"`).join(",")}) OR json_array_length(units.requires) = 0) AND faction = $faction;`, {
                $faction: faction,
            }, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            })
        });
    },
    getIsSpy: function (faction: Team, unit: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.db.all<{ id: string }>(`SELECT units.id,json_each(units.attributes) FROM units WHERE json_each.value = "tag:spy" AND faction = $faction;`, {
                $faction: faction,
            }, (err, rows) => {
                if (err) return reject(err);
                resolve(rows.findIndex(e => e.id === unit) !== -1);
            });
        });
    },
    getBuildingsBattle: function (ids: string[]) {
        return new Promise<PickedBuilding[]>((resolve, reject) => {
            this.db.all<PickedBuilding>(`SELECT armor,attributes,damage,health,id,shield,stat,weapon_type FROM buildings WHERE id IN (${ids.map(a => `"${a}"`).join(",")})`, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },
    getUnitsBattle: function (ids: string[]) {
        return new Promise<PickedUnits[]>((resolve, reject) => {
            this.db.all<PickedUnits>(`SELECT stat,id,health,shield,armor,damage,unit_type,attributes,weapon_type FROM units WHERE id IN (${ids.map(a => `"${a}"`).join(",")})`, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
}

export { content }
