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

    public async Buy({ input }: Input<{ id: number; amount: number; }>) { }
    public async Sell({ input }: Input<{ id: number; amount: number; }>) { }

    public send<T extends EventName>(event: T, data: Events[T]) {
        this.emit(event, data);
    }

}