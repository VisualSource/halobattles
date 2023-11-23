import { type inferAsyncReturnType, initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import Core from './lib/game/Core.js';
import { EventName, Events } from './lib/game/types.js';
import { Team } from './lib/game/enums.js';


export const createContext = async () => { return {} }

export type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create({
    isDev: true,
});

const global = new Core();

const procedure = t.procedure;

const subscription = <T extends EventName>(event: T) => {
    return procedure.subscription(() => observable<Events[T]>((emit) => {
        const callback = (data: Events[T]) => emit.next(data);
        global.on(event, callback);
        return () => global.off(event, callback);
    }));
}

export const router = t.router({
    addPlayer: procedure.input(z.object({
        color: z.number(),
        name: z.string().min(1),
        team: z.nativeEnum(Team)
    })).mutation(global.AddPlayer),
    removePlayer: procedure.input(z.object({
        uuid: z.string().uuid()
    })).mutation(global.RemovePlayer),
    updatePlayer: procedure.input(z.object({
        uuid: z.string().uuid(),
        props: z.object({
            team: z.nativeEnum(Team).optional(),
            name: z.string().min(1).optional(),
            color: z.number().optional()
        })
    })).mutation(global.UpdatePlayer),
    startGame: procedure.mutation(global.StartGame),
    endGame: procedure.mutation(global.EndGame),

    getMap: procedure.query(global.GetMap),
    dropGroup: procedure.input(z.object({
        id: z.string().uuid()
    })).mutation(global.DropGroup),
    moveGroup: procedure.input(z.object({
        id: z.string().uuid(),
        to: z.string().uuid(),
        from: z.string().uuid()
    })).mutation(global.MoveGroup),
    dropUnit: procedure.mutation(global.DropUnit),
    moveUnit: procedure.mutation(global.MoveUnit),

    buy: procedure.input(z.object({
        id: z.number(),
        amount: z.number()
    })).mutation(global.Buy),
    sell: procedure.input(z.object({
        id: z.number(),
        amount: z.number()
    })).mutation(global.Sell),

    onStartGame: subscription("startGame"),
    onEndGame: subscription("endGame"),
    onAddPlayer: subscription("addPlayer"),
    onRemovePlayer: subscription("removePlayer"),
    onUpdatePlayer: subscription("updatePlayer"),
});