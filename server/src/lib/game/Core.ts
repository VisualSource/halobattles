import { EventEmitter } from 'node:events';
import type { UUID } from 'node:crypto';
import type { EventName, Events } from './types.js';
import Player from "./Player.js";

export default class Core extends EventEmitter {
    public players: Map<UUID, Player> = new Map();
    public inPlay: boolean = false;
    constructor() {
        super({ captureRejections: true });
    }

    public send<T extends EventName>(event: T, data: Events[T]) {
        this.emit(event, data);
    }
}