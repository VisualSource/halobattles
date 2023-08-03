import { Worker } from "node:worker_threads";
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path'
import { GameEvents, MoveRequest, UpdateLocationResponse } from '../object/Events.js';
import type { Unit, GroupType } from './Location.js';
import { buildOptions } from '../map/upgradeList.js';
import type { UUID } from "../lib.js";
import map from '../map/test_map.js';
import units from '../map/units.js';
import factionsBuildable from "../map/faction_builds.js";

type UnitTransfer = {
    expectedResolveTime: Date,
    owner: string;
    id: UUID;
    units: Unit[];
    origin: {
        id: UUID;
        group: GroupType
    }
    dest: {
        id: UUID;
        group: GroupType
    }
}

export type Factions = "UNSC" | "Banished" | "Covenant" | "Forerunner";
type GlobalType = `unit-${number}` | `building-${number}`;
export type Player = {
    color: number;
    name: string;
    factions: Factions;
    id: UUID,
    cap: {
        current: number;
        max: number;
        restrictions: { [key in GlobalType]: number }
    }
    credits: {
        current: number;
        income: number;
    }
}

const factionColors: { [key in Factions]: number } = {
    "Banished": 0xe82a00,
    Covenant: 0x8208d8,
    Forerunner: 0x00b9f7,
    UNSC: 0x1db207
}

export default class GameState extends EventEmitter {
    private transfers: Map<UUID, UnitTransfer> = new Map();
    private map = map;
    public players: Player[] = [
        {
            credits: {
                current: 10_000,
                income: 1_000
            },
            cap: {
                max: 100,
                current: 1,
                restrictions: {
                    "building-0": 1
                }
            },
            color: factionColors["Banished"],
            name: "VisualSource",
            factions: "Banished",
            id: "1724ea86-18a1-465c-b91a-fce23e916aae",
        }
    ];
    private interval: NodeJS.Timer;

    public startGame() {
        this.interval = setInterval(() => {
            for (const player of this.players) {
                player.credits.current += player.credits.income;
                this.emit(GameEvents.UpdatePlayer, player);
            }
        }, 40_000);
    }

    public resetGame() {
        clearInterval(this.interval);
    }

    public startBattle(nodeId: UUID, transferId: UUID) {
        const node = this.map.find(value => value.objectId === nodeId);
        if (!node) throw new Error("Failed to find node.");

        const transfer = this.transfers.get(transferId);
        if (!transfer) throw new Error("Failed to find transfer.");

        const worker = new Worker(join(__dirname, "./BattleRuntime.js"), {
            workerData: {
                node,
                transfer,
            },
            name: `[Worker] Battle for ${nodeId}`
        });

        worker.on("message", (ev: { owner: UUID, node: UUID }) => {

            const player = this.getPlayer(ev.owner);
            if (!player) throw new Error("Unable to get player");

            this.emit(GameEvents.UpdateLocation, {
                type: "set-owner",
                owner: player?.id,
                payload: {
                    node: ev.node,
                    color: player.color,
                }
            } as UpdateLocationResponse);

            this.emit(GameEvents.UpdateLocation, {
                type: "set-contested-state",
                payload: {
                    node: ev.node,
                    state: false
                }
            } as UpdateLocationResponse);

            console.log(ev);
        });
        worker.on("error", (ev) => {
            console.error(ev);
            throw new Error("Battle Error");
        });
        worker.on("exit", (code) => {
            console.log(code);
        });
        worker.on("messageerror", (ev) => {
            console.log(ev);
            throw new Error("Failed to parse message");
        });
    }
    public createTransfer(owner: string, data: MoveRequest): UUID {

        const node = map.find(value => value.objectId === data.from.id);
        if (!node) throw new Error("Failed to create transfer request: Src node not found");

        // calc time to transfer units.
        const timeToTransferInSec = 2;

        const time = new Date();
        time.setSeconds(time.getSeconds() + timeToTransferInSec);

        const request: UnitTransfer = {
            expectedResolveTime: time,
            id: randomUUID(),
            owner,
            origin: data.from,
            dest: data.to,
            units: node.getUnitFromGroup(data.from.group)
        }

        node.clearGroup(data.from.group);
        this.emit(GameEvents.UpdateLocation, {
            type: "update-units-groups",
            owner: node.owner,
            payload: [{
                node: node.objectId,
                group: data.from.group,
                units: []
            }]
        } as UpdateLocationResponse);

        this.transfers.set(request.id, request);

        return request.id;
    }
    public finishTransfer(owner: string, id: string): void {
        const time = new Date();
        const transfer = this.transfers.get(id as UUID);
        if (!transfer) throw new Error("No vaild transfer with given id");

        const expectedItem = transfer.expectedResolveTime.getSeconds();
        const currentTime = time.getSeconds();

        if (!(((currentTime - 5) < expectedItem) || ((currentTime + 5) > expectedItem))) {
            throw new Error("Transfer did not happen with allowed time frame");
        }

        const node = this.map.find(value => value.objectId === transfer.dest.id);
        if (!node) throw new Error("Failed to find dest node");

        // moving units to a unowned node/ node has no defence
        if (node.owner === null || (node.owner !== owner && node.isEmpty() && !node.hasDefence())) {
            const player = this.players.find(value => value.id === owner);
            if (!player) throw new Error("Failed to find user");

            this.emit(GameEvents.UpdateLocation, {
                type: "set-owner",
                owner: owner,
                payload: {
                    node: node.objectId,
                    color: player.color,
                }
            } as UpdateLocationResponse);


            node.appendUnits(transfer.dest.group, transfer.units);
            this.emit(GameEvents.UpdateLocation, {
                owner: transfer.owner,
                type: "update-units-groups",
                payload: [{
                    group: transfer.dest.group,
                    node: transfer.dest.id,
                    units: node.getUnitFromGroup(transfer.dest.group)
                }]
            } as UpdateLocationResponse);


            this.transfers.delete(id as UUID);
            return;
        }

        // moving units to a already owned node.
        if (node.owner === owner) {
            node.appendUnits(transfer.dest.group, transfer.units);
            this.emit(GameEvents.UpdateLocation, {
                owner: transfer.owner,
                type: "update-units-groups",
                payload: [{
                    group: transfer.dest.group,
                    node: transfer.dest.id,
                    units: node.getUnitFromGroup(transfer.dest.group)
                }]
            } as UpdateLocationResponse);

            this.transfers.delete(id as UUID);
            return;
        }

        // moving units a contested node.
        this.emit(GameEvents.UpdateLocation, {
            type: "set-contested-state",
            payload: {
                node: node.objectId,
                state: true
            }
        } as UpdateLocationResponse);

        this.startBattle(node.objectId, id as UUID);
    }
    public getSelectedMap() {
        return this.map;
    }
    public getPlayer(id: UUID | null) {
        if (!id) return null;
        const player = this.players.find(value => value.id === id);
        if (!player) throw new Error("Failed to find player");
        return player;
    }
    public setPlayerData() {
        this.map[5].owner = this.players[0].id;
        this.map[5].color = this.players[0].color;
    }
    public getNode(nodeId: UUID) {
        const node = this.map.find(value => value.objectId === nodeId);
        if (!node) throw new Error("Failed to find node");
        return node;
    }
    public getNodeBuildOptions(nodeId: UUID, owner: UUID) {
        const node = this.getNode(nodeId);
        const player = this.getPlayer(owner);
        if (!node || !player) throw new Error("Failed to obtan required data.", { cause: "MISSING_NODE_OR_PLAYER_DATA" });
        if (node.owner !== owner) throw new Error("Current user can not query data for this node", { cause: "NODE_OWNER_NOT_MATCH_REQUEST_USER" });

        const allowedUpgrades = factionsBuildable[player.factions].buildings.filter(value => !node.buildOptions.buildings.not_allowed.includes(value));

        const options = [];
        for (const item of allowedUpgrades) {
            const data = buildOptions.get(item);
            if (!data) continue;

            const allowed = data.requires.every(requiement => {
                if (requiement.type === "local") {
                    return node.buildOptions.buildings.current.includes(requiement.id);
                }
                return player.cap.restrictions[`building-${requiement.id}`] >= 1;
            });
            if (!allowed) continue;

            const { on, ...rest } = data;
            options.push(rest);
        }

        return options;
    }
    public getNodeUnitOptions(nodeId: UUID, owner: UUID) {
        const node = this.getNode(nodeId);
        const player = this.getPlayer(owner);
        if (!node || !player) throw new Error("Failed to obtan required data.", { cause: "MISSING_NODE_OR_PLAYER_DATA" });
        if (node.owner !== owner) throw new Error("Current user can not query data for this node", { cause: "NODE_OWNER_NOT_MATCH_REQUEST_USER" });

        const allowedUpgrades = factionsBuildable[player.factions].units.filter(value => !node.buildOptions.units.not_allowed.includes(value));

        const options = [];
        for (const item of allowedUpgrades) {
            const data = units.get(item);
            if (!data) continue;

            const allowed = data.requires.every(requirement => {
                if (requirement.type === "local") {
                    return node.buildOptions.buildings.current.includes(requirement.id);
                }
                return player.cap.restrictions[`building-${requirement.id}`] >= 1;
            });

            if (!allowed) continue;

            options.push(data);
        }

        return options;
    }
}