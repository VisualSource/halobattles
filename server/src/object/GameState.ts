import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import { GameEvents, MoveRequest, UpdateLocationResponse } from '../object/Events';
import type { Unit, GroupType } from './Location';
import { buildOptions } from '../map/upgradeList';
import type { UUID } from "../lib";
import map from '../map/test_map';
import units from '../map/units';

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

type Factions = "UNSC" | "Banished" | "Covenant" | "Forerunner"

const factionColors: { [key in Factions]: number } = {
    "Banished": 0xe82a00,
    Covenant: 0x8208d8,
    Forerunner: 0x00b9f7,
    UNSC: 0x1db207
}

export default class GameState extends EventEmitter {
    private transfers: Map<UUID, UnitTransfer> = new Map();
    private map = map;

    public players: {
        color: number;
        name: string;
        factions: Factions;
        id: UUID
    }[] = [
            {
                color: factionColors["Banished"],
                name: "VisualSource",
                factions: "Banished",
                id: "1724ea86-18a1-465c-b91a-fce23e916aae"
            }
        ];

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
            type: "group-clear",
            owner: node.owner,
            payload: {
                node: node.objectId,
                group: data.from.group
            }
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

        if (node.owner === null) {
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
                type: "update-units-group",
                payload: {
                    group: transfer.dest.group,
                    node: transfer.dest.id,
                    units: node.getUnitFromGroup(transfer.dest.group)
                }
            } as UpdateLocationResponse);


            this.transfers.delete(id as UUID);
            return;
        }

        if (node.owner === owner) {
            node.appendUnits(transfer.dest.group, transfer.units);
            this.emit(GameEvents.UpdateLocation, {
                owner: transfer.owner,
                type: "update-units-group",
                payload: {
                    group: transfer.dest.group,
                    node: transfer.dest.id,
                    units: node.getUnitFromGroup(transfer.dest.group)
                }
            } as UpdateLocationResponse);

            this.transfers.delete(id as UUID);
            return;
        }

        this.emit(GameEvents.UpdateLocation, {
            type: "set-contested-state",
            payload: {
                node: node.objectId,
                state: true
            }
        } as UpdateLocationResponse);

        console.log("Battle would start here");
    }
    public getSelectedMap() {
        return this.map;
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
        if (node.owner !== owner) throw new Error("Current user can not query data for this node");

        const upgrades = node.buildOptions.buildings.allowed.filter(value => !node.buildOptions.buildings.current.includes(value));

        const options = [];
        for (const item of upgrades) {
            const data = buildOptions.get(item);
            if (!data) continue;

            const { actions, effects, ...rest } = data;
            options.push(rest);
        }

        return options;
    }
    public getNodeUnitOptions(nodeId: UUID, owner: UUID) {
        const node = this.getNode(nodeId);
        if (node.owner !== owner) throw new Error("Current user can not query data for this node");

        const upgrades = node.buildOptions.units.allowed.filter(value => !node.buildOptions.units.current.includes(value));

        const options = [];
        for (const item of upgrades) {
            const data = units.get(item);
            if (!data) continue;
            options.push(data);
        }

        return options;
    }
}