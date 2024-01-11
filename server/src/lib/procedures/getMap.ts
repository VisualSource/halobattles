import { t } from '../context.js';

const getMap = t.procedure.query(({ ctx }) => {

    console.log(ctx.user);

    return {
        nodes: ctx.global.mapData.nodes.map(value => value.asJson()),
        linkes: ctx.global.mapData.linkes
    };
});

export default getMap;