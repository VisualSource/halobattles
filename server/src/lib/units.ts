import sqlite3 from 'sqlite3';
import { Team } from '#lib/game/enums.js';
import { getFile } from '#lib/utils.js';

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
    requires: string | string[],
    faction: Team,
    weapon_type: "kinetic" | "plasma" | "hardlight" | "fire" | "cryo";
    stat: `g:${number},i:${number},a:${number},e:${number}`,
    attributes: string;
    unit_type: "infantry" | "vehicle" | "ground" | "enplacement";
}

const units = {
    db: new sqlite3.Database(getFile("../../db/units.db", import.meta.url), sqlite3.OPEN_READONLY),
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
            this.db.all<Unit>(`SELECT DISTINCT units.* FROM units, json_each(units.requires) WHERE json_each.value IN (${tech_and_buildings.map(e => `"${e}"`).join(",")}) AND faction = $faction;`, {
                $faction: faction,
            }, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            })
        });
    }
}

export { units }
