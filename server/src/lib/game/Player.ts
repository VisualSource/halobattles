import { randomUUID, type UUID } from 'node:crypto';
import type { Json } from './types.js';
import { Team } from './enums.js';

type PlayerJson = {
    team: Team,
    uuid: UUID,
    color: number,
    name: string;
}


export default class Player implements Json<PlayerJson> {
    public uuid: UUID = randomUUID();
    constructor(public name: string, public team: Team, public color: number) { }

    AsJson(): PlayerJson {
        return {
            team: this.team,
            uuid: this.uuid,
            color: this.color,
            name: this.name
        }
    }
}