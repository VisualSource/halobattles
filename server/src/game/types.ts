import type { UnitStackState } from 'halobattles-shared';

export type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

export type UniqueArray<T> =
    T extends readonly [infer X, ...infer Rest]
    ? InArray<Rest, X> extends true
    ? ['Encountered value with duplicates:', X]
    : readonly [X, ...UniqueArray<Rest>]
    : T

type InArray<T, X> =
    T extends readonly [X, ...infer _Rest]
    ? true
    : T extends readonly [X]
    ? true
    : T extends readonly [infer _, ...infer Rest]
    ? InArray<Rest, X>
    : false

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
    updatePlayer: undefined,
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
    updateBuildings: string,
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
    kickPlayer: undefined,
    updateQueue: {
        node: string;
        type: "unit" | "building"
    }
    startGame: undefined
    endGame: undefined,
    notification: {
        title: string;
        text: string;
    },
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