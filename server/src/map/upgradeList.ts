import type { AttackType, EffectiveState, UnitType } from "./units.js";

export type BuildingStat = {
    stat: "cap.current" | "cap.max" | "credits.income" | "nostat"
    value: number;
    color: "green" | "red",
    text: string;
} | { stat: "event", value: number; color: "green" | "red", text: string; event: string; run: "create" | "destory" }

interface Buildable {
    id: number;
    name: string;
    icon: string;
    description: string;
    maxLevel: number;
    requires: { id: number; type: "global" | "local" }[],
    max: {
        global: number;
        node: number;
    }
    levels: {
        [level: number]: {
            values: BuildingStat[];
            build: {
                cost: number;
                time: number;
            } | null
        }
    }
}

export interface BuildingData extends Buildable {
    type: "building";
    battle: null | {
        type: UnitType
        health: number;
        shealds: number;
        attack: number;
        hitChange: number;
        damageType: AttackType,
        effective: {
            [unit in UnitType]: EffectiveState
        },
    }
}

export interface TechData extends Buildable {
    type: "tech";
}


export const buildOptions = new Map<number, BuildingData | TechData>([
    [0, {
        id: 0,
        icon: "https://halo.wiki.gallery/images/b/b0/HW_FieldArmory_Concept.jpg",
        name: "Field Armory",
        type: "building",
        description: "The UNSC's Field Armory is a cross between a machine\fabrication shop, and a research laboratory. This is where the most advanced technology for the UNSC is created by dedicated engineers and scientists.",
        maxLevel: 5,
        requires: [],
        max: {
            global: -1,
            node: 1
        },
        battle: {
            effective: {
                "air": "normal",
                "building": "normal",
                "infantry": "normal",
                "vehicle": "normal"
            },
            type: "building",
            health: 100,
            shealds: 0,
            attack: 0,
            hitChange: 0,
            damageType: "kinetic",
        },
        levels: {
            1: {
                values: [{
                    value: 200,
                    stat: "cap.max",
                    color: "green",
                    text: "+200 Unit Cap",
                }],
                build: {
                    time: 10,
                    cost: 20_000,
                }
            },
            2: {
                values: [
                    {
                        value: 210,
                        stat: "cap.max",
                        color: "green",
                        text: "+210 Unit Cap",
                    }
                ],
                build: {
                    time: 10,
                    cost: 30_000
                }
            }
        }
    }],
    [
        1,
        {
            id: 1,
            icon: "https://halo.wiki.gallery/images/thumb/5/5e/HW2_Blitz_Bunker_Drop.jpg/1600px-HW2_Blitz_Bunker_Drop.jpg",
            name: "Citadel",
            type: "building",
            description: "Defend this with your life. lose this and its all over.",
            maxLevel: 1,
            requires: [],
            max: {
                global: 1,
                node: 1
            },
            battle: {
                effective: {
                    "air": "normal",
                    "building": "weak",
                    "infantry": "normal",
                    "vehicle": "normal"
                },
                type: "building",
                health: 500,
                shealds: 0,
                attack: 120,
                hitChange: 60,
                damageType: "kinetic",
            },
            levels: {
                1: {
                    values: [
                        {
                            value: 200,
                            stat: "cap.max",
                            color: "green",
                            text: "+200 Unit Cap",
                        },
                        {
                            value: 1_000,
                            stat: "credits.income",
                            color: "green",
                            text: "+1,000 Income",
                        },
                        {
                            value: 0,
                            stat: "event",
                            run: "destory",
                            color: "red",
                            text: "Lose on destory",
                            event: "player-lose-objective"
                        }
                    ],
                    build: null
                }
            }
        }
    ]
]);

