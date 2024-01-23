import { procedure } from "#trpc/context.js";

const startGame = procedure.mutation(({ ctx }) => {
    ctx.global.send("startGame", undefined);
});

export default startGame;
