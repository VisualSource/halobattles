import { UpdateLocationUnitGroups } from "./Events";
import type { UUID } from "../lib";

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

type BuildTypes = "units" | "buildings"

export type Unit = {
    icon: string;
    id: number;
    count: number;
    idx: number
};
export type Building = { id: number; level: number; icon: string; objId: string; }

export const Group = {
    LEFT: "left",
    CENTER: "center",
    RIGHT: "right"
} as const;

export type GroupType = typeof Group[keyof typeof Group];

export type LocationProps = {
    contested: boolean;
    maxBuildingSlots: number;
    buildOptions: { [key in BuildTypes]: { allowed: number[]; current: number[] } }
    spies: UUID[];
    name: string;
    owner: UUID | null;
    color: number;
    objectId: UUID;
    units: { [key in GroupType]: Unit[] };
    buildings: Building[];
    connectsTo: UUID[];
    position: {
        x: number;
        y: number;
    }
}

export default class Location {
    public contested = false;
    public buildOptions: { [key in BuildTypes]: { allowed: number[]; current: number[] } }
    public maxBuildingSlots: number = 6;
    public spies: UUID[] = [];
    public name: string;
    public color: number;
    public owner: UUID | null;
    public objectId: UUID;
    public units: { [key in GroupType]: Unit[] };
    public buildings: Building[] = [{ id: 0, icon: "https://halo.wiki.gallery/images/b/b0/HW_FieldArmory_Concept.jpg", level: 1, objId: "afeaferfgg" }];
    public position: { x: number; y: number };
    public connectsTo: UUID[] = [];
    constructor({ connectsTo, objectId, owner, position, name, units, buildOptions, color }: PartialBy<LocationProps, "contested" | "units" | "spies" | "buildings" | "buildOptions" | "maxBuildingSlots" | "color">) {
        this.connectsTo = connectsTo;
        this.objectId = objectId;
        this.owner = owner;
        this.position = position;
        this.name = name;
        this.color = color ?? 0xd3d3d3;
        this.buildOptions = buildOptions ?? {
            units: {
                allowed: [],
                current: []
            },
            buildings: {
                allowed: [],
                current: []
            }
        };
        this.units = units ?? {
            left: [],
            right: [],
            center: []
        };
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