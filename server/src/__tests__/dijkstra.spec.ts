import { LaneType } from "halobattles-shared";
import { describe, it } from "mocha";
import assert from 'node:assert';

import Dijkstra, { DijkstraClosestNode } from "#lib/dijkstra.js";
import Planet from "#game/Planet.js";

const mapData = {
    "nodes": new Map([
        [
            "28c409a2-4a3a-4e24-8dd7-9275dc668e33",
            new Planet({
                "uuid": "28c409a2-4a3a-4e24-8dd7-9275dc668e33",
                "position": {
                    "x": 0,
                    "y": 0,
                    "z": 0
                },
                ownerId: "AAAA-AAAA-AAAA-AAAA",
                "color": "#0033ff",
                "label": "Name"
            })
        ],
        ["bc8b6b77-908b-4f30-b477-f17bbeceba83", new Planet({
            "uuid": "bc8b6b77-908b-4f30-b477-f17bbeceba83",
            "position": {
                "x": -131.872,
                "y": 35.397,
                "z": 0
            },
            "color": "#00ffed",
            "label": "New World"
        })],
        ["2e27644b-7277-4679-9245-c5c74378dd10", new Planet({
            "uuid": "2e27644b-7277-4679-9245-c5c74378dd10",
            "position": {
                "x": -43.032,
                "y": 153.388,
                "z": 0
            },
            "color": "#99c936",
            "label": "Haverst"
        })],
        ["5c1537ae-9c6c-4240-b515-6be7988f967d", new Planet({
            "uuid": "5c1537ae-9c6c-4240-b515-6be7988f967d",
            "position": {
                "x": 109.66223132182344,
                "y": 180.6881540537398,
                "z": 0
            },
            "color": "#b74867",
            "label": "Rather",
            ownerId: "BBBB-BBBB-BBBB-BBBB",
        })]
    ]),
    "linkes": [
        {
            "uuid": "da1b775f-3f4f-4fa8-9995-e03804563570",
            "nodes": [
                "bc8b6b77-908b-4f30-b477-f17bbeceba83",
                "28c409a2-4a3a-4e24-8dd7-9275dc668e33"
            ] as [string, string],
            "type": LaneType.Slow
        },
        {
            "uuid": "c4664fd0-2fb9-4769-b167-06f66f58db25",
            "nodes": [
                "2e27644b-7277-4679-9245-c5c74378dd10",
                "bc8b6b77-908b-4f30-b477-f17bbeceba83"
            ] as [string, string],
            "type": LaneType.Slow
        },
        {
            "uuid": "4f449e91-faf5-43a8-81c2-5fbd50db4f19",
            "nodes": [
                "2e27644b-7277-4679-9245-c5c74378dd10",
                "28c409a2-4a3a-4e24-8dd7-9275dc668e33"
            ] as [string, string],
            "type": LaneType.Fast
        },
        {
            "uuid": "2fea5f78-44eb-498b-9fe1-1e0a675410e2",
            "nodes": [
                "2e27644b-7277-4679-9245-c5c74378dd10",
                "5c1537ae-9c6c-4240-b515-6be7988f967d"
            ] as [string, string],
            "type": LaneType.Slow
        }
    ]
};

function getWeight(user: string, node: string, type: string): number {
    return 1;
}

describe("Dijstra", () => {

    describe("#Dijstra()", () => {
        it("test if path is correct", function () {
            const result = Dijkstra(
                mapData,
                {
                    start: "bc8b6b77-908b-4f30-b477-f17bbeceba83",
                    end: "5c1537ae-9c6c-4240-b515-6be7988f967d",
                    user: "user_uuid"
                },
                getWeight
            );

            assert(result.path.length === 3, "Path length is not 3");
            assert(result.exec_time === 2, "Result exec time is not 2");
        });
    });

    describe("#DijkstraClosestNode()", () => {
        it("Returns the closet node with give owner", function () {

            const result = DijkstraClosestNode(mapData, {
                start: "28c409a2-4a3a-4e24-8dd7-9275dc668e33" /* Start at node with name of "Name" */,
                owner: "BBBB-BBBB-BBBB-BBBB"
            }, getWeight);

            console.log(result);

            assert(true);
        });
    });

});