import type { Transfer } from "#game/Core.js";

export default function main({ transfer }: { transfer: Transfer }) {



    return {
        winner: "attacker",
        transferId: transfer.id
    };
}


