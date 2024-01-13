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

export default class Planet implements Json<PlanetProps> {
    public uuid: string;
    public owner: string | null = null;
    public icon: string | null = null;
    public position: { x: number; y: number; z: number };
    public color: string;
    public label: string;
    public spies: string[] = [];
    public building_slots: number = 3;
    public buildings: { id: string; icon: string; instance: number; }[] = [];
    public units: {
        0: { icon: string; id: string; count: number }[],
        1: { icon: string; id: string; count: number }[],
        2: { icon: string; id: string; count: number }[]
    } = {
            0: [{ icon: "https://halo.wiki.gallery/images/0/0a/HW2_Banished_Locust.png", id: "d8f5338e-4516-42ba-baba-c59ac87ab577", count: 3 }],
            1: [],
            2: []
        }
    constructor({ uuid, position, color, label, ownerId, icon }: PlanetProps & { icon?: string; ownerId?: string }) {
        this.uuid = uuid;
        this.position = position;
        this.color = color;
        this.label = label;
        this.owner = ownerId ?? null;
        this.icon = icon ?? null;
    }

    /**
     * Merge Group A into Group B
     *
     * @param {number} groupA
     * @param {number} groupB
     * @memberof Planet
     */
    public mergeUnits(groupA: number, groupB: number) {
        if (groupA < 0 || groupB < 0 || groupA > 2 || groupB > 2) throw new RangeError("Indexs out of range");

        for (const item of this.units[groupA as 0 | 1 | 2]) {
            const idx = this.units[groupB as 0 | 1 | 2].findIndex(value => value.id === item.id);
            if (idx === -1) {
                this.units[groupB as 0 | 1 | 2].push(item);
                continue;
            }
            this.units[groupB as 0 | 1 | 2][idx]!.count += item.count;
        }

        this.units[groupA as 0 | 1 | 2] = [];
    }

    public getStackState(index: number): { state: UnitStackState, icon: string | null } {
        if (index < 0 || index > 2) throw new RangeError("Index is out of range.");

        let larget = 0;
        let icon = null;
        let count = 0;

        for (const item of this.units[index as keyof typeof this.units]) {
            item.count += count;

            if (item.count > larget) {
                icon = item.icon;
            }
        };

        let state = UnitStackState.Empty;
        switch (true) {
            case count <= 0:
                break;
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

        return { state, icon };
    }
    asJson(): PlanetProps & { stacks: Record<0 | 1 | 2, { state: UnitStackState, icon: string | null }>, owner: string | null, icon: string | null; } {
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