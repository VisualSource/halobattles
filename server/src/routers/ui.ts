import { z } from 'zod';
import { t } from "../trpc.js";

export const uiRouter = t.router({
    getUnitInfo: t.procedure.input(z.string()).query(({ input }) => {
        return {}
    }),
    login: t.procedure.input(z.object({})).mutation(({ input }) => {

    })
});