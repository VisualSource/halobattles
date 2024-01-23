import { TRPCError } from "@trpc/server";
import { procedure } from "#trpc/context.js";

const getSelf = procedure.query(({ ctx }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" })
    return ctx.user;
});

export default getSelf;