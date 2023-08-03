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
    on: {
        create?: { affects: "planet" | "player", }[]
        destory?: { affects: "planet" | "player", }[],
        upgrade?: { affects: "planet" | "player", }[]
    },
    levels: {
        [level: number]: {
            values: {
                stat: "cap.current";
                value: number;
                color: "green" | "red",
                text: string;
            }[];
            build: {
                cost: number;
                time: number;
            } | null
        }
    }
}

interface BuildingData extends Buildable {
    type: "building";
    battle: {
        health: number;
        shealds: number;
        attack: number;
        hitChange: number;
    }
}

interface TechData extends Buildable {
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
        on: {},
        max: {
            global: -1,
            node: 1
        },
        battle: {
            health: 100,
            shealds: 0,
            attack: 0,
            hitChange: 0
        },
        levels: {
            1: {
                values: [{
                    value: 200,
                    stat: "cap.current",
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
                        stat: "cap.current",
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
    }]
]);

