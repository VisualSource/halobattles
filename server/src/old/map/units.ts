export type AttackType = "plasma" | "kinetic" | "hardlight" | "burn" | "freeze";
import unitsJson from "../data/units.json" assert { type: "json" };

type BattleEventSpawn = {
    type: "spawn",
    unit: number;
    amount: number;
}
type BattleEventExploded = {
    type: "exploded",
    damage: number;
    range: number;
}
type BattleEventServive = {
    type: "servive",
    chance: number;
}

type BattleEventDamageEffectSiphon = {
    type: "siphon",
    value: number;
}

type BattleEventDamageEffectBurn = {
    type: "burn",
    damage: number;
    exp: number;
}

type BattleEventDamageEffectFreeze = {
    type: "freeze",
    damage: number;
    exp: number;
}

export type BattleEvents = {
    onHit?: BattleEventDamageEffectBurn | BattleEventDamageEffectFreeze | BattleEventDamageEffectSiphon;
    onDeath?: BattleEventSpawn | BattleEventExploded | BattleEventServive;
}
export type UnitType = "infantry" | "air" | "vehicle" | "building";
export type EffectiveState = "weak" | "normal" | "strong"

export type Unit = {
    icon: string;
    type: "unit",
    cost: number;
    name: string;
    time: number;
    id: number;
    requires: { id: number; type: "global" | "local" }[],
    globalMax: number;
    description: string;
    capSize: number;
    stats: {
        isScout: boolean,
        effective: {
            [unit in UnitType]: EffectiveState
        },
        attack: number;
        type: UnitType;
        damageType: AttackType;
        health: number;
        shealds: number;
        hitChange: number;
        events: BattleEvents | null
    }
}

const units = new Map<number, Unit>(unitsJson as [number, Unit][]);

export default units;