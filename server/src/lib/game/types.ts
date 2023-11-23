import type { UUID } from 'node:crypto';
import type { Team } from './enums.js';
export type HTMLHex = `x0${number | string}${number | string}${number | string}${number | string}${number | string}${number | string}`;

export interface Json<T> {
    AsJson(): T
}

export type Events = {
    addPlayer: { color: number; uuid: UUID, team: Team, name: string; }[],
    removePlayer: {}
    updatePlayer: {}
    startGame: {}
    endGame: {}
}

export type EventName = keyof Events;