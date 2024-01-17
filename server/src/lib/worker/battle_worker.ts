import type { Transfer } from "#lib/game/Core.js";

export default function main({ transfer }: { transfer: Transfer }) {



    return {
        winner: "attacker",
        transferId: transfer.id
    };
}


