import type { AttackType, EffectiveState, UnitType } from "./units.js";
import ItemJson from '../../meta/buildings.json' assert { type: "json" };

export type BuildingStat = {
    stat: "cap.current" | "cap.max" | "credits.income" | "nostat"
    value: number;
    color: "green" | "red",
    text: string;
} | { stat: "event", value: number; color: "green" | "red", text: string; event: string; run: "create" | "destory" }

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
    levels: {
        [level: number]: {
            values: BuildingStat[];
            build: {
                cost: number;
                time: number;
            } | null
        }
    }
}
export interface BuildingData extends Buildable {
    type: "building";
    battle: null | {
        type: UnitType
        health: number;
        shealds: number;
        attack: number;
        hitChange: number;
        damageType: AttackType,
        effective: {
            [unit in UnitType]: EffectiveState
        },
    }
}
export interface TechData extends Buildable {
    type: "tech";
}
export type Item = BuildingData | TechData;
export const buildOptions = new Map<number, Item>(ItemJson as [number, Item][]);