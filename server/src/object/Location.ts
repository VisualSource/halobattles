import type { UUID } from "../lib";
import { UpdateLocationUnitGroups } from "./Events";

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
    public moveToGroup(from: { group: GroupType, idx: number; id: number; }, to: { group: GroupType, idx: number }): UpdateLocationUnitGroups["payload"] {
        if (from.group === to.group && from.idx === to.idx) throw new Error("Can not move unit onto its self.");

        if (from.group === to.group) {
            const group = this.units[from.group].find(value => value.id === from.id);
            if (!group) throw new Error("Failed to find units in group.");
            group.idx = to.idx;

            return [{
                units: this.units[from.group],
                group: from.group,
                node: this.objectId
            }];
        }

        const origin = this.units[from.group].findIndex(value => value.id === from.id);
        const target = this.units[to.group].findIndex(value => value.id === from.id);
        if (origin === -1) throw new Error("Failed to find node");

        // if the same unit does not exits in the other group
        if (target === -1) {
            this.units[to.group].push({
                icon: this.units[from.group][origin].icon,
                count: 1,
                id: this.units[from.group][origin].id,
                idx: to.idx
            });

            this.units[from.group][origin].count -= 1;

            if (this.units[from.group][origin].count <= 0) {
                this.units[from.group].splice(origin, 1);
            }

            return [{
                units: this.units[from.group],
                group: from.group,
                node: this.objectId
            },
            {
                units: this.units[to.group],
                group: to.group,
                node: this.objectId
            }];
        }


        this.units[to.group][target].count++;
        this.units[from.group][origin].count -= 1;
        if (this.units[from.group][origin].count <= 0) {
            this.units[from.group].splice(origin, 1);
        }

        return [{
            units: this.units[from.group],
            group: from.group,
            node: this.objectId
        },
        {
            units: this.units[to.group],
            group: to.group,
            node: this.objectId
        }];
    }
    public appendUnits(group: GroupType, units: Unit[]): void {
        // do some stuff to merge groups
        this.units[group] = units;
    }
    public clearGroup(group: GroupType): void {
        this.units[group] = [];
    }
}