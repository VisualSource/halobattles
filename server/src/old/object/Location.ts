import { randomUUID } from 'node:crypto';
import { UpdateLocationUnitGroups } from "./Events.js";
import { buildOptions } from "../map/upgradeList.js";
import type { UUID } from "../lib.js";

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type BuildTypes = "units" | "buildings"

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
    buildOptions: { [key in BuildTypes]: { not_allowed: number[]; current: number[] } }
    spies: UUID[];
    name: string;
    owner: UUID | null;
    color: number;
    objectId: UUID;
    units: { [key in GroupType]: Unit[] };
    buildings: Building[];
    connectsTo: UUID[];
    queueIds: { [key in BuildTypes]: { a: UUID; b: UUID; } };
    position: {
        x: number;
        y: number;
    }
}

export default class Location {
    public contested = false;
    public buildOptions: { [key in BuildTypes]: { not_allowed: number[]; current: number[] } }
    public maxBuildingSlots: number = 6;
    public queueIds: { [key in BuildTypes]: { a: UUID; b: UUID; } };
    public spies: UUID[] = [];
    public name: string;
    public color: number;
    public owner: UUID | null = null;
    public objectId: UUID;
    public units: { [key in GroupType]: Unit[] };
    public buildings: Building[] = [];
    public position: { x: number; y: number };
    public connectsTo: UUID[] = [];
    constructor({ queueIds, connectsTo, objectId, owner, position, name, units, buildOptions, color, buildings }: PartialBy<LocationProps, "owner" | "contested" | "units" | "spies" | "buildings" | "buildOptions" | "maxBuildingSlots" | "color" | "queueIds">) {
        this.connectsTo = connectsTo;
        this.objectId = objectId;
        this.owner = owner ?? null;
        this.position = position;
        this.buildings = buildings ?? [];
        this.name = name;
        this.color = color ?? 0xd3d3d3;
        this.queueIds = queueIds ?? {
            units: {
                a: randomUUID(),
                b: randomUUID(),
            },
            buildings: {
                a: randomUUID(),
                b: randomUUID()
            }
        };
        this.buildOptions = buildOptions ?? {
            units: {
                not_allowed: [],
                current: []
            },
            buildings: {
                not_allowed: [],
                current: []
            }
        };
        this.units = units ?? {
            left: [],
            right: [],
            center: []
        };
    }
    public resetNode() {
        this.buildOptions.buildings.current = [];
        this.buildOptions.units.current = [];

        this.units.center = [];
        this.units.left = [];
        this.units.right = [];

        this.buildings = [];

        this.spies = [];

        this.maxBuildingSlots = 6;

        this.contested = false;

    }

    public setOwner(id: UUID, color: number) {
        this.owner = id;
        this.color = color;
    }
    public getTransferTime(): number {
        return 10;
    }

    public getWeight(owner: string | null) {
        if (!owner) return 1;
        return this.owner === owner ? 0 : 2;
    }
    public getUnitFromGroup(group: GroupType) {
        return structuredClone(this.units[group]);
    }
    public isEmpty() {
        return !this.units.center.length && !this.units.left.length && !this.units.right.length;
    }
    public hasDefence() {
        return this.buildings.some((value) => {
            const item = buildOptions.get(value.id);
            if (!item || item.type !== "building" || !item?.battle) return false;
            return item.battle.attack > 0;
        });
    }
    public removeUnitFromAny(unit: Unit) {

        const value = this.removeUnit("left", unit);
        if (value !== null && value === 0) return true;

        const center = this.removeUnit("center", { ...unit, count: value ?? unit.count });
        if (center !== null && center === 0) return true;

        const right = this.removeUnit("right", { ...unit, count: center ?? unit.count });
        if (right !== null && right === 0) return true;

        return false;
    }
    public removeUnit(group: GroupType, unit: Unit) {
        const idx = this.units[group].findIndex(value => value.id === unit.id);

        if (idx !== -1) {
            this.units[group][idx].count -= unit.count;

            if (this.units[group][idx].count <= 0) {
                const remaing = Math.abs(this.units[group][idx].count);
                this.units[group].splice(idx, 1);
                return remaing;
            }

            return 0;
        }

        return null;
    }

    public removeBuilding(instId: string) {
        const idx = this.buildings.findIndex(value => value.objId === instId);

        if (idx === -1) return;

        const items = this.buildings.splice(idx, 1);

        const buildId = this.buildOptions.buildings.current.findIndex(value => value === items.at(0)?.id);
        if (buildId) this.buildOptions.buildings.current.splice(buildId, 1);

        return items;
    }

    public moveToGroup(from: { group: GroupType, idx: number; id: number; }, to: { group: GroupType, idx: number }, moveGroups: boolean = false): UpdateLocationUnitGroups["payload"] {
        if (from.group === to.group && from.idx === to.idx) throw new Error("Can not move unit onto its self.");

        const count = moveGroups ? 5 : 1;

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
                count: moveGroups ? this.units[from.group][origin].count > 5 ? this.units[from.group][origin].count - 5 : this.units[from.group][origin].count : 1,
                id: this.units[from.group][origin].id,
                idx: to.idx
            });

            this.units[from.group][origin].count -= count;

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


        this.units[to.group][target].count += count;
        this.units[from.group][origin].count -= count;
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
        for (const unit of units) this.addUnit(group, unit);
    }
    public addUnit(group: GroupType, unit: Unit): void {
        const idx = this.units[group].findIndex(value => value.id === unit.id);

        if (idx !== -1) {
            this.units[group][idx].count += unit.count;
            return;
        }

        // try to place unit in open slot.
        let placed = false;
        let i = 0;
        while (i < 12) {
            const pos = this.units[group].findIndex(value => value.idx === i);
            if (pos !== -1) continue;

            placed = true;
            this.units[group].push({
                ...unit,
                idx: i
            });
            break;
        }

        if (!placed) {
            throw new Error("Failed to place unit with group");
        }
    }
    public clearGroup(group: GroupType): void {
        this.units[group] = [];
    }
    public addBuilding(building: Building) {
        this.buildOptions.buildings.current.push(building.id);
        this.buildings.push(building);
    }
}