import { describe } from 'mocha';
import assert from 'node:assert';
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
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
    buildings: [],
    units: {
        center: [
            { id: 0, icon: "", count: 2, idx: 0 }
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
    expectedResolveTime: new Date(),
    id: "1-1-1-1",
    origin: {
        group: "center",
        id: "11-1-1-1"
    },
    owner: "1-1-1-1",
    units: [
        { id: 0, icon: "", count: 2, idx: 0 }
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
                    console.log(ev);
                    ok(null);
                });

                worker.addListener("error", (er) => {
                    rej(er);
                })
            });
        });
    });
});






