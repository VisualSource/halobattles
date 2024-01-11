import type { Json } from './types.js';
import { Team } from './enums.js';
import type { User } from '../context.js';

export type PlayerJson = {
    team: Team;
    color: string;
    profile: User;
}

export default class Player implements Json<PlayerJson> {
    constructor(public user: User, public team: Team, public color: string) { }
    public credits: number = 0;
    public energy: number = 0;
    public units: number = 0;
    public unit_cap: number = 10;
    public leaders: number = 0;
    public leader_cap: number = 1;
    getResouces() {
        return {
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