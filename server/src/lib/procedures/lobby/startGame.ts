import { procedure } from "#lib/context.js";

const startGame = procedure.mutation(({ ctx }) => {
    ctx.global.send("startGame", {});
});

export default startGame;
