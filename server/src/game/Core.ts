import { LaneType, UnitStackState, Team } from 'halobattles-shared';
import { type UUID, randomUUID } from "node:crypto";
import { EventEmitter } from 'node:events';
import Piscina from "piscina";
import { compareAsc } from 'date-fns/compareAsc';
import { addMinutes } from "date-fns/addMinutes";

import Planet, { type IndexRange, type StackState, type UnitSlot } from './Planet.js';
import type { EventName, Events } from './types.js';
import { getFilePathURL } from '#lib/utils.js';
import merge from '#lib/merge.js';
import Player from "./Player.js";
import { content, type User } from './content.js';
import { BattleResult } from './battle/battle_worker.js';
import Dijkstra, { DijkstraClosestNode } from '#lib/dijkstra.js';

export type Transfer = {
    id: UUID;
    expies: Date,
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
const TWO_MINUES_IN_MS = 120_000;

export default class Core extends EventEmitter {
    private interval: NodeJS.Timeout;
    private spies: { expire: Date, node: string; user: string; }[] = [];
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
            filename: getFilePathURL("./battle/battle_worker.js", import.meta.url),
            maxQueue: "auto"
        });
    }

    public startGame() {
        this.interval = setInterval(() => {
            this.players.forEach((player) => {
                player.credits += player.income_credits;
                player.energy += player.income_energy;
            });
            this.send("updateResouces", undefined);

            const time = new Date();

            for (const item of this.spies) {
                if (compareAsc(time, item.expire) === 1) {
                    const idx = this.spies.indexOf(item);
                    this.spies.splice(idx, 1);

                    const planet = this.getPlanet(item.node);
                    planet?.spies.delete(item.user);

                    if (planet) this.send("updatePlanet", {
                        id: planet.uuid,
                        spies: Array.from(planet.spies.values()),
                    })
                }
            }

        }, TWO_MINUES_IN_MS);
    }

    public endGame() {
        clearInterval(this.interval);
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
                buildings: [],
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

    public addPlayer({ team = Team.UNSC, color = "#ffffff", user, tech = [] }: { tech?: string[], team?: Team, color?: string, user: User }) {
        const player = new Player(user, team, color);

        if (tech.length) {
            player.tech = new Set(tech);
        }

        this.players.set(user.steamid, player);
    }

    public removePlayer(steamId: string) {
        this.players.delete(steamId);
    }

    private createTransferFromUnits(origin: { id: UUID; group: IndexRange }, destination: { id: UUID; group: IndexRange }, owner: string, units: UnitSlot[]) {
        const id = randomUUID();

        const transfer: Transfer = {
            id,
            owner,
            origin,
            destination,
            units,
            expies: addMinutes(new Date(), 10)
        };

        this.transfers.set(id, transfer);

        return id;
    }

    public createTransfer(origin: { id: UUID; group: IndexRange }, destination: { id: UUID; group: IndexRange }, owner: string): UUID {
        const planet = this.getPlanet(origin.id);
        if (!planet) throw new Error("Failed to find planet");
        if (planet.owner !== owner) throw new Error("Owner does not control origin planet.");

        const units = planet.take(origin.group);

        return this.createTransferFromUnits(origin, destination, owner, units);
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
                spies: Array.from(item.spies),
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
    private handleBattleResult = async ({ winner, transfer, attacker, defender }: BattleResult) => {
        try {
            const transferData = this.transfers.get(transfer);
            if (!transferData) throw new Error("Missing transfer");

            const planet = this.getPlanet(transferData.destination.id);
            if (!planet) throw new Error("Failed to find planet");

            // dealloc units
            for (const [_, units] of Object.entries(attacker.dead.units)) {
                for (const item of units) {
                    await this.dealicateUnit(transferData.owner, item.id, item.count);
                    const idx = transferData.units.findIndex(i => i.id === item.id);
                    if (idx === -1) continue;

                    if (transferData.units[idx]?.count === item.count) {
                        transferData.units.splice(idx, 1);
                        continue;
                    }

                    const a = transferData.units[idx];
                    if (!a) continue;
                    a.count -= item.count;
                }
            }
            for (const [group, units] of Object.entries(defender.dead.units)) {
                for (const item of units) {
                    if (planet.owner) await this.dealicateUnit(planet.owner, item.id, item.count);

                    const idx = planet.units[group as never as IndexRange].findIndex(i => i.id === item.id);
                    if (idx === -1) continue;

                    const i = planet.units[group as never as IndexRange][idx];
                    if (!i) continue;

                    if (i.count === item.count) {
                        planet.units[group as never as IndexRange].splice(idx, 1);
                        continue;
                    }

                    i.count -= item.count;
                }
            }

            const player = this.players.get(planet.owner ?? "");

            for (const building of defender.dead.buildings) {
                const idx = planet.buildings.findIndex(e => e.id === building.id && e.instance === building.instance);

                if (idx === -1) continue;

                planet.buildings.splice(idx, 1);

                if (player) {
                    const data = await content.getBuilding(building.id, ["upkeep_supplies", "upkeep_energy", "max_global_instances", "attributes"]);

                    player.income_credits += data.upkeep_supplies;
                    player.income_energy += data.upkeep_energy;

                    if (data.max_global_instances > 0) {
                        player.removeUnique(building.id);
                    }
                }
            }

            // update planet with alive units and buildings
            const oldA = planet.units[0]

            if (defender.alive.units[0]) {
                planet.units[0] = defender.alive.units[0].map(e => {
                    const old = oldA.find(i => i.id === e.id)
                    return { id: e.id, count: e.count, icon: old?.icon ?? "" }
                })
            } else {
                planet.units[0] = [];
            }
            if (defender.alive.units[1]) {
                planet.units[0] = defender.alive.units[1].map(e => {
                    const old = oldA.find(i => i.id === e.id)
                    return { id: e.id, count: e.count, icon: old?.icon ?? "" }
                })
            } else {
                planet.units[1] = [];
            }
            if (defender.alive.units[2]) {
                planet.units[2] = defender.alive.units[2].map(e => {
                    const old = oldA.find(i => i.id === e.id)
                    return { id: e.id, count: e.count, icon: old?.icon ?? "" }
                })
            } else {
                planet.units[2] = [];
            }

            const oldB = transferData.units;
            if (attacker.alive.units[0]?.length) {
                transferData.units = attacker.alive.units[0].map(e => {
                    const old = oldB.find(i => i.id === e.id);
                    return { id: e.id, count: e.count, icon: old?.icon ?? "" };
                });
            }

            if (winner === "defender") {
                // swap origin and destination
                const temp = transferData.origin;

                transferData.origin = transferData.destination;
                transferData.destination = temp;

                planet.contested = false;
                this.send("updatePlanet",
                    {
                        id: planet.uuid,
                        spies: Array.from(planet.spies),
                        stack_0: planet.getStackState(0),
                        stack_1: planet.getStackState(1),
                        stack_2: planet.getStackState(2),
                    },
                );

                if (transferData.units.length === 0) {
                    this.transfers.delete(transferData.id);
                    return;
                }

                try {
                    const { path, exec_time } = Dijkstra(this.mapData, { start: transferData.origin.id, end: transferData.destination.id, user: transferData.owner, }, this.getWeight);
                    this.startTransfer({ time: exec_time, to: transferData.destination.id, toGroup: transferData.destination.group, transferId: transfer });
                    this.send("transfer", { path, node: transferData.origin.id, group: transferData.origin.group });
                } catch (error) {
                    console.error(error);
                }

                return;
            }

            const items = [...planet.take(0), ...planet.take(1), ...planet.take(2)];
            const oldOwner = planet.owner;

            planet.reset();
            planet.contested = false;
            planet.units[transferData.destination.group] = transferData.units;
            planet.owner = transferData.owner;
            planet.icon = this.players.get(transferData.owner)?.user.avatar_medium ?? null;
            this.transfers.delete(transfer);

            this.send("updatePlanet",
                {
                    id: planet.uuid,
                    spies: Array.from(planet.spies),
                    stack_0: planet.getStackState(0),
                    stack_1: planet.getStackState(1),
                    stack_2: planet.getStackState(2),
                    ownerId: planet.owner,
                    icon: planet.icon
                },
            );

            const neighbors = this.getNeighbors(planet.uuid);
            if (neighbors.length) this.send("updatePlanets", neighbors, [planet.owner]);


            if (items.length && oldOwner) {
                try {
                    const result = DijkstraClosestNode(this.mapData, { start: planet.uuid, owner: oldOwner }, this.getWeight);

                    const dest = result.path[result.path.length - 1];
                    if (!dest) throw new Error("Failed to get last id");

                    const transferId = this.createTransferFromUnits({ id: planet.uuid as UUID, group: 0 }, { id: dest.uuid as UUID, group: 0 }, oldOwner, items);

                    this.startTransfer({ time: result.exec_time, to: dest.uuid, toGroup: 0, transferId });

                    this.send("transfer", { path: result.path, node: planet.uuid, group: 0 });
                } catch (error) {
                    console.error(error);
                }
            }
        } catch (error) {
            this.handleBattleError(error);
        }
    }

    public startTransfer({ time, toGroup, to, transferId }: { transferId: UUID, time: number; to: string; toGroup: number }) {
        let ms = time * 1000 + 1000;
        if (ms >= TEN_MINUES_IN_MS) {
            ms = TEN_MINUES_IN_MS;
        }

        setTimeout(async () => {
            const planet = this.getPlanet(to);
            if (!planet) throw new Error("Failed to get planet");

            const transfer = this.transfers.get(transferId);
            if (!transfer) throw new Error("Missing transfer");

            let state: "transfer_only" | "battle" | "spy" = "transfer_only";

            if (planet.owner !== transfer.owner) {
                if (transfer.units.length === 1 && transfer.units.at(0)?.count === 1) {
                    const user = this.players.get(transfer.owner);
                    if (!user) throw new Error("Failed to check user");
                    const isSpy = await content.getIsSpy(user.team, transfer.units.at(0)!.id);
                    state = isSpy ? "spy" : "battle";
                } else {
                    state = "battle"
                }
            }

            switch (state) {
                case "transfer_only": {
                    planet.units[transfer.destination.group] = merge(planet.units[transfer.destination.group], transfer.units);
                    this.transfers.delete(transferId);
                    this.send("updatePlanet", {
                        id: planet.uuid,
                        spies: Array.from(planet.spies),
                        [`stack_${toGroup}`]: planet.getStackState(toGroup)
                    });
                    break;
                }
                case "battle": {
                    planet.contested = true;
                    planet.unit_queue.puase();
                    planet.building_queue.puase();

                    this.piscina.run({
                        transfer,
                        defender: {
                            owner: planet.owner,
                            units: planet.units,
                            buildings: planet.buildings
                        }
                    })
                        .then(this.handleBattleResult)
                        .catch(this.handleBattleError);
                    break;
                }
                case "spy": {
                    this.addSpy(planet.uuid, transfer.owner);

                    await this.dealicateUnit(transfer.owner, transfer.units.at(0)!.id);

                    this.transfers.delete(transferId);

                    this.send("updatePlanet", {
                        id: planet.uuid,
                        spies: Array.from(planet.spies),
                    });
                    break;
                }
                default:
                    break;
            }
        }, ms);
    }

    public getWeight = (user: string, node: string, laneType: string): number => {
        return laneType === LaneType.Fast ? 2 : 4;
    }

    private addSpy(node: string, user: string) {
        const planet = this.getPlanet(node);
        if (!planet) throw new Error("Failed to find planet");
        planet.spies.add(user);
        this.spies.push({ expire: addMinutes(new Date(), 6), node, user });
    }

    private async dealicateUnit(user: string, id: string, ammount: number = 1) {
        const unit = await content.getUnit(id, ["unit_cap", "leader_cap", "max_unique", "attributes"]);

        const player = this.players.get(user);
        if (!player) throw new Error("Failed to find user");

        if (unit.unit_cap > 0) {
            player.units -= unit.unit_cap * ammount;
        }

        if (unit.leader_cap > 0) {
            player.leaders -= unit.leader_cap * ammount;
        }

        if (unit.max_unique > 0) {
            player.removeUnique(id, ammount);
        }

        // handle attributes
    }

    /** 
     * Internal Functions
    */

    public send<T extends EventName>(event: T, data: Events[T], targets: string[] | null = null) {
        console.info("Event: %s", event, data);
        this.emit(event, data, targets);
    }
}