import { procedure } from "#lib/context.js";

const ping = procedure.query(() => {
    return "PONG";
});

export default ping;