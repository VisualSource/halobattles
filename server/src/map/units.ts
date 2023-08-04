export type AttackType = "plasma" | "kinetic" | "hardlight" | "burn" | "freeze";
export type UnitType =
    "scout" |
    "light-infantry" |
    "infantry" |
    "heavy-infantry" |
    "super-heavy" |
    "apc" |
    "light-armor" |
    "medium-armor" |
    "hevey-armor" |
    "light-air" |
    "medium-air" |
    "heavy-air" |
    "anti-air" |
    "artillery" |
    "anti-infantry" |
    "building" |
    "enplacement" |
    "bunker"
export type Unit = {
    icon: string;
    type: "unit",
    cost: number;
    name: string;
    time: number;
    id: number;
    requires: { id: number; type: "global" | "local" }[],
    globalMax: number;
    description: string;
    capSize: number;
    stats: {
        attack: number;
        type: UnitType;
        damageType: AttackType;
        health: number;
        shealds: number;
        hitChange: number;
        events: {
            onHit?: { exp: number; type: "damage", value: number, id: string; }[],
            onDeath?: { exp: number; type: "damage", value: number, id: string; }[]
        }
    }
}


const units = new Map<number, Unit>([
    [0, {
        icon: "https://halo.wiki.gallery/images/6/62/HW2_Blitz_Bloodfuel_Grunts.png",
        name: "Bloodfuel Grunts",
        cost: 10_000,
        time: 20,
        type: "unit",
        capSize: 1,
        requires: [],
        id: 0,
        globalMax: -1,
        description: "Bloodfuel Grunts are equipped with a form of backpack and with unidentified weaponry. These weapons are seemingly capable of 'siphoning' the health out of the target of the weapon and healing the user wielding them.",
        stats: {
            attack: 10,
            type: "infantry",
            damageType: "plasma",
            health: 200,
            shealds: 10,
            hitChange: 50,
            events: {}
        }
    }]
])

export default units;