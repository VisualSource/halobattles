import type { MoveGroupResponse } from '#procedure/moveGroup.js';

export interface Json<T> {
    asJson(): T
}

export type Events = {
    moveGroup: MoveGroupResponse,
    syncDone: undefined,
    updateResouces: undefined,
    moveUnit: {},
    addPlayer: {},
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