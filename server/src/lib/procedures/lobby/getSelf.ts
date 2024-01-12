import { procedure } from "#lib/context.js";
import { TRPCError } from "@trpc/server";

const getSelf = procedure.query(({ ctx }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" })
    return ctx.user;
});

export default getSelf;