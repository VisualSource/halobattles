import { UnitStackState } from 'halobattles-shared';

export interface Json<T> {
    asJson(): T
}

type StackState = { state: UnitStackState; icon: string | null; }

export type Events = {
    syncDone: undefined,
    updateResouces: undefined,
    moveUnit: undefined,
    addPlayer: undefined,
    removePlayer: undefined
    updatePlayer: undefined
    updatePlanets: {
        id: string;
        spies: string[],
        icon?: string | null,
        ownerId?: string | null,
        color?: string;
        stack_0?: StackState;
        stack_1?: StackState;
        stack_2?: StackState;
    }[],
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
    startGame: undefined
    endGame: undefined
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