import { Team, type Unit, type Building } from "halobattles-shared";
import sqlite3 from 'sqlite3';
import { getFile } from '#lib/utils.js';
import { Prettify, UniqueArray } from "./types.js";

type GetBuildingKeys<T extends (keyof Building)[]> = T extends ["*"] ? Building : Pick<Building, T[number]>;
type GetUnitKeys<T extends (keyof Unit)[]> = T extends ["*"] ? Unit : Pick<Unit, T[number]>;

const content = {
    db: new sqlite3.Database(getFile("../../db/units.db", import.meta.url), sqlite3.OPEN_READONLY),
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
    }
}

export { content }
