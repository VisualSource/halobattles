import { TRPCError } from "@trpc/server";
import { procedure } from "#trpc/context.js";

const syncDone = procedure.mutation(({ ctx }) => {
    const id = ctx.user?.steamid;
    if (!id) throw new TRPCError({ message: "No user id", code: "UNAUTHORIZED" });

    const user = ctx.global.players.get(id);

    if (!user) throw new TRPCError({ message: "Not Found", code: "NOT_FOUND" });

    user.ready = true;

    const all_ready = Array.from(ctx.global.players.values()).every(e => e.ready);

    if (all_ready) {
        ctx.global.send("syncDone", undefined);
    }
});

export default syncDone;