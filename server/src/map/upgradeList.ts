export type BuildingOrTech = {
    time: number;
    id: number;
    icon: string;
    name: string;
    type: "building" | "tech"
    description: string;
    bouns: { color: "green" | "red", text: string; }[],
    cost: number;
    maxLevel: number;
    actions: unknown[],
    effects: unknown[]
}


export const buildOptions = new Map<number, BuildingOrTech>([
    [0, {
        icon: "https://halo.wiki.gallery/images/b/b0/HW_FieldArmory_Concept.jpg",
        name: "Field Armory",
        time: 10,
        id: 0,
        maxLevel: 5,
        type: "building",
        description: "The UNSC's Field Armory is a cross between a machine\fabrication shop, and a research laboratory. This is where the most advanced technology for the UNSC is created by dedicated engineers and scientists.",
        cost: 20_000,
        actions: [],
        effects: [],
        bouns: [{ color: "green", text: "+200 Unit Cap" }]
    }]
]);

