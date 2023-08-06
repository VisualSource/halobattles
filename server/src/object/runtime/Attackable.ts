import remove from "lodash.remove";
import units, { type AttackType, type BattleEvents, type UnitType } from "../../map/units.js";
import { buildOptions } from "../../map/upgradeList.js";

class Action {
  constructor(type: string, params: object) { }
}
class Effect {
  constructor(private exp: number, public damage: number, public id: string) {
    this.exp = exp;
    this.damage = damage;
    this.id = id;
  }
  public dec() {
    this.exp--;
  }
  public get isDone() {
    return this.exp <= 0;
  }
}

export default class Attackable {
  /**
   * in results this unit will live or not.
   */
  private _survive = false;
  private _original_count: number;
  // START INTERNAL STATS
  private _dead = false;
  private _max_health = 100;
  private _current_health = 100;
  private _max_shealds = 0;
  private _current_shealds = 0;
  private _max_hit_chance = 0;
  private _current_hit_chance = 0;
  private _max_attack = 0;
  private _current_attack = 0;
  private _damage_type: AttackType = "kinetic";
  private _unit_type: UnitType = "building";
  private effects: Effect[] = [];
  private events: BattleEvents | null = null;
  /**
   * Creates an instance of Attackable.
   * @param {number} id
   * @param {number} count
   * @param {"unit"|"building"} type
   * @memberof Attackable
   */
  constructor(private id: number, private count: number, private type: "unit" | "building") {
    this._original_count = count;
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
  public isEffectiveAgainst(value: UnitType) {
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
        return false;
      case "anti-vehicle":
        return false
      case "light-air":
      case "medium-air":
      case "heavy-air":
        return ["anti-air"].includes(this._unit_type);
      case "anti-air":
        return false;
      case "artillery":
        return ["anti-vehicle"].includes(this._unit_type);
      case "anti-infantry":
        return false;
      case "building":
      case "enplacement":
      case "bunker":
        return ["anti-building"].includes(this._unit_type);
    }
  }
  public battle(attacker: Attackable) {
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
      if (event instanceof Effect && !this.effects.some((value) => value.id === event.id)) {
        this.effects.push(event);
      }
    }
  }
  private modifyStats() {
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
  public runEvent(event: "onDeath" | "onHit"): Array<Effect | Action> {
    switch (event) {
      case "onDeath": {
        const event = this.events?.onDeath;
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
        const event = this.events?.onHit;
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
  public runEffects() {
    if (this._dead) return;

    for (const effect of this.effects) {
      this._current_health -= effect.damage;
      effect.dec();
    }
    remove(this.effects, (effect) => effect.isDone);
  }
}
