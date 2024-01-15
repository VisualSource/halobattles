import { t } from '../context.js';

const getMap = t.procedure.query(({ ctx }) => {
    return {
        nodes: Array.from(ctx.global.mapData.nodes.values()).map(v => v.asJson()),
        linkes: ctx.global.mapData.linkes
    };
});

export default getMap;