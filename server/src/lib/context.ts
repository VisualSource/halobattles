import { type inferAsyncReturnType, initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { EventName, Events } from './game/types.js';
import Core from './game/Core.js';

const global = new Core();

export const createContext = async () => { return global; };

export type Context = inferAsyncReturnType<typeof createContext>;

export const t = initTRPC.context<Context>().create({
    isDev: true,
});

export const procedure = t.procedure;

export const subscription = <T extends EventName>(event: T) => {
    return procedure.subscription(() => observable<Events[T]>((emit) => {
        const callback = (data: Events[T]) => emit.next(data);
        global.on(event, callback);
        return () => global.off(event, callback);
    }));
}