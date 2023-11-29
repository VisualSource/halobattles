import { EventEmitter } from 'node:events';
import type { UUID } from 'node:crypto';
import { serialize } from "superjson";
import type { EventName, Events } from './types.js';
import { Team } from './enums.js';
import Player from "./Player.js";

type Input<T> = { input: T, ctx: unknown };

export default class Core extends EventEmitter {
    private players: Map<UUID, Player> = new Map();
    private inPlay: boolean = false;
    constructor() {
        super({ captureRejections: true });
    }

    public AddPlayer({ input: { name, team, color } }: { input: { name: string; team: Team, color: number } }): UUID {
        const player = new Player(name, team, color);
        this.players.set(player.uuid, player);

        const data = serialize(this.players);

        this.send("addPlayer", data.json as Events["addPlayer"]);

        return player.uuid;
    }
    public RemovePlayer({ input: { uuid } }: { input: { uuid: string } }): void {
        this.players.delete(uuid as UUID);
    }
    public UpdatePlayer({ input: { uuid, props } }: { input: { uuid: string, props: Partial<{ color: number, team: Team, name: string }> } }): void {
        const player = this.players.get(uuid as UUID);

        if (!player) throw new Error(`Failed to get player with uuid of "${uuid}".`);


        if (props.color) {
            player.color = props.color;
        }

        if (props.team) {
            player.team = props.team;
        }

        if (props.name) {
            player.name = props.name;
        }
    }

    public GetMap() {
        return {
            "nodes": [
                {
                    "uuid": "28c409a2-4a3a-4e24-8dd7-9275dc668e33",
                    "position": {
                        "x": 0,
                        "y": 0,
                        "z": 0
                    },
                    "color": "#0033ff",
                    "label": "Name"
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
                }
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
                }
            ]
        };
    }

    public async StartGame() {
        this.inPlay = true;
        this.send("startGame", true);
    }
    public async EndGame() {
        this.inPlay = false;
        this.send("endGame", false);
    }

    public async DropUnit() { }
    public async MoveUnit() { }
    public async DropGroup() { }
    public async MoveGroup() { }

    public async Buy({ input }: Input<{ id: number; amount: number; }>) { }
    public async Sell({ input }: Input<{ id: number; amount: number; }>) { }

    public send<T extends EventName>(event: T, data: Events[T]) {
        this.emit(event, data);
    }

}