import { procedure } from '../context.js';

const getPlayerState = procedure.query(({ ctx }) => {
    return ctx.user;
});

export default getPlayerState;