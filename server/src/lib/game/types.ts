import type { UUID } from 'node:crypto';
import type { MoveGroupResponse } from '../procedures/moveGroup.js';
import type { Team } from './enums.js';

export interface Json<T> {
    AsJson(): T
}

export type Events = {
    moveGroup: MoveGroupResponse,
    moveUnit: {},
    addPlayer: { color: number; uuid: UUID, team: Team, name: string; }[],
    removePlayer: {}
    updatePlayer: {}
    startGame: {}
    endGame: {}
    transfer: {
        path: {
            position: {
                x: number;
                y: number;
            }; duration: number
        }[],
        node: string;
        group: number;
    }
}

export type EventName = keyof Events;