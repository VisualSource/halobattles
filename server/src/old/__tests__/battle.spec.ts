import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { describe } from 'mocha';
import assert from 'node:assert';

import type { UnitTransfer } from "../object/GameState.js";
import Location from "../object/Location.js";
import { __dirname } from '../lib/utils.js';

const node = new Location({
    name: "Test",
    position: {
        x: 0,
        y: 0,
    },
    connectsTo: [],
    objectId: "a-a-a-a",
    owner: null,
    buildings: [/*{ icon: "", id: 1, objId: "AAA", level: 1 }*/],
    units: {
        center: [
            { icon: "", count: 100, id: 0, idx: 0 },
            { icon: "", count: 100, id: 1, idx: 0 }
            // atk 10 -> 1230
        ],
        left: [],
        right: []
    }
});

const transfer: UnitTransfer = {
    dest: {
        group: "center",
        id: "1-1-1-1"
    },
    jumps: 0,
    expectedResolveTime: new Date(),
    id: "1-1-1-1",
    origin: {
        group: "center",
        id: "11-1-1-1"
    },
    owner: "1-1-1-1",
    units: [
        // { id: 0, icon: "", count: 6, idx: 0 }, // atk 10 -> 60
        { id: 1, icon: "", count: 100, idx: 0 }, // atk 8 -> 56,
        { id: 0, icon: "", count: 100, idx: 0 }
    ]
}

describe("BattleWorker", () => {
    describe("Battle", () => {
        it("should return data from worker", async () => {
            await new Promise((ok, rej) => {

                const worker = new Worker(resolve(__dirname, "../object/BattleRuntime.js"), {
                    workerData: {
                        node,
                        transfer
                    }
                });

                worker.addListener("message", (ev) => {
                    if ("type" in ev) {
                        console.log(...ev.msg);
                        return;
                    }

                    console.log(JSON.stringify(ev, undefined, 4));


                    assert(ev.node === "a-a-a-a");
                    assert(ev.attackerTransferId === "1-1-1-1");

                    ok(null);
                });

                worker.addListener("error", (er) => {
                    console.log(er);
                    rej(er);
                })
            });
        });
    });
});






