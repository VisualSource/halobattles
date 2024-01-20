import { LaneType, UnitStackState, Team } from 'halobattles-shared';
import { type UUID, randomUUID } from "node:crypto";
import { EventEmitter } from 'node:events';
import Piscina from "piscina";

import Planet, { type IndexRange, type StackState, type UnitSlot } from './Planet.js';
import { getFilePathURL, merge } from '#lib/utils.js';
import type { EventName, Events } from './types.js';
import type { User } from '../context.js';
import Player from "./Player.js";

export type Transfer = {
    id: UUID;
    owner: string;
    origin: {
        id: UUID,
        group: IndexRange;
    }
    destination: {
        id: UUID,
        group: IndexRange;
    }
    units: UnitSlot[]
}
export type MapData = {
    nodes: Map<string, Planet>,
    linkes: {
        uuid: string;
        nodes: [string, string],
        type: LaneType
    }[]
}

const TEN_MINUES_IN_MS = 600_000;

export default class Core extends EventEmitter {
    private piscina: Piscina;
    public transfers: Map<UUID, Transfer> = new Map();
    public players: Map<string, Player> = new Map();
    public inPlay: boolean = false;
    public mapData: MapData = {
        "nodes": new Map(),
        "linkes": []
    }
    constructor() {
        super({ captureRejections: true });
        this.piscina = new Piscina({
            filename: getFilePathURL("../worker/battle_worker.js", import.meta.url),
            maxQueue: "auto"
        });
    }


    public setMap(file: string) {
        // read map and parse map file.

        // populate mapdata var
        const nodes = [
            {
                "uuid": "28c409a2-4a3a-4e24-8dd7-9275dc668e33",
                "position": {
                    "x": 0,
                    "y": 0,
                    "z": 0
                },
                "color": "#0033ff",
                "label": "Name",
                ownerId: "76561198185501646",
                icon: "https://avatars.steamstatic.com/a521352ec938d97a89f4b9655f75924d3cea6344_medium.jpg",
                "units": {
                    0: [{ icon: "https://halo.wiki.gallery/images/0/0a/HW2_Banished_Locust.png", id: "locust_banished_00", count: 3 }],
                    1: [],
                    2: []
                }
            },
            {
                "uuid": "bc8b6b77-908b-4f30-b477-f17bbeceba83",
                "position": {
                    "x": -131.872,
                    "y": 35.397,
                    "z": 0
                },
                "color": "#00ffed",
                "label": "New World"
            },
            {
                "uuid": "2e27644b-7277-4679-9245-c5c74378dd10",
                "position": {
                    "x": -43.032,
                    "y": 153.388,
                    "z": 0
                },
                "color": "#99c936",
                "label": "Haverst"
            },
            {
                "uuid": "5c1537ae-9c6c-4240-b515-6be7988f967d",
                "position": {
                    "x": 109.66223132182344,
                    "y": 180.6881540537398,
                    "z": 0
                },
                ownerId: "BOT__0001",
                icon: "https://api.dicebear.com/7.x/identicon/svg?size=64&seed=BOT__0001",
                "color": "#b74867",
                "label": "Rather",
                "units": {
                    0: [{ icon: "https://halo.wiki.gallery/images/0/0a/HW2_Banished_Locust.png", id: "locust_banished_00", count: 3 }],
                    1: [],
                    2: []
                }
            }
        ];

        const links = [
            {
                "uuid": "da1b775f-3f4f-4fa8-9995-e03804563570",
                "nodes": [
                    "bc8b6b77-908b-4f30-b477-f17bbeceba83",
                    "28c409a2-4a3a-4e24-8dd7-9275dc668e33"
                ],
                "type": "Slow"
            },
            {
                "uuid": "c4664fd0-2fb9-4769-b167-06f66f58db25",
                "nodes": [
                    "2e27644b-7277-4679-9245-c5c74378dd10",
                    "bc8b6b77-908b-4f30-b477-f17bbeceba83"
                ],
                "type": "Fast"
            },
            {
                "uuid": "4f449e91-faf5-43a8-81c2-5fbd50db4f19",
                "nodes": [
                    "2e27644b-7277-4679-9245-c5c74378dd10",
                    "28c409a2-4a3a-4e24-8dd7-9275dc668e33"
                ],
                "type": "Fast"
            },
            {
                "uuid": "2fea5f78-44eb-498b-9fe1-1e0a675410e2",
                "nodes": [
                    "2e27644b-7277-4679-9245-c5c74378dd10",
                    "5c1537ae-9c6c-4240-b515-6be7988f967d"
                ],
                "type": "Slow"
            }
        ];

        for (const node of nodes) {
            this.mapData.nodes.set(node.uuid, new Planet(node));
        }

        this.mapData.linkes = links as MapData["linkes"];

        for (const link of this.mapData.linkes) {
            const [a, b] = link.nodes;
            if (!a || !b) throw new Error(`Link ${link.uuid} does not have node references!`);

            this.getPlanet(a)?.neighbors.add(b);
            this.getPlanet(b)?.neighbors.add(a);
        }

        console.info("Map with name %s has been loaded", file);
    }

    /** 
     * Lobby Functions 
    */

    public addPlayer(user: User, team: Team, color: string) {
        this.players.set(user.steamid, new Player(user, team, color))
    }

    public removePlayer(steamId: string) {
        this.players.delete(steamId);
    }

    public createTransfer(origin: { id: UUID; group: IndexRange }, destination: { id: UUID; group: IndexRange }, owner: string): UUID {
        const id = randomUUID();

        const planet = this.getPlanet(origin.id);
        if (!planet) throw new Error("Failed to find planet");
        if (planet.owner !== owner) throw new Error("Owner does not control origin planet.");

        const units = planet.take(origin.group);

        const transfer: Transfer = {
            id,
            owner,
            origin,
            destination,
            units
        };

        this.transfers.set(id, transfer);

        return id;
    }

    /** 
     * Game Functions
    */

    public getPlanet(nodeId: string) {
        return this.mapData.nodes.get(nodeId);
    }

    public ownsNeighbor(nodeId: string, owner: string) {
        const node = this.mapData.nodes.get(nodeId);
        if (!node) throw new Error("Not Found");

        let hasView = false;
        for (const n of node.neighbors) {
            const nighbor = this.mapData.nodes.get(n);
            if (!nighbor) continue;

            if (nighbor.owner === owner) {
                hasView = true;
                break;
            }
        }

        return hasView;
    }

    public getNeighbors(nodeId: string) {
        const node = this.mapData.nodes.get(nodeId);
        if (!node) throw new Error(`Not Found: Node(${nodeId})`);

        const output = [];
        for (const id of node.neighbors.values()) {
            const item = this.mapData.nodes.get(id);
            if (!item || item.owner === node.owner) continue;
            const data: { spies: string[], id: string; ownerId: string | null; } & Partial<Record<`stack_${0 | 1 | 2}`, NonNullable<StackState>>> = {
                id: item.uuid,
                spies: item.spies,
                ownerId: item.owner,
            };

            for (let i = 0; i < 3; i++) {
                const a = item.getStackState(i);
                if (a.state !== UnitStackState.Empty) {
                    data[`stack_${i as IndexRange}`] = a;
                }
            }

            if ("stack_0" in data || "stack_1" in data || "stack_2" in data) {
                output.push(data);
            }
        }

        return output;
    }

    private handleBattleError = (error: unknown) => {
        console.error("Battle Error", error);
    }
    private handleBattleResult = ({ transferId }: { transferId: UUID; }) => {
        try {
            const transfer = this.transfers.get(transferId);
            if (!transfer) throw new Error("Missing transfer");

            // TODO: update with proper code to handle battle result.
            const planet = this.getPlanet(transfer.destination.id);
            if (!planet) throw new Error("Missing planet");

            planet.reset();
            planet.units[transfer.destination.group] = transfer.units;
            planet.owner = transfer.owner;
            planet.icon = this.players.get(transfer.owner)?.user.avatar_medium ?? null;

            this.transfers.delete(transferId);

            this.send("updatePlanet",
                {
                    id: planet.uuid,
                    spies: planet.spies,
                    stack_0: planet.getStackState(0),
                    stack_1: planet.getStackState(1),
                    stack_2: planet.getStackState(2),
                    ownerId: planet.owner,
                    icon: planet.icon
                },
            );

            const neighbors = this.getNeighbors(planet.uuid);
            if (neighbors.length) this.send("updatePlanets", neighbors, [planet.owner]);

        } catch (error) {
            this.handleBattleError(error);
        }
    }

    public startTransfer({ time, toGroup, to, transferId }: { transferId: UUID, time: number; to: string; toGroup: number }) {
        let ms = time * 1000 + 1000;
        if (ms >= TEN_MINUES_IN_MS) {
            ms = TEN_MINUES_IN_MS;
        }

        setTimeout(() => {
            const planet = this.getPlanet(to);
            if (!planet) throw new Error("Failed to get planet");

            const transfer = this.transfers.get(transferId);
            if (!transfer) throw new Error("Missing transfer");

            if (planet.owner !== transfer.owner) {
                this.piscina.run({ transfer })
                    .then(this.handleBattleResult)
                    .catch(this.handleBattleError);
                return;
            }

            planet.units[transfer.destination.group] = merge(planet.units[transfer.destination.group], transfer.units);
            this.transfers.delete(transferId);

            this.send("updatePlanet", {
                id: planet.uuid,
                spies: planet.spies,
                [`stack_${toGroup}`]: planet.getStackState(toGroup)
            });
        }, ms);
    }

    public getWeight = (user: string, node: string, laneType: string): number => {
        return laneType === LaneType.Fast ? 2 : 4;
    }

    /** 
     * Internal Functions
    */

    public send<T extends EventName>(event: T, data: Events[T], targets: string[] | null = null) {
        console.info("Event: %s", event, data);
        this.emit(event, data, targets);
    }
}