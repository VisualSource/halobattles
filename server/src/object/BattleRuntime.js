import { parentPort, workerData } from "node:worker_threads";
import groupBy from "lodash.groupby";
import remove from "lodash.remove";
import { buildOptions } from "../map/upgradeList.js";
import units from "../map/units.js";

/** @type {{ node: import("./Location.js").default, transfer: import("./GameState.js").UnitTransfer }} */
const input = workerData;

class Attackable {
  /**
   *
   * @type {import("../map/units.js").UnitType}
   * @memberof Attackable
   */
  unit_type = "building";
  /**
   *
   * @type {import("../map/units.js").AttackType}
   * @memberof Attackable
   */
  damage_type = "kinetic";
  /**
   *
   * @type {boolean}
   * @memberof Attackable
   */
  dead = false;
  /**
   *
   * @type {number}
   * @memberof Attackable
   */
  id;
  /**
   *
   * @type {"unit"|"building"|"tech"}
   * @memberof Attackable
   */
  type;
  /**
   *
   * @type {number}
   * @memberof Attackable
   */
  health = 100;
  /**
   *
   * @type {number}
   * @memberof Attackable
   */
  shealds = 0;
  /**
   *
   * @type {number}
   * @memberof Attackable
   */
  hit_change = 0;
  /**
   *
   * @type {number}
   * @memberof Attackable
   */
  attack = 0;
  /**
   *
   * @type {{ exp: number; type: "damage", value: number, id: string; }[]}
   * @memberof Attackable
   */
  effects = [];
  events = {
    onHit: [
      { exp: number, type: "damage", value: 10, id: "burn" },
      { exp: number, type: "damage", value: 10, id: "freeze" },
    ],
    onDeath: [],
  };
  /**
   * Creates an instance of Attackable.
   * @param {number} id
   * @param {number} count
   * @param {"building"|"unit"} type
   * @memberof Attackable
   */
  constructor(id, count, type) {
    this.id = id;
    this.type = type;
    this.count = count;

    switch (type) {
      case "building": {
        const item = buildOptions.get(id);
        if (!item)
          throw new Error(`Failed to get tech/building with ID(${id})`);
        if (item.type === "building") {
          this.health = item.battle.health;
          this.hit_change = item.battle.hitChange;
          this.shealds = item.battle.shealds;
          this.attack = item.battle.attack;
          this.unit_type = item.battle.type;
        }
        break;
      }
      case "unit": {
        const unit = units.get(id);
        if (!unit) throw new Error(`Failed to get unit data for ID(${id})`);
        this.damage_type = unit.stats.damageType;
        this.health = unit.stats.health * count;
        this.shealds = unit.stats.shealds * count;
        this.unit_type = unit.stats.type;
        this.attack = unit.stats.attack;
        this.hit_change = unit.stats.hitChange;

        break;
      }
      default:
        break;
    }
    this._currentHealth = this.health;
  }

  /**
   * @public
   * @param {Attackable} attacker
   * @memberof Attackable
   * @returns {void}
   */
  battle(attacker) {
    const shealdDamage = this.shealds > 0 && attacker.damage_type === "plasma";

    this.shealds -= attacker.attack / (shealdDamage ? 0.01 : 1);

    if (this.shealds <= 0) {
      this._currentHealth +=
        this.shealds /
        (attacker.damage_type === "hardlight" ||
        attacker.damage_type === "kinetic"
          ? 0.01
          : 1);
      this.shealds = 0;
    }

    if (this.heal <= 0) {
      this.dead = true;
    }

    for (const applyEffect of attacker.events.onHit) {
      const isActive =
        this.effects.findIndex((value) => value.id === applyEffect.id) === -1;
      if (isActive !== -1) continue;
      this.effects.push(applyEffect);
    }
  }
  heal(value) {}
  applyEffects() {
    for (const effect of this.effects) {
      switch (effect.type) {
        default:
          break;
      }

      effect.exp -= 1;
    }
    remove(this.effects, (value) => value.exp <= 0);
  }
}

const attackers = input.transfer.units.map(
  (value) => new Attackable(value.id, value.count, "unit")
);

const defenders = [
  ...Object.values(
    groupBy(
      [
        ...input.node.units.left,
        ...input.node.units.center,
        ...input.node.units.right,
      ],
      "id"
    )
  )
    .map((value) =>
      value.reduce((pre, curr) => {
        pre.count += curr.count;
        return pre;
      })
    )
    .map((value) => new Attackable(value.id, value.count, "unit")),
  ...input.node.buildings.map(
    (value) => new Attackable(value.id, 1, "building", value.level)
  ),
];

console.log("attackers", attackers);
console.log("defenders", defenders);

let i = 0;
/** @type {"attacker" | "defender"} */
let turn = "attacker";

while (i < 2000) {
  const attackingUnits = turn === "attacker" ? attackers : defenders;
  const defendingUnits = turn === "attacker" ? defenders : attackers;

  // battle
  for (const unit of attackingUnits) {
    const defenderIdx = Math.floor(Math.random() * defendingUnits.length);

    const didHit = Math.random() * (unit.hit_change / 100);
    if (!didHit) continue;

    defendingUnits[defenderIdx].battle(unit);
  }

  // effects
  for (const unit of defendingUnits) unit.applyEffects();

  // cleanup

  const deadUnits = remove(defendingUnits, (unit) => unit.dead);

  for (const unit of deadUnits) {
    // run actions on death

    for (const event of unit.events.onDeath) {
    }
  }

  if (defendingUnits.length === 0 || attackingUnits.length === 0) break;

  turn = turn === "attacker" ? "defender" : "attacker";

  i++;
}

parentPort?.postMessage({ results: {} });
