export type AttackType = "plasma" | "kinetic" | "hardlight" | "burn" | "freeze";

type BattleEventSpawn = {
    type: "spawn",
    unit: number;
    amount: number;
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

/**
 *  UNSC:      Marine,               OSDT,               UNSC Sniper,               Cyclops,            Warthog,                     Wolverine,      Scorpion,        Grizzly,            Hornet,
 * Banished:   Grunts,               Heavy Grunts ,      Jump Pack Brutes,          Jiralhanae Warlord, Chopper,                     Reaver,         Wraith,          Ironclad Wraith,    Banshee
 * Covenant:   Grunts                Elite Enforcers     Elite Rangers              Hunters,            Ghost                        AA Wraith,      Wraith,          Ironclad Wraith,    Banshee
 * Forrunners: Prometheans Soliders, Prometheans Knight, Promethean Sniper Soldier, Protector Sentinel, Trove Protector Sentinels. , Super Sentinel  Enforcer sential,Retriever Sentinel, Sentienal Swarm
 */

const units = new Map<number, Unit>([
    [0, {
        icon: "https://halo.wiki.gallery/images/0/06/HW2_Blitz_Marines_Old_logo.png",
        type: "unit",
        cost: 1000,
        name: "UNSC Marines",
        time: 5,
        id: 0,
        requires: [],
        globalMax: -1,
        description: "",
        capSize: 1,
        stats: {
            isScout: false,
            effective: {
                air: "normal",
                building: "normal",
                infantry: "normal",
                vehicle: "normal"
            },
            attack: 10,
            type: "infantry",
            damageType: "kinetic",
            health: 100,
            shealds: 0,
            hitChange: 50,
            events: null
        }
    }],
    [1, {
        icon: "https://halo.wiki.gallery/images/9/9d/HW2-BlitzODSTs.jpg",
        type: "unit",
        cost: 3000,
        name: "UNSC OSDTs",
        time: 15,
        id: 1,
        requires: [],
        description: "",
        capSize: 2,
        globalMax: -1,
        stats: {
            isScout: false,
            effective: {
                air: "normal",
                building: "strong",
                infantry: "strong",
                vehicle: "normal"
            },
            attack: 20,
            damageType: "kinetic",
            events: null,
            health: 150,
            shealds: 0,
            type: "infantry",
            hitChange: 55,
        }
    }],
    [2, {
        icon: "https://halo.wiki.gallery/images/2/2e/HW2-BlitzUNSCSniper.jpg",
        type: "unit",
        cost: 5000,
        name: "UNSC Sniper",
        time: 20,
        id: 2,
        requires: [],
        globalMax: -1,
        description: "",
        capSize: 1,
        stats: {
            isScout: true,
            effective: {
                air: "weak",
                building: "weak",
                infantry: "strong",
                vehicle: "weak"
            },
            damageType: "kinetic",
            attack: 200,
            events: null,
            health: 100,
            hitChange: 60,
            shealds: 0,
            type: "infantry"
        }
    }],
    [3, {
        icon: "https://www.halopedia.org/File:HW2_Blitz_Cyclops.png",
        type: "unit",
        cost: 8000,
        name: "Mark III [B-II] Cyclops",
        time: 50,
        id: 3,
        requires: [{ id: -1, type: "local" }],
        globalMax: -1,
        description: "",
        capSize: 4,
        stats: {
            isScout: false,
            effective: {
                air: "weak",
                infantry: "normal",
                vehicle: "strong",
                building: "strong"
            },
            events: null,
            damageType: "kinetic",
            attack: 150,
            health: 115,
            shealds: 10,
            type: "vehicle",
            hitChange: 50
        }
    }],
    [4, {
        icon: "https://halo.wiki.gallery/images/5/5b/HW2_Blitz_Warthog.png",
        type: "unit",
        cost: 10_000,
        name: "M12B Warthog LRV",
        time: 60,
        id: 4,
        requires: [],
        globalMax: -1,
        description: "The most common variant of Warthog, variants equipped with a mounted chaingun including the M41, M46 and M343A2 chaingun.",
        capSize: 5,
        stats: {
            isScout: false,
            effective: {
                infantry: "strong",
                vehicle: "normal",
                air: "normal",
                building: "normal"
            },
            attack: 125,
            damageType: "kinetic",
            events: null,
            health: 200,
            shealds: 0,
            hitChange: 50,
            type: "vehicle"
        }
    }],
    [5, {
        icon: "https://halo.wiki.gallery/images/e/eb/HW2_Blitz_Wolverine.png",
        type: "unit",
        cost: 9000,
        name: "Wolverine",
        time: 50,
        id: 5,
        requires: [],
        globalMax: -1,
        capSize: 4,
        description: "",
        stats: {
            isScout: false,
            effective: {
                air: "strong",
                building: "weak",
                infantry: "weak",
                vehicle: "weak"
            },
            attack: 115,
            damageType: "kinetic",
            events: null,
            health: 200,
            shealds: 0,
            hitChange: 50,
            type: "vehicle"
        }
    }],
    [6, {
        icon: "https://halo.wiki.gallery/images/f/f0/HW2_Blitz_Scorpion.png",
        type: "unit",
        cost: 12_000,
        name: "Scorpion",
        time: 120,
        id: 6,
        requires: [],
        globalMax: -1,
        capSize: 10,
        description: "",
        stats: {
            isScout: false,
            effective: {
                air: "normal",
                infantry: "strong",
                vehicle: "strong",
                building: "normal"
            },
            damageType: "kinetic",
            events: null,
            health: 300,
            shealds: 0,
            attack: 150,
            type: "vehicle",
            hitChange: 48,

        }
    }],
    [7, {
        icon: "https://halo.wiki.gallery/images/b/b9/HW2_Blitz_Grizzly.png",
        type: "unit",
        cost: 20_000,
        name: "Grizzly",
        time: 140,
        id: 7,
        requires: [],
        globalMax: -1,
        description: "",
        capSize: 20,
        stats: {
            isScout: false,
            effective: {
                air: "normal",
                infantry: "strong",
                vehicle: "strong",
                building: "normal"
            },
            events: null,
            damageType: "kinetic",
            health: 400,
            shealds: 0,
            attack: 175,
            type: "vehicle",
            hitChange: 48
        }
    }],
    [8, {
        icon: "https://halo.wiki.gallery/images/f/fe/HW2_Blitz_Hornet.png",
        type: "unit",
        cost: 8000,
        name: "AV-14B Hornet",
        time: 100,
        id: 8,
        requires: [],
        globalMax: -1,
        description: "",
        capSize: 6,
        stats: {
            isScout: false,
            effective: {
                air: "normal",
                infantry: "normal",
                vehicle: "strong",
                building: "normal"
            },
            damageType: "kinetic",
            attack: 75,
            events: null,
            health: 85,
            shealds: 0,
            hitChange: 50,
            type: "air",
        }
    }],
    [9, {
        icon: "https://halo.wiki.gallery/images/5/5e/HW2-CrabUnggoy.jpg",
        name: "Grunts",
        cost: 1_000,
        time: 5,
        type: "unit",
        capSize: 1,
        requires: [],
        id: 9,
        globalMax: -1,
        description: "",
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
            health: 100,
            shealds: 0,
            hitChange: 50,
            events: null
        }
    }],
    [10, {
        icon: "https://halo.wiki.gallery/images/3/3e/HW2-BlitzUnggoyHeavy.jpg",
        type: "unit",
        cost: 3000,
        name: "Heavy Grunts",
        time: 15,
        capSize: 2,
        requires: [],
        id: 10,
        description: "",
        globalMax: -1,
        stats: {
            isScout: false,
            effective: {
                air: "normal",
                building: "normal",
                vehicle: "strong",
                infantry: "normal"
            },
            attack: 20,
            health: 100,
            shealds: 25,
            hitChange: 50,
            events: null,
            type: "infantry",
            damageType: "plasma"
        }
    }],
    [11, {
        icon: "https://halo.wiki.gallery/images/0/07/HW2_Blitz_Jump_Pack_Brute.png",
        type: "unit",
        cost: 5000,
        name: "Jump Pack Brutes",
        time: 20,
        capSize: 1,
        id: 11,
        requires: [],
        description: "",
        globalMax: -1,
        stats: {
            isScout: true,
            effective: {
                air: "weak",
                infantry: "normal",
                vehicle: "weak",
                building: "strong"
            },
            attack: 200,
            shealds: 0,
            health: 200,
            damageType: "kinetic",
            hitChange: 49,
            events: null,
            type: "infantry",
        }
    }],
    [12, {
        icon: "https://halo.wiki.gallery/images/b/b2/HW2-BlitzJiralhanaeWarlord.jpg",
        type: "unit",
        cost: 8000,
        name: "Jiralhanae Warlord",
        id: 12,
        capSize: 5,
        time: 50,
        requires: [],
        description: "",
        globalMax: -1,
        stats: {
            isScout: false,
            effective: {
                air: "weak",
                infantry: "strong",
                vehicle: "normal",
                building: "strong"
            },
            damageType: "kinetic",
            events: null,
            attack: 215,
            health: 300,
            shealds: 0,
            type: "infantry",
            hitChange: 50
        }
    }]
])

export default units;