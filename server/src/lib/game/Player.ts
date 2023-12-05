import type { Json } from './types.js';
import { Team } from './enums.js';

type PlayerJson = {
    team: Team,
    id: string
    color: string,
    name: string;
}

export default class Player implements Json<PlayerJson> {
    constructor(public id: string, public name: string, public team: Team, public color: string) { }
    public credits: number = 0;
    public energy: number = 0;
    public units: number = 0;
    public unit_cap: number = 10;
    public leaders: number = 0;
    public leader_cap: number = 1;
    AsJson(): PlayerJson {
        return {
            team: this.team,
            id: this.id,
            color: this.color,
            name: this.name
        }
    }
}