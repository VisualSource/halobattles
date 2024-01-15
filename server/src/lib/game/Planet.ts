import { UnitStackState } from "halobattles-shared";
import { type Json } from "./types.js"

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

export default class Planet implements Json<PlanetProps> {
    public neighbors: Set<string> = new Set();
    public uuid: string;
    public owner: string | null = null;
    public icon: string | null = null;
    public position: { x: number; y: number; z: number };
    public color: string;
    public label: string;
    public spies: string[] = [];
    public building_slots: number = 3;
    public buildings: { id: string; icon: string; instance: number; }[] = [];
    public units: Record<IndexRange, UnitSlot[]>;
    private _stack_cache: Record<IndexRange, StackState> = { 0: null, 1: null, 2: null }

    constructor({ uuid, position, color, label, ownerId, icon, units }: PlanetProps & { units?: Record<IndexRange, UnitSlot[]>, icon?: string; ownerId?: string }) {
        this.uuid = uuid;
        this.position = position;
        this.color = color;
        this.label = label;
        this.owner = ownerId ?? null;
        this.icon = icon ?? null;
        this.units = units ?? { 0: [], 1: [{ icon: "https://halo.wiki.gallery/images/0/0a/HW2_Banished_Locust.png", id: "d8f5338e-4516-42ba-baba-c59ac87ab577", count: 3 }], 2: [] };
    }
    public reset() {
        this.buildings = [];
        this.spies = [];
        this.icon = null;
        this.units = { 0: [], 1: [], 2: [] };
        this._stack_cache = { 0: null, 1: null, 2: null };
    }
    /**
     * Takes a unit from a group
     *
     */
    public take(group: number) {
        if (group < 0 || group > 2) throw new RangeError("Index is out of range.");

        const copy = this.units[group as IndexRange].slice();
        this.units[group as IndexRange] = [];

        return copy;
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
    asJson(): PlanetProps & { stacks: Record<IndexRange, NonNullable<StackState>>, owner: string | null, icon: string | null; } {
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