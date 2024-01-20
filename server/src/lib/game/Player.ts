import { Team } from 'halobattles-shared';
import type { User } from '../context.js';
import type { Json } from './types.js';

export type PlayerJson = {
    team: Team;
    color: string;
    profile: User;
}

export default class Player implements Json<PlayerJson> {
    constructor(public user: User, public team: Team, public color: string) { }
    public income_credits: number = 50;
    public income_energy: number = 5;
    public credits: number = 500;
    public energy: number = 50;
    public units: number = 0;
    public unit_cap: number = 10;
    public leaders: number = 0;
    public leader_cap: number = 1;
    public ready = false;
    public tech: Set<string> = new Set();
    /** Map for unique units / tech */
    public unique: Map<string, number> = new Map();
    public hasTech(tech: string) {
        return this.tech.has(tech);
    }
    public reset() {
        this.credits = 500;
        this.energy = 50;
        this.units = 0;
        this.unit_cap = 10;
        this.leaders = 0;
        this.leader_cap = 1;
        this.tech = new Set();
        this.unique = new Map();
        this.income_credits = 50;
        this.income_energy = 5;
    }
    getResouces() {
        return {
            income_credits: this.income_credits,
            income_energy: this.income_energy,
            credits: this.credits,
            energy: this.energy,
            units: this.units,
            unit_cap: this.unit_cap,
            leaders: this.leaders,
            leader_cap: this.leader_cap
        }
    }
    asJson(): PlayerJson {
        return {
            profile: this.user,
            team: this.team,
            color: this.color,
        }
    }
}