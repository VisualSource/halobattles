import { describe, it } from "mocha";
import assert from 'node:assert';
import main from "#game/battle/battle_worker.js";

describe("Battle Worker", () => {
    it("Get Result from battle", async function () {
        this.timeout(8000);

        const result = await main({
            transfer: {
                expies: new Date(),
                destination: { group: 0, id: "0-0-0-0-0" },
                id: "0-0-0-0-0",
                origin: {
                    group: 0,
                    id: "0-0-0-0-0"
                },
                owner: "",
                units: [{ icon: "", id: "locust_covenant_00", count: 4 }]
            },
            defender: {
                buildings: [],
                owner: "",
                units: {
                    0: [{ icon: "", id: "locust_banished_00", count: 3 }],
                    1: [{ icon: "", id: "locust_banished_01", count: 1 }],
                    2: []
                }
            }
        });

        assert(result.transfer === "0-0-0-0-0", "Transfer id does not match");
        assert(result.attacker.dead.units[0]?.length === 1);
        assert(result.defender.alive.units[0]?.length === 1);
        assert(result.defender.alive.units[1]?.length === 1);
        assert(result.winner === "defender");
        console.log(JSON.stringify(result, undefined, 2));
    });
})