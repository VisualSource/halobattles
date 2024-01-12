import { procedure } from "#lib/context.js";
import { z } from "zod";

const getBuildOptions = procedure.input(z.string().uuid()).query(({ ctx, input }) => {

    // fetch planet get buildings
    // get player global tech.

    // return all options that are vaild to this planet

    return [{ id: "", icon: "", }];
});

export default getBuildOptions;