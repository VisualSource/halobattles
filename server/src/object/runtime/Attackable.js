import { buildOptions } from "../../map/upgradeList.js";
import units from "../../map/units.js";

export default class Attackable {
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
  effects = [];
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
    this.type = type;

    switch (type) {
      case "unit": {
        const unit = units.get(this.id);
        if (!unit) throw new Error("Failed to load unit data");

        this._max_health = this._current_health =
          unit.stats.health * this.count;
        this._max_attack = this._current_attack =
          unit.stats.attack * this.count;
        this._max_shealds = this._current_shealds =
          unit.stats.shealds * this.count;
        this._max_hit_chance = this._current_hit_chance = unit.stats.hitChange;
        this._damage_type = unit.stats.damageType;
        this._unit_type = unit.stats.type;

        break;
      }
      case "building": {
        const building = buildOptions.get(this.id);
        if (!building) throw new Error("Failed to load building/tech data.");

        if (building.type === "building" && building.battle) {
          this._max_attack = this._current_attack = building.battle.attack;
          this._max_health = this._current_health = building.battle.health;
          this._max_shealds = this._current_shealds = building.battle.shealds;
          this._max_hit_chance = this._current_hit_chance =
            building.battle.hitChange;
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
   * @public
   * @param {Attackable} attacker
   * @memberof Attackable
   */
  battle(attacker) {
    const shealdDamage = this._current_shealds > 0 && attacker.doesShealdDamage;

    this._current_shealds -=
      attacker.attack + attacker.attack * (shealdDamage ? 0.2 : 0);

    console.log("Shealds", this._current_shealds);

    if (this._current_shealds <= 0) {
      this._current_health +=
        this._current_shealds +
        -(attacker.attack * (attacker.doesNonShealdedDamage ? 0.2 : 0));
      console.log("Health", this._current_health);
      this._current_shealds = 0;
      // modify damage to reflect remaing units.
      this.modifyHealth();
    }

    if (this._current_health <= 0) {
      this._dead = true;
    }

    const eventResults = attacker.runEvent("onHit");
    for (const event of eventResults) {
    }
  }
  modifyHealth() {
    const currentCount = Math.round(
      this._current_health / (this._max_health / this.count)
    );

    if (currentCount === 0) {
      return;
    }

    this.count = currentCount;
    this._current_attack -= this._max_attack / this.count;
  }
  /**
   *
   * @public
   * @param {string} event
   * @memberof Attackable
   */
  runEvent(event) {
    return [];
  }
  /**
   *
   * @public
   * @memberof Attackable
   */
  runEffects() {
    if (this._dead) return;
  }
}
