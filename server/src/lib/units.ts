import { Team } from "halobattles-shared";
import sqlite3 from 'sqlite3';
import { getFile } from '#lib/utils.js';

type WeaponType = "kinetic" | "plasma" | "hardlight" | "fire" | "cryo" | "none";
type Stat = `g:${number},i:${number},a:${number},e:${number}`;
type JsonStringArray = `[${string}]`;
type UnitType = "infantry" | "vehicle" | "ground" | "enplacement";

type Unit = {
    id: `${string}_${string}_${number}${number}`;
    name: string;
    icon: string;
    unit_cap: number;
    leader_cap: number;
    max_unique: number;
    supplies: number;
    energy: number;
    shield: number;
    health: number;
    armor: number;
    damage: number;
    requires: JsonStringArray,
    faction: Team,
    weapon_type: WeaponType;
    stat: Stat,
    attributes: JsonStringArray;
    unit_type: UnitType;
}

type Building = {
    id: `${string}_${string}`,
    name: string;
    icon: string;
    description: string;
    faction: Team,
    max_local_instances: number;
    max_global_instances: number;
    requires: JsonStringArray;
    supplies: number;
    energy: number;
    upkeep_energy: number;
    upkeep_supplies: number;
    attributes: JsonStringArray;
    stat: Stat,
    weapon_type: WeaponType;
    shield: number;
    health: number;
    armor: number;
    damage: number;
}

const units = {
    db: new sqlite3.Database(getFile("../../db/units.db", import.meta.url), sqlite3.OPEN_READONLY),
    getUnit: function (item: string) {
        return new Promise<Unit>((resolve, reject) => {
            this.db.get<Unit>("SELECT * FROM units WHERE id = $id;", {
                $id: item
            }, (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });
    },
    getBuilding: function (item: string) {
        return new Promise<Building>((resolve, reject) => {
            this.db.get<Building>("SELECT * FROM buildings WHERE id = $id;", {
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

export { units }
