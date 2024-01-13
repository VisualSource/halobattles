import { UnitStackState } from 'halobattles-shared';
import type { MoveGroupResponse } from '#procedure/moveGroup.js';

export interface Json<T> {
    asJson(): T
}

type StackState = { state: UnitStackState; icon: string | null; }

export type Events = {
    moveGroup: MoveGroupResponse,
    syncDone: undefined,
    updateResouces: undefined,
    moveUnit: {},
    addPlayer: {},
    removePlayer: {}
    updatePlayer: {}
    updatePlanet: {
        id: string;
        spies: string[],

        icon?: string | null,
        ownerId?: string | null,
        color?: string;
        stack_0?: StackState;
        stack_1?: StackState;
        stack_2?: StackState;
    },
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