import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import { GameEvents, MoveRequest, UpdateLocationResponse } from '../object/Events';
import type { Unit, GroupType } from './Location';
import type { UUID } from "../lib";
import map from '../map/test_map';

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

export default class GameState extends EventEmitter {
    private transfers: Map<UUID, UnitTransfer> = new Map();
    private map = map;
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

        if (!(((time.getSeconds() - 5) < transfer.expectedResolveTime.getSeconds()) || ((time.getSeconds() + 5) > transfer.expectedResolveTime.getSeconds()))) {
            throw new Error("Transfer did not happen with allowed time frame");
        }

        const node = this.map.find(value => value.objectId === transfer.dest.id);
        if (!node) throw new Error("Failed to find dest node");

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
    }
    public getSelectedMap() {
        return this.map;
    }
}