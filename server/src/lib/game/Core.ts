import { EventEmitter } from 'node:events';
import { type UUID, randomUUID } from "node:crypto";
import type { EventName, Events } from './types.js';
import type { User } from '../context.js';
import { Team } from './enums.js';
import Player from "./Player.js";
import Planet from './Planet.js';
import { merge } from '#lib/utils.js';

type StackRange = 0 | 1 | 2;
type Transfer = {
    id: UUID;
    owner: string;
    origin: {
        id: UUID,
        group: StackRange;
    }
    destination: {
        id: UUID,
        group: StackRange;
    }
    units: { id: string; count: number; icon: string; }[]
}

export default class Core extends EventEmitter {
    public transfers: Map<UUID, Transfer> = new Map();
    public players: Map<string, Player> = new Map();
    public inPlay: boolean = false;
    public mapData = {
        "nodes": [
            new Planet({
                "uuid": "28c409a2-4a3a-4e24-8dd7-9275dc668e33",
                "position": {
                    "x": 0,
                    "y": 0,
                    "z": 0
                },
                "color": "#0033ff",
                "label": "Name",
                ownerId: "76561198185501646",
                icon: "https://avatars.steamstatic.com/a521352ec938d97a89f4b9655f75924d3cea6344_medium.jpg"
            }),
            new Planet({
                "uuid": "bc8b6b77-908b-4f30-b477-f17bbeceba83",
                "position": {
                    "x": -131.872,
                    "y": 35.397,
                    "z": 0
                },
                "color": "#00ffed",
                "label": "New World"
            }),
            new Planet({
                "uuid": "2e27644b-7277-4679-9245-c5c74378dd10",
                "position": {
                    "x": -43.032,
                    "y": 153.388,
                    "z": 0
                },
                "color": "#99c936",
                "label": "Haverst"
            }),
            new Planet({
                "uuid": "5c1537ae-9c6c-4240-b515-6be7988f967d",
                "position": {
                    "x": 109.66223132182344,
                    "y": 180.6881540537398,
                    "z": 0
                },
                "color": "#b74867",
                "label": "Rather"
            })
        ],
        "linkes": [
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
        ]
    }
    constructor() {
        super({ captureRejections: true });
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

    public createTransfer(origin: { id: UUID; group: StackRange }, destination: { id: UUID; group: StackRange }, owner: string): UUID {
        const id = randomUUID();

        const planet = this.getPlanet(origin.id);
        if (!planet) throw new Error("Failed to find planet");
        if (planet.owner !== owner) throw new Error("Owner does not control origin planet.");

        const units = planet.takeGroup(origin.group);

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
        return this.mapData.nodes.find(value => value.uuid === nodeId);
    }
    public startTransfer({ time, toGroup, to, transferId }: { transferId: UUID, time: number; to: string; toGroup: number }) {
        const ms = time * 1000 + 2000;
        if (ms >= 2147483647) throw new Error("The max duration of travel has surpassed 21_4748_3647ms");

        setTimeout(() => {
            const planet = this.getPlanet(to);
            if (!planet) throw new Error("Failed to get planet");

            const transfer = this.transfers.get(transferId);
            if (!transfer) throw new Error("Missing transfer");

            if (planet.owner !== transfer.owner) {

                console.warn("Finish implementing battles");

                planet.reset();
                planet.units[transfer.destination.group] = transfer.units;
                planet.owner = transfer.owner;
                planet.icon = this.players.get(transfer.owner)?.user.avatar_medium ?? null;

                this.transfers.delete(transferId);

                this.send("updatePlanet", {
                    id: planet.uuid,
                    spies: planet.spies,
                    stack_0: planet.getStackState(0),
                    stack_1: planet.getStackState(1),
                    stack_2: planet.getStackState(2),
                    ownerId: planet.owner,
                    icon: planet.icon
                });

                return;
            }

            planet.units[transfer.destination.group as 0 | 1 | 2] = merge(planet.units[transfer.destination.group as 0 | 1 | 2], transfer.units)
            this.transfers.delete(transferId);

            this.send("updatePlanet", {
                id: planet.uuid,
                spies: planet.spies,
                [`stack_${toGroup}`]: planet.getStackState(toGroup)
            });
        }, ms);
    }

    public getWeight = (user: string, node: string, laneType: string): number => {

        return laneType === "Fast" ? 2 : 4;
    }

    /** 
     * Internal Functions
    */

    public send<T extends EventName>(event: T, data: Events[T]) {
        console.info("Event: %s", event, data);
        this.emit(event, data);
    }
}