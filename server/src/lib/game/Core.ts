import { EventEmitter } from 'node:events';
import type { UpdateGroupSchema } from '../procedures/updateGroups.js';
import type { EventName, Events } from './types.js';
import type { User } from '../context.js';
import { Team } from './enums.js';
import Player from "./Player.js";
import Planet from './Planet.js';

export default class Core extends EventEmitter {
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

    public updatePlayer(steamId: string, color: string | undefined, team: Team | undefined) {

    }

    /** 
     * Game Functions
    */

    public getPlanet(nodeId: string) {
        return this.mapData.nodes.find(value => value.uuid === nodeId);
    }
    public startTransfer({ time, toGroup, to }: { time: number; to: string; toGroup: number }) {
        const ms = time * 1000 + 2000;
        if (ms >= 2147483647) throw new Error("Max time.");

        setTimeout(() => {
            const planet = this.getPlanet(to);
            if (!planet) throw new Error("Failed to get planet");
            this.send("moveGroup", {
                group: toGroup,
                uuid: to,
                stack: planet.getStackState(toGroup)
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