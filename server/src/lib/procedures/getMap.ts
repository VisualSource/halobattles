import { t } from '../context.js';

const getMap = t.procedure.query(({ ctx, input }) => {
    return ctx.mapData;
});

export default getMap;