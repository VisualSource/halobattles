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
    }],
    [1, {
        icon: "https://halo.wiki.gallery/images/5/54/HW2_Blitz_Blue_Elites.png",
        name: "Elite Rangers",
        cost: 2_000,
        time: 10,
        type: "unit",
        capSize: 1,
        requires: [],
        id: 1,
        globalMax: -1,
        description: "Normally deployed as an expeditionary force during limited naval engagements, it is they who choose which craft are to be boarded and which destroyed. Experts in both zero-g combat and demolitions, they have been the bane of many a ship. Rangers also perform HAZOP operations and traditional scouting roles.",
        stats: {
            isScout: true,
            effective: {
                air: "weak",
                vehicle: "weak",
                infantry: "strong",
                building: "normal"
            },
            attack: 8,
            type: "infantry",
            damageType: "plasma",
            health: 150,
            shealds: 15,
            hitChange: 55,
            events: null
        }
    }]
])

export default units;