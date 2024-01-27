import { type Unit, UnitStackState, type Building as BuildingType } from "halobattles-shared";
import TimedQueue from "#lib/queue/timed_queue.js";
import { type Json } from "./types.js"
import merge from "#lib/merge.js";

type PlanetProps = {
    uuid: string,
    position: {
        x: number,
        y: number,
        z: number
    },
    color: string,
    label: string
}

export type IndexRange = 0 | 1 | 2;
export type UnitSlot = { icon: string; id: string; count: number };
export type StackState = { state: UnitStackState, icon: string | null } | null;
export type Building = { display: boolean; id: string; icon: string; instance: string; }

export default class Planet implements Json<PlanetProps> {
    public contested: boolean = false;
    public neighbors: Set<string> = new Set();
    public uuid: string;
    public owner: string | null = null;
    public icon: string | null = null;
    public position: { x: number; y: number; z: number };
    public color: string;
    public label: string;
    public spies: Set<string> = new Set();
    public building_slots: number = 3;
    public buildings: Building[] = [];
    public units: Record<IndexRange, UnitSlot[]>;
    private _stack_cache: Record<IndexRange, StackState> = { 0: null, 1: null, 2: null }

    public unit_queue = new TimedQueue<Unit & { node: string; }>();
    public building_queue = new TimedQueue<BuildingType & { instance: string, node: string; }>();

    constructor({ uuid, position, color, label, ownerId = null, icon = null, units, buildings = [] }: PlanetProps & { buildings?: Building[], units?: Record<IndexRange, UnitSlot[]>, icon?: string | null; ownerId?: string | null }) {
        this.uuid = uuid;
        this.position = position;
        this.color = color;
        this.label = label;
        this.owner = ownerId;
        this.icon = icon;
        this.buildings = buildings;
        this.units = units ?? { 0: [], 1: [{ icon: "https://halo.wiki.gallery/images/0/0a/HW2_Banished_Locust.png", id: "locust_banished_00", count: 3 }], 2: [] };
    }

    get spiesArray() {
        return Array.from(this.spies);
    }

    public reset() {

        this.unit_queue.reset();
        this.building_queue.reset();

        this.buildings = [];
        this.spies = new Set();
        this.icon = null;
        this.units = { 0: [], 1: [], 2: [] };
        this._stack_cache = { 0: null, 1: null, 2: null };
    }

    public appendUnits(group: IndexRange, unit: UnitSlot[]): void {
        if (this.units[group].length >= 20) {
            throw new Error("Group is full");
        }

        this._stack_cache[group] = null;
        this.units[group] = merge(this.units[group], unit);
    }

    public invalidedCache(idx: IndexRange) {
        this._stack_cache[idx] = null;
    }

    /** @description Takes a unit from a group */
    public take(group: number) {
        if (group < 0 || group > 2) throw new RangeError("Index is out of range.");

        const copy = this.units[group as IndexRange].slice();
        this.units[group as IndexRange] = [];

        this._stack_cache[group as IndexRange] = null

        return copy;
    }
    public getUniqueBuildings() {
        return Array.from(new Set(this.buildings.filter(e => e.display).map(v => v.id)).values());
    }
    public getStackState(index: number): NonNullable<StackState> {
        if (index < 0 || index > 2) throw new RangeError("Index is out of range.");

        const cache = this._stack_cache[index as IndexRange];

        if (cache) return cache;

        let larget = 0;
        let icon = null;
        let count = 0;

        for (const item of this.units[index as keyof typeof this.units]) {
            count += item.count;

            if (item.count > larget) {
                icon = item.icon;
            }
        };

        let state = UnitStackState.Empty;
        switch (true) {
            case count >= 1:
                state = UnitStackState.One;
                break;
            case count > 100:
                state = UnitStackState.Half;
                break;
            case count > 200:
                state = UnitStackState.Three;
            case count > 350:
                state = UnitStackState.Full;
                break;
        }

        const value = { state, icon };

        this._stack_cache[index as IndexRange] = value;

        return value;
    }
    public asJson(): PlanetProps & { stacks: Record<IndexRange, NonNullable<StackState>>, owner: string | null, icon: string | null; } {
        return {
            uuid: this.uuid,
            position: this.position,
            color: this.color,
            label: this.label,
            owner: this.owner,
            icon: this.icon,
            stacks: {
                0: this.getStackState(0),
                1: this.getStackState(1),
                2: this.getStackState(2)
            }
        }
    }
}