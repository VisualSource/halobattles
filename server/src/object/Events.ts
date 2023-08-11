import type { Building, GroupType, Unit } from "./Location.js";
import type { UUID } from "../lib.js"

export const enum GameEvents {
    GameOver = "game-over",
    FinalizTransfer = "finalizTransfer",
    TransferUnits = "transferUnits",
    UpdateLocation = "updateLocation",
    UpdatePlayer = "update-player",
    Notify = "notify",
    ObjectiveLose = "player-lose-objective"
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
    transferId?: UUID;
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

interface UpdateLocationSpies extends UpdateLocationBase {
    type: "set-spies",
    payload: {
        node: UUID;
        spies: UUID[]
    }
}

interface UpdateLocationOwner extends UpdateLocationBase {
    type: "set-owner";
    payload: {
        node: UUID;
        color: number;
    }
}

interface UpdateBuildings extends UpdateLocationBase {
    type: "update-buildings",
    payload: {
        node: UUID,
        buildings: Building[]
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

export type UpdateLocationResponse = UpdateLocationSpies | UpdateLocationOwner | UpdateLocationUnitGroups | UpdateBuildings | UpdateLocationContested;