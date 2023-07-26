import { z } from 'zod';
import { t } from "../trpc";

export const uiRouter = t.router({
    getPlanetInfo: t.procedure.input(z.string()).query(({ input }) => {
        return {}
    }),
    getUnitInfo: t.procedure.input(z.string()).query(({ input }) => {
        return {}
    }),
    login: t.procedure.input(z.object({})).mutation(({ input }) => {

    })
});