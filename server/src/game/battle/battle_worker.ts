import { composeUnits, getAttackerResults, getDefenderResult } from "./battle_utils.js";
import type { Building, IndexRange, UnitSlot } from "#game/Planet.js";
import { BattleBuilding, type BattleUnit } from './battle_class.js';
import type { Transfer } from "#game/Core.js";
import { content } from "#game/content.js";

export default async function main({ transfer, defender }: { transfer: Transfer, defender: { owner: string; buildings: Building[], units: Record<IndexRange, UnitSlot[]> } }) {

    const attackerData = await content.getUnitsBattle(transfer.units.map(e => e.id));
    const defenderA = await content.getUnitsBattle(defender.units[0].map(e => e.id));
    const defenderB = await content.getUnitsBattle(defender.units[1].map(e => e.id));
    const defenderC = await content.getUnitsBattle(defender.units[2].map(e => e.id));
    const defenderD = await content.getBuildingsBattle(Array.from(defender.buildings.reduce((acc, i) => acc.add(i.id), new Set<string>())));

    let attackers: BattleUnit[] = [];
    composeUnits(attackers, attackerData, transfer.units, null);

    let defenders: (BattleUnit | BattleBuilding)[] = [];
    composeUnits(defenders, defenderA, defender.units[0], 0);
    composeUnits(defenders, defenderB, defender.units[1], 1);
    composeUnits(defenders, defenderC, defender.units[2], 2);
    for (const item of defender.buildings) {
        if (!item.display) continue;
        const data = defenderD.find(e => e.id === item.id);
        if (!data) throw new Error("Failed to find building");
        defenders.push(new BattleBuilding({ ...data, instance: item.instance, unit_type: "enplacement", count: 1 }));
    }

    if (attackers.length === 0 || defenders.length === 0) {
        return {
            winner: "defender",
            transfer: transfer.id,
            attacker: {
                alive: {
                    units: {},
                    buildings: []
                },
                dead: {
                    units: {},
                    buildings: []
                }
            },
            defender: {
                alive: {
                    units: {},
                    buildings: []
                },
                dead: {
                    units: {},
                    buildings: []
                }
            }
        };
    }

    let turn = "defender";
    let deadDefender: (BattleBuilding | BattleUnit)[] = []
    let deadAttacker: BattleUnit[] = []

    while (attackers.length !== 0 && defenders.length !== 0) {
        const currentA = defenders[Math.floor(Math.random() * defenders.length)]!;
        const currentB = attackers[Math.floor(Math.random() * attackers.length)]!;

        const effectiveDamge = currentA.damage * currentA?.effectiveness(currentB.unit_type);

        const accelerator = 4.5;
        const attackForce = (currentA.damage * currentA.getHealth()) + effectiveDamge;
        const defenseForce = currentB.getDefense() * currentB.getHealth() * (turn === "defender" ? 1.2 : 1);
        const totalDamage = attackForce + defenseForce;
        const attackResult = Math.round((attackForce / totalDamage) * (currentA.damage) * accelerator);
        const defenseResult = Math.round((defenseForce / totalDamage) * currentB.getDefense() * accelerator);

        currentB.applyDamage(attackResult);
        currentA.applyDamage(defenseResult);

        const resultAttacker = attackers.reduce((acc, current) => {
            if (current.isDead) {
                acc.dead.push(current);
                return acc;
            }
            acc.alive.push(current);
            return acc;
        }, { dead: [] as (BattleUnit)[], alive: [] as (BattleUnit)[] });
        const resultDefender = defenders.reduce((acc, current) => {
            if (current.isDead) {
                acc.dead.push(current);
                return acc;
            }
            acc.alive.push(current);
            return acc;
        }, { dead: [] as (BattleBuilding | BattleUnit)[], alive: [] as (BattleBuilding | BattleUnit)[] });

        // handle effects

        attackers = resultAttacker.alive;
        defenders = resultDefender.alive;
        deadAttacker.push(...resultAttacker.dead);
        deadDefender.push(...resultDefender.dead);
        turn === "defender" ? "attacker" : "defender";
    }

    return {
        winner: attackers.length === 0 ? "defenders" : "attacker",
        transfer: transfer.id,
        attacker: getAttackerResults(deadAttacker, attackers),
        defender: getDefenderResult(deadDefender, defenders)
    };
}


