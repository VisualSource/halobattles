import type { GroupType, Unit } from "./Location";
import type { UUID } from "../lib"

export const enum GameEvents {
    FinalizTransfer = "finalizTransfer",
    TransferUnits = "transferUnits",
    UpdateLocation = "updateLocation"
}

export type MoveRequest = {
    from: {
        id: UUID,
        group: GroupType
    }
    to: {
        id: UUID;
        group: GroupType
    };
}

export type MoveResponse = {
    transferId: UUID;
    path: { id: UUID; position: { x: number; y: number } }[];
    owner: UUID
}

type UpdateLocationBase = {
    owner: UUID;
}

interface UpdateLocationContested extends UpdateLocationBase {
    type: "set-contested-state",
    payload: {
        node: UUID,
        state: boolean;
    }
}

interface UpdateLocationGroupClear extends UpdateLocationBase {
    type: "group-clear";
    payload: {
        node: UUID;
        group: GroupType
    }
}

interface UpdateLocationOwner extends UpdateLocationBase {
    type: "set-owner";
    payload: {
        node: UUID;
        color: number;
    }
}

interface UpdateLocationUnits extends UpdateLocationBase {
    type: "update-units-group",
    payload: {
        node: UUID,
        group: GroupType,
        units: Unit[]
    }
}

export interface UpdateLocationUnitGroups extends UpdateLocationBase {
    type: "update-units-groups",
    payload: {
        node: UUID,
        group: GroupType,
        units: Unit[]
    }[]
}

export type UpdateLocationResponse = UpdateLocationGroupClear | UpdateLocationUnits | UpdateLocationOwner | UpdateLocationUnitGroups | UpdateLocationContested;