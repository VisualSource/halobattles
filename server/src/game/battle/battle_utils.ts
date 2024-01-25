import type { IndexRange, UnitSlot } from '#game/Planet.js';
import { Unit } from 'halobattles-shared';
import { BattleBuilding, BattleUnit } from './battle_class.js';
import groupBy from 'lodash.groupby';

type ReturnGroup = { id: string; count: number, group: IndexRange | null };
export type OutputPart = {
    dead: {
        units: {
            0?: ReturnGroup[],
            1?: ReturnGroup[],
            2?: ReturnGroup[]
        },
        buildings: { id: string; instance: string; }[]
    },
    alive: {
        units: {
            0?: ReturnGroup[],
            1?: ReturnGroup[],
            2?: ReturnGroup[]
        },
        buildings: { id: string; instance: string; }[]
    }
}

export function composeUnits(output: (BattleUnit | BattleBuilding)[], data: Pick<Unit, "id" | "shield" | "health" | "armor" | "damage" | "weapon_type" | "stat" | "attributes" | "unit_type">[], source: UnitSlot[], group: IndexRange | null) {
    for (const e of data) {
        const unit = source.find(i => i.id === e.id);
        if (!unit) throw new Error("Failed to get unit");
        output.push(new BattleUnit({ ...e, count: unit.count, group: group }));
    }
}

export function getAttackerResults(deadUnits: BattleUnit[], aliveUnits: BattleUnit[]): OutputPart {
    const dead: { id: string; count: number, group: IndexRange | null }[] = [];
    const alive: { id: string; count: number, group: IndexRange | null }[] = [];

    for (const item of deadUnits) {
        dead.push(item.getData())
    }

    for (const item of aliveUnits) {
        const remaing = item.getAlive();
        const lost = item.count - remaing;

        if (remaing > 0) {
            alive.push({ count: item.count, id: item.id, group: null });
        }

        if (lost > 0) {
            dead.push({ count: item.count, id: item.id, group: null });
        }
    }

    return {
        dead: {
            units: {
                0: dead,
            },
            buildings: []
        },
        alive: {
            units: {
                0: alive,
            },
            buildings: []
        }
    }
}

export function getDefenderResult(deadItems: (BattleUnit | BattleBuilding)[], aliveItems: (BattleUnit | BattleBuilding)[]): OutputPart {
    const unitsDead: { id: string; count: number, group: IndexRange | null }[] = [];
    const unitsAlive: { id: string; count: number, group: IndexRange | null }[] = [];
    const buildingsDead: { id: string; instance: string; }[] = [];
    const buildingsAlive: { id: string; instance: string; }[] = [];

    for (const dead of deadItems) {
        if (dead instanceof BattleBuilding) {
            buildingsDead.push(dead.getData());
            continue;
        }
        unitsDead.push(dead.getData());
    }

    for (const item of aliveItems) {
        if (item instanceof BattleBuilding) {
            buildingsAlive.push(item.getData());
            continue;
        }
        const remaing = item.getAlive();
        const lost = item.count - remaing;
        if (remaing > 0) {
            unitsAlive.push({ count: item.count, id: item.id, group: item.group });
        }
        if (lost > 0) {
            unitsDead.push({ count: item.count, id: item.id, group: item.group });
        }
    }

    return {
        dead: {
            units: groupBy(unitsDead, e => e.group) as OutputPart["alive"]["units"],
            buildings: buildingsDead
        },
        alive: {
            units: groupBy(unitsAlive, e => e.group) as OutputPart["alive"]["units"],
            buildings: buildingsAlive
        }
    };
}