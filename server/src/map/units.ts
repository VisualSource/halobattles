export type AttackType = "plasma" | "kinetic" | "hardlight" | "burn" | "freeze";

type BattleEventSpawn = {
    type: "spawn",
    unit: number;
}
type BattleEventExploded = {
    type: "exploded",
    damage: number;
    range: number;
}
type BattleEventServive = {
    type: "servive",
    chance: number;
}

type BattleEventDamageEffectSiphon = {
    type: "siphon",
    value: number;
}

type BattleEventDamageEffectBurn = {
    type: "burn",
    damage: number;
    exp: number;
}

type BattleEventDamageEffectFreeze = {
    type: "freeze",
    damage: number;
    exp: number;
}

export type BattleEvents = {
    onHit?: BattleEventDamageEffectBurn | BattleEventDamageEffectFreeze | BattleEventDamageEffectSiphon;
    onDeath?: BattleEventSpawn | BattleEventExploded | BattleEventServive;
}
export type UnitType = "infantry" | "air" | "vehicle" | "building";
export type EffectiveState = "weak" | "normal" | "strong"

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
        isScout: boolean,
        effective: {
            [unit in UnitType]: EffectiveState
        },
        attack: number;
        type: UnitType;
        damageType: AttackType;
        health: number;
        shealds: number;
        hitChange: number;
        events: BattleEvents | null
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
            isScout: false,
            effective: {
                air: "normal",
                vehicle: "weak",
                infantry: "normal",
                building: "normal"
            },
            attack: 10,
            type: "infantry",
            damageType: "plasma",
            health: 200,
            shealds: 10,
            hitChange: 50,
            events: null
        }
    }]
])

export default units;