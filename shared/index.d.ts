export declare enum UnitStackState {
    Empty = "Empty",
    One = "One",
    Half = "Half",
    Three = "Three",
    Full = "Full"
}
export declare enum LaneType {
    Fast = "Fast",
    Slow = "Slow"
}
export declare enum Team {
    BANISHED = "BANISHED",
    COVENANT = "COVENANT",
    FORERUNNER = "FORERUNNER",
    UNSC = "UNSC"
}
export type WeaponType = "kinetic" | "plasma" | "hardlight" | "fire" | "cryo" | "none";
export type Stat = `g:${number},i:${number},a:${number},e:${number}`;
export type JsonStringArray = `[${string}]`;
export type UnitType = "infantry" | "air" | "ground" | "enplacement";
export type Unit = {
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
    requires: JsonStringArray;
    faction: Team;
    weapon_type: WeaponType;
    stat: Stat;
    attributes: JsonStringArray;
    unit_type: UnitType;
    build_time: number;
};
export type Building = {
    id: `${string}_${string}`;
    name: string;
    icon: string;
    description: string;
    faction: Team;
    max_local_instances: number;
    max_global_instances: number;
    requires: JsonStringArray;
    supplies: number;
    energy: number;
    upkeep_energy: number;
    upkeep_supplies: number;
    attributes: JsonStringArray;
    stat: Stat;
    weapon_type: WeaponType;
    shield: number;
    health: number;
    armor: number;
    damage: number;
    build_time: number;
};
export { };
