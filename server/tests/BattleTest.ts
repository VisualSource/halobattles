import { Worker } from "node:worker_threads";
import { join } from 'node:path';
import type { UnitTransfer } from "../src/object/GameState.js";
import Location from "../src/object/Location.js";

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
            { id: 0, icon: "", count: 1, idx: 0 }
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


const worker = new Worker(join(__dirname, "../src/object/BattleRuntime.js"), {
    workerData: {
        node,
        transfer
    }
});

worker.on("error", (ev) => {
    throw ev;
})
worker.on("message", (ev) => {
    console.log(ev);
});


