import type { UUID } from "../lib";

type BuildTypes = "units" | "buildings"

type Props = {
    name: string;
    owner: UUID | null;
    objectId: UUID;
    links: UUID[];
    position: {
        x: number;
        y: number;
    }
}

export type Unit = {
    icon: string;
    id: number;
    count: number;
    idx: number
};
export type Building = { id: string; level: number; }

export const Group = {
    LEFT: "left",
    CENTER: "center",
    RIGHT: "right"
} as const;

export type GroupType = typeof Group[keyof typeof Group];

export default class Location {
    public buildOptions: { [key in BuildTypes]: { allowed: number[]; current: number[] } } = {
        units: {
            allowed: [0],
            current: []
        },
        buildings: {
            allowed: [0],
            current: []
        }
    }
    public name: string;
    public owner: UUID | null;
    public objectId: UUID;
    public units: { [key in GroupType]: Unit[] } = {
        left: [
            {
                count: 1,
                icon: "https://halo.wiki.gallery/images/6/62/HW2_Blitz_Bloodfuel_Grunts.png",
                idx: 2,
                id: 0
            }
        ],
        right: [],
        center: []
    };
    public buildings: Building[] = [];
    public position: { x: number; y: number };
    public connectsTo: UUID[] = [];
    constructor({ links, objectId, owner, position, name }: Props) {
        this.connectsTo = links;
        this.objectId = objectId;
        this.owner = owner;
        this.position = position;
        this.name = name;
    }
    public getWeight(owner: string | null) {
        if (!owner) return 1;
        return this.owner === owner ? 0 : 2;
    }
    public getUnitFromGroup(group: GroupType) {
        return structuredClone(this.units[group]);
    }
    public appendUnits(group: GroupType, units: Unit[]): void {
        // do some stuff to merge groups
        this.units[group] = units;
    }
    public clearGroup(group: GroupType): void {
        this.units[group] = [];
    }
}