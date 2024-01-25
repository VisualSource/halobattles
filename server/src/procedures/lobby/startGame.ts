import { procedure } from "#trpc/context.js";

const startGame = procedure.mutation(({ ctx }) => {
    ctx.global.inPlay = true;
    ctx.global.send("startGame", undefined);


    ctx.global.startGame();

});

export default startGame;
