import { procedure } from "#lib/context.js";

const startGame = procedure.mutation(({ ctx }) => {
    ctx.global.send("startGame", undefined);
});

export default startGame;
