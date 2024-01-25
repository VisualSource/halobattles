import type { Stat, UnitType, WeaponType } from "halobattles-shared";
import type { IndexRange } from "#game/Planet.js";

type DamagableProps = {
    health: number;
    shield: number;
    armor: number;
    unit_type: UnitType,
    stat: Stat,
    weapon_type: WeaponType,
    attributes: string;
    id: string;
    count: number;
    damage: number;
}

type BattleUnitProps = {
    group: IndexRange | null;
} & DamagableProps;

type BattleBuildingProps = {
    instance: string;
} & DamagableProps;

class Damagable {
    private og_damage: number;
    private og_health: number;
    private og_armor: number;
    private og_shield: number;

    public damage: number;
    private health: number;
    private armor: number;
    private shield: number;
    public count: number;
    public id: string;
    private weapon_type: WeaponType;
    public unit_type: UnitType;
    private stat: Stat;
    private attributes: string;
    public isDead: boolean = false;
    constructor({ attributes, unit_type, stat, weapon_type, id, health, armor, shield, damage, count }: DamagableProps) {
        this.og_health = health;
        this.og_armor = armor;
        this.og_shield = shield;
        this.damage = damage * count;
        this.shield = shield * count;
        this.armor = armor * count;
        this.health = health * count;
        this.og_damage = damage;
        this.count = count;
        this.id = id;
        this.unit_type = unit_type;
        this.weapon_type = weapon_type;
        this.stat = stat;
        this.attributes = attributes;
    }
    public getDefense() {
        return this.armor + this.shield;
    }

    public getHealth() {
        return this.health / (this.og_health * this.count);
    }

    public applyDamage(value: number) {
        this.shield -= value;

        if (this.shield >= 0) return;

        this.armor -= Math.abs(this.shield);
        this.shield = 0;

        if (this.armor >= 0) return;

        this.health -= Math.abs(this.armor);
        this.armor = 0;

        if (this.health > 0) return;

        this.isDead = true;
        this.health = 0;
    }

    /* 
        How effective this unit is against this this type of unit.
        { value: 0, label: "Gray: Unit can't attack this type" },
        { value: 1, label: "Red: Below Avg. Vs." },
        { value: 2, label: "Yellow: Average vs." },
        { value: 3, label: "Green: Strong vs" },
    */
    public effectiveness(type: UnitType) {
        const key = type.charAt(0);
        const result = parseInt(this.stat.split(",").find(e => e.startsWith(key))?.charAt(2)!);

        switch (result) {
            case 1:
                //Red: Below Avg. Vs.
                return -0.40;
            case 2:
                //Yellow: Average vs.
                return 1;
            case 3:
                //Green: Strong vs
                return 0.40;
            default:
                //Gray: Unit can't attack this type
                return 0;
        }
    }

    public getAlive() {
        return Math.round(this.health / (this.og_armor / this.count));
    }
}
export class BattleUnit extends Damagable {
    public group: IndexRange | null;
    constructor(props: BattleUnitProps) {
        super(props);
        this.group = props.group;
    }

    getData() {
        return { id: this.id, count: this.count, group: this.group }
    }

}
export class BattleBuilding extends Damagable {
    private instance: string;
    constructor(props: BattleBuildingProps) {
        super(props);
        this.instance = props.instance;
    }
    getData() {
        return { id: this.id, instance: this.instance };
    }
}