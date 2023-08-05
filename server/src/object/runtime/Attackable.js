import { buildOptions } from "../../map/upgradeList.js";
import units from "../../map/units.js";
import remove from "lodash.remove";

class Action {
  constructor(type,params)
}
class Effect {
  /**
   * @type {string}
   * @public
   * @memberof Effect
   */
  id;
  /**
   * @type {number}
   * @private
   * @memberof Effect
   */
  exp;
  /**
   *
   * @public
   * @type {number}
   * @memberof Effect
   */
  damage;
  /**
   * Creates an instance of Effect.
   * @param {number} exp
   * @param {number} damage
   * @param {string} id
   * @memberof Effect
   */
  constructor(exp, damage, id) {
    this.exp = exp;
    this.damage = damage;
    this.id = id;
  }
  dec() {
    this.exp--;
  }
  get isDone() {
    return this.exp <= 0;
  }
}

export default class Attackable {
  /**
   * in results this unit will live or not.
   * @private
   * @memberof Attackable
   */
  _survive = false;

  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  id;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _original_count;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  count;
  /**
   * @private
   * @type {"unit"|"building"}
   * @memberof Attackable
   */
  type;

  // START INTERNAL STATS
  /**
   * @private
   * @type {boolean}
   * @memberof Attackable
   */
  _dead = false;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _max_health = 100;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _current_health = 100;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _max_shealds = 0;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _current_shealds = 0;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _max_hit_chance = 0;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _current_hit_chance = 0;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _max_attack = 0;
  /**
   * @private
   * @type {number}
   * @memberof Attackable
   */
  _current_attack = 0;
  /**
   * @private
   * @type {import("../../map/units.js").AttackType}
   * @memberof Attackable
   */
  _damage_type = "kinetic";
  /**
   * @private
   * @type {import("../../map/units.js").UnitType}
   * @memberof Attackable
   */
  _unit_type = "building";
  /**
   *
   * @type {Effect[]}
   * @memberof Attackable
   */
  effects = [];
  /**
   *
   * @type {import("../../map/units.js").BattleEvents}
   * @memberof Attackable
   */
  events = {};
  /**
   * Creates an instance of Attackable.
   * @param {number} id
   * @param {number} count
   * @param {"unit"|"building"} type
   * @memberof Attackable
   */
  constructor(id, count, type) {
    this.id = id;
    this.count = count;
    this._original_count = count;
    this.type = type;

    switch (type) {
      case "unit": {
        const unit = units.get(this.id);
        if (!unit) throw new Error("Failed to load unit data");

        this._max_health = unit.stats.health * this.count;
        this._current_health = unit.stats.health * this.count;
        this._max_attack = unit.stats.attack * this.count;
        this._current_attack = unit.stats.attack * this.count;
        this._max_shealds = unit.stats.shealds * this.count;
        this._current_shealds = unit.stats.shealds * this.count;
        this._max_hit_chance = unit.stats.hitChange;
        this._current_hit_chance = unit.stats.hitChange;
        this._damage_type = unit.stats.damageType;
        this._unit_type = unit.stats.type;
        this.events = unit.stats.events;

        break;
      }
      case "building": {
        const building = buildOptions.get(this.id);
        if (!building) throw new Error("Failed to load building/tech data.");

        if (building.type === "building" && building.battle) {
          this._max_attack = building.battle.attack;
          this._current_attack = building.battle.attack;
          this._max_health = building.battle.health;
          this._current_health = building.battle.health;
          this._max_shealds = building.battle.shealds;
          this._current_shealds = building.battle.shealds;
          this._max_hit_chance = building.battle.hitChange;
          this._current_hit_chance = building.battle.hitChange;
          this._unit_type = building.battle.type;
          this._damage_type = building.battle.damageType;
        }

        break;
      }
      default:
        throw new Error("Unable to process given type.");
    }
  }
  get doesNonShealdedDamage() {
    return this._damage_type === "hardlight" || this._damage_type === "kinetic";
  }
  get doesShealdDamage() {
    return this._damage_type === "plasma";
  }
  get attack() {
    return this._current_attack;
  }
  get hitChance() {
    return this._current_hit_chance;
  }
  get isDead() {
    return this._dead;
  }
  /**
   *
   * @public
   * @param {import("../../map/units.js").UnitType} value
   * @memberof Attackable
   * @returns {boolean}
   */
  isEffectiveAgainst(value) {
    switch (value) {
      case "scout":
        return ["anti-vehicle"].includes(this._unit_type);
      case "light-infantry":
      case "infantry":
      case "heavy-infantry":
        return ["anti-infantry"].includes(this._unit_type);
      case "super-heavy":
        return ["anti-vehicle", "hevey-armor", "heavy-air"].includes(
          this._unit_type
        );
      case "apc":
      case "light-armor":
      case "medium-armor":
      case "hevey-armor":
        return ["anti-vehicle"].includes(this._unit_type);
      case "anti-building":
        return [].includes(this._unit_type);
      case "anti-vehicle":
        return [].includes(this._unit_type);
      case "light-air":
      case "medium-air":
      case "heavy-air":
        return ["anti-air"].includes(this._unit_type);
      case "anti-air":
        return [].includes(this._unit_type);
      case "artillery":
        return ["anti-vehicle"].includes(this._unit_type);
      case "anti-infantry":
        return [].includes(this._unit_type);
      case "building":
      case "enplacement":
      case "bunker":
        return ["anti-building"].includes(this._unit_type);
    }
  }
  /**
   * @public
   * @param {Attackable} attacker
   * @memberof Attackable
   */
  battle(attacker) {
    const shealdDamage = this._current_shealds > 0 && attacker.doesShealdDamage;

    const isEffective = attacker.isEffectiveAgainst(this._unit_type);

    this._current_shealds -=
      attacker.attack +
      attacker.attack * (shealdDamage ? 0.2 : 0) +
      attacker.attack * (isEffective ? 0.9 : 0);

    //console.log("Shealds", this._current_shealds);

    if (this._current_shealds <= 0) {
      this._current_health +=
        this._current_shealds +
        -(attacker.attack * (attacker.doesNonShealdedDamage ? 0.2 : 0));
      //console.log("Health", this._current_health);
      this._current_shealds = 0;
      // modify damage to reflect remaing units.
      this.modifyStats();
    }

    if (this._current_health <= 0) {
      this._dead = true;
    }

    const eventResults = attacker.runEvent("onHit");

    for (const event of eventResults) {
      if (this.effects.some((value) => value.id === event.id)) continue;
      this.effects.push(event);
    }
  }
  /**
   * @private
   * @return {*}
   * @memberof Attackable
   */
  modifyStats() {
    if (this.count === 0) return;

    this.count = Math.ceil(
      this._current_health / (this._max_health / this._original_count)
    );

    if (this.count === 0) {
      this._current_attack = 0;
      return;
    }

    if (this._current_attack > 0)
      this._current_attack -= this._max_attack / this._original_count;
  }
  /**
   *
   * @public
   * @param {"onDeath"|"onHit"} event
   * @memberof Attackable
   */
  runEvent(event) {
    switch (event) {
      case "onDeath": {
        const event = this.events.onDeath;
        if (!event) return [];

        switch (event.type) {
          case "spawn": {
            return [new Action("spawn", { unit: event.unit })];
          }
          case "exploded": {
            return [
              new Action("damage", {
                damage: event.damage,
                range: event.range,
              }),
            ];
          }
          case "servive": {
            const servived = Math.random() < event.chance / 100;
            this._survive = servived;
            return [];
          }
          default:
            return [];
        }
      }
      case "onHit": {
        const event = this.events.onHit;
        if (!event) return [];

        switch (event.type) {
          case "burn":
          case "freeze":
            return [new Effect(event.exp, event.damage, event.type)];
          case "siphon":
            const health = this._current_health + 10;
            if (health <= this._max_health) {
              this._current_health = health;
            }
          default:
            return [];
        }
      }
      default:
        return [];
    }
  }
  /**
   *
   * @public
   * @memberof Attackable
   */
  runEffects() {
    if (this._dead) return;

    for (const effect of this.effects) {
      this._current_health -= effect.damage;
      effect.dec();
    }
    remove(this.effects, (effect) => effect.isDone);
  }
}
